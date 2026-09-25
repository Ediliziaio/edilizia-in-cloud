import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { useOperationalSuppliers } from "@/hooks/useOperationalSuppliers";
import { usePermissions } from "@/hooks/usePermissions";
import { useMaterialProcurement, useUnmappedPurchaseOrders } from "@/hooks/useMaterialProcurement";
import { refreshMaterialQueries } from "@/lib/orders/refreshMaterialQueries";
import { pendingMaterials, type ProcurementItem } from "@/lib/orders/materialProcurement";
import { createMaterialPurchaseOrder, IncompletePurchaseOrderError } from "@/lib/orders/createMaterialPurchaseOrder";
import { toast } from "sonner";

interface CreatePurchaseOrderButtonProps {
  orderId: string;
  orderCode?: string | null;
  items: ProcurementItem[];
}

export function CreatePurchaseOrderButton({ orderId, orderCode, items }: CreatePurchaseOrderButtonProps) {
  const [open, setOpen] = useState(false);
  const [supplierId, setSupplierId] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user, effectiveCompany } = useAuth();
  const { canEditOrders, canViewCosts } = usePermissions();
  const { suppliers } = useOperationalSuppliers();
  const coverage = useMaterialProcurement(items);
  const unmapped = useUnmappedPurchaseOrders(orderId);
  const pending = pendingMaterials(items, coverage.data ?? []);
  const available = suppliers.filter(s => s.is_active && !unmapped.data?.some(o => o.supplier_id === s.id) && pending.some(i => i.supplier_id === s.id));
  const selected = pending.filter(i => i.supplier_id === supplierId);
  const verified = !coverage.isPending && !coverage.isError && !unmapped.isPending && !unmapped.isError;

  const handleCreate = async () => {
    if (!supplierId || !effectiveCompany?.id || !verified || !canEditOrders || !canViewCosts || loading) return;
    setLoading(true);
    try {
      const { poId } = await createMaterialPurchaseOrder({
        companyId: effectiveCompany.id, orderId, orderCode, supplierId, userId: user?.id, items: selected,
      });
      toast.success("Bozza d’acquisto creata. Verifica e invia dall’OdA.");
      setOpen(false);
      navigate(`/azienda/ordini-acquisto/${poId}`);
    } catch (e) {
      toast.error("OdA non completato", {
        description: e instanceof Error ? e.message : String(e),
        action: e instanceof IncompletePurchaseOrderError ? { label: "Verifica bozza", onClick: () => navigate(`/azienda/ordini-acquisto/${e.poId}`) } : undefined,
      });
    } finally {
      setLoading(false);
      refreshMaterialQueries(qc);
    }
  };

  if (!canEditOrders || !canViewCosts) return null;
  return <>
    <Button variant="outline" size="sm" disabled={!verified || available.length === 0}
      onClick={() => { setSupplierId(available.length === 1 ? available[0].id : ""); setOpen(true); }}>
      <Package className="h-4 w-4 mr-2" />Crea bozza OdA
    </Button>
    <Dialog open={open} onOpenChange={value => { if (!loading) setOpen(value); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Prepara l’ordine d’acquisto</DialogTitle>
          <DialogDescription>Commessa {orderCode || ""}: solo quantità ancora da acquistare, escluse quelle nelle bozze esistenti. Nessun invio automatico.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Label htmlFor="purchase-supplier">Fornitore</Label>
          <Select value={supplierId} onValueChange={setSupplierId} disabled={loading}>
            <SelectTrigger id="purchase-supplier"><SelectValue placeholder="Seleziona fornitore" /></SelectTrigger>
            <SelectContent>{available.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
          </Select>
          {!verified ? <p role="alert" className="text-sm text-destructive">Verifica delle quantità non disponibile. Chiudi e aggiorna prima di ordinare.</p> :
            <ul className="max-h-60 overflow-y-auto divide-y text-sm">{selected.map(i => <li key={i.id} className="py-2 flex justify-between gap-3"><span>{i.name}</span><span className="tabular-nums shrink-0">× {i.quantity.toLocaleString("it-IT")}</span></li>)}</ul>}
          {verified && selected.length === 0 && <p className="text-sm text-muted-foreground">Nessun articolo residuo per questo fornitore.</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>Annulla</Button>
          <Button onClick={handleCreate} disabled={!verified || !supplierId || loading || !selected.length}>{loading ? "Creazione…" : "Crea bozza OdA"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
