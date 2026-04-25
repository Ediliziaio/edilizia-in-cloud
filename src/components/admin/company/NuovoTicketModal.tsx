import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import type { NuovoTicket, TicketRow } from "@/hooks/useTicketAzienda";

const TITOLO_MAX = 200;
const DESCRIZIONE_MAX = 5000;

interface NuovoTicketModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Callback chiamato al submit. DEVE essere wrappato dal parent in modo che
   * `onSuccess` esterno triggeri il reset del form (vedi pattern in TabSupporto).
   * Non fidarsi del component per il reset → sposterebbe stato in posti sbagliati.
   */
  onSubmit: (data: NuovoTicket, callbacks: { onSuccess: () => void }) => void;
  isLoading: boolean;
}

const INITIAL_PRIORITA: TicketRow["priorita"] = "normale";
const INITIAL_CATEGORIA = "generale";

export function NuovoTicketModal({
  open, onOpenChange, onSubmit, isLoading,
}: NuovoTicketModalProps) {
  const [titolo, setTitolo] = useState("");
  const [descrizione, setDescrizione] = useState("");
  const [priorita, setPriorita] = useState<TicketRow["priorita"]>(INITIAL_PRIORITA);
  const [categoria, setCategoria] = useState(INITIAL_CATEGORIA);

  const reset = () => {
    setTitolo("");
    setDescrizione("");
    setPriorita(INITIAL_PRIORITA);
    setCategoria(INITIAL_CATEGORIA);
  };

  // FIX: reset on close — prima riaprendo dopo "Annulla" o ESC vedevi il vecchio testo
  useEffect(() => {
    if (!open) reset();
  }, [open]);

  const handleSubmit = () => {
    const t = titolo.trim();
    if (!t) return;
    if (t.length > TITOLO_MAX) return;
    if (descrizione.length > DESCRIZIONE_MAX) return;
    // FIX: il reset avviene SOLO su success — prima era subito dopo onSubmit,
    // se la mutation falliva l'utente perdeva l'input.
    onSubmit(
      {
        titolo: t,
        descrizione: descrizione.trim() || undefined,
        priorita,
        categoria,
      },
      {
        onSuccess: () => {
          reset();
          onOpenChange(false);
        },
      },
    );
  };

  const titoloOver = titolo.length > TITOLO_MAX;
  const descrizioneOver = descrizione.length > DESCRIZIONE_MAX;
  const canSubmit = !!titolo.trim() && !titoloOver && !descrizioneOver && !isLoading;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        // Blocca chiusura accidentale durante mutation in corso
        if (!o && isLoading) return;
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nuovo Ticket</DialogTitle>
          <DialogDescription>
            Crea un ticket di supporto manuale per questa azienda.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="titolo">
                Titolo <span className="text-destructive">*</span>
              </Label>
              <span
                className={`text-[10px] ${
                  titoloOver ? "text-destructive font-bold" : "text-muted-foreground"
                }`}
              >
                {titolo.length}/{TITOLO_MAX}
              </span>
            </div>
            <Input
              id="titolo"
              value={titolo}
              onChange={(e) => setTitolo(e.target.value)}
              placeholder="Descrizione breve del problema"
              className={titoloOver ? "border-destructive" : ""}
              maxLength={TITOLO_MAX + 50}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Priorità</Label>
              <Select
                value={priorita}
                onValueChange={(v) => setPriorita(v as TicketRow["priorita"])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bassa">Bassa</SelectItem>
                  <SelectItem value="normale">Normale</SelectItem>
                  <SelectItem value="alta">Alta</SelectItem>
                  <SelectItem value="urgente">Urgente</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Categoria</Label>
              <Select value={categoria} onValueChange={setCategoria}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="generale">Generale</SelectItem>
                  <SelectItem value="tecnico">Tecnico</SelectItem>
                  <SelectItem value="billing">Billing</SelectItem>
                  <SelectItem value="onboarding">Onboarding</SelectItem>
                  <SelectItem value="feature_request">Feature Request</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="descrizione">Descrizione</Label>
              <span
                className={`text-[10px] ${
                  descrizioneOver ? "text-destructive font-bold" : "text-muted-foreground"
                }`}
              >
                {descrizione.length}/{DESCRIZIONE_MAX}
              </span>
            </div>
            <Textarea
              id="descrizione"
              value={descrizione}
              onChange={(e) => setDescrizione(e.target.value)}
              placeholder="Dettagli del problema o della richiesta..."
              rows={4}
              className={`resize-none ${descrizioneOver ? "border-destructive" : ""}`}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            Annulla
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Crea Ticket
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
