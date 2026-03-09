import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (params: {
    tipo: string;
    description: string;
    amount: number;
    due_date: string;
    notes?: string;
    payment_method?: string;
    alert_days_before?: number;
  }) => void;
  isPending: boolean;
}

export default function NewScadenzaDialog({ open, onOpenChange, onConfirm, isPending }: Props) {
  const [tipo, setTipo] = useState("incasso_cliente");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [method, setMethod] = useState("bonifico");
  const [notes, setNotes] = useState("");
  const [alertDays, setAlertDays] = useState("7");

  const reset = () => {
    setTipo("incasso_cliente");
    setDescription("");
    setAmount("");
    setDueDate("");
    setMethod("bonifico");
    setNotes("");
    setAlertDays("7");
  };

  const handleOpen = (o: boolean) => {
    if (o) reset();
    onOpenChange(o);
  };

  const isValid = description.trim() && Number(amount) > 0 && dueDate;

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nuova Scadenza</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Tipo</Label>
            <Select value={tipo} onValueChange={setTipo}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="incasso_cliente">Incasso cliente</SelectItem>
                <SelectItem value="pagamento_fornitore">Pagamento fornitore</SelectItem>
                <SelectItem value="costo_aziendale">Costo aziendale</SelectItem>
                <SelectItem value="scadenza_fiscale">Scadenza fiscale</SelectItem>
                <SelectItem value="altro">Altro</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Descrizione</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="es. Fattura n. 123 - Cliente XYZ" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Importo (€)</Label>
              <Input type="number" step="0.01" min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Scadenza</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Metodo pagamento</Label>
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

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Alert (giorni prima)</Label>
              <Input type="number" min="0" max="90" value={alertDays} onChange={(e) => setAlertDays(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Note (opzionale)</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button>
          <Button
            disabled={isPending || !isValid}
            onClick={() => onConfirm({
              tipo,
              description: description.trim(),
              amount: Number(amount),
              due_date: dueDate,
              notes: notes || undefined,
              payment_method: method,
            })}
          >
            {isPending ? "Salvataggio..." : "Crea Scadenza"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
