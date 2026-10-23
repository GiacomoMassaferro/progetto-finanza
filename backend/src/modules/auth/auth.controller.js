import { asyncHandler } from "../../common/utils/asyncHandler.js";
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

// POST /api/v1/auth/register -> 201 + utente e token.
export const register = asyncHandler(async (req, res) => {
    const input = validateRegister(req.body);
    const result = await authService.register(input);
    res.status(201).json({ data: result });
});

// POST /api/v1/auth/login -> 200 + utente e token.
export const login = asyncHandler(async (req, res) => {
    const input = validateLogin(req.body);
    const result = await authService.login(input);
    res.json({ data: result });
});

// POST /api/v1/auth/refresh -> 200 + nuova coppia di token (rotazione).
export const refresh = asyncHandler(async (req, res) => {
    const input = validateRefresh(req.body);
    const result = await authService.refresh(input);
    res.json({ data: result });
});

// GET /api/v1/auth/me (protetta) -> 200 + profilo utente.
export const me = asyncHandler(async (req, res) => {
    const user = await authService.me(req.user.id);
    res.json({ data: { user } });
});

// POST /api/v1/auth/logout (protetta) -> 200: revoca la sessione (refresh
// token + famiglia). Il client deve chiamarlo: il logout solo client lascerebbe
// il token valido lato server.
export const logout = asyncHandler(async (req, res) => {
    const input = validateLogout(req.body);
    const result = await authService.logout(input);
    res.json({ data: result });
});

// POST /api/v1/auth/logout-all (protetta) -> 200: revoca tutte le sessioni
// dell'utente (uscire da ogni dispositivo).
export const logoutAll = asyncHandler(async (req, res) => {
    const result = await authService.logoutAll(req.user.id);
    res.json({ data: result });
});

// PATCH /api/v1/auth/me (protetta) -> 200 + profilo aggiornato.
export const updateMe = asyncHandler(async (req, res) => {
    const input = validateMeUpdate(req.body);
    const user = await authService.updateMe(req.user.id, input);
    res.json({ data: { user } });
});
