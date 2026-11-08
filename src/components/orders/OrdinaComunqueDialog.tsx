import { useRef, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { statoMisuraLeggibile, type MisuraAperta } from "@/lib/acquisti/misureSuDocumenti";

/** Le righe con le misure non confermate: si confermano prima, oppure si scrive perché l'ordine parte lo stesso. */
export function OrdinaComunqueDialog({ odaId, righe, onChiudi, onFatto }: {
  odaId: string;
  righe: MisuraAperta[];
  onChiudi: () => void;
  onFatto: () => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [occupato, setOccupato] = useState(false);
  // Due clic ravvicinati arrivano prima che la pagina si aggiorni: il secondo non deve ripartire.
  const inCorso = useRef(false);
  const pronto = motivo.trim().length >= 5;

  const conferma = async () => {
    if (!pronto || inCorso.current) return;
    inCorso.current = true;
    setOccupato(true);
    try {
      const { error } = await (supabase.rpc as unknown as (f: string, a: object) => Promise<{ error: { message: string } | null }>)(
        "oda_ordina_comunque", { p_po: odaId, p_motivo: motivo.trim() });
      if (error) throw new Error(error.message);
      onFatto();
    } catch (e) {
      toast.error("Motivo non salvato", { description: e instanceof Error ? e.message : "Riprova." });
    } finally {
      inCorso.current = false;
      setOccupato(false);
    }
  };

  return (
    <Dialog open onOpenChange={(aperto) => { if (!aperto && !occupato) onChiudi(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-amber-600" />Misure non ancora confermate</DialogTitle>
          <DialogDescription>
            {righe.length === 1 ? "Questa posizione ha" : `Queste ${righe.length} posizioni hanno`} le misure ancora aperte. Il fornitore produrrebbe su misure che possono cambiare.
          </DialogDescription>
        </DialogHeader>
        <ul className="max-h-48 space-y-1 overflow-auto rounded-lg border p-2 text-sm">
          {righe.map((r) => (
            <li key={r.order_item_id} className="flex justify-between gap-3">
              <span className="min-w-0 truncate">{r.riferimento ? <strong>{r.riferimento} · </strong> : null}{r.nome}</span>
              <span className="shrink-0 text-xs text-amber-700">{statoMisuraLeggibile(r.stato)}</span>
            </li>
          ))}
        </ul>
        <label className="block space-y-1 text-sm">
          <span className="font-medium">Perché ordini lo stesso?</span>
          <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} placeholder="Es. misure prese dal commerciale, il cliente ha fretta" />
        </label>
        <DialogFooter>
          <Button variant="ghost" disabled={occupato} onClick={onChiudi}>Torno indietro</Button>
          <Button disabled={!pronto || occupato} onClick={conferma}>
            {occupato ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}Ordina comunque
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
