/** Convert the stored, original FV HTML before freezing it for signature. */
export async function fotovoltaicoPdfOriginale(html: Uint8Array, schede: string[] = []): Promise<Uint8Array> {
  const endpoint = typeof Deno !== "undefined" ? Deno.env.get("PREVENTIVI_PDF_RENDER_URL") : undefined;
  const token = typeof Deno !== "undefined" ? Deno.env.get("PREVENTIVI_PDF_TOKEN") : undefined;
  if (!endpoint || !token) throw new Error("La conversione PDF del fotovoltaico non è configurata. Nessuna richiesta di firma è stata creata.");
  const url = new URL(endpoint);
  if ((url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) || url.username || url.password) {
    throw new Error("Configurazione del servizio PDF non valida.");
  }
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(45_000),
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ html: new TextDecoder().decode(html), ...(schede.length ? { schede } : {}) }),
    });
  } catch {
    throw new Error("Il servizio PDF non è raggiungibile o impiega troppo tempo. Riprova: nessuna richiesta di firma è stata creata.");
  }
  if (!response.ok) throw new Error("Il PDF completo non è stato generato. Riprova: nessuna richiesta di firma è stata creata.");
  if (Number(response.headers.get("Content-Length")) > 25 * 1024 * 1024) throw new Error("PDF troppo grande.");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length > 25 * 1024 * 1024 || new TextDecoder().decode(bytes.subarray(0, 5)) !== "%PDF-") throw new Error("Il servizio non ha restituito un PDF valido.");
  const { PDFDocument } = await import("https://esm.sh/pdf-lib@1.17.1");
  const pdf = await PDFDocument.load(bytes);
  if (!pdf.getPageCount()) throw new Error("Il PDF non contiene pagine.");
  return bytes;
}
