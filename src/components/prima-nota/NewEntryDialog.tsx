import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const CATEGORIES = [
  { value: "incasso", label: "Incasso cliente" },
  { value: "fornitore", label: "Pagamento fornitore" },
  { value: "costo", label: "Costo aziendale" },
  { value: "fiscale", label: "Tasse / Fiscale" },
  { value: "stipendi", label: "Stipendi" },
  { value: "utenze", label: "Utenze" },
  { value: "affitto", label: "Affitto" },
  { value: "altro", label: "Altro" },
];

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onConfirm: (params: {
    direction: "entrata" | "uscita";
    category: string;
    description: string;
    amount: number;
    entry_date: string;
    payment_method?: string;
    reference_number?: string;
    account_label?: string;
    notes?: string;
  }) => void;
  isPending: boolean;
}

export default function NewEntryDialog({ open, onOpenChange, onConfirm, isPending }: Props) {
  const [direction, setDirection] = useState<"entrata" | "uscita">("uscita");
  const [category, setCategory] = useState("altro");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [entryDate, setEntryDate] = useState(new Date().toISOString().split("T")[0]);
  const [method, setMethod] = useState("bonifico");
  const [reference, setReference] = useState("");
  const [accountLabel, setAccountLabel] = useState("banca");
  const [notes, setNotes] = useState("");

  const reset = () => {
    setDirection("uscita");
    setCategory("altro");
    setDescription("");
    setAmount("");
    setEntryDate(new Date().toISOString().split("T")[0]);
    setMethod("bonifico");
    setReference("");
    setAccountLabel("banca");
    setNotes("");
  };

  const handleOpen = (o: boolean) => {
    if (o) reset();
    onOpenChange(o);
  };

  const isValid = description.trim() && Number(amount) > 0 && entryDate;

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nuova Registrazione</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Direzione</Label>
              <Select value={direction} onValueChange={(v) => setDirection(v as "entrata" | "uscita")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="entrata">↓ Entrata</SelectItem>
                  <SelectItem value="uscita">↑ Uscita</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Categoria</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Descrizione</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="es. Pagamento fornitore ABC" />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label>Importo (€)</Label>
              <Input type="number" step="0.01" min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Data</Label>
              <Input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} />
            </div>
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
          </div>

          <div className="space-y-2">
            <Label>Riferimento (opzionale)</Label>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="es. Fatt. 2025/001" />
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
              direction,
              category,
              description: description.trim(),
              amount: Number(amount),
              entry_date: entryDate,
              payment_method: method,
              reference_number: reference || undefined,
              notes: notes || undefined,
            })}
          >
            {isPending ? "Salvataggio..." : "Registra"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
