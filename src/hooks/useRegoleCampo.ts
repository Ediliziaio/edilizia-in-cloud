import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { REGOLE_COME_OGGI, leggiRegole, type RegoleCampo } from "@/lib/campo/regoleCampo";

// Le funzioni campo_regole_* non sono ancora nei tipi generati.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => supabase as any;

/**
 * Le regole che valgono su una commessa, per l'app campo. Se la lettura fallisce
 * si lavora «come oggi»: l'app degli operai non deve fermarsi per una scelta di flusso.
 */
export function useRegoleCampoOrdine(orderId: string | undefined) {
  return useQuery<RegoleCampo>({
    queryKey: ["campo-regole-ordine", orderId],
    enabled: !!orderId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await db().rpc("campo_regole_per_ordine", { p_order_id: orderId });
      return error ? REGOLE_COME_OGGI : leggiRegole(data);
    },
  });
}

/** Le regole dell'azienda, per la pagina delle impostazioni (solo ufficio). */
export function useRegoleAzienda(companyId: string | undefined) {
  return useQuery<{ regole: RegoleCampo; sceltaFatta: boolean }>({
    queryKey: ["campo-regole-azienda", companyId],
    enabled: !!companyId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await db().rpc("campo_regole_azienda_leggi", { p_company_id: companyId });
      if (error) throw error;
      return { regole: leggiRegole(data), sceltaFatta: !!(data as { scelte_fatte?: boolean } | null)?.scelte_fatte };
    },
  });
}

export function useSalvaRegoleAzienda(companyId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (regole: RegoleCampo) => {
      const { error } = await db().rpc("campo_regole_azienda_salva", {
        p_company_id: companyId,
        p_chi_compila: regole.chiCompila,
        p_ore_dalle: regole.oreDalle,
        p_avviso_minuti: regole.avvisoScostamentoMinuti,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["campo-regole-azienda", companyId] });
      // le commesse già aperte nell'app campo rileggono le regole
      void qc.invalidateQueries({ queryKey: ["campo-regole-ordine"] });
    },
  });
}
