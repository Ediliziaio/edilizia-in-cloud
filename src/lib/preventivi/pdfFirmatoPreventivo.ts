import { supabase } from "@/integrations/supabase/client";
import { edgeErrorMessage } from "@/lib/edgeFunctionError";

interface Preventivo { companyId: string; progettoId: string; tipo: "fv" | "sr" }
interface FirmaConservata { id: string; signed_pdf_path: string | null; signed_pdf_hash: string | null; codice_verifica: string | null }

async function scaricaFirmato(urlString: string, hash?: string): Promise<Blob> {
  const url = new URL(urlString);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) throw new Error("Link al PDF firmato non valido.");
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error("Download della copia firmata non riuscito. Riprova.");
  const blob = await response.blob();
  const bytes = await blob.arrayBuffer();
  if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") throw new Error("Il file della copia firmata non è un PDF valido.");
  if (hash) {
    const impronta = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))).map(n => n.toString(16).padStart(2, "0")).join("");
    if (impronta !== hash.toLowerCase()) throw new Error("L'impronta della copia firmata non corrisponde al documento conservato.");
  }
  return blob;
}

/** Read the conserved signed copy; never regenerate it from the current template. */
export async function pdfFirmatoPreventivo(input: Preventivo): Promise<{ blob: Blob; nomeFile: string } | null> {
  if (!input.companyId || !input.progettoId) throw new Error("Azienda o preventivo non disponibile.");
  let quoteId: string | null = null;
  if (input.tipo === "sr") {
    const { data, error } = await supabase.from("quotes").select("id")
      .eq("company_id", input.companyId).eq("source", `modulo:sr:${input.progettoId}`).maybeSingle();
    if (error) throw error;
    if (!data) return null;
    quoteId = data.id;
  }
  // The generated database types predate the conserved-signature columns.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: firmaRiga, error } = await (supabase as any).from("signature_requests").select(input.tipo === "sr" ? "id, signed_pdf_path, signed_pdf_hash, codice_verifica" : "id")
    .eq("company_id", input.companyId).eq(input.tipo === "fv" ? "fv_progetto_id" : "quote_id", quoteId ?? input.progettoId)
    .eq("status", "signed").order("signed_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  const firma = firmaRiga as FirmaConservata | null;
  if (!firma) return null;
  // An already conserved SR file needs no regeneration endpoint. Storage still
  // enforces the user's RLS; the digest verifies the exact signed bytes.
  if (input.tipo === "sr" && firma.signed_pdf_path?.startsWith(`${input.companyId}/firmati/`)
      && !firma.signed_pdf_path.split("/").includes("..") && /^[a-f0-9]{64}$/i.test(firma.signed_pdf_hash ?? "")) {
    const saved = await supabase.storage.from("quote-pdfs").createSignedUrl(firma.signed_pdf_path, 3600);
    if (!saved.error && saved.data?.signedUrl) {
      const blob = await scaricaFirmato(saved.data.signedUrl, firma.signed_pdf_hash);
      return { blob, nomeFile: `preventivo-firmato-${String(firma.codice_verifica || firma.id).replace(/[^a-z0-9-]/gi, "")}.pdf` };
    }
  }
  const result = await supabase.functions.invoke("fea-pdf-firmato", { body: { request_id: firma.id } });
  if (result.error) throw new Error(await edgeErrorMessage(result.error, "Copia firmata non disponibile. Riprova."));
  if (result.data?.error || !result.data?.url) throw new Error(result.data?.error || "Link al PDF firmato non disponibile.");
  const blob = await scaricaFirmato(result.data.url);
  return { blob, nomeFile: result.data.nome_file || "preventivo-firmato.pdf" };
}

export function scaricaCopiaPdf(file: { blob: Blob; nomeFile: string }): void {
  const url = URL.createObjectURL(file.blob);
  const a = document.createElement("a");
  a.href = url; a.download = file.nomeFile;
  document.body.appendChild(a); a.click(); a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
