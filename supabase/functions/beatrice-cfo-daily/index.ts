/**
 * beatrice-cfo-daily — agente Beatrice per KPI revenue + anomaly detection.
 *
 * Workflows:
 *   - cfo.daily_kpi_brief         (cron 06:30) → MRR delta, churn, payment, anomalie
 *   - cfo.payment_failed_alert    (event)      → alert Florin + email cliente
 *
 * Output principale: notification "Daily Brief" mandata a super_admin.
 */
import {
  createAdminClient,
  callLLM,
  completeWorkflowRun,
  jsonResponse,
  errorResponse,
  corsResponse,
  verifyServiceRoleOrSuperAdmin,
} from "../_customer_os_shared/index.ts";

const BEATRICE_SYSTEM_PROMPT = `Sei Beatrice, AI CFO di EdiliziaInCloud (EiC).

Il tuo job daily: produrre brief KPI per Florin (founder).

Tone: numerico, conciso, italiano business. NO fluff.

Output JSON brief:
{
  "headline": "string max 100 char — la cosa più importante oggi",
  "mrr_status": {
    "current": number,
    "delta_24h_eur": number,
    "delta_7d_pct": number
  },
  "new_customers_24h": number,
  "churned_24h": number,
  "payment_failures_24h": number,
  "anomalies": [
    { "metric": "string", "value": "string", "concern_level": "low|medium|high" }
  ],
  "actions_for_florin": [
    "string max 200 char — azione concreta"
  ]
}`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return corsResponse();
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  const supabase = createAdminClient();
  const auth = await verifyServiceRoleOrSuperAdmin(supabase, req);
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json();
    const { run_id, workflow_key, payload } = body;

    if (workflow_key === "cfo.payment_failed_alert") {
      // Event handler: payment failed singolo
      const { company_id, amount, reason } = payload ?? {};
      if (!company_id) return errorResponse("Missing company_id", 400);

      const { data: company } = await supabase
        .from("companies")
        .select("name, email")
        .eq("id", company_id)
        .maybeSingle();

      await supabase.from("notifications").insert({
        recipient_role: "super_admin",
        type: "payment_failed",
        title: `💸 Pagamento fallito: ${company?.name ?? "?"}`,
        body: `Importo: ${amount ?? "?"}€\nMotivo: ${reason ?? "?"}`,
        metadata: { company_id, amount, reason },
      });

      await completeWorkflowRun(supabase, run_id, "completed", {
        alert_sent: true,
        company_id,
      }, null);
      return jsonResponse({ ok: true });
    }

    // Daily KPI brief
    // ─── 1) Aggrega metriche ───────────────────────────────────────────
    const now = new Date();
    const yesterdayStart = new Date(now.getTime() - 86_400_000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 86_400_000);

    const [
      mrrCurrent,
      newCustomers,
      churned,
      paymentFailures,
      mrr7dAgo,
    ] = await Promise.all([
      supabase.from("customer_profile")
        .select("plan_price_monthly", { count: "exact", head: false })
        .eq("stripe_subscription_status", "active"),
      supabase.from("companies")
        .select("id", { count: "exact", head: true })
        .eq("is_platform_admin_company", false)
        .gte("created_at", yesterdayStart.toISOString()),
      supabase.from("customer_health_history")
        .select("company_id", { count: "exact", head: true })
        .eq("health_label", "churned")
        .gte("snapshot_date", yesterdayStart.toISOString().slice(0, 10)),
      supabase.from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("type", "payment_failed")
        .gte("created_at", yesterdayStart.toISOString()),
      supabase.from("customer_health_history")
        .select("mrr_current")
        .gte("snapshot_date", sevenDaysAgo.toISOString().slice(0, 10))
        .lte("snapshot_date", new Date(sevenDaysAgo.getTime() + 86_400_000).toISOString().slice(0, 10)),
    ]);

    const currentMrr = ((mrrCurrent.data ?? []) as Array<{ plan_price_monthly: number | null }>)
      .reduce((sum, r) => sum + (Number(r.plan_price_monthly) || 0), 0);
    const mrr7d = ((mrr7dAgo.data ?? []) as Array<{ mrr_current: number | null }>)
      .reduce((sum, r) => sum + (Number(r.mrr_current) || 0), 0);
    const delta7dPct = mrr7d > 0 ? ((currentMrr - mrr7d) / mrr7d) * 100 : 0;

    const metrics = {
      mrr_current: currentMrr,
      new_customers_24h: newCustomers.count ?? 0,
      churned_24h: churned.count ?? 0,
      payment_failures_24h: paymentFailures.count ?? 0,
      mrr_7d_ago: mrr7d,
      delta_7d_pct: delta7dPct,
    };

    // ─── 2) Chiama Beatrice per narrative analysis ────────────────────
    const userPrompt = `
METRICHE 24h:
- MRR corrente: ${currentMrr}€
- Nuovi clienti 24h: ${metrics.new_customers_24h}
- Churned 24h: ${metrics.churned_24h}
- Payment failures 24h: ${metrics.payment_failures_24h}
- Delta MRR 7gg: ${delta7dPct.toFixed(1)}%

TASK: Genera brief JSON con headline + anomalies + actions_for_florin.
Considera anomalo: > 2 churn/24h, > 1 payment failure/24h, delta 7gg < -5%, 0 nuovi clienti su 24h se trend mensile era > 0.
`;

    const llm = await callLLM({
      model: "anthropic/claude-haiku-4.5",
      systemPrompt: BEATRICE_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
      maxTokens: 800,
      // 2026-05-27 (AI cost audit): brief CFO con JSON strutturato →
      // temperature bassa per stabilità output.
      temperature: 0.1,
    });

    let parsed: Record<string, unknown> | null = null;
    try {
      const m = llm.content.match(/\{[\s\S]+\}/);
      if (m) parsed = JSON.parse(m[0]);
    } catch { /* skip */ }

    // ─── 3) Notifica brief a Florin ────────────────────────────────────
    if (parsed) {
      await supabase.from("notifications").insert({
        recipient_role: "super_admin",
        type: "daily_brief",
        title: `📊 Brief CFO: ${(parsed as Record<string, unknown>).headline ?? "Daily KPI"}`,
        body: JSON.stringify(parsed, null, 2),
        metadata: { metrics, ai_brief: parsed, persona: "beatrice_cfo" },
      });
    }

    await completeWorkflowRun(supabase, run_id, "completed", {
      metrics,
      ai_brief: parsed,
    }, llm);

    return jsonResponse({
      ok: true,
      metrics,
      brief: parsed,
      cost_usd: llm.costUsd,
    });
  } catch (err) {
    return errorResponse((err as Error).message);
  }
});
