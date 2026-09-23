/**
 * check-ai-usage-alerts — IMP-6
 * Verifiche soglie AI usage ogni 30 minuti da pg_cron.
 * Invia alert email al super_admin se un'azienda supera la soglia giornaliera/mensile.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";
import { sendEmailUnified } from "../_shared/sendEmailUnified.ts";

Deno.serve(async (req) => {
  const corsH = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsH });

  const cronSecret = Deno.env.get("INTERNAL_CRON_SECRET");
  const reqSecret  = req.headers.get("x-cron-secret");
  if (cronSecret && reqSecret !== cronSecret) {
    return new Response(JSON.stringify({ error: "Non autorizzato" }), {
      status: 401, headers: { ...corsH, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const now    = new Date();
  const today  = now.toISOString().split("T")[0];
  const month1 = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  // Carica soglie per piano
  const { data: thresholds } = await (supabase
    .from("ai_usage_thresholds" as never)
    .select("plan_id, daily_limit_eur, monthly_limit_eur") as unknown as Promise<{
      data: Array<{ plan_id: string; daily_limit_eur: number; monthly_limit_eur: number }> | null;
    }>);

  const thresholdMap = new Map<string, { daily: number; monthly: number }>();
  for (const t of thresholds ?? []) {
    thresholdMap.set(t.plan_id, {
      daily: t.daily_limit_eur,
      monthly: t.monthly_limit_eur,
    });
  }
  const defaultT = thresholdMap.get("__default__") ?? { daily: 5, monthly: 50 };

  // Query usage odierno per azienda
  const { data: dailyUsage } = await (supabase
    .from("ai_usage_log" as never)
    .select("company_id, cost_eur")
    .gte("created_at", today) as unknown as Promise<{
      data: Array<{ company_id: string; cost_eur: number }> | null;
    }>);

  // Query usage mensile per azienda
  const { data: monthlyUsage } = await (supabase
    .from("ai_usage_log" as never)
    .select("company_id, cost_eur")
    .gte("created_at", month1) as unknown as Promise<{
      data: Array<{ company_id: string; cost_eur: number }> | null;
    }>);

  // Aggrega per company
  const dailyMap  = aggregateByCompany(dailyUsage ?? []);
  const monthlyMap = aggregateByCompany(monthlyUsage ?? []);

  // Carica piani aziende per threshold lookup
  const companyIds = [...new Set([...dailyMap.keys(), ...monthlyMap.keys()])];
  if (companyIds.length === 0) {
    return new Response(
      JSON.stringify({ ok: true, alerts_created: 0 }),
      { headers: { ...corsH, "Content-Type": "application/json" } }
    );
  }

  const { data: companies } = await supabase
    .from("companies")
    .select("id, name, email, subscription_plan_id")
    .in("id", companyIds);

  const planMap = new Map<string, string>(); // company_id → plan_id
  for (const c of companies ?? []) {
    const comp = c as { id: string; name: string; email: string; subscription_plan_id: string | null };
    planMap.set(comp.id, comp.subscription_plan_id ?? "__default__");
  }

  // Verifica già alertati oggi (evita duplicati)
  const { data: existingAlerts } = await (supabase
    .from("ai_usage_alerts" as never)
    .select("company_id, threshold_type")
    .gte("alerted_at", today) as unknown as Promise<{
      data: Array<{ company_id: string; threshold_type: string }> | null;
    }>);

  const alertedSet = new Set(
    (existingAlerts ?? []).map((a) => `${a.company_id}:${a.threshold_type}`)
  );

  const alertsToInsert: Array<{
    company_id: string;
    threshold_type: string;
    usage_eur: number;
    limit_eur: number;
  }> = [];

  for (const [companyId, dailyEur] of dailyMap) {
    const planId = planMap.get(companyId) ?? "__default__";
    const t = thresholdMap.get(planId) ?? defaultT;
    const key = `${companyId}:daily`;
    if (dailyEur >= t.daily && !alertedSet.has(key)) {
      alertsToInsert.push({ company_id: companyId, threshold_type: "daily", usage_eur: dailyEur, limit_eur: t.daily });
    }
  }

  for (const [companyId, monthlyEur] of monthlyMap) {
    const planId = planMap.get(companyId) ?? "__default__";
    const t = thresholdMap.get(planId) ?? defaultT;
    const key = `${companyId}:monthly`;
    if (monthlyEur >= t.monthly && !alertedSet.has(key)) {
      alertsToInsert.push({ company_id: companyId, threshold_type: "monthly", usage_eur: monthlyEur, limit_eur: t.monthly });
    }
  }

  if (alertsToInsert.length === 0) {
    return new Response(
      JSON.stringify({ ok: true, alerts_created: 0 }),
      { headers: { ...corsH, "Content-Type": "application/json" } }
    );
  }

  // Persisti alert
  await (supabase.from("ai_usage_alerts" as never).insert(alertsToInsert) as unknown as Promise<void>);

  // Invia email al super_admin
  try {
    const { data: admins } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "super_admin")
      .limit(3);

    if (admins?.length) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("email")
        .in("id", admins.map((a: { user_id: string }) => a.user_id));

      const adminEmails = (profiles ?? [])
        .map((p: { email: string }) => p.email)
        .filter(Boolean);

      if (adminEmails.length > 0) {
        const alertLines = alertsToInsert.map((a) => {
          const co = (companies ?? []).find((c) => (c as { id: string }).id === a.company_id);
          const name = co ? (co as { name: string }).name : a.company_id.slice(0, 8);
          return `<li><strong>${name}</strong> — ${a.threshold_type === "daily" ? "giornaliero" : "mensile"}: €${a.usage_eur.toFixed(2)} / soglia €${a.limit_eur.toFixed(2)}</li>`;
        });

        await sendEmailUnified({
          companyId:    null,
          stream:       "transactional",
          to:           adminEmails,
          subject:      `${alertsToInsert.length} alert AI usage — soglie superate`,
          html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
            <h2 style="color:#dc2626;">Alert Utilizzo AI — Soglie Superate</h2>
            <p>Le seguenti aziende hanno superato la soglia AI configurata:</p>
            <ul>${alertLines.join("")}</ul>
            <p>Vai al <a href="${Deno.env.get("SITE_URL") ?? "https://app.ediliziaincloud.com"}/admin/impostazioni/ai-usage">Monitor AI Usage</a> per i dettagli.</p>
          </div>`,
          templateName: "ai_usage_alert",
          skipCredits:  true,
          adminClient:  supabase,
          metadata:     { alerts_count: alertsToInsert.length },
        });
      }
    }
  } catch (emailErr) {
    console.error("[check-ai-usage-alerts] Email error:", (emailErr as Error).message);
  }

  return new Response(
    JSON.stringify({ ok: true, alerts_created: alertsToInsert.length }),
    { headers: { ...corsH, "Content-Type": "application/json" } }
  );
});

function aggregateByCompany(rows: Array<{ company_id: string; cost_eur: number }>): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) {
    m.set(r.company_id, (m.get(r.company_id) ?? 0) + (r.cost_eur ?? 0));
  }
  return m;
}
