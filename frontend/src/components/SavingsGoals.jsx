import { useTranslation } from "react-i18next";
import { Card, Chip, ProgressBar, SectionTitle } from "./ui.jsx";

// PLACEHOLDER statico dal mock Stitch: gli obiettivi di risparmio non hanno
// ancora un modello nel backend. Dati finti dichiarati, da collegare in F3+.
export default function SavingsGoals() {
  const { t } = useTranslation();
  const goals = [
    { name: t("savings.goal1"), saved: "€ 4.500", target: "€ 5.000", pct: 90 },
    { name: t("savings.goal2"), saved: "€ 1.920", target: "€ 3.000", pct: 64 },
  ];
  return (
    <Card>
      <SectionTitle kicker={t("savings.kicker")} title={t("savings.title")} action={<Chip tone="indigo">{t("savings.staticBadge")}</Chip>} />
      <div className="flex flex-col gap-space-md">
        {goals.map((g) => (
          <div key={g.name}>
            <div className="flex items-baseline justify-between">
              <p className="font-headline-sm text-headline-sm text-on-surface">{g.name}</p>
              <p className="tnum font-body-md text-body-md text-on-surface-variant">{g.saved} / {g.target}</p>
            </div>
            <div className="mt-space-xs">
              <ProgressBar value={g.pct} tone="teal" />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
