// Entry point: solo bootstrap (listen + shutdown).
// Tutta la configurazione Express vive in app.js per restare testabile.
import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { prisma } from "./config/prisma.js";

const app = createApp();

const server = app.listen(env.port, () => {
    // eslint-disable-next-line no-console
    console.log(`API in ascolto su http://localhost:${env.port} (${env.nodeEnv})`);
});

const shutdown = async (signal) => {
    // eslint-disable-next-line no-console
    console.log(`Ricevuto ${signal}, chiusura pulita...`);
    server.close(async () => {
        await prisma.$disconnect();
        process.exit(0);
    });
    // Se le connessioni restano appese, forza l'uscita dopo 10s.
    setTimeout(() => process.exit(1), 10_000).unref();
};

for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => shutdown(signal));
}
