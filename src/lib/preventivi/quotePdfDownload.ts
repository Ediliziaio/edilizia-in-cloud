import { salvaDocumento } from "@/lib/mobile/salvaDocumento";

/** Never turn an expired signed URL or an HTML error page into a .pdf download. */
export async function fetchQuotePdf(signedUrl: unknown): Promise<Blob> {
  if (typeof signedUrl !== "string" || !signedUrl.trim()) {
    throw new Error("PDF non disponibile. Riprova a generarlo.");
  }
  const response = await fetch(signedUrl, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error("Download PDF non riuscito. Riprova a generarlo.");
  const blob = await response.blob();
  const signature = await blob.slice(0, 5).text();
  if (signature !== "%PDF-") throw new Error("Il file ricevuto non è un PDF valido. Riprova a generarlo.");
  return new Blob([blob], { type: "application/pdf" });
}

export async function downloadQuotePdf(blob: Blob, path?: unknown): Promise<boolean> {
  const filename = typeof path === "string" ? path.split("/").pop() : undefined;
  return salvaDocumento(blob, filename?.toLowerCase().endsWith(".pdf") ? filename : "preventivo.pdf");
}
