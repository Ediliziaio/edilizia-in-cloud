import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { parseImporto } from "@/lib/listino/listinoFornitore";
import { formattaMaggiorazione } from "@/lib/listino/maggiorazione";
import type { AxisValue, MaggiorazioneTipo } from "@/types/articleFamily";

export function BulkOpzioniDialog({ values, initialType, busy, onClose, onApply }: {
  values: AxisValue[]; initialType: "percentuale" | "fisso_pz"; busy: boolean;
  onClose: () => void;
  onApply: (tipo: MaggiorazioneTipo, vendita: number, acquisto?: number) => Promise<void>;
}) {
  const [tipo, setTipo] = useState<MaggiorazioneTipo>(initialType);
  const [vendita, setVendita] = useState("");
  const [acquisto, setAcquisto] = useState("");
  const sale = parseImporto(vendita);
  const cost = acquisto.trim() ? parseImporto(acquisto) : undefined;
  const cambioUnitaCosto = cost === undefined && values.some(v =>
    v.maggiorazione_tipo !== tipo && Number(v.maggiorazione_acquisto) !== 0);
  const valid = vendita.trim() && sale != null && Number.isFinite(sale) &&
    (cost === undefined || (cost != null && Number.isFinite(cost))) &&
    !cambioUnitaCosto && (tipo !== "percentuale" || (sale > -100 && (cost === undefined || (cost != null && cost > -100))));
  return <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
    <DialogContent className="flex max-h-[90dvh] flex-col overflow-hidden sm:max-w-xl">
      <DialogHeader>
        <DialogTitle>Modifica supplementi</DialogTitle>
        <DialogDescription>Solo le {values.length} scelte selezionate di questo prodotto. Prezzi base e altri prodotti non cambiano.</DialogDescription>
      </DialogHeader>
      <div className="min-h-0 space-y-4 overflow-y-auto">
        <p className="rounded-lg bg-muted p-3 text-sm max-h-24 overflow-y-auto">{values.map(v => v.label).join(" · ")}</p>
        <div>
          <label htmlFor="bulk-opzioni-tipo" className="block text-sm font-medium">Come si applica</label>
          <Select disabled={busy} value={tipo} onValueChange={v => setTipo(v as MaggiorazioneTipo)}>
            <SelectTrigger id="bulk-opzioni-tipo" className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="percentuale">Percentuale sul prezzo</SelectItem>
              <SelectItem value="fisso_pz">Euro per pezzo</SelectItem>
              <SelectItem value="fisso_mq">Euro per m²</SelectItem>
              <SelectItem value="fisso_ml">Euro per metro lineare</SelectItem>
              <SelectItem value="fisso_mc">Euro per m³</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium">Vendita<Input disabled={busy} className="mt-1" inputMode="decimal" value={vendita} onChange={e => setVendita(e.target.value)} placeholder="Es. 10 oppure -8" /></label>
          <label className="text-sm font-medium">Costo fornitore<Input disabled={busy} className="mt-1" inputMode="decimal" value={acquisto} onChange={e => setAcquisto(e.target.value)} placeholder="Vuoto: mantieni il costo" /></label>
        </div>
        <p className="text-xs text-muted-foreground">Il costo non viene copiato dalla vendita. Puoi mantenere i costi esistenti oppure inserire un costo esplicito, anche zero.</p>
        {cambioUnitaCosto ? <p role="alert" className="text-xs text-destructive">Stai cambiando l'unità del costo: inserisci esplicitamente il nuovo costo per non interpretare euro come percentuali o viceversa.</p> : null}
        {valid ? <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
          Vendita: {formattaMaggiorazione(tipo, sale!) || "0"}<br />
          Costo: {cost === undefined ? "invariato" : formattaMaggiorazione(tipo, cost!) || "0"}
        </div> : <p className="text-xs text-muted-foreground">Inserisci un importo valido. Una riduzione percentuale deve essere maggiore di −100%.</p>}
        {values.some(v => Number(v.prezzo_vendita) > 0) ? <p role="note" className="text-xs text-amber-800 rounded-lg bg-amber-50 p-3">Alcune scelte hanno un prezzo sostitutivo. Fuori dalle griglie quel prezzo prevale sul supplemento: non viene modificato da questa operazione.</p> : null}
      </div>
      <DialogFooter className="shrink-0 gap-2 border-t pt-4">
        <Button variant="outline" onClick={onClose} disabled={busy}>Annulla</Button>
        <Button disabled={!valid || busy} onClick={() => onApply(tipo, sale!, cost ?? undefined)}>{busy ? "Salvataggio…" : `Applica a ${values.length} scelte`}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
