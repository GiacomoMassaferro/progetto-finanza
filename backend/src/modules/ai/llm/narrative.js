import { z } from "zod";
import { geminiModel, getGemini } from "./gemini.js";

// Forma della narrativa LLM (validata: l'LLM non può inventare campi).
export const narrativeSchema = z.object({
    headline: z.string(),
    explanation: z.string(),
    tips: z.array(z.string()).max(5),
});

// Schema JSON per response_format dell'Interactions API (stessi campi).
const narrativeJsonSchema = {
    type: "object",
    properties: {
        headline: { type: "string", description: "Titolo breve del consiglio." },
        explanation: { type: "string", description: "Spiegazione semplice del piano." },
        tips: { type: "array", items: { type: "string" }, description: "Max 3 consigli pratici di risparmio." },
    },
    required: ["headline", "explanation", "tips"],
};

// Istruzioni per locale: tono semplice, niente gergo, mai numeri nuovi
// (usa solo quelli del piano), niente consulenza oltre i dati.
const SYSTEM = {
    it: "Sei un assistente di finanza personale. Spiega il piano di estinzione in modo semplice, senza gergo. Usa SOLO i numeri forniti, non inventarne. Max 3 consigli pratici di risparmio coerenti coi dati. Rispondi in italiano.",
    en: "You are a personal finance assistant. Explain the payoff plan simply, no jargon. Use ONLY the numbers provided, never invent any. Max 3 practical saving tips consistent with the data. Answer in English.",
    es: "Eres un asistente de finanzas personales. Explica el plan de pago de forma sencilla, sin jerga. Usa SOLO los números dados, nunca inventes. Máx 3 consejos prácticos de ahorro coherentes. Responde en español.",
    de: "Du bist ein Finanzassistent. Erkläre den Tilgungsplan einfach, ohne Jargon. Nutze NUR die angegebenen Zahlen, erfinde keine. Max 3 praktische Spartipps passend zu den Daten. Antworte auf Deutsch.",
};

// Genera la narrativa dal piano deterministico via Interactions API.
// Ritorna null se l'LLM manca o fallisce: il chiamante resta sulle regole.
export async function narrate(plan, snapshot, locale = "en") {
    const ai = getGemini();
    if (!ai) {
        return null;
    }
    try {
        const input = [
            `Plan summary: ${plan.summary}`,
            `Items: ${plan.items.map((i) => `${i.title}: ${i.detail} (${i.amount ?? "n/a"})`).join(" | ") || "none"}`,
            `Warnings: ${plan.warnings.join("; ") || "none"}`,
            `Monthly savings: ${plan.savings.monthlyAmount} (${plan.savings.note})`,
            `Projected debt free: ${plan.projectedDebtFree ?? "n/a"}`,
            `Snapshot (cents): available=${snapshot.availableNowCents} income=${snapshot.monthIncomeCents} expenses=${snapshot.monthExpensesCents} debts=${snapshot.debtsTotalCents} upcoming30d=${snapshot.upcoming30dCents} overdue=${snapshot.overdueCount} saved=${snapshot.savingsTotalCents}`,
        ].join("\n");
        const interaction = await ai.interactions.create({
            model: geminiModel(),
            input: `${SYSTEM[locale] ?? SYSTEM.en}\n\n${input}`,
            response_format: { type: "text", mime_type: "application/json", schema: narrativeJsonSchema },
        });
        return narrativeSchema.parse(JSON.parse(interaction.output_text));
    } catch {
        return null;
    }
}
