import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
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
      .then(([s, d, tr]) => {
        if (cancelled) return;
        setSummary(s);
        setDebts(d.items);
        setRecent(tr.items.slice(0, 4));
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
            {t("dashboard.welcome")}{user?.firstName ? `, ${user.firstName}` : ""}
          </h1>
          <p className="font-body-md text-body-md text-on-surface-variant">{t("dashboard.subtitle")}</p>
        </div>
        <div className="flex items-center gap-space-xs shrink-0">
          <button type="button" onClick={() => setMonth(shiftMonth(month, -1))} aria-label={t("dashboard.prevMonth")} className="h-10 w-10 rounded-lg border border-outline-variant font-headline-sm text-headline-sm">‹</button>
          <span className="font-label-md text-label-md text-on-surface min-w-24 text-center">{summary ? formatMonthLabel(summary.month) : "…"}</span>
          <button type="button" onClick={() => setMonth(shiftMonth(month, 1))} aria-label={t("dashboard.nextMonth")} className="h-10 w-10 rounded-lg border border-outline-variant font-headline-sm text-headline-sm">›</button>
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-space-md rounded-lg border border-error-container bg-error-container px-3 py-2 font-body-md text-body-md text-on-error-container">
          {error}
        </p>
      )}

      {loading ? (
        <p className="mt-space-lg font-body-md text-body-md text-on-surface-variant">{t("common.loadingData")}</p>
      ) : (
        summary && (
          <div className="flex flex-col gap-space-lg mt-space-md">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-space-sm md:gap-space-md">
              <KpiCard label={t("dashboard.kpiDebt")} value={formatEUR(summary.debts.totalRemaining)} note={`${summary.debts.active} ${t("dashboard.kpiActive")}`} />
              <KpiCard label={t("dashboard.kpiIncome")} value={formatEUR(summary.income)} note={`${summary.transactions} ${t("dashboard.kpiMovements")}`} />
              <KpiCard label={t("dashboard.kpiExpenses")} value={formatEUR(summary.expenses)} note={`${t("dashboard.kpiBalance")} ${formatEUR(summary.balance)}`} />
              <KpiCard
                label={t("dashboard.kpiRates")}
                value={String(summary.payments.upcoming.length)}
                note={summary.payments.overdue > 0 ? `${summary.payments.overdue} ${t("dashboard.kpiOverdue")}` : t("dashboard.kpiNoOverdue")}
              />
            </div>

            <AiAdvisor />

            <Card>
              <SectionTitle kicker={t("dashboard.payoffKicker")} title={t("dashboard.payoffTitle")} action={<Link to="/debts" className="font-label-md text-label-md text-primary">{t("dashboard.seeAll")}</Link>} />
              {debts.length === 0 ? (
                <p className="font-body-md text-body-md text-on-surface-variant">{t("dashboard.noDebts")}</p>
              ) : (
                <div className="flex flex-col gap-space-md">
                  {debts.map((d) => (
                    <div key={d.id}>
                      <div className="flex items-baseline justify-between gap-space-sm">
                        <p className="font-headline-sm text-headline-sm text-on-surface truncate">{d.creditorName}</p>
                        <p className="tnum font-body-md text-body-md text-on-surface-variant shrink-0">{paidPct(d)}% {t("dashboard.paidOff")}</p>
                      </div>
                      <p className="font-body-sm text-body-sm text-on-surface-variant">
                        {d.debtType} · {t("debts.remaining")} {formatEUR(d.remainingAmount)} {t("debts.of")} {formatEUR(d.totalAmount)}
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
                <SectionTitle kicker={t("dashboard.calendarKicker")} title={t("dashboard.calendarTitle")} />
                {summary.payments.upcoming.length === 0 ? (
                  <p className="font-body-md text-body-md text-on-surface-variant">{t("dashboard.noUpcoming")}</p>
                ) : (
                  <ul className="flex flex-col divide-y divide-hairline">
                    {summary.payments.upcoming.map((p) => (
                      <li key={p.id} className="flex items-center gap-space-sm py-space-sm">
                        <div className="w-11 shrink-0 rounded-lg bg-surface-container px-1 py-1 text-center">
                          <p className="font-headline-sm text-headline-sm text-on-surface">{new Date(p.dueDate).getDate()}</p>
                          <p className="font-label-xs text-label-xs uppercase text-on-surface-variant">{new Date(p.dueDate).toLocaleDateString(undefined, { month: "short" })}</p>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-body-md text-body-md text-on-surface truncate">{p.debt.creditorName}</p>
                          <p className="font-body-sm text-body-sm text-on-surface-variant">{formatShortDate(p.dueDate)}</p>
                        </div>
                        <p className="tnum font-body-md text-body-md text-on-surface shrink-0">{formatEUR(p.amount)}</p>
                      </li>
                    ))}
                  </ul>
                )}
                {summary.payments.overdue > 0 && (
                  <div className="mt-space-sm"><Chip tone="amber">{summary.payments.overdue} {t("dashboard.overdueToPay")}</Chip></div>
                )}
              </Card>
            </div>

            <Card>
              <SectionTitle kicker={t("dashboard.movementsKicker")} title={t("dashboard.recentTitle")} action={<Link to="/transactions" className="font-label-md text-label-md text-primary">{t("dashboard.seeAllTransactions")}</Link>} />
              {recent.length === 0 ? (
                <p className="font-body-md text-body-md text-on-surface-variant">{t("dashboard.noRecent")}</p>
              ) : (
                <ul className="flex flex-col divide-y divide-hairline">
                  {recent.map((tr) => (
                    <li key={tr.id} className="flex items-center gap-space-sm py-space-sm">
                      <div className="flex-1 min-w-0">
                        <p className="font-body-md text-body-md text-on-surface truncate">{tr.description ?? tr.category?.name ?? t("dashboard.movementFallback")}</p>
                        <p className="font-body-sm text-body-sm text-on-surface-variant">{formatShortDate(tr.transactionDate)} · {tr.category?.name ?? "—"}</p>
                      </div>
                      <p className={`tnum font-body-md text-body-md shrink-0 ${tr.type === "INCOME" ? "text-tertiary" : "text-on-surface"}`}>
                        {tr.type === "INCOME" ? "+" : "−"}{formatEUR(tr.amount)}
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
