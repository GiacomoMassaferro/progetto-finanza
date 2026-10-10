// Calcolatore deterministico del piano di estinzione (motore a regole).
// Puro: niente DB, niente LLM, solo centesimi interi — testabile in isolamento.
//
// Regole di business (richieste prodotto):
// 1. Strategia valanga: si estingue prima il TAEG più alto (a pari tasso,
//    il residuo minore). Le rate minime sono già nel budget mensile.
// 2. Surplus mensile (entrate - uscite) -> TUTTO al risparmio, mai a rate
//    extra. Il piano di estinzione usa solo le rate minime.
// 3. Liquidità totale (entrate - uscite da sempre) esposta nello snapshot:
//    servirà all'LLM per non suggerire movimenti che svuotano il conto.

// Testi per locale (stesse 4 lingue della UI).
const STRINGS = {
    it: {
        summary: (n, when, interest, savings) =>
            `Piano valanga su ${n} debiti: estinzione stimata ${when}, interessi stimati ${interest}. Extra mensili ${savings} destinati al risparmio.`,
        noDebts: "Nessun debito attivo: niente da estinguere.",
        itemDetail: (when) => `Estinto a ${when} con la strategia valanga`,
        warnOverdue: (n) => `${n} rate scadute: pagale prima di tutto`,
        warnNegative: "Spendi più di quanto guadagni: il piano non regge",
        warnLiquidity: "La liquidità non copre le scadenze dei prossimi 30 giorni",
        warnDti: "Le rate superano il 36% delle entrate: soglia di rischio",
        warnStuck: "la rata minima non copre gli interessi",
        savingsNote: "Extra mensili destinati al risparmio (regola fissa)",
        savingsZero: "Nessun surplus mensile: prima rientra nelle spese",
    },
    en: {
        summary: (n, when, interest, savings) =>
            `Avalanche plan on ${n} debts: payoff around ${when}, estimated interest ${interest}. Monthly surplus ${savings} goes to savings.`,
        noDebts: "No active debts: nothing to pay off.",
        itemDetail: (when) => `Paid off by ${when} with the avalanche strategy`,
        warnOverdue: (n) => `${n} overdue installments: pay them first`,
        warnNegative: "You spend more than you earn: the plan does not hold",
        warnLiquidity: "Cash does not cover the next 30 days of due dates",
        warnDti: "Installments exceed 36% of income: risk threshold",
        warnStuck: "minimum payment does not cover interest",
        savingsNote: "Monthly surplus goes to savings (fixed rule)",
        savingsZero: "No monthly surplus: cut spending first",
    },
    es: {
        summary: (n, when, interest, savings) =>
            `Plan avalancha sobre ${n} deudas: liquidación estimada ${when}, intereses estimados ${interest}. Excedente mensual ${savings} al ahorro.`,
        noDebts: "Sin deudas activas: nada que liquidar.",
        itemDetail: (when) => `Liquidada en ${when} con la estrategia avalancha`,
        warnOverdue: (n) => `${n} cuotas vencidas: págalas primero`,
        warnNegative: "Gastas más de lo que ganas: el plan no se sostiene",
        warnLiquidity: "La liquidez no cubre los vencimientos de 30 días",
        warnDti: "Las cuotas superan el 36% de los ingresos: umbral de riesgo",
        warnStuck: "la cuota mínima no cubre los intereses",
        savingsNote: "Excedente mensual al ahorro (regla fija)",
        savingsZero: "Sin excedente mensual: recorta gastos primero",
    },
    de: {
        summary: (n, when, interest, savings) =>
            `Avalanche-Plan für ${n} Schulden: Tilgung ca. ${when}, geschätzte Zinsen ${interest}. Monatsüberschuss ${savings} geht ans Sparen.`,
        noDebts: "Keine aktiven Schulden: nichts zu tilgen.",
        itemDetail: (when) => `Getilgt bis ${when} mit der Avalanche-Strategie`,
        warnOverdue: (n) => `${n} überfällige Raten: zuerst zahlen`,
        warnNegative: "Du gibst mehr aus als du verdienst: Plan hält nicht",
        warnLiquidity: "Liquidität deckt die nächsten 30 Tage nicht",
        warnDti: "Raten über 36% des Einkommens: Risikoschwelle",
        warnStuck: "Mindestrate deckt die Zinsen nicht",
        savingsNote: "Monatsüberschuss ans Sparen (feste Regel)",
        savingsZero: "Kein Überschuss: erst Ausgaben senken",
    },
};

const LOCALES = { en: "en-IE", it: "it-IT", es: "es-ES", de: "de-DE" };

// Formatta centesimi in euro nella lingua data.
function eur(cents, locale) {
    return new Intl.NumberFormat(LOCALES[locale] ?? LOCALES.en, { style: "currency", currency: "EUR" }).format(cents / 100);
}

// "2027-03" -> "Marzo 2027" (o equivalente locale).
function monthLabel(yyyyMm, locale) {
    const [y, m] = yyyyMm.split("-").map(Number);
    const s = new Date(y, m - 1, 1).toLocaleDateString(LOCALES[locale] ?? LOCALES.en, { month: "long", year: "numeric" });
    return s.charAt(0).toUpperCase() + s.slice(1);
}

