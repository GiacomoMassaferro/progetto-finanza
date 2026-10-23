import { GoogleGenAI } from "@google/genai";
import { env } from "../../../config/env.js";

// Provider LLM pigro sull'SDK ufficiale (Interactions API, metodo doc
// corrente: LangChain usava il vecchio :generateContent, incompatibile
// con le chiavi AQ.). Si attiva solo se GEMINI_API_KEY esiste.
// Senza chiave restituisce null e il chiamante usa le regole (mai errori).
// Una sola istanza condivisa (lazy singleton).

let instance = null;
let attempted = false;

export function getGemini() {
    if (attempted) {
        return instance;
    }
    attempted = true;
    // La chiave arriva solo da env.js (mai process.env sparpagliato).
    const apiKey = env.geminiApiKey;
    if (!apiKey) {
        return null;
    }
    instance = new GoogleGenAI({ apiKey });
    return instance;
}

// Modello da env (default dalla doc ufficiale).
export function geminiModel() {
    return env.geminiModel;
}
