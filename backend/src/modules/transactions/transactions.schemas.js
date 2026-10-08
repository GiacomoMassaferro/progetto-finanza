import { z } from "zod";
import { parseOr400 } from "../../common/utils/validate.js";

// Validazione di body e query delle transazioni con zod. Stesse funzioni
// di prima: lanciano AppError 400 oppure restituiscono i dati puliti.

const TYPES = ["INCOME", "EXPENSE"];

// Importo: numero o stringa numerica, > 0 (o >= 0), max 2 decimali.
// Restituisce la stringa a 2 decimali (niente float verso il DB).
function moneyField(field, { required = true, allowZero = false } = {}) {
    const base = z
        .union([z.number(), z.string()])
        .refine(
            (v) => {
                const n = Number(v);
                return Number.isFinite(n) && n >= 0 && (allowZero || n > 0);
            },
            { message: `${field} deve essere ${allowZero ? ">= 0" : "> 0"}` },
        )
        .refine((v) => Math.round(Number(v) * 100) === Number(v) * 100, {
            message: `${field} max 2 decimali`,
        })
        .transform((v) => Number(v).toFixed(2));
    return required ? base : base.optional();
}

// Data ISO (YYYY-MM-DD o datetime): deve esistere davvero -> Date.
function dateField(field, { required = true } = {}) {
    const base = z
        .string()
        .refine((s) => !Number.isNaN(Date.parse(s)), {
            message: `${field} deve essere ISO (es. 2026-10-08)`,
        })
        .transform((s) => new Date(s));
    return required ? base : base.optional();
}

// Intero dai query param (?page, ?limit): arrivano come stringhe.
const pageSchema = z.coerce.number().int().min(1).default(1);
const limitSchema = z.coerce.number().int().min(1).max(100).default(20);

// Query di GET /transactions: paginazione + filtri, from deve precedere to.
const listSchema = z
    .object({
        page: pageSchema,
        limit: limitSchema,
        type: z.enum(TYPES).optional(),
        categoryId: z.string().optional(),
        from: dateField("from", { required: false }),
        to: dateField("to", { required: false }),
    })
    .refine((q) => !q.from || !q.to || q.from <= q.to, {
        message: "from deve precedere to",
    });

// Campi comuni: id di categoria/rata restano grezzi, li controlla il service
// (deve verificare proprietà + esistenza, non solo il formato).
const commonFields = {
    amount: moneyField("amount"),
    type: z.enum(TYPES),
    description: z.string().max(2000, "description max 2000 caratteri").nullable().optional(),
    transactionDate: dateField("transactionDate"),
    movementsCategoryId: z.union([z.string(), z.number()]),
    debtPaymentId: z.union([z.string(), z.number()]).nullable().optional(),
};

// Body di POST /transactions: tutto obbligatorio tranne description e debtPaymentId.
const createSchema = z.object(commonFields);

// Body di PATCH /transactions/:id: tutto opzionale ma almeno un campo.
const updateSchema = z
    .object({
        amount: moneyField("amount", { required: false }),
        type: commonFields.type.optional(),
        description: commonFields.description,
        transactionDate: dateField("transactionDate", { required: false }),
        movementsCategoryId: commonFields.movementsCategoryId.optional(),
        debtPaymentId: commonFields.debtPaymentId,
    })
    .refine((obj) => Object.keys(obj).length > 0, { message: "nessun campo da aggiornare" });

export function validateList(query) {
    return parseOr400(listSchema, query, "Parametri di ricerca non validi");
}

export function validateCreate(body) {
    return parseOr400(createSchema, body, "Dati transazione non validi");
}

export function validateUpdate(body) {
    return parseOr400(updateSchema, body, "Dati transazione non validi");
}
