import { AppError } from "../utils/AppError.js";

// 404 per rotte non registrate. Deve stare dopo tutte le route.
// Il messaggio non riflette l'URL richiesto: rifletterlo trasformerebbe la
// risposta in un vettore di XSS riflesso (il path finisce nel body JSON,
// che some client renderizzano in HTML).
export const notFound = (_req, _res, next) => {
    next(new AppError(404, "Risorsa non trovata"));
};
