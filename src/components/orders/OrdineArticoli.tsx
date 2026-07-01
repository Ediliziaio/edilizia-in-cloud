import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Package } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { OrderItemsList, type OrderItem } from "./OrderItemsList";
import { OrderAttachments } from "./OrderAttachments";
import { SupplierPaymentsCard } from "./SupplierPaymentsCard";
import { usePermissions } from "@/hooks/usePermissions";
import type { OrderItemData } from "@/lib/orderUtils";

interface OrdineArticoliProps {
  orderId: string;
  displayItems: OrderItem[];
  orderItems: OrderItemData[];
  companyId: string;
  onItemsChange: (newItems: OrderItem[]) => void;
  onItemUpdate: (item: OrderItem) => void;
  onAttachmentsRefresh: () => void;
  /** Mostra la card "Documenti Commessa" sotto gli articoli (default true).
   *  Il desktop la sposta in Panoramica → passa false. */
  showAttachments?: boolean;
  /** Mostra la card "Pagamenti Fornitori" (default true). Il desktop la sposta
   *  sotto la Manodopera → passa false. */
  showSupplierPayments?: boolean;
}

export function OrdineArticoli({
  orderId,
  displayItems,
  orderItems,
  companyId,
  onItemsChange,
  onItemUpdate,
  onAttachmentsRefresh,
  showAttachments = true,
  showSupplierPayments = true,
}: OrdineArticoliProps) {
  const queryClient = useQueryClient();
  // Pagamenti fornitori = costi → visibili solo a chi ha canViewCosts.
  const { canViewCosts } = usePermissions();

  // Posa dal listino → voce Manodopera (order_external_teams). Materiale resta
  // in order_items: il costo manodopera NON viene contato due volte.
  const addLaborMutation = useMutation({
    mutationFn: async (labor: { external_team_id: string; total_cost: number; notes: string }) => {
      const { error } = await supabase.from("order_external_teams").insert({
        order_id: orderId,
        external_team_id: labor.external_team_id,
        total_cost: labor.total_cost,
        vat_rate: 22,
        is_paid: false,
        notes: labor.notes,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["order-external-teams", orderId] });
      toast.success("Posa aggiunta alla Manodopera");
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Errore aggiunta posa alla Manodopera");
    },
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Package className="h-4 w-4 text-orange-500" />
            Articoli
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <OrderItemsList
            items={displayItems}
            onItemsChange={onItemsChange}
            editable={true}
            allowEdit={true}
            showStatusControls={true}
            showOdaCoverage={true}
            onAttachmentsRefresh={onAttachmentsRefresh}
            onItemUpdate={onItemUpdate}
            fallbackCompanyId={companyId}
            onAddLabor={(labor) => addLaborMutation.mutate(labor)}
          />
        </CardContent>
      </Card>

      {showAttachments && <OrderAttachments orderId={orderId} editable={true} />}

      {showSupplierPayments && canViewCosts && (
        <SupplierPaymentsCard items={orderItems} companyId={companyId} orderId={orderId} />
      )}
    </div>
  );
}
