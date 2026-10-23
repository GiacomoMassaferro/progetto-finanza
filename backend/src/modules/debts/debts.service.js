import { AppError } from "../../common/utils/AppError.js";
import { moneyFromCents, toCents, toMoneyString } from "../../common/utils/money.js";
import { ConflictError, withOptimisticRetry } from "../../common/utils/optimisticRetry.js";
import { nominalAnnualFromEffective } from "../../common/utils/rates.js";
import { restore, softDelete, withAlive, withDeleted } from "../../common/utils/softDelete.js";
import { prisma } from "../../config/prisma.js";
import { buildAmortization, monthlyDueDates, splitEqual } from "./amortization.js";

// Converte la riga Prisma in oggetto API (BigInt -> string, soldi -> "0.00").
function toSafePayment(row) {
    return {
        id: String(row.id),
        amount: toMoneyString(row.amount),
        dueDate: row.dueDate,
        paidDate: row.paidDate,
        status: row.status,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
    };
}

// Converte il debito in oggetto API, con rate attive incorporate.
function toSafeDebt(row) {
    return {
        id: String(row.id),
        creditorName: row.creditorName,
        debtType: row.debtType,
        totalAmount: toMoneyString(row.totalAmount),
        remainingAmount: toMoneyString(row.remainingAmount),
        interestRate: toMoneyString(row.interestRate),
        tan: row.tan === null ? null : toMoneyString(row.tan),
        taeg: row.taeg === null ? null : toMoneyString(row.taeg),
        monthlyPayment: toMoneyString(row.monthlyPayment),
        dueDayOfMonth: row.dueDayOfMonth,
        startDate: row.startDate,
        status: row.status,
        payments: (row.payments ?? []).map(toSafePayment),
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
    };
}

// Converte l'id di rotta in BigInt; formati errati -> 404, mai 500.
function toId(id, label) {
    try {
        return BigInt(id);
    } catch {
        throw new AppError(404, `${label} non trovato`);
    }
}

// Debito attivo di proprietà dell'utente, con rate attive ordinate per scadenza.
async function findDebt(userId, id) {
    const row = await prisma.debt.findFirst({
        where: withAlive({ id: toId(id, "Debito"), userId: BigInt(userId) }),
        include: { payments: { where: withAlive(), orderBy: { dueDate: "asc" } } },
    });
    if (!row) {
        throw new AppError(404, "Debito non trovato");
    }
    return row;
}

// Rata attiva appartenente al debito (già verificato di proprietà).
async function findPayment(debtId, paymentId) {
    const row = await prisma.debtPayment.findFirst({
        where: withAlive({ id: toId(paymentId, "Rata"), debtId }),
    });
    if (!row) {
        throw new AppError(404, "Rata non trovata");
    }
    return row;
}

// Categoria attiva di proprietà dell'utente (serve alla transazione del pay).
async function checkCategory(userId, categoryId) {
    let id;
    try {
        id = BigInt(categoryId);
    } catch {
        throw new AppError(404, "Categoria non trovata");
    }
    const category = await prisma.movementsCategory.findFirst({
        where: withAlive({ id, userId: BigInt(userId) }),
    });
    if (!category) {
        throw new AppError(404, "Categoria non trovata");
    }
    return id;
}

// Lista paginata dei debiti attivi dell'utente (+ filtri stato e tipo).
export async function list(userId, { page, limit, status, debtType }) {
    const where = withAlive({
        userId: BigInt(userId),
        ...(status ? { status } : {}),
        ...(debtType ? { debtType } : {}),
    });
    const [total, rows] = await Promise.all([
        prisma.debt.count({ where }),
        prisma.debt.findMany({
            where,
            include: {
                payments: { where: withAlive(), orderBy: { dueDate: "asc" } },
            },
            orderBy: { createdAt: "desc" },
            skip: (page - 1) * limit,
            take: limit,
        }),
    ]);
    return {
        items: rows.map(toSafeDebt),
        meta: { page, limit, total, pages: Math.ceil(total / limit) },
    };
}

