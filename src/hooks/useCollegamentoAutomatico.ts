/**
 * L'interruttore del collegamento automatico dell'azienda (docs/automazioni-acquisti.md §3).
 *
 * Lettura dal server (`azienda_collegamento_automatico`): spento se manca la riga o se la
 * lettura fallisce. Scrittura su `company_governance_settings.collegamento_automatico`, che la
 * policy `cgs_write` riserva all'amministratore dell'azienda (e al super admin).
 * Il valore lo applica il database a ogni collegamento: questa è solo la voce delle impostazioni.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Riga = { company_id: string; collegamento_automatico: boolean; updated_at: string };
type Db = {
  public: {
    Tables: {
      company_governance_settings: { Row: Riga; Insert: Partial<Riga> & { company_id: string }; Update: Partial<Riga>; Relationships: [] };
    };
    Views: {};
    Functions: { azienda_collegamento_automatico: { Args: { p_company: string }; Returns: boolean } };
  };
};
const db = supabase as unknown as SupabaseClient<Db>;

const chiave = (companyId: string | undefined) => ["collegamento-automatico", companyId] as const;

export function useCollegamentoAutomatico(companyId: string | undefined) {
  return useQuery({
    queryKey: chiave(companyId),
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<boolean> => {
      if (!companyId) return false;
      const { data, error } = await db.rpc("azienda_collegamento_automatico", { p_company: companyId });
      if (error) return false;
      return data === true;
    },
  });
}

export function useSalvaCollegamentoAutomatico(companyId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (acceso: boolean) => {
      if (!companyId) throw new Error("Azienda non disponibile");
      const { error } = await db
        .from("company_governance_settings")
        .upsert({ company_id: companyId, collegamento_automatico: acceso, updated_at: new Date().toISOString() }, { onConflict: "company_id" });
      if (error) throw error;
    },
    onSuccess: (_d, acceso) => {
      toast.success(acceso ? "Collegamento automatico acceso" : "Collegamento automatico spento: i collegamenti certi diventano proposte");
      void qc.invalidateQueries({ queryKey: chiave(companyId) });
    },
    onError: (e) => toast.error("Impostazione non salvata", { description: e instanceof Error ? e.message : String(e) }),
  });
}
