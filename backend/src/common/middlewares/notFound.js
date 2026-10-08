import { AppError } from "../utils/AppError.js";

// 404 per rotte non registrate. Deve stare dopo tutte le route.
export const notFound = (req, _res, next) => {
    next(new AppError(404, `Rotta non trovata: ${req.method} ${req.originalUrl}`));
};
