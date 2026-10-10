import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";
import AppShell from "../components/AppShell.jsx";
import { ErrorAlert, Field, PrimaryButton, Select, TextInput, TrashToggle } from "../components/forms.jsx";
import { Card, Chip, SectionTitle } from "../components/ui.jsx";
import { categoriesApi } from "../lib/api.js";

// Categorie + conto: lista, creazione, ridenominazione, cestino con
// ripristino. In fondo il box account (email + logout).
export default function Categories() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [showTrash, setShowTrash] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: "", type: "EXPENSE" });
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState("");

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
    if (!window.confirm("Spostare nel cestino? Potrai ripristinarla.")) return;
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
      <SectionTitle kicker="Organizza" title="Categorie" />
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
              <Field label="NUOVA CATEGORIA">
                <TextInput required placeholder="Es. Trasporti" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </Field>
            </div>
            <div className="w-32">
              <Field label="TIPO">
                <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                  <option value="EXPENSE">Uscita</option>
                  <option value="INCOME">Entrata</option>
                </Select>
              </Field>
            </div>
            <div className="flex items-end">
              <PrimaryButton busy={busy}>Crea</PrimaryButton>
            </div>
          </form>
        </Card>
      )}

      <Card className="mt-space-md">
        {items.length === 0 ? (
          <p className="font-body-md text-body-md text-on-surface-variant">{showTrash ? "Cestino vuoto." : "Nessuna categoria."}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-hairline">
            {items.map((c) => (
              <li key={c.id} className="flex items-center gap-space-sm py-space-sm">
                <div className="flex-1 min-w-0">
                  {editingId === c.id ? (
                    <TextInput autoFocus value={editingName} onChange={(e) => setEditingName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && onRename(c.id)} aria-label="Nuovo nome" />
                  ) : (
                    <>
                      <p className="font-body-md text-body-md text-on-surface truncate">{c.name}</p>
                      <p className="font-body-sm text-body-sm text-on-surface-variant">{c.type === "INCOME" ? "Entrata" : "Uscita"}</p>
                    </>
                  )}
                </div>
                {showTrash ? (
                  <button type="button" onClick={() => onRestore(c.id)} className="h-9 px-3 rounded-lg border border-outline-variant font-label-md text-label-md shrink-0">Ripristina</button>
                ) : editingId === c.id ? (
                  <>
                    <button type="button" onClick={() => onRename(c.id)} className="h-9 px-3 rounded-lg bg-primary font-label-md text-label-md text-on-primary shrink-0">Salva</button>
                    <button type="button" onClick={() => setEditingId(null)} className="h-9 px-3 rounded-lg border border-outline-variant font-label-md text-label-md shrink-0">Annulla</button>
                  </>
                ) : (
                  <>
                    <button type="button" onClick={() => { setEditingId(c.id); setEditingName(c.name); }} className="h-9 px-3 rounded-lg border border-outline-variant font-label-md text-label-md shrink-0">Rinomina</button>
                    <button type="button" onClick={() => onDelete(c.id)} className="h-9 px-3 rounded-lg border border-error-container text-on-error-container font-label-md text-label-md shrink-0">Cestina</button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="mt-space-md">
        <SectionTitle kicker="Conto" title="Account" />
        <p className="font-body-md text-body-md text-on-surface">{user?.email}</p>
        <div className="mt-space-sm flex items-center gap-space-sm">
          <Chip tone="teal">Sessione attiva</Chip>
          <button type="button" onClick={onLogout} className="h-9 px-3 rounded-lg border border-outline-variant font-label-md text-label-md">Esci</button>
        </div>
      </Card>
    </AppShell>
  );
}
