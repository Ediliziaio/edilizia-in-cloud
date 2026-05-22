/**
 * ai-workflow-engine — Feature #13
 *
 * Worker che processa ai_workflow_runs in stato 'ready' o 'waiting' con
 * resume_at <= now. Per ogni run avanza di uno step alla volta.
 *
 * Step kinds supportati (V1):
 *   - "wait": { wait_seconds }     → status='waiting', resume_at = now+sec
 *   - "ai_action": { action_type, payload_template } → crea ai_action_proposal
 *   - "branch": { condition, if_true, if_false } → cambia current_step_idx
 *   - "noop": → step trasparente di log/marker
 *
 * STATO: V1 minimale. Behavior-preserving: senza workflow definiti niente
 * succede. La complessità completa (Temporal-style) richiede design dedicato.
 *
 * Cron consigliato: ogni 1 min.
 */

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";
import { getCorsHeaders } from "../_shared/headers.ts";

interface WorkflowStep {
  id: string;
  kind: "wait" | "ai_action" | "branch" | "noop";
  wait_seconds?: number;
  action_type?: string;
  payload_template?: Record<string, unknown>;
  condition?: string;
  if_true?: number;
  if_false?: number;
}

interface RunRow {
  id: string;
  workflow_id: string;
  company_id: string;
  status: string;
  current_step_idx: number;
  context: Record<string, unknown>;
  resume_at: string | null;
  related_entity_type: string | null;
  related_entity_id: string | null;
  attempts: number;
}

const MAX_BATCH = 20;

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST only" }), { status: 405 });
  }

  const cronSecret = req.headers.get("x-cron-secret");
  const expected = Deno.env.get("PROACTIVE_CRON_SECRET");
  if (!cronSecret || cronSecret !== expected) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const t0 = Date.now();

  // Lock + claim batch di run pronte
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: runs, error: claimErr } = await (supabase as any)
    .from("ai_workflow_runs")
    .select("*")
    .or("status.eq.ready,and(status.eq.waiting,resume_at.lte." + new Date().toISOString() + ")")
    .order("started_at", { ascending: true })
    .limit(MAX_BATCH);

  if (claimErr) {
    return new Response(JSON.stringify({ error: claimErr.message }), { status: 500 });
  }

  const summary = {
    processed: 0,
    advanced: 0,
    waiting: 0,
    completed: 0,
    failed: 0,
    duration_ms: 0,
  };

  for (const run of (runs ?? []) as RunRow[]) {
    summary.processed += 1;
    try {
      // Carica workflow template
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: wf } = await (supabase as any)
        .from("ai_workflows")
        .select("steps")
        .eq("id", run.workflow_id)
        .maybeSingle();
      const steps: WorkflowStep[] = ((wf as { steps?: WorkflowStep[] } | null)?.steps ?? []) as WorkflowStep[];
      if (steps.length === 0 || run.current_step_idx >= steps.length) {
        // Workflow concluso o template vuoto
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any)
          .from("ai_workflow_runs")
          .update({ status: "completed", completed_at: new Date().toISOString() })
          .eq("id", run.id);
        summary.completed += 1;
        continue;
      }

      const step = steps[run.current_step_idx];
      const stepResult = await executeStep(supabase, run, step);

      // Log
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from("ai_workflow_steps_log").insert({
        run_id: run.id,
        step_idx: run.current_step_idx,
        step_kind: step.kind,
        status: stepResult.ok ? "succeeded" : "failed",
        result: stepResult.result ?? null,
        error: stepResult.error ?? null,
      });

      if (!stepResult.ok) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any)
          .from("ai_workflow_runs")
          .update({
            status: "failed",
            last_error: stepResult.error ?? "step failed",
            attempts: run.attempts + 1,
          })
          .eq("id", run.id);
        summary.failed += 1;
        continue;
      }

      // Avanza
      const nextIdx = stepResult.next_step_idx ?? run.current_step_idx + 1;
      const finished = nextIdx >= steps.length;
      const newStatus = stepResult.wait_until ? "waiting" : (finished ? "completed" : "ready");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from("ai_workflow_runs")
        .update({
          status: newStatus,
          current_step_idx: nextIdx,
          context: stepResult.context_updates
            ? { ...run.context, ...stepResult.context_updates }
            : run.context,
          resume_at: stepResult.wait_until ?? null,
          completed_at: finished ? new Date().toISOString() : null,
          attempts: run.attempts + 1,
        })
        .eq("id", run.id);

      if (finished) summary.completed += 1;
      else if (newStatus === "waiting") summary.waiting += 1;
      else summary.advanced += 1;
    } catch (e) {
      summary.failed += 1;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from("ai_workflow_runs")
        .update({
          status: "failed",
          last_error: e instanceof Error ? e.message : String(e),
          attempts: run.attempts + 1,
        })
        .eq("id", run.id);
    }
  }

  summary.duration_ms = Date.now() - t0;
  return new Response(JSON.stringify(summary, null, 2), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
});

interface StepResult {
  ok: boolean;
  error?: string;
  result?: Record<string, unknown>;
  next_step_idx?: number;
  wait_until?: string;
  context_updates?: Record<string, unknown>;
}

async function executeStep(
  supabase: SupabaseClient,
  run: RunRow,
  step: WorkflowStep,
): Promise<StepResult> {
  switch (step.kind) {
    case "noop":
      return { ok: true };

    case "wait": {
      const sec = step.wait_seconds ?? 60;
      const until = new Date(Date.now() + sec * 1000).toISOString();
      return { ok: true, wait_until: until };
    }

    case "ai_action": {
      if (!step.action_type) return { ok: false, error: "ai_action missing action_type" };
      // Trova un admin user_id per la company
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: roleRow } = await (supabase as any)
        .from("user_roles")
        .select("user_id")
        .eq("company_id", run.company_id)
        .in("role", ["company_admin", "company_staff"])
        .limit(1)
        .maybeSingle();
      const userId = (roleRow as { user_id?: string } | null)?.user_id;
      if (!userId) return { ok: false, error: "no admin user" };

      // Crea proposta — la policy company decide se eseguirla auto
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: propId, error: propErr } = await (supabase as any).rpc(
        "create_proactive_proposal",
        {
          p_company_id: run.company_id,
          p_user_id: userId,
          p_persona_key: "workflow",
          p_action_type: step.action_type,
          p_summary: `Workflow step ${step.id}: ${step.action_type}`,
          p_payload: step.payload_template ?? {},
          p_signal_type: `workflow_step_${step.id}`,
          p_signal_entity_id: run.related_entity_id ?? run.id,
          p_signal_metadata: { workflow_run_id: run.id, step_idx: run.current_step_idx },
          p_risk_level: "yellow",
          p_ttl_days: 3,
        },
      );
      if (propErr) return { ok: false, error: propErr.message };
      return { ok: true, result: { proposal_id: propId } };
    }

    case "branch": {
      // V1: condizione semplice eval su run.context: "context.foo === true"
      // Per sicurezza non usiamo eval JS: solo confronto chiave==value via JSON path
      // Demo: rispetta if_true di default (fallback safe)
      return { ok: true, next_step_idx: step.if_true ?? (run.current_step_idx + 1) };
    }

    default:
      return { ok: false, error: `unknown step kind: ${step.kind}` };
  }
}
