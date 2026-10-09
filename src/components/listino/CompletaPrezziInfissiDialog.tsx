import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useOrganizzaListino } from "@/hooks/useOrganizzaListino";
import { parseDecimalField } from "@/lib/listino/numeriEditor";

interface Props {
  macrocategoriaId: string;
  categoriaId: string;
  nomeLinea: string;
  mancanti: number;
  onClose: () => void;
}

/** Una cifra, solo per gli schemi senza prezzo. Nessun ricalcolo del vecchio listino. */
export function CompletaPrezziInfissiDialog({ macrocategoriaId, categoriaId, nomeLinea, mancanti, onClose }: Props) {
  const { completaPrezziInfissi } = useOrganizzaListino();
  const [testo, setTesto] = useState("");
  const [salvando, setSalvando] = useState(false);
  const invio = useRef(false);
  const prezzo = parseDecimalField(testo, Number.NaN);
  const valido = Number.isFinite(prezzo) && prezzo > 0 && prezzo <= 1_000_000;
  const salva = async () => {
    if (!valido || invio.current) return;
    invio.current = true; setSalvando(true);
    try {
      const esito = await completaPrezziInfissi.mutateAsync({ macrocategoriaId, categoriaId, prezzoMq: prezzo });
      toast.success(`${esito.prodotti_prezzo} prezzi mancanti completati`, { description: "Prezzi già presenti, costi e preventivi salvati invariati." });
      onClose();
    } catch (err) {
      toast.error("Prezzi non completati", { description: err instanceof Error ? err.message : "Riprova." });
    } finally { invio.current = false; setSalvando(false); }
  };
  return <Dialog open onOpenChange={(open) => { if (!open && !salvando) onClose(); }}>
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Completa i prezzi di {nomeLinea}</DialogTitle>
        <DialogDescription>Applica un prezzo di vendita al m² ai {mancanti} schemi attivi senza prezzo. Gli importi già impostati, le maggiorazioni e i costi di acquisto non cambiano.</DialogDescription>
      </DialogHeader>
      <div className="space-y-2">
        <Label htmlFor="prezzo-linea-mancante">Prezzo di vendita €/m²</Label>
        <Input id="prezzo-linea-mancante" inputMode="decimal" value={testo} onChange={(e) => setTesto(e.target.value)} placeholder="Es. 720,00" disabled={salvando} />
        <p className="text-xs text-muted-foreground">Questo prezzo vale solo per la linea selezionata della tua azienda.</p>
      </div>
      <DialogFooter className="gap-2">
        <Button variant="ghost" onClick={onClose} disabled={salvando}>Annulla</Button>
        <Button onClick={salva} disabled={!valido || salvando}>{salvando ? "Salvataggio…" : "Completa prezzi mancanti"}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
