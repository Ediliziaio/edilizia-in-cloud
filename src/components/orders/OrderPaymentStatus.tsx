import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
const labels: Record<string, string> = { senza_piano: "Nessun piano rate registrato", rate_incassate: "Tutte le rate registrate risultano incassate", da_incassare: "Rate registrate da incassare", parziale: "Una parte delle rate registrate è stata incassata" };
export function OrderPaymentStatus({ orderId }: { orderId: string }) {
  const { user, effectiveCompany } = useAuth();
  const { canViewOrderPaymentStatus, canViewOrderAmounts, isLoading } = usePermissions();
  const allowed = canViewOrderPaymentStatus && !canViewOrderAmounts && !isLoading;
  const query = useQuery({ queryKey: ["order-payment-status", orderId, effectiveCompany?.id, user?.id], enabled: allowed,
    queryFn: async () => {
      const client = supabase as unknown as { rpc(name: string, args: object): PromiseLike<{ data: { status: string } | null; error: Error | null }> };
      const { data, error } = await client.rpc("commessa_stato_incassi", { p_order_id: orderId });
      if (error) throw error;
      if (!data || !labels[data.status]) throw new Error("Stato non disponibile");
      return data;
    },
  });
  if (!allowed) return null;
  return <section aria-label="Stato incassi senza importi" className="rounded-lg border bg-white p-4"><h3 className="font-medium">Stato degli incassi</h3>{query.isPending ? <p role="status">Verifica in corso…</p> : query.isError ? <p role="alert">Stato non disponibile.</p> : <p>{labels[query.data!.status]}</p>}<p className="mt-1 text-xs text-muted-foreground">Riferito alle rate registrate, senza importi o fatture.</p></section>;
}
