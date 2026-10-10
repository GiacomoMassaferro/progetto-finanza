import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import de from "./de.json";
import en from "./en.json";
import es from "./es.json";
import it from "./it.json";

// Lingue: inglese default (lingua internazionale), italiano, spagnolo,
// tedesco. Niente localStorage (scelta progetto: la preferenza vive nel
// profilo DB e segue l'utente su ogni dispositivo). Da sloggati vale la
// lingua del browser; chiavi mancanti -> inglese.
// NOTA: le date/importi seguono la lingua via src/lib/format.js (Intl).

// Mappa lingua -> locale Intl per numeri e date.
export const LOCALES = { en: "en-IE", it: "it-IT", es: "es-ES", de: "de-DE" };
export const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "it", label: "Italiano" },
  { code: "es", label: "Español" },
  { code: "de", label: "Deutsch" },
];

const SUPPORTED = ["en", "it", "es", "de"];

// Lingua del browser se supportata, altrimenti inglese.
function browserLanguage() {
  const code = (navigator.language || "en").slice(0, 2).toLowerCase();
  return SUPPORTED.includes(code) ? code : "en";
}

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    it: { translation: it },
    es: { translation: es },
    de: { translation: de },
  },
  lng: browserLanguage(),
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

// Cambia lingua della sessione (da loggati si salva anche nel profilo via API).
export function setLanguage(code) {
  if (!SUPPORTED.includes(code)) {
    return Promise.resolve();
  }
  return i18n.changeLanguage(code);
}

// Locale Intl corrente (es. "it-IT") per format.js.
export function currentLocale() {
  return LOCALES[i18n.language] || LOCALES.en;
}

export default i18n;
