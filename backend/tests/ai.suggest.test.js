import { afterAll, describe, expect, test } from "vitest";
import { prisma } from "../src/config/prisma.js";
import { api, bearer, cleanupUser, registerUser, setupSuite, testEmail } from "./helpers.js";

// Endpoint IA: suggerimento payoff su dati veri (qui utente senza debiti),
// protezione auth e validazione input.

setupSuite();

let email;
let token;

async function setupUser() {
    if (token) {
        return token;
    }
    email = testEmail("ai");
    token = (await registerUser(email)).tokens.accessToken;
    return token;
}

afterAll(async () => {
    await cleanupUser(email);
});

describe("POST /api/v1/ai/suggest", () => {
    test("payoff senza debiti: piano vuoto valido", async () => {
        const auth = bearer(await setupUser());
        const res = await api.post("/api/v1/ai/suggest").set(auth).send({ intent: "payoff", locale: "it" }).expect(200);
        expect(res.body.data.intent).toBe("payoff");
        expect(res.body.data.engine).toBe("rules-avalanche");
        expect(res.body.data.items).toEqual([]);
        expect(res.body.data.snapshot.availableNowCents).toBe(0);
    });

    test("401 senza token", async () => {
        await api.post("/api/v1/ai/suggest").send({ intent: "payoff" }).expect(401);
    });

    test("400 con intento ignoto", async () => {
        const auth = bearer(await setupUser());
        await api.post("/api/v1/ai/suggest").set(auth).send({ intent: "taxi" }).expect(400);
    });

    test("taeg nel piano e risparmi nello snapshot", async () => {
        const mail = testEmail("ai-goal");
        const { user, tokens } = await registerUser(mail);
        const auth = bearer(tokens.accessToken);
        await prisma.debt.create({
            data: {
                userId: BigInt(user.id),
                creditorName: "Banca Test",
                debtType: "PERSONAL_LOAN",
                totalAmount: "1000.00",
                remainingAmount: "1000.00",
                interestRate: "1.00",
                tan: "2.00",
                taeg: "12.00",
                monthlyPayment: "100.00",
                startDate: new Date(),
            },
        });
        await prisma.savingsGoal.create({
            data: { userId: BigInt(user.id), name: "Emergenza", targetAmount: "5000.00", currentAmount: "450.00" },
        });
        const res = await api.post("/api/v1/ai/suggest").set(auth).send({ intent: "payoff", locale: "it" }).expect(200);
        // TAEG registrato e risparmi confluiti nello snapshot per l'LLM futuro.
        expect(res.body.data.snapshot.savingsTotalCents).toBe(45000);
        expect(res.body.data.items).toHaveLength(1);
        expect(res.body.data.items[0].amount).toBe("1000.00");
        await cleanupUser(mail);
    });
});
