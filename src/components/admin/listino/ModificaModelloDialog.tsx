/** Nome e descrizione di un modello di area: quello che vedono le aziende. */
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useModelliAreaMutations } from "@/hooks/useModelliArea";
import type { ModelloArea } from "@/lib/listino/modelliArea";

interface Props {
  modello: ModelloArea;
  onChiudi: () => void;
}

export function ModificaModelloDialog({ modello, onChiudi }: Props) {
  const [nome, setNome] = useState(modello.nome);
  const [descrizione, setDescrizione] = useState(modello.descrizione ?? "");
  const { modifica } = useModelliAreaMutations();
  const inCorso = modifica.isPending;

  const salva = () => {
    if (!nome.trim() || inCorso) return;
    modifica.mutate(
      { id: modello.id, patch: { nome: nome.trim(), descrizione: descrizione.trim() || null } },
      {
        onSuccess: () => {
          toast.success("Modello aggiornato");
          onChiudi();
        },
        onError: (e) => toast.error("Modifica non salvata", { description: (e as Error).message }),
      },
    );
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !inCorso) onChiudi();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Modifica il modello</DialogTitle>
          <DialogDescription>Il nome e la descrizione li vedono le aziende quando scelgono un modello.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="modifica-modello-nome">Nome</Label>
            <Input id="modifica-modello-nome" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={80} disabled={inCorso} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="modifica-modello-descrizione">Descrizione</Label>
            <Textarea
              id="modifica-modello-descrizione"
              value={descrizione}
              onChange={(e) => setDescrizione(e.target.value)}
              rows={4}
              disabled={inCorso}
            />
          </div>
        </div>
        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:gap-2">
          <Button variant="ghost" onClick={onChiudi} disabled={inCorso} className="h-10 w-full sm:w-auto">
            Annulla
          </Button>
          <Button onClick={salva} disabled={!nome.trim() || inCorso} className="h-10 w-full sm:w-auto">
            {inCorso && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
            Salva
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
