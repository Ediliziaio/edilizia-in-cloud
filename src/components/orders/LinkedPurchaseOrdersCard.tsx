import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Package, ExternalLink, Link2, Unlink, FileCheck } from "lucide-react";
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
import { logger } from "@/utils/logger";
import { CreatePurchaseOrderButton } from "./CreatePurchaseOrderButton";
import { LinkExistingPurchaseOrderDialog } from "./LinkExistingPurchaseOrderDialog";
import { useDDTCountsByPO } from "@/hooks/useDDTRicezione";
import type { ProcurementItem } from "@/lib/orders/materialProcurement";
import { usePermissions } from "@/hooks/usePermissions";
import { refreshMaterialQueries } from "@/lib/orders/refreshMaterialQueries";

import {
  ODA_STATUS_LABELS as STATUS_LABELS,
  ODA_STATUS_COLORS as STATUS_COLORS,
} from "@/lib/odaStatus";

interface LinkedPurchaseOrdersCardProps {
  orderId: string;
  orderCode?: string | null;
  items: ProcurementItem[];
}

export function LinkedPurchaseOrdersCard({ orderId, orderCode, items }: LinkedPurchaseOrdersCardProps) {
  const { effectiveCompany } = useAuth();
  const queryClient = useQueryClient();
  const companyId = effectiveCompany?.id;
  const { canEditOrders } = usePermissions();

  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [unlinkTarget, setUnlinkTarget] = useState<{ id: string; oda_number: string } | null>(null);

  // Unlink mutation
  const unlinkMutation = useMutation({
    mutationFn: async (poId: string) => {
      if (!canEditOrders || !companyId) throw new Error("Permessi insufficienti");
      const { error } = await supabase
        .from("purchase_orders")
        .update({ order_id: null })
        .eq("id", poId).eq("company_id", companyId).eq("order_id", orderId);
      if (error) throw error;

      // Diario: senza company_id (NOT NULL) l'insert falliva SEMPRE, e il
      // `void` senza await lo nascondeva — nessun collegamento OdA è mai
      // finito nel diario. L'evento è cronaca, non transazione: se fallisce
      // lo si logga, lo scollegamento resta valido.
      const { error: diaryErr } = await supabase.from("order_events" as never).insert({
        order_id: orderId,
        company_id: companyId,
        event_type: "ordine_fornitore_scollegato",
        payload: { po_id: poId, order_code: orderCode },
      } as never);
      if (diaryErr) logger.error("[LinkedPurchaseOrdersCard] evento diario non registrato:", diaryErr);
    },
    onSuccess: () => {
      refreshMaterialQueries(queryClient);
      queryClient.invalidateQueries({ queryKey: ["linked-purchase-orders", orderId] });
      queryClient.invalidateQueries({ queryKey: ["unlinked-purchase-orders", companyId] });
      queryClient.invalidateQueries({ queryKey: ["oes-oda", orderId] });
      toast.success("OdA scollegato dalla commessa");
      setUnlinkTarget(null);
    },
    onError: (e: Error) => {
      toast.error("Errore nello scollegamento", { description: e.message });
      setUnlinkTarget(null);
    },
  });

  const { data: linkedPOs = [], isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["linked-purchase-orders", orderId, companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_orders")
        .select("id, oda_number, status, total, suppliers(name)")
        .eq("order_id", orderId).eq("company_id", companyId!)
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
    enabled: !!orderId && !!companyId,
  });

  // DDT aggregato per ODA — evidenzia stato ricezione nei collegamenti
  const { data: ddtCounts = {} } = useDDTCountsByPO();

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-3 max-sm:p-3 max-sm:pb-2">
        <CardTitle className="flex items-center gap-2 text-base min-w-0">
          <Package className="h-4 w-4 shrink-0" />
          <span className="truncate">Ordini ai fornitori</span>
        </CardTitle>
        {/* Mobile: si guardano gli ordini; collegarli o crearne è lavoro d'ufficio. */}
        <div className="flex items-center gap-2 shrink-0 max-sm:hidden">
          <Button variant="outline" size="sm" disabled={!canEditOrders} onClick={() => setLinkDialogOpen(true)}>
            <Link2 className="h-4 w-4 mr-1.5" />
            Collega OdA
          </Button>
          <CreatePurchaseOrderButton orderId={orderId} orderCode={orderCode} items={items} />
        </div>
      </CardHeader>
      <CardContent className="max-sm:p-3 max-sm:pt-0">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Caricamento...</p>
        ) : isError ? (
          <div role="alert" className="flex flex-wrap gap-3 items-center text-sm">Impossibile caricare gli ordini collegati.<Button size="sm" variant="outline" disabled={isFetching} onClick={() => refetch()}>Riprova</Button></div>
        ) : linkedPOs.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nessun ordine d'acquisto collegato.</p>
        ) : (
          <div className="space-y-3 max-sm:space-y-2">
            {linkedPOs.map((po) => {
              const ddtAgg = ddtCounts[po.id];
              return (
                <div
                  key={po.id}
                  className="flex items-center justify-between p-2 rounded-md border hover:bg-accent transition-colors group"
                >
                  <Link
                    to={`/azienda/ordini-acquisto/${po.id}`}
                    className="flex-1 min-w-0"
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-sm font-medium">{po.oda_number}</span>
                        <Badge className={`text-xs border-0 ${STATUS_COLORS[po.status] || ""}`}>
                          {STATUS_LABELS[po.status] || po.status}
                        </Badge>
                        {ddtAgg && ddtAgg.total > 0 && (
                          <Badge
                            variant="outline"
                            className={`text-[10px] gap-1 ${
                              ddtAgg.ricevuti === ddtAgg.total
                                ? "border-green-300 text-green-700 bg-green-50"
                                : ddtAgg.parziali > 0
                                ? "border-amber-300 text-amber-700 bg-amber-50"
                                : "border-muted-foreground/30 text-muted-foreground"
                            }`}
                          >
                            <FileCheck className="h-2.5 w-2.5" />
                            {ddtAgg.ricevuti}/{ddtAgg.total} DDT
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{po.suppliers?.name || "—"}</p>
                    </div>
                  </Link>
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    <span className="text-sm font-medium">{formatCurrency(Number(po.total))}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100 transition-opacity max-sm:hidden"
                      disabled={!canEditOrders}
                      onClick={(e) => { e.stopPropagation(); setUnlinkTarget({ id: po.id, oda_number: po.oda_number }); }}
                      aria-label={`Scollega OdA ${po.oda_number}`}
                    >
                      <Unlink className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                    <Link to={`/azienda/ordini-acquisto/${po.id}`} className="max-sm:hidden">
                      <ExternalLink className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </Link>
                  </div>
                </div>
              );
            })}
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
              <strong>{unlinkTarget?.oda_number}</strong> da questa commessa?
              L'OdA non verrà eliminato, ma non sarà più associato a questa commessa.
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
