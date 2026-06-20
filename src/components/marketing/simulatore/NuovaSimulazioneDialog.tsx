/**
 * NuovaSimulazioneDialog — crea una nuova simulazione contratto.
 *
 * Dialog minimale: campo "nome" obbligatorio → `create` (hook
 * useSimulazioniMutations) → naviga all'editor `/azienda/marketing/simulatore/{id}`.
 * Il collegamento al contatto CRM arriverà più avanti (Tappa B): per ora teniamo
 * la creazione snella, una simulazione nasce con voci/fasi vuote e DEFAULT_SCENARI.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useSimulazioniMutations } from "@/hooks/useSimulazioni";

interface NuovaSimulazioneDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NuovaSimulazioneDialog({ open, onOpenChange }: NuovaSimulazioneDialogProps) {
  const navigate = useNavigate();
  const { create } = useSimulazioniMutations();
  const [nome, setNome] = useState("");

  const reset = () => setNome("");

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const handleSubmit = async () => {
    const trimmed = nome.trim();
    if (!trimmed) {
      toast.error("Inserisci un nome per la simulazione");
      return;
    }
    try {
      const id = await create.mutateAsync({ nome: trimmed });
      toast.success("Simulazione creata");
      handleOpenChange(false);
      navigate(`/azienda/marketing/simulatore/${id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore nella creazione");
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Nuova simulazione
          </DialogTitle>
          <DialogDescription>
            Dai un nome alla simulazione. Potrai aggiungere voci, IVA e
            finanziamenti nell'editor.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-2">
          <Label htmlFor="sim-nome">Nome simulazione</Label>
          <Input
            id="sim-nome"
            autoFocus
            placeholder="Es. Ristrutturazione appartamento Rossi"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !create.isPending) {
                e.preventDefault();
                void handleSubmit();
              }
            }}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={create.isPending}>
            Annulla
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={create.isPending || !nome.trim()}>
            {create.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creazione…
              </>
            ) : (
              "Crea e apri"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
