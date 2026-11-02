import { supabase } from "@/integrations/supabase/client";
import { leggiLogoPerPdf } from "@/lib/computo/modelloComputo";

/**
 * Il logo dell'impresa per il contratto di subappalto (31/10/2026), quello di Impostazioni → Profilo aziendale.
 * Arriva già letto (data URL PNG): se non si scarica, il contratto esce col nome invece di fallire, perché
 * l'invio in firma non deve fermarsi per un'immagine. Il colore è un blu uguale per tutti, non quello del marchio.
 */
export async function vesteContratto(companyId: string): Promise<{ logoUrl: string | null }> {
  const { data } = await supabase.from("companies").select("logo_url").eq("id", companyId).maybeSingle();
  const logo = await leggiLogoPerPdf(data?.logo_url?.trim() || null);
  return { logoUrl: logo?.dati ?? null };
}
