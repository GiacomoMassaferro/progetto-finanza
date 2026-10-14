import { z } from "zod";

// Contratti del modulo IA (condivisi da router, chain ed endpoint).
// Tutto ciò che esce dal router è validato qui: il frontend riceve
// sempre la stessa forma, sia dalle regole che (Fase 2) dall'LLM.

// Intenti gestiti dal router (vedi router.js).
export const intentSchema = z.enum(["payoff", "savings", "chat", "unknown"]);

// Singola voce di suggerimento (piano o consiglio).
export const suggestionItemSchema = z.object({
    title: z.string(),
    detail: z.string(),
    // Importo in centesimi come stringa ("120.00") o null se non monetario.
    amount: z.string().nullable().optional(),
});

// Output uniforme di ogni chain: motore che l'ha prodotto + lingua + voci.
// I campi extra (warnings, snapshot, savings...) sono opzionali: le chain
// semplici non li usano, il payoff sì (e l'LLM futuro li riusa).
export const suggestionSchema = z.object({
    intent: intentSchema,
    locale: z.enum(["en", "it", "es", "de"]),
    engine: z.string(),
    summary: z.string(),
    items: z.array(suggestionItemSchema),
    warnings: z.array(z.string()).optional(),
    // Snapshot per l'LLM futuro: solo cifre aggregate, mai dati personali.
    snapshot: z
        .object({
            availableNowCents: z.number(),
            monthIncomeCents: z.number(),
            monthExpensesCents: z.number(),
            monthlyFreeCents: z.number(),
            debtsTotalCents: z.number(),
            upcoming30dCents: z.number(),
            overdueCount: z.number(),
            savingsTotalCents: z.number(),
        })
        .optional(),
    savings: z.object({ monthlyAmount: z.string(), note: z.string() }).optional(),
    projectedDebtFree: z.string().nullable().optional(),
    // Narrativa LLM (Fase 2): null se il provider manca o fallisce.
    // Le regole restano sempre la base; la narrativa è solo racconto.
    narrative: z
        .object({
            headline: z.string(),
            explanation: z.string(),
            tips: z.array(z.string()),
        })
        .nullable()
        .optional(),
});

// Input del router: chi chiede, cosa chiede, in che lingua rispondere.
export const routeInputSchema = z.object({
    userId: z.string().min(1),
    intent: intentSchema,
    locale: z.enum(["en", "it", "es", "de"]).default("en"),
});

// Body di POST /ai/suggest: intento + lingua opzionale (il frontend
// manda quella del profilo; default inglese).
export const suggestSchema = z.object({
    intent: intentSchema.default("payoff"),
    locale: z.enum(["en", "it", "es", "de"]).optional(),
});
