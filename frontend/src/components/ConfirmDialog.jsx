import { useEffect } from "react";
import { useTranslation } from "react-i18next";

// Modale di conferma col tema Stitch (sostituisce window.confirm,
// che è nativo del browser e non traducibile/stilizzabile).
// Props: open, message, confirmLabel?, onConfirm, onCancel.
export default function ConfirmDialog({ open, message, confirmLabel, onConfirm, onCancel }) {
  const { t } = useTranslation();

  // Chiude con Esc come il drawer (coerenza).
  useEffect(() => {
    if (!open) return;
    function onKey(e) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-margin">
      <div className="absolute inset-0 bg-on-surface/40 anim-backdrop-in" onClick={onCancel} aria-hidden="true" />
      <div role="alertdialog" aria-modal="true" className="relative w-full max-w-sm rounded-xl border border-hairline bg-surface-container-lowest p-space-lg shadow-sm anim-drawer-in">
        <h2 className="font-headline-sm text-headline-sm text-on-surface">{t("common.confirmTitle")}</h2>
        <p className="font-body-md text-body-md text-on-surface-variant mt-space-xs">{message}</p>
        <div className="flex gap-space-sm mt-space-md">
          <button type="button" onClick={onCancel} className="flex-1 h-10 rounded-lg border border-outline-variant font-label-md text-label-md">
            {t("common.cancel")}
          </button>
          <button type="button" onClick={onConfirm} autoFocus className="flex-1 h-10 rounded-lg bg-primary font-label-md text-label-md text-on-primary">
            {confirmLabel ?? t("common.delete")}
          </button>
        </div>
      </div>
    </div>
  );
}
