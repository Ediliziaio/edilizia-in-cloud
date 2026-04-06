import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import type { useSaasMetrics } from "@/hooks/useSaasMetrics";

interface CacInputModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: Parameters<ReturnType<typeof useSaasMetrics>["salvaInputCac"]["mutate"]>[0];
  isLoading: boolean;
}

const MESI = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre",
];

export function CacInputModal({ open, onOpenChange, onSubmit, isLoading }: CacInputModalProps) {
  const now = new Date();
  const [anno, setAnno] = useState(now.getFullYear());
  const [mese, setMese] = useState(now.getMonth() + 1);
  const [spesa, setSpesa] = useState("");
  const [nuoveAziende, setNuoveAziende] = useState("");
  const [note, setNote] = useState("");

  const handleSubmit = () => {
    const spesaNum = parseFloat(spesa.replace(",", "."));
    const aziende = parseInt(nuoveAziende, 10);
    if (isNaN(spesaNum) || isNaN(aziende)) return;
    onSubmit({
      anno,
      mese,
      spesa_marketing_cents: Math.round(spesaNum * 100),
      nuove_aziende: aziende,
      note: note.trim() || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Inserisci Spesa Marketing</DialogTitle>
          <DialogDescription>
            I dati CAC vengono usati per calcolare LTV e Payback Period.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Anno</Label>
              <Input
                type="number"
                value={anno}
                onChange={(e) => setAnno(parseInt(e.target.value, 10))}
                min={2020}
                max={2099}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Mese</Label>
              <Select value={String(mese)} onValueChange={(v) => setMese(parseInt(v, 10))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MESI.map((m, i) => (
                    <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="spesa">
              Spesa Marketing (€) <span className="text-destructive">*</span>
            </Label>
            <Input
              id="spesa"
              value={spesa}
              onChange={(e) => setSpesa(e.target.value)}
              placeholder="es. 2500.00"
              type="text"
              inputMode="decimal"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="nuove">
              Nuove Aziende Acquisite <span className="text-destructive">*</span>
            </Label>
            <Input
              id="nuove"
              value={nuoveAziende}
              onChange={(e) => setNuoveAziende(e.target.value)}
              placeholder="es. 12"
              type="number"
              min={0}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="note-cac">Note</Label>
            <Textarea
              id="note-cac"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className="resize-none"
              placeholder="Note opzionali..."
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
            Annulla
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!spesa || !nuoveAziende || isLoading}
          >
            {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Salva
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