// Dettaglio debito con rate.
export async function getById(userId, id) {
    return toSafeDebt(await findDebt(userId, id));
}

// Crea un debito; remainingAmount omesso = uguale al totale (debito nuovo).
export async function create(userId, data) {
    const row = await prisma.debt.create({
        data: {
            userId: BigInt(userId),
            creditorName: data.creditorName,
            debtType: data.debtType,
            totalAmount: data.totalAmount,
            remainingAmount: data.remainingAmount ?? data.totalAmount,
            interestRate: data.interestRate ?? "0.00",
            tan: data.tan ?? null,
            taeg: data.taeg ?? null,
            monthlyPayment: data.monthlyPayment,
            dueDayOfMonth: data.dueDayOfMonth ?? null,
            startDate: data.startDate,
        },
        include: { payments: { where: withAlive(), orderBy: { dueDate: "asc" } } },
    });
    return toSafeDebt(row);
}

// Crea un debito con rate in un'unica transazione atomica, in 3 modalità:
// - split: totale diviso in N rate uguali (ultima conguaglia i centesimi).
// - paid: rata + pagate + rimanenti (ricostruisce totale, residuo e storico;
//   le pagate storiche nascono PAID senza transazione collegata: esistevano
//   prima dell'app, non sono movimenti da registrare).
// - amortized: importo + tasso + durata (piano alla francese via amortization.js,
//   riusabile dal futuro simulatore). Rata e interessi tornano in risposta.
export async function createWithInstallments(userId, data) {
    const mode = data.mode ?? "split";
    let total;
    let schedule;
    let monthly;
    let paidCount = 0;
    // Tasso che ha generato il piano (serve al simulatore/LLM futuri).
    let planRate = data.interestRate ?? "0.00";
    // Categoria per le transazioni storiche (solo mode paid, se fornita).
    let historyCategoryId = null;

    if (mode === "paid") {
        const amountCents = Math.round(Number(data.installmentAmount) * 100);
        const count = data.paidCount + data.remainingCount;
        total = { amount: ((amountCents * count) / 100).toFixed(2), remaining: ((amountCents * data.remainingCount) / 100).toFixed(2) };
        schedule = monthlyDueDates(new Date(data.firstDueDate), count).map((dueDate, i) => ({
            amountCents,
            dueDate,
            paid: i < data.paidCount,
        }));
        monthly = (amountCents / 100).toFixed(2);
        paidCount = data.paidCount;
        // Categoria per lo storico: verificata qui (deve essere propria e attiva).
        if (data.movementsCategoryId !== undefined) {
            let categoryId;
            try {
                categoryId = BigInt(data.movementsCategoryId);
            } catch {
                throw new AppError(404, "Categoria non trovata");
            }
            const category = await prisma.movementsCategory.findFirst({
                where: withAlive({ id: categoryId, userId: BigInt(userId) }),
            });
            if (!category) {
                throw new AppError(404, "Categoria non trovata");
            }
            historyCategoryId = categoryId;
        }
    } else if (mode === "amortized") {
        const principalCents = Math.round(Number(data.financedAmount) * 100);
        // Precedenza unica del tasso (stessa del simulatore payoff, vedi A5):
        // TAEG (effettivo) > TAN (nominale) > tasso esplicito della richiesta.
        // Il piano alla francese usa sempre un TAN nominale: se arriva il TAEG
        // si converte nel TAN equivalente (stesso tasso mensile reale).
        const taegPct = data.taeg !== undefined && data.taeg !== null ? Number(data.taeg) : null;
        const tanPct = data.tan !== undefined && data.tan !== null ? Number(data.tan) : null;
        const explicitPct = data.annualRatePct !== undefined ? Number(data.annualRatePct) : null;
        const nominalRate = taegPct !== null
            ? nominalAnnualFromEffective(taegPct)
            : (tanPct ?? explicitPct ?? 0);
        planRate = nominalRate.toFixed(2);
        const { schedule: amort, monthlyCents } = buildAmortization({
            principalCents,
            annualRatePct: nominalRate,
            months: data.durationMonths,
            firstDueDate: new Date(data.firstDueDate),
        });
        const totalPaid = amort.reduce((s, r) => s + r.amountCents, 0);
        total = { amount: (totalPaid / 100).toFixed(2), remaining: (totalPaid / 100).toFixed(2) };
        schedule = amort.map((r) => ({ ...r, paid: false }));
        monthly = (monthlyCents / 100).toFixed(2);
    } else {
        const totalCents = Math.round(Number(data.totalAmount) * 100);
        const amounts = splitEqual(totalCents, data.installments);
        schedule = monthlyDueDates(new Date(data.firstDueDate), data.installments).map((dueDate, i) => ({
            amountCents: amounts[i],
            dueDate,
            paid: false,
        }));
        total = { amount: data.totalAmount, remaining: data.totalAmount };
        monthly = (amounts[0] / 100).toFixed(2);
    }

    const first = new Date(data.firstDueDate);
    const debt = await prisma.$transaction(async (tx) => {
        const created = await tx.debt.create({
            data: {
                userId: BigInt(userId),
                creditorName: data.creditorName,
                debtType: data.debtType,
                totalAmount: total.amount,
                remainingAmount: total.remaining,
                interestRate: planRate,
                tan: data.tan ?? null,
                taeg: data.taeg ?? null,
                monthlyPayment: monthly,
                dueDayOfMonth: first.getDate(),
                startDate: data.startDate,
            },
        });
        await tx.debtPayment.createMany({
            data: schedule.map((r) => ({
                debtId: created.id,
                amount: (r.amountCents / 100).toFixed(2),
                dueDate: r.dueDate,
                ...(r.paid ? { status: "PAID", paidDate: r.dueDate } : {}),
            })),
        });
        // Storico completo (solo paid + categoria): le rate già pagate
        // ottengono la loro transazione retrodatata, collegata alla rata.
        // createMany non restituisce gli id: con categoria si crea una a una.
        if (historyCategoryId) {
            const paid = await tx.debtPayment.findMany({
                where: { debtId: created.id, status: "PAID" },
                orderBy: { dueDate: "asc" },
            });
            for (const p of paid) {
                await tx.transaction.create({
                    data: {
                        userId: BigInt(userId),
                        movementsCategoryId: historyCategoryId,
                        debtPaymentId: p.id,
                        amount: p.amount,
                        type: "EXPENSE",
                        description: `Pagamento rata ${data.creditorName}`,
                        transactionDate: p.paidDate ?? p.dueDate,
                    },
                });
            }
        }
        return created.id;
    });
    const result = await getById(userId, String(debt));
    return { ...result, paidCount };
}

