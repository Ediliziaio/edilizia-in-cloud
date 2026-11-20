// «Scarica XML» di una fattura elettronica (24/09/2026). Nell'editor la voce di
// menu non faceva niente e il pulsante «Esporta XML» scaricava il PDF.
//
// Se la fattura è partita, si scarica il file che è partito davvero (quello
// salvato da invia-sdi). Se non è ancora partita, lo si genera con lo stesso
// generatore che userà l'invio: è l'anteprima di quello che riceverà lo SDI.

import { supabase } from "@/integrations/supabase/client";
import { generateFatturaPAXML } from "@/lib/fatturazione/generateXML";
import type { AnagraficaAzienda, DocumentoFiscale } from "@/types/fatturazione";
import { toast } from "sonner";

const TIPI_INVERSIONE = ["reverse_charge_interno", "integrazione_servizi_estero", "integrazione_beni_ue", "integrazione_beni_extra_ue"];

/**
 * Cosa non va nell'XML di una fattura PA che si sta per scaricare. Senza Codice
 * Univoco Ufficio il generatore scrive «000000» e la PEC: «Scarica XML» lo
 * produceva in silenzio, e solo l'invio lo bloccava (15/11/2026).
 */
export function avvisiXmlPa(doc: Pick<DocumentoFiscale, "tipo" | "cliente_snapshot">): string[] {
  const snap = doc.cliente_snapshot;
  if (!snap || snap.tipo_cliente !== "PA" || TIPI_INVERSIONE.includes(doc.tipo)) return [];
  const codice = String(snap.codice_sdi ?? "").trim().toUpperCase();
  if (/^[A-Z0-9]{6}$/.test(codice) && codice !== "000000") return [];
  return [
    codice.length === 7
      ? `Il codice destinatario «${codice}» ha 7 caratteri, quelli di un'azienda: a una PA serve il Codice Univoco Ufficio di 6 caratteri.`
      : "Manca il Codice Univoco Ufficio dell'ente (6 caratteri): l'XML esce con «000000» e lo SDI non saprebbe a quale ufficio consegnarla.",
  ];
}

/** Come fa l'invio: nota di credito e integrazione dichiarano la fattura che rettificano. */
async function conFatturaCollegata(doc: DocumentoFiscale): Promise<DocumentoFiscale> {
  const legge = async (tabella: string, id: string, numero: string, data: string) => {
    const { data: r } = await supabase.from(tabella as never).select(`${numero}, ${data}` as never).eq("id", id).maybeSingle();
    const riga = r as Record<string, string> | null;
    return riga?.[numero] ? { ...doc, fattura_collegata: { numero: riga[numero], data: riga[data] } } as DocumentoFiscale : doc;
  };
  if (doc.fattura_ricevuta_id) return legge("fatture_ricevute", doc.fattura_ricevuta_id, "numero_fattura", "data_fattura");
  if (["nota_credito", "nota_debito"].includes(doc.tipo) && doc.documento_correlato_id) {
    return legge("documenti_fiscali", doc.documento_correlato_id, "numero", "data_emissione");
  }
  return doc;
}

/** Un documento già trasmesso si rappresenta solo dall'originale archiviato. */
export function esigiOriginaleSeTrasmesso(doc: DocumentoFiscale): void {
  const trasmesso = !!doc.sdi_id_trasmissione || ['inviata_sdi','consegnata','accettata'].includes(doc.stato);
  if (trasmesso && String(doc.sdi_stato ?? '').toUpperCase() !== 'NS' && !doc.sdi_file_xml_url) throw new Error("L'XML originale trasmesso non è disponibile. Non è possibile ricrearlo dai dati attuali: recupera l'originale dal cassetto SDI.");
}

export async function scaricaXmlFattura(
  doc: DocumentoFiscale,
  azienda: AnagraficaAzienda | null | undefined,
): Promise<void> {
  esigiOriginaleSeTrasmesso(doc);
  let file: Blob;
  let nome: string;
  if (doc.sdi_file_xml_url) {
    const { data, error } = await supabase.storage.from("fatture-xml").download(doc.sdi_file_xml_url);
    if (error || !data) throw error ?? new Error("File non trovato");
    file = data;
    nome = doc.sdi_file_xml_url.split("/").pop() || "fattura.xml";
  } else {
    if (!azienda) throw new Error("Dati dell'azienda non ancora caricati: riprova tra un attimo.");
    const avvisi = avvisiXmlPa(doc);
    if (avvisi.length > 0) {
      toast.warning("XML scaricato, ma non è pronto per l'invio", {
        description: `${avvisi.join(" ")} Inseriscilo nella sezione Fatturazione elettronica della fattura (o nell'anagrafica del cliente).`,
        duration: 12000,
      });
    }
    file = new Blob([generateFatturaPAXML(await conFatturaCollegata(doc), azienda)], { type: "application/xml" });
    nome = `${(doc.numero || "fattura").replace(/[^a-zA-Z0-9-]/g, "_")}.xml`;
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * L'XML della fattura come testo: quello partito davvero se c'è, altrimenti
 * quello che partirebbe adesso (stesso generatore dell'invio).
 */
export async function leggiXmlFattura(
  doc: DocumentoFiscale,
  azienda: AnagraficaAzienda | null | undefined,
): Promise<{ xml: string; partito: boolean }> {
  esigiOriginaleSeTrasmesso(doc);
  if (doc.sdi_file_xml_url) {
    const { data, error } = await supabase.storage.from("fatture-xml").download(doc.sdi_file_xml_url);
    if (error || !data) throw error ?? new Error("File non trovato");
    return { xml: await data.text(), partito: true };
  }
  if (!azienda) throw new Error("Dati dell'azienda non ancora caricati: riprova tra un attimo.");
  return { xml: generateFatturaPAXML(await conFatturaCollegata(doc), azienda), partito: false };
}
