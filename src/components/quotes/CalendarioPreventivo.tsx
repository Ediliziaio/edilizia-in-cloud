import { ArrowUpRight, CalendarDays, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AnalisiCosti, VoceAnalisi } from "@/lib/preventivi/analisiCosti";
import { formatoDataStima, riepilogoTempistiche } from "@/lib/preventivi/stimaTempistiche";

const giorno = (data: string) => Date.parse(data + "T00:00:00Z") / 86_400_000;

export default function CalendarioPreventivo({ voci, tempistiche, onApri }: {
  voci: readonly VoceAnalisi[];
  tempistiche: AnalisiCosti["tempistiche"];
  onApri?: (id: string) => void;
}) {
  const { gruppi, inizio, fine, pronte, totali, sovrapposte } = riepilogoTempistiche(voci, tempistiche);
  const periodo = inizio && fine ? { inizio: giorno(inizio), giorni: giorno(fine) - giorno(inizio) + 1 } : undefined;
  return <section aria-label="Fasi del calendario" className="space-y-2.5">
    <div className="rounded-xl bg-[#193653] p-3 text-white">
      <p className="text-xs font-medium text-blue-100">Lavorazioni pianificate</p>
      <p className="mt-0.5 flex items-center gap-2 text-base font-semibold tabular-nums">
        <CalendarDays className="h-4 w-4" aria-hidden="true" />{pronte} di {totali}
      </p>
      {fine && <p className="mt-2 border-t border-white/20 pt-2 text-xs text-blue-100">
        {pronte === totali ? "Fine stimata" : "Ultima fine pianificata"} · <strong className="font-semibold text-white">{formatoDataStima(fine)}</strong>
      </p>}
    </div>
    <p className="text-xs text-slate-600">Il calendario usa le date salvate delle voci incluse. Le finestre sovrapposte richiedono la verifica di squadre e dipendenze.</p>
    {gruppi.map(g => <details key={g.fase} className="group rounded-lg border bg-white">
      <summary className="cursor-pointer px-3 py-2.5">
        <span className="font-semibold">{g.fase}</span>
        <span className="ml-2 text-xs text-slate-600">{g.pronte}/{g.righe.length} pianificate</span>
        {sovrapposte.has(g.fase) && <span className="ml-2 text-xs font-medium text-amber-800">Finestre sovrapposte</span>}
        {g.inizio && g.fine && periodo && <span className="mt-1.5 block">
          <span className="block text-xs tabular-nums text-slate-600">{formatoDataStima(g.inizio)} – {formatoDataStima(g.fine)}</span>
          <span className="relative mt-1.5 block h-2 rounded-full bg-slate-100" aria-hidden="true">
            <span className="absolute inset-y-0 rounded-full bg-blue-700" style={{
              left: `${(giorno(g.inizio) - periodo.inizio) * 100 / periodo.giorni}%`,
              width: `${(giorno(g.fine) - giorno(g.inizio) + 1) * 100 / periodo.giorni}%`,
            }} />
          </span>
        </span>}
      </summary>
      <ul className="divide-y border-t">
        {g.righe.map(({ voce, stima, daRicalcolare }) => <li key={voce.id} className="flex items-start justify-between gap-2 px-3 py-2">
          <div className="min-w-0">
            <p className="line-clamp-2 break-words text-sm font-medium">{voce.descrizione}</p>
            <p className="mt-0.5 text-xs text-slate-600">
              {stima ? `${formatoDataStima(stima.inizio)} – ${formatoDataStima(stima.fine)}` : daRicalcolare ? "Voce aggiornata · ricalcola" : "Da pianificare"}
            </p>
            {stima?.fine === fine && fine && <p className="text-xs font-medium text-blue-800">Determina l’ultima fine pianificata</p>}
            {stima?.materialiPronti && <p className="text-xs text-slate-600">Materiali pronti il {formatoDataStima(stima.materialiPronti)}</p>}
            {stima?.impresa && <p className="text-xs text-slate-600">Subappalto dal {formatoDataStima(stima.impresa.inizio)}</p>}
          </div>
          {onApri && <Button type="button" variant="ghost" size="sm" aria-label={`Apri tempistiche di ${voce.descrizione}`} onClick={() => onApri(voce.id)}>
            {stima ? <ArrowUpRight aria-hidden="true" /> : <Clock aria-hidden="true" />}{stima ? "Apri" : "Stima"}
          </Button>}
        </li>)}
      </ul>
    </details>)}
  </section>;
}
