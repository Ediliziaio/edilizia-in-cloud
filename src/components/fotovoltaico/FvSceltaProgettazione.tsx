import { FileText, MapPinned } from "lucide-react";
import { cn } from "@/lib/utils";

export function FvSceltaProgettazione({ senzaMappa, onChange, disabled }: {
  senzaMappa: boolean; onChange: (senzaMappa: boolean) => void; disabled: boolean;
}) {
  return (
    <div role="group" aria-label="Modalità di progettazione" className="mb-4 grid gap-3 sm:grid-cols-2">
      {[
        { rapido: true, titolo: "Preventivo senza mappa", testo: "Scegli pannelli, inverter e accumulo. Puoi aggiungere il disegno in seguito.", Icona: FileText },
        { rapido: false, titolo: "Disegno del tetto", testo: "Disegna le falde e disponi i pannelli. La tavola completa il preventivo del cliente.", Icona: MapPinned },
      ].map(({ rapido, titolo, testo, Icona }) => (
        <button key={titolo} type="button" aria-pressed={senzaMappa === rapido} disabled={disabled}
          onClick={() => onChange(rapido)}
          className={cn("rounded-xl border p-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60",
            senzaMappa === rapido ? "border-orange-500 bg-orange-50 ring-1 ring-orange-500" : "border-slate-200 bg-white hover:border-orange-300")}>
          <span className="flex items-center gap-2 text-sm font-bold text-slate-900"><Icona className="h-4 w-4 text-orange-600" />{titolo}</span>
          <span className="mt-1 block text-xs leading-relaxed text-slate-600">{testo}</span>
        </button>
      ))}
    </div>
  );
}
