import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { env } from "../../../config/env.js";

// Provider LLM pigro: si attiva solo se GEMINI_API_KEY esiste.
// Senza chiave restituisce null e il chiamante usa le regole (mai errori).
// Una sola istanza condivisa (lazy singleton).

let instance = null;
let attempted = false;

export function getGemini() {
    if (attempted) {
        return instance;
    }
    attempted = true;
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        return null;
    }
    instance = new ChatGoogleGenerativeAI({
        apiKey,
        model: process.env.GEMINI_MODEL ?? "gemini-3.8-flash",
        temperature: 0.2,
        maxOutputTokens: 1024,
    });
    return instance;
}

// Nome motore per il contratto (regole vs LLM) + env effettivo.
export function engineInfo() {
    return {
        available: getGemini() !== null,
        model: process.env.GEMINI_MODEL ?? "gemini-3.8-flash",
        nodeEnv: env.nodeEnv,
    };
}