// Modifica parziale, solo su debito proprio e attivo.
export async function update(userId, id, data) {
    await findDebt(userId, id); // 404 se altrui o cancellato
    const row = await prisma.debt.update({
        where: { id: toId(id, "Debito") },
        data,
        include: { payments: { where: withAlive(), orderBy: { dueDate: "asc" } } },
    });
    return toSafeDebt(row);
}

// Cancellazione logica del debito + delle sue rate (stessa transazione:
// non devono restare rate visibili di un debito cancellato).
export async function remove(userId, id) {
    const debt = await findDebt(userId, id); // 404 se altrui o già cancellato
    const now = new Date();
    const [row] = await prisma.$transaction([
        prisma.debt.update({
            where: { id: debt.id },
            data: { deletedAt: now },
        }),
        prisma.debtPayment.updateMany({
            where: withAlive({ debtId: debt.id }),
            data: { deletedAt: now },
        }),
    ]);
    return { id: String(row.id), deletedAt: row.deletedAt };
}

// Cestino dell'utente: debiti cancellati con le loro rate, paginati.
export async function listTrash(userId, { page, limit }) {
    const where = withDeleted({ userId: BigInt(userId) });
    const [total, rows] = await Promise.all([
        prisma.debt.count({ where }),
        prisma.debt.findMany({
            where,
            include: { payments: { where: withDeleted(), orderBy: { dueDate: "asc" } } },
            orderBy: { deletedAt: "desc" },
            skip: (page - 1) * limit,
            take: limit,
        }),
    ]);
    return {
        items: rows.map(toSafeDebt),
        meta: { page, limit, total, pages: Math.ceil(total / limit) },
    };
}

