// Errore operativo con status HTTP associato.
// Usalo nei service quando il client sbaglia (400/404/409...).
// Tutto il resto (bug, DB giù) resta 500 e viene loggato.
export class AppError extends Error {
    constructor(statusCode, message, details) {
        super(message);
        this.name = "AppError";
        this.statusCode = statusCode;
        if (details !== undefined) {
            this.details = details;
        }
    }

    get isOperational() {
        return true;
    }
}
