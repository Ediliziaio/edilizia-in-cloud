/**
 * Dati della Dashboard Call Center. Le regole su chi vede cosa stanno nelle funzioni SQL
 * (`callcenter_operatori_ammessi`): operatore vuoto = se stesso, o tutto il team per l'amministratore.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";

export type CategoriaCoda = "richiamo" | "nuovo" | "ritentare" | "arretrato";

export interface RigaCoda {
  contact_id: string;
  nome: string | null;
  azienda: string | null;
  telefono: string;
  fonte: string | null;
  fase: string | null;
  arrivato_il: string;
  operatore_id: string;
  categoria: CategoriaCoda;
  tentativi: number;
  ultima_chiamata_at: string | null;
  ultimo_esito: string | null;
  richiamo_il: string | null;
  opportunita_id: string | null;
}

export interface CodaCallCenter {
  conteggi: Partial<Record<CategoriaCoda, number>>;
  righe: RigaCoda[];
}

export interface NumeriCallCenter {
  chiamate: number;
  contatti_chiamati: number;
  contatti_raggiunti: number;
  giorni_attivi: number;
  appuntamenti_fissati: number;
  appuntamenti_annullati: number;
  svolti_totale: number;
  svolti_presentati: number;
  svolti_assenti: number;
  lead_assegnati: number;
  lead_chiamati: number;
  lead_con_appuntamento: number;
  mediana_minuti: number | null;
  entro_5_min: number;
}

export interface AppuntamentoCallCenter {
  id: string;
  titolo: string | null;
  data: string;
  ora: string | null;
  stato: string | null;
  contact_id: string | null;
  contatto: string | null;
  assegnato_a: string | null;
}

/** I nomi delle funzioni nuove non sono ancora nei tipi generati. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rpc = (nome: string, args: Record<string, unknown>) => (supabase as any).rpc(nome, args);

export function useOperatoriCallCenter() {
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: ["callcenter-operatori", companyId],
    enabled: !!companyId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await rpc("get_callcenter_operatori", { p_company_id: companyId });
      if (error) throw error;
      return (data ?? []) as { operatore_id: string; nome: string }[];
    },
  });
}

export function useCodaCallCenter(operatoreId: string | null) {
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: ["callcenter-coda", companyId, operatoreId],
    enabled: !!companyId,
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await rpc("get_callcenter_coda", {
        p_company_id: companyId,
        p_operatore_id: operatoreId,
        p_limite: 50,
      });
      if (error) throw error;
      return data as CodaCallCenter;
    },
  });
}

export function useNumeriCallCenter(operatoreId: string | null, da: string, a: string) {
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: ["callcenter-numeri", companyId, operatoreId, da, a],
    enabled: !!companyId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await rpc("get_callcenter_numeri", {
        p_company_id: companyId,
        p_operatore_id: operatoreId,
        p_da: da,
        p_a: a,
      });
      if (error) throw error;
      return data as NumeriCallCenter;
    },
  });
}

export function useAppuntamentiCallCenter(operatoreId: string | null) {
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: ["callcenter-appuntamenti", companyId, operatoreId],
    enabled: !!companyId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await rpc("get_callcenter_appuntamenti", {
        p_company_id: companyId,
        p_operatore_id: operatoreId,
        p_limite: 20,
      });
      if (error) throw error;
      return (data ?? []) as AppuntamentoCallCenter[];
    },
  });
}
