import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { leggiRegole, type RegoleCampo } from "@/lib/campo/regoleCampo";

// Le RPC Campo non sono ancora nei tipi generati: limita il contratto alle tre funzioni usate qui.
type RpcRegole = "campo_regole_per_ordine" | "campo_regole_azienda_leggi" | "campo_regole_azienda_salva";
const db = () => supabase as unknown as {
  rpc: (nome: RpcRegole, args: Record<string, unknown>) => PromiseLike<{
    data: unknown; error: { code: string; message: string } | null;
  }>;
};

interface RegoleAzienda { regole: RegoleCampo; sceltaFatta: boolean }
function regoleAzienda(data: unknown): RegoleAzienda {
  return { regole: leggiRegole(data), sceltaFatta: !!(data as { scelte_fatte?: boolean } | null)?.scelte_fatte };
}

/**
 * Le regole che valgono su una commessa, per l'app campo. Se la lettura fallisce
 * l'invio resta sospeso: un errore di rete non deve cambiare la scelta dell'azienda in «ognuno».
 */
export function useRegoleCampoOrdine(orderId: string | undefined) {
  const { user, profile } = useAuth();
  return useQuery<RegoleCampo>({
    queryKey: ["campo-regole-ordine", orderId, profile?.company_id, user?.id],
    enabled: !!orderId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await db().rpc("campo_regole_per_ordine", { p_order_id: orderId });
      if (error) throw error;
      return leggiRegole(data);
    },
  });
}

/** Le regole dell'azienda, per la pagina delle impostazioni (solo ufficio). */
export function useRegoleAzienda(companyId: string | undefined) {
  return useQuery<RegoleAzienda>({
    queryKey: ["campo-regole-azienda", companyId],
    enabled: !!companyId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await db().rpc("campo_regole_azienda_leggi", { p_company_id: companyId });
      if (error) throw error;
      return regoleAzienda(data);
    },
  });
}

export function useSalvaRegoleAzienda(companyId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (regole: RegoleCampo) => {
      if (!companyId) throw new Error("Seleziona un’azienda prima di salvare.");
      const { data, error } = await db().rpc("campo_regole_azienda_salva", {
        p_company_id: companyId,
        p_chi_compila: regole.chiCompila,
        p_ore_dalle: regole.oreDalle,
        p_avviso_minuti: regole.avvisoScostamentoMinuti,
      });
      if (error) throw error;
      if (!data || typeof data !== "object") throw new Error("La conferma del salvataggio non è disponibile. Ricarica le impostazioni.");
      const salvate = regoleAzienda(data);
      if (!salvate.sceltaFatta) throw new Error("La conferma del salvataggio non è disponibile. Ricarica le impostazioni.");
      return salvate;
    },
    onSuccess: async (salvate) => {
      // La risposta della RPC contiene le scelte persistite: evita il ritorno temporaneo ai vecchi valori.
      qc.setQueryData(["campo-regole-azienda", companyId], salvate);
      // le commesse già aperte nell'app campo rileggono le regole
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["campo-regole-azienda", companyId] }),
        qc.invalidateQueries({ queryKey: ["campo-regole-ordine"] }),
      ]);
    },
  });
}
