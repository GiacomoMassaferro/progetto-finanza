import { moneyFromCents, toCents, toMoneyString } from "../../common/utils/money.js";
import { withAlive } from "../../common/utils/softDelete.js";
import { prisma } from "../../config/prisma.js";

// Riepilogo del mese per l'utente: entrate/uscite, saldo, spesa per
// categoria, situazione debiti e rate in scadenza. Solo record attivi.
export async function summary(userId, { month, from, to }) {
    const uid = BigInt(userId);

    // Totali per tipo nel mese (una sola query di aggregazione).
    const byType = await prisma.transaction.groupBy({
        by: ["type"],
        where: withAlive({ userId: uid, transactionDate: { gte: from, lt: to } }),
        _sum: { amount: true },
        _count: true,
    });
    let incomeCents = 0;
    let expenseCents = 0;
    let count = 0;
    for (const row of byType) {
        const cents = toCents(row._sum.amount);
        count += row._count;
        if (row.type === "INCOME") {
            incomeCents += cents;
        } else {
            expenseCents += cents;
        }
    }

    // Spesa/ entrate per categoria nel mese (totali + nomi in due query).
    const byCategory = await prisma.transaction.groupBy({
        by: ["movementsCategoryId"],
        where: withAlive({ userId: uid, transactionDate: { gte: from, lt: to } }),
        _sum: { amount: true },
    });
    const categories = await prisma.movementsCategory.findMany({
        where: withAlive({ id: { in: byCategory.map((r) => r.movementsCategoryId) } }),
        select: { id: true, name: true, type: true, color: true },
    });
    const names = new Map(categories.map((c) => [String(c.id), c]));
    const byCategoryOut = byCategory.map((row) => {
        const cat = names.get(String(row.movementsCategoryId));
        return {
            category: cat
                ? { id: String(cat.id), name: cat.name, type: cat.type, color: cat.color }
                : { id: String(row.movementsCategoryId), name: "(eliminata)", type: null, color: null },
            total: moneyFromCents(toCents(row._sum.amount)),
        };
    });

    // Debiti attivi: conteggio + residuo e rata mensile totali.
    const debts = await prisma.debt.aggregate({
        where: withAlive({ userId: uid, status: "ACTIVE" }),
        _count: true,
        _sum: { remainingAmount: true, monthlyPayment: true },
    });

    // Rate: quante scadute (PENDING con dueDate passata) e prossime 10 entro 30 giorni.
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const in30Days = new Date(today.getTime() + 30 * 86_400_000);
    const [overdue, upcoming] = await Promise.all([
        prisma.debtPayment.count({
            where: withAlive({
                status: "PENDING",
                dueDate: { lt: today },
                debt: withAlive({ userId: uid }),
            }),
        }),
        prisma.debtPayment.findMany({
            where: withAlive({
                status: "PENDING",
                dueDate: { gte: today, lte: in30Days },
                debt: withAlive({ userId: uid }),
            }),
            include: { debt: { select: { id: true, creditorName: true } } },
            orderBy: { dueDate: "asc" },
            take: 10,
        }),
    ]);

    return {
        month,
        income: moneyFromCents(incomeCents),
        expenses: moneyFromCents(expenseCents),
        balance: moneyFromCents(incomeCents - expenseCents),
        transactions: count,
        byCategory: byCategoryOut,
        debts: {
            active: debts._count,
            totalRemaining: moneyFromCents(toCents(debts._sum.remainingAmount)),
            totalMonthly: moneyFromCents(toCents(debts._sum.monthlyPayment)),
        },
        payments: {
            overdue,
            upcoming: upcoming.map((p) => ({
                id: String(p.id),
                amount: toMoneyString(p.amount),
                dueDate: p.dueDate,
                debt: { id: String(p.debt.id), creditorName: p.debt.creditorName },
            })),
        },
    };
}
