// «Scarica XML» di una fattura elettronica (24/09/2026). Nell'editor la voce di
// menu non faceva niente e il pulsante «Esporta XML» scaricava il PDF.
//
// Se la fattura è partita, si scarica il file che è partito davvero (quello
// salvato da invia-sdi). Se non è ancora partita, lo si genera con lo stesso
// generatore che userà l'invio: è l'anteprima di quello che riceverà lo SDI.

import { supabase } from "@/integrations/supabase/client";
import { generateFatturaPAXML } from "@/lib/fatturazione/generateXML";
import type { AnagraficaAzienda, DocumentoFiscale } from "@/types/fatturazione";

export async function scaricaXmlFattura(
  doc: DocumentoFiscale,
  azienda: AnagraficaAzienda | null | undefined,
): Promise<void> {
  let file: Blob;
  let nome: string;
  if (doc.sdi_file_xml_url) {
    const { data, error } = await supabase.storage.from("fatture-xml").download(doc.sdi_file_xml_url);
    if (error || !data) throw error ?? new Error("File non trovato");
    file = data;
    nome = doc.sdi_file_xml_url.split("/").pop() || "fattura.xml";
  } else {
    if (!azienda) throw new Error("Dati dell'azienda non ancora caricati: riprova tra un attimo.");
    file = new Blob([generateFatturaPAXML(doc, azienda)], { type: "application/xml" });
    nome = `${(doc.numero || "fattura").replace(/[^a-zA-Z0-9-]/g, "_")}.xml`;
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.click();
  URL.revokeObjectURL(url);
}
