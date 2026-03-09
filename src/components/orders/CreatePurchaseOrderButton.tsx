import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useOperationalSuppliers } from "@/hooks/useOperationalSuppliers";
import { toast } from "sonner";

interface OrderItem {
  name: string;
  quantity: number;
  purchase_price?: number;
  supplier_id?: string;
  vat_rate?: number;
}

interface CreatePurchaseOrderButtonProps {
  orderId: string;
  orderCode?: string | null;
  items: OrderItem[];
}

export function CreatePurchaseOrderButton({ orderId, orderCode, items }: CreatePurchaseOrderButtonProps) {
  const [open, setOpen] = useState(false);
  const [supplierId, setSupplierId] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { user, effectiveCompany } = useAuth();
  const { suppliers } = useOperationalSuppliers();

  // Get unique supplier IDs from items
  const itemSupplierIds = [...new Set(items.filter(i => i.supplier_id).map(i => i.supplier_id!))];

  const handleCreate = async () => {
    if (!supplierId || !effectiveCompany?.id) return;
    setLoading(true);
    try {
      // Create OdA
      const { data: po, error: poErr } = await supabase
        .from("purchase_orders")
        .insert({
          company_id: effectiveCompany.id,
          supplier_id: supplierId,
          order_id: orderId,
          created_by: user?.id,
          notes: `Generato da ordine ${orderCode || orderId}`,
        } as any)
        .select()
        .single();
      if (poErr) throw poErr;

      // Add items that match selected supplier (or all if no supplier filter)
      const relevantItems = items.filter(i => !i.supplier_id || i.supplier_id === supplierId);
      if (relevantItems.length > 0) {
        const poItems = relevantItems.map((item, idx) => ({
          company_id: effectiveCompany.id,
          purchase_order_id: po.id,
          description: item.name,
          quantity: item.quantity,
          unit_price: item.purchase_price || 0,
          vat_rate: item.vat_rate || 22,
          discount_percent: 0,
          unit_of_measure: "pz",
          sort_order: idx,
        }));
        const { error: itemsErr } = await supabase.from("purchase_order_items").insert(poItems);
        if (itemsErr) throw itemsErr;
      }

      toast.success("Ordine d'acquisto creato");
      setOpen(false);
      navigate(`/azienda/ordini-acquisto/${po.id}`);
    } catch (e) {
      toast.error("Errore nella creazione dell'OdA", { description: String(e) });
    } finally {
      setLoading(false);
    }
  };

  const activeSuppliers = suppliers.filter(s => s.is_active);

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Package className="h-4 w-4 mr-2" />Crea OdA
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Crea Ordine d'Acquisto</DialogTitle>
            <DialogDescription>
              Crea un OdA collegato all'ordine {orderCode || ""} con gli articoli selezionati.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Fornitore</Label>
              <Select value={supplierId} onValueChange={setSupplierId}>
                <SelectTrigger><SelectValue placeholder="Seleziona fornitore" /></SelectTrigger>
                <SelectContent>
                  {/* Show item suppliers first */}
                  {itemSupplierIds.length > 0 && (
                    <>
                      {activeSuppliers
                        .filter(s => itemSupplierIds.includes(s.id))
                        .map(s => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name} ★
                          </SelectItem>
                        ))}
                    </>
                  )}
                  {activeSuppliers
                    .filter(s => !itemSupplierIds.includes(s.id))
                    .map(s => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">
              {items.length} articol{items.length === 1 ? "o" : "i"} verranno aggiunti all'OdA.
              {itemSupplierIds.length > 0 && " I fornitori degli articoli sono evidenziati con ★."}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Annulla</Button>
            <Button onClick={handleCreate} disabled={!supplierId || loading}>
              {loading ? "Creazione..." : "Crea OdA"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
