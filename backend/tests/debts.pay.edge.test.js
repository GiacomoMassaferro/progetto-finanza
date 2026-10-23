import { afterAll, describe, expect, test } from "vitest";
import { api, bearer, cleanupUser, registerUser, setupSuite, testEmail } from "./helpers.js";

// Casi limite del pagamento di una rata: parziale, eccedenza e concorrenza.
// Prima questi casi perdevano denaro o doppiavano i movimenti.

setupSuite();

const emails = [];

async function newUser(prefix) {
    const email = testEmail(prefix);
    emails.push(email);
    const { tokens } = await registerUser(email);
    return bearer(tokens.accessToken);
}

// Crea un debito con N rate da 100 e restituisce { auth, debt, rates, category }.
async function scenarioWithRates(prefix, rateCount = 2) {
    const auth = await newUser(prefix);
    const category = (
        await api.post("/api/v1/categories").set(auth).send({ name: "Rate", type: "EXPENSE" }).expect(201)
    ).body.data;
    const debt = (
        await api
            .post("/api/v1/debts")
            .set(auth)
            .send({
                creditorName: "Edge",
                debtType: "BNPL",
                totalAmount: 100 * rateCount,
                monthlyPayment: 100,
                startDate: "2026-09-01",
            })
            .expect(201)
    ).body.data;
    const rates = [];
    for (let i = 0; i < rateCount; i++) {
        const due = `2026-${String(10 + i).padStart(2, "0")}-05`;
        rates.push(
            (await api.post(`/api/v1/debts/${debt.id}/payments`).set(auth).send({ amount: 100, dueDate: due }).expect(201)).body.data,
        );
    }
    return { auth, debt, rates, category };
}

afterAll(async () => {
    for (const email of emails) {
        await cleanupUser(email);
    }
});

describe("pagamento parziale (C4)", () => {
    test("la rata resta aperta con l'importo residuo e il debito scala", async () => {
        const { auth, debt, rates, category } = await scenarioWithRates("parziale");

        const res = (
            await api
                .post(`/api/v1/debts/${debt.id}/payments/${rates[0].id}/pay`)
                .set(auth)
                .send({ movementsCategoryId: category.id, amount: 30 })
                .expect(200)
        ).body.data;

        // La rata non e' estinta: restano 70 da versare.
        expect(res.payment.status).toBe("PENDING");
        expect(res.payment.amount).toBe("70.00");
        // Il debito scala solo di quanto versato (200 -> 170).
        expect(res.debt.remainingAmount).toBe("170.00");
        expect(res.debt.status).toBe("ACTIVE");
        // La transazione registra l'importo realmente versato.
        expect(res.transaction.amount).toBe("30.00");

        // Il piano resta coerente: rate aperte 70 + 100 = 170 = residuo.
        const open = res.debt.payments.filter((p) => p.status !== "PAID").map((p) => p.amount);
        expect(open.reduce((s, a) => s + Number(a), 0)).toBe(170);

        // Completando la rata, questa si chiude e il debito scala ancora.
        const done = (
            await api
                .post(`/api/v1/debts/${debt.id}/payments/${rates[0].id}/pay`)
                .set(auth)
                .send({ movementsCategoryId: category.id, amount: 70 })
                .expect(200)
        ).body.data;
        expect(done.payment.status).toBe("PAID");
        expect(done.debt.remainingAmount).toBe("100.00");
    });
});

