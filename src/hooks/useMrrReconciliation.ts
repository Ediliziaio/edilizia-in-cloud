import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface MrrSnapshot {
  id: string;
  data: string;
  mrr_stripe_cents: number;
  mrr_interno_cents: number;
  discrepanza_cents: number;
  aziende_attive_stripe: number;
  aziende_attive_interno: number;
  breakdown_per_piano: Record<string, number>;
  dettaglio_discrepanze: Array<{ company_id: string; nome: string; mrr_stripe: number; mrr_interno: number }>;
  created_at: string;
}

export function useMrrReconciliation() {
  const queryClient = useQueryClient();

  const { data: snapshots, isLoading } = useQuery({
    queryKey: ["mrr-snapshots"],
    queryFn: async (): Promise<MrrSnapshot[]> => {
      const { data, error } = await supabase
        .from("mrr_snapshots")
        .select(
          "id, data, mrr_stripe_cents, mrr_interno_cents, discrepanza_cents, aziende_attive_stripe, aziende_attive_interno, breakdown_per_piano, dettaglio_discrepanze, created_at"
        )
        .order("data", { ascending: false })
        .limit(30);
      if (error) throw new Error(error.message);
      return (data ?? []) as MrrSnapshot[];
    },
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("sync-stripe-mrr");
      if (error) throw new Error(error.message);
      return data as { mrr_stripe: number; mrr_interno: number; discrepanza: number };
    },
    onSuccess: (result) => {
      toast.success(
        `Sincronizzazione completata. MRR Stripe: €${(result.mrr_stripe / 100).toFixed(2)}`
      );
      queryClient.invalidateQueries({ queryKey: ["mrr-snapshots"] });
    },
    onError: (err: Error) => toast.error("Errore sincronizzazione Stripe", { description: err.message }),
  });

  const latest = snapshots?.[0] ?? null;

  return { snapshots: snapshots ?? [], latest, isLoading, syncMutation };
}
