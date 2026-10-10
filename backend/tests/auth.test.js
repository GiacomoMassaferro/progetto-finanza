import { afterAll, describe, expect, test } from "vitest";
import { api, bearer, cleanupUser, registerUser, setupSuite, testEmail } from "./helpers.js";

// Suite auth: registrazione, login, profilo e rotazione refresh.
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

describe("POST /api/v1/auth/register", () => {
    test("201 con utente e token (senza passwordHash)", async () => {
        const { user, tokens } = await trackedUser("auth-reg");
        expect(user.email).toContain("@example.com");
        expect(user.passwordHash).toBeUndefined();
        expect(tokens.accessToken).toBeTypeOf("string");
        expect(tokens.refreshToken).toBeTypeOf("string");
    });

    test("409 se email duplicata", async () => {
        const { user } = await trackedUser("auth-dup");
        await api.post("/api/v1/auth/register").send({ email: user.email, password: PASSWORD }).expect(409);
    });

    test("400 con email e password invalide (formato zod)", async () => {
        const res = await api
            .post("/api/v1/auth/register")
            .send({ email: "non-email", password: "123" })
            .expect(400);
        expect(res.body.error.details.length).toBeGreaterThan(0);
    });
});

describe("POST /api/v1/auth/login", () => {
    test("200 con credenziali giuste", async () => {
        const { user } = await trackedUser("auth-login");
        const res = await api.post("/api/v1/auth/login").send({ email: user.email, password: PASSWORD }).expect(200);
        expect(res.body.data.user.email).toBe(user.email);
    });

    test("401 con password sbagliata (messaggio generico)", async () => {
        const { user } = await trackedUser("auth-bad");
        const res = await api
            .post("/api/v1/auth/login")
            .send({ email: user.email, password: "Sbagliata123" })
            .expect(401);
        expect(res.body.error.message).toBe("Credenziali non valide");
    });
});

describe("GET /api/v1/auth/me", () => {
    test("200 col token, 401 senza e 401 col token falso", async () => {
        const { user, tokens } = await trackedUser("auth-me");
        const me = await api.get("/api/v1/auth/me").set(bearer(tokens.accessToken)).expect(200);
        expect(me.body.data.user.email).toBe(user.email);
        await api.get("/api/v1/auth/me").expect(401);
        await api.get("/api/v1/auth/me").set(bearer("falso")).expect(401);
    });
});

describe("POST /api/v1/auth/refresh", () => {
    test("ruota i token e invalida quello vecchio (uso singolo)", async () => {
        const { tokens } = await trackedUser("auth-ref");
        const rotated = await api
            .post("/api/v1/auth/refresh")
            .send({ refreshToken: tokens.refreshToken })
            .expect(200);
        expect(rotated.body.data.tokens.accessToken).toBeTypeOf("string");
        // Riuso del vecchio refresh: deve fallire.
        await api.post("/api/v1/auth/refresh").send({ refreshToken: tokens.refreshToken }).expect(401);
    });
});
