import { RunnableLambda } from "@langchain/core/runnables";
import { routeInputSchema, suggestionSchema } from "./ai.schemas.js";
import { payoffChain } from "./chains/payoff.js";

// Router degli intenti: riceve { userId, intent, locale } e smista alla
// chain specialista. In AI-1a le chain sono stub deterministici (nessuna
// chiamata LLM): definiscono forma e contratto, i calcoli veri arrivano
// in AI-1b, la narrativa in Fase 2. Il router NON decide con l'LLM:
// l'intento arriva esplicito dal chiamante (endpoint/UI).

// Chain stub: risposta valida ma vuota, dichiara il motore che l'ha prodotta.
function stubChain(intent, engine) {
    return RunnableLambda.from(async (input) => ({
        intent,
        locale: input.locale,
        engine,
        summary: `stub:${intent}`,
        items: [],
    }));
}

// Registro intent -> chain. Aggiungere uno specialista = una riga qui.
// payoff è reale (calcolatore su dati veri), le altre arrivano in AI-1c/Fase 2.
const CHAINS = {
    payoff: payoffChain,
    savings: stubChain("savings", "rules-stub"),
    chat: stubChain("chat", "rules-stub"),
    unknown: stubChain("unknown", "rules-stub"),
};

// Runnable principale: valida input e output con zod, così niente di
// malformato esce dal modulo IA (contratto garantito anche in Fase 2).
export const aiRouter = RunnableLambda.from(async (rawInput) => {
    const input = routeInputSchema.parse(rawInput);
    const chain = CHAINS[input.intent] ?? CHAINS.unknown;
    const output = await chain.invoke(input);
    return suggestionSchema.parse(output);
});
