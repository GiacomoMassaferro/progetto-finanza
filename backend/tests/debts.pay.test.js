import { afterAll, describe, expect, test } from "vitest";
import { api, bearer, cleanupUser, registerUser, setupSuite, testEmail } from "./helpers.js";

// Suite sul flusso di maggior valore: creare un debito, rateizzarlo e
// pagarlo fino a estinzione automatica (PAID_OFF) con transazioni collegate.

setupSuite();

let email;
let token;

async function setupUser() {
    if (token) {
        return token;
    }
    email = testEmail("pay");
    token = (await registerUser(email)).tokens.accessToken;
    return token;
}

afterAll(async () => {
    await cleanupUser(email);
});

describe("pay con estinzione automatica", () => {
    test("paga le rate fino a PAID_OFF con transazioni collegate", async () => {
        const auth = bearer(await setupUser());

        const category = (
            await api.post("/api/v1/categories").set(auth).send({ name: "Rate", type: "EXPENSE" }).expect(201)
        ).body.data;

        const debt = (
            await api
                .post("/api/v1/debts")
                .set(auth)
                .send({ creditorName: "Scalapay", debtType: "BNPL", totalAmount: 300, monthlyPayment: 100, startDate: "2026-09-01" })
                .expect(201)
        ).body.data;
        expect(debt.remainingAmount).toBe("300.00");

        const pay1 = (
            await api.post(`/api/v1/debts/${debt.id}/payments`).set(auth).send({ amount: 100, dueDate: "2026-10-05" }).expect(201)
        ).body.data;
        const pay2 = (
            await api.post(`/api/v1/debts/${debt.id}/payments`).set(auth).send({ amount: 100, dueDate: "2026-11-05" }).expect(201)
        ).body.data;

        const first = (
            await api.post(`/api/v1/debts/${debt.id}/payments/${pay1.id}/pay`).set(auth).send({ movementsCategoryId: category.id }).expect(200)
        ).body.data;
        expect(first.payment.status).toBe("PAID");
        expect(first.transaction.amount).toBe("100.00");
        expect(first.debt.remainingAmount).toBe("200.00");
        expect(first.debt.status).toBe("ACTIVE");

        // Doppio pagamento della stessa rata: conflitto.
        await api.post(`/api/v1/debts/${debt.id}/payments/${pay1.id}/pay`).set(auth).send({ movementsCategoryId: category.id }).expect(409);

        // Saldo finale con importo maggiorato: estingue il debito da solo.
        const last = (
            await api
                .post(`/api/v1/debts/${debt.id}/payments/${pay2.id}/pay`)
                .set(auth)
                .send({ movementsCategoryId: category.id, amount: 200 })
                .expect(200)
        ).body.data;
        expect(last.debt.remainingAmount).toBe("0.00");
        expect(last.debt.status).toBe("PAID_OFF");

        // Le due transazioni generate risultano nel registro.
        const linked = await api.get(`/api/v1/transactions?categoryId=${category.id}`).set(auth).expect(200);
        expect(linked.body.meta.total).toBe(2);
    });
});
