/**
 * tommaso-insight-daily — agente Tommaso per Product Intelligence.
 *
 * Workflows:
 *   - insight.daily_usage_report (cron 07:00) → aggrega product_events → customer_usage_daily
 *   - insight.upsell_signal      (cron lunedì) → detect candidate upsell + suggerisce a Florin
 *
 * Logica:
 *   1. Aggrega product_events ultimo giorno → customer_usage_daily (deterministico)
 *   2. Solo per i Top 10 candidate (cliente con usage > 80% piano O team cresciuto):
 *      chiama LLM Tommaso per analisi narrativa + suggerimento upgrade
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

const TOMMASO_SYSTEM_PROMPT = `Sei Tommaso, AI specialist Product Intelligence di EdiliziaInCloud.

Il tuo job: analizzare come ogni cliente USA il prodotto e identificare opportunità di valore inespresso.

Sei un detective dei dati. Cerchi pattern:
- Cliente usa heavy un modulo ma ignora il modulo "amico" (es. usa Commesse ma non Marginalità)
- Cliente team cresciuto da 3 → 8 utenti (probabile upsell)
- Cliente vicino limite piano (90% usage)
- Cliente power user su feature che è in piano superiore

Output JSON per ogni upsell candidate:
{
  "company_id": "uuid",
  "signal_type": "near_plan_limit|team_growth|feature_unused|power_user",
  "evidence": "stringa max 250 char con numeri concreti",
  "suggested_action": "string max 150 char",
  "expected_mrr_uplift_eur": number,
  "confidence": 0.0-1.0
}`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return corsResponse();
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  const supabase = createAdminClient();
  const auth = await verifyServiceRoleOrSuperAdmin(supabase, req);
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json();
    const { run_id, workflow_key } = body;
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

    if (workflow_key === "insight.daily_usage_report" || !workflow_key) {
      // ─── Aggrega eventi giorno precedente ──────────────────────────
      const { data: events } = await supabase
        .from("product_events")
        .select("company_id, user_id, event_name, category, occurred_at")
        .gte("occurred_at", `${yesterday}T00:00:00`)
        .lt("occurred_at", `${yesterday}T23:59:59`);

      const byCompany = new Map<string, {
        loginCount: number;
        users: Set<string>;
        features: Record<string, number>;
        modules: Record<string, number>;
        errors: number;
        firstLogin: string | null;
        lastLogin: string | null;
      }>();

      for (const e of (events ?? []) as Array<Record<string, unknown>>) {
        const cid = e.company_id as string;
        if (!byCompany.has(cid)) {
          byCompany.set(cid, {
            loginCount: 0,
            users: new Set(),
            features: {},
            modules: {},
            errors: 0,
            firstLogin: null,
            lastLogin: null,
          });
        }
        const agg = byCompany.get(cid)!;
        if (e.user_id) agg.users.add(e.user_id as string);
        if (e.event_name === "login.success") {
          agg.loginCount++;
          const ts = e.occurred_at as string;
          if (!agg.firstLogin || ts < agg.firstLogin) agg.firstLogin = ts;
          if (!agg.lastLogin || ts > agg.lastLogin) agg.lastLogin = ts;
        }
        if (e.category === "feature") {
          const name = e.event_name as string;
          agg.features[name] = (agg.features[name] ?? 0) + 1;
        }
        if (e.category === "error") agg.errors++;
      }

      for (const [cid, agg] of byCompany) {
        await supabase.from("customer_usage_daily").upsert({
          company_id: cid,
          usage_date: yesterday,
          login_count: agg.loginCount,
          unique_users_active: agg.users.size,
          features_used: agg.features,
          modules_used: agg.modules,
          errors_count: agg.errors,
          first_login_at: agg.firstLogin,
          last_login_at: agg.lastLogin,
        }, { onConflict: "company_id,usage_date" });
      }

      await completeWorkflowRun(supabase, run_id, "completed", {
        companies_aggregated: byCompany.size,
        events_processed: events?.length ?? 0,
      }, null);
      return jsonResponse({ ok: true, companies_aggregated: byCompany.size });
    }

    // ─── Upsell signal detection (weekly) ──────────────────────────────
    if (workflow_key === "insight.upsell_signal") {
      const { data: candidates } = await supabase
        .from("customer_profile")
        .select("*")
        .eq("is_upsell_candidate", true)
        .limit(20);

      let totalCost = 0, totalIn = 0, totalOut = 0;
      const signals: Array<Record<string, unknown>> = [];

      for (const c of (candidates ?? []) as Array<Record<string, unknown>>) {
        const userPrompt = `
CUSTOMER PROFILE:
- Azienda: ${c.name}
- Plan corrente: ${c.plan_name} (${c.plan_price_monthly}€/mese)
- Login 30gg: ${c.login_count_30d}
- Features distinte usate: ${c.features_used_30d_count}
- Team size: ${c.team_size}
- Days since signup: ${c.days_since_signup}
- Health label: ${c.health_label_latest}

TASK: c'è opportunità di upsell? Quale signal? Stima MRR uplift e azione.
Output JSON.
`;
        const llm = await callLLM({
          model: "anthropic/claude-sonnet-4-5",
          systemPrompt: TOMMASO_SYSTEM_PROMPT,
          messages: [{ role: "user", content: userPrompt }],
          maxTokens: 500,
          temperature: 0.5,
        });
        totalCost += llm.costUsd;
        totalIn += llm.tokensInput;
        totalOut += llm.tokensOutput;

        try {
          const m = llm.content.match(/\{[\s\S]+\}/);
          if (m) {
            const parsed = JSON.parse(m[0]);
            signals.push({ ...parsed, company_id: c.company_id, company_name: c.name });

            // Notifica Florin per upsell candidate con confidence > 0.6
            if (parsed.confidence >= 0.6) {
              await supabase.from("notifications").insert({
                recipient_role: "super_admin",
                type: "upsell_opportunity",
                title: `💰 Upsell: ${c.name} (+${parsed.expected_mrr_uplift_eur ?? "?"}€/mese)`,
                body: `${parsed.evidence}\n\n→ ${parsed.suggested_action}`,
                metadata: {
                  company_id: c.company_id,
                  signal_type: parsed.signal_type,
                  confidence: parsed.confidence,
                  mrr_uplift: parsed.expected_mrr_uplift_eur,
                },
              });
            }
          }
        } catch { /* skip */ }
      }

      await completeWorkflowRun(supabase, run_id, "completed", {
        candidates_analyzed: candidates?.length ?? 0,
        signals_detected: signals.length,
      }, { content: "", tokensInput: totalIn, tokensOutput: totalOut, costUsd: totalCost });

      return jsonResponse({
        ok: true,
        candidates_analyzed: candidates?.length ?? 0,
        signals_detected: signals.length,
        total_cost_usd: totalCost,
      });
    }

    return errorResponse(`Unknown workflow_key: ${workflow_key}`, 400);
  } catch (err) {
    return errorResponse((err as Error).message);
  }
});
