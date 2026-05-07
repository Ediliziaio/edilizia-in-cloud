/**
 * Edge Function: ai-prompt-promotion-check (MP-05)
 *
 * Sessione 4 / MP-05 — Promotion / rollback check su A/B test attivi.
 *
 * Pipeline (chiamabile via cron giornaliero):
 *   1. Trova proposal in status 'in_test' con test attivo (ai_persona_prompt_ab_test).
 *   2. Per ogni test con almeno N esposizioni per ramo (default 200):
 *      - Calcola rejection_rate e csat_avg per control vs variant
 *      - Decisione:
 *        * variant migliora rejection_rate di almeno -3pp E csat >= -0.1
 *          → PROMOTE: aggiorna ai_personas.system_prompt + status='promoted'
 *        * variant peggiora rejection_rate di +5pp O csat di -0.5
 *          → ROLLBACK: status='rejected', test_ended_at=now()
 *        * altrimenti: WAIT (test continua finché ends_at)
 *   3. Test scaduti (ends_at < now()) senza decisione netta:
 *      → status='expired' (rimane in DB per audit)
 *
 * Auth: super_admin only.
 *
 * Output: { promoted: N, rolled_back: N, expired: N, waiting: N, details: [] }
 */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { requireAuth } from "../_shared/auth.ts";

interface AbTestRow {
  id: string;
  persona_key: string;
  company_id: string | null;
  control_prompt: string;
  variant_prompt: string;
  variant_proposal_id: string | null;
  starts_at: string;
  ends_at: string;
  active: boolean;
  control_count: number;
  variant_count: number;
  control_rejections: number;
  variant_rejections: number;
  control_csat_sum: number;
  variant_csat_sum: number;
  control_csat_n: number;
  variant_csat_n: number;
}

const MIN_EXPOSURES_PER_ARM = 200;
const PROMOTE_REJECTION_DELTA_PP = 3.0; // variant_rate <= control_rate - 3pp
const PROMOTE_CSAT_FLOOR = -0.1;        // variant_csat >= control_csat - 0.1
const ROLLBACK_REJECTION_DELTA_PP = 5.0; // variant_rate >= control_rate + 5pp
const ROLLBACK_CSAT_DELTA = -0.5;        // variant_csat <= control_csat - 0.5

function rate(rej: number, n: number): number {
  return n > 0 ? rej / n : 0;
}
function csatAvg(sum: number, n: number): number | null {
  return n > 0 ? sum / n : null;
}

serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return errorResponse("POST only", 405, cors);

  try {
    const { userId, supabaseAdmin } = await requireAuth(req, cors);

    const { data: rolesRaw } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const isSuper = (rolesRaw ?? []).some((r: { role?: string }) => r.role === "super_admin");
    if (!isSuper) return errorResponse("super_admin required", 403, cors);

    const { data: testsRaw, error: tErr } = await supabaseAdmin
      .from("ai_persona_prompt_ab_test")
      .select("*")
      .eq("active", true);
    if (tErr) return errorResponse(`ab_test load: ${tErr.message}`, 500, cors);

    const tests = (testsRaw ?? []) as AbTestRow[];
    let promoted = 0, rolled_back = 0, expired = 0, waiting = 0;
    const details: Array<{ test_id: string; persona: string; decision: string; metrics?: unknown; reason?: string }> = [];

    const nowIso = new Date().toISOString();

    for (const t of tests) {
      const ctrlRate = rate(t.control_rejections, t.control_count) * 100; // pp
      const varRate = rate(t.variant_rejections, t.variant_count) * 100;
      const ctrlCsat = csatAvg(t.control_csat_sum, t.control_csat_n);
      const varCsat = csatAvg(t.variant_csat_sum, t.variant_csat_n);
      const ctrlCsatVal = ctrlCsat ?? 3.5; // assume neutral if no data
      const varCsatVal = varCsat ?? ctrlCsatVal;

      const exposed = Math.min(t.control_count, t.variant_count);
      const isExpired = new Date(t.ends_at).getTime() <= Date.now();

      const metrics = {
        control: { count: t.control_count, rejections: t.control_rejections, rate_pct: ctrlRate.toFixed(2), csat_avg: ctrlCsat },
        variant: { count: t.variant_count, rejections: t.variant_rejections, rate_pct: varRate.toFixed(2), csat_avg: varCsat },
        delta_rejection_pp: (varRate - ctrlRate).toFixed(2),
        delta_csat: ctrlCsat !== null && varCsat !== null ? (varCsat - ctrlCsat).toFixed(2) : null,
      };

      // Decisione
      let decision: "promote" | "rollback" | "expired_no_winner" | "waiting" = "waiting";
      let reason = "";

      if (exposed < MIN_EXPOSURES_PER_ARM) {
        if (isExpired) { decision = "expired_no_winner"; reason = `solo ${exposed} esposizioni/ramo, soglia ${MIN_EXPOSURES_PER_ARM}`; }
        else { decision = "waiting"; reason = `attendendo ${MIN_EXPOSURES_PER_ARM - exposed} esposizioni/ramo`; }
      } else if (varRate <= ctrlRate - PROMOTE_REJECTION_DELTA_PP && (varCsatVal - ctrlCsatVal) >= PROMOTE_CSAT_FLOOR) {
        decision = "promote";
        reason = `variant -${(ctrlRate - varRate).toFixed(2)}pp rejection, csat delta ${(varCsatVal - ctrlCsatVal).toFixed(2)}`;
      } else if (varRate >= ctrlRate + ROLLBACK_REJECTION_DELTA_PP || (varCsatVal - ctrlCsatVal) <= ROLLBACK_CSAT_DELTA) {
        decision = "rollback";
        reason = `variant +${(varRate - ctrlRate).toFixed(2)}pp rejection o csat delta ${(varCsatVal - ctrlCsatVal).toFixed(2)}`;
      } else if (isExpired) {
        decision = "expired_no_winner";
        reason = `nessun vincitore deciso entro ${t.ends_at}`;
      } else {
        decision = "waiting";
        reason = "metriche entro range neutro";
      }

      details.push({ test_id: t.id, persona: t.persona_key, decision, metrics, reason });

      if (decision === "promote") {
        // 1) Aggiorna ai_personas.system_prompt
        try {
          await supabaseAdmin
            .from("ai_personas")
            .update({
              system_prompt: t.variant_prompt,
              system_prompt_version: undefined, // lascia che trigger increment se esiste
            })
            .eq("persona_key", t.persona_key);
          // Se la colonna `system_prompt_version` esiste e vuoi farla incrementare,
          // questo richiede un trigger DB. Best-effort: skip increment esplicito.
        } catch (e) {
          console.warn("[ai-prompt-promotion-check] persona update fallito:", e instanceof Error ? e.message : e);
        }
        // 2) Marca proposal promoted + test inactive
        if (t.variant_proposal_id) {
          await supabaseAdmin.from("ai_persona_prompt_proposals")
            .update({ status: "promoted", promoted_at: nowIso, test_ended_at: nowIso })
            .eq("id", t.variant_proposal_id);
        }
        await supabaseAdmin.from("ai_persona_prompt_ab_test")
          .update({ active: false })
          .eq("id", t.id);
        promoted++;
      } else if (decision === "rollback") {
        if (t.variant_proposal_id) {
          await supabaseAdmin.from("ai_persona_prompt_proposals")
            .update({ status: "rejected", rolled_back_at: nowIso, test_ended_at: nowIso })
            .eq("id", t.variant_proposal_id);
        }
        await supabaseAdmin.from("ai_persona_prompt_ab_test")
          .update({ active: false })
          .eq("id", t.id);
        rolled_back++;
      } else if (decision === "expired_no_winner") {
        if (t.variant_proposal_id) {
          await supabaseAdmin.from("ai_persona_prompt_proposals")
            .update({ status: "expired", test_ended_at: nowIso })
            .eq("id", t.variant_proposal_id);
        }
        await supabaseAdmin.from("ai_persona_prompt_ab_test")
          .update({ active: false })
          .eq("id", t.id);
        expired++;
      } else {
        waiting++;
      }
    }

    return jsonResponse({
      promoted, rolled_back, expired, waiting,
      total_active_tests: tests.length,
      details,
    }, 200, cors);
  } catch (err) {
    if (err instanceof Response) return err;
    return errorResponse(err instanceof Error ? err.message : String(err), 500, getCorsHeaders(req));
  }
});
