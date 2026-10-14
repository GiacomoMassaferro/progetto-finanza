import { GoogleGenAI } from "@google/genai";

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
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        return null;
    }
    instance = new GoogleGenAI({ apiKey });
    return instance;
}

// Modello da env (default dalla doc ufficiale).
export function geminiModel() {
    return process.env.GEMINI_MODEL ?? "gemini-3.8-flash";
}
