import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Impostazioni → Acquisti e materiali (tabella company_acquisti_impostazioni,
 * migrazione 20281222180000). Senza riga valgono i predefiniti: validazione del
 * tecnico NON obbligatoria, 7 giorni di consegna, promemoria acceso.
 */
export interface ImpostazioniAcquisti {
  validazione_obbligatoria: boolean;
  giorni_consegna_predefiniti: number;
  promemoria_attivo: boolean;
  conferma_giorni_promemoria?: number;
  conferma_tolleranza_mm?: number;
}

export const IMPOSTAZIONI_ACQUISTI_PREDEFINITE: ImpostazioniAcquisti = {
  validazione_obbligatoria: false,
  giorni_consegna_predefiniti: 7,
  promemoria_attivo: true,
  conferma_giorni_promemoria: 3,
  conferma_tolleranza_mm: 5,
};

// La tabella è nuova e non è ancora nei tipi generati.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export const chiaveImpostazioniAcquisti = (companyId: string | undefined) => ["impostazioni-acquisti", companyId] as const;

export function useImpostazioniAcquisti() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: chiaveImpostazioniAcquisti(companyId),
    enabled: !!companyId,
    staleTime: 60_000,
    queryFn: async (): Promise<ImpostazioniAcquisti> => {
      const { data, error } = await db
        .from("company_acquisti_impostazioni")
        .select("validazione_obbligatoria, giorni_consegna_predefiniti, promemoria_attivo, conferma_giorni_promemoria, conferma_tolleranza_mm")
        .eq("company_id", companyId)
        .maybeSingle();
      if (error) throw error;
      return { ...IMPOSTAZIONI_ACQUISTI_PREDEFINITE, ...(data ?? {}) };
    },
  });

  const salva = useMutation({
    mutationFn: async (nuove: ImpostazioniAcquisti) => {
      const { error } = await db.rpc("acquisti_impostazioni_salva", {
        p_company: companyId,
        p_validazione_obbligatoria: nuove.validazione_obbligatoria,
        p_giorni_consegna: nuove.giorni_consegna_predefiniti,
        p_promemoria: nuove.promemoria_attivo,
      });
      if (error) throw error;
      return nuove;
    },
    onSuccess: (nuove) => {
      qc.setQueryData(chiaveImpostazioniAcquisti(companyId), nuove);
      toast.success("Impostazioni degli acquisti salvate");
    },
    onError: (e: unknown) => {
      toast.error("Non riesco a salvare", { description: e instanceof Error ? e.message : String(e) });
    },
  });

  const salvaConferma = useMutation({
    mutationFn: async (nuove: { giorni: number; tolleranza: number }) => {
      const { error } = await db.rpc("acquisti_conferma_impostazioni_salva", {
        p_company: companyId, p_giorni: nuove.giorni, p_tolleranza: nuove.tolleranza,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: chiaveImpostazioniAcquisti(companyId) });
      toast.success("Impostazioni degli acquisti salvate");
    },
    onError: (e: unknown) => {
      toast.error("Non riesco a salvare", { description: e instanceof Error ? e.message : String(e) });
    },
  });

  return {
    impostazioni: query.data ?? IMPOSTAZIONI_ACQUISTI_PREDEFINITE,
    isLoading: query.isLoading,
    salva,
    salvaConferma,
  };
}

/** Quanti dipendenti possono validare la distinta (l'amministratore può sempre). */
export function useQuantiValidatori() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  return useQuery({
    queryKey: ["validatori-distinta", companyId],
    enabled: !!companyId,
    staleTime: 60_000,
    queryFn: async (): Promise<number | null> => {
      const { count, error } = await db
        .from("staff_permissions")
        .select("user_id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .eq("can_validate_bom", true);
      return error ? null : (count ?? 0);
    },
  });
}
