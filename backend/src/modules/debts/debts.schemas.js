import { z } from "zod";
import { parseOr400 } from "../../common/utils/validate.js";

// Validazione di body e query di debiti e rate con zod. Stesse funzioni
// di prima: lanciano AppError 400 oppure restituiscono i dati puliti.
// Mirror degli enum di schema.prisma: se li cambi lì, aggiorna qui.

const DEBT_TYPES = ["BNPL", "CREDIT_CARD", "PERSONAL_LOAN", "MORTGAGE", "OTHER"];
const DEBT_STATUSES = ["ACTIVE", "PAID_OFF", "DEFAULTED"];
const PAYMENT_STATUSES = ["PENDING", "PAID", "LATE"];

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

// Interi dai query param (?page, ?limit): arrivano come stringhe.
const pageSchema = z.coerce.number().int().min(1).default(1);
const limitSchema = z.coerce.number().int().min(1).max(100).default(20);

// Query di GET /debts: paginazione + filtri opzionali stato e tipo.
const debtListSchema = z.object({
    page: pageSchema,
    limit: limitSchema,
    status: z.enum(DEBT_STATUSES).optional(),
    debtType: z.enum(DEBT_TYPES).optional(),
});

// Giorno di scadenza mensile: 1-31, o null per azzerarlo in modifica.
const dueDaySchema = z.union([z.number().int().min(1).max(31), z.null()]).optional();

// Campi del debito. remainingAmount omesso in creazione = uguale al totale.
const debtFields = {
    creditorName: z.string().trim().min(1, "creditorName obbligatorio").max(191),
    debtType: z.enum(DEBT_TYPES),
    totalAmount: moneyField("totalAmount"),
    remainingAmount: moneyField("remainingAmount", { required: false }),
    interestRate: moneyField("interestRate", { required: false, allowZero: true }),
    monthlyPayment: moneyField("monthlyPayment"),
    dueDayOfMonth: z.number().int().min(1).max(31).optional(),
    startDate: dateField("startDate"),
};

// Body di POST /debts.
const debtCreateSchema = z.object(debtFields);

// Body di PATCH /debts/:id: tutto opzionale ma almeno un campo.
const debtUpdateSchema = z
    .object({
        creditorName: debtFields.creditorName.optional(),
        debtType: debtFields.debtType.optional(),
        totalAmount: moneyField("totalAmount", { required: false }),
        remainingAmount: moneyField("remainingAmount", { required: false }),
        interestRate: moneyField("interestRate", { required: false, allowZero: true }),
        monthlyPayment: moneyField("monthlyPayment", { required: false }),
        dueDayOfMonth: dueDaySchema,
        startDate: dateField("startDate", { required: false }),
        status: z.enum(DEBT_STATUSES).optional(),
    })
    .refine((obj) => Object.keys(obj).length > 0, { message: "nessun campo da aggiornare" });

// Body di POST /debts/:id/payments: importo e scadenza della rata.
const paymentCreateSchema = z.object({
    amount: moneyField("amount"),
    dueDate: dateField("dueDate"),
});

// Body di PATCH .../payments/:paymentId: tutto opzionale ma almeno un campo.
const paymentUpdateSchema = z
    .object({
        amount: moneyField("amount", { required: false }),
        dueDate: dateField("dueDate", { required: false }),
        paidDate: dateField("paidDate", { required: false }).nullable().optional(),
        status: z.enum(PAYMENT_STATUSES).optional(),
    })
    .refine((obj) => Object.keys(obj).length > 0, { message: "nessun campo da aggiornare" });

// Body di POST .../payments/:paymentId/pay: la categoria serve perché il
// pagamento genera una transazione (ogni movimento ha una categoria).
const paySchema = z.object({
    movementsCategoryId: z.union([z.string(), z.number()]),
    amount: moneyField("amount", { required: false }),
    paidDate: dateField("paidDate", { required: false }),
    description: z.string().max(2000, "description max 2000 caratteri").nullable().optional(),
});

export function validateDebtList(query) {
    return parseOr400(debtListSchema, query, "Parametri di ricerca non validi");
}

export function validateDebtCreate(body) {
    return parseOr400(debtCreateSchema, body, "Dati debito non validi");
}

export function validateDebtUpdate(body) {
    return parseOr400(debtUpdateSchema, body, "Dati debito non validi");
}

export function validatePaymentCreate(body) {
    return parseOr400(paymentCreateSchema, body, "Dati rata non validi");
}

export function validatePaymentUpdate(body) {
    return parseOr400(paymentUpdateSchema, body, "Dati rata non validi");
}

export function validatePay(body) {
    return parseOr400(paySchema, body === undefined ? {} : body, "Dati pagamento non validi");
}
