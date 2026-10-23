// Matematica dei piani di ammortamento, pura e riusabile.
// Oggi la usa with-installments (modalità amortized); domani il simulatore
// di estinzione anticipata e l'LLM (stesse funzioni, nessun rewrite).

// Data nel mese target, con il giorno limitato all'ultimo disponibile:
// il 31 non esiste in febbraio, senza clamp JS sfonda a marzo (bug A3).
function addMonthsClamped(date, months) {
    const firstOfTarget = new Date(date.getFullYear(), date.getMonth() + months, 1);
    const lastDay = new Date(firstOfTarget.getFullYear(), firstOfTarget.getMonth() + 1, 0).getDate();
    const day = Math.min(date.getDate(), lastDay);
    return new Date(firstOfTarget.getFullYear(), firstOfTarget.getMonth(), day);
}

// Piano alla francese: rata costante, quota interessi decrescente.
// Ritorna [{ amountCents, dueDate }] e il totale interessi in centesimi.
// annualRatePct = TAN annuo nominale (se hai il TAEG, convertilo con
// nominalAnnualFromEffective: e' piu' prudente usare il tasso "vero").
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
        const due = addMonthsClamped(firstDueDate, i);
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

// Scadenze mensili da una data iniziale: stesso giorno, con l'ultimo giorno
// del mese quando il giorno iniziale non esiste in quel mese.
export function monthlyDueDates(firstDueDate, count) {
    return Array.from({ length: count }, (_, i) => addMonthsClamped(firstDueDate, i));
}
