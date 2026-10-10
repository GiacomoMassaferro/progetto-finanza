import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";

// Pagina di registrazione: stessa card del login (coerenza visiva).
export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await register({ email: email.trim(), password, firstName: firstName.trim() || undefined });
      navigate("/", { replace: true });
    } catch (err) {
      setError(err.details?.join(", ") ?? err.message);
    } finally {
      setBusy(false);
    }
  }

  const inputCls =
    "h-10 w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-3 font-body-md text-body-md text-on-surface focus:border-primary focus:outline-none";

  return (
    <main className="min-h-screen bg-surface flex items-center justify-center px-margin">
      <form onSubmit={onSubmit} className="w-full max-w-sm rounded-xl border border-hairline bg-surface-container-lowest p-space-lg shadow-sm">
        <h1 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface">Crea account</h1>
        <p className="font-body-md text-body-md text-on-surface-variant mt-space-xs">Password di almeno 8 caratteri</p>
        {error && (
          <p role="alert" className="mt-space-md rounded-lg border border-error-container bg-error-container px-3 py-2 font-body-md text-body-md text-on-error-container">
            {error}
          </p>
        )}
        <label className="block mt-space-md font-label-md text-label-md text-on-surface-variant">
          EMAIL
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={`${inputCls} mt-space-xs`} autoComplete="email" />
        </label>
        <label className="block mt-space-sm font-label-md text-label-md text-on-surface-variant">
          NOME (FACOLTATIVO)
          <input value={firstName} onChange={(e) => setFirstName(e.target.value)} className={`${inputCls} mt-space-xs`} autoComplete="given-name" />
        </label>
        <label className="block mt-space-sm font-label-md text-label-md text-on-surface-variant">
          PASSWORD
          <input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} className={`${inputCls} mt-space-xs`} autoComplete="new-password" />
        </label>
        <button type="submit" disabled={busy} className="mt-space-md h-10 w-full rounded-lg bg-primary font-label-md text-label-md text-on-primary disabled:opacity-50">
          {busy ? "Creazione…" : "Registrati"}
        </button>
        <p className="mt-space-sm font-body-md text-body-md text-on-surface-variant">
          Hai già un account? <Link to="/login" className="text-primary">Accedi</Link>
        </p>
      </form>
    </main>
  );
}
