import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { leggiDestinazioneBolla } from "./bolleInConversazione.ts";

interface Conversazione {
  company_id: string;
  wa_number_id: string | null;
  from_phone: string;
}

interface MessaggioInAttesa {
  id: string;
  message_type: string;
  content_text: string | null;
  created_at: string;
  metadata: { reply_to?: string } | null;
  ai_extracted_data: Record<string, unknown> | null;
}

export async function primoMessaggioInAttesa(db: SupabaseClient, c: Conversazione): Promise<MessaggioInAttesa | null> {
  if (!c.wa_number_id) return null;
  const { data, error } = await db.from("whatsapp_messages")
    .select("id, message_type, content_text, created_at, metadata, ai_extracted_data")
    .eq("company_id", c.company_id).eq("wa_number_id", c.wa_number_id).eq("from_phone", c.from_phone)
    .eq("direction", "inbound").eq("processing_status", "received")
    .order("created_at", { ascending: true }).order("id", { ascending: true }).limit(1).maybeSingle();
  if (error) throw new Error("coda_conversazione_non_disponibile");
  return data;
}

export async function posticipaDomandaBolla(
  db: SupabaseClient,
  foto: Conversazione & { id: string; wa_message_id: string | null; created_at: string },
  domanda: string,
): Promise<boolean> {
  const prossimo = await primoMessaggioInAttesa(db, foto);
  if (!prossimo) return false;
  const distanza = Date.parse(prossimo.created_at) - Date.parse(foto.created_at);
  const citazione = prossimo.metadata?.reply_to;
  if (!Number.isFinite(distanza) || distanza < 0 || (citazione ? citazione !== foto.wa_message_id : distanza > 90_000)) return false;
  if (prossimo.message_type !== "audio" && (prossimo.message_type !== "text" || !leggiDestinazioneBolla(prossimo.content_text ?? ""))) return false;

  const { data, error } = await db.from("whatsapp_messages")
    .update({ ai_extracted_data: {
      ...prossimo.ai_extracted_data,
      ddt_domanda_posticipata: { foto_id: foto.id, testo: domanda },
    } })
    .eq("id", prossimo.id).eq("company_id", foto.company_id).eq("wa_number_id", foto.wa_number_id!)
    .eq("from_phone", foto.from_phone).eq("direction", "inbound").eq("processing_status", "received")
    .select("id").maybeSingle();
  if (error) throw new Error("domanda_bolla_non_posticipata");
  return !!data;
}

export async function avviaProssimoMessaggio(db: SupabaseClient, c: Conversazione, invoca: (id: string) => Promise<void>): Promise<void> {
  const prossimo = await primoMessaggioInAttesa(db, c);
  if (prossimo) await invoca(prossimo.id);
}
