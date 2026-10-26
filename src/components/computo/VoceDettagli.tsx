/**
 * «Dettagli» di una voce del computo, uguale negli otto preventivatori edili: ambiente, misure (come si ricava la
 * quantità), ore previste, marca e modello, nota interna. (La voce opzionale arriva a parte: tocca i totali.)
 *
 * Chiuso mostra una riga di sintesi, così la voce resta pulita; si apre solo per chi ne ha bisogno. La nota interna
 * è dichiarata «solo per te»: non esce mai nel PDF del cliente. Le misure non cambiano la quantità da sole: si
 * applicano con un pulsante, e se la quantità della voce è diversa lo dicono.
 */
import { useState } from "react";
import { ChevronDown, Plus, Ruler, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import {
  MAX_MISURE_PER_VOCE, quantitaDaMisure, quantitaRigaMisura, type DettagliVoce, type MisuraRiga,
} from "@/lib/computo/vociDettagli";

export const AMBIENTI_COMUNI = ["Bagno", "Cucina", "Soggiorno", "Camera", "Corridoio", "Ingresso", "Studio", "Lavanderia", "Terrazzo", "Esterno", "Tutta la casa"];

interface Props {
  voce: DettagliVoce & { quantita: number; unita_misura: string };
  onChange: (patch: Partial<DettagliVoce> & { quantita?: number }) => void;
  /** Un id unico per i campi (più voci nella stessa pagina). */
  idBase: string;
}

const num = (raw: string): number | null => {
  const t = raw.trim();
  if (!t) return null;
  const v = Number(t.replace(",", "."));
  return Number.isFinite(v) ? v : null;
};
const it = (v: number) => v.toLocaleString("it-IT", { maximumFractionDigits: 4 });

export function VoceDettagli({ voce, onChange, idBase }: Props) {
  const [aperto, setAperto] = useState(false);
  const misure = voce.misure ?? [];
  const daMisure = quantitaDaMisure(misure);
  const diversa = daMisure !== null && Math.abs(daMisure - (Number(voce.quantita) || 0)) > 0.0001;

  const sintesi = [
    voce.ambiente?.trim() ? voce.ambiente.trim() : null,
    misure.length ? `${misure.length} ${misure.length === 1 ? "misura" : "misure"}` : null,
    voce.ore_previste ? `${it(voce.ore_previste)} h` : null,
    [voce.marca, voce.modello].filter((x) => x?.trim()).join(" ") || null,
    voce.note_interne?.trim() ? "nota interna" : null,
  ].filter(Boolean).join(" · ");

  const setMisura = (i: number, patch: Partial<MisuraRiga>) =>
    onChange({ misure: misure.map((m, k) => (k === i ? { ...m, ...patch } : m)) });
  const aggiungiMisura = () =>
    misure.length < MAX_MISURE_PER_VOCE && onChange({ misure: [...misure, { descrizione: "", parti: 1, lunghezza: null, larghezza: null, altezza: null }] });

  return (
    <Collapsible open={aperto} onOpenChange={setAperto} className="w-full">
      <CollapsibleTrigger asChild>
        <button type="button" className="flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left text-[11px] text-muted-foreground hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">
          <ChevronDown className={cn("h-3 w-3 shrink-0 transition-transform", aperto && "rotate-180")} aria-hidden />
          <span className="font-medium">Dettagli</span>
          {!aperto && sintesi && <span className="truncate">· {sintesi}</span>}
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-2 space-y-3 rounded-md border bg-muted/20 p-3">
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(11rem,100%),1fr))] gap-3">
            <div className="space-y-1">
              <Label htmlFor={`${idBase}-amb`} className="text-xs">Ambiente</Label>
              <Input id={`${idBase}-amb`} list={`${idBase}-amb-l`} value={voce.ambiente ?? ""} maxLength={80} placeholder="es. Bagno" className="h-8"
                onChange={(e) => onChange({ ambiente: e.target.value })} />
              <datalist id={`${idBase}-amb-l`}>{AMBIENTI_COMUNI.map((a) => <option key={a} value={a} />)}</datalist>
            </div>
            <div className="space-y-1">
              <Label htmlFor={`${idBase}-ore`} className="text-xs">Ore previste (ore-persona)</Label>
              <Input id={`${idBase}-ore`} inputMode="decimal" value={voce.ore_previste ?? ""} placeholder="stima dal costo" className="h-8"
                onChange={(e) => onChange({ ore_previste: num(e.target.value) })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`${idBase}-marca`} className="text-xs">Marca</Label>
              <Input id={`${idBase}-marca`} value={voce.marca ?? ""} maxLength={80} className="h-8" onChange={(e) => onChange({ marca: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`${idBase}-modello`} className="text-xs">Modello</Label>
              <Input id={`${idBase}-modello`} value={voce.modello ?? ""} maxLength={80} className="h-8" onChange={(e) => onChange({ modello: e.target.value })} />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-1.5 text-xs font-medium"><Ruler className="h-3.5 w-3.5" aria-hidden /> Misure (come si ricava la quantità)</p>
              <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-[11px]" onClick={aggiungiMisura} disabled={misure.length >= MAX_MISURE_PER_VOCE}>
                <Plus className="mr-1 h-3 w-3" aria-hidden /> Aggiungi misura
              </Button>
            </div>
            {misure.length > 0 && (
              <div className="space-y-1.5">
                <div className="overflow-x-auto"><div className="min-w-[34rem] space-y-1.5">
                <div className="grid grid-cols-[1fr_4rem_4.5rem_4.5rem_4.5rem_4.5rem_1.75rem] gap-1.5 px-0.5 text-[10px] text-muted-foreground">
                  <span>Descrizione</span><span>Parti</span><span>Lunghezza</span><span>Larghezza</span><span>Altezza</span><span className="text-right">Totale</span><span />
                </div>
                {misure.map((m, i) => (
                  <div key={i} className="grid grid-cols-[1fr_4rem_4.5rem_4.5rem_4.5rem_4.5rem_1.75rem] items-center gap-1.5">
                    <Input aria-label={`Descrizione misura ${i + 1}`} value={m.descrizione} maxLength={120} placeholder="es. parete lunga" className="h-8 text-xs"
                      onChange={(e) => setMisura(i, { descrizione: e.target.value })} />
                    <Input aria-label={`Parti uguali, misura ${i + 1}`} inputMode="decimal" value={m.parti} className="h-8 text-xs tabular-nums"
                      onChange={(e) => setMisura(i, { parti: num(e.target.value) ?? 0 })} />
                    <Input aria-label={`Lunghezza, misura ${i + 1}`} inputMode="decimal" value={m.lunghezza ?? ""} className="h-8 text-xs tabular-nums"
                      onChange={(e) => setMisura(i, { lunghezza: num(e.target.value) })} />
                    <Input aria-label={`Larghezza, misura ${i + 1}`} inputMode="decimal" value={m.larghezza ?? ""} className="h-8 text-xs tabular-nums"
                      onChange={(e) => setMisura(i, { larghezza: num(e.target.value) })} />
                    <Input aria-label={`Altezza, misura ${i + 1}`} inputMode="decimal" value={m.altezza ?? ""} className="h-8 text-xs tabular-nums"
                      onChange={(e) => setMisura(i, { altezza: num(e.target.value) })} />
                    <span className="text-right text-xs tabular-nums">{it(quantitaRigaMisura(m))}</span>
                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7" aria-label={`Togli la misura ${i + 1}`}
                      onClick={() => onChange({ misure: misure.filter((_, k) => k !== i) })}><Trash2 className="h-3.5 w-3.5" aria-hidden /></Button>
                  </div>
                ))}
                </div></div>
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs">
                  <span>Dalle misure: <strong className="tabular-nums">{daMisure === null ? "—" : `${it(daMisure)} ${voce.unita_misura}`}</strong>
                    {diversa && <span className="ml-2 text-amber-700">La quantità della voce è {it(Number(voce.quantita) || 0)}: diversa.</span>}
                    {daMisure !== null && !diversa && <span className="ml-2 text-emerald-700">Coincide con la quantità.</span>}
                  </span>
                  {diversa && daMisure !== null && (
                    <Button type="button" size="sm" variant="secondary" className="h-7 px-2 text-[11px]" onClick={() => onChange({ quantita: daMisure })}>Usa come quantità</Button>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground">Le dimensioni lasciate vuote non contano: una parete in mq non ha spessore.</p>
              </div>
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor={`${idBase}-nota`} className="text-xs">Nota interna <span className="font-normal text-muted-foreground">· solo per te, non compare nel PDF del cliente</span></Label>
            <textarea id={`${idBase}-nota`} value={voce.note_interne ?? ""} maxLength={2000} rows={2}
              className="w-full rounded-md border bg-background px-3 py-1.5 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
              onChange={(e) => onChange({ note_interne: e.target.value })} />
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export default VoceDettagli;
