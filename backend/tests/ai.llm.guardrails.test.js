import { beforeEach, describe, expect, test, vi } from "vitest";

// Provider finto: il test non parla con Gemini, simula le risposte.
const state = vi.hoisted(() => ({ output: null, lastInput: null }));

vi.mock("../src/modules/ai/llm/gemini.js", () => ({
    getGemini: () => ({
        interactions: {
            create: async (req) => {
                state.lastInput = req.input;
                return { output_text: state.output };
            },
        },
    }),
    geminiModel: () => "test-model",
}));

const { narrate } = await import("../src/modules/ai/llm/narrative.js");

// Guardrail LLM: cifre inventate, prompt injection e minimizzazione dati.
const PLAN = {
    summary: "Piano: 2 debiti, estinzione a marzo 2027, interessi 120.00 EUR, risparmio 50.00 EUR",
    items: [{ title: "Creditor Srl", detail: "Marzo 2027", amount: "100.00" }],
    warnings: ["Attenzione: 1 rata scaduta"],
    savings: { monthlyAmount: "50.00", note: "Versa 50.00 EUR ogni mese" },
    projectedDebtFree: "2027-03",
};

const SNAPSHOT = {
    availableNowCents: 50000,
    monthIncomeCents: 200000,
    monthExpensesCents: 150000,
    monthlyFreeCents: 50000,
    debtsTotalCents: 100000,
    upcoming30dCents: 10000,
    overdueCount: 1,
    savingsTotalCents: 0,
};

beforeEach(() => {
    state.output = null;
    state.lastInput = null;
});

describe("guardrail numerico sulla narrativa", () => {
    test("narrativa con solo cifre del piano: accettata", async () => {
        state.output = JSON.stringify({
            headline: "Piano in 2027",
            explanation: "Estinzione prevista a marzo 2027 con 120.00 EUR di interessi.",
            tips: ["Versa 50.00 EUR ogni mese"],
        });
        const result = await narrate(PLAN, SNAPSHOT, "it");
        expect(result).not.toBeNull();
        expect(result.headline).toBe("Piano in 2027");
    });

    test("narrativa con cifra inventata: scartata (null)", async () => {
        state.output = JSON.stringify({
            headline: "Piano in 2027",
            explanation: "Risparmierai 3500 EUR entro il 2027.",
            tips: [],
        });
        const result = await narrate(PLAN, SNAPSHOT, "it");
        expect(result).toBeNull();
    });

    test("output non conforme allo schema: scartato", async () => {
        state.output = JSON.stringify({ headline: "ciao", tips: [] });
        expect(await narrate(PLAN, SNAPSHOT, "it")).toBeNull();
    });

    test("output non JSON: scartato senza far fallire la richiesta", async () => {
        state.output = "non-json";
        expect(await narrate(PLAN, SNAPSHOT, "it")).toBeNull();
    });
});

describe("prompt injection e minimizzazione dati", () => {
    test("il nome del creditore non entra nel contesto del modello", async () => {
        state.output = JSON.stringify({
            headline: "Piano",
            explanation: "Tutto secondo il piano.",
            tips: [],
        });
        await narrate(PLAN, SNAPSHOT, "it");
        expect(state.lastInput).not.toContain("Creditor Srl");
        // Al suo posto c'è un'etichetta anonima.
        expect(state.lastInput).toContain("Debito 1");
    });

    test("il prompt dichiara che i dati sono solo dati", async () => {
        state.output = JSON.stringify({ headline: "Piano", explanation: "Ok.", tips: [] });
        await narrate(PLAN, SNAPSHOT, "it");
        expect(state.lastInput).toContain("solo dati");
    });
});