// Ripristina debito + rate cancellate (stessa transazione, specchio del remove).
export async function restoreItem(userId, id) {
    const row = await prisma.debt.findFirst({
        where: withDeleted({ id: toId(id, "Debito"), userId: BigInt(userId) }),
    });
    if (!row) {
        throw new AppError(404, "Debito non trovato nel cestino");
    }
    const [restored] = await prisma.$transaction([
        restore(prisma.debt, { id: row.id }),
        prisma.debtPayment.updateMany({
            where: withDeleted({ debtId: row.id }),
            data: { deletedAt: null },
        }),
    ]);
    return getById(userId, String(restored.id));
}

// Rate del debito (debito già verificato di proprietà).
export async function listPayments(userId, debtId) {
    const debt = await findDebt(userId, debtId);
    return debt.payments.map(toSafePayment);
}

// Crea una rata per il debito.
export async function createPayment(userId, debtId, data) {
    const debt = await findDebt(userId, debtId);
    const row = await prisma.debtPayment.create({
        data: { debtId: debt.id, amount: data.amount, dueDate: data.dueDate },
    });
    return toSafePayment(row);
}

// Modifica parziale della rata. Passare a PAID senza paidDate la imposta a oggi.
export async function updatePayment(userId, debtId, paymentId, data) {
    const debt = await findDebt(userId, debtId);
    const payment = await findPayment(debt.id, paymentId);
    const patch = { ...data };
    if (patch.status === "PAID" && patch.paidDate === undefined && !payment.paidDate) {
        patch.paidDate = new Date();
    }
    const row = await prisma.debtPayment.update({ where: { id: payment.id }, data: patch });
    return toSafePayment(row);
}

