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
import { CommessaCombobox } from "@/components/orders/CommessaCombobox";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

interface StockMovementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: {
    quantity: number;
    notes?: string;
    registerCost?: boolean;
    costPaidDate?: string;
    costCategory?: string;
    /** commessa per cui esce la merce (solo scarico): il costo finisce sul suo margine */
    orderId?: string | null;
  }) => void;
  type: "carico" | "scarico";
  itemName: string;
  maxQuantity?: number;
  isPending?: boolean;
  canViewCosts?: boolean;
  serialized?: boolean;
}

export function StockMovementDialog(props: StockMovementDialogProps) {
  return props.open ? <StockMovementDialogSession key={`${props.type}:${props.itemName}`} {...props} /> : null;
}
function StockMovementDialogSession({
  open,
  onOpenChange,
  onSave,
  type,
  itemName,
  maxQuantity,
  isPending,
  canViewCosts = true,
  serialized = false,
}: StockMovementDialogProps) {
  const t = useT();
  const [quantity, setQuantity] = useState("1");
  const [notes, setNotes] = useState("");
  const [registerCost, setRegisterCost] = useState(false);
  const [costPaidDate, setCostPaidDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [costCategory, setCostCategory] = useState("Magazzino");
  const [orderId, setOrderId] = useState<string | null>(null);

  const handleSave = () => {
    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty <= 0 || (serialized && !Number.isInteger(qty))) return;
    if (type === "scarico" && maxQuantity !== undefined && qty > maxQuantity) return;
    onSave({
      quantity: qty,
      notes: notes.trim() || undefined,
      ...(type === "scarico" ? { orderId } : {}),
      ...(canViewCosts && registerCost && type === "carico"
        ? { registerCost: true, costPaidDate, costCategory }
        : {}),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {type === "carico" ? t("Carico Magazzino") : t("Scarico Magazzino")}
          </DialogTitle>
          <DialogDescription>
            {type === "carico"
              ? t("Aggiungi quantità per \"{itemName}\"", { itemName: String(itemName ?? "") })
              : maxQuantity !== undefined ? t("Rimuovi quantità da \"{itemName}\" (disponibili: {max})", { itemName: String(itemName ?? ""), max: maxQuantity }) : t("Rimuovi quantità da \"{itemName}\"", { itemName: String(itemName ?? "") })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>{t("Quantità *")}</Label>
            <Input
              type="number"
              min="0"
              step={serialized ? "1" : "any"}
              max={type === "scarico" ? maxQuantity : undefined}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </div>
          {/* Lo scarico rapido non chiedeva la commessa: la merce usciva e il suo
              costo non finiva su nessun cantiere. Resta facoltativa (scarti, uso interno). */}
          {type === "scarico" && (
            <div className="space-y-2">
              <Label>{t("Per quale commessa?")} <span className="font-normal text-muted-foreground">{t("(facoltativo)")}</span></Label>
              <CommessaCombobox value={orderId} onChange={setOrderId} nessunaLabel={t("Nessuna commessa (scarto, uso interno)")} />
            </div>
          )}
          <div className="space-y-2">
            <Label>{t("Note")}</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t("Motivo del movimento...")}
              rows={2}
            />
          </div>

          {/* Cost registration - only for carico */}
          {canViewCosts && type === "carico" && (
            <div className="border rounded-lg p-3 space-y-3 bg-muted/30">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="register-movement-cost"
                  checked={registerCost}
                  onCheckedChange={(checked) => setRegisterCost(checked === true)}
                />
                <Label htmlFor="register-movement-cost" className="text-sm font-medium cursor-pointer">
                  {t("Registra costo acquisto nei Costi Aziendali")}
                </Label>
              </div>
              {registerCost && (
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div className="space-y-1.5">
                    <Label className="text-xs">{t("Data pagamento")}</Label>
                    <Input
                      type="date"
                      value={costPaidDate}
                      onChange={(e) => setCostPaidDate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">{t("Categoria")}</Label>
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
            {t("Annulla")}
          </Button>
          <Button
            onClick={handleSave}
            disabled={!Number.isFinite(Number(quantity)) || Number(quantity) <= 0 || (serialized && !Number.isInteger(Number(quantity))) || isPending || (type === "scarico" && maxQuantity !== undefined && Number(quantity) > maxQuantity)}
            variant={type === "scarico" ? "destructive" : "default"}
          >
            {isPending ? "..." : type === "carico" ? t("Carica") : t("Scarica")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
