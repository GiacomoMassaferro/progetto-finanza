import { z } from "zod";
import { asyncHandler } from "../../common/utils/asyncHandler.js";
import { parseOr400 } from "../../common/utils/validate.js";
import { aiRouter } from "./router.js";

// Body di POST /ai/suggest validato qui (il router valida il resto).
const suggestBody = z.object({
    intent: z.enum(["payoff", "savings", "chat", "unknown"]).default("payoff"),
    locale: z.enum(["en", "it", "es", "de"]).optional(),
});

// POST /api/v1/ai/suggest (protetta) -> 200 { data: suggestion }.
// Smista al router LangChain: oggi regole deterministiche sui dati veri,
// in Fase 2 la stessa forma con narrativa LLM.
export const suggest = asyncHandler(async (req, res) => {
    const input = parseOr400(suggestBody, req.body ?? {}, "Dati richiesta non validi");
    const result = await aiRouter.invoke({
        userId: String(req.user.id),
        intent: input.intent,
        locale: input.locale ?? "en",
    });
    res.json({ data: result });
});
