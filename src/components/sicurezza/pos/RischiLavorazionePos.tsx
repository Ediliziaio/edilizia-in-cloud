import { ArrowDown, ArrowUp, ListChecks, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  LIVELLO_RISCHIO_LABEL, applicaValutazione, valutazioneAttiva, valutazioneDaElenchi,
  type Lavorazione, type LivelloRischio, type RischioLavorazione, type ValutazioneLavorazione,
} from "../../../../supabase/functions/_shared/posModello";
import { Area } from "./campi";

interface Props {
  l: Lavorazione;
  n: number;
  ro: boolean;
  /** Modifica questa lavorazione nella bozza (e ne segna le conseguenze: prodotti da riesaminare, scheda da riconfermare). */
  cambia: (fn: (l: Lavorazione) => void) => void;
}

const rigaVuota = (): RischioLavorazione => ({ rischio: "", misure: "", dpi: "", residuo: "" });
const NESSUN_LIVELLO = "nessuno";

/**
 * Rischi, misure e DPI di una lavorazione. Con la tabella ogni rischio ha le sue misure e i suoi DPI (è come li legge
 * l'ispettore e come li chiede la lettera g dell'Allegato XV); senza, restano i tre elenchi di prima, con un pulsante per
 * passare alla tabella senza perdere nulla. I tre elenchi si riscrivono da soli a ogni modifica: controlli, elenco dei DPI
 * del cantiere e app non aggiornate continuano a leggere quelli.
 */
