import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { campoWorkDay } from "@/lib/campo/workDay";

interface RapportinoSospeso {
  id: string;
  order_id: string;
  data_lavoro: string;
  stato: string;
  motivo_rifiuto: string | null;
  lavoro_completato: boolean | null;
  firma_cliente_url: string | null;
  order: { order_code: string | null; description: string | null } | null;
}

export function useRapportiniSospesi(ancheOggi = false, abilitato = true) {
  const { user, profile, effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id ?? profile?.company_id;
  const today = campoWorkDay();

  return useQuery({
    queryKey: ["campo-rapportini-sospesi", user?.id, companyId, ancheOggi ? "tutti" : today],
    queryFn: async (): Promise<RapportinoSospeso[]> => {
      let query = supabase.from("campo_rapportini")
        .select("id, order_id, data_lavoro, stato, motivo_rifiuto, lavoro_completato, firma_cliente_url, order:orders(order_code, description)")
        .eq("user_id", user!.id).eq("company_id", companyId!)
        .in("stato", ["bozza", "rifiutato"]).is("annullato_at", null);
      if (!ancheOggi) query = query.lt("data_lavoro", today);
      const { data, error } = await query.order("data_lavoro", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as RapportinoSospeso[];
    },
    enabled: abilitato && !!user?.id && !!companyId,
  });
}
