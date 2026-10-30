// src/hooks/useCruscottoGenerali.ts
// Le commesse generali nel cruscotto: una chiamata (cruscotto_commesse_generali)
// per tutte, solo se l'azienda le ha accese. I conti stanno in cruscottoGenerali.ts.
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { useImpostazioniCommesseGenerali } from "@/hooks/useCommesseGenerali";
import { leggiCruscottoGenerali, type CruscottoGenerali } from "@/lib/orders/generali/cruscottoGenerali";

// La RPC non è ancora nei tipi generati: cast localizzato.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export function useCruscottoGenerali() {
  const companyId = useEffectiveCompanyId();
  const { attiva } = useImpostazioniCommesseGenerali();
  const query = useQuery({
    queryKey: ["cruscotto", "commesse-generali", companyId],
    enabled: !!companyId && attiva,
    staleTime: 2 * 60_000,
    queryFn: async (): Promise<CruscottoGenerali | null> => {
      const { data, error } = await db.rpc("cruscotto_commesse_generali", { p_company_id: companyId });
      if (error) throw error;
      return leggiCruscottoGenerali(data);
    },
  });
  return { ...query, attiva };
}
