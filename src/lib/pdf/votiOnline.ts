/**
 * Il voto dell'azienda su Google, Trustpilot… (Profilo azienda), per i preventivi
 * che si impaginano nel browser: gli otto moduli edili e i Serramenti.
 *
 * Una lettura che non riesce non ferma il PDF: la pagina «Dicono di noi» esce con
 * le sole parole dei clienti, o non esce.
 */
import { supabase } from "@/integrations/supabase/client";

export async function votiOnlineAzienda(companyId: string | null | undefined): Promise<unknown> {
  if (!companyId) return [];
  try {
    const { data, error } = await supabase
      .from("companies")
      .select("recensioni_online")
      .eq("id", companyId)
      .maybeSingle();
    if (error) return [];
    return (data as { recensioni_online?: unknown } | null)?.recensioni_online ?? [];
  } catch {
    return [];
  }
}
