// src/components/orders/generali/ModificaGeneraleDialog.tsx
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { messaggioGenerale, useAggiornaGenerale, useImpostazioniCommesseGenerali } from "@/hooks/useCommesseGenerali";
import { useDatiContratto } from "@/hooks/useGeneraleContratto";
import { leggiImporto } from "@/lib/controlloGestione/formatCG";
import { DEFINIZIONI_MODELLI, isModelloGenerale, type ModelloGenerale, type RiepilogoGenerale } from "@/lib/orders/commesseGenerali";
import { cn } from "@/lib/utils";

const testoImporto = (n: number | null) => (n === null ? "" : new Intl.NumberFormat("it-IT", { maximumFractionDigits: 2 }).format(n));

export function ModificaGeneraleDialog({ open, onOpenChange, riepilogo }: { open: boolean; onOpenChange: (o: boolean) => void; riepilogo: RiepilogoGenerale }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        {/* Il modulo nasce a ogni apertura con i valori di adesso. */}
        <Modulo onOpenChange={onOpenChange} riepilogo={riepilogo} />
      </DialogContent>
    </Dialog>
  );
}

function Modulo({ onOpenChange, riepilogo }: { onOpenChange: (o: boolean) => void; riepilogo: RiepilogoGenerale }) {
  const g = riepilogo.generale;
  const aggiorna = useAggiornaGenerale(g.id);
  const { modelli: accesi } = useImpostazioniCommesseGenerali();
  const [nome, setNome] = useState(g.nome);
  const [modello, setModello] = useState<ModelloGenerale>(g.modello);
  const [valoreTesto, setValoreTesto] = useState(testoImporto(g.valore));

  // Si può tenere il tipo attuale anche se nel frattempo è stato spento; cambiare solo verso un tipo acceso.
  const scelte = Array.from(new Set<ModelloGenerale>([g.modello, ...accesi]));
  const def = DEFINIZIONI_MODELLI[modello];
  const valore = valoreTesto.trim() === "" ? null : leggiImporto(valoreTesto);
  const valoreSbagliato = valoreTesto.trim() !== "" && (valore === null || valore < 0);
  // Chi non vede gli importi non deve poter cancellare il valore senza saperlo.
  const importiVisibili = riepilogo.permessi.importi;
  // Negli appalti col contratto compilato il valore lo calcola il contratto (base, ribasso, atti aggiuntivi):
  // qui non si scrive, si cambia nella scheda «Contratto e SAL».
  const contratto = useDatiContratto(g.id, g.modello === "appalto");
  const valoreDalContratto = !!contratto.data?.contratto;
  const puoSalvare = nome.trim().length > 0 && (valoreDalContratto || !valoreSbagliato) && !aggiorna.isPending;

  const salva = () => {
    if (!puoSalvare) return;
    aggiorna.mutate(
      { nome: nome.trim(), modello, valore: importiVisibili && !valoreDalContratto ? valore : g.valore },
      {
        onSuccess: () => { toast.success("Commessa generale aggiornata"); onOpenChange(false); },
        onError: (e) => toast.error(messaggioGenerale(e, "le modifiche")),
      },
    );
  };

  return (
    <>
        <DialogHeader>
          <DialogTitle>Modifica commessa generale</DialogTitle>
          <DialogDescription>Nome, tipo e valore. Le commesse dentro non cambiano.</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); salva(); }}>
          <div className="space-y-1.5">
            <Label htmlFor="mod-generale-nome">Nome</Label>
            <Input id="mod-generale-nome" value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>
          {scelte.length > 1 && (
            <div className="space-y-1.5">
              <Label htmlFor="mod-generale-tipo">Tipo</Label>
              <Select value={modello} onValueChange={(v) => { if (isModelloGenerale(v)) setModello(v); }}>
                <SelectTrigger id="mod-generale-tipo"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {scelte.map((m) => <SelectItem key={m} value={m}>{DEFINIZIONI_MODELLI[m].nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          {importiVisibili && valoreDalContratto && (
            <p className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              Il valore viene dal contratto: si cambia nella scheda «Contratto e SAL» (importo, ribasso, atti aggiuntivi).
            </p>
          )}
          {importiVisibili && !valoreDalContratto && (
            <div className="space-y-1.5">
              <Label htmlFor="mod-generale-valore">
                {def.valore.etichetta} <span className="font-normal text-muted-foreground">(al netto dell'IVA)</span>
              </Label>
              <Input id="mod-generale-valore" inputMode="decimal" value={valoreTesto} onChange={(e) => setValoreTesto(e.target.value)} aria-invalid={valoreSbagliato || undefined} />
              <p className={cn("text-xs", valoreSbagliato ? "text-destructive" : "text-muted-foreground")}>
                {valoreSbagliato ? "Scrivi un importo, ad esempio 3.000.000 o 2500,50." : "Lascia vuoto se non lo sai ancora."}
              </p>
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Annulla</Button>
            <Button type="submit" disabled={!puoSalvare}>
              {aggiorna.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salva
            </Button>
          </DialogFooter>
        </form>
    </>
  );
}
