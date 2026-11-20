import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { preparaModificaMultipla, type ModificheArticoli } from "@/lib/distinta/modificaMultiplaArticoli";

export function ModificaMultiplaArticoli({ aperto, onAperto, quanti, esclusi, fornitori, fasi, salvando, onApplica }: {
  aperto: boolean; onAperto: (v: boolean) => void; quanti: number; esclusi: number; fornitori: { id: string; name: string }[];
  fasi: { id: string; nome: string }[]; salvando: boolean; onApplica: (patch: ReturnType<typeof preparaModificaMultipla>) => void;
}) {
  const [m, setM] = useState<ModificheArticoli>({ fornitore: false, supplierId: "", fase: false, phaseId: "", data: false, serveEntro: "", specifiche: false, testoSpecifiche: "" });
  const [errore, setErrore] = useState("");
  const cambia = (p: Partial<ModificheArticoli>) => { setM(v => ({ ...v, ...p })); setErrore(""); };
  return <Dialog open={aperto} onOpenChange={onAperto}><DialogContent className="max-w-xl">
    <DialogHeader><DialogTitle>Modifica {quanti} articoli</DialogTitle>
      <DialogDescription>Scegli i campi da applicare a tutte le righe selezionate.{esclusi > 0 ? " " + esclusi + " righe già impegnate o non modificabili sono escluse." : ""}</DialogDescription></DialogHeader>
    <fieldset disabled={salvando} className="space-y-4">
      <div className="space-y-2"><label className="flex items-center gap-2 text-sm font-medium"><Checkbox checked={m.fornitore} onCheckedChange={v => cambia({ fornitore: !!v })} />Assegna un fornitore</label>
        {m.fornitore && <select aria-label="Fornitore della modifica multipla" className="h-10 w-full rounded-md border bg-background px-3" value={m.supplierId} onChange={e => cambia({ supplierId: e.target.value })}>
          <option value="">Scegli il fornitore</option><option value="_nessuno">Fornitore da scegliere</option>{fornitori.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select>}</div>
      <div className="space-y-2"><label className="flex items-center gap-2 text-sm font-medium"><Checkbox checked={m.fase} onCheckedChange={v => cambia({ fase: !!v })} />Sposta in una fase</label>
        {m.fase && <select aria-label="Fase della modifica multipla" className="h-10 w-full rounded-md border bg-background px-3" value={m.phaseId} onChange={e => cambia({ phaseId: e.target.value })}>
          <option value="">Scegli la fase</option><option value="_senza">Senza fase</option>{fasi.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}</select>}</div>
      <div className="space-y-2"><label className="flex items-center gap-2 text-sm font-medium"><Checkbox checked={m.data} onCheckedChange={v => cambia({ data: !!v })} />Imposta quando servono</label>
        {m.data && <><Input aria-label="Data di fabbisogno comune" type="date" value={m.serveEntro} onChange={e => cambia({ serveEntro: e.target.value })} /><p className="text-xs text-muted-foreground">Lascia vuoto per togliere la data specifica e usare quella della fase.</p></>}</div>
      <div className="space-y-2"><label className="flex items-center gap-2 text-sm font-medium"><Checkbox checked={m.specifiche} onCheckedChange={v => cambia({ specifiche: !!v })} />Sostituisci le specifiche comuni</label>
        {m.specifiche && <textarea aria-label="Specifiche comuni" className="min-h-20 w-full rounded-md border bg-background p-3 text-sm" placeholder="Solo per articoli che condividono queste caratteristiche" value={m.testoSpecifiche} onChange={e => cambia({ testoSpecifiche: e.target.value })} />}</div>
    </fieldset>
    {errore && <p role="alert" className="text-sm text-destructive">{errore}</p>}
    <DialogFooter><Button variant="ghost" disabled={salvando} onClick={() => onAperto(false)}>Annulla</Button><Button disabled={!quanti || salvando} onClick={() => {
      try { onApplica(preparaModificaMultipla(m)); } catch (e) { setErrore(e instanceof Error ? e.message : "Controlla i campi."); }
    }}>{salvando ? "Applico…" : "Applica a " + quanti + " articoli"}</Button></DialogFooter>
  </DialogContent></Dialog>;
}
