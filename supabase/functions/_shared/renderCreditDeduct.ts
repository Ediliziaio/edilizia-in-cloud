// ============================================================================
// renderCreditDeduct — deduct 1 render credit con fallback graduato
// ============================================================================
// FIX P3.1: uniformare deduct v3 (audit ledger) su tutti i generate-*-render.
// L'edge function chiama `deductRenderCreditSafe` passando company_id,
// session_id, user_id e (opzionale) reason_meta. Il helper prova v3 →
// v2 → v1 nell'ordine, così i deploy incrementali (migration non ancora
// applicata su tutti gli ambienti) non rompono il flusso.
//
// v3 (preferred): deduct_render_credit_v3(_company_id, _session_id, _user_id, _reason_meta)
//   → { status: 'ok'|'insufficient', revenue_eur, purchase_id, balance_after, ledger_id }
// v2 (fallback):  deduct_render_credit_v2(_company_id)
//   → { status, revenue_eur, purchase_id }
// v1 (last resort): deduct_render_credit(_company_id)
//   → text: "ok" | "insufficient"
// ============================================================================

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export interface DeductRenderCreditResult {
  status: "ok" | "insufficient";
  /** FIFO price per credit EUR (v2/v3 only, 0 se v1). */
  revenue_eur: number;
  /** Purchase UUID da cui è stato dedotto il credito (FIFO, v2/v3 only). */
  purchase_id: string | null;
  /** Balance residuo dopo la deduzione (v3 only, null altrimenti). */
  balance_after: number | null;
  /** Ledger row id per audit (v3 only). */
  ledger_id: string | null;
  /** Versione RPC effettivamente chiamata (utile per osservabilità). */
  version: "v3" | "v2" | "v1";
}

export async function deductRenderCreditSafe(
  supabase: SupabaseClient,
  params: {
    companyId: string;
    sessionId?: string | null;
    userId?: string | null;
    reasonMeta?: Record<string, unknown> | null;
    /** Log tag per distinguere gli edge fn nei log (es: "generate-bathroom-render"). */
    logTag?: string;
  },
): Promise<DeductRenderCreditResult> {
  const tag = params.logTag ?? "render";

  // ── v3: audit ledger + session/user tracking ────────────────────────────
  const v3 = await supabase.rpc("deduct_render_credit_v3", {
    _company_id:  params.companyId,
    _session_id:  params.sessionId ?? null,
    _user_id:     params.userId ?? null,
    _reason_meta: params.reasonMeta ?? null,
  });

  if (!v3.error) {
    const payload = (v3.data ?? {}) as {
      status?: "ok" | "insufficient";
      revenue_eur?: number | string;
      purchase_id?: string | null;
      balance_after?: number;
      ledger_id?: string | null;
    };
    return {
      status:        payload.status === "insufficient" ? "insufficient" : "ok",
      revenue_eur:   Number(payload.revenue_eur ?? 0),
      purchase_id:   payload.purchase_id ?? null,
      balance_after: typeof payload.balance_after === "number" ? payload.balance_after : null,
      ledger_id:     payload.ledger_id ?? null,
      version:       "v3",
    };
  }

  console.warn(
    `[${tag}] deduct_render_credit_v3 not available, falling back to v2:`,
    v3.error.message,
  );

  // ── v2: FIFO revenue tracking (senza audit ledger) ──────────────────────
  const v2 = await supabase.rpc("deduct_render_credit_v2", {
    _company_id: params.companyId,
  });

  if (!v2.error) {
    const payload = (v2.data ?? {}) as {
      status?: "ok" | "insufficient";
      revenue_eur?: number | string;
      purchase_id?: string | null;
    };
    return {
      status:        payload.status === "insufficient" ? "insufficient" : "ok",
      revenue_eur:   Number(payload.revenue_eur ?? 0),
      purchase_id:   payload.purchase_id ?? null,
      balance_after: null,
      ledger_id:     null,
      version:       "v2",
    };
  }

  console.warn(
    `[${tag}] deduct_render_credit_v2 not available, falling back to v1:`,
    v2.error.message,
  );

  // ── v1: legacy (text return) ────────────────────────────────────────────
  const v1 = await supabase.rpc("deduct_render_credit", {
    _company_id: params.companyId,
  });

  if (v1.error) {
    throw new Error(`[${tag}] Credit deduction failed: ${v1.error.message}`);
  }

  const status = v1.data === "insufficient" ? "insufficient" : "ok";
  return {
    status,
    revenue_eur:   0,
    purchase_id:   null,
    balance_after: null,
    ledger_id:     null,
    version:       "v1",
  };
}
