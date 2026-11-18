import { supabase } from "@/integrations/supabase/client";
import { documentoFirmato } from "@/lib/preventivi/contrattoFirmato";
import { fetchQuotePdf } from "@/lib/preventivi/quotePdfDownload";
import { edgeErrorMessage } from "@/lib/edgeFunctionError";

export interface PreventivoOrigine {
  id: string;
  company_id: string;
  quote_number: string;
  pdf_storage_path: string | null;
  signed_at: string | null;
  firma_modo: string | null;
  contratto_firmato: unknown;
}

/** Legge gli originali del preventivo; nessuna copia negli allegati della commessa. */
export async function documentoPreventivoOrigine(quote: PreventivoOrigine): Promise<{ blob: Blob; nomeFile: string }> {
  const scansione = documentoFirmato(quote.contratto_firmato);
  const nome = `preventivo-${quote.quote_number.replace(/[^a-z0-9_-]/gi, "-")}.pdf`;
  if (scansione) {
    const { data, error } = await supabase.storage.from(scansione.bucket).download(scansione.path);
    if (error || !data) throw new Error("Il documento firmato non è disponibile. Riprova senza rigenerarlo.");
    return { blob: data, nomeFile: scansione.name };
  }

  if (quote.signed_at || quote.firma_modo) {
    const { data: firma, error } = await supabase.from("signature_requests").select("id")
      .eq("company_id", quote.company_id).eq("quote_id", quote.id).eq("status", "signed")
      .order("signed_at", { ascending: false }).limit(1).maybeSingle();
    if (error) throw new Error("Non è stato possibile verificare la copia firmata. Riprova.");
    if (firma) {
      const esito = await supabase.functions.invoke("fea-pdf-firmato", { body: { request_id: firma.id } });
      if (esito.error) throw new Error(await edgeErrorMessage(esito.error, "Copia firmata non disponibile."));
      if (esito.data?.error) throw new Error(esito.data.error);
      return { blob: await fetchQuotePdf(esito.data?.url), nomeFile: `firmato-${nome}` };
    }
    if (quote.firma_modo === "digitale") throw new Error("Copia firmata non disponibile. Non viene sostituita con un PDF rigenerato.");
    if (!quote.pdf_storage_path) throw new Error("Il PDF accettato non è disponibile. Non viene rigenerato perché il preventivo risulta già firmato.");
  }

  if (quote.pdf_storage_path) {
    const { data, error } = await supabase.storage.from("quote-pdfs").download(quote.pdf_storage_path);
    if (error || !data) throw new Error("Il PDF del preventivo non è disponibile. Riprova.");
    if (await data.slice(0, 5).text() !== "%PDF-") throw new Error("Il documento ricevuto non è un PDF valido.");
    return { blob: data, nomeFile: nome };
  }

  const esito = await supabase.functions.invoke("generate-quote-pdf", { body: { quote_id: quote.id } });
  if (esito.error) throw new Error(await edgeErrorMessage(esito.error, "PDF del preventivo non disponibile."));
  if (esito.data?.error) throw new Error(esito.data.error);
  return { blob: await fetchQuotePdf(esito.data?.signed_url), nomeFile: nome };
}
