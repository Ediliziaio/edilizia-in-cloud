/**
 * Il documento di un ordine d'acquisto (ordine firmato, conferma del sito, scontrino):
 * dove si salva e come si registra (24/11/2026).
 *
 * Il bucket `order-attachments` accetta scritture solo sotto una commessa
 * (`orders/<commessa>/…`) e fa leggere solo i file registrati in `order_attachments`:
 * il vecchio percorso `oda/<ordine>/…` veniva rifiutato, e nessun ordine aveva mai avuto
 * un allegato. Quindi il documento sta tra quelli della commessa, riservato a chi vede i
 * costi (ha i prezzi d'acquisto), e `purchase_orders.attachment_url` punta lì.
 */
import { supabase } from "@/integrations/supabase/client";
import { percorsoDocumento } from "@/lib/commesse/documentiCommessa";
import { mimeDocumento } from "@/lib/ddt/preparaDocumento";
import { logger } from "@/utils/logger";

export const BUCKET_DOCUMENTO_ODA = "order-attachments";

/** Carica il file sotto la commessa. Lancia se il file non sale. */
export async function caricaDocumentoOda(commessaId: string, file: File): Promise<string> {
  const percorso = percorsoDocumento(commessaId, file.name, undefined, crypto.randomUUID());
  const { error } = await supabase.storage.from(BUCKET_DOCUMENTO_ODA)
    .upload(percorso, file, { contentType: mimeDocumento(file) || undefined, upsert: false });
  if (error) throw new Error(error.message);
  return percorso;
}

/** Lo registra tra i documenti della commessa: senza questa riga lo storage non lo fa rileggere. */
export async function registraDocumentoOda(x: { commessaId: string; percorso: string; file: File; userId: string }): Promise<string | null> {
  const { error } = await supabase.from("order_attachments").insert({
    order_id: x.commessaId, access_scope: "costi", file_name: x.file.name, file_url: x.percorso,
    file_type: mimeDocumento(x.file) || "application/octet-stream", file_size: x.file.size,
    uploaded_by: x.userId, visible_to_customer: false,
  } as never);
  if (error) {
    logger.error("[documentoOda] allegato non registrato", error);
    return error.message;
  }
  return null;
}

/** Toglie la riga tra i documenti della commessa e il file. Gli errori si restituiscono, non si lanciano. */
export async function eliminaDocumentoOda(percorso: string): Promise<string | null> {
  const { error: errRiga } = await supabase.from("order_attachments").delete().eq("file_url", percorso);
  const { error: errFile } = await supabase.storage.from(BUCKET_DOCUMENTO_ODA).remove([percorso]);
  const errore = errRiga?.message ?? errFile?.message ?? null;
  if (errore) logger.error("[documentoOda] rimozione incompleta", { errRiga, errFile });
  return errore;
}
