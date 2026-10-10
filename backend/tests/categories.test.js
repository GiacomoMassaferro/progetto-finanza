import { afterAll, describe, expect, test } from "vitest";
import { api, bearer, cleanupUser, registerUser, setupSuite, testEmail } from "./helpers.js";

// Suite categorie: CRUD completo, isolamento tra utenti, validazione,
// soft delete con cestino e ripristino. Due utenti: A opera, B verifica i 404.

setupSuite();

let emailA;
let emailB;
let tokenA;
let tokenB;

async function setupUsers() {
    if (tokenA) {
        return;
    }
    emailA = testEmail("cat-a");
    emailB = testEmail("cat-b");
    tokenA = (await registerUser(emailA)).tokens.accessToken;
    tokenB = (await registerUser(emailB)).tokens.accessToken;
}

afterAll(async () => {
    await cleanupUser(emailA);
    await cleanupUser(emailB);
});

describe("categorie CRUD", () => {
    test("POST crea (201) e GET lista con meta", async () => {
        await setupUsers();
        const created = await api
            .post("/api/v1/categories")
            .set(bearer(tokenA))
            .send({ name: "Spesa", type: "EXPENSE", color: "#ff0000" })
            .expect(201);
        expect(created.body.data.id).toBeTypeOf("string");
        const list = await api.get("/api/v1/categories").set(bearer(tokenA)).expect(200);
        expect(list.body.meta.total).toBeGreaterThanOrEqual(1);
        expect(list.body.data[0].name).toBeTypeOf("string");
    });

    test("filtro ?type e validazione 400", async () => {
        await setupUsers();
        await api.post("/api/v1/categories").set(bearer(tokenA)).send({ name: "Stipendio", type: "INCOME" }).expect(201);
        const filtered = await api.get("/api/v1/categories?type=INCOME").set(bearer(tokenA)).expect(200);
        expect(filtered.body.data.every((c) => c.type === "INCOME")).toBe(true);
        await api.post("/api/v1/categories").set(bearer(tokenA)).send({ name: "X", type: "BOH" }).expect(400);
        await api.post("/api/v1/categories").set(bearer(tokenA)).send({ type: "EXPENSE" }).expect(400);
    });

    test("isolamento: B non vede né tocca le categorie di A (404)", async () => {
        await setupUsers();
        const created = await api
            .post("/api/v1/categories")
            .set(bearer(tokenA))
            .send({ name: "Privata", type: "EXPENSE" })
            .expect(201);
        await api.get(`/api/v1/categories/${created.body.data.id}`).set(bearer(tokenB)).expect(404);
        await api.patch(`/api/v1/categories/${created.body.data.id}`).set(bearer(tokenB)).send({ name: "Rubata" }).expect(404);
    });

    test("PATCH modifica e DELETE nasconde (soft delete)", async () => {
        await setupUsers();
        const created = await api
            .post("/api/v1/categories")
            .set(bearer(tokenA))
            .send({ name: "DaMod", type: "EXPENSE" })
            .expect(201);
        const id = created.body.data.id;
        const updated = await api.patch(`/api/v1/categories/${id}`).set(bearer(tokenA)).send({ name: "Modificata" }).expect(200);
        expect(updated.body.data.name).toBe("Modificata");
        await api.delete(`/api/v1/categories/${id}`).set(bearer(tokenA)).expect(200);
        await api.get(`/api/v1/categories/${id}`).set(bearer(tokenA)).expect(404);
    });

    test("cestino e ripristino", async () => {
        await setupUsers();
        const created = await api
            .post("/api/v1/categories")
            .set(bearer(tokenA))
            .send({ name: "Cestino", type: "EXPENSE" })
            .expect(201);
        const id = created.body.data.id;
        await api.delete(`/api/v1/categories/${id}`).set(bearer(tokenA)).expect(200);
        const trash = await api.get("/api/v1/categories/trash").set(bearer(tokenA)).expect(200);
        expect(trash.body.data.some((c) => c.id === id)).toBe(true);
        const restored = await api.post(`/api/v1/categories/${id}/restore`).set(bearer(tokenA)).expect(200);
        expect(restored.body.data.name).toBe("Cestino");
        await api.get(`/api/v1/categories/${id}`).set(bearer(tokenA)).expect(200);
    });

    test("401 senza token", async () => {
        await api.get("/api/v1/categories").expect(401);
    });
});
