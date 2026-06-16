/**
 * LowStockReorderDialog — chiude il cerchio "sotto-scorta → riordino → ODA".
 *
 * Legge gli alert di sottoscorta (RPC get_low_stock_alerts), risolve fornitore /
 * costo / IVA dei rispettivi articoli da warehouse_stock, li raggruppa per
 * fornitore e permette di generare in un click un Ordine d'Acquisto (ODA) con le
 * quantità mancanti. L'insert ODA è minimale: oda_number, totali e stato sono
 * calcolati dai trigger DB (stesso pattern di CreatePurchaseOrderButton).
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLowStockAlerts, magazzinoKeys } from "@/hooks/useMagazzinoLive";
import { queryKeys } from "@/lib/queryKeys";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { TrendingDown, Package, Loader2, ShoppingCart, AlertCircle, Building2 } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  readOnly?: boolean;
}

interface StockMeta {
  supplier_id: string | null;
  unit_cost: number | null;
  vat_rate: number | null;
}

interface ReorderRow {
  stockItemId: string;
  name: string;
  deficit: number;
  available: number;
  minLevel: number;
  unitCost: number;
  vatRate: number;
  qty: number; // quantità da ordinare (editabile)
}

interface SupplierGroup {
  supplierId: string | null;
  supplierName: string;
  rows: ReorderRow[];
}

export function LowStockReorderDialog({ open, onOpenChange, companyId, readOnly = false }: Props) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { data: alerts = [], isLoading: alertsLoading } = useLowStockAlerts(companyId);

  const alertIds = useMemo(() => alerts.map((a) => a.stock_item_id), [alerts]);

  // Risolve fornitore/costo/IVA degli articoli sottoscorta (authoritative da DB).
  const { data: stockMeta = {}, isLoading: metaLoading } = useQuery({
    queryKey: ["low-stock-reorder-meta", companyId, alertIds],
    enabled: open && alertIds.length > 0,
    staleTime: 1000 * 60,
    queryFn: async (): Promise<Record<string, StockMeta>> => {
      const { data, error } = await supabase
        .from("warehouse_stock")
        .select("id, supplier_id, unit_cost, vat_rate")
        .in("id", alertIds);
      if (error) throw error;
      const map: Record<string, StockMeta> = {};
      for (const r of data ?? []) {
        map[(r as { id: string }).id] = {
          supplier_id: (r as { supplier_id: string | null }).supplier_id ?? null,
          unit_cost: (r as { unit_cost: number | null }).unit_cost ?? null,
          vat_rate: (r as { vat_rate: number | null }).vat_rate ?? null,
        };
      }
      return map;
    },
  });

  // Quantità editabili per riga (default = deficit arrotondato per eccesso, min 1).
  const [qtyOverrides, setQtyOverrides] = useState<Record<string, number>>({});
  const [creatingSupplier, setCreatingSupplier] = useState<string | null>(null);

  // Reset override quando si riapre la dialog.
  useEffect(() => {
    if (open) setQtyOverrides({});
  }, [open]);

  const groups = useMemo<SupplierGroup[]>(() => {
    const bySupplier = new Map<string, SupplierGroup>();
    for (const a of alerts) {
      const meta = stockMeta[a.stock_item_id];
      const supplierId = meta?.supplier_id ?? null;
      const key = supplierId ?? "__none__";
      const suggested = Math.max(1, Math.ceil(Number(a.deficit) || 0));
      const row: ReorderRow = {
        stockItemId: a.stock_item_id,
        name: a.name,
        deficit: Number(a.deficit) || 0,
        available: Number(a.quantity_available) || 0,
        minLevel: Number(a.min_stock_level) || 0,
        unitCost: Number(meta?.unit_cost ?? 0),
        vatRate: Number(meta?.vat_rate ?? 22),
        qty: qtyOverrides[a.stock_item_id] ?? suggested,
      };
      if (!bySupplier.has(key)) {
        bySupplier.set(key, {
          supplierId,
          supplierName: supplierId ? (a.supplier_name || "Fornitore") : "Senza fornitore",
          rows: [],
        });
      }
      bySupplier.get(key)!.rows.push(row);
    }
    // Gruppi con fornitore prima, "senza fornitore" in fondo.
    return Array.from(bySupplier.values()).sort((x, y) => {
      if (!x.supplierId) return 1;
      if (!y.supplierId) return -1;
      return x.supplierName.localeCompare(y.supplierName);
    });
  }, [alerts, stockMeta, qtyOverrides]);

  const setQty = (stockItemId: string, value: string) => {
    const n = Math.max(0, Math.floor(Number(value.replace(",", ".")) || 0));
    setQtyOverrides((prev) => ({ ...prev, [stockItemId]: n }));
  };

  const groupTotal = (g: SupplierGroup) =>
    g.rows.reduce((s, r) => s + r.qty * r.unitCost, 0);

  const handleGenerate = async (group: SupplierGroup) => {
    if (readOnly || !group.supplierId || !companyId) return;
    const rows = group.rows.filter((r) => r.qty > 0);
    if (rows.length === 0) {
      toast.error("Nessuna quantità da ordinare per questo fornitore");
      return;
    }
    setCreatingSupplier(group.supplierId);
    try {
      const { data: po, error: poErr } = await supabase
        .from("purchase_orders")
        .insert({
          company_id: companyId,
          supplier_id: group.supplierId,
          order_id: null,
          created_by: user?.id,
          notes: "Riordino automatico da sottoscorta magazzino",
        } as never)
        .select("id")
        .single();
      if (poErr) throw poErr;
      const poId = (po as { id: string }).id;

      const poItems = rows.map((r, idx) => ({
        company_id: companyId,
        purchase_order_id: poId,
        order_item_id: null,
        description: r.name,
        quantity: r.qty,
        unit_price: r.unitCost,
        vat_rate: r.vatRate || 22,
        discount_percent: 0,
        unit_of_measure: "pz",
        sort_order: idx,
      }));
      const { error: itemsErr } = await supabase.from("purchase_order_items").insert(poItems as never);
      if (itemsErr) throw itemsErr;

      toast.success(`Ordine d'acquisto creato per ${group.supplierName}`);
      queryClient.invalidateQueries({ queryKey: magazzinoKeys.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.warehouse.all });
      onOpenChange(false);
      navigate(`/azienda/ordini-acquisto/${poId}`);
    } catch (e) {
      toast.error("Errore nella creazione dell'ODA", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setCreatingSupplier(null);
    }
  };

  const isLoading = alertsLoading || (alertIds.length > 0 && metaLoading);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TrendingDown className="h-5 w-5 text-amber-600" />
            Riordino sottoscorta
          </DialogTitle>
          <DialogDescription>
            Articoli sotto la soglia minima, raggruppati per fornitore. Genera un ordine
            d'acquisto con le quantità mancanti in un click.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" /> Verifica giacenze…
          </div>
        ) : alerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-center text-muted-foreground">
            <Package className="h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm font-medium text-foreground">Tutte le giacenze sopra il minimo</p>
            <p className="text-xs">Non c'è nulla da riordinare al momento.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {groups.map((group) => {
              const canOrder = !readOnly && !!group.supplierId;
              const busy = creatingSupplier === group.supplierId && !!group.supplierId;
              return (
                <div key={group.supplierId ?? "__none__"} className="rounded-lg border bg-card">
                  <div className="flex items-center justify-between gap-2 border-b bg-muted/30 px-3 py-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="truncate text-sm font-semibold">{group.supplierName}</span>
                      <Badge variant="secondary" className="shrink-0 text-[10px]">
                        {group.rows.length} articol{group.rows.length === 1 ? "o" : "i"}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="hidden text-xs text-muted-foreground sm:inline">
                        ≈ {formatCurrency(groupTotal(group))}
                      </span>
                      {canOrder ? (
                        <Button size="sm" className="h-8 gap-1.5" onClick={() => handleGenerate(group)} disabled={busy}>
                          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShoppingCart className="h-3.5 w-3.5" />}
                          Genera ODA
                        </Button>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] text-amber-700">
                          <AlertCircle className="h-3.5 w-3.5" /> Assegna un fornitore
                        </span>
                      )}
                    </div>
                  </div>
                  <ul className="divide-y">
                    {group.rows.map((r) => (
                      <li key={r.stockItemId} className="flex items-center gap-3 px-3 py-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{r.name}</p>
                          <p className="text-[11px] text-muted-foreground">
                            Giacenza {r.available} / min {r.minLevel} · mancano {Math.ceil(r.deficit)}
                            {r.unitCost > 0 ? ` · ${formatCurrency(r.unitCost)}/pz` : " · costo mancante"}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <label className="text-[11px] text-muted-foreground" htmlFor={`qty-${r.stockItemId}`}>
                            Ordina
                          </label>
                          <Input
                            id={`qty-${r.stockItemId}`}
                            type="number"
                            inputMode="numeric"
                            min={0}
                            value={r.qty}
                            onChange={(e) => setQty(r.stockItemId, e.target.value)}
                            disabled={!canOrder}
                            className="h-8 w-20 text-sm"
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
            {readOnly && (
              <p className="text-center text-xs text-muted-foreground">
                Vista consulente: il riordino non è disponibile in sola lettura.
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default LowStockReorderDialog;