// Mese YYYY-MM a n mesi da oggi (per le date stimate di estinzione).
function monthPlus(n) {
    const d = new Date();
    d.setMonth(d.getMonth() + n);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// Simula l'ammortamento a rate minime in ordine di tasso (valanga).
// debts: [{ id, creditorName, remainingCents, annualRatePct, monthlyCents }].
// Ritorna [{ ...debt, payoffMonth (0-based) o null se mai, interestCents }].
function simulate(debts, warnings, t) {
    const ordered = [...debts].sort((a, b) => b.annualRatePct - a.annualRatePct || a.remainingCents - b.remainingCents);
    const state = ordered.map((d) => ({ ...d, left: d.remainingCents, interest: 0, payoffMonth: null }));
    for (let m = 0; m < 600 && state.some((d) => d.left > 0); m++) {
        for (const d of state) {
            if (d.left <= 0) {
                continue;
            }
            // Interesse mensile sul residuo (tasso nominale da annualRatePct).
            const interest = Math.round((d.left * d.annualRatePct) / 12 / 100);
            d.left += interest;
            d.interest += interest;
            const pay = Math.min(d.monthlyCents, d.left);
            if (pay <= interest && d.annualRatePct > 0) {
                // Ammortamento negativo: la rata non intacca mai il capitale.
                warnings.push(`${d.creditorName}: ${t.warnStuck}`);
                d.left = d.remainingCents;
                d.payoffMonth = null;
                continue;
            }
            d.left -= pay;
            if (d.left <= 0) {
                d.left = 0;
                d.payoffMonth = d.payoffMonth ?? m;
            }
        }
    }
    return state;
}

// Costruisce piano + snapshot da dati già caricati (tutto in centesimi).
// snapshot: { availableNowCents, monthIncomeCents, monthExpensesCents,
//   upcoming30dCents, overdueCount, debtsMonthlyCents }.
export function buildPayoffPlan({ debts, snapshot, locale = "en" }) {
    const t = STRINGS[locale] ?? STRINGS.en;
    const warnings = [];
    const active = debts.filter((d) => d.remainingCents > 0);

    if (active.length === 0) {
        return {
            summary: t.noDebts,
            items: [],
            warnings,
            snapshot: toSnapshot(snapshot),
            savings: { monthlyCents: 0, note: t.savingsZero },
            projectedDebtFree: null,
            totalInterestCents: 0,
        };
    }

    const simulated = simulate(active, warnings, t);
    const lastMonth = Math.max(0, ...simulated.map((d) => d.payoffMonth ?? 0));
    const debtFree = monthPlus(lastMonth);
    const totalInterest = simulated.reduce((s, d) => s + d.interest, 0);
    const surplus = snapshot.monthIncomeCents - snapshot.monthExpensesCents;

    // Allarmi di sostenibilità (prima del piano: la sicurezza viene prima).
    if (snapshot.overdueCount > 0) {
        warnings.unshift(t.warnOverdue(snapshot.overdueCount));
    }
    if (surplus < 0) {
        warnings.unshift(t.warnNegative);
    }
    if (snapshot.availableNowCents < snapshot.upcoming30dCents) {
        warnings.push(t.warnLiquidity);
    }
    if (snapshot.monthIncomeCents > 0 && snapshot.debtsMonthlyCents / snapshot.monthIncomeCents > 0.36) {
        warnings.push(t.warnDti);
    }

    return {
        summary: t.summary(active.length, monthLabel(debtFree, locale), eur(totalInterest, locale), eur(Math.max(0, surplus), locale)),
        items: simulated.map((d) => ({
            title: d.creditorName,
            detail: t.itemDetail(d.payoffMonth === null ? "—" : monthLabel(monthPlus(d.payoffMonth), locale)),
            amount: (d.remainingCents / 100).toFixed(2),
        })),
        warnings,
        snapshot: toSnapshot(snapshot),
        // REGOLA FISSA: il surplus va al risparmio, mai a rate extra.
        savings: {
            monthlyCents: Math.max(0, surplus),
            note: surplus > 0 ? t.savingsNote : t.savingsZero,
        },
        projectedDebtFree: debtFree,
        totalInterestCents: totalInterest,
    };
}

// Snapshot in formato stabile per l'LLM futuro: solo cifre aggregate,
// mai nomi/email (minimizzazione dati, vedi D-17).
function toSnapshot(s) {
    return {
        availableNowCents: s.availableNowCents,
        monthIncomeCents: s.monthIncomeCents,
        monthExpensesCents: s.monthExpensesCents,
        monthlyFreeCents: s.monthIncomeCents - s.monthExpensesCents,
        debtsTotalCents: s.debtsTotalCents,
        upcoming30dCents: s.upcoming30dCents,
        overdueCount: s.overdueCount,
        // Totale accantonato negli obiettivi: l'LLM lo userà per valutare
        // estinzioni anticipate senza svuotare il conto.
        savingsTotalCents: s.savingsTotalCents ?? 0,
    };
}
