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

// Segreti "di esempio" che non devono mai arrivare in produzione: con questi
// valori chiunque legga il repository può firmare token validi.
const FORBIDDEN_SECRETS = [
    "cambia",
    "changeme",
    "change-me",
    "secret",
    "placeholder",
    "replace-me",
    "your-secret",
    "example",
    "toplevel",
    "xxx",
];

// Segno debole tipico: un solo carattere ripetuto ("aaaaa...").
const WEAK_SECRET = /^(.)\1+$/;

// Verifica che il segreto JWT sia realmente casuale: lunghezza minima,
// niente placeholder noti, niente sequenze triviali.
function assertStrongJwtSecret(secret) {
    if (!secret || secret.length < 32) {
        throw new Error(
            "JWT_SECRET mancante o troppo corto (min 32 caratteri). " +
                "Generalo con: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
        );
    }
    const lower = secret.toLowerCase();
    const placeholder = FORBIDDEN_SECRETS.find((p) => lower.includes(p));
    if (placeholder) {
        throw new Error(
            `JWT_SECRET sembra un placeholder ( contiene "${placeholder}" ). ` +
                "Genera un segreto casuale: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
        );
    }
    if (WEAK_SECRET.test(secret)) {
        throw new Error("JWT_SECRET troppo debole: usa un valore casuale.");
    }
}

// Il segreto JWT è obbligatorio: senza, i token sarebbero firmabili da chiunque.
assertStrongJwtSecret(process.env.JWT_SECRET);

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

// Numero di proxy fidati davanti all'app (0 = nessuno). Serve a estrarre
// l'IP reale dagli header X-Forwarded-For nei rate limit: se il valore è
// sbagliato, il limiter si basa su header falsificabili dal client.
const trustProxy = Number.parseInt(process.env.TRUST_PROXY ?? "0", 10);
if (Number.isNaN(trustProxy) || trustProxy < 0) {
    throw new Error(`TRUST_PROXY non valido: "${process.env.TRUST_PROXY}" (usa 0, 1, 2...).`);
}

// SSL verso il DB: in locale (MySQL senza certificati validi) il connettore
// mariadb si blocca in handshake, quindi il default è disabilitato.
// In produzione con DB gestito (certificati validi) impostare "true".
const dbSsl = (process.env.DATABASE_SSL ?? "false").toLowerCase() === "true";

export const env = Object.freeze({
    nodeEnv: process.env.NODE_ENV ?? "development",
    isDev: (process.env.NODE_ENV ?? "development") !== "production",
    port,
    // Numero di proxy fidati (vedi sopra): 0 in locale.
    trustProxy,
    // Permette il seed (utente demo con password nota) anche in produzione.
    // Off di default: va abilitato esplicitamente, mai per abitudine.
    seedAllowProduction: process.env.SEED_ALLOW_PRODUCTION === "1",
    // Origine del frontend (Vite) autorizzata dal CORS. In produzione
    // impostare l'URL reale (es. "https://app.example.com").
    frontendUrl: process.env.FRONTEND_URL ?? "http://localhost:5173",
    jwt: Object.freeze({
        secret: process.env.JWT_SECRET,
        // Access breve (chiamate API), refresh lungo (rinnovi). In produzione
        // valutare access più corto via JWT_ACCESS_TTL se serve.
        accessTtl: process.env.JWT_ACCESS_TTL ?? "15m",
        // Il refresh gira a ogni uso: 1 giorno basta (7 giorni darebbero
        // una finestra lunga a un token rubato, vedi audit B2/A6).
        refreshTtl: process.env.JWT_REFRESH_TTL ?? "1d",
    }),
    databaseUrl: process.env.DATABASE_URL,
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
    // Chiave LLM (Gemini). Facoltativa: senza, il modulo IA resta sulle
    // regole deterministiche. La chiave non viene mai loggata.
    geminiApiKey: process.env.GEMINI_API_KEY ?? "",
    geminiModel: process.env.GEMINI_MODEL ?? "gemini-3.8-flash",
    db: Object.freeze({
        host: process.env.DATABASE_HOST,
        port: dbPort,
        user: process.env.DATABASE_USER,
        password: process.env.DATABASE_PASSWORD,
        database: process.env.DATABASE_NAME,
        ssl: dbSsl,
    }),
});
