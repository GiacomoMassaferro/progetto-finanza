import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import AppShell from "../components/AppShell.jsx";
import { ErrorAlert, Field, PrimaryButton, Select, TextInput, TrashToggle } from "../components/forms.jsx";
import { Card, Chip, ProgressBar, SectionTitle } from "../components/ui.jsx";
import { categoriesApi, debtsApi } from "../lib/api.js";
import { formatEUR, formatShortDate } from "../lib/format.js";

// Piani di rientro: lista debiti con rate, pagamento rate,
// nuovo debito, nuova rata, cestino con ripristino.
const TYPE_KEYS = { BNPL: "typeBNPL", CREDIT_CARD: "typeCard", PERSONAL_LOAN: "typeLoan", MORTGAGE: "typeMortgage", OTHER: "typeOther" };

export default function Debts() {
  const { t } = useTranslation();
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [showTrash, setShowTrash] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ creditorName: "", debtType: "BNPL", totalAmount: "", monthlyPayment: "", startDate: "" });
  const [payCat, setPayCat] = useState("");
  const [showPayForm, setShowPayForm] = useState(false);
  const [newPay, setNewPay] = useState({ amount: "", dueDate: "" });

  // Ricarica debiti (+ categorie per il pagamento) a ogni cambio vista.
  useEffect(() => {
    let cancelled = false;
    const loader = showTrash ? debtsApi.trash : debtsApi.list;
    loader({ limit: 50 })
      .then((res) => !cancelled && setItems(res.items))
      .catch((err) => !cancelled && setError(err));
    categoriesApi
      .list({ limit: 100 })
      .then((res) => !cancelled && setCategories(res.items))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [showTrash]);

  const selected = items.find((d) => d.id === selectedId) ?? null;

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  // Ricarica la vista corrente dopo ogni operazione.
  async function reload() {
    const loader = showTrash ? debtsApi.trash : debtsApi.list;
    const res = await loader({ limit: 50 });
    setItems(res.items);
  }

  async function onCreate(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await debtsApi.create({
        creditorName: form.creditorName.trim(),
        debtType: form.debtType,
        totalAmount: form.totalAmount.replace(",", "."),
        monthlyPayment: form.monthlyPayment.replace(",", "."),
        startDate: form.startDate,
      });
      setShowForm(false);
      setForm({ creditorName: "", debtType: "BNPL", totalAmount: "", monthlyPayment: "", startDate: "" });
      await reload();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  // Crea una rata per il debito selezionato.
  async function onCreatePayment(e) {
    e.preventDefault();
    setError(null);
    try {
      await debtsApi.createPayment(selected.id, {
        amount: newPay.amount.replace(",", "."),
        dueDate: newPay.dueDate,
      });
      setShowPayForm(false);
      setNewPay({ amount: "", dueDate: "" });
      const fresh = await debtsApi.list({ limit: 50 });
      setItems(fresh.items);
    } catch (err) {
      setError(err);
    }
  }

  // Paga una rata: serve la categoria per la transazione generata.
  async function onPay(paymentId) {
    if (!payCat) {
      setError({ message: t("debts.needCategory") });
      return;
    }
    setError(null);
    try {
      await debtsApi.pay(selected.id, paymentId, { movementsCategoryId: payCat });
      await reload();
    } catch (err) {
      setError(err);
    }
  }

  async function onDelete(id) {
    if (!window.confirm(t("debts.confirmDelete"))) return;
    setError(null);
    try {
      await debtsApi.remove(id);
      if (selectedId === id) setSelectedId(null);
      await reload();
    } catch (err) {
      setError(err);
    }
  }

  async function onRestore(id) {
    setError(null);
    try {
      await debtsApi.restore(id);
      await reload();
    } catch (err) {
      setError(err);
    }
  }

  // Percentuale estinta del debito.
  function paidPct(debt) {
    const total = Number(debt.totalAmount);
    return total ? Math.round((1 - Number(debt.remainingAmount) / total) * 100) : 0;
  }

  return (
    <AppShell>
      <SectionTitle kicker={t("debts.kicker")} title={t("debts.title")} action={<button type="button" onClick={() => setShowForm((v) => !v)} className="h-10 px-3.5 rounded-lg bg-primary font-label-md text-label-md text-on-primary">{t("debts.new")}</button>} />
      <div className="mt-space-md">
        <TrashToggle showTrash={showTrash} onChange={(v) => { setShowTrash(v); setSelectedId(null); }} />
      </div>
      <div className="mt-space-sm">
        <ErrorAlert error={error} onClose={() => setError(null)} />
      </div>

      {showForm && (
        <Card className="mt-space-md">
          <form onSubmit={onCreate} className="flex flex-col gap-space-sm">
            <Field label={t("debts.creditor")}>
              <TextInput required value={form.creditorName} onChange={(e) => set("creditorName", e.target.value)} placeholder={t("debts.creditorPh")} />
            </Field>
            <div className="grid grid-cols-2 gap-space-sm">
              <Field label={t("debts.type")}>
                <Select value={form.debtType} onChange={(e) => set("debtType", e.target.value)}>
                  {Object.entries(TYPE_KEYS).map(([v, k]) => (
                    <option key={v} value={v}>{t(`debts.${k}`)}</option>
                  ))}
                </Select>
              </Field>
              <Field label={t("debts.start")}>
                <TextInput required type="date" value={form.startDate} onChange={(e) => set("startDate", e.target.value)} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-space-sm">
              <Field label={t("debts.total")}>
                <TextInput required inputMode="decimal" placeholder="1200.00" value={form.totalAmount} onChange={(e) => set("totalAmount", e.target.value)} />
              </Field>
              <Field label={t("debts.monthly")}>
                <TextInput required inputMode="decimal" placeholder="100.00" value={form.monthlyPayment} onChange={(e) => set("monthlyPayment", e.target.value)} />
              </Field>
            </div>
            <PrimaryButton busy={busy}>{t("debts.save")}</PrimaryButton>
          </form>
        </Card>
      )}

      <div className="flex flex-col gap-space-md mt-space-md">
        {items.length === 0 && (
          <Card><p className="font-body-md text-body-md text-on-surface-variant">{showTrash ? t("common.emptyTrash") : t("debts.noDebts")}</p></Card>
        )}
        {items.map((d) => (
          <Card key={d.id}>
            <div className="flex items-baseline justify-between gap-space-sm">
              <p className="font-headline-sm text-headline-sm text-on-surface truncate">{d.creditorName}</p>
              {d.status === "PAID_OFF" ? <Chip tone="teal">{t("debts.paidOff")}</Chip> : d.status === "DEFAULTED" ? <Chip tone="amber">{t("debts.defaulted")}</Chip> : <Chip tone="indigo">{t(`debts.${TYPE_KEYS[d.debtType]}`)}</Chip>}
            </div>
            <p className="tnum font-body-md text-body-md text-on-surface mt-space-xs">
              {t("debts.remaining")} {formatEUR(d.remainingAmount)} {t("debts.of")} {formatEUR(d.totalAmount)} · {paidPct(d)}%
            </p>
            <div className="mt-space-xs"><ProgressBar value={paidPct(d)} tone="teal" /></div>
            <div className="flex flex-wrap gap-space-sm mt-space-sm">
              {!showTrash && (
                <>
                  <button type="button" onClick={() => setSelectedId(selectedId === d.id ? null : d.id)} className="h-9 px-3 rounded-lg border border-outline-variant font-label-md text-label-md">
                    {selectedId === d.id ? t("debts.closeRates") : `${t("debts.rates")} (${d.payments?.length ?? 0})`}
                  </button>
                  <button type="button" onClick={() => onDelete(d.id)} className="h-9 px-3 rounded-lg border border-error-container text-on-error-container font-label-md text-label-md">{t("common.delete")}</button>
                </>
              )}
              {showTrash && (
                <button type="button" onClick={() => onRestore(d.id)} className="h-9 px-3 rounded-lg border border-outline-variant font-label-md text-label-md">{t("common.restore")}</button>
              )}
            </div>

            {selectedId === d.id && selected && !showTrash && (
              <div className="mt-space-md border-t border-hairline pt-space-sm">
                <Field label={t("debts.payCategory")}>
                  <Select value={payCat} onChange={(e) => setPayCat(e.target.value)}>
                    <option value="">{t("transactions.choose")}</option>
                    {categories.filter((c) => c.type === "EXPENSE").map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </Select>
                </Field>
                <ul className="flex flex-col divide-y divide-hairline mt-space-sm">
                  {(selected.payments ?? []).map((p) => (
                    <li key={p.id} className="flex items-center gap-space-sm py-space-sm">
                      <div className="flex-1 min-w-0">
                        <p className="tnum font-body-md text-body-md text-on-surface">{formatEUR(p.amount)}</p>
                        <p className="font-body-sm text-body-sm text-on-surface-variant">
                          {t("debts.dueOn")} {formatShortDate(p.dueDate)}{p.paidDate ? ` · ${t("debts.paidOn")} ${formatShortDate(p.paidDate)}` : ""}
                        </p>
                      </div>
                      {p.status === "PAID" ? (
                        <Chip tone="teal">{t("debts.paid")}</Chip>
                      ) : (
                        <button type="button" onClick={() => onPay(p.id)} className="h-9 px-3 rounded-lg bg-primary font-label-md text-label-md text-on-primary shrink-0">{t("debts.pay")}</button>
                      )}
                    </li>
                  ))}
                  {(selected.payments ?? []).length === 0 && (
                    <p className="font-body-md text-body-md text-on-surface-variant py-space-sm">{t("debts.noRates")}</p>
                  )}
                </ul>
                <button type="button" onClick={() => setShowPayForm((v) => !v)} className="mt-space-sm h-9 px-3 rounded-lg border border-outline-variant font-label-md text-label-md">
                  {showPayForm ? t("debts.close") : t("debts.newRate")}
                </button>
                {showPayForm && (
                  <form onSubmit={onCreatePayment} className="grid grid-cols-2 gap-space-sm mt-space-sm">
                    <Field label={t("debts.rateAmount")}>
                      <TextInput required inputMode="decimal" placeholder="100.00" value={newPay.amount} onChange={(e) => setNewPay({ ...newPay, amount: e.target.value })} />
                    </Field>
                    <Field label={t("debts.rateDue")}>
                      <TextInput required type="date" value={newPay.dueDate} onChange={(e) => setNewPay({ ...newPay, dueDate: e.target.value })} />
                    </Field>
                    <div className="col-span-2">
                      <PrimaryButton busy={busy}>{t("debts.addRate")}</PrimaryButton>
                    </div>
                  </form>
                )}
              </div>
            )}
          </Card>
        ))}
      </div>
    </AppShell>
  );
}
