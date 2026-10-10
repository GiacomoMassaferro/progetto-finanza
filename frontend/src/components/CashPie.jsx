import { useTranslation } from "react-i18next";
import { Card, SectionTitle } from "./ui.jsx";
import { formatEUR } from "../lib/format.js";

// Torta dei soldi: risponde a "quanti soldi ho adesso e come si muovono?".
// Centro = liquidità attuale (entrate - uscite da sempre). Spicchi =
// entrate del mese, uscite del mese, rate mensili dei debiti (solo la rata,
// mai il residuo totale), risparmi accantonati e disponibile (il resto).
// SVG disegnato a mano coi colori del tema (niente librerie), si ricalcola
// a ogni render (segue mese e dati).
export default function CashPie({ available, income, expenses, monthlyDebts, savings }) {
  const { t } = useTranslation();
  const availableNum = Number(available ?? 0);
  const incomeNum = Number(income ?? 0);
  const expensesNum = Number(expenses ?? 0);
  const monthlyNum = Number(monthlyDebts ?? 0);
  const savingsNum = Number(savings ?? 0);
  // Il disponibile non scende sotto zero in torta (la cifra vera resta al centro).
  const freeNum = Math.max(0, availableNum - savingsNum - expensesNum - monthlyNum);
  const slices = [
    { key: "income", label: t("cashflow.income"), value: incomeNum, color: "#0D9488" },
    { key: "expenses", label: t("cashflow.expenses"), value: expensesNum, color: "#4648d4" },
    { key: "monthly", label: t("cashflow.monthly"), value: monthlyNum, color: "#F59E0B" },
    { key: "savings", label: t("cashflow.savings"), value: savingsNum, color: "#008378" },
    { key: "available", label: t("cashflow.available"), value: freeNum, color: "#6bd8cb" },
  ];
  const total = slices.reduce((s, x) => s + x.value, 0);

  // Offset accumulato: ogni spicchio parte dove finisce il precedente.
  // Cerchio r=15.9155 -> circonferenza 100: dash = percentuale diretta.
  let acc = 25; // parte dall'alto (rotazione -90°)
  const arcs = slices.map((s) => {
    const pct = total > 0 ? (s.value / total) * 100 : 0;
    const arc = { ...s, pct, offset: acc };
    acc -= pct;
    return arc;
  });

  return (
    <Card>
      <SectionTitle kicker={t("cashflow.kicker")} title={t("cashflow.title")} />
      <div className="flex flex-col sm:flex-row items-center gap-space-md">
        <div className="relative w-44 h-44 shrink-0">
          <svg viewBox="0 0 42 42" className="w-full h-full -rotate-90" role="img" aria-label={t("cashflow.title")}>
            <circle cx="21" cy="21" r="15.9155" fill="none" stroke="#e5eeff" strokeWidth="7" />
            {arcs.map(
              (a) =>
                a.pct > 0 && (
                  <circle
                    key={a.key}
                    cx="21"
                    cy="21"
                    r="15.9155"
                    fill="none"
                    stroke={a.color}
                    strokeWidth="7"
                    strokeDasharray={`${a.pct} ${100 - a.pct}`}
                    strokeDashoffset={a.offset}
                    strokeLinecap="butt"
                  />
                ),
            )}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center px-2 text-center">
            <p className="font-label-xs text-label-xs uppercase text-on-surface-variant">{t("cashflow.availableNow")}</p>
            <p className="tnum font-headline-sm text-headline-sm text-on-surface">{formatEUR(availableNum)}</p>
          </div>
        </div>
        <ul className="flex-1 w-full flex flex-col divide-y divide-hairline">
          {arcs.map((a) => (
            <li key={a.key} className="flex items-center gap-space-sm py-space-sm">
              <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: a.color }} aria-hidden="true" />
              <p className="flex-1 font-body-md text-body-md text-on-surface">{a.label}</p>
              <p className="tnum font-body-sm text-body-sm text-on-surface-variant shrink-0">{Math.round(a.pct)}%</p>
              <p className="tnum font-body-md text-body-md text-on-surface shrink-0 w-24 text-right">{formatEUR(a.value)}</p>
            </li>
          ))}
        </ul>
      </div>
      <p className="mt-space-sm font-body-sm text-body-sm text-on-surface-variant">{t("cashflow.hint")}</p>
    </Card>
  );
}
