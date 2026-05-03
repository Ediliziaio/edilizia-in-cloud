/**
 * useCGExports — lista esportazioni storiche del modulo Controllo di Gestione.
 * Restituisce le ultime 20 righe di `cg_exports_log` per la company corrente.
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

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
  return useQuery({
    queryKey: ["cg", "exports"] as const,
    queryFn: async (): Promise<CGExportRow[]> => {
      const { data, error } = await supabase
        .from("cg_exports_log")
        .select("*")
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
