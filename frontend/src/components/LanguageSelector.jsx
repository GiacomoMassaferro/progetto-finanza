import { useTranslation } from "react-i18next";
import { LANGUAGES, setLanguage } from "../i18n/index.js";
import { authApi } from "../lib/api.js";

// Tendina di cambio lingua (EN default, browser pre-login).
// Con persist la scelta si salva anche nel profilo DB (segue ogni dispositivo).
export default function LanguageSelector({ compact = false, persist = false }) {
  const { i18n } = useTranslation();

  async function onChange(e) {
    const code = e.target.value;
    await setLanguage(code);
    if (persist) {
      // Salvataggio best-effort: la lingua di sessione resta comunque attiva.
      await authApi.updateMe({ language: code }).catch(() => {});
    }
  }

  return (
    <select
      value={i18n.language}
      onChange={onChange}
      aria-label="Language / Lingua"
      className={`h-10 rounded-lg border border-outline-variant bg-surface-container-lowest font-label-md text-label-md text-on-surface ${compact ? "w-full px-3" : "px-2"}`}
    >
      {LANGUAGES.map((l) => (
        <option key={l.code} value={l.code}>
          {l.label}
        </option>
      ))}
    </select>
  );
}
