import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";
import AiAdvisor from "../components/AiAdvisor.jsx";
import AppShell from "../components/AppShell.jsx";
import SavingsGoals from "../components/SavingsGoals.jsx";
import { Card, Chip, KpiCard, ProgressBar, SectionTitle } from "../components/ui.jsx";
import { dashboardApi, debtsApi, transactionsApi } from "../lib/api.js";
import { currentMonth, formatEUR, formatMonthLabel, formatShortDate, shiftMonth } from "../lib/format.js";

// Dashboard: UNA sola pagina responsive (mobile-first, md: = desktop).
// Segue i due layout Stitch: stessi blocchi (benvenuto, KPI, IA, rientro,
// risparmi, scadenze, transazioni), dati veri tranne IA e risparmi.
export default function Dashboard() {
  const { user } = useAuth();
  const [month, setMonth] = useState(currentMonth());
  const [summary, setSummary] = useState(null);
  const [debts, setDebts] = useState([]);
  const [recent, setRecent] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  // Ricarica tutto al cambio mese: riepilogo, debiti e ultime 4 transazioni.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    Promise.all([dashboardApi.summary(month), debtsApi.list({ limit: 3 }), transactionsApi.list({ limit: 4 })])
      .then(([s, d, t]) => {
        if (cancelled) return;
        setSummary(s);
        setDebts(d.items);
        setRecent(t.items.slice(0, 4));
      })
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [month]);

  // Percentuale estinta del debito: 1 - residuo/totale.
  function paidPct(debt) {
    const total = Number(debt.totalAmount);
    if (!total) return 0;
    return Math.round((1 - Number(debt.remainingAmount) / total) * 100);
  }

  return (
    <AppShell>
      <div className="flex items-start justify-between gap-space-sm">
        <div>
          <h1 className="font-headline-lg-mobile text-headline-lg-mobile md:font-headline-lg md:text-headline-lg text-on-surface">
            Bentornato{user?.firstName ? `, ${user.firstName}` : ""}
          </h1>
          <p className="font-body-md text-body-md text-on-surface-variant">Panoramica finanziaria di oggi</p>
        </div>
        <div className="flex items-center gap-space-xs shrink-0">
          <button type="button" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Mese precedente" className="h-10 w-10 rounded-lg border border-outline-variant font-headline-sm text-headline-sm">‹</button>
          <span className="font-label-md text-label-md text-on-surface min-w-24 text-center">{summary ? formatMonthLabel(summary.month) : "…"}</span>
          <button type="button" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Mese successivo" className="h-10 w-10 rounded-lg border border-outline-variant font-headline-sm text-headline-sm">›</button>
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-space-md rounded-lg border border-error-container bg-error-container px-3 py-2 font-body-md text-body-md text-on-error-container">
          {error}
        </p>
      )}

      {loading ? (
        <p className="mt-space-lg font-body-md text-body-md text-on-surface-variant">Caricamento dati…</p>
      ) : (
        summary && (
          <div className="flex flex-col gap-space-lg mt-space-md">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-space-sm md:gap-space-md">
              <KpiCard label="Debito residuo" value={formatEUR(summary.debts.totalRemaining)} note={`${summary.debts.active} attivi`} />
              <KpiCard label="Entrate mese" value={formatEUR(summary.income)} note={`${summary.transactions} movimenti`} />
              <KpiCard label="Uscite mese" value={formatEUR(summary.expenses)} note={`Saldo ${formatEUR(summary.balance)}`} />
              <KpiCard label="Rate 30 giorni" value={String(summary.payments.upcoming.length)} note={summary.payments.overdue > 0 ? `${summary.payments.overdue} scadute` : "Nessuna scaduta"} />
            </div>

            <AiAdvisor />

            <Card>
              <SectionTitle kicker="Rientro" title="Piani di rientro" action={<Link to="/debts" className="font-label-md text-label-md text-primary">Vedi tutti</Link>} />
              {debts.length === 0 ? (
                <p className="font-body-md text-body-md text-on-surface-variant">Nessun debito attivo. Ottimo stato.</p>
              ) : (
                <div className="flex flex-col gap-space-md">
                  {debts.map((d) => (
                    <div key={d.id}>
                      <div className="flex items-baseline justify-between gap-space-sm">
                        <p className="font-headline-sm text-headline-sm text-on-surface truncate">{d.creditorName}</p>
                        <p className="tnum font-body-md text-body-md text-on-surface-variant shrink-0">{paidPct(d)}% estinto</p>
                      </div>
                      <p className="font-body-sm text-body-sm text-on-surface-variant">
                        {d.debtType} · Residuo {formatEUR(d.remainingAmount)} di {formatEUR(d.totalAmount)}
                      </p>
                      <div className="mt-space-xs">
                        <ProgressBar value={paidPct(d)} tone="teal" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-space-lg">
              <SavingsGoals />
              <Card>
                <SectionTitle kicker="Calendario" title="Prossime scadenze" />
                {summary.payments.upcoming.length === 0 ? (
                  <p className="font-body-md text-body-md text-on-surface-variant">Nessuna scadenza nei prossimi 30 giorni.</p>
                ) : (
                  <ul className="flex flex-col divide-y divide-hairline">
                    {summary.payments.upcoming.map((p) => (
                      <li key={p.id} className="flex items-center gap-space-sm py-space-sm">
                        <div className="w-11 shrink-0 rounded-lg bg-surface-container px-1 py-1 text-center">
                          <p className="font-headline-sm text-headline-sm text-on-surface">{new Date(p.dueDate).getDate()}</p>
                          <p className="font-label-xs text-label-xs uppercase text-on-surface-variant">{new Date(p.dueDate).toLocaleDateString("it-IT", { month: "short" })}</p>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-body-md text-body-md text-on-surface truncate">{p.debt.creditorName}</p>
                          <p className="font-body-sm text-body-sm text-on-surface-variant">Rata · {formatShortDate(p.dueDate)}</p>
                        </div>
                        <p className="tnum font-body-md text-body-md text-on-surface shrink-0">{formatEUR(p.amount)}</p>
                      </li>
                    ))}
                  </ul>
                )}
                {summary.payments.overdue > 0 && (
                  <div className="mt-space-sm"><Chip tone="amber">{summary.payments.overdue} rate scadute da pagare</Chip></div>
                )}
              </Card>
            </div>

            <Card>
              <SectionTitle kicker="Movimenti" title="Transazioni recenti" action={<Link to="/transactions" className="font-label-md text-label-md text-primary">Vedi tutte</Link>} />
              {recent.length === 0 ? (
                <p className="font-body-md text-body-md text-on-surface-variant">Nessun movimento in questo periodo.</p>
              ) : (
                <ul className="flex flex-col divide-y divide-hairline">
                  {recent.map((t) => (
                    <li key={t.id} className="flex items-center gap-space-sm py-space-sm">
                      <div className="flex-1 min-w-0">
                        <p className="font-body-md text-body-md text-on-surface truncate">{t.description ?? t.category?.name ?? "Movimento"}</p>
                        <p className="font-body-sm text-body-sm text-on-surface-variant">{formatShortDate(t.transactionDate)} · {t.category?.name ?? "—"}</p>
                      </div>
                      <p className={`tnum font-body-md text-body-md shrink-0 ${t.type === "INCOME" ? "text-tertiary" : "text-on-surface"}`}>
                        {t.type === "INCOME" ? "+" : "−"}{formatEUR(t.amount)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        )
      )}
    </AppShell>
  );
}