// Paga una rata: applica il pagamento al piano, crea la transazione collegata
// e scala il residuo del debito. Tutto in una transazione atomica (o tutto o
// niente) e con lock ottimistico: due pagamenti concorrenti non possono
// doppio-pagare la stessa rata ne' perdere un aggiornamento del residuo.
// Se il residuo arriva a zero il debito passa a PAID_OFF da solo.
//
// Regole di importo:
// - non si paga piu' di quanto si deve (la transazione non puo' superare
//   il residuo: prima poteva registrare 500 su un debito da 300);
// - pagamento parziale: la rata resta PENDING/LATE con l'importo residuo,
//   non viene data per estinta (prima si perdeva la parte non versata);
// - eccedenza: ripartita sulle rate successive dello stesso debito.
export async function pay(userId, debtId, paymentId, data) {
    const categoryId = await checkCategory(userId, data.movementsCategoryId);

    // Il tentativo ripete la lettura: al conflitto ricalcola su dati freschi.
    return withOptimisticRetry(async () => {
        const debt = await findDebt(userId, debtId);
        const payment = await findPayment(debt.id, paymentId);
        if (payment.status === "PAID") {
            throw new AppError(409, "Rata già pagata");
        }
        const rateCents = toCents(payment.amount);
        const debtCents = toCents(debt.remainingAmount);
        const requestedCents = data.amount ? toCents(data.amount) : rateCents;

        // Tetto: mai piu' del residuo (il denaro non sparisce nel nulla).
        if (requestedCents > debtCents) {
            throw new AppError(400, `Importo superiore al residuo del debito (${moneyFromCents(debtCents)})`);
        }

        const paidDate = data.paidDate ?? new Date();
        // Quanto va sulla rata target e quanto resta da ripartire sulle altre.
        const toRate = Math.min(requestedCents, rateCents);
        const surplus = requestedCents - toRate;
        const partial = toRate < rateCents;

        const result = await prisma.$transaction(async (tx) => {
            // 1) Lock ottimistico sulla rata: se un altro pagamento l'ha gia'
            //    chiusa, count = 0 -> conflitto (niente doppio pagamento).
            const rateUpdate = await tx.debtPayment.updateMany({
                where: { id: payment.id, status: { not: "PAID" } },
                data: {
                    status: partial ? payment.status : "PAID",
                    ...(partial ? {} : { paidDate }),
                    amount: moneyFromCents(partial ? rateCents - toRate : rateCents),
                },
            });
            if (rateUpdate.count === 0) {
                throw new ConflictError("Rata già pagata o aggiornata in parallelo");
            }

            // 2) Eccedenza: ripartita sulle rate successive dello stesso debito,
            //    cosi' il piano resta allineato al residuo reale.
            let rest = surplus;
            if (rest > 0) {
                const next = await tx.debtPayment.findMany({
                    where: withAlive({
                        debtId: debt.id,
                        id: { not: payment.id },
                        status: { not: "PAID" },
                    }),
                    orderBy: { dueDate: "asc" },
                });
                for (const p of next) {
                    if (rest <= 0) break;
                    const pCents = toCents(p.amount);
                    const take = Math.min(rest, pCents);
                    rest -= take;
                    const left = pCents - take;
                    await tx.debtPayment.update({
                        where: { id: p.id },
                        data: {
                            amount: moneyFromCents(left),
                            ...(left === 0 ? { status: "PAID", paidDate } : {}),
                        },
                    });
                }
            }

            // 3) Lock ottimistico sul debito: il residuo letto prima della
            //    transazione potrebbe essere cambiato nel frattempo.
            const newRemaining = debtCents - requestedCents;
            const debtUpdate = await tx.debt.updateMany({
                where: { id: debt.id, remainingAmount: debt.remainingAmount },
                data: {
                    remainingAmount: moneyFromCents(newRemaining),
                    // Debito estinto: chiudi anche lo stato, senza intervento manuale.
                    ...(newRemaining === 0 ? { status: "PAID_OFF" } : {}),
                },
            });
            if (debtUpdate.count === 0) {
                throw new ConflictError("Debito aggiornato in parallelo: riprova");
            }

            // 4) Transazione collegata: importo = quanto l'utente ha versato.
            const transaction = await tx.transaction.create({
                data: {
                    userId: BigInt(userId),
                    movementsCategoryId: categoryId,
                    debtPaymentId: payment.id,
                    amount: moneyFromCents(requestedCents),
                    type: "EXPENSE",
                    description: data.description ?? `Pagamento rata ${debt.creditorName}`,
                    transactionDate: paidDate,
                },
            });

            const updatedDebt = await tx.debt.findFirst({
                where: withAlive({ id: debt.id }),
                include: { payments: { where: withAlive(), orderBy: { dueDate: "asc" } } },
            });
            const updatedPayment = await tx.debtPayment.findFirst({ where: withAlive({ id: payment.id }) });
            return { transaction, updatedDebt, updatedPayment };
        });

        return {
            payment: toSafePayment(result.updatedPayment),
            transaction: {
                id: String(result.transaction.id),
                amount: toMoneyString(result.transaction.amount),
                debtPaymentId: String(result.transaction.debtPaymentId),
            },
            debt: toSafeDebt(result.updatedDebt),
        };
    });
}
