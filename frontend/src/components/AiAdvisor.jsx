import { Card, Chip, SectionTitle } from "./ui.jsx";

// PLACEHOLDER statico dal mock Stitch: il motore IA non esiste ancora.
// Mostra il formato del futuro consiglio (estinzione anticipata con numeri)
// ma nessun dato è calcolato: va sostituito in F-IA.
export default function AiAdvisor() {
  return (
    <Card>
      <SectionTitle kicker="Consulente IA" title="Opportunità estinzione" action={<Chip tone="indigo">Anteprima statica</Chip>} />
      <p className="font-body-md text-body-md text-on-surface-variant">
        Esempio dal design: estinguere in anticipo un debito con i risparmi eccedenti
        riduce interessi e libera liquidità mensile. I consigli reali, calcolati sui
        tuoi debiti, arrivano con il motore IA.
      </p>
      <div className="flex gap-space-sm mt-space-md">
        <button type="button" disabled className="h-10 px-3.5 rounded-lg bg-primary/40 font-label-md text-label-md text-on-primary" title="Disponibile con il motore IA">
          Applica al piano
        </button>
      </div>
    </Card>
  );
}
