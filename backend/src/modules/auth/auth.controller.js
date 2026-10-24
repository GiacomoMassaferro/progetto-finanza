import { assertCsrf, clearAuthCookies, readCookie, REFRESH_COOKIE, setAuthCookies } from "../../common/cookies.js";
import { AppError } from "../../common/utils/AppError.js";
import { ttlToSeconds } from "../../common/utils/ttl.js";
import { asyncHandler } from "../../common/utils/asyncHandler.js";
import { env } from "../../config/env.js";
import {
    validateLogin,
    validateLogout,
    validateMeUpdate,
    validateRefresh,
    validateRegister,
} from "./auth.schemas.js";
import * as authService from "./auth.service.js";

// I controller traducono HTTP <-> service: validano l'input, chiamano il
// service e impacchettano la risposta in { data }. Mai Prisma qui dentro.
//
// Due modalità di trasporto (D-28):
// - cookie (default per il browser): il refresh token vive solo nel cookie
//   HttpOnly, il body contiene unicamente l'access token (breve, in memoria).
// - bearer (opt-in con `x-auth-mode: bearer` o refreshToken nel body):
//   contratto storico per client non-browser, che ricevono la coppia nel body.

// Il client dichiara esplicitamente di voler gestire i token da sé.
function wantsBearer(req) {
    return req.get("x-auth-mode") === "bearer";
}

// Risposta di sessione: in cookie mode il refresh token non compare mai nel body.
// `bearer` è deciso dal chiamante (header oppure refreshToken nel body), non
// solo dall'header: un client che manda il token nel body resta in bearer mode.
function sendSession(res, { user, tokens }, { bearer, status = 200 }) {
    if (bearer) {
        res.status(status).json({ data: { user, tokens } });
        return;
    }
    setAuthCookies(res, { refreshToken: tokens.refreshToken });
    res.status(status).json({
        data: {
            user,
            accessToken: tokens.accessToken,
            expiresIn: ttlToSeconds(env.jwt.accessTtl),
        },
    });
}

// POST /api/v1/auth/register -> 201 + utente e sessione.
export const register = asyncHandler(async (req, res) => {
    const input = validateRegister(req.body);
    const result = await authService.register(input);
    sendSession(res, result, { bearer: wantsBearer(req), status: 201 });
});

// POST /api/v1/auth/login -> 200 + utente e sessione.
export const login = asyncHandler(async (req, res) => {
    const input = validateLogin(req.body);
    const result = await authService.login(input);
    sendSession(res, result, { bearer: wantsBearer(req) });
});

// POST /api/v1/auth/refresh -> 200 + nuova sessione (rotazione).
// Il token viene dal cookie httpOnly; il body esplicito resta supportato per
// i client API. In cookie mode l'header CSRF deve combaciare col cookie.
export const refresh = asyncHandler(async (req, res) => {
    const input = validateRefresh(req.body ?? {});
    const bearer = wantsBearer(req) || Boolean(input.refreshToken);
    const refreshToken = input.refreshToken ?? readCookie(req, REFRESH_COOKIE);
    if (!refreshToken) {
        throw new AppError(401, "Refresh token non valido o scaduto");
    }
    if (!bearer) {
        assertCsrf(req);
    }
    try {
        const result = await authService.refresh({ refreshToken });
        sendSession(res, result, { bearer });
    } catch (err) {
        // Sessione non più valida (scaduta, revocata, riuso): il browser non
        // deve continuare a rimandare un cookie morto.
        clearAuthCookies(res);
        throw err;
    }
});

// GET /api/v1/auth/me (protetta) -> 200 + profilo utente.
export const me = asyncHandler(async (req, res) => {
    const user = await authService.me(req.user.id);
    res.json({ data: { user } });
});

// POST /api/v1/auth/logout (protetta) -> 200: revoca la sessione (refresh
// token + famiglia) e cancella i cookie. Il client deve chiamarlo: il logout
// solo client lascerebbe il token valido lato server.
export const logout = asyncHandler(async (req, res) => {
    const input = validateLogout(req.body ?? {});
    const bearer = wantsBearer(req) || Boolean(input.refreshToken);
    const refreshToken = input.refreshToken ?? readCookie(req, REFRESH_COOKIE);
    if (!bearer) {
        assertCsrf(req);
    }
    const result = await authService.logout({ refreshToken });
    clearAuthCookies(res);
    res.json({ data: result });
});

// POST /api/v1/auth/logout-all (protetta) -> 200: revoca tutte le sessioni
// dell'utente (uscire da ogni dispositivo) e cancella i cookie locali.
export const logoutAll = asyncHandler(async (req, res) => {
    const result = await authService.logoutAll(req.user.id);
    clearAuthCookies(res);
    res.json({ data: result });
});

// PATCH /api/v1/auth/me (protetta) -> 200 + profilo aggiornato.
export const updateMe = asyncHandler(async (req, res) => {
    const input = validateMeUpdate(req.body);
    const user = await authService.updateMe(req.user.id, input);
    res.json({ data: { user } });
});
