import { rateLimit } from "express-rate-limit";
import { env } from "../../config/env.js";

// In test i limiter sono spenti: tutte le suite arrivano dallo stesso IP
// (127.0.0.1) e supererebbero subito i tetti. In dev/prod restano attivi.
const skip = () => env.isTest;

// Tetto globale sulle API: 300 richieste ogni 15 minuti per IP.
// Oltre il limite risponde 429 in JSON (formato errore uniforme).
export const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    standardHeaders: "draft-8",
    skip,
    message: { error: { message: "Troppe richieste, riprova più tardi" } },
});

// Tetto stretto sull'auth: login e register sono il bersaglio dei
// brute force, quindi 30 tentativi ogni 15 minuti per IP.
export const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: "draft-8",
    skip,
    message: { error: { message: "Troppi tentativi di accesso, riprova più tardi" } },
});

// Tetto sulle sonde di readiness: /ready tocca il DB, quindi senza tetto
// diventa un facile amplificatore di carico (DoS sul database).
export const probeLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 60,
    standardHeaders: "draft-8",
    skip,
    message: { error: { message: "Troppe richieste, riprova più tardi" } },
});
