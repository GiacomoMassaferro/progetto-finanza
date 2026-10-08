// Punto unico di accesso alle variabili d'ambiente.
// Carica .env, verifica le chiavi obbligatorie e fallisce in modo
// esplicito all'avvio se manca qualcosa (fail fast).
import "dotenv/config";

const required = [
    "DATABASE_URL",
    "SHADOW_DATABASE_URL",
    "DATABASE_HOST",
    "DATABASE_PORT",
    "DATABASE_USER",
    "DATABASE_PASSWORD",
    "DATABASE_NAME",
];

// Il segreto JWT è obbligatorio: senza, i token sarebbero firmabili da chiunque.
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    throw new Error(
        "JWT_SECRET mancante o troppo corto (min 32 caratteri). " +
            "Generalo con: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
    );
}

const missing = required.filter((key) => !process.env[key]);
if (missing.length > 0) {
    throw new Error(
        `Variabili d'ambiente mancanti: ${missing.join(", ")}. ` +
            `Copia .env.example in .env e compilalo.`,
    );
}

// Coerenza tra DATABASE_URL e singoli parametri usati dall'adapter.
// Evita il bug avuto in passato (DATABASE_NAME diverso dal DB nella URL).
const dbUrl = new URL(process.env.DATABASE_URL);
const urlDbName = decodeURIComponent(dbUrl.pathname.replace(/^\//, ""));
if (urlDbName && urlDbName !== process.env.DATABASE_NAME) {
    throw new Error(
        `DATABASE_NAME ("${process.env.DATABASE_NAME}") non coincide con il database ` +
            `in DATABASE_URL ("${urlDbName}"). Allineali prima di avviare.`,
    );
}

const port = Number.parseInt(process.env.PORT ?? "3000", 10);
if (Number.isNaN(port) || port <= 0) {
    throw new Error(`PORT non valida: "${process.env.PORT}".`);
}

const dbPort = Number.parseInt(process.env.DATABASE_PORT ?? "3306", 10);
if (Number.isNaN(dbPort) || dbPort <= 0) {
    throw new Error(`DATABASE_PORT non valida: "${process.env.DATABASE_PORT}".`);
}

// SSL verso il DB: in locale (MySQL senza certificati validi) il connettore
// mariadb si blocca in handshake, quindi il default è disabilitato.
// In produzione con DB gestito (certificati validi) impostare "true".
const dbSsl = (process.env.DATABASE_SSL ?? "false").toLowerCase() === "true";

export const env = Object.freeze({
    nodeEnv: process.env.NODE_ENV ?? "development",
    isDev: (process.env.NODE_ENV ?? "development") !== "production",
    port,
    // Origine del frontend (Vite) autorizzata dal CORS. In produzione
    // impostare l'URL reale (es. "https://app.example.com").
    frontendUrl: process.env.FRONTEND_URL ?? "http://localhost:5173",
    jwt: Object.freeze({
        secret: process.env.JWT_SECRET,
        // Access breve (chiamate API), refresh lungo (rinnovi). In produzione
        // valutare access più corto via JWT_ACCESS_TTL se serve.
        accessTtl: process.env.JWT_ACCESS_TTL ?? "15m",
        refreshTtl: process.env.JWT_REFRESH_TTL ?? "7d",
    }),
    databaseUrl: process.env.DATABASE_URL,
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
    db: Object.freeze({
        host: process.env.DATABASE_HOST,
        port: dbPort,
        user: process.env.DATABASE_USER,
        password: process.env.DATABASE_PASSWORD,
        database: process.env.DATABASE_NAME,
        ssl: dbSsl,
    }),
});
