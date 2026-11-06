import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { UscitaMerceSheet } from "./UscitaMerceSheet";
import type { OrderOption } from "./OrderSelectCombobox";

/** Apre il flusso transazionale esistente, senza creare righe o movimenti all'apertura. */
export default function UscitaCommessaDialog({ orderId, onClose }: { orderId: string; onClose: () => void }) {
  const { effectiveCompany } = useAuth();
  const { canViewWarehouse, canEditWarehouse } = usePermissions();
  const companyId = effectiveCompany?.id;
  const allowed = !!companyId && canViewWarehouse && canEditWarehouse;
  const query = useQuery<OrderOption | null>({
    queryKey: ["uscita-commessa-contesto", companyId, orderId],
    enabled: allowed,
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase.from("orders")
        .select("id, order_code, client_name, client_company, customer:profiles!orders_customer_id_fkey(first_name,last_name), destination_warehouse_id, work_start_date, work_end_date, expected_date, indirizzo_lavori, work_address, status")
        .eq("company_id", companyId!).eq("id", orderId).is("deleted_at", null)
        .abortSignal(signal).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        id: data.id, order_code: data.order_code || "—",
        customer_name: data.client_company || data.client_name || [data.customer?.first_name, data.customer?.last_name].filter(Boolean).join(" ") || null,
        default_warehouse_id: data.destination_warehouse_id,
        work_start_date: data.work_start_date, work_end_date: data.work_end_date,
        expected_date: data.expected_date, indirizzo_lavori: data.indirizzo_lavori || data.work_address,
        status: data.status,
      };
    },
  });
  if (allowed && query.data && !query.isError) {
    return <UscitaMerceSheet key={`${companyId}:${orderId}`} open onOpenChange={(open) => { if (!open) onClose(); }} initialOrder={query.data} />;
  }
  return <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
    <DialogContent>
      <DialogHeader><DialogTitle>Uscita merce della commessa</DialogTitle>
        <DialogDescription>Verifica della commessa e dei permessi prima di scegliere i materiali.</DialogDescription></DialogHeader>
      <p role={query.isError || !allowed ? "alert" : "status"}>
        {!allowed ? "Per registrare un’uscita serve il permesso di modifica del magazzino nell’azienda selezionata."
          : query.isPending ? "Caricamento della commessa…"
            : query.isError ? "Non riesco a caricare la commessa. Riprova."
              : "Commessa non disponibile nell’azienda selezionata."}
      </p>
      {allowed && query.isError && <Button onClick={() => void query.refetch()} disabled={query.isFetching}>Riprova</Button>}
      <Button variant="outline" onClick={onClose}>Chiudi</Button>
    </DialogContent>
  </Dialog>;
}
