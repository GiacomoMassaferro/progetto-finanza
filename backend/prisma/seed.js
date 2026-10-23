// Seed dimostrativo: utente demo + categorie + transazioni + debito con rate.
// Idempotente: se l'utente demo esiste già, non fa niente.
// Esecuzione: pnpm db:seed → credenziali demo@example.com / DemoPass123.
import bcrypt from "bcryptjs";
import { env } from "../src/config/env.js";
import { prisma } from "../src/config/prisma.js";

const DEMO_EMAIL = "demo@example.com";

async function main() {
    // Il seed crea un utente con password nota: in produzione sarebbe una
    // porta di servizio aperta. Si può forzare solo con un flag esplicito.
    if (!env.isDev && !env.seedAllowProduction) {
        throw new Error(
            "Seed disabilitato in produzione: crea un utente demo con password nota. " +
                "Se serve davvero: SEED_ALLOW_PRODUCTION=1 pnpm db:seed",
        );
    }

    const existing = await prisma.user.findUnique({ where: { email: DEMO_EMAIL } });
    if (existing) {
        console.log(`Seed saltato: ${DEMO_EMAIL} esiste già.`);
        return;
    }

    // Utente demo con password hashata come in registrazione.
    const user = await prisma.user.create({
        data: {
            email: DEMO_EMAIL,
            passwordHash: await bcrypt.hash("DemoPass123", 10),
            firstName: "Demo",
            lastName: "User",
        },
    });

    // Categorie di esempio (spese + una entrata).
    const [spesa, casa, stipendio] = await Promise.all(
        [
            { name: "Spesa", type: "EXPENSE", color: "#22c55e" },
            { name: "Casa", type: "EXPENSE", color: "#3b82f6" },
            { name: "Stipendio", type: "INCOME", color: "#a855f7" },
        ].map((c) => prisma.movementsCategory.create({ data: { ...c, userId: user.id } })),
    );

    // Movimenti del mese corrente.
    const day = (d) => {
        const now = new Date();
        return new Date(now.getFullYear(), now.getMonth(), d);
    };
    await prisma.transaction.createMany({
        data: [
            { userId: user.id, movementsCategoryId: stipendio.id, amount: "2200.00", type: "INCOME", description: "Stipendio", transactionDate: day(1) },
            { userId: user.id, movementsCategoryId: spesa.id, amount: "85.40", type: "EXPENSE", description: "Supermercato", transactionDate: day(3) },
            { userId: user.id, movementsCategoryId: casa.id, amount: "650.00", type: "EXPENSE", description: "Affitto", transactionDate: day(5) },
        ],
    });

    // Debito BNPL di esempio con 3 rate: una pagata (con transazione
    // collegata), una in scadenza, una futura.
    const debt = await prisma.debt.create({
        data: {
            userId: user.id,
            creditorName: "Negozio Demo",
            debtType: "BNPL",
            totalAmount: "300.00",
            remainingAmount: "200.00",
            monthlyPayment: "100.00",
            dueDayOfMonth: 5,
            startDate: day(1),
        },
    });
    const paid = await prisma.debtPayment.create({
        data: { debtId: debt.id, amount: "100.00", dueDate: day(5), paidDate: day(5), status: "PAID" },
    });
    await prisma.transaction.create({
        data: {
            userId: user.id,
            movementsCategoryId: spesa.id,
            debtPaymentId: paid.id,
            amount: "100.00",
            type: "EXPENSE",
            description: "Pagamento rata Negozio Demo",
            transactionDate: day(5),
        },
    });
    await prisma.debtPayment.createMany({
        data: [
            { debtId: debt.id, amount: "100.00", dueDate: new Date(Date.now() + 10 * 86_400_000) },
            { debtId: debt.id, amount: "100.00", dueDate: new Date(Date.now() + 40 * 86_400_000) },
        ],
    });

    console.log(`Seed completato: ${DEMO_EMAIL} / DemoPass123`);
}

try {
    await main();
} finally {
    await prisma.$disconnect();
}
