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

import { monthlyRate } from "../../common/utils/rates.js";

// Testi per locale (stesse 4 lingue della UI).
const STRINGS = {
    it: {
        summary: (n, when, interest, savings) =>
            n === 1
                ? `Piano valanga su 1 debito: estinzione stimata ${when}, interessi stimati ${interest}. Extra mensili ${savings} destinati al risparmio.`
                : `Piano valanga su ${n} debiti: estinzione stimata ${when}, interessi stimati ${interest}. Extra mensili ${savings} destinati al risparmio.`,
        // Piano senza data di estinzione: almeno un debito non si estingue.
        summaryNever: (n, interest, savings) =>
            `Piano valanga su ${n} ${n === 1 ? "debito" : "debiti"}: nessuna estinzione raggiungibile con le rate minime, interessi stimati ${interest}. Extra mensili ${savings} destinati al risparmio.`,
        noDebts: "Nessun debito attivo: niente da estinguere.",
        itemDetail: (when) => `Estinto a ${when} con la strategia valanga`,
        itemDetailNever: "Non estinguibile con le rate minime",
        warnOverdue: (n) => (n === 1 ? "1 rata scaduta: pagala prima di tutto" : `${n} rate scadute: pagale prima di tutto`),
        warnNegative: "Spendi più di quanto guadagni: il piano non regge",
        warnLiquidity: "La liquidità non copre le scadenze dei prossimi 30 giorni",
        warnDti: "Le rate superano il 36% delle entrate: soglia di rischio",
        warnStuck: "la rata minima non copre gli interessi",
        warnTooLong: "non si estingue entro 50 anni",
        savingsNote: "Extra mensili destinati al risparmio (regola fissa)",
        savingsZero: "Nessun surplus mensile: prima rientra nelle spese",
    },
    en: {
        summary: (n, when, interest, savings) =>
            n === 1
                ? `Avalanche plan on 1 debt: payoff around ${when}, estimated interest ${interest}. Monthly surplus ${savings} goes to savings.`
                : `Avalanche plan on ${n} debts: payoff around ${when}, estimated interest ${interest}. Monthly surplus ${savings} goes to savings.`,
        summaryNever: (n, interest, savings) =>
            `Avalanche plan on ${n} ${n === 1 ? "debt" : "debts"}: no payoff reachable with minimum payments, estimated interest ${interest}. Monthly surplus ${savings} goes to savings.`,
        noDebts: "No active debts: nothing to pay off.",
        itemDetail: (when) => `Paid off by ${when} with the avalanche strategy`,
        itemDetailNever: "Not payable off with minimum payments",
        warnOverdue: (n) => (n === 1 ? "1 overdue installment: pay it first" : `${n} overdue installments: pay them first`),
        warnNegative: "You spend more than you earn: the plan does not hold",
        warnLiquidity: "Cash does not cover the next 30 days of due dates",
        warnDti: "Installments exceed 36% of income: risk threshold",
        warnStuck: "minimum payment does not cover interest",
        warnTooLong: "not payable off within 50 years",
        savingsNote: "Monthly surplus goes to savings (fixed rule)",
        savingsZero: "No monthly surplus: cut spending first",
    },
    es: {
        summary: (n, when, interest, savings) =>
            n === 1
                ? `Plan avalancha sobre 1 deuda: liquidación estimada ${when}, intereses estimados ${interest}. Excedente mensual ${savings} al ahorro.`
                : `Plan avalancha sobre ${n} deudas: liquidación estimada ${when}, intereses estimados ${interest}. Excedente mensual ${savings} al ahorro.`,
        summaryNever: (n, interest, savings) =>
            `Plan avalancha sobre ${n} ${n === 1 ? "deuda" : "deudas"}: no hay liquidación alcanzable con las cuotas mínimas, intereses estimados ${interest}. Excedente mensual ${savings} al ahorro.`,
        noDebts: "Sin deudas activas: nada que liquidar.",
        itemDetail: (when) => `Liquidada en ${when} con la estrategia avalancha`,
        itemDetailNever: "No liquidable con las cuotas mínimas",
        warnOverdue: (n) => (n === 1 ? "1 cuota vencida: págala primero" : `${n} cuotas vencidas: págalas primero`),
        warnNegative: "Gastas más de lo que ganas: el plan no se sostiene",
        warnLiquidity: "La liquidez no cubre los vencimientos de 30 días",
        warnDti: "Las cuotas superan el 36% de los ingresos: umbral de riesgo",
        warnStuck: "la cuota mínima no cubre los intereses",
        warnTooLong: "no se liquida en 50 años",
        savingsNote: "Excedente mensual al ahorro (regla fija)",
        savingsZero: "Sin excedente mensual: recorta gastos primero",
    },
    de: {
        summary: (n, when, interest, savings) =>
            n === 1
                ? `Avalanche-Plan für 1 Schuld: Tilgung ca. ${when}, geschätzte Zinsen ${interest}. Monatsüberschuss ${savings} geht ans Sparen.`
                : `Avalanche-Plan für ${n} Schulden: Tilgung ca. ${when}, geschätzte Zinsen ${interest}. Monatsüberschuss ${savings} geht ans Sparen.`,
        summaryNever: (n, interest, savings) =>
            `Avalanche-Plan für ${n} ${n === 1 ? "Schuld" : "Schulden"}: keine Tilgung mit den Mindestzahlungen erreichbar, geschätzte Zinsen ${interest}. Monatsüberschuss ${savings} geht ans Sparen.`,
        noDebts: "Keine aktiven Schulden: nichts zu tilgen.",
        itemDetail: (when) => `Getilgt bis ${when} mit der Avalanche-Strategie`,
        itemDetailNever: "Mit Mindestzahlungen nicht tilgbar",
        warnOverdue: (n) => (n === 1 ? "1 überfällige Rate: zuerst zahlen" : `${n} überfällige Raten: zuerst zahlen`),
        warnNegative: "Du gibst mehr aus als du verdienst: Plan hält nicht",
        warnLiquidity: "Liquidität deckt die nächsten 30 Tage nicht",
        warnDti: "Raten über 36% des Einkommens: Risikoschwelle",
        warnStuck: "Mindestrate deckt die Zinsen nicht",
        warnTooLong: "nicht innerhalb von 50 Jahren getilgt",
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
// Limite di simulazione: 50 anni di rate mensili (600 mesi).
const MAX_MONTHS = 600;

// Simula l'ammortamento a rate minime in ordine di tasso (valanga).
// debts: [{ id, creditorName, remainingCents, annualRatePct, monthlyCents,
//           rateKind? }] dove rateKind = "nominal" (TAN) o "effective" (TAEG).
// Ritorna [{ ...debt, payoffMonth (0-based) o null se mai, interestCents }].
function simulate(debts, warnings, t) {
    const ordered = [...debts].sort((a, b) => b.annualRatePct - a.annualRatePct || a.remainingCents - b.remainingCents);
    const state = ordered.map((d) => ({ ...d, left: d.remainingCents, interest: 0, payoffMonth: null, stuck: false }));
    for (let m = 0; m < MAX_MONTHS && state.some((d) => d.left > 0); m++) {
        for (const d of state) {
            if (d.left <= 0 || d.stuck) {
                // stuck: gia' segnalato e senza fine (non simulare oltre).
                continue;
            }
            // Interesse mensile sul residuo: TAN -> tasso/12, TAEG -> (1+t)^(1/12)-1.
            const rate = monthlyRate(d.annualRatePct, d.rateKind ?? "nominal");
            const interest = Math.round(d.left * rate);
            d.left += interest;
            d.interest += interest;
            const pay = Math.min(d.monthlyCents, d.left);
            if (pay <= interest && d.annualRatePct > 0) {
                // Ammortamento negativo: la rata non intacca mai il capitale,
                // quindi il debito non si estingue MAI. Lo segnalo una volta
                // sola (prima l'avviso si ripeteva per 600 mesi) e azzero il
                // residuo per non far gonfiare gli interessi stimati.
                warnings.push(`${d.creditorName}: ${t.warnStuck}`);
                d.left = d.remainingCents;
                d.payoffMonth = null;
                d.stuck = true;
                continue;
            }
            d.left -= pay;
            if (d.left <= 0) {
                d.left = 0;
                d.payoffMonth = d.payoffMonth ?? m;
            }
        }
    }
    // Debiti che non si estinguono entro l'orizzonte simulato: avviso dedicato.
    for (const d of state) {
        if (d.left > 0 && !d.stuck) {
            warnings.push(`${d.creditorName}: ${t.warnTooLong}`);
            d.stuck = true;
            d.payoffMonth = null;
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
    // Un debito non estinguibile (rata minima < interesse, o termine troppo
    // lungo) rende impossibile una data di estinzione: il piano non ha fine.
    const neverCount = simulated.filter((d) => d.payoffMonth === null).length;
    const lastMonth = Math.max(0, ...simulated.map((d) => d.payoffMonth ?? 0));
    const debtFree = neverCount > 0 ? null : monthPlus(lastMonth);
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

    const summary =
        debtFree === null
            ? t.summaryNever(active.length, eur(totalInterest, locale), eur(Math.max(0, surplus), locale))
            : t.summary(active.length, monthLabel(debtFree, locale), eur(totalInterest, locale), eur(Math.max(0, surplus), locale));

    return {
        summary,
        items: simulated.map((d) => ({
            title: d.creditorName,
            detail:
                d.payoffMonth === null
                    ? t.itemDetailNever
                    : t.itemDetail(monthLabel(monthPlus(d.payoffMonth), locale)),
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
