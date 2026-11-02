/** Il collaudo nella scheda del cantiere: c'è solo se il capocantiere ha un modello da usare. */
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ClipboardCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export interface ModelloCapo { id: string; nome: string; schema: unknown }

export function useModelliCapo(orderId: string | undefined) {
  return useQuery<ModelloCapo[]>({
    queryKey: ["verbali-modelli-capo", orderId],
    enabled: !!orderId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as unknown as (f: string, a: unknown) => Promise<{ data: ModelloCapo[] | null; error: { code?: string } | null }>)(
        "verbali_modelli_per_ordine", { p_order_id: orderId });
      if (error?.code === "PGRST202" || error?.code === "42883") return [];
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function BottoneCollaudo({ orderId }: { orderId: string }) {
  const navigate = useNavigate();
  const { data: modelli = [] } = useModelliCapo(orderId);
  if (modelli.length === 0) return null;
  return (
    <button type="button" onClick={() => navigate(`/campo/lavoro/${orderId}/verbale`)}
      className="flex h-10 flex-col items-center justify-center gap-0.5 rounded-xl border bg-background px-1 text-xs font-semibold">
      <ClipboardCheck className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />Collaudo
    </button>
  );
}
