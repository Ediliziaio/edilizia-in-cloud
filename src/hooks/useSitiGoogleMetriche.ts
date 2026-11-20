import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { retryAuthorizedRead } from "@/lib/retryAuthorizedRead";

export interface SitoGoogle {
  id: string;
  nome: string;
  dominio: string;
  ga4_property_id: string | null;
  gsc_site_url: string | null;
  attivo: boolean;
  ultimo_sync: string | null;
  ultimo_errore: string | null;
  ultimo_dato: string | null;
  utenti: number;
  sessioni: number;
  visualizzazioni: number;
  durata_media_s: number | null;
  sessioni_prima: number;
  visualizzazioni_prima: number;
  impressioni: number;
  clic: number;
  posizione_media: number | null;
  clic_prima: number;
  ctr_pct: number | null;
  pagine_viste_da_google: number;
}

interface MetricheGoogle {
  giorni: number;
  siti: SitoGoogle[];
  calcolato_il: string;
  chiave_google: boolean;
  siti_collegati: number;
  ultimo_dato: string | null;
}

export const PERIODI_TRAFFICO = [7, 28, 30, 90];
export const DOMINIO_EIC = "ediliziaincloud.com";

export function periodoTraffico(valore: string | null, predefinito: number) {
  const giorni = Number(valore);
  return PERIODI_TRAFFICO.includes(giorni) ? giorni : predefinito;
}

export function dominioSito(dominio: string) {
  return dominio.trim().toLowerCase().replace(/^www\./, "");
}

export function useSitiGoogleMetriche(giorni: number) {
  return useQuery({
    queryKey: ["admin-siti-metriche", giorni],
    retry: retryAuthorizedRead,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_siti_metriche" as never, { p_giorni: giorni } as never);
      if (error) throw error;
      if (!data) throw new Error("Metriche Google non disponibili.");
      return data as unknown as MetricheGoogle;
    },
    staleTime: 60_000,
  });
}
