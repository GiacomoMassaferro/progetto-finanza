import { z } from "zod";
import { parseOr400 } from "../../common/utils/validate.js";

// Validazione degli obiettivi di risparmio con zod. Stesse funzioni
// ovunque: lanciano AppError 400 oppure restituiscono i dati puliti.
// Mirror di GoalStatus in schema.prisma: se lo cambi lì, aggiorna qui.

const GOAL_STATUSES = ["ACTIVE", "REACHED", "ARCHIVED"];

// Importo: numero o stringa numerica, >= 0 (o > 0), max 2 decimali.
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

// Interi dai query param (?page, ?limit): arrivano come stringhe.
const pageSchema = z.coerce.number().int().min(1).default(1);
const limitSchema = z.coerce.number().int().min(1).max(100).default(20);

// Query di GET /goals: paginazione + filtro opzionale per stato.
const goalListSchema = z.object({
    page: pageSchema,
    limit: limitSchema,
    status: z.enum(GOAL_STATUSES).optional(),
});

const goalFields = {
    name: z.string().trim().min(1, "name obbligatorio").max(100, "name max 100 caratteri"),
    targetAmount: moneyField("targetAmount"),
    currentAmount: moneyField("currentAmount", { required: false, allowZero: true }),
    status: z.enum(GOAL_STATUSES).optional(),
};

// Body di POST /goals: nome e obiettivo obbligatori, resto con default.
const goalCreateSchema = z.object(goalFields);

// Body di PATCH /goals/:id: tutto opzionale ma almeno un campo.
const goalUpdateSchema = z
    .object({
        name: goalFields.name.optional(),
        targetAmount: moneyField("targetAmount", { required: false }),
        currentAmount: moneyField("currentAmount", { required: false, allowZero: true }),
        status: goalFields.status,
    })
    .refine((obj) => Object.keys(obj).length > 0, { message: "nessun campo da aggiornare" });

// Body di POST /goals/:id/deposit: versamento positivo che si somma.
const depositSchema = z.object({ amount: moneyField("amount") });

export function validateGoalList(query) {
    return parseOr400(goalListSchema, query, "Parametri di ricerca non validi");
}

export function validateGoalCreate(body) {
    return parseOr400(goalCreateSchema, body, "Dati obiettivo non validi");
}

export function validateGoalUpdate(body) {
    return parseOr400(goalUpdateSchema, body, "Dati obiettivo non validi");
}

export function validateDeposit(body) {
    return parseOr400(depositSchema, body, "Dati versamento non validi");
}
