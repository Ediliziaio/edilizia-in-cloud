// src/lib/fatturazione/generatePDF.ts
// Client-side helper to call the generate-native-pdf edge function

import { supabase } from "@/integrations/supabase/client";
import { stampaPreventivoNativo } from "@/lib/fotovoltaico/htmlToPdf";

/** L'HTML del documento, come lo compone la funzione generate-native-pdf. */
async function htmlDocumento(documentoId: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke("generate-native-pdf", {
    body: { documento_id: documentoId },
  });

  if (error) {
    // Extract detailed error from response context
    const detail = error.context ? await error.context.json?.().catch((): null => null) : null;
    throw new Error(detail?.error || error.message || "Errore nella generazione del PDF");
  }

  if (!data?.html) {
    throw new Error("Nessun contenuto PDF generato");
  }
  return data.html as string;
}

/**
 * Apre il dialogo di stampa del documento (da lì: stampante o «Salva come PDF»).
 *
 * Stampa nativa del browser su un iframe nascosto (come i preventivi): testo vero
 * e senza popup. Prima si apriva una nuova scheda: con i popup bloccati (frequente)
 * l'utente si ritrovava un file .html al posto del PDF e non capiva come vedere
 * la fattura.
 */
export async function downloadNativePDF(documentoId: string, filename?: string): Promise<void> {
  const html = await htmlDocumento(documentoId);
  await stampaPreventivoNativo(html, filename ? `Fattura ${filename}` : `Documento ${documentoId}`);
}

/**
 * «Apri PDF»: il documento in una scheda a parte, da guardare (senza stampare).
 * La scheda si apre subito, dentro il clic, e si riempie dopo: così il browser non
 * la scambia per un popup.
 */
export async function apriDocumentoInScheda(documentoId: string): Promise<void> {
  const scheda = window.open("", "_blank");
  if (!scheda) {
    throw new Error("Il browser ha bloccato la nuova scheda: consenti i popup per questo sito, oppure usa «Stampa».");
  }
  try {
    const html = await htmlDocumento(documentoId);
    scheda.document.open();
    scheda.document.write(html);
    scheda.document.close();
  } catch (e) {
    scheda.close();
    throw e;
  }
}

/**
 * Generates and uploads the PDF, returning the storage URL.
 */
export async function uploadNativePDF(documentoId: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke("generate-native-pdf", {
    body: { documento_id: documentoId, upload: true },
  });

  if (error) {
    const detail = error.context ? await error.context.json?.().catch((): null => null) : null;
    throw new Error(detail?.error || error.message || "Errore nell'upload del PDF");
  }

  return data?.pdf_url ?? "";
}
