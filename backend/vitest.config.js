import { defineConfig } from "vitest/config";

// Test d'integrazione contro il MySQL reale (vedi tests/helpers.js):
// timeout largo perché bcrypt e query DB sono più lenti dei test puri.
export default defineConfig({
    test: {
        testTimeout: 30000,
        hookTimeout: 30000,
        // Nessun test deve chiamare il provider LLM reale (lento, costoso e
        // non deterministico). La chiave viene azzerata PRIMA che env.js
        // carichi il .env: dotenv non sovrascrive variabili già presenti.
        // La narrativa è coperta da un provider finto in
        // tests/ai.llm.guardrails.test.js.
        env: {
            GEMINI_API_KEY: "",
        },
        // Esecuzione sequenziale: i test condividono lo stesso DB.
        pool: "forks",
        poolOptions: { forks: { singleFork: true } },
    },
});
