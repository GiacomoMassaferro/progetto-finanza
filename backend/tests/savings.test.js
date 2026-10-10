import { afterAll, describe, expect, test } from "vitest";
import { api, bearer, cleanupUser, registerUser, setupSuite, testEmail } from "./helpers.js";

// Obiettivi di risparmio: CRUD, versamento con auto-REACHED,
// isolamento, cestino e ripristino.

setupSuite();

let emailA;
let emailB;
let tokenA;
let tokenB;

async function setupUsers() {
    if (tokenA) {
        return;
    }
    emailA = testEmail("goal-a");
    emailB = testEmail("goal-b");
    tokenA = (await registerUser(emailA)).tokens.accessToken;
    tokenB = (await registerUser(emailB)).tokens.accessToken;
}

afterAll(async () => {
    await cleanupUser(emailA);
    await cleanupUser(emailB);
});

describe("obiettivi CRUD", () => {
    test("crea (201) con progress 0 e versa fino a REACHED", async () => {
        await setupUsers();
        const auth = bearer(tokenA);
        const created = await api
            .post("/api/v1/goals")
            .set(auth)
            .send({ name: "Emergenza", targetAmount: "1000.00" })
            .expect(201);
        expect(created.body.data.progressPct).toBe(0);
        const id = created.body.data.id;
        const after = await api.post(`/api/v1/goals/${id}/deposit`).set(auth).send({ amount: "1000.00" }).expect(200);
        expect(after.body.data.currentAmount).toBe("1000.00");
        expect(after.body.data.status).toBe("REACHED");
        expect(after.body.data.progressPct).toBe(100);
    });

    test("isolamento: B non vede i goal di A (404)", async () => {
        await setupUsers();
        const authA = bearer(tokenA);
        const authB = bearer(tokenB);
        const created = await api.post("/api/v1/goals").set(authA).send({ name: "Privato", targetAmount: "100.00" }).expect(201);
        await api.get(`/api/v1/goals/${created.body.data.id}`).set(authB).expect(404);
    });

    test("validazione 400 e cestino + ripristino", async () => {
        await setupUsers();
        const auth = bearer(tokenA);
        await api.post("/api/v1/goals").set(auth).send({ name: "X" }).expect(400);
        const created = await api.post("/api/v1/goals").set(auth).send({ name: "Temp", targetAmount: "50.00" }).expect(201);
        const id = created.body.data.id;
        await api.delete(`/api/v1/goals/${id}`).set(auth).expect(200);
        const trash = await api.get("/api/v1/goals/trash").set(auth).expect(200);
        expect(trash.body.data.some((g) => g.id === id)).toBe(true);
        const restored = await api.post(`/api/v1/goals/${id}/restore`).set(auth).expect(200);
        expect(restored.body.data.name).toBe("Temp");
    });
});
