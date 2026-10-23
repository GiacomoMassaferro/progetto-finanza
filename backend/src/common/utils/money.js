// Soldi esatti senza float: i calcoli viaggiano in centesimi interi,
// l'API espone sempre stringhe a 2 decimali ("300.00", mai "300").

// Converte stringa/numero/Decimal in centesimi interi.
export const toCents = (value) => Math.round(Number(value ?? 0) * 100);

// Converte centesimi interi in stringa a 2 decimali.
export const moneyFromCents = (cents) => (cents / 100).toFixed(2);

// Normalizza qualsiasi importo (Decimal Prisma incluso) in stringa a 2 decimali.
// Nota: String(Decimal("300.00")) darebbe "300" — mai usarlo per i soldi.
export const toMoneyString = (value) => moneyFromCents(toCents(value));

// Tetto massimo degli importi: allineato alla colonna Decimal(10,2) di MySQL,
// oltre il quale Prisma rifiuta la scrittura (500). Meglio un 400 esplicito.
export const MAX_AMOUNT = 99999999.99;

// Formato con migliaia e virgola decimale: "1.234.567,89" -> 1234567.89.
// La virgola e' obbligatoria: senza, "1.234" resta ambiguo (migliaia o
// decimali) e viene respinto come "troppi decimali".
const RE_EU_THOUSANDS = /^[+-]?\d{1,3}(\.\d{3})+,\d{1,2}$/;
// Virgola come separatore decimale: "19,99" -> 19.99.
const RE_COMMA_DECIMALS = /^[+-]?\d+,\d{1,2}$/;
// Solo interi: "20" -> 20.
const RE_INTEGER = /^[+-]?\d+$/;
// Formato canonico API (punto = decimali, max 2 cifre): "19.99".
const RE_CANONICAL = /^[+-]?\d+(\.\d{1,2})?$/;
// Numerale con piu' di 2 decimali: errore dedicato, non "formato sbagliato".
const RE_TOO_MANY_DECIMALS = /^[+-]?\d+[.,]\d{3,}$/;

/**
 * Normalizza un importo in ingresso (stringa o numero) a numero decimale.
 * Accetta i formati italiani ("19,99", "1.234,56") e quello canonico API
 * ("19.99"), oltre agli interi. Restituisce:
 *   { ok: true, value }            importo valido
 *   { ok: false, reason: "format" } non e' un numero
 *   { ok: false, reason: "decimals" } piu' di 2 decimali
 * Nota: niente float nell'output — il chiamante deve convertire in centesimi
 * con toCents() per evitare di riintrodurre errori di rappresentazione.
 */
export function parseAmountInput(raw) {
    // Numero nativo: controlla solo che sia finito.
    if (typeof raw === "number") {
        if (!Number.isFinite(raw)) return { ok: false, reason: "format" };
        return { ok: true, value: raw };
    }
    if (typeof raw !== "string") return { ok: false, reason: "format" };

    const s = raw.trim().replace(/\s+/g, "");
    if (s === "") return { ok: false, reason: "format" };

    // 1.234.567,89 -> 1234567.89 (punto = migliaia, virgola = decimali).
    if (RE_EU_THOUSANDS.test(s)) {
        return { ok: true, value: Number(s.replace(/\./g, "").replace(",", ".")) };
    }
    // 19,99 -> 19.99.
    if (RE_COMMA_DECIMALS.test(s)) {
        return { ok: true, value: Number(s.replace(",", ".")) };
    }
    // 20 -> 20.
    if (RE_INTEGER.test(s)) {
        return { ok: true, value: Number(s) };
    }
    // 19.99 -> 19.99 (formato canonico).
    if (RE_CANONICAL.test(s)) {
        return { ok: true, value: Number(s) };
    }
    // 19.999 -> troppo precisi: messaggio dedicato.
    if (RE_TOO_MANY_DECIMALS.test(s)) {
        return { ok: false, reason: "decimals" };
    }
    return { ok: false, reason: "format" };
}

/**
 * Importo in ingresso -> centesimi interi, con tolleranza sull'errore di
 * floating point (19.99 * 100 = 1998.9999999999998, non 1999 esatto).
 * Restituisce:
 *   { ok: true, cents }             importo valido
 *   { ok: false, reason }           "format" | "decimals" | "range"
 */
export function parseAmountToCents(raw) {
    const parsed = parseAmountInput(raw);
    if (!parsed.ok) return parsed;

    const scaled = parsed.value * 100;
    const cents = Math.round(scaled);
    // Tolleranza: 1e-6 copre il massimo scarto binario sui valori ammessi.
    if (Math.abs(scaled - cents) > 1e-6) return { ok: false, reason: "decimals" };
    if (Math.abs(cents) > Math.round(MAX_AMOUNT * 100)) return { ok: false, reason: "range" };
    return { ok: true, cents };
}
