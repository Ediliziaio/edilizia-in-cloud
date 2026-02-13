import { useState, useEffect } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SupplierSelect } from "@/components/orders/SupplierSelect";
import { VAT_RATES } from "@/lib/vatUtils";
import type { StockItem } from "@/types/warehouse";

interface StockItemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: {
    name: string;
    description?: string;
    quantity: number;
    unit_cost: number;
    vat_rate: number;
    supplier_id?: string;
    min_stock_level: number;
  }) => void;
  editingItem?: StockItem | null;
  isPending?: boolean;
}

export function StockItemDialog({
  open,
  onOpenChange,
  onSave,
  editingItem,
  isPending,
}: StockItemDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [quantity, setQuantity] = useState("0");
  const [unitCost, setUnitCost] = useState("0");
  const [vatRate, setVatRate] = useState<number>(22);
  const [supplierId, setSupplierId] = useState<string | undefined>();
  const [minStockLevel, setMinStockLevel] = useState("0");

  useEffect(() => {
    if (editingItem) {
      setName(editingItem.name);
      setDescription(editingItem.description || "");
      setQuantity(editingItem.quantity.toString());
      setUnitCost(editingItem.unit_cost.toString());
      setVatRate(editingItem.vat_rate ?? 22);
      setSupplierId(editingItem.supplier_id || undefined);
      setMinStockLevel(editingItem.min_stock_level.toString());
    } else {
      setName("");
      setDescription("");
      setQuantity("0");
      setUnitCost("0");
      setVatRate(22);
      setSupplierId(undefined);
      setMinStockLevel("0");
    }
  }, [editingItem, open]);

  const handleSave = () => {
    if (!name.trim()) return;
    onSave({
      name: name.trim(),
      description: description.trim() || undefined,
      quantity: parseInt(quantity) || 0,
      unit_cost: parseFloat(unitCost) || 0,
      vat_rate: vatRate,
      supplier_id: supplierId,
      min_stock_level: parseInt(minStockLevel) || 0,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {editingItem ? "Modifica Articolo" : "Nuovo Articolo in Giacenza"}
          </DialogTitle>
          <DialogDescription>
            {editingItem
              ? "Modifica i dettagli dell'articolo in magazzino"
              : "Aggiungi un articolo al magazzino"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Nome Articolo *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Es: Motore tapparella"
            />
          </div>

          <div className="space-y-2">
            <Label>Descrizione</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Dettagli aggiuntivi..."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Quantità</Label>
              <Input
                type="number"
                min="0"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Costo Unitario (€)</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">€</span>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={unitCost}
                  onChange={(e) => setUnitCost(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>IVA</Label>
              <Select
                value={vatRate.toString()}
                onValueChange={(v) => setVatRate(parseInt(v))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VAT_RATES.map((rate) => (
                    <SelectItem key={rate.value} value={rate.value.toString()}>
                      {rate.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Soglia Minima</Label>
              <Input
                type="number"
                min="0"
                value={minStockLevel}
                onChange={(e) => setMinStockLevel(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Fornitore</Label>
            <SupplierSelect
              value={supplierId}
              onValueChange={(id, vr) => {
                setSupplierId(id);
                if (vr !== undefined) setVatRate(vr);
              }}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annulla
          </Button>
          <Button onClick={handleSave} disabled={!name.trim() || isPending}>
            {isPending ? "Salvataggio..." : editingItem ? "Salva" : "Aggiungi"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
