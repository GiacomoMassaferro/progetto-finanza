import { AppError } from "./AppError.js";

// Esegue uno schema zod e restituisce i dati puliti.
// Se fallisce lancia AppError 400 col formato uniforme { message, details[] }.
// `message` è il messaggio del chiamante (es. "Dati categoria non validi").
export function parseOr400(schema, input, message) {
    const result = schema.safeParse(input);
    if (result.success) {
        return result.data;
    }
    const details = result.error.issues.map((issue) => {
        const path = issue.path.length > 0 ? issue.path.join(".") : "body";
        return `${path}: ${issue.message}`;
    });
    throw new AppError(400, message, details);
}
