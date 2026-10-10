import { useTranslation } from "react-i18next";

// Pezzi di form riusati dalle pagine operative (stesso stile del login).
// Mobile-first: campi impilati a tutta larghezza.

const inputCls =
  "h-10 w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-3 font-body-md text-body-md text-on-surface focus:border-primary focus:outline-none";

// Campo etichettato: label maiuscola + controllo figlio.
export function Field({ label, children }) {
  return (
    <label className="block font-label-md text-label-md text-on-surface-variant">
      {label}
      <span className="block mt-space-xs">{children}</span>
    </label>
  );
}

// Input testo/numero/data con lo stile del tema.
export function TextInput(props) {
  return <input {...props} className={`${inputCls} ${props.className ?? ""}`} />;
}

// Select con lo stile del tema.
export function Select({ children, ...props }) {
  return (
    <select {...props} className={`${inputCls} ${props.className ?? ""}`}>
      {children}
    </select>
  );
}

// Bottone primario (salva, paga, crea) con stato di attesa.
export function PrimaryButton({ busy, children, ...props }) {
  const { t } = useTranslation();
  return (
    <button
      type="submit"
      disabled={busy}
      {...props}
      className="h-10 px-4 rounded-lg bg-primary font-label-md text-label-md text-on-primary disabled:opacity-50"
    >
      {busy ? t("common.wait") : children}
    </button>
  );
}

// Messaggio di errore API: mostra message + dettagli zod se presenti.
export function ErrorAlert({ error, onClose }) {
  const { t } = useTranslation();
  if (!error) return null;
  return (
    <p role="alert" className="rounded-lg border border-error-container bg-error-container px-3 py-2 font-body-md text-body-md text-on-error-container">
      {error.details?.join(", ") ?? error.message ?? error}
      {onClose && (
        <button type="button" onClick={onClose} className="ml-2 underline">
          {t("common.close")}
        </button>
      )}
    </p>
  );
}

// Interruttore di vista a N voci (es. Attivi/Estinti/Cestino).
// options: [{ value, label }]; value corrente; onChange(value).
// TrashToggle resta come scorciatoia a due voci per le pagine semplici.
export function SegmentedTabs({ options, value, onChange, count }) {
  return (
    <div className="flex rounded-lg bg-surface-container p-1 font-label-md text-label-md">
      {options.map((tab) => (
        <button
          key={tab.value}
          type="button"
          onClick={() => onChange(tab.value)}
          className={`flex-1 h-9 rounded-md px-2 ${value === tab.value ? "bg-surface-container-lowest shadow-sm text-on-surface" : "text-on-surface-variant"}`}
        >
          {tab.label}{tab.countable && typeof count === "number" ? ` (${count})` : ""}
        </button>
      ))}
    </div>
  );
}

// Scorciatoia Attivi/Cestino per Transazioni e Categorie.
export function TrashToggle({ showTrash, onChange, count }) {
  const { t } = useTranslation();
  return (
    <SegmentedTabs
      value={showTrash ? "trash" : "active"}
      onChange={(v) => onChange(v === "trash")}
      count={count}
      options={[
        { value: "active", label: t("common.active") },
        { value: "trash", label: t("common.trash"), countable: true },
      ]}
    />
  );
}
