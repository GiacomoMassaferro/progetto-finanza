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
                mode: "split",
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

    test("senza mode resta split (retrocompatibilità)", async () => {
        const auth = bearer(await setupUser());
        const res = await api
            .post("/api/v1/debts/with-installments")
            .set(auth)
            .send({
                creditorName: "Retro Test",
                debtType: "BNPL",
                totalAmount: "200.00",
                startDate: "2026-10-01",
                installments: 2,
                firstDueDate: "2026-11-05",
            })
            .expect(201);
        expect(res.body.data.payments).toHaveLength(2);
    });

    test("mode paid: 304/mese, 2 pagate + 2 rimanenti -> residuo 608", async () => {
        const auth = bearer(await setupUser());
        const res = await api
            .post("/api/v1/debts/with-installments")
            .set(auth)
            .send({
                mode: "paid",
                creditorName: "Auto Test",
                debtType: "PERSONAL_LOAN",
                installmentAmount: "304.00",
                paidCount: 2,
                remainingCount: 2,
                firstDueDate: "2026-08-05",
                startDate: "2026-08-01",
            })
            .expect(201);
        const debt = res.body.data;
        expect(debt.totalAmount).toBe("1216.00");
        expect(debt.remainingAmount).toBe("608.00");
        expect(debt.payments).toHaveLength(4);
        expect(debt.payments.filter((p) => p.status === "PAID")).toHaveLength(2);
        expect(debt.payments.filter((p) => p.status === "PENDING")).toHaveLength(2);
    });

    test("mode amortized: 10000 al 6% in 12 mesi -> rata ~860.66", async () => {
        const auth = bearer(await setupUser());
        const res = await api
            .post("/api/v1/debts/with-installments")
            .set(auth)
            .send({
                mode: "amortized",
                creditorName: "Mutuo Test",
                debtType: "PERSONAL_LOAN",
                financedAmount: "10000.00",
                annualRatePct: "6.00",
                durationMonths: 12,
                firstDueDate: "2026-11-01",
                startDate: "2026-10-01",
            })
            .expect(201);
        const debt = res.body.data;
        expect(debt.payments).toHaveLength(12);
        // Rata francese 10000 @6%/12 mesi = 860.66 (prime 11), ultima conguaglia.
        expect(debt.payments[0].amount).toBe("860.66");
        const total = debt.payments.reduce((s, p) => s + Number(p.amount), 0);
        expect(total).toBeGreaterThan(10300);
        expect(total).toBeLessThan(10400);
    });

    test("mode paid + categoria: transazioni storiche collegate alle pagate", async () => {
        const auth = bearer(await setupUser());
        const cat = await api.post("/api/v1/categories").set(auth).send({ name: "RateStorico", type: "EXPENSE" }).expect(201);
        const res = await api
            .post("/api/v1/debts/with-installments")
            .set(auth)
            .send({
                mode: "paid",
                creditorName: "Storico Test",
                debtType: "OTHER",
                installmentAmount: "50.00",
                paidCount: 2,
                remainingCount: 1,
                firstDueDate: "2026-08-05",
                startDate: "2026-08-01",
                movementsCategoryId: cat.body.data.id,
            })
            .expect(201);
        expect(res.body.data.payments).toHaveLength(3);
        // Le 2 pagate hanno transazione retrodatata collegata.
        const linked = await api.get("/api/v1/transactions?limit=100").set(auth).expect(200);
        const mine = linked.body.data.filter((t) => t.debtPaymentId && res.body.data.payments.some((p) => p.id === t.debtPaymentId));
        expect(mine).toHaveLength(2);
        expect(mine.every((t) => t.amount === "50.00")).toBe(true);
    });

    test("400 con rate fuori 1-60 o senza creditore", async () => {
        const auth = bearer(await setupUser());
        await api
            .post("/api/v1/debts/with-installments")
            .set(auth)
            .send({ creditorName: "X", debtType: "BNPL", totalAmount: "100.00", startDate: "2026-10-01", installments: 61, firstDueDate: "2026-11-05" })
            .expect(400);
    });

    test("mode paid senza categoria: nessuna transazione", async () => {
        const auth = bearer(await setupUser());
        const res = await api
            .post("/api/v1/debts/with-installments")
            .set(auth)
            .send({
                mode: "paid",
                creditorName: "Senza Storico",
                debtType: "OTHER",
                installmentAmount: "50.00",
                paidCount: 1,
                remainingCount: 1,
                firstDueDate: "2026-08-05",
                startDate: "2026-08-01",
            })
            .expect(201);
        expect(res.body.data.payments).toHaveLength(2);
        const linked = await api.get("/api/v1/transactions?limit=100").set(auth).expect(200);
        const debtIds = res.body.data.payments.map((p) => p.id);
        expect(linked.body.data.filter((t) => t.debtPaymentId && debtIds.includes(t.debtPaymentId))).toHaveLength(0);
    });

    test("401 senza token", async () => {
        await api.post("/api/v1/debts/with-installments").send({}).expect(401);
    });
});
