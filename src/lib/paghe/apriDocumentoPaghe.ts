/**
 * Apre un documento paghe (il PDF vero del consulente) in una nuova scheda.
 * Passa da paghe_apri_documento, che controlla chi può aprirlo e, se è
 * l'intestatario, segna la prima apertura: è la prova di consegna della busta.
 */
import { supabase } from "@/integrations/supabase/client";

export async function apriDocumentoPaghe(documentoId: string): Promise<void> {
  // La scheda si apre subito (nel clic), altrimenti il browser la blocca come popup.
  const scheda = window.open("", "_blank");
  try {
    const { data: percorso, error } = await supabase.rpc("paghe_apri_documento" as never, { p_documento: documentoId } as never);
    if (error || !percorso) throw new Error(error?.message ?? "Documento non trovato");
    const { data, error: errUrl } = await supabase.storage.from("buste-paga").createSignedUrl(percorso as unknown as string, 120);
    if (errUrl || !data?.signedUrl) throw new Error("Non riesco ad aprire il documento. Riprova tra poco.");
    if (scheda) scheda.location.href = data.signedUrl;
    else window.location.href = data.signedUrl;
  } catch (e) {
    scheda?.close();
    throw e;
  }
}
