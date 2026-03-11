import { useState } from "react";
import { ClipboardCheck, CheckCircle2, AlertTriangle } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  useInventoryAudits,
  useCreateInventoryAuditMutation,
  useApplyAuditAdjustmentMutation,
} from "@/hooks/useMagazzinoLive";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stockItem: { id: string; name: string; quantity: number } | null;
  companyId: string;
}

export default function InventoryAuditDialog({ open, onOpenChange, stockItem, companyId }: Props) {
  const { data: audits = [] } = useInventoryAudits(companyId);
  const createAudit = useCreateInventoryAuditMutation();
  const applyAdjustment = useApplyAuditAdjustmentMutation();

  const [actualQuantity, setActualQuantity] = useState("");
  const [notes, setNotes] = useState("");

  if (!stockItem) return null;

  const parsedActual = parseInt(actualQuantity, 10);
  const isValid = !isNaN(parsedActual) && parsedActual >= 0;
  const difference = isValid ? parsedActual - stockItem.quantity : null;

  const itemAudits = audits.filter((a) => a.stock_item_id === stockItem.id);

  const handleSubmit = async () => {
    if (!isValid || difference === null) return;
    const user = await supabase.auth.getUser();
    const userId = user.data.user?.id;
    if (!userId) return;

    await createAudit.mutateAsync({
      companyId,
      stockItemId: stockItem.id,
      systemQuantity: stockItem.quantity,
      actualQuantity: parsedActual,
      notes: notes || undefined,
      auditedBy: userId,
    });

    setActualQuantity("");
    setNotes("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5" />
            Inventario Fisico
          </DialogTitle>
          <DialogDescription>
            Conta il materiale fisicamente e inserisci la quantità reale.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 border-b pb-4">
          <div className="text-sm font-medium">{stockItem.name}</div>
          <p className="text-xs text-muted-foreground">
            Quantità nel sistema: <strong>{stockItem.quantity}</strong>
          </p>

          <div>
            <label className="text-xs font-medium text-muted-foreground">Quantità conteggiata fisicamente *</label>
            <Input
              type="number"
              min={0}
              value={actualQuantity}
              onChange={(e) => setActualQuantity(e.target.value)}
              placeholder="0"
              autoFocus
            />
          </div>

          {isValid && difference !== null && (
            <div className={`p-2 rounded text-sm ${
              difference === 0 ? "bg-green-50 border border-green-200" :
              difference > 0 ? "bg-blue-50 border border-blue-200" :
              "bg-red-50 border border-red-200"
            }`}>
              {difference === 0 ? (
                <span className="text-green-700">✓ Nessuna differenza — giacenza corretta</span>
              ) : (
                <span className={difference > 0 ? "text-blue-700" : "text-red-700"}>
                  Differenza: {difference > 0 ? "+" : ""}{difference} unità
                </span>
              )}
            </div>
          )}

          <Textarea
            placeholder="Note (opzionale)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button>
          <Button onClick={handleSubmit} disabled={!isValid || createAudit.isPending}>
            {createAudit.isPending ? "Salvataggio..." : "Registra Inventario"}
          </Button>
        </DialogFooter>

        {/* History */}
        <div className="space-y-2 max-h-[200px] overflow-y-auto border-t pt-3">
          <p className="text-xs font-medium text-muted-foreground">Storico inventari</p>
          {itemAudits.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">Nessun inventario precedente</p>
          ) : (
            itemAudits.map((a) => (
              <div key={a.id} className="flex items-center justify-between p-2 rounded border text-sm">
                <div>
                  <span className="text-xs text-muted-foreground">
                    Sistema: {a.system_quantity} → Reale: {a.actual_quantity}
                  </span>
                  {a.difference !== 0 && (
                    <Badge
                      variant={a.difference > 0 ? "secondary" : "destructive"}
                      className="ml-2 text-[10px]"
                    >
                      {a.difference > 0 ? "+" : ""}{a.difference}
                    </Badge>
                  )}
                  {a.notes && <p className="text-[10px] text-muted-foreground mt-0.5">{a.notes}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(a.audited_at).toLocaleDateString("it-IT", { day: "2-digit", month: "short" })}
                  </span>
                  {a.adjustment_applied ? (
                    <Badge variant="outline" className="text-[10px] text-green-700 border-green-300">
                      <CheckCircle2 className="h-3 w-3 mr-1" /> Applicata
                    </Badge>
                  ) : a.difference !== 0 ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 text-[10px] px-2"
                      onClick={() =>
                        applyAdjustment.mutate({
                          auditId: a.id,
                          stockItemId: a.stock_item_id,
                          actualQuantity: a.actual_quantity,
                          difference: a.difference,
                          companyId,
                        })
                      }
                      disabled={applyAdjustment.isPending}
                    >
                      <AlertTriangle className="h-3 w-3 mr-1" /> Applica Rettifica
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
