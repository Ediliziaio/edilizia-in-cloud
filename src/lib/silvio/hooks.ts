/**
 * hooks.ts — MP-SILVIO · hook React per l'agente operativo per-azienda.
 * (Distinto dallo scaffold admin silvio_agent_*.)
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Autorizzazione } from "./permessi";

export interface SilvioAzioneCatalogo {
  chiave: string;
  descrizione: string;
  modulo: string;
  funzione_target: string;
  reversibilita: string;
  categoria_rischio: string;
  autorizzazione_default: Autorizzazione;
  autorizzazione_effettiva: Autorizzazione;
  ruoli_consentiti: string[];
  attiva: boolean;
}

/** Catalogo azioni con autorizzazione effettiva per l'azienda/utente correnti. */
export function useSilvioCatalogo() {
  return useQuery({
    queryKey: ["silvio-catalogo"],
    queryFn: async (): Promise<SilvioAzioneCatalogo[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)("silvio_catalogo");
      if (error) throw error;
      return (data as SilvioAzioneCatalogo[]) ?? [];
    },
  });
}

/** Imposta un override (solo restrittivo) o disattiva un'azione per l'azienda. */
export function useSilvioOverrideSet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { chiave: string; autorizzazione?: Autorizzazione | null; attiva?: boolean | null }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.rpc as any)("silvio_azione_override_set", {
        p_chiave: input.chiave,
        p_autorizzazione: input.autorizzazione ?? null,
        p_attiva: input.attiva ?? null,
      });
      if (error) throw error;
      return input;
    },
    onSuccess: () => {
      toast.success("Permesso aggiornato");
      void qc.invalidateQueries({ queryKey: ["silvio-catalogo"] });
    },
    onError: (e) => {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error("Operazione non riuscita", {
        description: msg.includes("override_non_puo_allargare")
          ? "Non puoi rendere un'azione più permissiva del livello di sicurezza di base."
          : msg,
      });
    },
  });
}
