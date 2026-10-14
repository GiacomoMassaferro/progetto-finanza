import { z } from "zod";
import { getGemini } from "./gemini.js";

// Forma della narrativa LLM (validata: l'LLM non può inventare campi).
export const narrativeSchema = z.object({
    headline: z.string(),
    explanation: z.string(),
    tips: z.array(z.string()).max(5),
});

// Istruzioni per locale: tono semplice, niente gergo, mai numeri nuovi
// (usa solo quelli del piano), niente consulenza personalizzata spinta
// oltre i dati (disclaimer incluso in risposta dal chiamante se serve).
const SYSTEM = {
    it: "Sei un assistente di finanza personale. Spiega il piano di estinzione in modo semplice, senza gergo. Usa SOLO i numeri forniti, non inventarne. Max 3 consigli pratici di risparmio coerenti coi dati. Rispondi in italiano.",
    en: "You are a personal finance assistant. Explain the payoff plan simply, no jargon. Use ONLY the numbers provided, never invent any. Max 3 practical saving tips consistent with the data. Answer in English.",
    es: "Eres un asistente de finanzas personales. Explica el plan de pago de forma sencilla, sin jerga. Usa SOLO los números dados, nunca inventes. Máx 3 consejos prácticos de ahorro coherentes. Responde en español.",
    de: "Du bist ein Finanzassistent. Erkläre den Tilgungsplan einfach, ohne Jargon. Nutze NUR die angegebenen Zahlen, erfinde keine. Max 3 praktische Spartipps passend zu den Daten. Antworte auf Deutsch.",
};

// Genera la narrativa dal piano deterministico. Ritorna null se l'LLM
// manca o fallisce: il chiamante resta sulle regole (mai errori all'utente).
// Timeout di 25s: oltre, meglio le regole subito che un'attesa infinita.
export async function narrate(plan, snapshot, locale = "en") {
    const llm = getGemini();
    if (!llm) {
        return null;
    }
    try {
        const structured = llm.withStructuredOutput(narrativeSchema);
        const user = [
            `Plan summary: ${plan.summary}`,
            `Items: ${plan.items.map((i) => `${i.title}: ${i.detail} (${i.amount ?? "n/a"})`).join(" | ") || "none"}`,
            `Warnings: ${plan.warnings.join("; ") || "none"}`,
            `Monthly savings: ${plan.savings.monthlyAmount} (${plan.savings.note})`,
            `Projected debt free: ${plan.projectedDebtFree ?? "n/a"}`,
            `Snapshot (cents): available=${snapshot.availableNowCents} income=${snapshot.monthIncomeCents} expenses=${snapshot.monthExpensesCents} debts=${snapshot.debtsTotalCents} upcoming30d=${snapshot.upcoming30dCents} overdue=${snapshot.overdueCount} saved=${snapshot.savingsTotalCents}`,
        ].join("\n");
        return await structured.invoke(
            [
                ["system", SYSTEM[locale] ?? SYSTEM.en],
                ["human", user],
            ],
            { signal: AbortSignal.timeout(25000) },
        );
    } catch {
        return null;
    }
}
