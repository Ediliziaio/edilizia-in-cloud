import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface StockMovementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: { quantity: number; notes?: string }) => void;
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

  const handleSave = () => {
    const qty = parseInt(quantity) || 0;
    if (qty <= 0) return;
    if (type === "scarico" && maxQuantity !== undefined && qty > maxQuantity) return;
    onSave({ quantity: qty, notes: notes.trim() || undefined });
    setQuantity("1");
    setNotes("");
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
