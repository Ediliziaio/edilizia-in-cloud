import { useState } from "react";
import { ClipboardCheck, CheckCircle2, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import {
  useInventoryAudits,
  useCreateInventoryAudit,
  useApplyAuditAdjustment,
} from "@/hooks/useMagazzinoLive";
import type { StockItem } from "@/types/warehouse";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stockItem: StockItem | null;
}

export default function InventoryAuditDialog({ open, onOpenChange, stockItem }: Props) {
  const { effectiveCompany, user } = useAuth();
  const { data: audits = [] } = useInventoryAudits(stockItem?.id);
  const createAudit = useCreateInventoryAudit();
  const applyAdjustment = useApplyAuditAdjustment();

  const [counted, setCounted] = useState("");
  const [notes, setNotes] = useState("");

  if (!stockItem) return null;

  const handleSubmit = () => {
    if (!counted || !effectiveCompany?.id || !user?.id) return;
    createAudit.mutate(
      {
        company_id: effectiveCompany.id,
        stock_item_id: stockItem.id,
        expected_quantity: stockItem.quantity,
        counted_quantity: parseInt(counted, 10),
        performed_by: user.id,
        notes: notes || undefined,
      },
      {
        onSuccess: () => {
          setCounted("");
          setNotes("");
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5" />
            Inventario Fisico — {stockItem.name}
          </DialogTitle>
          <DialogDescription>
            Quantità attesa: <strong>{stockItem.quantity}</strong>
          </DialogDescription>
        </DialogHeader>

        {/* New audit form */}
        <div className="space-y-3 border-b pb-4">
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs font-medium text-muted-foreground">Quantità contata</label>
              <Input
                type="number"
                min={0}
                value={counted}
                onChange={(e) => setCounted(e.target.value)}
                placeholder="0"
              />
            </div>
            <div className="flex-1">
              <label className="text-xs font-medium text-muted-foreground">Differenza</label>
              <div className="h-10 flex items-center text-sm font-mono">
                {counted ? parseInt(counted, 10) - stockItem.quantity : "—"}
              </div>
            </div>
          </div>
          <Textarea
            placeholder="Note (opzionale)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
          />
          <Button
            onClick={handleSubmit}
            disabled={!counted || createAudit.isPending}
            className="w-full"
          >
            Registra Conteggio
          </Button>
        </div>

        {/* History */}
        <div className="space-y-2 max-h-[200px] overflow-y-auto">
          <p className="text-xs font-medium text-muted-foreground">Storico inventari</p>
          {audits.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">Nessun inventario precedente</p>
          ) : (
            audits.map((a) => (
              <div key={a.id} className="flex items-center justify-between p-2 rounded border text-sm">
                <div>
                  <span className="font-mono">{a.counted_quantity}</span>
                  <span className="text-muted-foreground mx-1">vs</span>
                  <span className="font-mono">{a.expected_quantity}</span>
                  {a.difference !== 0 && (
                    <Badge
                      variant={a.difference > 0 ? "secondary" : "destructive"}
                      className="ml-2 text-[10px]"
                    >
                      {a.difference > 0 ? "+" : ""}{a.difference}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(a.created_at), "d MMM", { locale: it })}
                  </span>
                  {a.adjustment_applied ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                  ) : a.difference !== 0 ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 text-[10px] px-2"
                      onClick={() =>
                        applyAdjustment.mutate({
                          auditId: a.id,
                          stockItemId: a.stock_item_id,
                          newQuantity: a.counted_quantity,
                        })
                      }
                      disabled={applyAdjustment.isPending}
                    >
                      Applica
                    </Button>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
