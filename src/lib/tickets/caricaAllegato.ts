import { supabase } from "@/integrations/supabase/client";
import { oggettoGiaCaricato } from "@/lib/commesse/caricaAllegatoConProgresso";
import { TICKET_ATTACHMENTS_BUCKET } from "./allegato";

export interface AllegatoDaCaricare {
  id: string;
  path: string;
  file: File;
  caricato: boolean;
}

export function preparaAllegato(ticketId: string, file: File): AllegatoDaCaricare {
  const id = crypto.randomUUID();
  const nome = file.name.replace(/[\\/]/g, "_");
  return { id, path: `${ticketId}/${id}_${nome}`, file, caricato: false };
}

/** Identità generata prima della rete, riusata anche dopo una risposta persa. */
export async function completaAllegato(allegato: AllegatoDaCaricare, ticketId: string, userId: string) {
  if (!allegato.caricato) {
    const { error } = await supabase.storage.from(TICKET_ATTACHMENTS_BUCKET)
      .upload(allegato.path, allegato.file, { contentType: allegato.file.type });
    if (error && !oggettoGiaCaricato({ ...error, statusCode: Number(error.statusCode), message: error.message })) throw error;
    allegato.caricato = true;
  }
  const { error } = await supabase.from("ticket_messages").insert({
    id: allegato.id,
    ticket_id: ticketId,
    sender_id: userId,
    message: `📎 ${allegato.file.name}`,
    attachment_url: allegato.path,
  });
  if (!error) return;
  if (error.code !== "23505") throw error;

  const { data, error: erroreLettura } = await supabase.from("ticket_messages").select("id")
    .eq("id", allegato.id).eq("ticket_id", ticketId).eq("sender_id", userId)
    .eq("attachment_url", allegato.path).maybeSingle();
  if (erroreLettura || !data) throw erroreLettura ?? error;
}
