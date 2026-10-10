// Mattoncini UI condivisi col lessico visivo Stitch (card bianche,
// bordi hairline, label tracciate). Mobile-first: base telefono, md: desktop.

// Card bianca con bordo sottile, contenitore di ogni sezione.
export function Card({ children, className = "" }) {
  return (
    <section className={`rounded-xl border border-hairline bg-surface-container-lowest p-space-md shadow-sm ${className}`}>
      {children}
    </section>
  );
}

// Titolo di sezione: etichetta maiuscola + titolo.
export function SectionTitle({ kicker, title, action }) {
  return (
    <div className="flex items-center justify-between mb-space-sm">
      <div>
        {kicker && <p className="font-label-xs text-label-xs uppercase text-on-surface-variant">{kicker}</p>}
        <h2 className="font-headline-sm text-headline-sm text-on-surface">{title}</h2>
      </div>
      {action}
    </div>
  );
}

// Chip di stato: teal = positivo, amber = attenzione, indigo = sistema.
export function Chip({ tone = "teal", children }) {
  const tones = {
    teal: "bg-tertiary-container/15 text-tertiary border-tertiary-fixed-dim",
    amber: "bg-amber-100 text-amber-800 border-amber-200",
    indigo: "bg-primary-fixed text-on-primary-fixed-variant border-inverse-primary",
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-label-xs text-label-xs ${tones[tone]}`}>
      {children}
    </span>
  );
}

// Barra di avanzamento 0-100 con colore semantico.
export function ProgressBar({ value, tone = "primary" }) {
  const colors = { primary: "bg-primary", teal: "bg-tertiary", amber: "bg-amber" };
  const pct = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <div className="h-1.5 w-full rounded-full bg-surface-container" role="progressbar" aria-valuenow={Math.round(pct)}>
      <div className={`h-full rounded-full ${colors[tone]}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

// KPI: etichetta + cifra grande tabellare + nota piccola.
export function KpiCard({ label, value, note }) {
  return (
    <div className="rounded-xl border border-hairline bg-surface-container-lowest p-space-md shadow-sm">
      <p className="font-label-xs text-label-xs uppercase text-on-surface-variant">{label}</p>
      <p className="tnum font-metric-num text-metric-num text-on-surface mt-space-xs">{value}</p>
      {note && <p className="font-body-sm text-body-sm text-on-surface-variant mt-space-xs">{note}</p>}
    </div>
  );
}
