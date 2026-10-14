import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { checkVariationDocument, type VariationDocument, type VariationWorkspace } from "@/lib/orders/variationWorkspace";
export type WorkflowVariation = Database["public"]["Tables"]["ordini_variazione"]["Row"] & { current_document_id?: string | null; approval_channel?: "online" | "offline" | null; offline_signed_on?: string | null; approval_evidence_id?: string | null; work_phase_id?: string | null; link_expires_at?: string | null; link_revoked_at?: string | null };
export interface WorkflowEvidence { id: string; document_id: string; file_name: string; file_size: number; created_at: string }
export interface WorkflowResponse { success: true; variation: WorkflowVariation; workspace: VariationWorkspace | null; document: VariationDocument | null; evidence?: WorkflowEvidence[] | WorkflowEvidence }
export async function variationWorkflowRequest(order: string, company: string, id: string, action: string, payload: Record<string, unknown> = {}): Promise<WorkflowResponse> {
  const { data, error } = await supabase.functions.invoke("variante-commessa", { body: { ...payload, action, order_id: order, id } });
  if (error) {
    let message = "Operazione non confermata. Riapri la variante prima di riprovare.";
    try { const body = await error.context?.json(); if (typeof body?.error === "string") message = body.error; } catch { /* Keep a safe localized error. */ }
    throw new Error(message);
  }
  if (data?.success !== true || data.variation?.id !== id || data.variation?.order_id !== order || data.variation?.company_id !== company) throw new Error("Risposta della variante non verificabile.");
  if (data.workspace && (data.workspace.variation_id !== id || data.workspace.company_id !== company || data.workspace.order_id !== order || !Number.isSafeInteger(data.workspace.revision))) throw new Error("Ambito della bozza non verificabile.");
  if (data.document) checkVariationDocument(data.document, company, order, id);
  return data;
}
export async function openVariationDocument(order: string, company: string, id: string, fileId = "proposal") {
  const { data, error } = await supabase.functions.invoke("variante-commessa", { body: { action: "open", order_id: order, id, file_id: fileId } });
  if (error || data?.success !== true || !data.document || typeof data.url !== "string") throw new Error("Documento non disponibile. Riprova ad aprirlo.");
  checkVariationDocument(data.document, company, order, id);
  const expectedOrigin = new URL(import.meta.env.VITE_SUPABASE_URL).origin;
  if (new URL(data.url).origin !== expectedOrigin || !/^[a-f0-9]{64}$/.test(data.hash)) throw new Error("Indirizzo del documento non verificabile.");
  const response = await fetch(data.url, { signal: AbortSignal.timeout(25_000) });
  if (!response.ok) throw new Error("Download non riuscito o collegamento scaduto.");
  const bytes = await response.arrayBuffer();
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))).map(x => x.toString(16).padStart(2, "0")).join("");
  if (digest !== data.hash || new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") throw new Error("Il file ricevuto non corrisponde al documento conservato.");
  return { url: data.url as string, name: data.name as string, blob: new Blob([bytes], { type: "application/pdf" }), document: data.document as VariationDocument };
}
export function useVariationWorkflow(order: string, company: string) {
  const queryClient = useQueryClient();
  const refresh = async () => {
    await Promise.all([
      ["ordini-variazione", order], ["order-attachments", order], ["marginalita-cantieri"], ["marginalita-widget"], ["order-marginality", order],
    ].map(queryKey => queryClient.invalidateQueries({ queryKey })));
  };
  const request = async (id: string, action: string, payload: Record<string, unknown> = {}) => {
    try { const result = await variationWorkflowRequest(order, company, id, action, payload); if (action !== "load") await refresh(); return result; }
    catch (error) { if (action !== "load") await refresh(); throw error; }
  };
  return { request, open: (id: string, fileId?: string) => openVariationDocument(order, company, id, fileId) };
}
