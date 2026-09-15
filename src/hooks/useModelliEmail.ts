// ============================================================================
// useModelliEmail — i modelli email dell'azienda (Email Marketing → Modelli)
// ============================================================================
// Sola lettura: serve a chi deve SCEGLIERE un modello (il nodo «Invia email»
// delle automazioni), non a gestirli. La gestione sta in EmailTemplatesTab.
// ============================================================================

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface ModelloEmail {
  id: string;
  name: string;
  subject: string;
  html_content: string;
  folder: string;
}

/**
 * Modelli dell'azienda attiva, ordinati per cartella e nome.
 * `companyId` esplicito per i contesti che non passano da `effectiveCompany`
 * (il builder admin lavora sull'azienda del flusso, non sulla propria).
 */
export function useModelliEmail(companyId?: string) {
  const { effectiveCompany } = useAuth();
  const idAzienda = companyId ?? effectiveCompany?.id;

  return useQuery({
    queryKey: ["modelli-email", idAzienda],
    enabled: !!idAzienda,
    staleTime: 60_000,
    queryFn: async (): Promise<ModelloEmail[]> => {
      const { data, error } = await supabase
        .from("email_templates")
        .select("id, name, subject, html_content, folder")
        .eq("company_id", idAzienda!)
        .order("folder", { ascending: true })
        .order("name", { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as ModelloEmail[];
    },
  });
}
