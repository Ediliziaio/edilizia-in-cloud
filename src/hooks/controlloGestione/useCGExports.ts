/**
 * useCGExports — lista esportazioni storiche del modulo Controllo di Gestione.
 * Restituisce le ultime 20 righe di `cg_exports_log` per la company corrente.
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";

export interface CGExportRow {
  id: string;
  company_id: string;
  tipo: "pacchetto_banca" | "ce_only" | "sp_only" | "rating_only";
  anno: number;
  file_path: string;
  pdf_size_bytes: number | null;
  created_at: string;
}

export function useCGExports() {
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: ["cg", "exports", companyId] as const,
    enabled: !!companyId,
    queryFn: async (): Promise<CGExportRow[]> => {
      const { data, error } = await supabase
        .from("cg_exports_log")
        .select("*")
      // Solo QUESTA azienda: la sicurezza del database fa vedere al super admin
      // (e a chi ha più aziende) le righe di tutte, e il Controllo di Gestione
      // le sommava.
        .eq("company_id", companyId!)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as CGExportRow[];
    },
    staleTime: 60_000,
  });
}

/**
 * Genera un nuovo signed URL (1 ora) per un export storico.
 */
export async function getCGExportSignedUrl(filePath: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from("controllo-gestione-exports")
    .createSignedUrl(filePath, 3600);
  if (error) throw error;
  return data.signedUrl;
}
