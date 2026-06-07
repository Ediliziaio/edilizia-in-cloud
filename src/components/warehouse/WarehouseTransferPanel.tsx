import { useState } from "react";
import { ArrowRight, Plus, Trash2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useWarehouses } from "@/hooks/useWarehouses";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface TransferItem {
  stock_item_id: string;
  stock_item_name: string;
  quantity: number;
  available: number;
}

interface TransferStockItem {
  id: string;
  name: string;
  description: string | null;
  quantity: number;
  warehouse_id: string | null;
  unit_cost: number | null;
  vat_rate: number | null;
  supplier_id: string | null;
  section_id: string | null;
  min_stock_level: number | null;
  barcode?: string | null;
  internal_code?: string | null;
  tracking_mode?: "fungible" | "serialized" | null;
  requires_warranty?: boolean | null;
  default_warranty_months?: number | null;
}

interface WarehouseTransferPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const STATUS_COLORS: Record<string, string> = {
  bozza: "bg-muted text-muted-foreground",
  confermato: "bg-blue-100 text-blue-800",
  in_transito: "bg-amber-100 text-amber-800",
  ricevuto: "bg-green-100 text-green-800",
  annullato: "bg-destructive/10 text-destructive",
};

const STATUS_LABELS: Record<string, string> = {
  bozza: "Bozza",
  confermato: "Confermato",
  in_transito: "In transito",
  ricevuto: "Ricevuto",
  annullato: "Annullato",
};

