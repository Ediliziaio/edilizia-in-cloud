/**
 * ai-auto-execute-pending — Feature #1B
 *
 * Worker che esegue automaticamente le proposte AI quando la company ha
 * configurato la policy `mode = auto_execute` per quel tipo di azione.
 *
 * Senza questo worker, la modalità "auto_execute" (settata nella UI
 * /azienda/impostazioni/ai-automazioni) non avrebbe effetto: nessuno
 * triggererebbe l'esecuzione delle proposte create da
 * ai-proactive-proposals-daily.
 *
 * Flow:
 *   1. Auth: service_role + x-cron-secret (PROACTIVE_CRON_SECRET)
 *   2. Seleziona ai_action_proposals con status='pending', auto_generated=true,
 *      created_at recente, expires_at > now()
 *   3. Per ogni proposta:
 *      a. Carica la policy via get_ai_action_permission(company, action_type)
 *      b. Se mode != 'auto_execute' → skip (resta pending per conferma utente)
 *      c. Se mode == 'auto_execute' → chiama silvio-execute-action con header
 *         x-internal-auto-execute (secret condiviso) → service-role bypass
 *      d. Logga risultato in summary
 *
 * Sicurezza:
 *   - Doppia barriera: header secret + policy DB
 *   - silvio-execute-action verifica POI di nuovo la policy in modo strict
 *   - Daily limit applicato dal DB
 *   - Nessuna escalation possibile: se la policy non è auto_execute, NIENTE viene eseguito
 *
 * Cadenza consigliata: ogni 10-15 minuti (via pg_cron, vedi schedule pg_cron
 * altrove). Non è un cron real-time perché le azioni AI auto-execute non
 * devono essere troppo aggressive lato UX.
 */

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";
import { getCorsHeaders } from "../_shared/headers.ts";

interface RunBody {
  /** Esegue su una singola company (debugging) */
  company_id?: string;
  /** Limita il batch (default 25) */
  limit?: number;
  /** Solo simula, non esegue niente */
  dry_run?: boolean;
}

interface ProposalRow {
  id: string;
  company_id: string;
  user_id: string;
  action_type: string;
  summary: string;
  risk_level: string;
  expires_at: string | null;
}

interface AutoExecutionResult {
  proposal_id: string;
  company_id: string;
  action_type: string;
  outcome: "executed" | "skipped" | "skipped_policy" | "skipped_expired" | "failed";
  reason?: string;
  http_status?: number;
}

