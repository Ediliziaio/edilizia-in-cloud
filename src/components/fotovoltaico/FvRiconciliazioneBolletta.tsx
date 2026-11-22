import { riconciliaBollettaFv } from "../../../supabase/functions/_shared/fvRiconciliazioneBolletta";
const euro = (n: number | null) => n == null ? "Da completare" : new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", useGrouping: "always" }).format(n);

export function FvRiconciliazioneBolletta({ consumo, costoKwh, fissi, spesaLetta }: Parameters<typeof riconciliaBollettaFv>[0]) {
  const b = riconciliaBollettaFv({ consumo, costoKwh, fissi, spesaLetta });
  return <details className="mt-3 rounded-xl border border-slate-200 p-3 text-sm">
    <summary className="cursor-pointer font-medium">Dalla spesa in bolletta al risparmio stimato</summary>
    <p className="mt-2 text-xs text-slate-600">Confronto ai consumi attuali e alla tariffa usata dal preventivo. Il risparmio riguarda solo l’energia che non acquisti più.</p>
    <dl aria-label="Riconciliazione della spesa annua" className="mt-3 space-y-2 text-xs">
      {[["Spesa annua letta o confermata", b.spesaLetta], ["Quota energia ai consumi attuali", b.energia], ["Quote fisse che restano", b.fissi], ["Totale rappresentato nel modello", b.modellata]].map(([k, v]) => <div key={String(k)} className="flex flex-wrap justify-between gap-2"><dt>{k}</dt><dd className="font-semibold">{euro(v as number | null)}</dd></div>)}
      {b.differenza != null && <div className="flex flex-wrap justify-between gap-2 border-t pt-2"><dt>{b.stato === "superiore" ? "Eccedenza del modello sulla spesa letta" : "Differenza da riconciliare"}</dt><dd className="font-semibold">{euro(Math.abs(b.differenza))}</dd></div>}
    </dl>
    <p role={b.stato === "superiore" ? "status" : undefined} className={`mt-3 text-xs ${b.stato === "coerente" ? "text-emerald-800" : "text-amber-800"}`}>
      {b.stato === "coerente" ? "Energia e quote fisse corrispondono alla spesa annua confermata."
        : b.stato === "superiore" ? "Il modello supera la spesa letta: controlla tariffa, quote fisse e periodo. Il risparmio resta una stima da verificare."
        : b.stato === "residuo" ? "La differenza non è inclusa nel risparmio e non viene attribuita automaticamente ad alcuna voce. Controlla dettaglio degli addebiti, periodo e tariffa."
        : "Completa tariffa e quote fisse per riconciliare il totale. Quote mancanti non vengono considerate pari a zero."}
    </p>
    <p className="mt-2 text-xs text-slate-500">Canone TV, depositi, arretrati e conguagli non diventano risparmio fotovoltaico. Eventuali ricavi per energia immessa sono mostrati separatamente negli scenari.</p>
  </details>;
}
