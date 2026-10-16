import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, Chip, SectionTitle } from "./ui.jsx";
import { aiApi } from "../lib/api.js";

// Consulente IA dal vivo: chiama POST /ai/suggest e mostra headline,
// spiegazione e consigli. Se la narrativa manca (LLM spento o errore),
// ripiega sul segnaposto statico: mai pagina vuota o crash.
export default function AiAdvisor() {
  const { t, i18n } = useTranslation();
  // null = in caricamento; oggetto = risposta; "static" = fallback.
  const [suggestion, setSuggestion] = useState(null);

  useEffect(() => {
    let cancelled = false;
    aiApi
      .suggest("payoff", i18n.language)
      .then((res) => !cancelled && setSuggestion(res.narrative ? res : "static"))
      .catch(() => !cancelled && setSuggestion("static"));
    return () => {
      cancelled = true;
    };
  }, [i18n.language]);

  // Fallback statico dal mock Stitch (motore IA non raggiungibile).
  if (suggestion === "static") {
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

  // Caricamento: scheletro testuale, niente spinner invasivi.
  if (!suggestion) {
    return (
      <Card>
        <SectionTitle kicker={t("ai.kicker")} title={t("ai.loading")} />
        <p className="font-body-md text-body-md text-on-surface-variant">…</p>
      </Card>
    );
  }

  const narrative = suggestion.narrative;
  return (
    <Card>
      <SectionTitle kicker={t("ai.kicker")} title={narrative.headline} action={<Chip tone="teal">{t("ai.liveBadge")}</Chip>} />
      <p className="font-body-md text-body-md text-on-surface-variant">{narrative.explanation}</p>
      {narrative.tips?.length > 0 && (
        <ul className="flex flex-col gap-space-xs mt-space-sm">
          {narrative.tips.map((tip, i) => (
            <li key={i} className="flex gap-space-sm font-body-md text-body-md text-on-surface">
              <span className="text-tertiary shrink-0">✓</span>
              <span>{tip}</span>
            </li>
          ))}
        </ul>
      )}
      {suggestion.warnings?.length > 0 && (
        <div className="flex flex-wrap gap-space-xs mt-space-sm">
          {suggestion.warnings.map((w, i) => (
            <Chip key={i} tone="amber">{w}</Chip>
          ))}
        </div>
      )}
      <p className="mt-space-sm font-body-sm text-body-sm text-on-surface-variant">
        {t("ai.engineLabel")}: {suggestion.engine}
      </p>
    </Card>
  );
}
