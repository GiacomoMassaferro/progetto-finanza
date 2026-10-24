import request from "supertest";
import { afterAll, beforeAll } from "vitest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/config/prisma.js";

// App di test: stesso codice della produzione, senza aprire porte.
// I test girano contro il MySQL reale con utenti usa-e-getta
// (email uniche `test-*`), ripuliti alla fine di ogni file.

// Istanza condivisa: createApp è senza stato, il DB fa da isolamento.
export let api;

// Avvia app e connessione una volta per file di test.
export function setupSuite() {
    beforeAll(() => {
        api = request(createApp());
    });
    afterAll(async () => {
        await prisma.$disconnect();
    });
}

// Email unica per isolamento tra run (anche se una pulizia fallisce).
export const testEmail = (prefix) => `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;

// Registra un utente e restituisce { user, tokens }.
// `x-auth-mode: bearer` tiene il contratto storico (token nel body, niente
// cookie): le suite esistenti non cambiano con l'introduzione del cookie mode.
export async function registerUser(email) {
    const res = await api
        .post("/api/v1/auth/register")
        .set("x-auth-mode", "bearer")
        .send({ email, password: "TestPass123" })
        .expect(201);
    return res.body.data;
}

// Header Authorization pronto all'uso.
export const bearer = (accessToken) => ({ Authorization: `Bearer ${accessToken}` });

// Pulizia totale dell'utente nell'ordine I-06 (Restrict obbliga la sequenza).
export async function cleanupUser(email) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
        return;
    }
    await prisma.transaction.deleteMany({ where: { userId: user.id } });
    await prisma.debtPayment.deleteMany({ where: { debt: { userId: user.id } } });
    await prisma.debt.deleteMany({ where: { userId: user.id } });
    await prisma.savingsGoal.deleteMany({ where: { userId: user.id } });
    await prisma.movementsCategory.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
}
