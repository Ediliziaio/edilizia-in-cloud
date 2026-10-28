import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/api/surveys";
import {
  planPipelineTransition,
  type PipelineDocument,
  type PipelineTransition,
} from "@/lib/orders/pipelineTransitions";

// These existing tables are not all present in the generated database types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
const tables = {
  survey: "surveys",
  rfq: "supplier_rfqs",
  ddt: "ddt_ricezione",
  oda: "purchase_orders",
} as const;

/** Re-read under the signed-in user's RLS and compare-and-set; a drop is never an unconditional write. */
export async function savePipelineTransition(
  plan: PipelineTransition,
  companyId: string,
  userId: string,
): Promise<void> {
  if (!companyId || !userId || plan.action !== "save" || !plan.status)
    throw new Error("Passaggio non valido");
  const table = tables[plan.kind];
  const { data: row, error } = await db
    .from(table)
    .select("*")
    .eq("id", plan.document.id)
    .eq("company_id", companyId)
    .single();
  if (error || !row)
    throw new Error("Documento non disponibile o permessi insufficienti");
  const currentStatus = plan.kind === "ddt" ? row.stato : row.status;
  if (currentStatus !== plan.document.status)
    throw new Error("La fase è già cambiata. Aggiorna la pagina e riprova.");
  let responses = 0;
  if (plan.kind === "rfq" && plan.target === "in_valutazione") {
    const result = await db
      .from("supplier_rfq_suppliers")
      .select("id")
      .eq("company_id", companyId)
      .eq("rfq_id", row.id)
      .eq("status", "risposta");
    if (result.error)
      throw new Error("Impossibile verificare le risposte dei fornitori");
    responses = result.data?.length ?? 0;
  }
  const fresh: PipelineDocument = {
    ...plan.document,
    status: currentStatus,
    scheduled: row.scheduled_at,
    linked: !!(
      row.estimate_id ||
      (row.order_id && plan.kind === "survey") ||
      row.client_signature_url
    ),
    responses,
    damages: row.has_damages,
    quantity: Number(row.quantita_ricevuta ?? 0),
  };
  const checked = planPipelineTransition(plan.kind, fresh, plan.target);
  if (checked?.action !== "save" || checked.status !== plan.status)
    throw new Error(
      "Il documento richiede un controllo nel dettaglio prima di cambiare fase",
    );
  const now = new Date().toISOString();
  const patch: Record<string, unknown> =
    plan.kind === "ddt" ? { stato: plan.status } : { status: plan.status };
  if (plan.kind === "survey") {
    if (row.deleted_at) throw new Error("Il sopralluogo è stato eliminato");
    if (plan.status === "in_progress" && !row.started_at)
      patch.started_at = now;
    if (plan.status === "completed" && !row.completed_at)
      patch.completed_at = now;
  }
  if (plan.kind === "oda") patch.sent_at = now;
  if (plan.kind === "ddt") {
    patch.verified_at = plan.status === "verificato" ? now : null;
    patch.verified_by = plan.status === "verificato" ? userId : null;
  }
  let query = db
    .from(table)
    .update(patch)
    .eq("id", row.id)
    .eq("company_id", companyId)
    .eq(plan.kind === "ddt" ? "stato" : "status", currentStatus);
  if (plan.kind === "survey")
    query = query
      .is("deleted_at", null)
      .is("client_signature_url", null)
      .is("estimate_id", null)
      .is("order_id", null);
  if (plan.kind === "ddt")
    query = query
      .eq("quantita_ricevuta", row.quantita_ricevuta)
      .or("has_damages.is.null,has_damages.eq.false");
  if (row.updated_at) query = query.eq("updated_at", row.updated_at);
  const result = await query.select("id").single();
  if (result.error || !result.data)
    throw new Error(
      "Spostamento non salvato: documento modificato o permessi insufficienti. Aggiorna e riprova.",
    );
  if (plan.kind === "survey")
    await logActivity(row.id, `status_change:${plan.status}`, {
      source: "pipeline",
    });
}
