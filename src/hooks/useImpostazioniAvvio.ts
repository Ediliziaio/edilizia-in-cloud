// src/hooks/useImpostazioniAvvio.ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { messaggioModello } from "@/hooks/useModelliFasi";
import { CONTROLLI_DI_PARTENZA, controlliValidi, type ControlloAvvio } from "@/lib/orders/nuovaCommessa";
import { tipiDalDb, type TipoLavoro } from "@/lib/orders/tipiLavoro";

// Le colonne non sono ancora nei tipi generati: cast localizzato.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export interface ImpostazioniAvvio {
  /** Il modello di fasi di partenza dell'azienda (l'id del modello), o nessuno. */
  modelloFasi: string | null;
  /** Cosa controlla il riquadro «Cantiere da organizzare». */
  controlli: ControlloAvvio[];
  /** I lavori che l'azienda ha detto di fare; null = non l'ha detto (vale il settore). */
  tipiLavoro: TipoLavoro[] | null;
}

const diPartenza = (): ImpostazioniAvvio => ({ modelloFasi: null, controlli: [...CONTROLLI_DI_PARTENZA], tipiLavoro: null });

export const chiaveImpostazioniAvvio = (companyId: string | undefined) => ["impostazioni-avvio", companyId] as const;

/**
 * Cosa ha scelto l'azienda per la nascita di una commessa. Senza scelta, o se la
 * lettura fallisce (colonne non ancora create, rete): nessun modello, si controlla tutto.
 */
export function useImpostazioniAvvio() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: chiaveImpostazioniAvvio(companyId),
    enabled: !!companyId,
    staleTime: 60_000,
    queryFn: async (): Promise<ImpostazioniAvvio> => {
      try {
        const { data, error } = await db
          .from("company_fasi_settings")
          .select("modello_fasi_predefinito, controlli_avvio, tipi_lavoro")
          .eq("company_id", companyId!)
          .maybeSingle();
        if (error) throw error;
        return {
          modelloFasi: (data?.modello_fasi_predefinito as string | null | undefined) ?? null,
          controlli: controlliValidi(data?.controlli_avvio),
          tipiLavoro: tipiDalDb(data?.tipi_lavoro),
        };
      } catch {
        return diPartenza();
      }
    },
  });

  const salva = useMutation({
    mutationFn: async (valori: { modelloFasi?: string | null; controlli?: ControlloAvvio[]; tipiLavoro?: TipoLavoro[] | null }) => {
      const p_valori: Record<string, unknown> = {};
      if (valori.modelloFasi !== undefined) p_valori.modello_fasi_predefinito = valori.modelloFasi;
      if (valori.controlli !== undefined) p_valori.controlli_avvio = valori.controlli;
      if (valori.tipiLavoro !== undefined) p_valori.tipi_lavoro = valori.tipiLavoro;
      const { error } = await db.rpc("fasi_impostazioni_salva", { p_company_id: companyId, p_valori });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Fatto: vale da subito per le commesse nuove");
      void qc.invalidateQueries({ queryKey: chiaveImpostazioniAvvio(companyId) });
    },
    onError: (e) => toast.error(messaggioModello(e, "queste impostazioni")),
  });

  const dati = query.data ?? diPartenza();
  return { modelloFasi: dati.modelloFasi, controlli: dati.controlli, tipiLavoro: dati.tipiLavoro, isLoading: query.isLoading, salva };
}
