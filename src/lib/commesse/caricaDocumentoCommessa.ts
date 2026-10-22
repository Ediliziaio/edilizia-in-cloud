/**
 * Carica un file tra i documenti della commessa: storage (bucket degli
 * allegati, prefisso orders/<commessa>/) e una riga in order_attachments,
 * nella cartella proposta dal nome del file. Se la riga non si scrive, il file
 * appena caricato si toglie dallo storage. Usato dalle tavole PDF e dai disegni CAD.
 */
import { supabase } from "@/integrations/supabase/client";
import { ATTACHMENTS_BUCKET } from "@/components/orders/filePreviewUtils";
import { cartellaSuggerita, percorsoDocumento, type CartellaDocumenti } from "@/lib/commesse/documentiCommessa";

/** Oltre questa dimensione si avvisa che il caricamento richiede tempo. */
export const AVVISO_MB_DOCUMENTO = 15;

export async function caricaDocumentoCommessa(p: {
  orderId: string;
  companyId: string;
  userId: string;
  file: File;
  tipo?: string;
}): Promise<{ id: string; percorso: string }> {
  const tipo = p.file.type || p.tipo || "application/octet-stream";
  // Cartella: quella proposta dal nome (un DXF va in «Progetto / Architettonico»).
  // La tabella delle cartelle non è ancora nei tipi generati (come in useCartelleDocumenti).
  const { data: cartelle } = await (supabase
    .from("order_document_folders" as never)
    .select("id, company_id, nome, posizione, visibile_cliente, obbligatoria, archiviata_at")
    .eq("company_id" as never, p.companyId as never) as unknown as PromiseLike<{ data: CartellaDocumenti[] | null }>);
  const folderId = cartellaSuggerita(p.file.name, cartelle ?? []);

  const percorso = percorsoDocumento(p.orderId, p.file.name);
  const { error: e1 } = await supabase.storage.from(ATTACHMENTS_BUCKET).upload(percorso, p.file, { contentType: tipo });
  if (e1) throw e1;
  const { data, error: e2 } = await supabase.from("order_attachments").insert({
    order_id: p.orderId, file_name: p.file.name, file_url: percorso, file_type: tipo,
    file_size: p.file.size, uploaded_by: p.userId, visible_to_customer: false, folder_id: folderId,
  } as never).select("id").single();
  if (e2 || !data) {
    await supabase.storage.from(ATTACHMENTS_BUCKET).remove([percorso]);
    throw e2 ?? new Error("Documento non registrato");
  }
  return { id: (data as { id: string }).id, percorso };
}
