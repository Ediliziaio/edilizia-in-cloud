import { Filter, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const FILTRI_EMESSE_VUOTI = { sdi: "all", incasso: "all", cliente: "", commessa: "", dal: "", al: "", conNote: false, conAllegati: false };
export type FiltriEmesse = typeof FILTRI_EMESSE_VUOTI;
const SDI = [ ["all", "Tutti gli stati SDI"], ["da_inviare", "Da inviare SDI"], ["invio_in_corso", "Invio SDI in corso"], ["in_elaborazione", "In elaborazione SDI"], ["inviata", "Inviata SDI"], ["accettata", "Accettata SDI"], ["scartata", "Scartata SDI"], ["rifiutata_ente", "Rifiutata dall’ente"], ["manuale", "Invio manuale"], ["esterna", "Gestita esternamente"] ];
const INCASSO = [["all", "Tutti gli incassi"], ["da_incassare", "Da incassare"], ["parziale", "Parz. incassata"], ["incassata", "Incassata"], ["scaduta", "Scaduta da incassare"], ["non_previsto", "Incasso non previsto"]];

export function FiltriFattureEmesse({ valore, cambia }: { valore: FiltriEmesse; cambia: (patch: Partial<FiltriEmesse>) => void }) {
  const altri = [valore.cliente, valore.commessa, valore.dal, valore.al, valore.conNote, valore.conAllegati].filter(Boolean).length;
  return <>
    {([ ["sdi", SDI, "Filtra per SDI"], ["incasso", INCASSO, "Filtra per incasso"] ] as const).map(([campo, opzioni, label]) => <Select key={campo} value={valore[campo]} onValueChange={v => cambia({ [campo]: v })}>
      <SelectTrigger aria-label={label} className="h-9 w-[190px] text-xs"><SelectValue /></SelectTrigger>
      <SelectContent>{opzioni.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
    </Select>)}
    <Popover><PopoverTrigger asChild><Button variant="outline" size="sm" className="gap-1.5"><Filter className="h-3.5 w-3.5" />Altri filtri{altri > 0 && ` (${altri})`}</Button></PopoverTrigger>
      <PopoverContent className="w-96 max-w-[90vw] space-y-3" align="start">
        <p className="text-sm font-semibold">Filtra le fatture emesse</p>
        <div className="space-y-1"><Label htmlFor="emesse-cliente">Cliente</Label><Input id="emesse-cliente" placeholder="Nome o ragione sociale" value={valore.cliente} onChange={e => cambia({ cliente: e.target.value })} /></div>
        <div className="space-y-1"><Label htmlFor="emesse-commessa">Commessa o lavoro</Label><Input id="emesse-commessa" placeholder="Codice o descrizione" value={valore.commessa} onChange={e => cambia({ commessa: e.target.value })} /></div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1"><Label htmlFor="emesse-dal">Emessa dal</Label><Input id="emesse-dal" type="date" value={valore.dal} max={valore.al || undefined} onChange={e => cambia({ dal: e.target.value })} /></div>
          <div className="space-y-1"><Label htmlFor="emesse-al">Emessa fino al</Label><Input id="emesse-al" type="date" value={valore.al} min={valore.dal || undefined} onChange={e => cambia({ al: e.target.value })} /></div>
        </div>
        {([ ["conNote", "Solo con note"], ["conAllegati", "Solo con allegati"] ] as const).map(([campo, testo]) => <label key={campo} className="flex items-center gap-2 text-sm"><Checkbox checked={valore[campo]} onCheckedChange={v => cambia({ [campo]: v === true })} />{testo}</label>)}
      </PopoverContent>
    </Popover>
  </>;
}

export function FiltriEmesseAttivi({ valore, cambia }: { valore: FiltriEmesse; cambia: (patch: Partial<FiltriEmesse>) => void }) {
  const voci = (Object.keys(valore) as (keyof FiltriEmesse)[]).filter(k => valore[k] !== FILTRI_EMESSE_VUOTI[k]);
  if (!voci.length) return null;
  const label = (k: keyof FiltriEmesse) => k === "sdi" ? SDI.find(o => o[0] === valore.sdi)?.[1] : k === "incasso" ? INCASSO.find(o => o[0] === valore.incasso)?.[1] : k === "cliente" ? `Cliente: ${valore[k]}` : k === "commessa" ? `Commessa: ${valore[k]}` : k === "dal" ? `Dal ${valore[k]}` : k === "al" ? `Fino al ${valore[k]}` : k === "conNote" ? "Con note" : "Con allegati";
  return <div className="flex flex-wrap gap-2">{voci.map(k => <Button key={k} variant="secondary" size="sm" className="h-7 gap-1 text-xs" aria-label={`Rimuovi filtro ${label(k)}`} onClick={() => cambia({ [k]: FILTRI_EMESSE_VUOTI[k] })}>{label(k)}<X className="h-3 w-3" /></Button>)}</div>;
}
