import { z } from "zod";
import { parseOr400 } from "../../common/utils/validate.js";

// Validazione del query param ?month=YYYY-MM della dashboard con zod.
// Mese omesso = mese corrente. Restituisce { month, from, to } dove
// [from, to) copre l'intero mese (from incluso, to escluso).

// Mese valido: anno 2000-2199 e mese 01-12.
const summarySchema = z
    .object({
        month: z
            .string()
            .regex(/^(20\d\d|21\d\d)-(0[1-9]|1[0-2])$/, "month deve essere YYYY-MM (es. 2026-10)")
            .optional(),
    })
    .transform((q) => {
        const now = new Date();
        const [year, month] = q.month ? q.month.split("-").map(Number) : [now.getFullYear(), now.getMonth() + 1];
        return {
            month: `${year}-${String(month).padStart(2, "0")}`,
            from: new Date(year, month - 1, 1),
            to: new Date(year, month, 1),
        };
    });

export function validateSummary(query) {
    return parseOr400(summarySchema, query, "Parametri dashboard non validi");
}
