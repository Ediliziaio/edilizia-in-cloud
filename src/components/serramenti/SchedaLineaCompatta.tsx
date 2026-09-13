/**
 * La scheda della linea scelta, nel preventivatore: il commerciale vede cosa
 * sta proponendo (foto del profilo, dati tecnici, il testo da leggere al
 * cliente) e ha la scheda del produttore a un clic.
 */
import { FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { datiTecniciScheda, type SchedaLinea } from "@/lib/listino/schedeLinea";

export function SchedaLineaCompatta({ scheda, className }: { scheda: SchedaLinea; className?: string }) {
  const dati = datiTecniciScheda(scheda);
  return (
    <div className={cn("flex gap-3 rounded-md border border-slate-200 bg-white p-2.5", className)}>
      {scheda.immagine_url && (
        <div className="relative h-16 w-20 shrink-0 overflow-hidden rounded border border-slate-100 bg-slate-50">
          <img
            src={scheda.immagine_url}
            alt={`Profilo ${scheda.nome}`}
            loading="lazy"
            className="absolute inset-0 h-full w-full object-contain p-1"
          />
        </div>
      )}
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Linea scelta</p>
        <p className="text-sm font-semibold leading-tight text-slate-900">{scheda.nome}</p>
        {dati.length > 0 && (
          <p className="text-xs tabular-nums text-slate-700">{dati.map((d) => d.breve).join(" · ")}</p>
        )}
        {scheda.descrizione && (
          <p className="line-clamp-3 text-xs leading-snug text-muted-foreground">{scheda.descrizione}</p>
        )}
        {scheda.scheda_tecnica_url && (
          <a
            href={scheda.scheda_tecnica_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 pt-0.5 text-[11px] font-medium text-orange-700 hover:underline"
          >
            <FileText className="h-3 w-3" aria-hidden="true" />
            {scheda.scheda_tecnica_nome || "Scheda del produttore"}
          </a>
        )}
      </div>
    </div>
  );
}
