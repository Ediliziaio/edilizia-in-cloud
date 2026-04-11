import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Package, ExternalLink, Link2, Unlink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { formatCurrency } from "@/lib/formatters";
import { toast } from "sonner";
import { CreatePurchaseOrderButton } from "./CreatePurchaseOrderButton";
import { LinkExistingPurchaseOrderDialog } from "./LinkExistingPurchaseOrderDialog";

const STATUS_LABELS: Record<string, string> = {
  bozza: "Bozza", inviato: "Inviato", confermato: "Confermato",
  parziale: "Parziale", ricevuto: "Ricevuto", annullato: "Annullato",
};

const STATUS_COLORS: Record<string, string> = {
  bozza: "bg-muted text-muted-foreground",
  inviato: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  confermato: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
  parziale: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  ricevuto: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  annullato: "bg-destructive/10 text-destructive",
};

interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  purchase_price?: number;
  supplier_id?: string;
  vat_rate?: number;
}

interface LinkedPurchaseOrdersCardProps {
  orderId: string;
  orderCode?: string | null;
  items: OrderItem[];
}

export function LinkedPurchaseOrdersCard({ orderId, orderCode, items }: LinkedPurchaseOrdersCardProps) {
  const { effectiveCompany } = useAuth();
  const queryClient = useQueryClient();
  const companyId = effectiveCompany?.id;

  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [unlinkTarget, setUnlinkTarget] = useState<{ id: string; oda_number: string } | null>(null);

  // Unlink mutation
  const unlinkMutation = useMutation({
    mutationFn: async (poId: string) => {
      const { error } = await supabase
        .from("purchase_orders")
        .update({ order_id: null } as Record<string, unknown>)
        .eq("id", poId);
      if (error) throw error;

      // Diary log
      void supabase.from("order_events" as never).insert({
        order_id: orderId,
        event_type: "ordine_fornitore_scollegato",
        payload: { po_id: poId, order_code: orderCode },
      } as never);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["linked-purchase-orders", orderId] });
      queryClient.invalidateQueries({ queryKey: ["unlinked-purchase-orders", companyId] });
      toast.success("OdA scollegato dall'ordine");
      setUnlinkTarget(null);
    },
    onError: (e: Error) => {
      toast.error("Errore nello scollegamento", { description: e.message });
      setUnlinkTarget(null);
    },
  });

  const { data: linkedPOs = [], isLoading } = useQuery({
    queryKey: ["linked-purchase-orders", orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_orders")
        .select("id, oda_number, status, total, suppliers(name)")
        .eq("order_id", orderId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as Array<{
        id: string;
        oda_number: string;
        status: string;
        total: number;
        suppliers: { name: string } | null;
      }>;
    },
    enabled: !!orderId,
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
        <CardTitle className="flex items-center gap-2 text-base min-w-0">
          <Package className="h-4 w-4 shrink-0" />
          <span className="truncate">OdA Collegati</span>
        </CardTitle>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={() => setLinkDialogOpen(true)}>
            <Link2 className="h-4 w-4 mr-1.5" />
            Collega OdA
          </Button>
          <CreatePurchaseOrderButton orderId={orderId} orderCode={orderCode} items={items} />
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Caricamento...</p>
        ) : linkedPOs.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nessun ordine d'acquisto collegato.</p>
        ) : (
          <div className="space-y-3">
            {linkedPOs.map((po) => (
              <div
                key={po.id}
                className="flex items-center justify-between p-2 rounded-md border hover:bg-accent transition-colors group"
              >
                <Link
                  to={`/azienda/ordini-acquisto/${po.id}`}
                  className="flex-1 min-w-0"
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-medium">{po.oda_number}</span>
                      <Badge className={`text-xs border-0 ${STATUS_COLORS[po.status] || ""}`}>
                        {STATUS_LABELS[po.status] || po.status}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{po.suppliers?.name || "—"}</p>
                  </div>
                </Link>
                <div className="flex items-center gap-2 shrink-0 ml-2">
                  <span className="text-sm font-medium">{formatCurrency(Number(po.total))}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => { e.stopPropagation(); setUnlinkTarget({ id: po.id, oda_number: po.oda_number }); }}
                    aria-label={`Scollega OdA ${po.oda_number}`}
                  >
                    <Unlink className="h-3.5 w-3.5 text-muted-foreground" />
                  </Button>
                  <Link to={`/azienda/ordini-acquisto/${po.id}`}>
                    <ExternalLink className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {/* Link existing PO dialog */}
      <LinkExistingPurchaseOrderDialog
        open={linkDialogOpen}
        onOpenChange={setLinkDialogOpen}
        orderId={orderId}
        orderCode={orderCode}
      />

      {/* Unlink confirmation */}
      <AlertDialog open={!!unlinkTarget} onOpenChange={(open) => !open && setUnlinkTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Scollega OdA</AlertDialogTitle>
            <AlertDialogDescription>
              Sei sicuro di voler scollegare l'ordine d'acquisto{" "}
              <strong>{unlinkTarget?.oda_number}</strong> da questo ordine?
              L'OdA non verrà eliminato, ma non sarà più associato a questo ordine.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={unlinkMutation.isPending}>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => unlinkTarget && unlinkMutation.mutate(unlinkTarget.id)}
              disabled={unlinkMutation.isPending}
            >
              {unlinkMutation.isPending ? "Scollegamento..." : "Scollega"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
