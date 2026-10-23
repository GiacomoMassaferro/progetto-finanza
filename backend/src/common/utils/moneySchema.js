import { z } from "zod";
import { parseAmountInput, parseAmountToCents, moneyFromCents, MAX_AMOUNT } from "./money.js";

// Validazione zod degli importi monetari, condivisa da debts / savings /
// transactions. Motivo dell'estrazione: la versione duplicata in ogni modulo
// confrontava i float per esattezza (19.99 * 100 = 1998.9999999999998) e
// rifiutava importi validi con 400. Qui la tolleranza e' centralizzata.

/**
 * Campo importo: numero o stringa, > 0 (o >= 0 con allowZero).
 * Restituisce la stringa canonica a 2 decimali (mai float verso il DB).
 * Ogni refine controlla solo il proprio motivo di rifiuto, cosi' l'utente
 * riceve un messaggio preciso invece di piu' errori sovrapposti.
 */
export function moneyField(field, { required = true, allowZero = false } = {}) {
    const base = z
        .union([z.number(), z.string()])
        // 1. Il valore deve essere un numero (o una stringa numerica).
        .refine((v) => parseAmountInput(v).ok, { message: `${field} deve essere un numero` })
        // 2. Massimo 2 decimali (tollera l'errore binario dei float).
        .refine((v) => {
            const r = parseAmountToCents(v);
            return r.ok || r.reason !== "decimals";
        }, { message: `${field} max 2 decimali` })
        // 3. Segno: > 0 di default, >= 0 con allowZero.
        .refine((v) => {
            const r = parseAmountToCents(v);
            if (!r.ok) return true;
            return allowZero ? r.cents >= 0 : r.cents > 0;
        }, { message: `${field} deve essere ${allowZero ? ">= 0" : "> 0"}` })
        // 4. Tetto massimo allineato a Decimal(10,2): evita il 500 di Prisma.
        .refine((v) => {
            const r = parseAmountToCents(v);
            return r.ok || r.reason !== "range";
        }, { message: `${field} max ${MAX_AMOUNT}` })
        .transform((v) => {
            // Il fallback a 0 e' solo difensivo: parseOr400 scarta comunque
            // i valori che hanno prodotto un errore di validazione.
            const r = parseAmountToCents(v);
            return moneyFromCents(r.ok ? r.cents : 0);
        });
    return required ? base : base.optional();
}
