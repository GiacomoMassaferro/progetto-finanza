import { defineConfig } from "vitest/config";

// Test d'integrazione contro il MySQL reale (vedi tests/helpers.js):
// timeout largo perché bcrypt e query DB sono più lenti dei test puri.
export default defineConfig({
    test: {
        testTimeout: 30000,
        hookTimeout: 30000,
        // Esecuzione sequenziale: i test condividono lo stesso DB.
        pool: "forks",
        poolOptions: { forks: { singleFork: true } },
    },
});
