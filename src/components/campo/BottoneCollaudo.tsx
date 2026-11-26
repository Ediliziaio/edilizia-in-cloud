/** Il collaudo nella scheda del cantiere: c'è solo se il capocantiere ha un modello da usare. */
import { AZIONE_CANTIERE, AZIONE_ICONA } from "@/components/campo/stileAzioneCantiere";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ClipboardCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

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
  const t = useT();
  const { data: modelli = [], isSuccess } = useModelliCapo(orderId);
  // Con tutti i modelli spenti si entra solo se c'è qualcosa da rileggere.
  const { data: haVerbali = false } = useQuery<boolean>({
    queryKey: ["verbali-capo-ne-ha", orderId],
    enabled: isSuccess && modelli.length === 0,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as unknown as (f: string, a: unknown) => Promise<{ data: boolean | null; error: { code?: string } | null }>)(
        "verbali_capo_ne_ha", { p_order_id: orderId });
      if (error) return false;
      return data === true;
    },
  });
  if (modelli.length === 0 && !haVerbali) return null;
  return (
    <button type="button" onClick={() => navigate(`/campo/lavoro/${orderId}/verbale`)}
      className={AZIONE_CANTIERE}>
      <span className={AZIONE_ICONA}><ClipboardCheck className="size-5" aria-hidden="true" /></span>
      <span className="line-clamp-2 [overflow-wrap:anywhere]">{t("Collaudo")}</span>
    </button>
  );
}
