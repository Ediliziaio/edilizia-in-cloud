import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import type { NuovaComunicazione } from "@/hooks/useComunicazioniAzienda";

interface NuovaComunicazioneModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: NuovaComunicazione) => void;
  isLoading: boolean;
}

export function NuovaComunicazioneModal({
  open,
  onOpenChange,
  onSubmit,
  isLoading,
}: NuovaComunicazioneModalProps) {
  const [tipo, setTipo] = useState<NuovaComunicazione["tipo"]>("email");
  const [oggetto, setOggetto] = useState("");
  const [corpo, setCorpo] = useState("");

  const handleSubmit = () => {
    if (!corpo.trim()) return;
    onSubmit({ tipo, oggetto: oggetto.trim() || undefined, corpo: corpo.trim() });
    setOggetto("");
    setCorpo("");
    setTipo("email");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nuova Comunicazione</DialogTitle>
          <DialogDescription>
            Invia una comunicazione manuale a questa azienda.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="tipo">Tipo</Label>
            <Select value={tipo} onValueChange={(v) => setTipo(v as NuovaComunicazione["tipo"])}>
              <SelectTrigger id="tipo">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="email">Email</SelectItem>
                <SelectItem value="sms">SMS</SelectItem>
                <SelectItem value="notifica_inapp">Notifica in-app</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {tipo === "email" && (
            <div className="space-y-1.5">
              <Label htmlFor="oggetto">Oggetto</Label>
              <Input
                id="oggetto"
                value={oggetto}
                onChange={(e) => setOggetto(e.target.value)}
                placeholder="Oggetto dell'email"
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="corpo">
              {tipo === "email" ? "Corpo" : tipo === "sms" ? "Testo SMS" : "Testo notifica"}{" "}
              <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="corpo"
              value={corpo}
              onChange={(e) => setCorpo(e.target.value)}
              placeholder="Inserisci il testo della comunicazione..."
              rows={5}
              className="resize-none"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
            Annulla
          </Button>
          <Button onClick={handleSubmit} disabled={!corpo.trim() || isLoading}>
            {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Invia
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
