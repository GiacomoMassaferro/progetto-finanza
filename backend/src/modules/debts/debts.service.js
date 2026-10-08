import { AppError } from "../../common/utils/AppError.js";
import { restore, softDelete, withAlive, withDeleted } from "../../common/utils/softDelete.js";
import { prisma } from "../../config/prisma.js";

// Converte centesimi interi in stringa a 2 decimali (niente float sui soldi).
const toMoney = (cents) => (cents / 100).toFixed(2);
// Converte stringa/Decimal in centesimi interi per i calcoli esatti.
const toCents = (value) => Math.round(Number(value) * 100);

// Converte la riga Prisma in oggetto API (BigInt/Decimal -> string, vedi PLAN I-03).
function toSafePayment(row) {
    return {
        id: String(row.id),
        amount: String(row.amount),
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
        totalAmount: String(row.totalAmount),
        remainingAmount: String(row.remainingAmount),
        interestRate: String(row.interestRate),
        monthlyPayment: String(row.monthlyPayment),
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
            monthlyPayment: data.monthlyPayment,
            dueDayOfMonth: data.dueDayOfMonth ?? null,
            startDate: data.startDate,
        },
        include: { payments: { where: withAlive(), orderBy: { dueDate: "asc" } } },
    });
    return toSafeDebt(row);
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

// Paga una rata: marca PAID + crea la transazione collegata + scala il
// residuo del debito. Tutto in una transazione atomica (o tutto o niente).
// Se il residuo arriva a zero il debito passa a PAID_OFF da solo.
export async function pay(userId, debtId, paymentId, data) {
    const debt = await findDebt(userId, debtId);
    const payment = await findPayment(debt.id, paymentId);
    if (payment.status === "PAID") {
        throw new AppError(409, "Rata già pagata");
    }
    const categoryId = await checkCategory(userId, data.movementsCategoryId);
    const paidCents = data.amount ? toCents(data.amount) : toCents(payment.amount);
    const paidDate = data.paidDate ?? new Date();
    const remainingCents = Math.max(0, toCents(debt.remainingAmount) - paidCents);

    const result = await prisma.$transaction(async (tx) => {
        const paid = await tx.debtPayment.update({
            where: { id: payment.id },
            data: { status: "PAID", paidDate, amount: toMoney(paidCents) },
        });
        const transaction = await tx.transaction.create({
            data: {
                userId: BigInt(userId),
                movementsCategoryId: categoryId,
                debtPaymentId: payment.id,
                amount: toMoney(paidCents),
                type: "EXPENSE",
                description: data.description ?? `Pagamento rata ${debt.creditorName}`,
                transactionDate: paidDate,
            },
        });
        const updatedDebt = await tx.debt.update({
            where: { id: debt.id },
            data: {
                remainingAmount: toMoney(remainingCents),
                // Debito estinto: chiudi anche lo stato, senza intervento manuale.
                ...(remainingCents === 0 ? { status: "PAID_OFF" } : {}),
            },
            include: { payments: { where: withAlive(), orderBy: { dueDate: "asc" } } },
        });
        return { paid, transaction, updatedDebt };
    });

    return {
        payment: toSafePayment(result.paid),
        transaction: {
            id: String(result.transaction.id),
            amount: String(result.transaction.amount),
            debtPaymentId: String(result.transaction.debtPaymentId),
        },
        debt: toSafeDebt(result.updatedDebt),
    };
}
