import { useEffect, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { alberoComputo, numeroVoce, tariffaVoce, type NodoComputo, type VoceComputo } from "@/lib/computo/alberoComputo";
import { cn } from "@/lib/utils";
import { formatEuro } from "@/lib/computo/computoStrutturato";

const euro = (n: number | null | undefined) => n == null ? "—" : `${formatEuro(n)} €`;
const numero = (n: number | null | undefined) => n == null ? "" : n.toLocaleString("it-IT", { maximumFractionDigits: 3 });

const idVoceComputo = (numeroOrdine: string) => `computo-voce-${numeroOrdine}`;

function contieneVoce(nodo: NodoComputo, numeroOrdine: string | null): boolean {
  if (!numeroOrdine) return false;
  return nodo.voci.some(v => numeroVoce(v) === numeroOrdine) || nodo.figli.some(f => contieneVoce(f, numeroOrdine));
}

function RigaVoce({ voce, aperta, onToggle, mostraImporti }: { voce: VoceComputo; aperta: boolean; onToggle: () => void; mostraImporti: boolean }) {
  const avvisi = voce.warnings?.filter(Boolean) ?? [];
  const n = numeroVoce(voce);
  return (
    <li id={idVoceComputo(n)} className={cn("scroll-mt-28 border-t first:border-t-0", aperta && "bg-slate-50")}>
      <button type="button" onClick={onToggle} aria-expanded={aperta}
        className="grid w-full grid-cols-[2.5rem_1fr_auto] items-start gap-2 px-2 py-2 text-left text-sm hover:bg-slate-50 sm:grid-cols-[2.5rem_7rem_1fr_9rem_8rem]">
        <span className="font-semibold tabular-nums">{n}</span>
        <span className="hidden truncate font-mono text-xs text-slate-600 sm:block" title={tariffaVoce(voce)}>{tariffaVoce(voce)}</span>
        <span className="min-w-0">
          <span className={cn("block", !aperta && "line-clamp-2")}>{voce.descrizione_breve}</span>
          <span className="mt-1 flex flex-wrap gap-1">
            {voce.is_sicurezza && <Badge variant="outline" className="border-emerald-300 text-emerald-800"><ShieldCheck className="mr-1 h-3 w-3" />Sicurezza</Badge>}
            {voce.is_detrazione && <Badge variant="outline" className="border-rose-300 text-rose-800">Si detrae</Badge>}
            {voce.a_corpo && <Badge variant="outline">A corpo</Badge>}
            {avvisi.length > 0 && <Badge variant="outline" className="border-amber-300 text-amber-800"><AlertTriangle className="mr-1 h-3 w-3" />Da ricontrollare</Badge>}
          </span>
        </span>
        <span className="text-right tabular-nums text-slate-700 max-sm:col-start-3 max-sm:row-start-1">
          {numero(voce.quantita)} {voce.unita_misura}
          {mostraImporti && <span className="block text-xs text-slate-500">× {euro(voce.prezzo_unitario_computo)}</span>}
        </span>
        {mostraImporti && <span className="text-right font-medium tabular-nums max-sm:col-span-3">{euro(voce.importo_computo)}</span>}
      </button>
      {aperta && (
        <div className="space-y-3 px-2 pb-3 sm:pl-12">
          {tariffaVoce(voce) && <p className="text-xs text-slate-500 sm:hidden">Tariffa: <span className="font-mono">{tariffaVoce(voce)}</span></p>}
          <p className="whitespace-pre-line text-sm text-slate-700">{voce.descrizione_estesa || voce.descrizione_breve}</p>
          {voce.misure.length > 0 && (
            <div className="overflow-x-auto rounded border bg-white">
              <table className="w-full min-w-[34rem] text-xs">
                <caption className="sr-only">Righe di misura della voce {n}</caption>
                <thead className="bg-slate-100 text-slate-600">
                  <tr>
                    <th className="px-2 py-1 text-left font-medium">Misura</th>
                    <th className="px-2 py-1 text-right font-medium">par.ug.</th>
                    <th className="px-2 py-1 text-right font-medium">lung.</th>
                    <th className="px-2 py-1 text-right font-medium">larg.</th>
                    <th className="px-2 py-1 text-right font-medium">H/peso</th>
                    <th className="px-2 py-1 text-right font-medium">Quantità</th>
                  </tr>
                </thead>
                <tbody>
                  {voce.misure.map((m, i) => (
                    <tr key={m.id ?? i} className={cn("border-t", (m.quantita ?? 0) < 0 && "text-rose-700")}>
                      <td className="px-2 py-1">
                        {m.descrizione || <span className="text-slate-400">—</span>}
                        {m.formula && <span className="ml-1 font-mono text-[11px] text-slate-500">({m.formula})</span>}
                      </td>
                      <td className="px-2 py-1 text-right tabular-nums">{numero(m.parti_uguali)}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{numero(m.lunghezza)}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{numero(m.larghezza)}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{numero(m.altezza_peso)}</td>
                      <td className="px-2 py-1 text-right font-medium tabular-nums">{numero(m.quantita)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t bg-slate-50 font-semibold">
                    <td className="px-2 py-1" colSpan={5}>{voce.is_detrazione ? "Si detraggono" : "Sommano"} {voce.unita_misura}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{numero(voce.quantita)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
          {avvisi.length > 0 && (
            <ul className="space-y-1 rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
              {avvisi.map(a => <li key={a}>{a}</li>)}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}

export interface EvidenzaVoce { numero: string; volta: number }

function Nodo({ nodo, apertiForzati, voceInEvidenza, vociAperte, toggleVoce, mostraImporti }: {
  nodo: NodoComputo; apertiForzati: boolean; voceInEvidenza: EvidenzaVoce | null;
  vociAperte: (n: string) => boolean; toggleVoce: (n: string) => void; mostraImporti: boolean;
}) {
  // Aperto a mano, oppure perché contiene la voce appena indicata dal controllo dei totali
  // (finché l'utente non lo richiude dopo quell'indicazione).
  const [stato, setStato] = useState({ aperto: nodo.livello === 0, volta: -1 });
  const evidenza = !!voceInEvidenza && voceInEvidenza.volta > stato.volta && contieneVoce(nodo, voceInEvidenza.numero);
  const visibile = apertiForzati || evidenza || stato.aperto;
  const Icona = visibile ? ChevronDown : ChevronRight;
  return (
    <section className={cn(nodo.livello === 0 ? "rounded-lg border bg-white" : "border-t")}>
      <button type="button" onClick={() => setStato({ aperto: !visibile, volta: voceInEvidenza?.volta ?? -1 })} aria-expanded={visibile}
        className={cn("flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-50",
          nodo.livello === 0 && "font-semibold", nodo.livello === 1 && "pl-6 font-medium", nodo.livello === 2 && "pl-9 text-sm")}>
        <Icona className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate">{nodo.nome}</span>
        <span className="hidden text-xs text-slate-500 sm:inline">{nodo.numeroVoci} voci</span>
        {mostraImporti && <span className="tabular-nums">{euro(nodo.importo)}</span>}
        <span className="w-14 text-right text-xs tabular-nums text-slate-500">{nodo.percentuale.toLocaleString("it-IT", { maximumFractionDigits: 1 })}%</span>
      </button>
      {visibile && (
        <div className={cn(nodo.livello === 0 && "pb-1")}>
          {nodo.figli.map(f => (
            <Nodo key={f.chiave} nodo={f} apertiForzati={apertiForzati} voceInEvidenza={voceInEvidenza}
              vociAperte={vociAperte} toggleVoce={toggleVoce} mostraImporti={mostraImporti} />
          ))}
          {nodo.voci.length > 0 && (
            <ul className="mx-2 mb-2 rounded border bg-white">
              {nodo.voci.map(v => (
                <RigaVoce key={v.id} voce={v} aperta={vociAperte(numeroVoce(v))} onToggle={() => toggleVoce(numeroVoce(v))} mostraImporti={mostraImporti} />
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

/** Albero super-categoria › categoria › sotto-categoria con subtotali e voci espandibili. */
export function ComputoAlbero({ voci, totaleComputo, ricercaAttiva, voceInEvidenza, mostraImporti }: {
  voci: VoceComputo[]; totaleComputo: number; ricercaAttiva: boolean; voceInEvidenza: EvidenzaVoce | null; mostraImporti: boolean;
}) {
  const { nodi } = alberoComputo(voci, totaleComputo);
  // Per ogni voce: aperta o chiusa a mano, e a quale «indicazione» risale la scelta.
  const [scelte, setScelte] = useState<Record<string, { aperta: boolean; volta: number }>>({});
  const vociAperte = (n: string) => {
    const scelta = scelte[n];
    if (voceInEvidenza?.numero === n && voceInEvidenza.volta > (scelta?.volta ?? -1)) return true;
    return scelta?.aperta ?? false;
  };
  const toggleVoce = (n: string) => setScelte(prev => ({ ...prev, [n]: { aperta: !vociAperte(n), volta: voceInEvidenza?.volta ?? -1 } }));
  useEffect(() => {
    if (!voceInEvidenza) return;
    const t = window.setTimeout(() => document.getElementById(idVoceComputo(voceInEvidenza.numero))?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
    return () => window.clearTimeout(t);
  }, [voceInEvidenza]);
  if (!voci.length) return <p className="rounded-lg border bg-white p-4 text-sm text-slate-600">Nessuna voce corrisponde alla ricerca.</p>;
  return (
    <div className="space-y-2">
      {nodi.map(n => (
        <Nodo key={n.chiave} nodo={n} apertiForzati={ricercaAttiva} voceInEvidenza={voceInEvidenza}
          vociAperte={vociAperte} toggleVoce={toggleVoce} mostraImporti={mostraImporti} />
      ))}
    </div>
  );
}
