// Carica le variabili definite nel file .env prima della configurazione Prisma.
import "dotenv/config";

// Importa gli strumenti di configurazione messi a disposizione da Prisma CLI.
import { defineConfig, env } from "prisma/config";

// Esporta la configurazione usata dai comandi della CLI Prisma.
export default defineConfig({
    // Indica dove si trova il file dello schema Prisma.
    schema: "prisma/schema.prisma",

    // Indica la cartella in cui Prisma salverà le migration SQL.
    migrations: {
        path: "prisma/migrations"
    },

    // Configura il datasource usato dalla CLI.
    // In Prisma 7 la URL viene definita qui e non nel file schema.prisma.
    datasource: {
        // Database del progetto, usato da migrate, studio e introspezione.
        url: env("DATABASE_URL"),

        // Database di appoggio che la CLI usa per ricalcolare le migration.
        // Deve esistere già ed essere vuoto: Prisma lo svuota a ogni `migrate dev`.
        shadowDatabaseUrl: env("SHADOW_DATABASE_URL")
    }
});