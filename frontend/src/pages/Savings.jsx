import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import AppShell from "../components/AppShell.jsx";
import ConfirmDialog from "../components/ConfirmDialog.jsx";
import { ErrorAlert, Field, PrimaryButton, TextInput, TrashToggle } from "../components/forms.jsx";
import { Card, Chip, ProgressBar, SectionTitle } from "../components/ui.jsx";
import { goalsApi } from "../lib/api.js";
import { formatEUR } from "../lib/format.js";

// Obiettivi di risparmio: lista con progressi, nuovo obiettivo,
// versamento (auto-REACHED al target), cestino con ripristino.
export default function Savings() {
  const { t } = useTranslation();
  const [items, setItems] = useState([]);
  const [showTrash, setShowTrash] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: "", targetAmount: "" });
  const [depositId, setDepositId] = useState(null);
  const [depositAmount, setDepositAmount] = useState("");
  // Id in attesa di conferma cancellazione (modale invece di window.confirm).
  const [pendingDeleteId, setPendingDeleteId] = useState(null);

  // Ricarica la vista corrente (attivi o cestino).
  async function load(trash) {
    const res = await (trash ? goalsApi.trash({ limit: 100 }) : goalsApi.list({ limit: 100 }));
    setItems(res.items);
  }

  useEffect(() => {
    let cancelled = false;
    load(showTrash).catch((err) => !cancelled && setError(err));
    return () => {
      cancelled = true;
    };
  }, [showTrash]);

  async function onCreate(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await goalsApi.create({ name: form.name.trim(), targetAmount: form.targetAmount.replace(",", ".") });
      setShowForm(false);
      setForm({ name: "", targetAmount: "" });
      setShowTrash(false);
      await load(false);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  // Versa la somma nell'obiettivo (il server somma e chiude a REACHED).
  async function onDeposit(e, id) {
    e.preventDefault();
    setError(null);
    try {
      await goalsApi.deposit(id, depositAmount.replace(",", "."));
      setDepositId(null);
      setDepositAmount("");
      await load(showTrash);
    } catch (err) {
      setError(err);
    }
  }

  async function onDelete(id) {
    setPendingDeleteId(null);
    setError(null);
    try {
      await goalsApi.remove(id);
      await load(showTrash);
    } catch (err) {
      setError(err);
    }
  }

  async function onRestore(id) {
    setError(null);
    try {
      await goalsApi.restore(id);
      await load(true);
    } catch (err) {
      setError(err);
    }
  }

  return (
    <AppShell>
      <SectionTitle kicker={t("savings.kicker")} title={t("savings.title")} action={<button type="button" onClick={() => setShowForm((v) => !v)} className="h-10 px-3.5 rounded-lg bg-primary font-label-md text-label-md text-on-primary">{t("savings.new")}</button>} />
      <div className="mt-space-md">
        <TrashToggle showTrash={showTrash} onChange={setShowTrash} />
      </div>
      <div className="mt-space-sm">
        <ErrorAlert error={error} onClose={() => setError(null)} />
      </div>

      {showForm && (
        <Card className="mt-space-md">
          <form onSubmit={onCreate} className="flex flex-col gap-space-sm">
            <Field label={t("savings.name")}>
              <TextInput required placeholder={t("savings.namePh")} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label={t("savings.target")}>
              <TextInput required inputMode="decimal" placeholder="5000.00" value={form.targetAmount} onChange={(e) => setForm({ ...form, targetAmount: e.target.value })} />
            </Field>
            <PrimaryButton busy={busy}>{t("savings.create")}</PrimaryButton>
          </form>
        </Card>
      )}

      <div className="flex flex-col gap-space-md mt-space-md">
        {items.length === 0 && (
          <Card><p className="font-body-md text-body-md text-on-surface-variant">{showTrash ? t("common.emptyTrash") : t("savings.noGoals")}</p></Card>
        )}
        {items.map((g) => (
          <Card key={g.id}>
            <div className="flex items-baseline justify-between gap-space-sm">
              <p className="font-headline-sm text-headline-sm text-on-surface truncate">{g.name}</p>
              {g.status === "REACHED" ? <Chip tone="teal">{t("savings.reached")}</Chip> : g.status === "ARCHIVED" ? <Chip tone="indigo">{t("savings.archived")}</Chip> : null}
            </div>
            <p className="tnum font-body-md text-body-md text-on-surface-variant mt-space-xs">
              {formatEUR(g.currentAmount)} / {formatEUR(g.targetAmount)} · {g.progressPct}%
            </p>
            <div className="mt-space-xs"><ProgressBar value={g.progressPct} tone="teal" /></div>
            <div className="flex flex-wrap gap-space-sm mt-space-sm">
              {!showTrash && g.status === "ACTIVE" && (
                <button type="button" onClick={() => { setDepositId(depositId === g.id ? null : g.id); setDepositAmount(""); }} className="h-9 px-3 rounded-lg bg-primary font-label-md text-label-md text-on-primary">{t("savings.deposit")}</button>
              )}
              {!showTrash && (
                <button type="button" onClick={() => setPendingDeleteId(g.id)} className="h-9 px-3 rounded-lg border border-error-container text-on-error-container font-label-md text-label-md">{t("common.delete")}</button>
              )}
              {showTrash && (
                <button type="button" onClick={() => onRestore(g.id)} className="h-9 px-3 rounded-lg border border-outline-variant font-label-md text-label-md">{t("common.restore")}</button>
              )}
            </div>
            {depositId === g.id && !showTrash && (
              <form onSubmit={(e) => onDeposit(e, g.id)} className="flex gap-space-sm mt-space-sm">
                <div className="flex-1">
                  <TextInput required inputMode="decimal" placeholder="100.00" value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} aria-label={t("savings.depositAmount")} />
                </div>
                <PrimaryButton busy={busy}>{t("savings.confirmDeposit")}</PrimaryButton>
              </form>
            )}
          </Card>
        ))}
      </div>
      <ConfirmDialog
        open={pendingDeleteId !== null}
        message={t("common.confirmTrash")}
        onConfirm={() => onDelete(pendingDeleteId)}
        onCancel={() => setPendingDeleteId(null)}
      />
    </AppShell>
  );
}
