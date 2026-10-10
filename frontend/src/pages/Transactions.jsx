import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import AppShell from "../components/AppShell.jsx";
import { ErrorAlert, Field, PrimaryButton, Select, TextInput, TrashToggle } from "../components/forms.jsx";
import { Card, SectionTitle } from "../components/ui.jsx";
import { categoriesApi, transactionsApi } from "../lib/api.js";
import { formatEUR, formatShortDate } from "../lib/format.js";

// Registro movimenti: filtri (tipo, categoria), nuovo movimento,
// cancellazione soft con cestino e ripristino.
export default function Transactions() {
  const { t } = useTranslation();
  const [items, setItems] = useState([]);
  const [meta, setMeta] = useState(null);
  const [categories, setCategories] = useState([]);
  const [type, setType] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [showTrash, setShowTrash] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ amount: "", type: "EXPENSE", description: "", transactionDate: today(), movementsCategoryId: "" });

  // Ricarica lista + categorie a ogni cambio filtro o vista.
  useEffect(() => {
    let cancelled = false;
    const loader = showTrash ? transactionsApi.trash : transactionsApi.list;
    loader({ type: type || undefined, categoryId: categoryId || undefined, limit: 50 })
      .then((res) => {
        if (cancelled) return;
        setItems(res.items);
        setMeta(res.meta);
      })
      .catch((err) => !cancelled && setError(err));
    categoriesApi
      .list({ limit: 100 })
      .then((res) => !cancelled && setCategories(res.items))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [type, categoryId, showTrash]);

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  // Crea il movimento e ricarica la lista attiva.
  async function onCreate(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await transactionsApi.create({
        // Virgola italiana -> punto: l'API vuole il formato "45.50".
        amount: form.amount.replace(",", "."),
        type: form.type,
        description: form.description || null,
        transactionDate: form.transactionDate,
        movementsCategoryId: form.movementsCategoryId,
      });
      setShowForm(false);
      setShowTrash(false);
      setForm({ amount: "", type: "EXPENSE", description: "", transactionDate: today(), movementsCategoryId: "" });
      const res = await transactionsApi.list({ type: type || undefined, categoryId: categoryId || undefined, limit: 50 });
      setItems(res.items);
      setMeta(res.meta);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  // Cancella (soft) o ripristina, poi ricarica la vista corrente.
  async function onDelete(id) {
    if (!window.confirm(t("common.confirmTrash"))) return;
    setError(null);
    try {
      await transactionsApi.remove(id);
      const loader = showTrash ? transactionsApi.trash : transactionsApi.list;
      const res = await loader({ type: type || undefined, categoryId: categoryId || undefined, limit: 50 });
      setItems(res.items);
      setMeta(res.meta);
    } catch (err) {
      setError(err);
    }
  }

  async function onRestore(id) {
    setError(null);
    try {
      await transactionsApi.restore(id);
      const res = await transactionsApi.trash({ limit: 50 });
      setItems(res.items);
      setMeta(res.meta);
    } catch (err) {
      setError(err);
    }
  }

  return (
    <AppShell>
      <SectionTitle kicker={t("transactions.kicker")} title={t("transactions.title")} action={<button type="button" onClick={() => setShowForm((v) => !v)} className="h-10 px-3.5 rounded-lg bg-primary font-label-md text-label-md text-on-primary">{t("transactions.new")}</button>} />

      <div className="flex flex-col md:flex-row gap-space-sm mt-space-md">
        <Select value={type} onChange={(e) => setType(e.target.value)} aria-label={t("transactions.type")}>
          <option value="">{t("transactions.filterAll")}</option>
          <option value="INCOME">{t("transactions.filterIncome")}</option>
          <option value="EXPENSE">{t("transactions.filterExpense")}</option>
        </Select>
        <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} aria-label={t("transactions.category")}>
          <option value="">{t("transactions.filterCategory")}</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </Select>
      </div>

      <div className="mt-space-sm">
        <TrashToggle showTrash={showTrash} onChange={setShowTrash} count={showTrash ? meta?.total : undefined} />
      </div>

      <div className="mt-space-sm">
        <ErrorAlert error={error} onClose={() => setError(null)} />
      </div>

      {showForm && (
        <Card className="mt-space-md">
          <form onSubmit={onCreate} className="flex flex-col gap-space-sm">
            <div className="grid grid-cols-2 gap-space-sm">
              <Field label={t("transactions.amount")}>
                <TextInput required inputMode="decimal" placeholder="45.50" value={form.amount} onChange={(e) => set("amount", e.target.value)} />
              </Field>
              <Field label={t("transactions.type")}>
                <Select value={form.type} onChange={(e) => set("type", e.target.value)}>
                  <option value="EXPENSE">{t("transactions.expense")}</option>
                  <option value="INCOME">{t("transactions.income")}</option>
                </Select>
              </Field>
            </div>
            <Field label={t("transactions.category")}>
              <Select required value={form.movementsCategoryId} onChange={(e) => set("movementsCategoryId", e.target.value)}>
                <option value="">{t("transactions.choose")}</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name} ({c.type === "INCOME" ? t("transactions.income").toLowerCase() : t("transactions.expense").toLowerCase()})</option>
                ))}
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-space-sm">
              <Field label={t("transactions.date")}>
                <TextInput required type="date" value={form.transactionDate} onChange={(e) => set("transactionDate", e.target.value)} />
              </Field>
              <Field label={t("transactions.description")}>
                <TextInput placeholder={t("transactions.descriptionPh")} value={form.description} onChange={(e) => set("description", e.target.value)} />
              </Field>
            </div>
            <PrimaryButton busy={busy}>{t("transactions.save")}</PrimaryButton>
          </form>
        </Card>
      )}

      <Card className="mt-space-md">
        {items.length === 0 ? (
          <p className="font-body-md text-body-md text-on-surface-variant">{showTrash ? t("common.emptyTrash") : t("transactions.noResults")}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-hairline">
            {items.map((item) => (
              <li key={item.id} className="flex items-center gap-space-sm py-space-sm">
                <div className="flex-1 min-w-0">
                  <p className="font-body-md text-body-md text-on-surface truncate">{item.description ?? item.category?.name ?? t("dashboard.movementFallback")}</p>
                  <p className="font-body-sm text-body-sm text-on-surface-variant">{formatShortDate(item.transactionDate)} · {item.category?.name ?? "—"}</p>
                </div>
                <p className={`tnum font-body-md text-body-md shrink-0 ${item.type === "INCOME" ? "text-tertiary" : "text-on-surface"}`}>
                  {item.type === "INCOME" ? "+" : "−"}{formatEUR(item.amount)}
                </p>
                {showTrash ? (
                  <button type="button" onClick={() => onRestore(item.id)} className="h-9 px-3 rounded-lg border border-outline-variant font-label-md text-label-md shrink-0">{t("common.restore")}</button>
                ) : (
                  <button type="button" onClick={() => onDelete(item.id)} className="h-9 px-3 rounded-lg border border-error-container text-on-error-container font-label-md text-label-md shrink-0">{t("common.delete")}</button>
                )}
              </li>
            ))}
          </ul>
        )}
        {meta && <p className="mt-space-sm font-body-sm text-body-sm text-on-surface-variant">{t("common.total")} {meta.total}</p>}
      </Card>
    </AppShell>
  );
}

// Oggi in formato YYYY-MM-DD per l'input date.
function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
