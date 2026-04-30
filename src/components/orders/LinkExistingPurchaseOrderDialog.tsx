import { useState, useMemo } from "react";
import { Link2, Search, Loader2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/formatters";

const STATUS_LABELS: Record<string, string> = {
  bozza: "Bozza", inviato: "Inviato", confermato: "Confermato",
  parziale: "Parziale", ricevuto: "Ricevuto", annullato: "Annullato",
};

const STATUS_COLORS: Record<string, string> = {
  bozza: "bg-muted text-muted-foreground",
  inviato: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  confermato: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
};

interface LinkExistingPurchaseOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  orderCode?: string | null;
}

interface UnlinkedPO {
  id: string;
  oda_number: string;
  status: string;
  total: number;
  issue_date: string;
  suppliers: { name: string } | null;
}

export function LinkExistingPurchaseOrderDialog({
  open, onOpenChange, orderId, orderCode,
}: LinkExistingPurchaseOrderDialogProps) {
  const { effectiveCompany } = useAuth();
  const queryClient = useQueryClient();
  const companyId = effectiveCompany?.id;

  const [searchQuery, setSearchQuery] = useState("");

  // Fetch unlinked POs (no order_id assigned, not annullato/ricevuto)
  const { data: unlinkedPOs = [], isLoading } = useQuery({
    queryKey: ["unlinked-purchase-orders", companyId],
    queryFn: async (): Promise<UnlinkedPO[]> => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("purchase_orders")
        .select("id, oda_number, status, total, issue_date, suppliers(name)")
        .eq("company_id", companyId)
        .is("order_id", null)
        .not("status", "in", '("annullato","ricevuto")')
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as UnlinkedPO[];
    },
    enabled: !!companyId && open,
    staleTime: 30000,
  });

  // Filter by search
  const filtered = useMemo(() => {
    if (!searchQuery) return unlinkedPOs;
    const q = searchQuery.toLowerCase();
    return unlinkedPOs.filter(
      (po) =>
        po.oda_number.toLowerCase().includes(q) ||
        (po.suppliers?.name || "").toLowerCase().includes(q)
    );
  }, [unlinkedPOs, searchQuery]);

  // Link mutation
  const linkMutation = useMutation({
    mutationFn: async (poId: string) => {
      const { error } = await supabase
        .from("purchase_orders")
        .update({ order_id: orderId } as Record<string, unknown>)
        .eq("id", poId);
      if (error) throw error;

      // Diary log
      void supabase.from("order_events" as never).insert({
        order_id: orderId,
        event_type: "ordine_fornitore_collegato",
        payload: { po_id: poId, order_code: orderCode },
      } as never);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["linked-purchase-orders", orderId] });
      queryClient.invalidateQueries({ queryKey: ["unlinked-purchase-orders", companyId] });
      toast.success("OdA collegato alla commessa");
      onOpenChange(false);
    },
    onError: (e: Error) => {
      toast.error("Errore nel collegamento", { description: e.message });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            Collega OdA Esistente
          </DialogTitle>
          <DialogDescription>
            Seleziona un ordine d'acquisto da collegare alla commessa {orderCode || ""}.
            Sono mostrati solo gli OdA non ancora collegati ad altre commesse.
          </DialogDescription>
        </DialogHeader>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Cerca per numero OdA o fornitore..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto space-y-2 min-h-[200px]">
          {isLoading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Caricamento...
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              {searchQuery
                ? "Nessun OdA trovato con questo filtro."
                : "Nessun OdA disponibile per il collegamento."}
            </div>
          ) : (
            filtered.map((po) => (
              <button
                key={po.id}
                type="button"
                onClick={() => linkMutation.mutate(po.id)}
                disabled={linkMutation.isPending}
                className="w-full flex items-center justify-between p-3 rounded-md border hover:bg-accent transition-colors text-left disabled:opacity-50"
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-medium">{po.oda_number}</span>
                    <Badge className={`text-xs border-0 ${STATUS_COLORS[po.status] || "bg-muted text-muted-foreground"}`}>
                      {STATUS_LABELS[po.status] || po.status}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {po.suppliers?.name || "—"} — {po.issue_date || "—"}
                  </p>
                </div>
                <span className="text-sm font-medium shrink-0 ml-2">
                  {formatCurrency(Number(po.total))}
                </span>
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