export function WarehouseTransferPanel({ open, onOpenChange }: WarehouseTransferPanelProps) {
  const { effectiveCompany } = useAuth();
  const queryClient = useQueryClient();
  const companyId = effectiveCompany?.id;
  const { warehouses } = useWarehouses();

  const [fromWarehouseId, setFromWarehouseId] = useState<string>("");
  const [toWarehouseId, setToWarehouseId] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [transferDate, setTransferDate] = useState(new Date().toLocaleDateString("en-CA"));
  const [items, setItems] = useState<TransferItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // Stock items del magazzino di partenza
  const { data: stockItems = [] } = useQuery({
    queryKey: ["warehouse-stock-for-transfer", fromWarehouseId],
    queryFn: async () => {
      if (!fromWarehouseId) return [];
      const { data, error } = await supabase
        .from("warehouse_stock")
        .select(`
          id, name, description, quantity, warehouse_id,
          unit_cost, vat_rate, supplier_id, section_id, min_stock_level,
          barcode, internal_code, tracking_mode, requires_warranty, default_warranty_months
        `)
        .eq("company_id", companyId!)
        .eq("warehouse_id", fromWarehouseId)
        .gt("quantity", 0)
        .order("name");
      if (error) throw error;
      return (data ?? []) as TransferStockItem[];
    },
    enabled: !!fromWarehouseId && !!companyId,
    staleTime: 60000,
  });

  // Storico trasferimenti
  const { data: transfers = [] } = useQuery({
    queryKey: ["warehouse-transfers", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warehouse_transfers")
        .select("*, from_warehouse:warehouses!warehouse_transfers_from_warehouse_id_fkey(name), to_warehouse:warehouses!warehouse_transfers_to_warehouse_id_fkey(name)")
        .eq("company_id", companyId!)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!companyId && showHistory,
    staleTime: 60000,
  });

  const addItem = () => {
    setItems((prev) => [
      ...prev,
      { stock_item_id: "", stock_item_name: "", quantity: 1, available: 0 },
    ]);
  };

  const removeItem = (idx: number) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateItem = (idx: number, field: keyof TransferItem, value: any) => {
    setItems((prev) =>
      prev.map((item, i) => {
        if (i !== idx) return item;
        if (field === "stock_item_id") {
          const found = stockItems.find((s) => s.id === value);
          return {
            ...item,
            stock_item_id: value,
            stock_item_name: found?.name ?? "",
            available: found?.quantity ?? 0,
            quantity: 1,
          };
        }
        return { ...item, [field]: value };
      })
    );
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      // Trasferimento ATOMICO lato DB: header + righe + scarico sorgente +
      // carico destinazione + movimenti in un'unica transazione (RPC
      // create_warehouse_transfer_atomic). Sostituisce i round-trip separati
      // che, in caso di errore intermedio, lasciavano la giacenza corrotta.
      // Lock FOR UPDATE + math relativa + errore su giacenza insufficiente
      // sono gestiti dentro la funzione Postgres.
      // Cast `as any`: la RPC non è ancora nei types generati (migration non applicata).
      const { data, error } = await (supabase as any).rpc("create_warehouse_transfer_atomic", {
        p_company_id: companyId,
        p_from_warehouse_id: fromWarehouseId,
        p_to_warehouse_id: toWarehouseId,
        p_transfer_date: transferDate,
        p_notes: notes || null,
        p_items: items.map((item) => ({
          stock_item_id: item.stock_item_id,
          quantity: item.quantity,
        })),
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Trasferimento creato");
      // Invalidate mirate: prima ["warehouse"] era prefix broad che colpiva
      // 20+ queries (kanban/list/stats/calendar) → refetch storm.
      // Ora solo lo stock + i 2 set transfer-specifici.
      queryClient.invalidateQueries({ queryKey: ["warehouse-stock"] });
      queryClient.invalidateQueries({ queryKey: ["warehouse-movements"] });
      queryClient.invalidateQueries({ queryKey: ["warehouse-transfers"] });
      queryClient.invalidateQueries({ queryKey: ["warehouse-stock-for-transfer"] });
      resetForm();
    },
    onError: (e: any) => toast.error("Errore: " + e.message),
  });

  const resetForm = () => {
    setFromWarehouseId("");
    setToWarehouseId("");
    setNotes("");
    setTransferDate(new Date().toLocaleDateString("en-CA"));
    setItems([]);
    setShowConfirm(false);
  };

  const canSubmit =
    fromWarehouseId &&
    toWarehouseId &&
    fromWarehouseId !== toWarehouseId &&
    items.length > 0 &&
    items.every((i) => i.stock_item_id && i.quantity > 0 && i.quantity <= i.available);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRight className="h-5 w-5" />
            Trasferimento Merce tra Magazzini
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* From / To */}
          <div className="grid grid-cols-2 gap-4 items-end">
            <div className="space-y-2">
              <Label>Da magazzino *</Label>
              <Select value={fromWarehouseId} onValueChange={(v) => { setFromWarehouseId(v); setItems([]); }}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleziona…" />
                </SelectTrigger>
                <SelectContent>
                  {warehouses.map((w) => (
                    <SelectItem key={w.id} value={w.id} disabled={w.id === toWarehouseId}>
                      {w.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>A magazzino *</Label>
              <Select value={toWarehouseId} onValueChange={setToWarehouseId}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleziona…" />
                </SelectTrigger>
                <SelectContent>
                  {warehouses.map((w) => (
                    <SelectItem key={w.id} value={w.id} disabled={w.id === fromWarehouseId}>
                      {w.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Date & Notes */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Data trasferimento</Label>
              <Input
                type="date"
                value={transferDate}
                onChange={(e) => setTransferDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Note</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={1}
                placeholder="Note opzionali…"
              />
            </div>
          </div>

          {/* Items */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Articoli da trasferire</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addItem}
                disabled={!fromWarehouseId}
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                Aggiungi
              </Button>
            </div>

            {items.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center border rounded-md">
                {fromWarehouseId
                  ? "Clicca «Aggiungi» per selezionare gli articoli"
                  : "Seleziona prima il magazzino di partenza"}
              </p>
            ) : (
              <div className="space-y-2">
                {items.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <Select
                      value={item.stock_item_id}
                      onValueChange={(v) => updateItem(idx, "stock_item_id", v)}
                    >
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Articolo…" />
                      </SelectTrigger>
                      <SelectContent>
                        {stockItems.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name} (disp. {s.quantity})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      min={1}
                      max={item.available || undefined}
                      value={item.quantity}
                      onChange={(e) => updateItem(idx, "quantity", parseInt(e.target.value) || 1)}
                      className="w-24"
                      placeholder="Qtà"
                    />
                    {item.stock_item_id && item.quantity > item.available && (
                      <span className="text-xs text-destructive">Max {item.available}</span>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeItem(idx)}
                      className="shrink-0 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* History toggle */}
          <div className="border-t pt-3">
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground"
              onClick={() => setShowHistory((v) => !v)}
            >
              {showHistory ? "Nascondi storico" : "Mostra storico trasferimenti"}
            </Button>
            {showHistory && (
              <div className="mt-2 space-y-1 max-h-48 overflow-y-auto text-sm">
                {transfers.length === 0 ? (
                  <p className="text-muted-foreground py-2 text-center">Nessun trasferimento</p>
                ) : (
                  transfers.map((t: any) => (
                    <div key={t.id} className="flex items-center justify-between py-1 border-b">
                      <span className="text-muted-foreground">
                        {t.from_warehouse?.name} → {t.to_warehouse?.name}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">{t.transfer_date}</span>
                        <Badge className={STATUS_COLORS[t.status] + " text-xs"}>
                          {STATUS_LABELS[t.status]}
                        </Badge>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        {/* Confirmation banner */}
        {showConfirm && (
          <div className="border rounded-lg p-4 bg-amber-50 dark:bg-amber-950/20 border-amber-300 space-y-2">
            <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
              Confermi il trasferimento di {items.length} articol{items.length === 1 ? "o" : "i"} da{" "}
              <strong>{warehouses.find(w => w.id === fromWarehouseId)?.name}</strong> a{" "}
              <strong>{warehouses.find(w => w.id === toWarehouseId)?.name}</strong>?
            </p>
            <ul className="text-xs text-amber-700 dark:text-amber-300 space-y-0.5">
              {items.map((item, idx) => (
                <li key={idx}>- {item.stock_item_name}: {item.quantity} pz</li>
              ))}
            </ul>
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Questa operazione modificherà le giacenze di entrambi i magazzini.
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => { setShowConfirm(false); onOpenChange(false); }}>
            Annulla
          </Button>
          {showConfirm ? (
            <Button
              onClick={() => { createMutation.mutate(); setShowConfirm(false); }}
              disabled={createMutation.isPending}
              variant="default"
            >
              <CheckCircle2 className="h-4 w-4 mr-2" />
              {createMutation.isPending ? "Creazione…" : "Conferma Trasferimento"}
            </Button>
          ) : (
            <Button
              onClick={() => setShowConfirm(true)}
              disabled={!canSubmit}
            >
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Crea Trasferimento
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
