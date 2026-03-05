import { useState } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import {
  Calendar,
  ExternalLink,
  PackageCheck,
  StickyNote,
  Clock,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
  STATUS_CONFIG,
  getDaysUntilPosa,
  isItemUrgent,
  isItemCritical,
  isItemOverdue,
  getUrgencyLabel,
} from "@/types/warehouse";
import type { OrderItemStatus, WarehouseItem } from "@/types/warehouse";

interface WarehouseItemDetailDialogProps {
  item: WarehouseItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStatusChange: (itemId: string, status: OrderItemStatus) => void;
  onUpdateNotes?: (itemId: string, notes: string | null) => void;
  getSupplierName: (supplierId: string | null) => string | null;
  isUpdating: boolean;
  stockMatch?: { id: string; name: string; quantity: number } | null;
}

export default function WarehouseItemDetailDialog({
  item,
  open,
  onOpenChange,
  onStatusChange,
  onUpdateNotes,
  getSupplierName,
  isUpdating,
  stockMatch,
}: WarehouseItemDetailDialogProps) {
  const [editingNotes, setEditingNotes] = useState(false);
  const [noteText, setNoteText] = useState("");

  if (!item) return null;

  const supplierName = getSupplierName(item.supplier_id);
  const daysUntil = getDaysUntilPosa(item);
  const urgent = isItemUrgent(item);
  const critical = isItemCritical(item);
  const overdue = isItemOverdue(item);
  const expectedDate = item.order.expected_date || item.order.work_start_date;

  const startEditNotes = () => {
    setNoteText(item.notes || "");
    setEditingNotes(true);
  };

  const saveNotes = () => {
    onUpdateNotes?.(item.id, noteText.trim() || null);
    setEditingNotes(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg">{item.name}</DialogTitle>
          {item.description && (
            <p className="text-sm text-muted-foreground">{item.description}</p>
          )}
        </DialogHeader>

        <div className="space-y-4">
          {/* Status */}
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Stato</span>
            <Select
              value={item.status}
              onValueChange={(v) => onStatusChange(item.id, v as OrderItemStatus)}
              disabled={isUpdating}
            >
              <SelectTrigger
                className={cn(
                  "w-36 h-8 text-xs border-0 font-medium",
                  STATUS_CONFIG[item.status].bgColor,
                  STATUS_CONFIG[item.status].color
                )}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(STATUS_CONFIG).map(([status, config]) => (
                  <SelectItem key={status} value={status}>
                    {config.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Separator />

          {/* Quantity & Price */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <span className="text-xs text-muted-foreground">Quantità</span>
              <p className="font-medium">{item.quantity || 1}</p>
            </div>
            {item.purchase_price != null && (
              <div>
                <span className="text-xs text-muted-foreground">Prezzo acquisto</span>
                <p className="font-medium">€ {item.purchase_price.toFixed(2)}</p>
              </div>
            )}
          </div>

          {/* Supplier */}
          {supplierName && (
            <div>
              <span className="text-xs text-muted-foreground">Fornitore</span>
              <p className="text-sm font-medium">{supplierName}</p>
            </div>
          )}

          {/* Stock match */}
          {stockMatch && (
            <div className="flex items-center gap-2">
              <PackageCheck className="h-4 w-4 text-green-600" />
              <span className="text-sm">
                Disponibile in giacenza: <strong>{stockMatch.quantity} pz</strong>
              </span>
            </div>
          )}

          <Separator />

          {/* Order info */}
          <div>
            <span className="text-xs text-muted-foreground">Ordine</span>
            <div className="flex items-center justify-between mt-1">
              <p className="text-sm font-medium">
                {item.order.order_code || "Ordine"} — {item.order.customer.first_name} {item.order.customer.last_name}
              </p>
              <Button variant="ghost" size="sm" asChild className="h-7 px-2">
                <Link to={`/azienda/ordini/${item.order.id}`}>
                  <ExternalLink className="h-3 w-3 mr-1" />
                  Vai
                </Link>
              </Button>
            </div>
          </div>

          {/* Dates & urgency */}
          {expectedDate && (
            <div>
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Calendar className="h-3 w-3" /> Data posa prevista
              </span>
              <div className="flex items-center gap-2 mt-1">
                <p className="text-sm font-medium">
                  {format(new Date(expectedDate), "dd MMMM yyyy", { locale: it })}
                </p>
                {daysUntil !== null && (
                  <Badge
                    variant={overdue || critical ? "destructive" : urgent ? "secondary" : "outline"}
                    className={cn(
                      "text-xs",
                      overdue && "bg-destructive",
                      urgent && !critical && !overdue && "bg-amber-500 text-white hover:bg-amber-600"
                    )}
                  >
                    {overdue
                      ? `In ritardo (${Math.abs(daysUntil)}g)`
                      : daysUntil <= 7
                        ? getUrgencyLabel(daysUntil)
                        : `${daysUntil}g`}
                  </Badge>
                )}
              </div>
            </div>
          )}

          <Separator />

          {/* Notes */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <StickyNote className="h-3 w-3" /> Note
              </span>
              {!editingNotes && (
                <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={startEditNotes}>
                  {item.notes ? "Modifica" : "Aggiungi"}
                </Button>
              )}
            </div>
            {editingNotes ? (
              <div className="space-y-2">
                <Textarea
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  placeholder="Aggiungi nota..."
                  className="text-sm min-h-[60px]"
                />
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setEditingNotes(false)}>
                    Annulla
                  </Button>
                  <Button size="sm" onClick={saveNotes}>Salva</Button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {item.notes || "Nessuna nota"}
              </p>
            )}
          </div>

          {/* Last updated */}
          {item.updated_at && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground pt-2">
              <Clock className="h-3 w-3" />
              Aggiornato: {format(new Date(item.updated_at), "dd MMM yyyy HH:mm", { locale: it })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
