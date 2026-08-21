/**
 * LossReasonDialog — il "perché abbiamo perso", condiviso.
 *
 * Nasce per chiudere il buco del kanban: trascinare un'opportunità su una
 * fase persa la marcava senza chiedere niente, e i report motivi-perdita
 * restavano vuoti proprio per il gesto più usato. Il dialog è lo stesso
 * concetto di quello del dettaglio, con in più i motivi PER AZIENDA e
 * l'aggiunta inline di un motivo nuovo.
 */
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { useLossReasons, useAddLossReason } from "@/hooks/useLossReasons";

export interface EsitoPerdita {
  categoria: string;
  dettaglio: string | null;
  concorrente: string | null;
}

export function LossReasonDialog({
  open,
  titolo,
  inCorso,
  onClose,
  onConfirm,
}: {
  open: boolean;
  /** Nome dell'opportunità, per il sottotitolo. */
  titolo?: string;
  inCorso?: boolean;
  onClose: () => void;
  onConfirm: (esito: EsitoPerdita) => void;
}) {
  const { motivi } = useLossReasons();
  const aggiungi = useAddLossReason();

  const [categoria, setCategoria] = useState("");
  const [dettaglio, setDettaglio] = useState("");
  const [concorrente, setConcorrente] = useState("");
  const [nuovoMotivo, setNuovoMotivo] = useState("");
  const [mostraAggiungi, setMostraAggiungi] = useState(false);

  const reset = () => {
    setCategoria(""); setDettaglio(""); setConcorrente("");
    setNuovoMotivo(""); setMostraAggiungi(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { reset(); onClose(); } }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Perché hai perso questa opportunità?</DialogTitle>
          <DialogDescription>
            {titolo ? `"${titolo}" — ` : ""}il motivo alimenta i report e
            aiuta a non ripetere gli stessi errori. Senza motivo, niente
            spostamento.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <Label className="text-sm font-medium">Categoria motivo *</Label>
            <Select value={categoria} onValueChange={setCategoria}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Seleziona categoria..." />
              </SelectTrigger>
              <SelectContent>
                {motivi.map((m) => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!mostraAggiungi ? (
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mt-1"
                onClick={() => setMostraAggiungi(true)}
              >
                <Plus className="h-3 w-3" /> Nuovo motivo per la tua azienda
              </button>
            ) : (
              <div className="flex gap-2 mt-1.5">
                <Input
                  autoFocus
                  placeholder="Es. misure sbagliate, condominio non delibera…"
                  value={nuovoMotivo}
                  onChange={(e) => setNuovoMotivo(e.target.value)}
                  className="h-8 text-sm"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="h-8"
                  disabled={aggiungi.isPending || !nuovoMotivo.trim()}
                  onClick={() =>
                    aggiungi.mutate(nuovoMotivo, {
                      onSuccess: (etichetta) => {
                        setCategoria(etichetta);
                        setNuovoMotivo("");
                        setMostraAggiungi(false);
                        toast.success("Motivo aggiunto al listino della tua azienda");
                      },
                      onError: (e) =>
                        toast.error("Motivo non aggiunto", {
                          description: e instanceof Error ? e.message : String(e),
                        }),
                    })
                  }
                >
                  {aggiungi.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Aggiungi"}
                </Button>
              </div>
            )}
          </div>

          <div className="space-y-1">
            <Label className="text-sm font-medium">Dettaglio (opzionale)</Label>
            <Textarea
              placeholder="Descrivi cosa è successo…"
              value={dettaglio}
              onChange={(e) => setDettaglio(e.target.value)}
              className="mt-1 text-sm min-h-[70px] resize-none"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-sm font-medium">Concorrente che ha vinto (opzionale)</Label>
            <Input
              placeholder="Es: Competitor SpA, nessuno, fai-da-te…"
              value={concorrente}
              onChange={(e) => setConcorrente(e.target.value)}
              className="mt-1"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onClose(); }}>
            Annulla
          </Button>
          <Button
            variant="destructive"
            disabled={!categoria || inCorso}
            onClick={() => {
              if (!categoria) return;
              onConfirm({
                categoria,
                dettaglio: dettaglio.trim() || null,
                concorrente: concorrente.trim() || null,
              });
              reset();
            }}
          >
            {inCorso && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Conferma perdita
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
