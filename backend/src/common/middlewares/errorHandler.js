import { env } from "../../config/env.js";
import { AppError } from "../utils/AppError.js";

// Gestore errori centralizzato. Formato unico per tutta l'API:
// { error: { message, ...(details in dev) } }
export const errorHandler = (err, _req, res, _next) => {
    // JSON malformato: body-parser lo segnala così (type entity.parse.failed).
    // È colpa del client, quindi 400 e non 500.
    if (err.type === "entity.parse.failed") {
        err = new AppError(400, "JSON non valido nel body richiesta");
    }
    const statusCode =
        err instanceof AppError && Number.isInteger(err.statusCode)
            ? err.statusCode
            : 500;

    if (statusCode === 500) {
        // eslint-disable-next-line no-console
        console.error(err);
    }

    const body = { error: { message: err.message || "Errore interno" } };

    if (env.isDev) {
        if (err.details !== undefined) {
            body.error.details = err.details;
        }
        if (statusCode === 500 && err.stack) {
            body.error.stack = err.stack.split("\n").slice(0, 5);
        }
    }

    res.status(statusCode).json(body);
};
