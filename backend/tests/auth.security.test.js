import { afterAll, describe, expect, test } from "vitest";
import { createHash } from "node:crypto";
import { api, bearer, cleanupUser, registerUser, setupSuite, testEmail } from "./helpers.js";
import { prisma } from "../src/config/prisma.js";

// Suite sicurezza auth: logout con revoca lato server, rotazione atomica del
// refresh token, rilevamento del riuso (furto) e revoca della famiglia.
// Ogni utente è usa-e-getta (email uniche); pulizia totale a fine test.

setupSuite();

const PASSWORD = "TestPass123";
const created = [];

// Registra un utente tracciato per la pulizia di fine file.
async function trackedUser(prefix) {
    const mail = testEmail(prefix);
    const result = await registerUser(mail);
    created.push(mail);
    return result;
}

afterAll(async () => {
    for (const mail of created) {
        await cleanupUser(mail);
    }
});

describe("POST /api/v1/auth/logout", () => {
    test("revoca lato server: il refresh token non rinnova più", async () => {
        const { tokens } = await trackedUser("sec-logout");
        await api
            .post("/api/v1/auth/logout")
            .set(bearer(tokens.accessToken))
            .send({ refreshToken: tokens.refreshToken })
            .expect(200);
        // Il token revocato non può più essere usato per rinnovare.
        await api.post("/api/v1/auth/refresh").send({ refreshToken: tokens.refreshToken }).expect(401);
    });

    test("richiede il token di accesso (401 senza)", async () => {
        const { tokens } = await trackedUser("sec-logout-noauth");
        await api.post("/api/v1/auth/logout").send({ refreshToken: tokens.refreshToken }).expect(401);
    });

    test("revoca anche i token ruotati della stessa sessione", async () => {
        const { tokens } = await trackedUser("sec-logout-family");
        const rotated = await api
            .post("/api/v1/auth/refresh")
            .send({ refreshToken: tokens.refreshToken })
            .expect(200);
        await api
            .post("/api/v1/auth/logout")
            .set(bearer(rotated.body.data.tokens.accessToken))
            .send({ refreshToken: rotated.body.data.tokens.refreshToken })
            .expect(200);
        // Il token ruotato appartiene alla stessa famiglia: revocato insieme.
        await api
            .post("/api/v1/auth/refresh")
            .send({ refreshToken: rotated.body.data.tokens.refreshToken })
            .expect(401);
    });
});

describe("POST /api/v1/auth/logout-all", () => {
    test("revoca tutte le sessioni dell'utente", async () => {
        const { user, tokens } = await trackedUser("sec-logout-all");
        // Seconda sessione: login da un altro dispositivo.
        const second = await api
            .post("/api/v1/auth/login")
            .set("x-auth-mode", "bearer")
            .send({ email: user.email, password: PASSWORD })
            .expect(200);
        await api
            .post("/api/v1/auth/logout-all")
            .set(bearer(tokens.accessToken))
            .expect(200);
        // Entrambe le sessioni sono chiuse.
        await api.post("/api/v1/auth/refresh").send({ refreshToken: tokens.refreshToken }).expect(401);
        await api
            .post("/api/v1/auth/refresh")
            .send({ refreshToken: second.body.data.tokens.refreshToken })
            .expect(401);
    });
});

describe("rotazione atomica del refresh token", () => {
    test("due richieste concorrenti: una sola riesce", async () => {
        const { tokens } = await trackedUser("sec-race");
        const results = await Promise.all([
            api.post("/api/v1/auth/refresh").send({ refreshToken: tokens.refreshToken }),
            api.post("/api/v1/auth/refresh").send({ refreshToken: tokens.refreshToken }),
        ]);
        const ok = results.filter((r) => r.status === 200);
        const ko = results.filter((r) => r.status === 401);
        expect(ok).toHaveLength(1);
        expect(ko).toHaveLength(1);
    });

    test("riuso entro la finestra di tolleranza: la sessione resta valida", async () => {
        const { tokens } = await trackedUser("sec-grace");
        const rotated = await api
            .post("/api/v1/auth/refresh")
            .send({ refreshToken: tokens.refreshToken })
            .expect(200);
        // Secondo tentativo immediato con lo stesso token: è una richiesta
        // duplicata, non un furto: la famiglia non viene revocata.
        await api.post("/api/v1/auth/refresh").send({ refreshToken: tokens.refreshToken }).expect(401);
        // Il token nuovo continua a funzionare.
        await api
            .post("/api/v1/auth/refresh")
            .send({ refreshToken: rotated.body.data.tokens.refreshToken })
            .expect(200);
    });

    test("riuso oltre la finestra (furto): la famiglia intera viene revocata", async () => {
        const { tokens } = await trackedUser("sec-theft");
        const rotated = await api
            .post("/api/v1/auth/refresh")
            .send({ refreshToken: tokens.refreshToken })
            .expect(200);
        const newToken = rotated.body.data.tokens.refreshToken;

        // Simula un furto: il token consumato "torna" molto dopo.
        const tokenHash = createHash("sha256").update(tokens.refreshToken).digest("hex");
        await prisma.refreshToken.update({
            where: { tokenHash },
            data: { usedAt: new Date(Date.now() - 10 * 60 * 1000) },
        });

        await api.post("/api/v1/auth/refresh").send({ refreshToken: tokens.refreshToken }).expect(401);
        // La famiglia è revocata: anche il token "legittimo" muore.
        await api.post("/api/v1/auth/refresh").send({ refreshToken: newToken }).expect(401);
    });
});

describe("enumerazione utenti e password", () => {
    test("registrazione duplicata: 409 con messaggio ambiguo", async () => {
        const { user } = await trackedUser("sec-dup");
        const res = await api
            .post("/api/v1/auth/register")
            .send({ email: user.email, password: PASSWORD })
            .expect(409);
        // Il messaggio non conferma che l'email esiste già.
        expect(res.body.error.message).not.toContain("già registrata");
    });

    test("login con email inesistente: stesso messaggio del login sbagliato", async () => {
        const res = await api
            .post("/api/v1/auth/login")
            .send({ email: "nessuno-questo@example.com", password: PASSWORD })
            .expect(401);
        expect(res.body.error.message).toBe("Credenziali non valide");
    });

    test("password oltre i 72 byte di bcrypt: 400", async () => {
        const mail = testEmail("sec-longpwd");
        created.push(mail);
        await api
            .post("/api/v1/auth/register")
            .send({ email: mail, password: "A".repeat(100) })
            .expect(400);
    });
});
