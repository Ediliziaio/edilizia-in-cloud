import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface VoceCatalogo { id: string; nome: string; unita: string; costo_unitario: number | null; vendita_unitaria: number | null }

/** Le voci che l'azienda ha attivato per il rapportino, e se si possono anche scrivere a mano. */
export function useCatalogoVociRapportino(companyId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ["rapportino-voci-modello", companyId, "attive"],
    enabled: !!companyId && enabled,
    retry: false,
    queryFn: async () => {
      const q = supabase as unknown as { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
      const [a, b] = await Promise.all([
        q.from("rapportino_voci_modello").select("id, nome, unita, costo_unitario, vendita_unitaria").eq("company_id", companyId).eq("attivo", true).order("ordine"),
        q.from("rapportino_voci_impostazioni").select("a_mano").eq("company_id", companyId).maybeSingle(),
      ]);
      return { voci: (a.data ?? []) as VoceCatalogo[], aMano: (b.data?.a_mano ?? true) as boolean };
    },
  });
}
