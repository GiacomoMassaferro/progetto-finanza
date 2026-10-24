// Gestione dei cookie di autenticazione per il browser (D-28).
//
// Modello:
// - `pf_refresh`: refresh token, HttpOnly (JavaScript non lo può leggere),
//   inviato solo agli endpoint auth, SameSite=Lax/Secure da env.
// - `pf_csrf`: token CSRF leggibile dal frontend (double-submit): il client
//   lo rimanda nell'header `x-csrf-token` e il server verifica che coincida.
//   Serve perché i cookie partono da soli: senza questo controllo un sito
//   terzo potrebbe far partire un refresh/logout col cookie della vittima.
import { randomBytes, timingSafeEqual } from "node:crypto";
import { AppError } from "./utils/AppError.js";
import { ttlToMs } from "./utils/ttl.js";
import { env } from "../config/env.js";

export const REFRESH_COOKIE = "pf_refresh";
export const CSRF_COOKIE = "pf_csrf";
export const CSRF_HEADER = "x-csrf-token";

// Il refresh cookie viaggia solo verso /api/v1/auth (refresh, logout, logout-all).
const REFRESH_PATH = "/api/v1/auth";

// Attributi comuni a tutti i cookie di sessione.
function baseOptions() {
    return {
        secure: env.cookies.secure,
        sameSite: env.cookies.sameSite,
        ...(env.cookies.domain ? { domain: env.cookies.domain } : {}),
    };
}

// Cookie refresh: HttpOnly, restricted path, scadenza allineata al TTL del token.
function refreshOptions() {
    return {
        ...baseOptions(),
        httpOnly: true,
        path: REFRESH_PATH,
        maxAge: ttlToMs(env.jwt.refreshTtl),
    };
}

// Cookie CSRF: leggibile da JS (Path=/ così il frontend lo vede ovunque).
function csrfOptions() {
    return {
        ...baseOptions(),
        httpOnly: false,
        path: "/",
        maxAge: ttlToMs(env.jwt.refreshTtl),
    };
}

// Nuovo token CSRF ad alta entropia (base64url, niente caratteri da escapare).
export function newCsrfToken() {
    return randomBytes(32).toString("base64url");
}

// Legge un cookie dalla richiesta (Express non li parsa da solo e non
// vogliamo aggiungere una dipendenza per una singola lettura).
export function readCookie(req, name) {
    const header = req.headers?.cookie;
    if (!header) {
        return null;
    }
    for (const part of header.split(";")) {
        const separator = part.indexOf("=");
        if (separator === -1) {
            continue;
        }
        if (part.slice(0, separator).trim() !== name) {
            continue;
        }
        try {
            return decodeURIComponent(part.slice(separator + 1).trim());
        } catch {
            return null;
        }
    }
    return null;
}

// Imposta refresh + CSRF: chiamato a login, register e su ogni rotazione.
export function setAuthCookies(res, { refreshToken }) {
    res.cookie(REFRESH_COOKIE, refreshToken, refreshOptions());
    res.cookie(CSRF_COOKIE, newCsrfToken(), csrfOptions());
}

// Cancella entrambi i cookie (logout, refresh fallito). Stessi attributi di
// set, altrimenti il browser non riconosce il cookie da rimuovere.
export function clearAuthCookies(res) {
    res.clearCookie(REFRESH_COOKIE, { ...refreshOptions(), maxAge: undefined });
    res.clearCookie(CSRF_COOKIE, { ...csrfOptions(), maxAge: undefined });
}

// Verifica double-submit: l'header deve esistere e combaciare col cookie.
// Confronto a tempo costante per non esporre informazioni sul valore atteso.
export function assertCsrf(req) {
    const cookieToken = readCookie(req, CSRF_COOKIE);
    const headerToken = req.get?.(CSRF_HEADER) ?? req.headers?.[CSRF_HEADER];
    if (!cookieToken || !headerToken) {
        throw new AppError(403, "Richiesta non autorizzata");
    }
    const a = Buffer.from(cookieToken);
    const b = Buffer.from(String(headerToken));
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
        throw new AppError(403, "Richiesta non autorizzata");
    }
}
