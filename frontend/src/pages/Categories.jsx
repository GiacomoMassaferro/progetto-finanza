import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../auth/AuthContext.jsx";
import AppShell from "../components/AppShell.jsx";
import ConfirmDialog from "../components/ConfirmDialog.jsx";
import { ErrorAlert, Field, PrimaryButton, Select, TextInput, TrashToggle } from "../components/forms.jsx";
import LanguageSelector from "../components/LanguageSelector.jsx";
import { Card, Chip, SectionTitle } from "../components/ui.jsx";
import { setLanguage } from "../i18n/index.js";
import { authApi, categoriesApi } from "../lib/api.js";

// Categorie + conto: lista, creazione, ridenominazione, cestino con
// ripristino. In fondo il box account (email + logout).
export default function Categories() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [showTrash, setShowTrash] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: "", type: "EXPENSE" });
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState("");
  // Id in attesa di conferma cancellazione (modale invece di window.confirm).
  const [pendingDeleteId, setPendingDeleteId] = useState(null);

  // Ricarica la vista corrente (attivi o cestino).
  async function load(trash) {
    const res = await (trash ? categoriesApi.trash({ limit: 100 }) : categoriesApi.list({ limit: 100 }));
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
      await categoriesApi.create({ name: form.name.trim(), type: form.type });
      setForm({ name: "", type: "EXPENSE" });
      setShowTrash(false);
      await load(false);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  // Salva il nuovo nome della categoria in modifica.
  async function onRename(id) {
    if (!editingName.trim()) {
      setEditingId(null);
      return;
    }
    setError(null);
    try {
      await categoriesApi.update(id, { name: editingName.trim() });
      setEditingId(null);
      await load(showTrash);
    } catch (err) {
      setError(err);
    }
  }

  async function onDelete(id) {
    setPendingDeleteId(null);
    setError(null);
    try {
      await categoriesApi.remove(id);
      await load(showTrash);
    } catch (err) {
      setError(err);
    }
  }

  async function onRestore(id) {
    setError(null);
    try {
      await categoriesApi.restore(id);
      await load(true);
    } catch (err) {
      setError(err);
    }
  }

  function onLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  return (
    <AppShell>
      <SectionTitle kicker={t("categories.kicker")} title={t("categories.title")} />
      <div className="mt-space-md">
        <TrashToggle showTrash={showTrash} onChange={setShowTrash} />
      </div>
      <div className="mt-space-sm">
        <ErrorAlert error={error} onClose={() => setError(null)} />
      </div>

      {!showTrash && (
        <Card className="mt-space-md">
          <form onSubmit={onCreate} className="flex gap-space-sm">
            <div className="flex-1">
              <Field label={t("categories.newCategory")}>
                <TextInput required placeholder={t("categories.newCategoryPh")} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </Field>
            </div>
            <div className="w-32">
              <Field label={t("categories.type")}>
                <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                  <option value="EXPENSE">{t("categories.expense")}</option>
                  <option value="INCOME">{t("categories.income")}</option>
                </Select>
              </Field>
            </div>
            <div className="flex items-end">
              <PrimaryButton busy={busy}>{t("categories.create")}</PrimaryButton>
            </div>
          </form>
        </Card>
      )}

      <Card className="mt-space-md">
        {items.length === 0 ? (
          <p className="font-body-md text-body-md text-on-surface-variant">{showTrash ? t("common.emptyTrash") : t("categories.noCategories")}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-hairline">
            {items.map((c) => (
              <li key={c.id} className="flex items-center gap-space-sm py-space-sm">
                <div className="flex-1 min-w-0">
                  {editingId === c.id ? (
                    <TextInput autoFocus value={editingName} onChange={(e) => setEditingName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && onRename(c.id)} aria-label={t("categories.newName")} />
                  ) : (
                    <>
                      <p className="font-body-md text-body-md text-on-surface truncate">{c.name}</p>
                      <p className="font-body-sm text-body-sm text-on-surface-variant">{c.type === "INCOME" ? t("categories.income") : t("categories.expense")}</p>
                    </>
                  )}
                </div>
                {showTrash ? (
                  <button type="button" onClick={() => onRestore(c.id)} className="h-9 px-3 rounded-lg border border-outline-variant font-label-md text-label-md shrink-0">{t("common.restore")}</button>
                ) : editingId === c.id ? (
                  <>
                    <button type="button" onClick={() => onRename(c.id)} className="h-9 px-3 rounded-lg bg-primary font-label-md text-label-md text-on-primary shrink-0">{t("common.save")}</button>
                    <button type="button" onClick={() => setEditingId(null)} className="h-9 px-3 rounded-lg border border-outline-variant font-label-md text-label-md shrink-0">{t("common.cancel")}</button>
                  </>
                ) : (
                  <>
                    <button type="button" onClick={() => { setEditingId(c.id); setEditingName(c.name); }} className="h-9 px-3 rounded-lg border border-outline-variant font-label-md text-label-md shrink-0">{t("categories.rename")}</button>
                    <button type="button" onClick={() => setPendingDeleteId(c.id)} className="h-9 px-3 rounded-lg border border-error-container text-on-error-container font-label-md text-label-md shrink-0">{t("common.delete")}</button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="mt-space-md">
        <SectionTitle kicker={t("categories.accountKicker")} title={t("categories.accountTitle")} />
        <p className="font-body-md text-body-md text-on-surface">{user?.email}</p>
        <div className="mt-space-sm">
          <Field label={t("categories.language")}>
            <LanguageSelector compact persist />
          </Field>
        </div>
        <div className="mt-space-sm flex items-center gap-space-sm">
          <Chip tone="teal">{t("common.sessionActive")}</Chip>
          <button type="button" onClick={onLogout} className="h-9 px-3 rounded-lg border border-outline-variant font-label-md text-label-md">{t("nav.logout")}</button>
        </div>
      </Card>
      <ConfirmDialog
        open={pendingDeleteId !== null}
        message={t("common.confirmTrash")}
        onConfirm={() => onDelete(pendingDeleteId)}
        onCancel={() => setPendingDeleteId(null)}
      />
    </AppShell>
  );
}
