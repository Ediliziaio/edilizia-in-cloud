import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Sparkles, AlertTriangle } from "lucide-react";

/**
 * Dialog "Genera con AI" del builder a grafo: l'utente descrive il brief della
 * campagna e l'edge outreach-ai-flow restituisce un GRAFO condizionale (non una
 * lista lineare). Il builder lo mappa su nodi+archi, fa auto-layout e lascia
 * rivedere/salvare. Avvisa che la generazione SOSTITUISCE il flusso corrente.
 */

type Props = {
  open: boolean;
  onClose: () => void;
  pending: boolean;
  hasExistingNodes: boolean;
  onGenerate: (brief: string) => void;
};

export function AiFlowDialog({ open, onClose, pending, hasExistingNodes, onGenerate }: Props) {
  const [brief, setBrief] = useState("");
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !pending) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-orange-500" /> Genera flusso con AI
          </DialogTitle>
          <DialogDescription className="text-xs">
            Descrivi l'obiettivo: l'AI progetta un flusso cold condizionale (apertura → attesa → bivio "non ha aperto" → variante/chiusura) con variabili e spintax. Potrai rivederlo e salvarlo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label className="text-xs">Brief della campagna</Label>
          <Textarea
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            disabled={pending}
            rows={4}
            placeholder="es. imprese edili in Lombardia, angolo sul risparmio di tempo su fatturazione e cantieri; chi non apre riceve un re-invio, chi apre un follow-up con caso studio."
            className="text-xs"
          />
        </div>

        {hasExistingNodes && (
          <p className="flex items-start gap-1.5 rounded-lg border bg-amber-50 p-2 text-[11px] text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            La generazione sostituisce il flusso attualmente sul canvas (non ancora salvato). Le modifiche al DB avvengono solo con "Salva flusso".
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" size="sm" disabled={pending} onClick={onClose}>Annulla</Button>
          <Button size="sm" className="gap-1" disabled={pending} onClick={() => onGenerate(brief.trim())}>
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            {pending ? "Genero…" : "Genera flusso"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
