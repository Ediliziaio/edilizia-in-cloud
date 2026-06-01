/**
 * #54-58 — Cataloghi "tipi" del listino di manutenzione, esposti al flusso
 * OPERATIVO come semplici picker (id + nome). Sorgenti: `tipi_impianto` e
 * `tipi_intervento`, configurati in Impostazioni → "Tariffe & Manutenzione".
 *
 * Servono per popolare `tickets.tipo_impianto_id` / `tickets.tipo_intervento_id`
 * (finora mai valorizzati operativamente) così che la RPC `get_prezzo_intervento`
 * possa risolvere il prezzo a listino. Filtra solo i tipi `attivo = true`
 * (default DB) ordinati per `ordine` poi `nome`.
 */
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

export interface TipoManutenzioneOption {
  id: string;
  nome: string;
}

const STALE = 5 * 60_000;

export function useTipiImpianto(companyId?: string | null, enabled = true) {
  return useQuery<TipoManutenzioneOption[]>({
    queryKey: ["tipi-impianto-catalogo", companyId],
    enabled: enabled && !!companyId,
    staleTime: STALE,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tipi_impianto")
        .select("id, nome")
        .eq("company_id", companyId as string)
        .eq("attivo", true)
        .order("ordine", { ascending: true })
        .order("nome", { ascending: true });
      if (error) throw error;
      return (data ?? []) as TipoManutenzioneOption[];
    },
  });
}

export function useTipiIntervento(companyId?: string | null, enabled = true) {
  return useQuery<TipoManutenzioneOption[]>({
    queryKey: ["tipi-intervento-catalogo", companyId],
    enabled: enabled && !!companyId,
    staleTime: STALE,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tipi_intervento")
        .select("id, nome")
        .eq("company_id", companyId as string)
        .eq("attivo", true)
        .order("ordine", { ascending: true })
        .order("nome", { ascending: true });
      if (error) throw error;
      return (data ?? []) as TipoManutenzioneOption[];
    },
  });
}
