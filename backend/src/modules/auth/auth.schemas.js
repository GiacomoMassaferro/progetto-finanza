import { z } from "zod";
import { parseOr400 } from "../../common/utils/validate.js";

// Validazione dei body auth con zod. Stesse funzioni di prima:
// lanciano AppError 400 oppure restituiscono i dati puliti.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Email normalizzata (trim + minuscole) e password minimo 8 caratteri.
const emailSchema = z.string().trim().toLowerCase().regex(EMAIL_RE, "email non valida");
const passwordSchema = z.string().min(8, "password di almeno 8 caratteri");

// Nomi opzionali: stringa vuota o assente diventano null nel service.
const nameSchema = z.string().trim().max(100, "max 100 caratteri").optional();

// Body di POST /auth/register: credenziali + nomi opzionali.
const registerSchema = z.object({
    email: emailSchema,
    password: passwordSchema,
    firstName: nameSchema,
    lastName: nameSchema,
});

// Body di POST /auth/login: solo credenziali.
const loginSchema = z.object({ email: emailSchema, password: passwordSchema });

// Body di POST /auth/refresh: il refresh token da ruotare.
const refreshSchema = z.object({ refreshToken: z.string().min(1, "refreshToken mancante") });

export function validateRegister(body) {
    const parsed = parseOr400(registerSchema, body, "Dati di registrazione non validi");
    return { ...parsed, firstName: parsed.firstName || null, lastName: parsed.lastName || null };
}

export function validateLogin(body) {
    return parseOr400(loginSchema, body, "Dati di login non validi");
}

export function validateRefresh(body) {
    return parseOr400(refreshSchema, body, "Dati di rinnovo non validi");
}
