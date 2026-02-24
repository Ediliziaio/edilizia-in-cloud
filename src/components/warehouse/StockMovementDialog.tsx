import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
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
import { format } from "date-fns";

import { COST_CATEGORIES } from "@/types/warehouse";

interface StockMovementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: {
    quantity: number;
    notes?: string;
    registerCost?: boolean;
    costPaidDate?: string;
    costCategory?: string;
  }) => void;
  type: "carico" | "scarico";
  itemName: string;
  maxQuantity?: number;
  isPending?: boolean;
}

export function StockMovementDialog({
  open,
  onOpenChange,
  onSave,
  type,
  itemName,
  maxQuantity,
  isPending,
}: StockMovementDialogProps) {
  const [quantity, setQuantity] = useState("1");
  const [notes, setNotes] = useState("");
  const [registerCost, setRegisterCost] = useState(false);
  const [costPaidDate, setCostPaidDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [costCategory, setCostCategory] = useState("Magazzino");

  const handleSave = () => {
    const qty = parseInt(quantity) || 0;
    if (qty <= 0) return;
    if (type === "scarico" && maxQuantity !== undefined && qty > maxQuantity) return;
    onSave({
      quantity: qty,
      notes: notes.trim() || undefined,
      ...(registerCost && type === "carico"
        ? { registerCost: true, costPaidDate, costCategory }
        : {}),
    });
    setQuantity("1");
    setNotes("");
    setRegisterCost(false);
    setCostPaidDate(format(new Date(), "yyyy-MM-dd"));
    setCostCategory("Magazzino");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {type === "carico" ? "Carico Magazzino" : "Scarico Magazzino"}
          </DialogTitle>
          <DialogDescription>
            {type === "carico"
              ? `Aggiungi quantità per "${itemName}"`
              : `Rimuovi quantità da "${itemName}"${maxQuantity !== undefined ? ` (disponibili: ${maxQuantity})` : ""}`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Quantità *</Label>
            <Input
              type="number"
              min="1"
              max={type === "scarico" ? maxQuantity : undefined}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Note</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Motivo del movimento..."
              rows={2}
            />
          </div>

          {/* Cost registration - only for carico */}
          {type === "carico" && (
            <div className="border rounded-lg p-3 space-y-3 bg-muted/30">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="register-movement-cost"
                  checked={registerCost}
                  onCheckedChange={(checked) => setRegisterCost(checked === true)}
                />
                <Label htmlFor="register-movement-cost" className="text-sm font-medium cursor-pointer">
                  Registra costo acquisto nei Costi Aziendali
                </Label>
              </div>
              {registerCost && (
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Data pagamento</Label>
                    <Input
                      type="date"
                      value={costPaidDate}
                      onChange={(e) => setCostPaidDate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Categoria</Label>
                    <Select value={costCategory} onValueChange={setCostCategory}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {COST_CATEGORIES.map((cat) => (
                          <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annulla
          </Button>
          <Button
            onClick={handleSave}
            disabled={!parseInt(quantity) || isPending}
            variant={type === "scarico" ? "destructive" : "default"}
          >
            {isPending ? "..." : type === "carico" ? "Carica" : "Scarica"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
