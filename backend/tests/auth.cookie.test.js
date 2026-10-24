// Suite della modalità cookie (D-28): il browser riceve il refresh token
// solo in un cookie HttpOnly, l'access token nel body (da tenere in memoria).
// I test usano un agent supertest, che conserva e rimanda i cookie come un browser.
import request from "supertest";
import { afterAll, describe, expect, test } from "vitest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/config/prisma.js";
import { bearer, cleanupUser, registerUser, setupSuite, testEmail } from "./helpers.js";

setupSuite();

const PASSWORD = "TestPass123";
const emails = [];

// Registra un utente in modalità bearer (solo per creare l'account).
async function makeUser(prefix) {
    const email = testEmail(prefix);
    emails.push(email);
    await registerUser(email);
    return email;
}

// Estrae il valore di un cookie dai Set-Cookie della risposta.
function cookieValue(res, name) {
    const lines = res.headers["set-cookie"] ?? [];
    const line = lines.find((c) => c.startsWith(`${name}=`));
    return line ? line.slice(name.length + 1).split(";")[0] : null;
}

// Riga intera di un cookie (per verificare gli attributi).
function cookieLine(res, name) {
    const lines = res.headers["set-cookie"] ?? [];
    return lines.find((c) => c.startsWith(`${name}=`)) ?? "";
}

// Login in modalità cookie: l'agent memorizza i due cookie (refresh + csrf).
async function cookieLogin(email, password = PASSWORD) {
    const agent = request.agent(createApp());
    const res = await agent.post("/api/v1/auth/login").send({ email, password }).expect(200);
    return { agent, res, csrf: cookieValue(res, "pf_csrf") };
}

afterAll(async () => {
    for (const email of emails) {
        await cleanupUser(email);
    }
});

describe("login/register in modalità cookie", () => {
    test("risponde con access token nel body e refresh solo nel cookie HttpOnly", async () => {
        const email = await makeUser("cookie-login");
        const { res } = await cookieLogin(email);

        // In cookie mode la coppia non esce mai nel body: niente XSS via JSON.
        expect(res.body.data.tokens).toBeUndefined();
        expect(res.body.data.accessToken).toBeTypeOf("string");
        expect(res.body.data.expiresIn).toBeGreaterThan(0);

        const refresh = cookieLine(res, "pf_refresh");
        expect(refresh).toMatch(/pf_refresh=.+/);
        expect(refresh).toMatch(/HttpOnly/i);
        expect(refresh).toMatch(/SameSite=Lax/i);
        expect(refresh).toMatch(/Path=\/api\/v1\/auth/);
        // In sviluppo/test il cookie non è Secure (niente HTTPS in locale).
        expect(refresh).not.toMatch(/Secure/i);

        // Il CSRF cookie deve essere leggibile da JS (niente HttpOnly).
        const csrf = cookieLine(res, "pf_csrf");
        expect(csrf).toMatch(/pf_csrf=.+/);
        expect(csrf).not.toMatch(/HttpOnly/i);
    });

    test("l'access token ottenuto dal body funziona sulle rotte protette", async () => {
        const email = await makeUser("cookie-me");
        const { res } = await cookieLogin(email);
        const me = await request(createApp())
            .get("/api/v1/auth/me")
            .set(bearer(res.body.data.accessToken))
            .expect(200);
        expect(me.body.data.user.email).toBe(email);
    });

    test("modalità bearer esplicita: token nel body, nessun cookie", async () => {
        const email = await makeUser("cookie-bearer");
        const res = await request(createApp())
            .post("/api/v1/auth/login")
            .set("x-auth-mode", "bearer")
            .send({ email, password: PASSWORD })
            .expect(200);
        expect(res.body.data.tokens.refreshToken).toBeTypeOf("string");
        expect(res.headers["set-cookie"]).toBeUndefined();
    });
});

