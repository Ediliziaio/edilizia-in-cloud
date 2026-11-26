/**
 * Apre un documento paghe (il PDF vero del consulente) in una nuova scheda.
 * Passa da paghe_apri_documento, che controlla chi può aprirlo e, se è
 * l'intestatario, segna la prima apertura: è la prova di consegna della busta.
 */
import { supabase } from "@/integrations/supabase/client";
import { apriDocumentoDaRichiesta } from "@/lib/campo/apriDocumento";

export async function apriDocumentoPaghe(documentoId: string): Promise<void> {
  await apriDocumentoDaRichiesta(async () => {
    const { data: percorso, error } = await supabase.rpc("paghe_apri_documento" as never, { p_documento: documentoId } as never);
    if (error || !percorso) throw new Error(error?.message ?? "Documento non trovato");
    const { data, error: errUrl } = await supabase.storage.from("buste-paga").createSignedUrl(percorso as unknown as string, 120);
    if (errUrl || !data?.signedUrl) throw new Error("Non riesco ad aprire il documento. Riprova tra poco.");
    return data.signedUrl;
  }, "Busta paga.pdf");
}
