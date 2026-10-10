import { describe, expect, test } from "vitest";
import { buildPayoffPlan } from "../src/modules/ai/calculator.js";

// Il calcolatore è puro: nessun DB, solo centesimi in ingresso.

const SNAP = {
    availableNowCents: 50000,
    monthIncomeCents: 200000,
    monthExpensesCents: 150000,
    debtsTotalCents: 0,
    upcoming30dCents: 10000,
    overdueCount: 0,
    debtsMonthlyCents: 0,
};

describe("buildPayoffPlan", () => {
    test("senza debiti: piano vuoto con messaggio", () => {
        const plan = buildPayoffPlan({ debts: [], snapshot: SNAP, locale: "it" });
        expect(plan.items).toEqual([]);
        expect(plan.summary).toContain("Nessun debito");
        expect(plan.projectedDebtFree).toBeNull();
    });

    test("ordine valanga: prima il tasso più alto", () => {
        const plan = buildPayoffPlan({
            debts: [
                { id: "1", creditorName: "Basso", remainingCents: 100000, annualRatePct: 2, monthlyCents: 10000 },
                { id: "2", creditorName: "Alto", remainingCents: 100000, annualRatePct: 12, monthlyCents: 10000 },
            ],
            snapshot: SNAP,
            locale: "en",
        });
        expect(plan.items[0].title).toBe("Alto");
        expect(plan.items[1].title).toBe("Basso");
        expect(plan.projectedDebtFree).toMatch(/^\d{4}-\d{2}$/);
    });

    test("surplus intero al risparmio, mai alle rate", () => {
        const plan = buildPayoffPlan({
            debts: [{ id: "1", creditorName: "X", remainingCents: 50000, annualRatePct: 5, monthlyCents: 5000 }],
            snapshot: SNAP, // surplus = 200000 - 150000 = 50000
            locale: "it",
        });
        expect(plan.savings.monthlyCents).toBe(50000);
        expect(plan.snapshot.monthlyFreeCents).toBe(50000);
    });

    test("spesa sopra le entrate: warning e risparmio zero", () => {
        const plan = buildPayoffPlan({
            debts: [{ id: "1", creditorName: "X", remainingCents: 50000, annualRatePct: 5, monthlyCents: 5000 }],
            snapshot: { ...SNAP, monthExpensesCents: 250000 },
            locale: "it",
        });
        expect(plan.savings.monthlyCents).toBe(0);
        expect(plan.warnings.some((w) => w.includes("Spendi più"))).toBe(true);
    });

    test("rate scadute e liquidità corta generano warning", () => {
        const plan = buildPayoffPlan({
            debts: [{ id: "1", creditorName: "X", remainingCents: 50000, annualRatePct: 5, monthlyCents: 5000 }],
            snapshot: { ...SNAP, overdueCount: 2, availableNowCents: 100 },
            locale: "it",
        });
        expect(plan.warnings.length).toBeGreaterThanOrEqual(2);
    });

    test("summary in tedesco su richiesta", () => {
        const plan = buildPayoffPlan({
            debts: [{ id: "1", creditorName: "X", remainingCents: 50000, annualRatePct: 5, monthlyCents: 5000 }],
            snapshot: SNAP,
            locale: "de",
        });
        expect(plan.summary).toContain("Avalanche-Plan");
    });
});