export function RischiLavorazionePos({ l, n, ro, cambia }: Props) {
  const v = valutazioneAttiva(l);
  if (!v) {
    const campo = (k: "rischi" | "misure" | "dpi", label: string, righe: number, placeholder: string) => (
      <Area id={`lv-${n}-${k}`} label={label} rows={righe} value={l[k]} readOnly={ro} placeholder={placeholder}
        onChange={(testo) => cambia((lav) => { lav[k] = testo; })} />
    );
    return (
      <>
        {campo("rischi", "Rischi", 4, "Uno per riga")}
        {campo("misure", "Misure preventive e protettive", 4, "Una per riga")}
        {campo("dpi", "DPI", 3, "Uno per riga, con la norma se la conosci")}
        {!ro && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed bg-white p-2 text-xs text-muted-foreground sm:col-span-2">
            <span className="min-w-0 flex-1">Per ogni rischio, le sue misure e i suoi DPI: così li legge chi controlla il POS.</span>
            <Button type="button" size="sm" variant="outline" className="tap-compact shrink-0" onClick={() => cambia((lav) => applicaValutazione(lav, valutazioneDaElenchi(lav)))}>
              <ListChecks className="mr-1 h-4 w-4" aria-hidden="true" />Organizza per rischio
            </Button>
          </div>
        )}
      </>
    );
  }

  const modificaValutazione = (fn: (x: ValutazioneLavorazione) => void) =>
    cambia((lav) => { const x = structuredClone(lav.valutazione!); fn(x); applicaValutazione(lav, x); });
  const modificaRiga = (k: number, fn: (r: RischioLavorazione) => void) => modificaValutazione((x) => fn(x.righe[k]));

  return (
    <section className="space-y-2 sm:col-span-2" aria-label={`Rischi, misure e DPI della lavorazione ${n + 1}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium text-slate-700">Rischi, misure e DPI</p>
        {!ro && (
          <div className="flex gap-1">
            <Button type="button" size="sm" variant="outline" className="tap-compact h-8" onClick={() => modificaValutazione((x) => { x.righe.push(rigaVuota()); })}>
              <Plus className="mr-1 h-4 w-4" aria-hidden="true" />Aggiungi un rischio
            </Button>
            <Button type="button" size="sm" variant="ghost" className="tap-compact h-8 text-xs text-muted-foreground" title="Torna ai tre elenchi separati: il contenuto resta"
              onClick={() => cambia((lav) => { lav.valutazione = undefined; })}>Elenchi semplici</Button>
          </div>
        )}
      </div>
      {v.righe.map((r, k) => (
        <div key={k} className="space-y-2 rounded-lg border bg-white p-2.5">
          <div className="flex flex-wrap items-end gap-2 max-sm:flex-nowrap max-sm:flex-col max-sm:items-stretch">
            <div className="min-w-0 flex-1 space-y-1">
              <Label htmlFor={`lv-${n}-r${k}-rischio`} className="text-xs font-medium text-slate-700">Rischio {k + 1}</Label>
              <Input id={`lv-${n}-r${k}-rischio`} className="h-9" value={r.rischio} disabled={ro} placeholder="Es. Caduta dall’alto"
                onChange={(e) => modificaRiga(k, (x) => { x.rischio = e.target.value; })} />
            </div>
            <div className="flex items-end gap-1">
              <div className="space-y-1 max-sm:flex-1">
                <Label htmlFor={`lv-${n}-r${k}-residuo`} className="text-xs font-medium text-slate-700">Rischio residuo</Label>
                <Select value={r.residuo || NESSUN_LIVELLO} disabled={ro}
                  onValueChange={(val) => modificaRiga(k, (x) => { x.residuo = val === NESSUN_LIVELLO ? "" : (val as LivelloRischio); })}>
                  <SelectTrigger id={`lv-${n}-r${k}-residuo`} className="h-9 w-full min-w-[7.5rem]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NESSUN_LIVELLO}>Non valutato</SelectItem>
                    {(Object.keys(LIVELLO_RISCHIO_LABEL) as LivelloRischio[]).map((x) => <SelectItem key={x} value={x}>{LIVELLO_RISCHIO_LABEL[x]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {!ro && (
                <div className="flex">
                  <Button type="button" size="icon" variant="ghost" className="h-9 w-9" disabled={k === 0} aria-label={`Sposta su il rischio ${k + 1}`}
                    onClick={() => modificaValutazione((x) => { const [it] = x.righe.splice(k, 1); x.righe.splice(k - 1, 0, it); })}><ArrowUp className="h-4 w-4" /></Button>
                  <Button type="button" size="icon" variant="ghost" className="h-9 w-9" disabled={k === v.righe.length - 1} aria-label={`Sposta giù il rischio ${k + 1}`}
                    onClick={() => modificaValutazione((x) => { const [it] = x.righe.splice(k, 1); x.righe.splice(k + 1, 0, it); })}><ArrowDown className="h-4 w-4" /></Button>
                  <Button type="button" size="icon" variant="ghost" className="h-9 w-9 text-destructive" aria-label={`Elimina il rischio ${k + 1}`}
                    onClick={() => modificaValutazione((x) => { x.righe.splice(k, 1); if (!x.righe.length) x.righe.push(rigaVuota()); })}><Trash2 className="h-4 w-4" /></Button>
                </div>
              )}
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Area id={`lv-${n}-r${k}-misure`} label={`Misure preventive e protettive (rischio ${k + 1})`} rows={3} value={r.misure} readOnly={ro} placeholder="Una per riga"
              onChange={(t) => modificaRiga(k, (x) => { x.misure = t; })} />
            <Area id={`lv-${n}-r${k}-dpi`} label={`DPI (rischio ${k + 1})`} rows={3} value={r.dpi} readOnly={ro} placeholder="Uno per riga, con la norma se la conosci"
              onChange={(t) => modificaRiga(k, (x) => { x.dpi = t; })} />
          </div>
        </div>
      ))}
      <div className="space-y-2 rounded-lg border border-dashed bg-slate-50/70 p-2.5">
        <p className="text-xs font-medium text-slate-700">Comuni a tutta la lavorazione</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <Area id={`lv-${n}-comuni-misure`} label="Misure valide per tutti i rischi" rows={2} value={v.misure_comuni} readOnly={ro} placeholder="Es. formazione specifica, sorveglianza del preposto"
            onChange={(t) => modificaValutazione((x) => { x.misure_comuni = t; })} />
          <Area id={`lv-${n}-comuni-dpi`} label="DPI per tutti i rischi" rows={2} value={v.dpi_comuni} readOnly={ro} placeholder="Es. elmetto, calzature di sicurezza"
            onChange={(t) => modificaValutazione((x) => { x.dpi_comuni = t; })} />
        </div>
      </div>
    </section>
  );
}
