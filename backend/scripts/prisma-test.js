// Wrapper per eseguire la Prisma CLI contro i database di test.
//
// Perché esiste: `prisma migrate dev|reset` distrugge e ricrea lo schema del
// database puntato da DATABASE_URL. Qui carichiamo prima .env e poi .env.test
// (che vince) e blocchiamo l'esecuzione se le URL non puntano a database il
// cui nome termina con "_test", così un errore di battitura non può cancellare
// express_finance.
//
// Uso: node scripts/prisma-test.js migrate dev|status|reset
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

// Cartella backend/ (radice di package.json, .env e node_modules).
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const devEnvFile = path.join(root, ".env");
const testEnvFile = path.join(root, ".env.test");

if (!existsSync(testEnvFile)) {
    console.error("[prisma-test] manca backend/.env.test: copia .env.test.example e compila i valori.");
    process.exit(1);
}

// .env fornisce i valori comuni, .env.test li sovrascrive (override: true).
if (existsSync(devEnvFile)) dotenv.config({ path: devEnvFile });
dotenv.config({ path: testEnvFile, override: true });

// Estrae il nome del database da una URL mysql://user:pass@host:port/nome.
function databaseName(url) {
    try {
        return new URL(url).pathname.replace(/^\//, "");
    } catch {
        return "";
    }
}

const testUrl = process.env.DATABASE_URL ?? "";
const shadowUrl = process.env.SHADOW_DATABASE_URL ?? "";
const testName = databaseName(testUrl);
const shadowName = databaseName(shadowUrl);

// Guardia 1: entrambi i database devono essere esplicitamente "di test"
// (express_finance_test, express_finance_test_shadow, ...). Il nome di
// sviluppo (express_finance / express_finance_shadow) non contiene "_test".
const looksLikeTestDb = (name) => /_test(_|$)/.test(name);
if (!looksLikeTestDb(testName) || !looksLikeTestDb(shadowName)) {
    console.error(
        `[prisma-test] rifiuto: DATABASE_URL e SHADOW_DATABASE_URL devono puntare a database *_test (trovati: "${testName || "?"}", "${shadowName || "?"}").`
    );
    process.exit(1);
}

// Guardia 2: lo shadow non può coincidere col database principale (Prisma lo svuota).
if (testName === shadowName) {
    console.error("[prisma-test] rifiuto: shadow e database di test coincidono.");
    process.exit(1);
}

// Guardia 3: difesa in profondità contro un .env.test che ricopia il DB di sviluppo.
if (process.env.DEV_DATABASE_URL && testUrl === process.env.DEV_DATABASE_URL) {
    console.error("[prisma-test] rifiuto: DATABASE_URL coincide con quella di sviluppo.");
    process.exit(1);
}

const args = process.argv.slice(2);
if (args.length === 0) {
    console.error("[prisma-test] uso: node scripts/prisma-test.js <migrate|db|studio> [argomenti...]");
    process.exit(1);
}

// Binario locale di Prisma (.cmd su Windows): nessuna dipendenza da PATH globale.
const bin = path.join(
    root,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "prisma.cmd" : "prisma"
);

console.log(`[prisma-test] ${testName} (shadow: ${shadowName}) → prisma ${args.join(" ")}`);

const result = spawnSync(bin, args, {
    cwd: root,
    stdio: "inherit",
    // Su Windows i .cmd richiedono la shell; gli argomenti non contengono spazi.
    shell: process.platform === "win32",
    env: process.env
});

process.exit(result.status ?? 1);
