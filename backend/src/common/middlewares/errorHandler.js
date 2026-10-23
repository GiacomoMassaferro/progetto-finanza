import { env } from "../../config/env.js";
import { AppError } from "../utils/AppError.js";

// Traduce gli errori Prisma noti in risposte HTTP comprensibili senza
// esporre dettagli interni del database (nomi tabella, query, valori).
const PRISMA_HTTP = {
    // Unique constraint violata (es. email già registrata).
    P2002: [409, "Dati duplicati: la richiesta viola un vincolo di unicità"],
    // Record non trovato.
    P2025: [404, "Risorsa non trovata"],
    // Foreign key violata (es. id inesistente).
    P2003: [400, "Riferimento non valido: la risorsa collegata non esiste"],
    // Violazione di un vincolo CHECK.
    P2011: [400, "Dati non validi per un vincolo del database"],
    // Errore di connessione/timeout del database.
    P1001: [503, "Database non raggiungibile, riprova più tardi"],
    P1002: [503, "Database non raggiungibile, riprova più tardi"],
    P1008: [503, "Database non raggiungibile, riprova più tardi"],
    P1017: [503, "Database non raggiungibile, riprova più tardi"],
};

// Gestore errori centralizzato. Formato unico per tutta l'API:
// { error: { message, ...(details in dev) } }
export const errorHandler = (err, _req, res, _next) => {
    // JSON malformato: body-parser lo segnala così (type entity.parse.failed).
    // È colpa del client, quindi 400 e non 500.
    if (err.type === "entity.parse.failed") {
        err = new AppError(400, "JSON non valido nel body richiesta");
    }

    // Errori Prisma con un codice noto: mappati su un errore applicativo.
    // Il messaggio originale (contiene query e nomi di tabelle) non esce.
    const prismaCode = err?.code;
    if (typeof prismaCode === "string" && PRISMA_HTTP[prismaCode]) {
        const [status, message] = PRISMA_HTTP[prismaCode];
        err = new AppError(status, message);
    }

    const statusCode =
        err instanceof AppError && Number.isInteger(err.statusCode)
            ? err.statusCode
            : 500;

    if (statusCode >= 500) {
        // Log server-side con la causa originale (mai nel body della risposta).
        // eslint-disable-next-line no-console
        console.error(err);
    }

    const body = { error: { message: err.message || "Errore interno" } };

    // In produzione il messaggio di un errore non gestito (500) è generico:
    // il dettaglio tecnico resta nei log.
    if (statusCode === 500 && !env.isDev) {
        body.error.message = "Errore interno del server";
    }

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
