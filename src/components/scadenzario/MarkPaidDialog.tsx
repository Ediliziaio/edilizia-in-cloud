import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { Scadenza } from "@/hooks/useScadenzario";
import { formatCurrency } from "@/lib/formatters";

const fmtEur = (n: number) => formatCurrency(n);

interface Props {
  scadenza: Scadenza | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (params: { scadenzaId: string; amount: number; paymentMethod: string; paymentDate: string; notes?: string; accountLabel?: string }) => void;
  isPending: boolean;
}

export default function MarkPaidDialog({ scadenza, open, onOpenChange, onConfirm, isPending }: Props) {
  const remaining = scadenza ? scadenza.amount - scadenza.paid_amount : 0;
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("bonifico");
  const [date, setDate] = useState(new Date().toLocaleDateString("en-CA"));
  const [notes, setNotes] = useState("");
  const [accountLabel, setAccountLabel] = useState("banca");

  // Prefill all'APERTURA. NB: con dialog controllato Radix invoca onOpenChange solo
  // per interazioni interne (Esc/X/overlay), mai quando il parent setta open=true →
  // il vecchio handleOpen non scattava: importo mai precompilato col residuo e, alla
  // seconda apertura su un'ALTRA scadenza, restavano importo/note precedenti
  // (rischio di registrare un pagamento sbagliato).
  const scadenzaId = scadenza?.id;
  useEffect(() => {
    if (open && scadenza) {
      setAmount(String(scadenza.amount - scadenza.paid_amount));
      setMethod(scadenza.payment_method || "bonifico");
      setDate(new Date().toLocaleDateString("en-CA"));
      setNotes("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, scadenzaId]);

  if (!scadenza) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Registra Pagamento</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-lg bg-muted/50 p-3 text-sm">
            <p className="font-medium">{scadenza.description}</p>
            <p className="text-muted-foreground">
              Totale: {fmtEur(scadenza.amount)} · Residuo: {fmtEur(remaining)}
            </p>
          </div>

          <div className="space-y-2">
            <Label>Importo pagato</Label>
            <Input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0.01"
              max={remaining}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Metodo</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bonifico">Bonifico</SelectItem>
                  <SelectItem value="contanti">Contanti</SelectItem>
                  <SelectItem value="carta">Carta</SelectItem>
                  <SelectItem value="assegno">Assegno</SelectItem>
                  <SelectItem value="ri.ba">Ri.Ba.</SelectItem>
                  <SelectItem value="altro">Altro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Data pagamento</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Conto</Label>
            <Select value={accountLabel} onValueChange={setAccountLabel}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="banca">Banca</SelectItem>
                <SelectItem value="cassa">Cassa</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Note (opzionale)</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button>
          <Button
            onClick={() => onConfirm({
              scadenzaId: scadenza.id,
              amount: Number(amount),
              paymentMethod: method,
              paymentDate: date,
              notes: notes || undefined,
              accountLabel,
            })}
            disabled={isPending || !amount || Number(amount) <= 0 || Number(amount) > remaining}
          >
            {isPending ? "Salvataggio..." : "Registra"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
