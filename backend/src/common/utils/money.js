// Soldi esatti senza float: i calcoli viaggiano in centesimi interi,
// l'API espone sempre stringhe a 2 decimali ("300.00", mai "300").

// Converte stringa/numero/Decimal in centesimi interi.
export const toCents = (value) => Math.round(Number(value ?? 0) * 100);

// Converte centesimi interi in stringa a 2 decimali.
export const moneyFromCents = (cents) => (cents / 100).toFixed(2);

// Normalizza qualsiasi importo (Decimal Prisma incluso) in stringa a 2 decimali.
// Nota: String(Decimal("300.00")) darebbe "300" — mai usarlo per i soldi.
export const toMoneyString = (value) => moneyFromCents(toCents(value));
