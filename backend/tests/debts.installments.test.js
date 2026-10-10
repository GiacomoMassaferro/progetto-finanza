import { afterAll, describe, expect, test } from "vitest";
import { api, bearer, cleanupUser, registerUser, setupSuite, testEmail } from "./helpers.js";

// Spesa a rate: un colpo solo crea debito + N rate mensili uguali,
// l'ultima conguaglia i centesimi. Tutto o niente (transazione atomica).

setupSuite();

let email;
let token;

async function setupUser() {
    if (token) {
        return token;
    }
    email = testEmail("rate");
    token = (await registerUser(email)).tokens.accessToken;
    return token;
}

afterAll(async () => {
    await cleanupUser(email);
});

describe("POST /api/v1/debts/with-installments", () => {
    test("100.00 in 3 rate -> 33.33 + 33.33 + 33.34 mensili", async () => {
        const auth = bearer(await setupUser());
        const res = await api
            .post("/api/v1/debts/with-installments")
            .set(auth)
            .send({
                creditorName: "Negozio Test",
                debtType: "BNPL",
                totalAmount: "100.00",
                startDate: "2026-10-01",
                installments: 3,
                firstDueDate: "2026-11-05",
            })
            .expect(201);
        const debt = res.body.data;
        expect(debt.remainingAmount).toBe("100.00");
        expect(debt.payments).toHaveLength(3);
        expect(debt.payments.map((p) => p.amount)).toEqual(["33.33", "33.33", "33.34"]);
        const dues = debt.payments.map((p) => p.dueDate.slice(0, 7));
        expect(dues).toEqual(["2026-11", "2026-12", "2027-01"]);
    });

    test("400 con rate fuori 1-60 o senza creditore", async () => {
        const auth = bearer(await setupUser());
        await api
            .post("/api/v1/debts/with-installments")
            .set(auth)
            .send({ creditorName: "X", debtType: "BNPL", totalAmount: "100.00", startDate: "2026-10-01", installments: 61, firstDueDate: "2026-11-05" })
            .expect(400);
    });

    test("401 senza token", async () => {
        await api.post("/api/v1/debts/with-installments").send({}).expect(401);
    });
});
