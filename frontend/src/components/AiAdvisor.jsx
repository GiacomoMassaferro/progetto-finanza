import { useTranslation } from "react-i18next";
import { Card, Chip, SectionTitle } from "./ui.jsx";

// PLACEHOLDER statico dal mock Stitch: il motore IA non esiste ancora.
// Mostra il formato del futuro consiglio (estinzione anticipata con numeri)
// ma nessun dato è calcolato: va sostituito in F-IA.
export default function AiAdvisor() {
  const { t } = useTranslation();
  return (
    <Card>
      <SectionTitle kicker={t("ai.kicker")} title={t("ai.title")} action={<Chip tone="indigo">{t("ai.staticBadge")}</Chip>} />
      <p className="font-body-md text-body-md text-on-surface-variant">{t("ai.body")}</p>
      <div className="flex gap-space-sm mt-space-md">
        <button type="button" disabled className="h-10 px-3.5 rounded-lg bg-primary/40 font-label-md text-label-md text-on-primary" title={t("ai.availableWithAI")}>
          {t("ai.apply")}
        </button>
      </div>
    </Card>
  );
}