describe("eccedenza e tetto sul residuo (C4)", () => {
    test("non si puo' pagare piu' del residuo del debito", async () => {
        const { auth, debt, rates, category } = await scenarioWithRates("tetto");
        const res = await api
            .post(`/api/v1/debts/${debt.id}/payments/${rates[0].id}/pay`)
            .set(auth)
            .send({ movementsCategoryId: category.id, amount: 500 })
            .expect(400);
        expect(res.body.error.message).toMatch(/residuo/i);
    });

    test("l'eccedenza sulle rate successive riduce le rate aperte", async () => {
        const { auth, debt, rates, category } = await scenarioWithRates("eccedenza");
        const res = (
            await api
                .post(`/api/v1/debts/${debt.id}/payments/${rates[0].id}/pay`)
                .set(auth)
                .send({ movementsCategoryId: category.id, amount: 150 })
                .expect(200)
        ).body.data;

        expect(res.payment.status).toBe("PAID");
        expect(res.payment.amount).toBe("100.00");
        // I 50 in piu' sono andati a scalare la seconda rata.
        const second = res.debt.payments.find((p) => p.id === rates[1].id);
        expect(second.amount).toBe("50.00");
        expect(second.status).toBe("PENDING");
        expect(res.debt.remainingAmount).toBe("50.00");
        // La transazione registra quanto versato, non quanto dovuto.
        expect(res.transaction.amount).toBe("150.00");
    });
});

describe("concorrenza (C2)", () => {
    test("due pagamenti simultanei della stessa rata: uno solo va a buon fine", async () => {
        const { auth, debt, rates, category } = await scenarioWithRates("concorrenza");
        const pay = () =>
            api
                .post(`/api/v1/debts/${debt.id}/payments/${rates[0].id}/pay`)
                .set(auth)
                .send({ movementsCategoryId: category.id, amount: 100 });
        const [a, b] = await Promise.all([pay(), pay()]);
        const ok = [a, b].filter((r) => r.status === 200);
        const ko = [a, b].filter((r) => r.status !== 200);
        expect(ok).toHaveLength(1);
        expect(ko).toHaveLength(1);
        expect(ko[0].status).toBe(409);

        // Nessun doppio movimento: una sola transazione da 100.
        const txs = await api.get("/api/v1/transactions").set(auth).expect(200);
        expect(txs.body.meta.total).toBe(1);
        expect(txs.body.data[0].amount).toBe("100.00");
        // Il residuo e' sceso di 100, non di 200.
        const after = await api.get(`/api/v1/debts/${debt.id}`).set(auth).expect(200);
        expect(after.body.data.remainingAmount).toBe("100.00");
    });

    test("due pagamenti simultanei su rate diverse non perdono il residuo", async () => {
        const { auth, debt, rates, category } = await scenarioWithRates("concorrenza2");
        const pay = (rateId) =>
            api
                .post(`/api/v1/debts/${debt.id}/payments/${rateId}/pay`)
                .set(auth)
                .send({ movementsCategoryId: category.id, amount: 100 });
        const [a, b] = await Promise.all([pay(rates[0].id), pay(rates[1].id)]);
        expect([a.status, b.status].sort()).toEqual([200, 200]);

        // Totale movimentato = 200, residuo = 0: nessun update perso.
        const txs = await api.get("/api/v1/transactions").set(auth).expect(200);
        expect(txs.body.meta.total).toBe(2);
        const sum = txs.body.data.reduce((s, t) => s + Number(t.amount), 0);
        expect(sum).toBe(200);
        const after = await api.get(`/api/v1/debts/${debt.id}`).set(auth).expect(200);
        expect(after.body.data.remainingAmount).toBe("0.00");
        expect(after.body.data.status).toBe("PAID_OFF");
    });
});

describe("depositi concorrenti (C2)", () => {
    test("due depositi simultanei non sovrascrivono l'accantonato", async () => {
        const auth = await newUser("deposito");
        const goal = (
            await api.post("/api/v1/goals").set(auth).send({ name: "Fondo", targetAmount: "1000.00" }).expect(201)
        ).body.data;
        const deposit = () => api.post(`/api/v1/goals/${goal.id}/deposit`).set(auth).send({ amount: "50.00" });
        const [a, b] = await Promise.all([deposit(), deposit()]);
        expect([a.status, b.status].every((s) => s === 200)).toBe(true);

        const after = await api.get(`/api/v1/goals/${goal.id}`).set(auth).expect(200);
        expect(after.body.data.currentAmount).toBe("100.00");
    });
});
