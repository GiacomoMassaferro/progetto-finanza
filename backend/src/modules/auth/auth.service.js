import { createHash, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { AppError } from "../../common/utils/AppError.js";
import { withAlive } from "../../common/utils/softDelete.js";
import { env } from "../../config/env.js";
import { prisma } from "../../config/prisma.js";

// Costo bcrypt: 10 = buon compromesso sicurezza/velocità per register e login.
const BCRYPT_ROUNDS = 10;

// Converte "15m"/"1h"/"7d" in millisecondi per la scadenza DB dei refresh.
function ttlToMs(ttl) {
    const match = /^(\d+)([mhd])$/.exec(ttl);
    if (!match) {
        throw new Error(`TTL non supportato: "${ttl}" (usa formati come 15m, 1h, 7d)`);
    }
    const value = Number(match[1]);
    const unit = { m: 60_000, h: 3_600_000, d: 86_400_000 }[match[2]];
    return value * unit;
}

// Rimuove i campi interni (hash, BigInt) prima di esporre l'utente via API.
// BigInt va convertito: JSON.stringify lo rifiuta (vedi PLAN I-03).
function toSafeUser(user) {
    return {
        id: String(user.id),
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        language: user.language,
        createdAt: user.createdAt,
    };
}

// Firma un access token breve per le chiamate API.
function signAccess(user) {
    return jwt.sign(
        { sub: String(user.id), email: user.email, type: "access" },
        env.jwt.secret,
        { expiresIn: env.jwt.accessTtl },
    );
}

// Crea un refresh token, ne salva solo l'hash SHA-256 e restituisce il
// token in chiaro (unica occasione in cui il client lo vede).
async function issueRefresh(userId) {
    const token = jwt.sign(
        { sub: String(userId), jti: randomUUID(), type: "refresh" },
        env.jwt.secret,
        { expiresIn: env.jwt.refreshTtl },
    );
    const tokenHash = createHash("sha256").update(token).digest("hex");
    await prisma.refreshToken.create({
        data: {
            userId,
            tokenHash,
            expiresAt: new Date(Date.now() + ttlToMs(env.jwt.refreshTtl)),
        },
    });
    return token;
}

// Registra un nuovo utente e restituisce utente + coppia di token.
export async function register({ email, password, firstName, lastName }) {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
        // 409 anche se soft-deleted: l'email resta UNIQUE (vedi PLAN §3.3).
        throw new AppError(409, "Email già registrata");
    }
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const user = await prisma.user.create({
        data: { email, passwordHash, firstName, lastName },
    });
    return { user: toSafeUser(user), tokens: await issuePair(user.id) };
}

// Verifica le credenziali e restituisce utente + coppia di token.
// Messaggio generico per non rivelare se l'email esiste.
export async function login({ email, password }) {
    const user = await prisma.user.findFirst({ where: withAlive({ email }) });
    const valid = user ? await bcrypt.compare(password, user.passwordHash) : false;
    if (!valid) {
        throw new AppError(401, "Credenziali non valide");
    }
    return { user: toSafeUser(user), tokens: await issuePair(user.id) };
}

// Ruota un refresh token: consuma quello vecchio (uso singolo) e ne
// emette una coppia nuova. Il riuso di un token già consumato fallisce.
export async function refresh({ refreshToken }) {
    let payload;
    try {
        payload = jwt.verify(refreshToken, env.jwt.secret);
    } catch {
        throw new AppError(401, "Refresh token non valido o scaduto");
    }
    if (payload.type !== "refresh") {
        throw new AppError(401, "Refresh token non valido o scaduto");
    }
    const tokenHash = createHash("sha256").update(refreshToken).digest("hex");
    const stored = await prisma.refreshToken.findUnique({ where: { tokenHash } });
    if (!stored || stored.expiresAt < new Date()) {
        throw new AppError(401, "Refresh token non valido o scaduto");
    }
    // Uso singolo: elimina il vecchio prima di emettere la coppia nuova.
    await prisma.refreshToken.delete({ where: { id: stored.id } });
    const user = await prisma.user.findFirst({ where: withAlive({ id: stored.userId }) });
    if (!user) {
        throw new AppError(401, "Refresh token non valido o scaduto");
    }
    return { user: toSafeUser(user), tokens: await issuePair(user.id) };
}

// Profilo dell'utente autenticato (req.user arriva dal middleware auth).
export async function me(userId) {
    const user = await prisma.user.findFirst({
        where: withAlive({ id: BigInt(userId) }),
    });
    if (!user) {
        throw new AppError(404, "Utente non trovato");
    }
    return toSafeUser(user);
}

// Aggiorna il profilo (oggi: solo la lingua preferita).
export async function updateMe(userId, data) {
    const user = await prisma.user.findFirst({
        where: withAlive({ id: BigInt(userId) }),
    });
    if (!user) {
        throw new AppError(404, "Utente non trovato");
    }
    const updated = await prisma.user.update({ where: { id: user.id }, data });
    return toSafeUser(updated);
}

// Emette la coppia access + refresh per un utente.
async function issuePair(userId) {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    return { accessToken: signAccess(user), refreshToken: await issueRefresh(userId) };
}
