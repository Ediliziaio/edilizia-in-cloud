/**
 * elena-cs-health-daily — agente Elena per Customer Success daily ops.
 *
 * Workflows:
 *   - cs.daily_health_scoring (cron 06:00) → calcola health_score per ogni cliente
 *   - cs.at_risk_alert        (event)      → ping Florin se cliente passa at_risk
 *
 * Per il health scoring, usa formula deterministica (vedi healthScore.ts client).
 * LLM viene chiamato SOLO per casi al margine (label cambia + reason analysis).
 *
 * Output: snapshot in customer_health_history + alert su notifications.
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

const ELENA_SYSTEM_PROMPT = `Sei Elena, AI specialist Customer Success di EdiliziaInCloud (EiC).

Il tuo job nel cron daily:
- Per ogni cliente, calcoli health score (è gia stato fatto a monte)
- Per i clienti con LABEL CAMBIATA da ieri (es. engaged → at_risk):
  - Analizza il "why" (cosa ha causato il drop?)
  - Suggerisci 1 azione concreta a Florin
  - Genera bozza email/call script

Output JSON per ogni cliente analizzato:
{
  "company_id": "uuid",
  "label_change": "engaged→at_risk",
  "root_cause": "string max 200 char",
  "suggested_action": "call|email|nothing",
  "action_draft": "string|null",
  "urgency": "P0|P1|P2|P3"
}`;

interface HealthInputs {
  loginCount30d: number;
  featuresUsed30d: number;
  ticketsOpen: number;
  ticketsResolvedAvgHours: number | null;
  lastNpsScore: number | null;
  paymentStatus: string | null;
  sentimentAvg30d: number | null;
}

// Formula deterministica (copy of client-side healthScore.ts per consistency)
function computeHealthScore(inp: HealthInputs): { total: number; label: string; reasons: string[] } {
  const reasons: string[] = [];
  let login = 0, features = 0, tickets = 0, nps = 0, payment = 0, sentiment = 0;

  if (inp.loginCount30d >= 60) login = 25;
  else if (inp.loginCount30d >= 30) login = 20;
  else if (inp.loginCount30d >= 10) { login = 12; reasons.push("Login sotto media"); }
  else if (inp.loginCount30d > 0) { login = 5; reasons.push(`Solo ${inp.loginCount30d} login in 30gg`); }
  else reasons.push("Nessun login in 30gg");

  if (inp.featuresUsed30d >= 10) features = 20;
  else if (inp.featuresUsed30d >= 5) { features = 14; reasons.push("Pochi moduli usati"); }
  else if (inp.featuresUsed30d >= 2) { features = 8; reasons.push("Adozione minima"); }
  else if (inp.featuresUsed30d === 1) { features = 3; reasons.push("Usa 1 sola feature"); }
  else reasons.push("Nessuna feature usata");

  if (inp.ticketsOpen === 0) tickets = 15;
  else if (inp.ticketsOpen <= 2) tickets = 10;
  else if (inp.ticketsOpen <= 5) { tickets = 5; reasons.push(`${inp.ticketsOpen} ticket aperti`); }
  else reasons.push(`${inp.ticketsOpen} ticket aperti — frustrazione probabile`);

  if (inp.lastNpsScore !== null) {
    if (inp.lastNpsScore >= 9) nps = 15;
    else if (inp.lastNpsScore >= 7) nps = 10;
    else if (inp.lastNpsScore >= 4) { nps = 3; reasons.push(`NPS basso (${inp.lastNpsScore})`); }
    else { nps = 0; reasons.push(`NPS detrattore (${inp.lastNpsScore})`); }
  } else nps = 8;

  const ps = (inp.paymentStatus ?? "").toLowerCase();
  if (ps === "active" || ps === "trialing") payment = 15;
  else if (ps === "past_due") { payment = 5; reasons.push("Payment past_due"); }
  else if (ps === "canceled" || ps === "unpaid") { payment = 0; reasons.push("Sub cancellata"); }
  else payment = 10;

  if (inp.sentimentAvg30d !== null) {
    if (inp.sentimentAvg30d >= 4.5) sentiment = 10;
    else if (inp.sentimentAvg30d >= 3.5) sentiment = 8;
    else if (inp.sentimentAvg30d >= 2.5) { sentiment = 4; reasons.push("Tone neutrale-negativo"); }
    else { sentiment = 0; reasons.push("Sentiment NEGATIVO"); }
  } else sentiment = 5;

  const total = login + features + tickets + nps + payment + sentiment;
  let label: string;
  if (total >= 90) label = "champion";
  else if (total >= 70) label = "engaged";
  else if (total >= 40) label = "sleeping";
  else if (total >= 20) label = "at_risk";
  else label = "churned";
  return { total, label, reasons };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return corsResponse();
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  const supabase = createAdminClient();
  const auth = await verifyServiceRoleOrSuperAdmin(supabase, req);
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json();
    const { run_id } = body;

    // Carica tutti i customer_profile attivi
    const { data: profiles, error: profileErr } = await supabase
      .from("customer_profile")
      .select("*")
      .neq("company_status", "churned");
    if (profileErr) throw profileErr;

    const labelChanges: Array<{
      company_id: string;
      name: string;
      from: string;
      to: string;
      score: number;
      reasons: string[];
    }> = [];

    for (const p of (profiles ?? []) as Array<Record<string, unknown>>) {
      const inputs: HealthInputs = {
        loginCount30d: Number(p.login_count_30d ?? 0),
        featuresUsed30d: Number(p.features_used_30d_count ?? 0),
        ticketsOpen: Number(p.tickets_opened_30d ?? 0),
        ticketsResolvedAvgHours: null,  // TODO: derivare da customer_interactions
        lastNpsScore: p.last_nps_score ? Number(p.last_nps_score) : null,
        paymentStatus: (p.stripe_subscription_status as string) ?? null,
        sentimentAvg30d: p.sentiment_avg_30d ? Number(p.sentiment_avg_30d) : null,
      };
      const score = computeHealthScore(inputs);

      const previousLabel = (p.health_label_latest as string) ?? "engaged";
      const todayDate = new Date().toISOString().slice(0, 10);

      // Upsert snapshot
      await supabase.from("customer_health_history").upsert({
        company_id: p.company_id,
        snapshot_date: todayDate,
        health_score: score.total,
        health_label: score.label,
        login_freq_30d: inputs.loginCount30d,
        features_used_30d: inputs.featuresUsed30d,
        tickets_open: inputs.ticketsOpen,
        nps_last: inputs.lastNpsScore,
        mrr_current: Number(p.plan_price_monthly ?? 0),
        payment_status: inputs.paymentStatus,
      }, { onConflict: "company_id,snapshot_date" });

      // Detect label change
      if (previousLabel !== score.label) {
        labelChanges.push({
          company_id: p.company_id as string,
          name: (p.name as string) ?? "",
          from: previousLabel,
          to: score.label,
          score: score.total,
          reasons: score.reasons,
        });
      }
    }

    // Per ogni label change critica, chiama LLM Elena per analisi + draft action
    let totalLlmCost = 0;
    let totalTokensIn = 0, totalTokensOut = 0;
    const alerts: Array<Record<string, unknown>> = [];

    for (const change of labelChanges) {
      const isCritical =
        change.to === "at_risk" || change.to === "churned"
        || (change.from === "champion" && change.to !== "engaged");
      if (!isCritical) continue;

      const userPrompt = `
CUSTOMER LABEL CHANGE:
- Azienda: ${change.name}
- ${change.from} → ${change.to} (score: ${change.score}/100)
- Reasons rilevati: ${change.reasons.join(" · ")}

TASK: analizza la root cause, suggerisci 1 azione concreta per Florin.
Risposta SOLO JSON.
`;
      const llm = await callLLM({
        model: "anthropic/claude-haiku-4.5",
        systemPrompt: ELENA_SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
        maxTokens: 500,
        temperature: 0.4,
      });
      totalLlmCost += llm.costUsd;
      totalTokensIn += llm.tokensInput;
      totalTokensOut += llm.tokensOutput;

      try {
        const jsonMatch = llm.content.match(/\{[\s\S]+\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          alerts.push({ ...change, analysis: parsed });

          // Notifica Florin
          await supabase.from("notifications").insert({
            recipient_role: "super_admin",
            type: "cs_at_risk",
            title: `⚠️ ${change.name} → ${change.to}`,
            body: `${parsed.root_cause}\n\nAzione: ${parsed.suggested_action} — ${parsed.action_draft ?? ""}`,
            metadata: {
              company_id: change.company_id,
              urgency: parsed.urgency,
              score: change.score,
              from: change.from,
              to: change.to,
            },
          });
        }
      } catch {
        // Skip se parse fail
      }
    }

    await completeWorkflowRun(supabase, run_id, "completed", {
      profiles_processed: profiles?.length ?? 0,
      label_changes: labelChanges.length,
      alerts_sent: alerts.length,
    }, {
      content: "",
      tokensInput: totalTokensIn,
      tokensOutput: totalTokensOut,
      costUsd: totalLlmCost,
    });

    return jsonResponse({
      ok: true,
      profiles_processed: profiles?.length ?? 0,
      label_changes: labelChanges.length,
      alerts_sent: alerts.length,
      total_cost_usd: totalLlmCost,
    });
  } catch (err) {
    return errorResponse((err as Error).message);
  }
});
