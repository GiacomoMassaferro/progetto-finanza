import { RunnableLambda } from "@langchain/core/runnables";
import { withAlive } from "../../../common/utils/softDelete.js";
import { prisma } from "../../../config/prisma.js";
import { buildPayoffPlan } from "../calculator.js";
import { narrate } from "../llm/narrative.js";

// Chain payoff: carica i dati dell'utente, calcola il piano valanga e
// restituisce il formato suggestionSchema (stesso contratto dell'LLM futuro).
// Al DB chiede solo cifre aggregate per i totali + i debiti col dettaglio
// minimo (serve l'ordine valanga); mai email o nomi utente nel contesto.
async function runPayoff({ userId, locale }) {
    const uid = BigInt(userId);

    // Debiti attivi col dettaglio minimo per la simulazione.
    const debts = await prisma.debt.findMany({
        where: withAlive({ userId: uid, status: "ACTIVE" }),
        select: { id: true, creditorName: true, totalAmount: true, remainingAmount: true, interestRate: true, tan: true, taeg: true, monthlyPayment: true },
    });

    // Totali all-time per la liquidità (entrate - uscite da sempre).
    const lifetime = await prisma.transaction.groupBy({
        by: ["type"],
        where: withAlive({ userId: uid }),
        _sum: { amount: true },
    });
    let lifeIncome = 0;
    let lifeExpenses = 0;
    for (const row of lifetime) {
        const cents = Math.round(Number(row._sum.amount ?? 0) * 100);
        if (row.type === "INCOME") {
            lifeIncome += cents;
        } else {
            lifeExpenses += cents;
        }
    }

    // Mese corrente per surplus e soglia DTI.
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    const to = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const monthRows = await prisma.transaction.groupBy({
        by: ["type"],
        where: withAlive({ userId: uid, transactionDate: { gte: from, lt: to } }),
        _sum: { amount: true },
    });
    let monthIncome = 0;
    let monthExpenses = 0;
    for (const row of monthRows) {
        const cents = Math.round(Number(row._sum.amount ?? 0) * 100);
        if (row.type === "INCOME") {
            monthIncome += cents;
        } else {
            monthExpenses += cents;
        }
    }

    // Scadenze 30 giorni + conteggio scadute (solo attive, debito attivo).
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const in30 = new Date(today.getTime() + 30 * 86_400_000);
    const [upcoming, overdueCount] = await Promise.all([
        prisma.debtPayment.aggregate({
            where: withAlive({ status: "PENDING", dueDate: { gte: today, lte: in30 }, debt: withAlive({ userId: uid, status: "ACTIVE" }) }),
            _sum: { amount: true },
        }),
        prisma.debtPayment.count({
            where: withAlive({ status: "PENDING", dueDate: { lt: today }, debt: withAlive({ userId: uid }) }),
        }),
    ]);

    // Risparmi accantonati negli obiettivi attivi (cifra totale per l'LLM:
    // servirà a valutare estinzioni anticipate senza svuotare il conto).
    const saved = await prisma.savingsGoal.aggregate({
        where: withAlive({ userId: uid, status: "ACTIVE" }),
        _sum: { currentAmount: true },
    });

    const plan = buildPayoffPlan({
        debts: debts.map((d) => ({
            id: String(d.id),
            creditorName: d.creditorName,
            remainingCents: Math.round(Number(d.remainingAmount) * 100),
            // Tasso effettivo: TAEG > TAN > legacy interestRate.
            annualRatePct: Number(d.taeg ?? d.tan ?? d.interestRate),
            monthlyCents: Math.round(Number(d.monthlyPayment) * 100),
        })),
        snapshot: {
            availableNowCents: lifeIncome - lifeExpenses,
            monthIncomeCents: monthIncome,
            monthExpensesCents: monthExpenses,
            debtsTotalCents: debts.reduce((s, d) => s + Math.round(Number(d.remainingAmount) * 100), 0),
            upcoming30dCents: Math.round(Number(upcoming._sum.amount ?? 0) * 100),
            overdueCount,
            debtsMonthlyCents: debts.reduce((s, d) => s + Math.round(Number(d.monthlyPayment) * 100), 0),
            savingsTotalCents: Math.round(Number(saved._sum.currentAmount ?? 0) * 100),
        },
        locale,
    });

    // Adatta il piano interno al contratto uniforme del modulo IA.
    // La narrativa LLM è best-effort: se manca, vale il piano a regole.
    const base = {
        intent: "payoff",
        locale,
        engine: "rules-avalanche",
        summary: plan.summary,
        items: plan.items.map((item) => ({ title: item.title, detail: item.detail, amount: item.amount ?? null })),
        warnings: plan.warnings,
        snapshot: plan.snapshot,
        savings: { monthlyAmount: (plan.savings.monthlyCents / 100).toFixed(2), note: plan.savings.note },
        projectedDebtFree: plan.projectedDebtFree,
    };
    const narrative = await narrate(
        { summary: plan.summary, items: base.items, warnings: plan.warnings, savings: base.savings, projectedDebtFree: plan.projectedDebtFree },
        plan.snapshot,
        locale,
    );
    return {
        ...base,
        ...(narrative ? { engine: "rules-avalanche+gemini", narrative } : { narrative: null }),
    };
}

export const payoffChain = RunnableLambda.from(runPayoff);
