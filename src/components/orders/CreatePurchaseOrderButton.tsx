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
  id: string;
  name: string;
  quantity: number;
  purchase_price?: number;
  supplier_id?: string;
  vat_rate?: number;
  /** Distinta: se presente, ogni posizione diventa una riga OdA. */
  posizioni?: Array<{ descrizione: string; misure?: string | null; quantita: number }> | null;
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

  // Articoli che finiranno effettivamente nell'OdA: quelli senza fornitore o
  // che matchano il fornitore selezionato (stesso filtro usato in handleCreate).
  // Se nessun fornitore è ancora selezionato mostriamo il totale articoli.
  // SOLO gli articoli del fornitore scelto: prima il filtro era "del
  // fornitore O senza fornitore", quindi con due fornitori i senza-fornitore
  // finivano in ENTRAMBI gli OdA — righe duplicate.
  const relevantItems = supplierId
    ? items.filter(i => i.supplier_id === supplierId)
    : items;
  const relevantCount = relevantItems.length;

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
          notes: `Generato da commessa ${orderCode || orderId}`,
        } as any)
        .select()
        .single();
      if (poErr) throw poErr;

      // Solo il fornitore scelto, ed esclusi gli articoli GIA' dentro un OdA
      // non annullato: ricrearli produceva doppioni a ogni secondo click.
      const candidate = items.filter(i => i.supplier_id === supplierId);
      const candidateIds = candidate.filter(i => i.id).map(i => i.id!);
      let linked = new Set<string>();
      if (candidateIds.length > 0) {
        const { data: cov } = await supabase
          .from("purchase_order_items")
          .select("order_item_id, purchase_orders!inner(status)")
          .in("order_item_id", candidateIds)
          .neq("purchase_orders.status", "annullato");
        linked = new Set((cov ?? []).map(r => r.order_item_id).filter(Boolean) as string[]);
      }
      const relevantItems = candidate.filter(i => !i.id || !linked.has(i.id));
      if (relevantItems.length > 0) {
        // Con la distinta: una riga OdA per posizione (stessa logica del
        // pannello "Da ordinare ai fornitori").
        const poItems = relevantItems.flatMap((item) =>
          item.posizioni && item.posizioni.length > 0
            ? item.posizioni.map((po2) => ({
                order_item_id: item.id || null,
                description: `${item.name} — ${po2.descrizione}${po2.misure ? ` ${po2.misure}` : ""}`,
                quantity: po2.quantita,
                unit_price: item.purchase_price || 0,
                vat_rate: item.vat_rate || 22,
              }))
            : [{
                order_item_id: item.id || null,
                description: item.name,
                quantity: item.quantity,
                unit_price: item.purchase_price || 0,
                vat_rate: item.vat_rate || 22,
              }],
        ).map((r, idx) => ({
          company_id: effectiveCompany.id,
          purchase_order_id: po.id,
          ...r,
          discount_percent: 0,
          unit_of_measure: "pz",
          sort_order: idx,
        }));
        const { error: itemsErr } = await supabase.from("purchase_order_items").insert(poItems);
        if (itemsErr) throw itemsErr;
      }

      // Lo stato segue l'azione (solo le righe ancora "da ordinare")
      const createdIds = relevantItems.filter(i => i.id).map(i => i.id!);
      if (createdIds.length > 0) {
        await supabase.from("order_items").update({ status: "ordinato" })
          .in("id", createdIds).eq("status", "da_ordinare");
      }

      toast.success("Ordine d'acquisto creato");
      // Diary log
      void supabase.from("order_events" as never).insert({
        company_id: effectiveCompany.id,
        order_id: orderId,
        event_type: "ordine_fornitore_creato",
        payload: { po_id: po.id, supplier_id: supplierId, order_code: orderCode },
      } as never);
      setOpen(false);
      navigate(`/azienda/ordini-acquisto/${po.id}`);
    } catch (e) {
      toast.error("Errore nella creazione dell'OdA", {
        description: e instanceof Error ? e.message : String(e),
      });
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
              Crea un OdA collegato alla commessa {orderCode || ""} con gli articoli selezionati.
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
            {supplierId && relevantCount === 0 ? (
              <p className="text-xs text-destructive">
                Nessun articolo della commessa è collegato a questo fornitore.
                Seleziona un fornitore diverso oppure aggiungi prima gli articoli.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                {relevantCount} articol{relevantCount === 1 ? "o" : "i"} verrann{relevantCount === 1 ? "à" : "o"} aggiunt{relevantCount === 1 ? "o" : "i"} all'OdA.
                {itemSupplierIds.length > 0 && " I fornitori degli articoli sono evidenziati con ★."}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Annulla</Button>
            <Button onClick={handleCreate} disabled={!supplierId || loading || relevantCount === 0}>
              {loading ? "Creazione..." : "Crea OdA"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
