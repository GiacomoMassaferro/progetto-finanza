import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import AppShell from "../components/AppShell.jsx";
import ConfirmDialog from "../components/ConfirmDialog.jsx";
import { ErrorAlert, Field, PrimaryButton, SegmentedTabs, Select, TextInput } from "../components/forms.jsx";
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
  // Vista corrente: attivi, estinti (PAID_OFF) o cestino.
  const [view, setView] = useState("active");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [showInstForm, setShowInstForm] = useState(false);
  // Form unico adattivo: 4 modalità (split/paid/amortized/bare).
  // bare = debito senza piano rate (ex "+ Nuovo": solo totale + rata mensile).
  const [instMode, setInstMode] = useState("split");
  const [instForm, setInstForm] = useState({ creditorName: "", debtType: "BNPL", totalAmount: "", monthlyPayment: "", installments: "3", firstDueDate: "", installmentAmount: "", paidCount: "", remainingCount: "", financedAmount: "", annualRatePct: "", durationMonths: "", historyCategoryId: "" });
  const [payCat, setPayCat] = useState("");
  const [showPayForm, setShowPayForm] = useState(false);
  const [newPay, setNewPay] = useState({ amount: "", dueDate: "" });
  // Id in attesa di conferma cancellazione (modale invece di window.confirm).
  const [pendingDeleteId, setPendingDeleteId] = useState(null);

  // Ricarica debiti (+ categorie per il pagamento) a ogni cambio vista.
  // Estinti = filtro status PAID_OFF (restano nel DB, fuori dagli attivi).
  useEffect(() => {
    let cancelled = false;
    const loader =
      view === "trash" ? () => debtsApi.trash({ limit: 50 }) : () => debtsApi.list({ limit: 50, status: view === "paidoff" ? "PAID_OFF" : "ACTIVE" });
    loader()
      .then((res) => !cancelled && setItems(res.items))
      .catch((err) => !cancelled && setError(err));
    categoriesApi
      .list({ limit: 100 })
      .then((res) => !cancelled && setCategories(res.items))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [view]);

  const selected = items.find((d) => d.id === selectedId) ?? null;

  // Ricarica la vista corrente dopo ogni operazione.
  async function reload() {
    const res =
      view === "trash"
        ? await debtsApi.trash({ limit: 50 })
        : await debtsApi.list({ limit: 50, status: view === "paidoff" ? "PAID_OFF" : "ACTIVE" });
    setItems(res.items);
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

  // Svuota il form unificato dopo ogni creazione.
  function resetInstForm() {
    setInstForm({ creditorName: "", debtType: "BNPL", totalAmount: "", monthlyPayment: "", installments: "3", firstDueDate: "", installmentAmount: "", paidCount: "", remainingCount: "", financedAmount: "", annualRatePct: "", durationMonths: "", historyCategoryId: "" });
  }

  // Crea debito con o senza piano rate (endpoint dedicati).
  // bare = debito libero senza scadenze (ex "+ Nuovo", POST /debts).
  async function onCreateInstallments(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (instMode === "bare") {
        await debtsApi.create({
          creditorName: instForm.creditorName.trim(),
          debtType: instForm.debtType,
          totalAmount: instForm.totalAmount.replace(",", "."),
          monthlyPayment: instForm.monthlyPayment.replace(",", "."),
          startDate: instForm.firstDueDate,
        });
        setShowInstForm(false);
        resetInstForm();
        setView("active");
        await reload();
        return;
      }
      const base = {
        mode: instMode,
        creditorName: instForm.creditorName.trim(),
        debtType: instForm.debtType,
        startDate: instForm.firstDueDate,
        firstDueDate: instForm.firstDueDate,
      };
      const dot = (v) => v.replace(",", ".");
      const body =
        instMode === "paid"
          ? {
              ...base,
              installmentAmount: dot(instForm.installmentAmount),
              paidCount: Number(instForm.paidCount),
              remainingCount: Number(instForm.remainingCount),
              // Categoria per lo storico: genera le transazioni delle rate
              // già pagate (facoltativo, altrimenti restano senza movimento).
              ...(instForm.historyCategoryId ? { movementsCategoryId: instForm.historyCategoryId } : {}),
            }
          : instMode === "amortized"
            ? {
                ...base,
                financedAmount: dot(instForm.financedAmount),
                ...(instForm.annualRatePct ? { annualRatePct: dot(instForm.annualRatePct) } : {}),
                durationMonths: Number(instForm.durationMonths),
              }
            : {
                ...base,
                totalAmount: dot(instForm.totalAmount),
                installments: Number(instForm.installments),
              };
      await debtsApi.createWithInstallments(body);
      setShowInstForm(false);
      resetInstForm();
      setView("active");
      await reload();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
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
    setPendingDeleteId(null);
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
      <SectionTitle kicker={t("debts.kicker")} title={t("debts.title")} />
      <div className="mt-space-sm">
        <button type="button" onClick={() => setShowInstForm((v) => !v)} className="h-10 w-full rounded-lg bg-primary font-label-md text-label-md text-on-primary">
          {t("debts.newInstallments")}
        </button>
      </div>
      <div className="mt-space-md">
        <SegmentedTabs
          value={view}
          onChange={(v) => { setView(v); setSelectedId(null); }}
          options={[
            { value: "active", label: t("common.active") },
            { value: "paidoff", label: t("debts.paidOffTab") },
            { value: "trash", label: t("common.trash") },
          ]}
        />
      </div>
      <div className="mt-space-sm">
        <ErrorAlert error={error} onClose={() => setError(null)} />
      </div>

      {showInstForm && (
        <Card className="mt-space-md">
          <form onSubmit={onCreateInstallments} className="flex flex-col gap-space-sm">
            <p className="font-body-sm text-body-sm text-on-surface-variant">{t("debts.installmentsHint")}</p>
            <Field label={t("debts.inputMode")}>
              <Select value={instMode} onChange={(e) => setInstMode(e.target.value)}>
                <option value="split">{t("debts.modeSplit")}</option>
                <option value="paid">{t("debts.modePaid")}</option>
                <option value="amortized">{t("debts.modeAmortized")}</option>
                <option value="bare">{t("debts.modeBare")}</option>
              </Select>
            </Field>
            <Field label={t("debts.creditor")}>
              <TextInput required value={instForm.creditorName} onChange={(e) => setInstForm({ ...instForm, creditorName: e.target.value })} placeholder={t("debts.creditorPh")} />
            </Field>
            <div className="grid grid-cols-2 gap-space-sm">
              <Field label={t("debts.type")}>
                <Select value={instForm.debtType} onChange={(e) => setInstForm({ ...instForm, debtType: e.target.value })}>
                  {Object.entries(TYPE_KEYS).map(([v, k]) => (
                    <option key={v} value={v}>{t(`debts.${k}`)}</option>
                  ))}
                </Select>
              </Field>
              {instMode === "bare" ? (
                <Field label={t("debts.start")}>
                  <TextInput required type="date" value={instForm.firstDueDate} onChange={(e) => setInstForm({ ...instForm, firstDueDate: e.target.value })} />
                </Field>
              ) : (
                <Field label={t("debts.firstDue")}>
                  <TextInput required type="date" value={instForm.firstDueDate} onChange={(e) => setInstForm({ ...instForm, firstDueDate: e.target.value })} />
                </Field>
              )}
            </div>
            {instMode === "bare" && (
              <div className="grid grid-cols-2 gap-space-sm">
                <Field label={t("debts.total")}>
                  <TextInput required inputMode="decimal" placeholder="1200.00" value={instForm.totalAmount} onChange={(e) => setInstForm({ ...instForm, totalAmount: e.target.value })} />
                </Field>
                <Field label={t("debts.monthly")}>
                  <TextInput required inputMode="decimal" placeholder="100.00" value={instForm.monthlyPayment} onChange={(e) => setInstForm({ ...instForm, monthlyPayment: e.target.value })} />
                </Field>
              </div>
            )}
            {instMode === "split" && (
              <div className="grid grid-cols-2 gap-space-sm">
                <Field label={t("debts.total")}>
                  <TextInput required inputMode="decimal" placeholder="300.00" value={instForm.totalAmount} onChange={(e) => setInstForm({ ...instForm, totalAmount: e.target.value })} />
                </Field>
                <Field label={t("debts.installmentsCount")}>
                  <TextInput required type="number" min="1" max="60" value={instForm.installments} onChange={(e) => setInstForm({ ...instForm, installments: e.target.value })} />
                </Field>
              </div>
            )}
            {instMode === "paid" && (
              <>
                <div className="grid grid-cols-3 gap-space-sm">
                  <Field label={t("debts.rateAmount")}>
                    <TextInput required inputMode="decimal" placeholder="304.00" value={instForm.installmentAmount} onChange={(e) => setInstForm({ ...instForm, installmentAmount: e.target.value })} />
                  </Field>
                  <Field label={t("debts.paidCount")}>
                    <TextInput required type="number" min="0" max="59" value={instForm.paidCount} onChange={(e) => setInstForm({ ...instForm, paidCount: e.target.value })} />
                  </Field>
                  <Field label={t("debts.remainingCount")}>
                    <TextInput required type="number" min="1" max="60" value={instForm.remainingCount} onChange={(e) => setInstForm({ ...instForm, remainingCount: e.target.value })} />
                  </Field>
                </div>
                {instForm.installmentAmount && instForm.paidCount !== "" && instForm.remainingCount !== "" && (
                  <p className="font-body-md text-body-md text-on-surface-variant">
                    {t("debts.paidSummary", {
                      paid: formatEUR(Number(instForm.installmentAmount.replace(",", ".")) * Number(instForm.paidCount || 0)),
                      left: formatEUR(Number(instForm.installmentAmount.replace(",", ".")) * Number(instForm.remainingCount || 0)),
                    })}
                  </p>
                )}
                <Field label={t("debts.historyCategory")}>
                  <Select value={instForm.historyCategoryId} onChange={(e) => setInstForm({ ...instForm, historyCategoryId: e.target.value })}>
                    <option value="">{t("debts.historyCategoryNone")}</option>
                    {categories.filter((c) => c.type === "EXPENSE").map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </Select>
                </Field>
              </>
            )}
            {instMode === "amortized" && (
              <div className="grid grid-cols-2 gap-space-sm">
                <Field label={t("debts.financedAmount")}>
                  <TextInput required inputMode="decimal" placeholder="10000.00" value={instForm.financedAmount} onChange={(e) => setInstForm({ ...instForm, financedAmount: e.target.value })} />
                </Field>
                <Field label={t("debts.annualRate")}>
                  <TextInput inputMode="decimal" placeholder="6.00" value={instForm.annualRatePct} onChange={(e) => setInstForm({ ...instForm, annualRatePct: e.target.value })} />
                </Field>
              </div>
            )}
            {instMode === "amortized" && (
              <Field label={t("debts.durationMonths")}>
                <TextInput required type="number" min="1" max="360" value={instForm.durationMonths} onChange={(e) => setInstForm({ ...instForm, durationMonths: e.target.value })} />
              </Field>
            )}
            {instMode === "split" && instForm.totalAmount && Number(instForm.installments) > 0 && (
              <p className="font-body-md text-body-md text-on-surface-variant">
                {t("debts.estimatedRate")}: {formatEUR(Number(instForm.totalAmount.replace(",", ".")) / Number(instForm.installments))}/mese × {instForm.installments}
              </p>
            )}
            <PrimaryButton busy={busy}>{instMode === "bare" ? t("debts.save") : t("debts.createInstallments")}</PrimaryButton>
          </form>
        </Card>
      )}

      <div className="flex flex-col gap-space-md mt-space-md">
        {items.length === 0 && (
          <Card><p className="font-body-md text-body-md text-on-surface-variant">{view === "trash" ? t("common.emptyTrash") : view === "paidoff" ? t("debts.noPaidOff") : t("debts.noDebts")}</p></Card>
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
              {view !== "trash" && (
                <>
                  <button type="button" onClick={() => setSelectedId(selectedId === d.id ? null : d.id)} className="h-9 px-3 rounded-lg border border-outline-variant font-label-md text-label-md">
                    {selectedId === d.id ? t("debts.closeRates") : `${t("debts.rates")} (${d.payments?.length ?? 0})`}
                  </button>
                  <button type="button" onClick={() => setPendingDeleteId(d.id)} className="h-9 px-3 rounded-lg border border-error-container text-on-error-container font-label-md text-label-md">{t("common.delete")}</button>
                </>
              )}
              {view === "trash" && (
                <button type="button" onClick={() => onRestore(d.id)} className="h-9 px-3 rounded-lg border border-outline-variant font-label-md text-label-md">{t("common.restore")}</button>
              )}
            </div>

            {selectedId === d.id && selected && view !== "trash" && (
              <div className="mt-space-md border-t border-hairline pt-space-sm">
                {view === "active" && (
                <Field label={t("debts.payCategory")}>
                  <Select value={payCat} onChange={(e) => setPayCat(e.target.value)}>
                    <option value="">{t("transactions.choose")}</option>
                    {categories.filter((c) => c.type === "EXPENSE").map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </Select>
                </Field>
                )}
                <ul className="flex flex-col divide-y divide-hairline mt-space-sm">
                  {(selected.payments ?? []).map((p) => (
                    <li key={p.id} className="flex items-center gap-space-sm py-space-sm">
                      <div className="flex-1 min-w-0">
                        <p className="tnum font-body-md text-body-md text-on-surface">{formatEUR(p.amount)}</p>
                        <p className="font-body-sm text-body-sm text-on-surface-variant">
                          {t("debts.dueOn")} {formatShortDate(p.dueDate)}{p.paidDate ? ` · ${t("debts.paidOn")} ${formatShortDate(p.paidDate)}` : ""}
                        </p>
                      </div>
                      {p.status === "PAID" || view !== "active" ? (
                        <Chip tone={p.status === "PAID" ? "teal" : "indigo"}>{p.status === "PAID" ? t("debts.paid") : p.status}</Chip>
                      ) : (
                        <button type="button" onClick={() => onPay(p.id)} className="h-9 px-3 rounded-lg bg-primary font-label-md text-label-md text-on-primary shrink-0">{t("debts.pay")}</button>
                      )}
                    </li>
                  ))}
                  {(selected.payments ?? []).length === 0 && (
                    <p className="font-body-md text-body-md text-on-surface-variant py-space-sm">{t("debts.noRates")}</p>
                  )}
                </ul>
                {view === "active" && (
                <>
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
                </>
                )}
              </div>
            )}
          </Card>
        ))}
      </div>
      <ConfirmDialog
        open={pendingDeleteId !== null}
        message={t("debts.confirmDelete")}
        onConfirm={() => onDelete(pendingDeleteId)}
        onCancel={() => setPendingDeleteId(null)}
      />
    </AppShell>
  );
}
