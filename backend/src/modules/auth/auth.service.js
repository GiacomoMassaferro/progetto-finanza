import { createHash, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { AppError } from "../../common/utils/AppError.js";
import { withAlive } from "../../common/utils/softDelete.js";
import { env } from "../../config/env.js";
import { prisma } from "../../config/prisma.js";

// Costo bcrypt: 10 = buon compromesso sicurezza/velocità per register e login.
const BCRYPT_ROUNDS = 10;

// Hash "cieco" (password casuale mai usata): serve a eseguire un confronto
// bcrypt anche quando l'utente non esiste, così il tempo di risposta del
// login non rivela quali email sono registrate (user enumeration).
const DUMMY_HASH = "$2b$10$X/lHZn8VBEsqNpZRdI1CieSaYNFRL2YoKGEkXm.mSBleJ7nfQav1.";

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

// Finestra di tolleranza sul riuso: due richieste di refresh quasi simultanee
// (due tab aperte) non sono un furto. Oltre la finestra, il riuso di un token
// consumato viene trattato come furto e revoca la famiglia.
const REUSE_GRACE_MS = 30_000;

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

// Hash SHA-256 del token: è l'unica cosa che finisce nel DB.
function hashToken(token) {
    return createHash("sha256").update(token).digest("hex");
}

// Crea un refresh token, ne salva solo l'hash SHA-256 e restituisce il
// token in chiaro (unica occasione in cui il client lo vede).
// familyId: catena di sessione; i token ruotati condividono la famiglia,
// così un eventuale furto può revocare l'intera catena.
async function issueRefresh(tx, userId, familyId) {
    const token = jwt.sign(
        { sub: String(userId), jti: randomUUID(), type: "refresh" },
        env.jwt.secret,
        { expiresIn: env.jwt.refreshTtl },
    );
    await tx.refreshToken.create({
        data: {
            userId,
            tokenHash: hashToken(token),
            familyId,
            expiresAt: new Date(Date.now() + ttlToMs(env.jwt.refreshTtl)),
        },
    });
    return token;
}

// Emette la coppia access + refresh per un utente (nuova sessione = nuova
// famiglia). Se familyId è dato, il refresh appartiene a quella catena.
async function issuePair(tx, userId, familyId = randomUUID()) {
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    return { accessToken: signAccess(user), refreshToken: await issueRefresh(tx, userId, familyId) };
}

// Registra un nuovo utente e restituisce utente + coppia di token.
export async function register({ email, password, firstName, lastName }) {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
        // 409 con messaggio ambiguo: non conferma se l'email è già registrato
        // (user enumeration). 409 anche se soft-deleted: l'email resta UNIQUE
        // (vedi PLAN §3.3).
        throw new AppError(409, "Registrazione non riuscita: controlla i dati inseriti");
    }
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const user = await prisma.user.create({
        data: { email, passwordHash, firstName, lastName },
    });
    return { user: toSafeUser(user), tokens: await issuePair(prisma, user.id) };
}

// Verifica le credenziali e restituisce utente + coppia di token.
// Messaggio generico per non rivelare se l'email esiste.
export async function login({ email, password }) {
    const user = await prisma.user.findFirst({ where: withAlive({ email }) });
    // Confronto sempre con bcrypt (anche con l'hash cieco): il tempo di
    // risposta non distingue "email inesistente" da "password errata".
    const valid = await bcrypt.compare(password, user ? user.passwordHash : DUMMY_HASH);
    if (!user || !valid) {
        throw new AppError(401, "Credenziali non valide");
    }
    return { user: toSafeUser(user), tokens: await issuePair(prisma, user.id) };
}

// Ruota un refresh token: consumo singolo atomico + nuova coppia nella
// stessa famiglia. Se un token già consumato torna (riuso = probabile
// furto), l'intera famiglia viene revocata.
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
    const tokenHash = hashToken(refreshToken);
    const now = new Date();

    const outcome = await prisma.$transaction(async (tx) => {
        // Consumo condizionale: l'UPDATE con WHERE used_at IS NULL prende il
        // lock di riga, quindi due richieste concorrenti con lo stesso token
        // non possono passare entrambe (una sola vede count = 1).
        const consumed = await tx.refreshToken.updateMany({
            where: { tokenHash, usedAt: null, revokedAt: null, expiresAt: { gt: now } },
            data: { usedAt: now },
        });
        if (consumed.count === 1) {
            const stored = await tx.refreshToken.findUnique({ where: { tokenHash } });
            const user = await tx.user.findFirst({ where: withAlive({ id: stored.userId }) });
            if (!user) {
                return { status: "invalid" };
            }
            // Pulizia dei token scaduti dell'utente (tabella che non cresce).
            await tx.refreshToken.deleteMany({
                where: { userId: user.id, expiresAt: { lt: now } },
            });
            const tokens = await issuePair(tx, user.id, stored.familyId);
            return { status: "ok", user, tokens };
        }

        // Consumo fallito: il token non esiste, è scaduto, è revocato oppure
        // è già stato usato. Nel caso del riuso revoco la famiglia, così
        // l'eventuale ladro perde l'accesso anche con il token nuovo.
        const existing = await tx.refreshToken.findUnique({ where: { tokenHash } });
        if (existing && existing.usedAt && !existing.revokedAt) {
            // Riuso entro la finestra di tolleranza: richiesta duplicata
            // (due tab), non furto. La famiglia resta valida.
            if (now.getTime() - existing.usedAt.getTime() < REUSE_GRACE_MS) {
                return { status: "duplicate" };
            }
            // Riuso oltre la finestra: probabile furto -> revoca della famiglia.
            await tx.refreshToken.updateMany({
                where: { familyId: existing.familyId, revokedAt: null },
                data: { revokedAt: now },
            });
            return { status: "reuse" };
        }
        return { status: "invalid" };
    });

    if (outcome.status !== "ok") {
        // Stesso messaggio per tutti i casi: niente informazioni sul perché.
        throw new AppError(401, "Refresh token non valido o scaduto");
    }
    return { user: toSafeUser(outcome.user), tokens: outcome.tokens };
}

// Logout: revoca il refresh token presentato e tutta la sua famiglia
// (i token ruotati). Idempotente: se il token non esiste non fallisce.
export async function logout({ refreshToken }) {
    if (!refreshToken) {
        return { revoked: false };
    }
    const tokenHash = hashToken(refreshToken);
    const now = new Date();
    const stored = await prisma.refreshToken.findUnique({ where: { tokenHash } });
    if (!stored) {
        return { revoked: false };
    }
    await prisma.refreshToken.updateMany({
        where: { familyId: stored.familyId, revokedAt: null },
        data: { revokedAt: now },
    });
    return { revoked: true };
}

// Logout globale: revoca tutte le sessioni attive dell'utente.
export async function logoutAll(userId) {
    const result = await prisma.refreshToken.updateMany({
        where: { userId: BigInt(userId), revokedAt: null },
        data: { revokedAt: new Date() },
    });
    return { revoked: result.count };
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
