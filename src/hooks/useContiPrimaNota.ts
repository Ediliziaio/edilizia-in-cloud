import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ContoContabile } from "@/lib/contabilita/libroGiornale";
import { mappaContiPrimaNota, type ContoPrimaNota } from "@/lib/contabilita/contiPrimaNota";
export { contiDiLiquidita } from "@/lib/contabilita/contiPrimaNota";
export type { ContoPrimaNota } from "@/lib/contabilita/contiPrimaNota";

export function useContiPrimaNota(companyId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ["prima-nota-conti", companyId, "tipi-v3"], enabled: enabled && !!companyId,
    queryFn: async (): Promise<ContoPrimaNota[]> => {
      const [banche, piano] = await Promise.all([
        supabase.from("bank_accounts_operativi").select("id,display_name,account_name,iban,currency,connection_id,is_manual")
          .eq("company_id", companyId!).eq("is_active", true).order("created_at"),
        supabase.from("contabilita_conti").select("*").eq("company_id", companyId!).order("codice"),
      ]);
      if (banche.error) throw banche.error;
      if (piano.error) throw piano.error;
      return mappaContiPrimaNota(banche.data ?? [], (piano.data ?? []) as ContoContabile[]);
    }, staleTime: 30_000,
  });
}
