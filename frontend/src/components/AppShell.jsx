import { Link, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext.jsx";

// Guscio app: header fisso + contenuto + nav desktop in alto.
// Su mobile la navigazione è un menù a scomparsa (hamburger -> drawer
// laterale): niente barra fissa in basso, pagina pulita.
const TABS = [
  { to: "/", label: "Dashboard" },
  { to: "/debts", label: "Rientro" },
  { to: "/transactions", label: "Transazioni" },
  { to: "/categories", label: "Categorie" },
];

export default function AppShell({ children }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  // Apertura del drawer mobile + flag di chiusura animata.
  const [menuOpen, setMenuOpen] = useState(false);
  const [closing, setClosing] = useState(false);

  // Chiusura animata: prima parte l'animazione di uscita (150ms),
  // poi il menù viene smontato. Apertura immediata con animazione di entrata.
  function closeMenu() {
    if (!menuOpen || closing) return;
    setClosing(true);
    setTimeout(() => {
      setMenuOpen(false);
      setClosing(false);
    }, 150);
  }

  // Chiude il menù col tasto Esc (accessibilità).
  useEffect(() => {
    if (!menuOpen) return;
    function onKey(e) {
      if (e.key === "Escape") closeMenu();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  // Chiude il menù a ogni cambio pagina (anche col back del browser).
  useEffect(() => {
    setMenuOpen(false);
    setClosing(false);
  }, [location.pathname]);

  function onLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  const initial = (user?.firstName?.[0] ?? user?.email?.[0] ?? "?").toUpperCase();

  return (
    <div className="min-h-screen bg-surface text-on-surface">
      <header className="fixed top-0 w-full z-50 bg-surface/85 backdrop-blur border-b border-hairline">
        <div className="h-16 px-margin flex items-center justify-between gap-space-sm max-w-5xl mx-auto">
          <div className="flex items-center gap-space-sm min-w-0">
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-label="Apri menù"
              className="md:hidden w-10 h-10 rounded-lg flex flex-col items-center justify-center gap-1 border border-outline-variant"
            >
              <span className="block w-5 h-0.5 bg-on-surface" />
              <span className="block w-5 h-0.5 bg-on-surface" />
              <span className="block w-5 h-0.5 bg-on-surface" />
            </button>
            <Link to="/" className="flex items-center gap-space-sm min-w-0">
            <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center shrink-0">
              <span className="font-headline-sm text-headline-sm text-on-primary">P</span>
            </div>
            <div className="flex flex-col min-w-0">
              <span className="font-headline-sm text-headline-sm text-on-surface truncate">Project Finance</span>
              <span className="font-label-xs text-label-xs text-on-surface-variant uppercase">Solvenza algoritmica</span>
            </div>
          </Link>
          </div>
          <nav className="hidden md:flex items-center gap-space-sm">
            {TABS.map((t) => (
              <Link
                key={t.to}
                to={t.to}
                className={`px-3 py-1.5 rounded-lg font-label-md text-label-md ${
                  location.pathname === t.to ? "bg-surface-container text-on-surface" : "text-on-surface-variant"
                }`}
              >
                {t.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-space-xs shrink-0">
            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center" title={user?.email}>
              <span className="font-label-md text-label-md text-on-primary">{initial}</span>
            </div>
            <button type="button" onClick={onLogout} className="hidden md:block h-9 px-3 rounded-lg border border-outline-variant font-label-md text-label-md">
              Esci
            </button>
          </div>
        </div>
      </header>

      <main className="pt-16 pb-space-lg px-margin">
        <div className="mx-auto w-full max-w-5xl py-space-md">{children}</div>
      </main>

      {menuOpen && (
        <div className="md:hidden fixed inset-0 z-50">
          <div className={`absolute inset-0 bg-on-surface/40 ${closing ? "anim-backdrop-out" : "anim-backdrop-in"}`} onClick={closeMenu} aria-hidden="true" />
          <aside className={`absolute left-0 top-0 h-full w-72 max-w-[85vw] bg-surface-container-lowest border-r border-hairline p-space-md flex flex-col ${closing ? "anim-drawer-out" : "anim-drawer-in"}`}>
            <div className="flex items-center justify-between">
              <p className="font-headline-sm text-headline-sm text-on-surface">Project Finance</p>
              <button type="button" onClick={closeMenu} aria-label="Chiudi menù" className="w-10 h-10 rounded-lg border border-outline-variant font-headline-sm text-headline-sm">×</button>
            </div>
            <nav className="flex flex-col gap-space-xs mt-space-lg">
              {TABS.map((t) => (
                <Link
                  key={t.to}
                  to={t.to}
                  className={`px-3 py-2.5 rounded-lg font-headline-sm text-headline-sm ${
                    location.pathname === t.to ? "bg-surface-container text-on-surface" : "text-on-surface-variant"
                  }`}
                >
                  {t.label}
                </Link>
              ))}
            </nav>
            <div className="mt-auto border-t border-hairline pt-space-sm">
              <p className="font-body-sm text-body-sm text-on-surface-variant truncate">{user?.email}</p>
              <button type="button" onClick={onLogout} className="mt-space-xs h-10 w-full rounded-lg border border-outline-variant font-label-md text-label-md">
                Esci
              </button>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
