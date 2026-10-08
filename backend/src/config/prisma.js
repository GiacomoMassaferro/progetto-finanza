// Singleton PrismaClient con adapter MariaDB (Prisma 7).
// Importare questo modulo ovunque serve il DB: la stessa istanza
// viene riusata (evita pool esauriti con --watch / hot reload).
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@prisma/client";
import { env } from "./env.js";

const adapter = new PrismaMariaDb({
    host: env.db.host,
    port: env.db.port,
    user: env.db.user,
    password: env.db.password,
    database: env.db.database,
    // Il connettore mariadb abilita SSL di default: verso un MySQL
    // locale senza certificati l'handshake si blocca fino al timeout.
    ssl: env.db.ssl ? true : false,
});

const globalForPrisma = globalThis;

export const prisma =
    globalForPrisma.__prisma ??
    new PrismaClient({
        adapter,
        log: env.isDev ? ["warn", "error"] : ["error"],
    });

if (env.isDev) {
    globalForPrisma.__prisma = prisma;
}
