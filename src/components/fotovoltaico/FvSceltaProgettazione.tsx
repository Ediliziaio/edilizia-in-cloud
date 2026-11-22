import { FileText, MapPinned } from "lucide-react";
import { cn } from "@/lib/utils";

export function FvSceltaProgettazione({ senzaMappa, onChange, disabled }: {
  senzaMappa: boolean; onChange: (senzaMappa: boolean) => void; disabled: boolean;
}) {
  return (
    <div role="group" aria-label="Modalità di progettazione" className="mb-4 grid grid-cols-2 gap-2 sm:gap-3">
      {[
        { rapido: true, titolo: "Preventivo senza mappa", testo: "Scegli pannelli, inverter e accumulo. Puoi aggiungere il disegno in seguito.", Icona: FileText },
        { rapido: false, titolo: "Disegno del tetto", testo: "Disegna le falde e disponi i pannelli. La tavola completa il preventivo del cliente.", Icona: MapPinned },
      ].map(({ rapido, titolo, testo, Icona }) => (
        <button key={titolo} type="button" aria-label={titolo} aria-pressed={senzaMappa === rapido} disabled={disabled}
          onClick={() => onChange(rapido)}
          className={cn("min-h-11 rounded-xl border p-3 text-left lg:p-4 transition-colors disabled:cursor-not-allowed disabled:opacity-60",
            senzaMappa === rapido ? "border-orange-500 bg-orange-50 ring-1 ring-orange-500" : "border-slate-200 bg-white hover:border-orange-300")}>
          <span className="flex items-center gap-2 text-sm font-bold text-slate-900"><Icona aria-hidden="true" className="size-4 shrink-0 text-orange-600" />
            <span className="max-lg:hidden">{titolo}</span>
            <span className="lg:hidden">{rapido ? "Senza mappa" : "Disegna tetto"}</span>
          </span>
          <span className="mt-1 hidden text-xs leading-relaxed text-slate-600 lg:block">{testo}</span>
        </button>
      ))}
    </div>
  );
}
