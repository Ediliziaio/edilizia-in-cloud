/**
 * Chi timbra dall'app (26/11/2026, richiesta del founder): l'azienda (campo_avvisi_azienda.timbratura_app) e la
 * persona (hr_profili.timbra_dall_app) devono essere accese entrambe. Una regola sola, letta da campo_timbro_dall_app.
 * Finché non si sa (caricamento o senza rete al primo avvio) si mostra la timbratura: è il comportamento di sempre,
 * e una timbratura in più è meno grave di una che manca.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useIsCampo } from "@/hooks/useIsCampo";

export type MotivoSenzaTimbratura = "azienda" | "persona" | null;

export function useTimbraDallApp(): { timbra: boolean; motivo: MotivoSenzaTimbratura } {
  const { user, profile } = useAuth();
  const { isOperaio } = useIsCampo();
  const q = useQuery({
    queryKey: ["campo-timbro-dall-app", user?.id, profile?.company_id],
    enabled: !!user?.id && isOperaio,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as unknown as {
        rpc: (n: "campo_timbro_dall_app") => PromiseLike<{ data: unknown; error: { message: string } | null }>;
      }).rpc("campo_timbro_dall_app");
      if (error) throw error;
      const d = (data ?? {}) as { azienda?: boolean; persona?: boolean };
      return { azienda: d.azienda !== false, persona: d.persona !== false };
    },
  });
  if (!isOperaio) return { timbra: false, motivo: null };
  if (!q.data) return { timbra: true, motivo: null };
  if (!q.data.azienda) return { timbra: false, motivo: "azienda" };
  if (!q.data.persona) return { timbra: false, motivo: "persona" };
  return { timbra: true, motivo: null };
}
