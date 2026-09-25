import { supabase } from "@/integrations/supabase/client";
import { linkFileRiservato } from "@/lib/storage/fileRiservati";
import { toast } from "sonner";
import type { QueryClient } from "@tanstack/react-query";

type PdfResult = { pdf_url: string; warnings: string[] };
const pending = new Map<string, Promise<PdfResult>>();

/** A fulfilled invoke() can still contain an error. Never silently ignore it. */
export function requestRapportinoPdf(id: string): Promise<PdfResult> {
  const existing = pending.get(id);
  if (existing) return existing;
  const request = (async () => {
    const { data, error } = await supabase.functions.invoke("genera-pdf-rapportino", { body: { rapportino_id: id } });
    if (error) {
      let message = "PDF non generato. Il rapportino è salvato: puoi riprovare senza inviarlo di nuovo.";
      // FunctionsHttpError carries the response, including optimistic concurrency errors.
      try {
        const body = await error.context?.clone().json();
        if (typeof body?.error === "string") message = body.error;
      } catch { /* Keep the actionable fallback for network errors. */ }
      throw new Error(message);
    }
    if (typeof data?.pdf_url !== "string" || !data.pdf_url) throw new Error("PDF non disponibile. Il rapportino è salvato: riprova la generazione.");
    return { pdf_url: data.pdf_url, warnings: Array.isArray(data.warnings) ? data.warnings.filter((w: unknown): w is string => typeof w === "string") : [] };
  })().finally(() => { pending.delete(id); });
  pending.set(id, request);
  return request;
}

export async function refreshRapportinoPdfQueries(qc: QueryClient, orderId: string) {
  await Promise.all([
    qc.invalidateQueries({ queryKey: ["campo-rapportini-ordine", orderId] }),
    qc.invalidateQueries({ queryKey: ["order-campo-rapportini", orderId] }),
  ]);
}

/** Feedback survives route changes; failures concern the PDF, not the saved report. */
export async function notifyRapportinoPdf(id: string, orderId: string, qc: QueryClient) {
  const toastId = `rapportino-pdf-${id}`;
  toast.loading("Rapportino salvato. Preparazione PDF…", { id: toastId });
  try {
    const result = await requestRapportinoPdf(id);
    await refreshRapportinoPdfQueries(qc, orderId);
    if (result.warnings.length) toast.warning("PDF pronto con avvertenze", { id: toastId, description: result.warnings.join(" "), duration: 10000 });
    else toast.success("PDF del rapportino pronto", { id: toastId });
    return result;
  } catch (error) {
    toast.error("Rapportino salvato, PDF da generare", {
      id: toastId,
      description: error instanceof Error ? error.message : "Riprova dalla scheda del rapportino.",
      duration: 12000,
      action: { label: "Riprova PDF", onClick: () => { void notifyRapportinoPdf(id, orderId, qc); } },
    });
    return null;
  }
}

/** Reserve the tab while still inside the user's tap, before the async generation. */
export async function openRapportinoPdf(report: { id: string; pdf_url?: string | null }, orderId: string, qc: QueryClient) {
  const tab = window.open("", "_blank");
  if (tab) {
    tab.opener = null;
    tab.document.title = "Preparazione rapportino";
    tab.document.body.textContent = "Preparazione del PDF in corso…";
  }
  try {
    // One-time upgrade for existing exports, leaving the old object intact.
    const result = report.pdf_url?.includes("/rapportino-v2-")
      ? { pdf_url: report.pdf_url, warnings: [] }
      : await requestRapportinoPdf(report.id);
    const signedUrl = await linkFileRiservato(result.pdf_url);
    if (!signedUrl || !/^https?:\/\//i.test(signedUrl) || signedUrl.includes("/object/public/campo-rapportini/")) throw new Error("Impossibile aprire il file riservato. Verifica la connessione e riprova.");
    if (tab && !tab.closed) tab.location.replace(signedUrl);
    else window.location.assign(signedUrl);
    if (result.warnings.length) toast.warning("PDF con avvertenze", { description: result.warnings.join(" ") });
    await refreshRapportinoPdfQueries(qc, orderId);
  } catch (error) {
    tab?.close();
    throw error;
  }
}
