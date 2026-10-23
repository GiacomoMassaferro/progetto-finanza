import { describe, expect, test } from "vitest";
import { buildPayoffPlan } from "../src/modules/ai/calculator.js";
import { buildAmortization, monthlyDueDates } from "../src/modules/debts/amortization.js";
import { monthlyRateFromEffective, monthlyRateFromNominal } from "../src/common/utils/rates.js";

// Casi limite del motore a regole: debito non estinguibile, TAEG vs TAN e
// scadenze con il giorno 31 (il mese di febbraio non deve saltare).

const SNAP = {
    availableNowCents: 50000,
    monthIncomeCents: 200000,
    monthExpensesCents: 150000,
    debtsTotalCents: 0,
    upcoming30dCents: 10000,
    overdueCount: 0,
    debtsMonthlyCents: 0,
};

describe("debito non estinguibile (C3)", () => {
    // 1000 EUR al 12% annuo -> 10 EUR di interessi al mese; con una rata
    // minima di 5 EUR la rata non copre mai l'interesse.
    const stuck = {
        id: "1",
        creditorName: "Bloccato",
        remainingCents: 100000,
        annualRatePct: 12,
        monthlyCents: 500,
    };

    test("nessuna data di estinzione quando il debito non si estingue", () => {
        const plan = buildPayoffPlan({ debts: [stuck], snapshot: SNAP, locale: "it" });
        // Prima il calcolatore diceva "estinzione stimata <mese corrente>".
        expect(plan.projectedDebtFree).toBeNull();
        expect(plan.summary).toContain("nessuna estinzione");
        expect(plan.items[0].detail).toBe("Non estinguibile con le rate minime");
    });

    test("un solo avviso, non uno per ogni mese simulato", () => {
        const plan = buildPayoffPlan({ debts: [stuck], snapshot: SNAP, locale: "it" });
        const stuckWarnings = plan.warnings.filter((w) => w.includes("Bloccato"));
        expect(stuckWarnings).toHaveLength(1);
    });

    test("interessi stimati non gonfiati (non 600 mesi di interessi)", () => {
        const plan = buildPayoffPlan({ debts: [stuck], snapshot: SNAP, locale: "it" });
        // 10 EUR di interessi al mese: l'interesse accumulato e' di un mese,
        // non di 600 (prima arrivava a ~6000 EUR).
        expect(plan.totalInterestCents).toBeLessThanOrEqual(1100);
    });

    test("con un debito estinguibile e uno bloccato il piano non ha data", () => {
        const plan = buildPayoffPlan({
            debts: [stuck, { id: "2", creditorName: "OK", remainingCents: 10000, annualRatePct: 1, monthlyCents: 5000 }],
            snapshot: SNAP,
            locale: "it",
        });
        expect(plan.projectedDebtFree).toBeNull();
    });
});

describe("TAEG effettivo vs TAN nominale (A4)", () => {
    test("il tasso mensile del TAEG e' inferiore a quello nominale", () => {
        expect(monthlyRateFromEffective(12)).toBeLessThan(monthlyRateFromNominal(12));
    });

    test("lo stesso debito con TAEG costa meno che con TAN trattato come nominale", () => {
        const base = { id: "1", creditorName: "X", remainingCents: 100000, monthlyCents: 5000 };
        const asTaeg = buildPayoffPlan({
            debts: [{ ...base, annualRatePct: 12, rateKind: "effective" }],
            snapshot: SNAP,
            locale: "it",
        });
        const asNominal = buildPayoffPlan({
            debts: [{ ...base, annualRatePct: 12, rateKind: "nominal" }],
            snapshot: SNAP,
            locale: "it",
        });
        expect(asTaeg.totalInterestCents).toBeLessThan(asNominal.totalInterestCents);
    });
});

describe("scadenze con il giorno 31 (A3)", () => {
    test("febbraio non viene saltato: il 31 diventa il 28/29", () => {
        const dates = monthlyDueDates(new Date(2026, 0, 31), 3);
        expect(dates[0].getMonth()).toBe(0); // gennaio
        expect(dates[1].getMonth()).toBe(1); // febbraio, non marzo
        expect(dates[1].getDate()).toBe(28); // 2026 non e' bisestile
        expect(dates[2].getMonth()).toBe(2); // marzo
        expect(dates[2].getDate()).toBe(31);
    });

    test("il piano ammorizzato mantiene una rata per ogni mese", () => {
        const { schedule } = buildAmortization({
            principalCents: 30000,
            annualRatePct: 0,
            months: 3,
            firstDueDate: new Date(2026, 0, 31),
        });
        expect(schedule).toHaveLength(3);
        expect(schedule[1].dueDate.getMonth()).toBe(1);
        expect(schedule[2].dueDate.getMonth()).toBe(2);
    });
});
