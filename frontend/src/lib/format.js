// Formattazione valori per la UI: euro italiani e date corte.
// Gli importi API arrivano come stringhe esatte ("45.50").

const eur = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });

// "45.50" -> "45,50 €". Accetta stringa o numero.
export function formatEUR(value) {
  return eur.format(Number(value ?? 0));
}

// Data ISO -> "15 mag" (scadenze) ; con anno se serve.
export function formatShortDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString("it-IT", { day: "numeric", month: "short" });
}

// "2026-10" -> "Ottobre 2026" per il selettore mese.
export function formatMonthLabel(yyyyMm) {
  const [y, m] = yyyyMm.split("-").map(Number);
  const label = new Date(y, m - 1, 1).toLocaleDateString("it-IT", { month: "long", year: "numeric" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

// Mese precedente/successivo in formato YYYY-MM.
export function shiftMonth(yyyyMm, delta) {
  const [y, m] = yyyyMm.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// Mese corrente in formato YYYY-MM.
export function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}
