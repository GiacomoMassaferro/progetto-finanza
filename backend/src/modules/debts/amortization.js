// Matematica dei piani di ammortamento, pura e riusabile.
// Oggi la usa with-installments (modalità amortized); domani il simulatore
// di estinzione anticipata e l'LLM (stesse funzioni, nessun rewrite).

// Piano alla francese: rata costante, quota interessi decrescente.
// Ritorna [{ amountCents, dueDate }] e il totale interessi in centesimi.
// annualRatePct = TAN annuo (se hai il TAEG, passalo: è più prudente).
export function buildAmortization({ principalCents, annualRatePct, months, firstDueDate }) {
    const r = annualRatePct / 12 / 100;
    // Rata francese; tasso zero -> divisione semplice.
    const raw = r > 0 ? (principalCents * r) / (1 - Math.pow(1 + r, -months)) : principalCents / months;
    const base = Math.floor(raw);
    const schedule = [];
    let left = principalCents;
    let totalInterest = 0;
    for (let i = 0; i < months; i++) {
        const interest = Math.round((left * annualRatePct) / 12 / 100);
        // Ultima rata: conguaglia resto + interessi (chiude a zero esatto).
        const amount = i === months - 1 ? left + interest : Math.min(base, left + interest);
        totalInterest += interest;
        left = left + interest - amount;
        const due = new Date(firstDueDate.getFullYear(), firstDueDate.getMonth() + i, firstDueDate.getDate());
        schedule.push({ amountCents: amount, dueDate: due });
    }
    return { schedule, totalInterestCents: totalInterest, monthlyCents: base };
}

// Divisione semplice in N rate uguali, ultima conguaglia (modalità split).
export function splitEqual(totalCents, count) {
    const base = Math.floor(totalCents / count);
    return Array.from({ length: count }, (_, i) =>
        i === count - 1 ? totalCents - base * (count - 1) : base,
    );
}

// Scadenze mensili da una data iniziale (stesso giorno, JS normalizza i mesi corti).
export function monthlyDueDates(firstDueDate, count) {
    return Array.from(
        { length: count },
        (_, i) => new Date(firstDueDate.getFullYear(), firstDueDate.getMonth() + i, firstDueDate.getDate()),
    );
}
