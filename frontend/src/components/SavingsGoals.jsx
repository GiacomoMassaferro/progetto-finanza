import { Card, Chip, ProgressBar, SectionTitle } from "./ui.jsx";

// PLACEHOLDER statico dal mock Stitch: gli obiettivi di risparmio non hanno
// ancora un modello nel backend. Dati finti dichiarati, da collegare in F3+.
const MOCK_GOALS = [
  { name: "Fondo Emergenza", target: "€ 5.000", saved: "€ 4.500", pct: 90 },
  { name: "Fondo Spese Previste", target: "€ 3.000", saved: "€ 1.920", pct: 64 },
];

export default function SavingsGoals() {
  return (
    <Card>
      <SectionTitle kicker="Risparmio" title="Obiettivi e riserve" action={<Chip tone="indigo">Anteprima statica</Chip>} />
      <div className="flex flex-col gap-space-md">
        {MOCK_GOALS.map((g) => (
          <div key={g.name}>
            <div className="flex items-baseline justify-between">
              <p className="font-headline-sm text-headline-sm text-on-surface">{g.name}</p>
              <p className="tnum font-body-md text-body-md text-on-surface-variant">{g.saved} / {g.target}</p>
            </div>
            <div className="mt-space-xs">
              <ProgressBar value={g.pct} tone="teal" />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
