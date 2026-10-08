import { z } from "zod";
import { parseOr400 } from "../../common/utils/validate.js";

// Validazione di body e query delle categorie con zod. Stesse funzioni
// di prima: lanciano AppError 400 oppure restituiscono i dati puliti.

const TYPES = ["INCOME", "EXPENSE"];

// Intero dai query param (?page, ?limit): arrivano come stringhe.
const pageSchema = z.coerce.number().int().min(1).default(1);
const limitSchema = z.coerce.number().int().min(1).max(100).default(20);

// Query di GET /categories: paginazione + filtro opzionale per tipo.
const listSchema = z.object({
    page: pageSchema,
    limit: limitSchema,
    type: z.enum(TYPES).optional(),
});

// Campi della categoria: nome obbligatorio, colore corto o null.
const categoryFields = {
    name: z.string().trim().min(1, "name obbligatorio").max(100, "name max 100 caratteri"),
    type: z.enum(TYPES),
    color: z.string().max(20, "color max 20 caratteri").nullable().optional(),
};

// Body di POST /categories: name e type obbligatori, color opzionale.
const createSchema = z.object(categoryFields);

// Body di PATCH /categories/:id: tutto opzionale ma almeno un campo.
const updateSchema = z
    .object({
        name: categoryFields.name.optional(),
        type: categoryFields.type.optional(),
        color: categoryFields.color,
    })
    .refine((obj) => Object.keys(obj).length > 0, {
        message: "nessun campo da aggiornare (name, type, color)",
    });

export function validateList(query) {
    return parseOr400(listSchema, query, "Parametri di ricerca non validi");
}

export function validateCreate(body) {
    return parseOr400(createSchema, body, "Dati categoria non validi");
}

export function validateUpdate(body) {
    return parseOr400(updateSchema, body, "Dati categoria non validi");
}