const MAX_DEFAULT = 25;
const MAX_HARD = 200;

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  // Auth — cron secret o service-role bearer
  const cronSecret = req.headers.get("x-cron-secret");
  const expectedCronSecret = Deno.env.get("PROACTIVE_CRON_SECRET");
  const authHeader = req.headers.get("Authorization") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "_no_match_";
  const isServiceRole = authHeader === `Bearer ${serviceKey}`;
  const isAuthorizedCron = !!cronSecret && !!expectedCronSecret && cronSecret === expectedCronSecret;
  if (!isAuthorizedCron && !isServiceRole) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const internalAutoSecret = Deno.env.get("INTERNAL_AUTO_EXECUTE_SECRET");
  if (!internalAutoSecret) {
    return new Response(JSON.stringify({
      error: "INTERNAL_AUTO_EXECUTE_SECRET not configured — feature disabled",
      hint: "Set env var to enable auto-execute worker",
    }), {
      status: 503,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const t0 = Date.now();
  const body = (await req.json().catch(() => ({}))) as RunBody;
  const limit = Math.min(MAX_HARD, Math.max(1, body.limit ?? MAX_DEFAULT));
  const dryRun = body.dry_run === true;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    serviceKey,
  );

  // 1) Seleziona le proposte candidate
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = (supabase as any)
    .from("ai_action_proposals")
    .select("id, company_id, user_id, action_type, summary, risk_level, expires_at")
    .eq("status", "pending")
    .eq("auto_generated", true)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (body.company_id) q = q.eq("company_id", body.company_id);

  const { data: proposals, error: pErr } = await q;
  if (pErr) {
    return new Response(JSON.stringify({ error: "select failed", detail: pErr.message }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const summary = {
    scanned: 0,
    executed: 0,
    skipped_policy: 0,
    skipped_expired: 0,
    failed: 0,
    by_action_type: {} as Record<string, number>,
    results: [] as AutoExecutionResult[],
    dry_run: dryRun,
    duration_ms: 0,
  };

  const nowMs = Date.now();

  // 2) Per ogni proposta, controlla policy e (se auto_execute) chiama silvio-execute-action
  for (const p of ((proposals ?? []) as ProposalRow[])) {
    summary.scanned += 1;
    const res: AutoExecutionResult = {
      proposal_id: p.id,
      company_id: p.company_id,
      action_type: p.action_type,
      outcome: "skipped",
    };

    // Skip se scaduta
    if (p.expires_at && new Date(p.expires_at).getTime() < nowMs) {
      res.outcome = "skipped_expired";
      res.reason = "proposta scaduta";
      summary.skipped_expired += 1;
      summary.results.push(res);
      continue;
    }

    // Risolvi canonical action type (alias italiani → canonici)
    const canonicalActionType = aliasToCanonical(p.action_type);

    // Verifica policy via RPC
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: permData, error: permErr } = await (supabase as any).rpc(
      "get_ai_action_permission",
      { p_company_id: p.company_id, p_action_type: canonicalActionType },
    );
    if (permErr || !permData) {
      res.outcome = "skipped_policy";
      res.reason = `policy lookup failed: ${permErr?.message ?? "no data"}`;
      summary.skipped_policy += 1;
      summary.results.push(res);
      continue;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const perm = permData as any;
    if (perm.mode !== "auto_execute") {
      res.outcome = "skipped_policy";
      res.reason = `mode '${perm.mode}' richiede conferma utente`;
      summary.skipped_policy += 1;
      summary.results.push(res);
      continue;
    }
    if (perm.daily_limit_reached) {
      res.outcome = "skipped_policy";
      res.reason = `daily limit raggiunto (${perm.daily_executions}/${perm.max_daily_executions})`;
      summary.skipped_policy += 1;
      summary.results.push(res);
      continue;
    }

    if (dryRun) {
      res.outcome = "executed"; // simulato
      res.reason = "[dry_run] avrebbe eseguito";
      summary.executed += 1;
      summary.by_action_type[canonicalActionType] = (summary.by_action_type[canonicalActionType] ?? 0) + 1;
      summary.results.push(res);
      continue;
    }

    // 3) Esegui via HTTP call a silvio-execute-action con bypass auto-execute
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const r = await fetch(`${supabaseUrl}/functions/v1/silvio-execute-action`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${serviceKey}`,
          "x-internal-auto-execute": internalAutoSecret,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ proposal_id: p.id }),
      });
      res.http_status = r.status;
      if (r.ok) {
        res.outcome = "executed";
        summary.executed += 1;
        summary.by_action_type[canonicalActionType] = (summary.by_action_type[canonicalActionType] ?? 0) + 1;
      } else {
        const errText = await r.text().catch(() => "");
        res.outcome = "failed";
        res.reason = `HTTP ${r.status}: ${errText.slice(0, 200)}`;
        summary.failed += 1;
      }
    } catch (e) {
      res.outcome = "failed";
      res.reason = e instanceof Error ? e.message : String(e);
      summary.failed += 1;
    }
    summary.results.push(res);
  }

  summary.duration_ms = Date.now() - t0;
  return new Response(JSON.stringify(summary, null, 2), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
});

/**
 * Mirror dell'alias map in silvio-execute-action: gli italiani vengono
 * convertiti nei canonical type per il lookup della policy.
 * Manteniamo qui una piccola copia per evitare cross-import tra funzioni;
 * se la lista diverge non si rompe nulla — fallback restituisce l'input.
 */
function aliasToCanonical(actionType: string): string {
  const ALIASES: Record<string, string> = {
    preventivo_bozza: "create_quote_draft",
    bozza_preventivo: "create_quote_draft",
    sollecito_pagamento: "send_overdue_reminder",
    email_recupero_crediti: "send_overdue_reminder",
    follow_up_preventivo: "send_quote_followup",
    followup_preventivo: "send_quote_followup",
    riordino_materiale: "create_purchase_order",
    ordine_fornitore: "create_purchase_order",
    bozza_fattura: "create_invoice_draft",
    fattura_bozza: "create_invoice_draft",
  };
  return ALIASES[actionType] ?? actionType;
}
