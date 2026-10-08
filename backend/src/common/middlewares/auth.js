import jwt from "jsonwebtoken";
import { env } from "../../config/env.js";
import { AppError } from "../utils/AppError.js";

// Protegge una rotta: richiede `Authorization: Bearer <accessToken>`.
// In caso di successo imposta `req.user = { id, email }`.
export const auth = (req, _res, next) => {
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) {
        return next(new AppError(401, "Token di accesso mancante"));
    }

    try {
        const payload = jwt.verify(header.slice(7), env.jwt.secret);
        // Solo gli access token aprono le API: i refresh servono
        // esclusivamente all'endpoint di rinnovo.
        if (payload.type !== "access") {
            return next(new AppError(401, "Token non valido per questa risorsa"));
        }
        req.user = { id: payload.sub, email: payload.email };
        return next();
    } catch {
        // Firma errata, token scaduto o malformato: mai esporre il dettaglio.
        return next(new AppError(401, "Token di accesso non valido o scaduto"));
    }
};
