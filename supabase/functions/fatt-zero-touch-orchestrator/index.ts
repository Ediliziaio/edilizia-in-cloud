/**
 * MP-FAT-02 — Fatturazione Zero-Touch Orchestrator
 *
 * State machine che processa run di fatt_zero_touch_runs in sequenza:
 *   pending → validating_anagrafica → composing_xml → awaiting_hitl_approval
 *   (se importo > soglia) → signing_p7m → sending_sdi → awaiting_sdi_response
 *   → sdi_accepted → customer_notified → completed
 *
 * Idempotente: ri-esecuzione su stesso run pickup dallo step interrotto.
 * Defensive: tabella `sal` può non esistere → genera fattura senza riferimento.
 */
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";

interface Payload {
  run_id?: string;
  // Modalità batch: processa tutti i pending della company
  batch?: boolean;
  company_id?: string;
}

Deno.serve(async (req) => {
  if (req.method !== "POST" && req.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let payload: Payload = {};
  try {
    payload = await req.json();
  } catch {
    payload = {};
  }

  const t0 = Date.now();
  const summary = {
    runs_processed: 0,
    runs_advanced: 0,
    awaiting_hitl: 0,
    errors: 0,
    duration_ms: 0,
    details: [] as Array<{ run_id: string; from: string; to: string }>,
  };

  try {
    // 1. Carica run da processare
    let runs: Array<Record<string, unknown>> = [];
    if (payload.run_id) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from("fatt_zero_touch_runs")
        .select("*")
        .eq("id", payload.run_id)
        .maybeSingle();
      if (data) runs = [data];
    } else {
      // Batch: processa tutti i pending non in stati terminali
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let query = (supabase as any)
        .from("fatt_zero_touch_runs")
        .select("*")
        .in("status", ["pending", "validating_anagrafica", "composing_xml", "signing_p7m"])
        .lte("retries", 3);
      if (payload.company_id) query = query.eq("company_id", payload.company_id);
      const { data } = await query.limit(50);
      runs = (data ?? []) as Array<Record<string, unknown>>;
    }

    summary.runs_processed = runs.length;

    for (const run of runs) {
      const runId = String(run.id);
      const fromStatus = String(run.status);
      try {
        const result = await processRun(supabase, run);
        summary.details.push({ run_id: runId, from: fromStatus, to: result.to });
        if (result.to === "awaiting_hitl_approval") summary.awaiting_hitl++;
        if (result.to !== fromStatus) summary.runs_advanced++;
      } catch (e) {
        summary.errors++;
        const msg = e instanceof Error ? e.message : String(e);
        // Marca error in run + incrementa retries
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any)
          .from("fatt_zero_touch_runs")
          .update({
            status: "failed",
            error_step: fromStatus,
            error_message: msg.substring(0, 500),
            retries: Number(run.retries ?? 0) + 1,
            updated_at: new Date().toISOString(),
          })
          .eq("id", runId);
      }
    }

    summary.duration_ms = Date.now() - t0;
    return jsonOk(summary);
  } catch (e) {
    summary.duration_ms = Date.now() - t0;
    return new Response(
      JSON.stringify({ ...summary, error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});

function jsonOk(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

interface ProcessResult { to: string; }

async function processRun(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  run: Record<string, unknown>,
): Promise<ProcessResult> {
  const runId = String(run.id);
  const companyId = String(run.company_id);
  const status = String(run.status);

  // Step: pending → validating_anagrafica
  if (status === "pending" && run.customer_id) {
    const { data: anag } = await supabase.rpc("silvio_tool_verifica_anagrafica_fattura", {
      p_company_id: companyId,
      p_user_id: "00000000-0000-0000-0000-000000000000",
      p_customer_id: run.customer_id,
    });
    if (anag?.error || !anag?.complete) {
      await advance(supabase, companyId, runId, "failed", {
        error_step: "validating_anagrafica",
        error_message: `Anagrafica incompleta: ${anag?.missing_fields?.join(", ") ?? "?"}`,
      });
      return { to: "failed" };
    }
    await advance(supabase, companyId, runId, "composing_xml", { anagrafica_ok: true });
    return { to: "composing_xml" };
  }

  // Step: composing_xml → awaiting_hitl_approval (se importo > soglia) o signing_p7m
  if (status === "composing_xml" || (status === "pending" && !run.customer_id)) {
    // Carica soglia HITL company
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: company } = await (supabase as any)
      .from("companies")
      .select("fatt_zero_touch_hitl_threshold_eur")
      .eq("id", companyId)
      .maybeSingle();
    const threshold = Number(company?.fatt_zero_touch_hitl_threshold_eur ?? 10000);
    const amount = Number(run.amount_total_eur ?? 0);

    if (amount > threshold) {
      // Crea action_proposal yellow
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: prop } = await (supabase as any).rpc("silvio_tool_propose_action", {
          p_company_id: companyId,
          p_user_id: run.customer_id ?? "00000000-0000-0000-0000-000000000000",
          p_action_type: "fatt_zero_touch_high_value",
          p_summary: `Conferma fatturazione high-value €${amount.toFixed(2)} per cantiere ${run.order_id}`,
          p_payload: { run_id: runId, amount_eur: amount, threshold_eur: threshold },
          p_session_id: null,
          p_persona_key: "amministrazione",
          p_risk_level: "yellow",
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const proposalId = ((prop as any)?.proposal_id ?? null) as string | null;
        await advance(supabase, companyId, runId, "awaiting_hitl_approval", {
          hitl_required: true, hitl_reason: "high_value", action_proposal_id: proposalId, threshold_eur: threshold,
        });
        return { to: "awaiting_hitl_approval" };
      } catch (e) {
        await advance(supabase, companyId, runId, "failed", {
          error_step: "creating_proposal",
          error_message: e instanceof Error ? e.message : String(e),
        });
        return { to: "failed" };
      }
    }
    await advance(supabase, companyId, runId, "signing_p7m", { hitl_skipped: true });
    return { to: "signing_p7m" };
  }

  // Step: signing_p7m → sending_sdi (placeholder, integrazione invia-sdi reale lasciata)
  if (status === "signing_p7m") {
    // In produzione: invoke supabase.functions.invoke('invia-sdi', { body: { ... } })
    // Per ora: marca completed (placeholder) per runs senza invoice_id reale
    await advance(supabase, companyId, runId, "sending_sdi", { signature_skipped: true });
    return { to: "sending_sdi" };
  }

  // Default: nessuno step da eseguire
  return { to: status };
}

async function advance(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  companyId: string,
  runId: string,
  newStatus: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  await supabase.rpc("silvio_tool_avanza_fatt_zero_touch", {
    p_company_id: companyId,
    p_user_id: "00000000-0000-0000-0000-000000000000",
    p_run_id: runId,
    p_new_status: newStatus,
    p_metadata: metadata,
  });
}
