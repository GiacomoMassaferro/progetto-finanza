// Formattazione valori per la UI: euro e date nella lingua attiva.
// Gli importi API arrivano come stringhe esatte ("45.50").
import { currentLocale } from "../i18n/index.js";

// "45.50" -> "45,50 €" (it) / "€45.50" (en). Accetta stringa o numero.
export function formatEUR(value) {
  return new Intl.NumberFormat(currentLocale(), { style: "currency", currency: "EUR" }).format(
    Number(value ?? 0),
  );
}

// Data ISO -> "15 mag" (it) / "15 May" (en).
export function formatShortDate(iso) {
  return new Date(iso).toLocaleDateString(currentLocale(), { day: "numeric", month: "short" });
}

// "2026-10" -> "Ottobre 2026" (it) / "October 2026" (en).
export function formatMonthLabel(yyyyMm) {
  const [y, m] = yyyyMm.split("-").map(Number);
  const label = new Date(y, m - 1, 1).toLocaleDateString(currentLocale(), { month: "long", year: "numeric" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

// Mese precedente/successivo in formato YYYY-MM.
export function shiftMonth(yyyyMm, delta) {
  const [y, m] = yyyyMm.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// Data ISO -> giorno + mese corto nella lingua attiva.
export function dueParts(iso) {
  const d = new Date(iso);
  return {
    day: d.getDate(),
    month: d.toLocaleDateString(currentLocale(), { month: "short" }),
  };
}

// Mese corrente in formato YYYY-MM.
export function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}
