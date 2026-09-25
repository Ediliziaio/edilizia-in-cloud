import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { OrderItemsList, type OrderItem } from "./OrderItemsList";
import { OrdinaPerFornitorePanel, PosaInLavorazioniBanner } from "./OrdinaPerFornitorePanel";
import { OrderAttachments } from "./OrderAttachments";
import { SupplierPaymentsCard } from "./SupplierPaymentsCard";
import { usePermissions } from "@/hooks/usePermissions";
import type { OrderItemData } from "@/lib/orderUtils";
import { OrderMaterialsSummary } from "./OrderMaterialsSummary";

interface OrdineArticoliProps {
  orderId: string;
  /** Codice commessa: finisce nei titoli di OdA e RDO generati dal pannello. */
  orderCode?: string | null;
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
  orderCode,
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
  const { canViewCosts, canEditOrders } = usePermissions();

  // Posa dal listino → voce Manodopera (order_external_teams). Materiale resta
  // in order_items: il costo manodopera NON viene contato due volte.
  const addLaborMutation = useMutation({
    mutationFn: async (labor: { external_team_id: string; total_cost: number; notes: string }) => {
      if (!canEditOrders) throw new Error("Permessi insufficienti");
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
    <div className="space-y-4 max-sm:space-y-3">
      {/* Acquisti (riepilogo, ordini per fornitore, posa da spostare): lavoro
          d'ufficio, dal telefono no — in cantiere servono gli articoli e il
          loro stato, qui sotto. */}
      <div className="space-y-4 max-sm:hidden">
      <OrderMaterialsSummary items={displayItems} orderId={orderId} />
      {/* Il lavoro dell'utente, fatto dal pannello: articoli da ordinare
          raggruppati per fornitore, un click per OdA. E se fra gli articoli
          c'e' della posa, il banner propone di spostarla nelle Lavorazioni. */}
      <OrdinaPerFornitorePanel orderId={orderId} orderCode={orderCode} items={displayItems} />
      {canEditOrders && canViewCosts && <PosaInLavorazioniBanner orderId={orderId} items={displayItems} />}
      </div>
          <OrderItemsList
            items={displayItems}
            onItemsChange={onItemsChange}
            editable={canEditOrders}
            allowEdit={canEditOrders}
            showStatusControls={canEditOrders}
            showOdaCoverage={true}
            onAttachmentsRefresh={onAttachmentsRefresh}
            onItemUpdate={onItemUpdate}
            fallbackCompanyId={companyId}
            onAddLabor={(labor) => addLaborMutation.mutate(labor)}
            // Qui una riga salvata non si toglie (il cestino non faceva niente):
            // si elimina da «Modifica commessa».
            allowDelete={false}
          />

      {showAttachments && <OrderAttachments orderId={orderId} editable={canEditOrders} />}

      {showSupplierPayments && canViewCosts && (
        <SupplierPaymentsCard items={orderItems} companyId={companyId} orderId={orderId} />
      )}
    </div>
  );
}
