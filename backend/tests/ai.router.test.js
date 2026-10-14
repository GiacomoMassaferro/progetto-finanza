import { beforeAll, describe, expect, test, vi } from "vitest";
import { aiRouter } from "../src/modules/ai/router.js";

// I test non toccano mai l'LLM vero: chiave svuotata, provider disattivo.
beforeAll(() => {
    vi.stubEnv("GEMINI_API_KEY", "");
});

// Il router smista ogni intento alla chain giusta e restituisce
// sempre un output valido (contratto suggestionSchema).

describe("aiRouter", () => {
    test.each(["payoff", "savings", "chat", "unknown"])("smista l'intento %s", async (intent) => {
        const out = await aiRouter.invoke({ userId: "1", intent, locale: "it" });
        expect(out.intent).toBe(intent);
        expect(out.locale).toBe("it");
        expect(out.items).toEqual([]);
    });

    test("locale di default en e intento ignoto in fallback", async () => {
        const out = await aiRouter.invoke({ userId: "1", intent: "payoff" });
        expect(out.locale).toBe("en");
    });

    test("input invalido rifiutato", async () => {
        await expect(aiRouter.invoke({ userId: "1", intent: "taxi" })).rejects.toThrow();
    });
});
