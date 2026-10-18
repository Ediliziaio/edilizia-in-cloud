import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { parametriDaRighe, type ParametriCosto, type ParametriCostoAzienda, type ProfiloCosto } from "@/lib/costoPersonale";

// La tabella e la RPC non sono ancora nei tipi generati: contratto locale.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export const CHIAVE_PARAMETRI_COSTO = "costo-personale-parametri";

/** Lettura fuori da React (caricatori e queryFn). */
export async function leggiParametriCosto(companyId: string): Promise<ParametriCostoAzienda> {
  const { data, error } = await db
    .from("costo_personale_parametri")
    .select("profilo, mensilita, inps, inail, cassa_edile, tfr, altri, ore_produttive")
    .eq("company_id", companyId);
  if (error) throw error;
  return parametriDaRighe(data);
}

/** Parametri del costo del personale dell'azienda attiva. Vuoto = valori edili. */
export function useParametriCostoPersonale() {
  const { effectiveCompany } = useAuth();
  return useParametriCostoDi(effectiveCompany?.id);
}

/** Come sopra, per chi conosce già l'azienda. */
export function useParametriCostoDi(companyId: string | null | undefined) {
  return useQuery({
    queryKey: [CHIAVE_PARAMETRI_COSTO, companyId],
    enabled: !!companyId,
    staleTime: 5 * 60_000,
    queryFn: () => leggiParametriCosto(companyId!),
  });
}

/** Salva i valori di un tipo; `null` torna ai valori edili. */
export function useSalvaParametriCosto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ profilo, valori }: { profilo: ProfiloCosto; valori: ParametriCosto | null }) => {
      const { error } = await db.rpc("costo_personale_parametri_salva", { p_profilo: profilo, p_valori: valori });
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [CHIAVE_PARAMETRI_COSTO] });
      void qc.invalidateQueries({ queryKey: ["assignment-hourly-cost"] });
    },
  });
}