describe("POST /api/v1/auth/refresh in modalità cookie", () => {
    test("401 senza cookie e senza body", async () => {
        await request(createApp()).post("/api/v1/auth/refresh").expect(401);
    });

    test("403 se manca l'header CSRF (cookie inviato da un sito terzo)", async () => {
        const email = await makeUser("cookie-csrf-missing");
        const { agent } = await cookieLogin(email);
        const res = await agent.post("/api/v1/auth/refresh").expect(403);
        expect(res.body.error.message).toMatch(/non autorizzata/i);
    });

    test("403 se l'header CSRF non combacia col cookie", async () => {
        const email = await makeUser("cookie-csrf-wrong");
        const { agent } = await cookieLogin(email);
        await agent.post("/api/v1/auth/refresh").set("x-csrf-token", "valore-sbagliato").expect(403);
    });

    test("ruota il cookie e restituisce solo l'access token", async () => {
        const email = await makeUser("cookie-rotate");
        const { agent, res: loginRes, csrf } = await cookieLogin(email);
        const oldRefresh = cookieValue(loginRes, "pf_refresh");

        const rotated = await agent.post("/api/v1/auth/refresh").set("x-csrf-token", csrf).expect(200);
        expect(rotated.body.data.accessToken).toBeTypeOf("string");
        expect(rotated.body.data.tokens).toBeUndefined();
        expect(rotated.body.data.user.email).toBe(email);

        const newRefresh = cookieValue(rotated, "pf_refresh");
        expect(newRefresh).toBeTruthy();
        expect(newRefresh).not.toBe(oldRefresh);
        // Anche il CSRF viene riemesso a ogni rotazione.
        expect(cookieValue(rotated, "pf_csrf")).not.toBe(csrf);
    });

    test("il token ruotato funziona sulle rotte protette", async () => {
        const email = await makeUser("cookie-rotate-me");
        const { agent, csrf } = await cookieLogin(email);
        const rotated = await agent.post("/api/v1/auth/refresh").set("x-csrf-token", csrf).expect(200);
        const me = await request(createApp())
            .get("/api/v1/auth/me")
            .set(bearer(rotated.body.data.accessToken))
            .expect(200);
        expect(me.body.data.user.email).toBe(email);
    });

    test("il vecchio cookie, riusato subito, non rinnova più (uso singolo)", async () => {
        const email = await makeUser("cookie-reuse");
        const { agent, res: loginRes, csrf } = await cookieLogin(email);
        const oldRefresh = cookieValue(loginRes, "pf_refresh");

        await agent.post("/api/v1/auth/refresh").set("x-csrf-token", csrf).expect(200);

        // Richiesta esplicita col vecchio token: 401 (entro la grace window
        // non revoca la famiglia, quindi la sessione nuova resta valida).
        await request(createApp())
            .post("/api/v1/auth/refresh")
            .set("Cookie", `pf_refresh=${oldRefresh}; pf_csrf=${csrf}`)
            .set("x-csrf-token", csrf)
            .expect(401);
    });
});

describe("POST /api/v1/auth/logout in modalità cookie", () => {
    test("revoca la sessione, cancella i cookie e blocca il refresh", async () => {
        const email = await makeUser("cookie-logout");
        const { agent, res: loginRes, csrf } = await cookieLogin(email);
        const accessToken = loginRes.body.data.accessToken;
        const refreshToken = cookieValue(loginRes, "pf_refresh");

        const out = await agent
            .post("/api/v1/auth/logout")
            .set("Authorization", `Bearer ${accessToken}`)
            .set("x-csrf-token", csrf)
            .expect(200);
        expect(out.body.data.revoked).toBe(true);
        // I cookie vengono scaduti (Expires nel 1970) con lo stesso path.
        expect(cookieLine(out, "pf_refresh")).toMatch(/Expires=Thu, 01 Jan 1970/);

        // Il token revocato non rinnova più, nemmeno se presentato a mano.
        await request(createApp())
            .post("/api/v1/auth/refresh")
            .set("Cookie", `pf_refresh=${refreshToken}; pf_csrf=${csrf}`)
            .set("x-csrf-token", csrf)
            .expect(401);
    });

    test("403 senza header CSRF", async () => {
        const email = await makeUser("cookie-logout-csrf");
        const { agent, res } = await cookieLogin(email);
        await agent
            .post("/api/v1/auth/logout")
            .set("Authorization", `Bearer ${res.body.data.accessToken}`)
            .expect(403);
    });
});
