import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Card, ProgressBar, SectionTitle } from "./ui.jsx";
import { goalsApi } from "../lib/api.js";
import { formatEUR } from "../lib/format.js";

// Anteprima obiettivi in dashboard: i primi 2 attivi coi progressi.
// Dati veri (stesso endpoint della pagina Risparmi).
export default function SavingsGoals() {
  const { t } = useTranslation();
  const [goals, setGoals] = useState(null);

  useEffect(() => {
    let cancelled = false;
    goalsApi
      .list({ limit: 2 })
      .then((res) => !cancelled && setGoals(res.items))
      .catch(() => !cancelled && setGoals([]));
    return () => {
      cancelled = true;
    };
  }, []);

  if (goals === null) {
    return null;
  }

  return (
    <Card>
      <SectionTitle kicker={t("savings.kicker")} title={t("savings.title")} action={<Link to="/savings" className="font-label-md text-label-md text-primary">{t("dashboard.seeAll")}</Link>} />
      {goals.length === 0 ? (
        <p className="font-body-md text-body-md text-on-surface-variant">{t("savings.noGoals")}</p>
      ) : (
        <div className="flex flex-col gap-space-md">
          {goals.map((g) => (
            <div key={g.id}>
              <div className="flex items-baseline justify-between">
                <p className="font-headline-sm text-headline-sm text-on-surface truncate">{g.name}</p>
                <p className="tnum font-body-md text-body-md text-on-surface-variant shrink-0">{formatEUR(g.currentAmount)} / {formatEUR(g.targetAmount)}</p>
              </div>
              <div className="mt-space-xs">
                <ProgressBar value={g.progressPct} tone="teal" />
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
