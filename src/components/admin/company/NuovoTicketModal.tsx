import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import type { NuovoTicket, TicketRow } from "@/hooks/useTicketAzienda";

interface NuovoTicketModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: NuovoTicket) => void;
  isLoading: boolean;
}

export function NuovoTicketModal({
  open,
  onOpenChange,
  onSubmit,
  isLoading,
}: NuovoTicketModalProps) {
  const [titolo, setTitolo] = useState("");
  const [descrizione, setDescrizione] = useState("");
  const [priorita, setPriorita] = useState<TicketRow["priorita"]>("normale");
  const [categoria, setCategoria] = useState("generale");

  const handleSubmit = () => {
    if (!titolo.trim()) return;
    onSubmit({ titolo: titolo.trim(), descrizione: descrizione.trim() || undefined, priorita, categoria });
    setTitolo("");
    setDescrizione("");
    setPriorita("normale");
    setCategoria("generale");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nuovo Ticket</DialogTitle>
          <DialogDescription>
            Crea un ticket di supporto manuale per questa azienda.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="titolo">
              Titolo <span className="text-destructive">*</span>
            </Label>
            <Input
              id="titolo"
              value={titolo}
              onChange={(e) => setTitolo(e.target.value)}
              placeholder="Descrizione breve del problema"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Priorità</Label>
              <Select value={priorita} onValueChange={(v) => setPriorita(v as TicketRow["priorita"])}>
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
            <Label htmlFor="descrizione">Descrizione</Label>
            <Textarea
              id="descrizione"
              value={descrizione}
              onChange={(e) => setDescrizione(e.target.value)}
              placeholder="Dettagli del problema o della richiesta..."
              rows={4}
              className="resize-none"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
            Annulla
          </Button>
          <Button onClick={handleSubmit} disabled={!titolo.trim() || isLoading}>
            {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Crea Ticket
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
