import { useEffect, useState } from "react";
import AppShell from "../components/AppShell.jsx";
import { ErrorAlert, Field, PrimaryButton, Select, TextInput, TrashToggle } from "../components/forms.jsx";
import { Card, Chip, ProgressBar, SectionTitle } from "../components/ui.jsx";
import { categoriesApi, debtsApi } from "../lib/api.js";
import { formatEUR, formatShortDate } from "../lib/format.js";

// Piani di rientro: lista debiti con rate, pagamento rate,
// nuovo debito, nuova rata, cestino con ripristino.
const DEBT_TYPE_LABELS = { BNPL: "BNPL", CREDIT_CARD: "Carta", PERSONAL_LOAN: "Prestito", MORTGAGE: "Mutuo", OTHER: "Altro" };

export default function Debts() {
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
      await reload();
      // Rileggi il dettaglio aggiornato per mostrare la nuova rata.
      const fresh = await debtsApi.list({ limit: 50 });
      setItems(fresh.items);
    } catch (err) {
      setError(err);
    }
  }

  // Paga una rata: serve la categoria per la transazione generata.
  async function onPay(paymentId) {
    if (!payCat) {
      setError({ message: "Scegli la categoria per registrare il pagamento." });
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
    if (!window.confirm("Spostare debito e rate nel cestino? Potrai ripristinarli.")) return;
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
      <SectionTitle kicker="Rientro" title="Debiti" action={<button type="button" onClick={() => setShowForm((v) => !v)} className="h-10 px-3.5 rounded-lg bg-primary font-label-md text-label-md text-on-primary">+ Nuovo</button>} />
      <div className="mt-space-md">
        <TrashToggle showTrash={showTrash} onChange={(v) => { setShowTrash(v); setSelectedId(null); }} />
      </div>
      <div className="mt-space-sm">
        <ErrorAlert error={error} onClose={() => setError(null)} />
      </div>

      {showForm && (
        <Card className="mt-space-md">
          <form onSubmit={onCreate} className="flex flex-col gap-space-sm">
            <Field label="CREDITORE">
              <TextInput required value={form.creditorName} onChange={(e) => set("creditorName", e.target.value)} placeholder="Es. Scalapay" />
            </Field>
            <div className="grid grid-cols-2 gap-space-sm">
              <Field label="TIPO">
                <Select value={form.debtType} onChange={(e) => set("debtType", e.target.value)}>
                  {Object.entries(DEBT_TYPE_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </Select>
              </Field>
              <Field label="INIZIO">
                <TextInput required type="date" value={form.startDate} onChange={(e) => set("startDate", e.target.value)} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-space-sm">
              <Field label="TOTALE €">
                <TextInput required inputMode="decimal" placeholder="1200.00" value={form.totalAmount} onChange={(e) => set("totalAmount", e.target.value)} />
              </Field>
              <Field label="RATA MENSILE €">
                <TextInput required inputMode="decimal" placeholder="100.00" value={form.monthlyPayment} onChange={(e) => set("monthlyPayment", e.target.value)} />
              </Field>
            </div>
            <PrimaryButton busy={busy}>Salva debito</PrimaryButton>
          </form>
        </Card>
      )}

      <div className="flex flex-col gap-space-md mt-space-md">
        {items.length === 0 && (
          <Card><p className="font-body-md text-body-md text-on-surface-variant">{showTrash ? "Cestino vuoto." : "Nessun debito. Puoi crearne uno col bottone + Nuovo."}</p></Card>
        )}
        {items.map((d) => (
          <Card key={d.id}>
            <div className="flex items-baseline justify-between gap-space-sm">
              <p className="font-headline-sm text-headline-sm text-on-surface truncate">{d.creditorName}</p>
              {d.status === "PAID_OFF" ? <Chip tone="teal">Estinto</Chip> : d.status === "DEFAULTED" ? <Chip tone="amber">Sconfinato</Chip> : <Chip tone="indigo">{DEBT_TYPE_LABELS[d.debtType] ?? d.debtType}</Chip>}
            </div>
            <p className="tnum font-body-md text-body-md text-on-surface mt-space-xs">
              Residuo {formatEUR(d.remainingAmount)} di {formatEUR(d.totalAmount)} · {paidPct(d)}% estinto
            </p>
            <div className="mt-space-xs"><ProgressBar value={paidPct(d)} tone="teal" /></div>
            <div className="flex flex-wrap gap-space-sm mt-space-sm">
              {!showTrash && (
                <>
                  <button type="button" onClick={() => setSelectedId(selectedId === d.id ? null : d.id)} className="h-9 px-3 rounded-lg border border-outline-variant font-label-md text-label-md">
                    {selectedId === d.id ? "Chiudi rate" : `Rate (${d.payments?.length ?? 0})`}
                  </button>
                  <button type="button" onClick={() => onDelete(d.id)} className="h-9 px-3 rounded-lg border border-error-container text-on-error-container font-label-md text-label-md">Cestina</button>
                </>
              )}
              {showTrash && (
                <button type="button" onClick={() => onRestore(d.id)} className="h-9 px-3 rounded-lg border border-outline-variant font-label-md text-label-md">Ripristina</button>
              )}
            </div>

            {selectedId === d.id && selected && !showTrash && (
              <div className="mt-space-md border-t border-hairline pt-space-sm">
                <Field label="CATEGORIA PER I PAGAMENTI">
                  <Select value={payCat} onChange={(e) => setPayCat(e.target.value)}>
                    <option value="">Scegli…</option>
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
                          Scade {formatShortDate(p.dueDate)}{p.paidDate ? ` · pagata ${formatShortDate(p.paidDate)}` : ""}
                        </p>
                      </div>
                      {p.status === "PAID" ? (
                        <Chip tone="teal">Pagata</Chip>
                      ) : (
                        <button type="button" onClick={() => onPay(p.id)} className="h-9 px-3 rounded-lg bg-primary font-label-md text-label-md text-on-primary shrink-0">Paga</button>
                      )}
                    </li>
                  ))}
                  {(selected.payments ?? []).length === 0 && (
                    <p className="font-body-md text-body-md text-on-surface-variant py-space-sm">Nessuna rata registrata.</p>
                  )}
                </ul>
                <button type="button" onClick={() => setShowPayForm((v) => !v)} className="mt-space-sm h-9 px-3 rounded-lg border border-outline-variant font-label-md text-label-md">
                  {showPayForm ? "Chiudi" : "+ Nuova rata"}
                </button>
                {showPayForm && (
                  <form onSubmit={onCreatePayment} className="grid grid-cols-2 gap-space-sm mt-space-sm">
                    <Field label="IMPORTO €">
                      <TextInput required inputMode="decimal" placeholder="100.00" value={newPay.amount} onChange={(e) => setNewPay({ ...newPay, amount: e.target.value })} />
                    </Field>
                    <Field label="SCADENZA">
                      <TextInput required type="date" value={newPay.dueDate} onChange={(e) => setNewPay({ ...newPay, dueDate: e.target.value })} />
                    </Field>
                    <div className="col-span-2">
                      <PrimaryButton busy={busy}>Aggiungi rata</PrimaryButton>
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
