// supabase/functions/meta-ads-automation-runner/index.ts
//
// MP-ADS-04 GAP-1 · Esecutore reale delle Automation Rules (ad_automation_rules).
//
// Cron oraria: per ogni regola attiva valuta una metrica (da meta_insights_cache.
// payload_json) sulle campagne in scope e, se il trigger scatta:
//   • notify → invia alert (send-ads-alert)
//   • pause  → mette in pausa la campagna (Meta Graph API + DB)
//   • scale  → cambia il budget giornaliero (factor, default +20%)
// Se la regola ha requires_confirmation NON applica: invia un alert di richiesta
// approvazione e logga la proposta in ad_audit_log (il titolare conferma a mano).
//
// SCELTE DI ADATTAMENTO (schemi verificati sul DB reale — vedi STATUS-MP-ADS-04):
//  • Le metriche sono in meta_insights_cache.payload_json (ARRAY di righe campaign),
//    NON in colonne flat: spend/clicks/impressions/ctr/actions per campaign_id.
//  • meta-ads-update-campaign richiede JWT utente + company_admin → un cron service
//    NON può invocarla. Applichiamo via Meta Graph API diretta + token (come spend-check).
//  • Il token sta in integrations.access_token_encrypted (come usa sync-insights).
//  • L'approvazione ads reale è meta_campaigns.status='review' (per il PUBLISH), non
//    adatta ad approvare una pausa/scale → per requires_confirmation: alert + audit.
//  • Idempotenza: cooldown 6h per campagna via ad_audit_log (azioni is_automatic).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decrypt, getEncryptionKey } from "../_shared/encryption.ts";
import { getCorsHeaders } from "../_shared/headers.ts";

const apiVersion = Deno.env.get("META_API_VERSION") || "v21.0";
const COOLDOWN_MS = 6 * 3600 * 1000;

// deno-lint-ignore no-explicit-any
type Any = any;

interface RunResult {
  rules_evaluated: number;
  actions_applied: number;
  approvals_requested: number;
  notifications: number;
  skipped_cooldown: number;
  errors: string[];
  duration_ms: number;
}

const LEAD_ACTION_TYPES = new Set([
  "lead",
  "leadgen.other",
  "onsite_conversion.lead_grouped",
  "offsite_conversion.fb_pixel_lead",
]);

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405, cors);

  const t0 = Date.now();
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const cronSecret = Deno.env.get("PROACTIVE_CRON_SECRET") || "";

  // Auth: solo service role (chiamata cron) o x-cron-secret
  const authHeader = req.headers.get("Authorization") || "";
  const cronHeader = req.headers.get("x-cron-secret") || "";
  const okService = authHeader === `Bearer ${serviceKey}`;
  const okCron = !!cronSecret && cronHeader === cronSecret;
  if (!okService && !okCron) return json({ error: "service_role_required" }, 401, cors);

  const admin = createClient(supabaseUrl, serviceKey);
  const errors: string[] = [];
  let rulesEvaluated = 0, actionsApplied = 0, approvalsRequested = 0, notifications = 0, skippedCooldown = 0;

  try {
    const { data: rules, error: rulesErr } = await admin
      .from("ad_automation_rules")
      .select("*")
      .eq("is_enabled", true);
    if (rulesErr) {
      const msg = String(rulesErr.message ?? "");
      if (msg.includes("does not exist") || msg.includes("schema cache")) {
        return json({ skipped: "schema_not_applied" }, 200, cors);
      }
      return json({ error: "rules_fetch_failed", detail: msg }, 500, cors);
    }

    for (const rule of (rules as Any[]) ?? []) {
      try {
        rulesEvaluated++;
        const trigger = rule.trigger ?? {};
        const windowDays = Number(trigger.window_days ?? 7) || 7;

        // Campagne in scope: pubblicate (meta_campaign_id non null), opzionale filtro stato
        let q = admin
          .from("meta_campaigns")
          .select("id, meta_campaign_id, integration_id, ad_account_id, daily_budget_cents, status, name")
          .eq("company_id", rule.company_id)
          .not("meta_campaign_id", "is", null);
        if (rule.scope_filter?.status) q = q.eq("status", rule.scope_filter.status);
        const { data: campaigns } = await q;
        if (!campaigns?.length) continue;

        // Metriche aggregate per campagna (meta_campaign_id → metriche) sulla finestra
        const metricsByMetaId = await readCompanyMetrics(admin, rule.company_id, windowDays);

        let ruleTriggeredOnce = false;

        for (const camp of campaigns as Any[]) {
          const agg = metricsByMetaId.get(String(camp.meta_campaign_id));
          if (!agg) continue; // nessun insight per questa campagna nella finestra
          const metricValue = computeMetric(agg, String(trigger.metric ?? "spend"));
          if (metricValue === null) continue;
          if (!evaluate(metricValue, String(trigger.operator ?? ">"), Number(trigger.value))) continue;

          // Idempotenza: salta se c'è già un'azione automatica su questa campagna < 6h fa
          if (await recentlyActed(admin, rule.company_id, camp.id)) {
            skippedCooldown++;
            continue;
          }

          if (rule.requires_confirmation) {
            // NON applicare: notifica richiesta approvazione + logga la proposta
            await invokeAlert(admin, serviceKey, rule.company_id, "approval_request", `rule:${rule.name}`);
            await audit(admin, {
              company_id: rule.company_id, entity_id: camp.id, entity_name: camp.name,
              action: "auto_proposed", is_automatic: true,
              changes: { rule_id: rule.id, rule_name: rule.name, proposed: rule.action, metric: trigger.metric, metric_value: metricValue },
              notes: "Azione proposta dalla regola — in attesa di conferma del titolare",
            });
            approvalsRequested++;
          } else {
            const applied = await applyAction(admin, serviceKey, rule, camp, metricValue);
            if (applied === "notify") notifications++;
            else if (applied) actionsApplied++;
            else errors.push(`apply_failed:rule_${rule.id}:camp_${camp.id}`);
          }
          ruleTriggeredOnce = true;
        }

        if (ruleTriggeredOnce) {
          await admin.from("ad_automation_rules").update({
            last_triggered_at: new Date().toISOString(),
            trigger_count: (rule.trigger_count ?? 0) + 1,
          }).eq("id", rule.id);
        }
        await admin.from("ad_automation_rules")
          .update({ last_evaluated_at: new Date().toISOString() })
          .eq("id", rule.id);
      } catch (e) {
        errors.push(`rule_${rule.id}_failed:${String(e)}`);
      }
    }

    const result: RunResult = {
      rules_evaluated: rulesEvaluated, actions_applied: actionsApplied,
      approvals_requested: approvalsRequested, notifications,
      skipped_cooldown: skippedCooldown, errors, duration_ms: Date.now() - t0,
    };
    return json(result, 200, cors);
  } catch (e) {
    console.error("[meta-ads-automation-runner] uncaught", e);
    return json({ error: "internal_error", detail: String(e) }, 500, cors);
  }
});

// ── Metriche da meta_insights_cache.payload_json (array di righe campaign) ──────
interface Agg { spend: number; clicks: number; impressions: number; leads: number; }

async function readCompanyMetrics(admin: Any, companyId: string, windowDays: number): Promise<Map<string, Agg>> {
  const out = new Map<string, Agg>();
  const cutoff = new Date(Date.now() - windowDays * 86400_000).toISOString().split("T")[0];
  const { data: rows } = await admin
    .from("meta_insights_cache")
    .select("payload_json, date_start, level")
    .eq("company_id", companyId)
    .eq("level", "campaign")
    .gte("date_start", cutoff);

  for (const row of (rows as Any[]) ?? []) {
    const arr = Array.isArray(row.payload_json) ? row.payload_json : [];
    for (const el of arr) {
      const cid = el?.campaign_id ? String(el.campaign_id) : null;
      if (!cid) continue;
      // se l'elemento ha una sua data, rispettiamo la finestra
      if (el.date_start && String(el.date_start) < cutoff) continue;
      const cur = out.get(cid) ?? { spend: 0, clicks: 0, impressions: 0, leads: 0 };
      cur.spend += num(el.spend);
      cur.clicks += num(el.clicks);
      cur.impressions += num(el.impressions);
      cur.leads += extractLeads(el.actions);
      out.set(cid, cur);
    }
  }
  return out;
}

function num(v: unknown): number { const n = parseFloat(String(v ?? "0")); return Number.isFinite(n) ? n : 0; }

function extractLeads(actions: unknown): number {
  if (!Array.isArray(actions)) return 0;
  let leads = 0;
  for (const a of actions as Any[]) {
    if (a?.action_type && LEAD_ACTION_TYPES.has(String(a.action_type))) leads += num(a.value);
  }
  return leads;
}

/** Calcola la metrica richiesta dai valori aggregati. null se non calcolabile. */
function computeMetric(a: Agg, metric: string): number | null {
  switch (metric) {
    case "spend": return a.spend;
    case "clicks": return a.clicks;
    case "impressions": return a.impressions;
    case "leads": return a.leads;
    case "ctr": return a.impressions > 0 ? (a.clicks / a.impressions) * 100 : null;
    case "cpc": return a.clicks > 0 ? a.spend / a.clicks : null;
    case "cpl":
    case "cpa": return a.leads > 0 ? a.spend / a.leads : null;
    default: return null;
  }
}

/** Operatori supportati: simboli e forme parola. */
function evaluate(value: number, operator: string, target: number): boolean {
  if (!Number.isFinite(target)) return false;
  switch (operator) {
    case ">": case "gt": return value > target;
    case ">=": case "gte": return value >= target;
    case "<": case "lt": return value < target;
    case "<=": case "lte": return value <= target;
    case "==": case "eq": return value === target;
    case "!=": case "neq": return value !== target;
    default: return false;
  }
}

async function recentlyActed(admin: Any, companyId: string, campaignId: string): Promise<boolean> {
  const since = new Date(Date.now() - COOLDOWN_MS).toISOString();
  const { data } = await admin
    .from("ad_audit_log")
    .select("id")
    .eq("company_id", companyId)
    .eq("entity_id", campaignId)
    .eq("is_automatic", true)
    .gte("created_at", since)
    .limit(1);
  return (data?.length ?? 0) > 0;
}

// ── Applicazione azione (Meta Graph API diretta + DB) ───────────────────────────
async function applyAction(admin: Any, serviceKey: string, rule: Any, camp: Any, metricValue: number): Promise<string | false> {
  const t = String(rule.action?.type ?? "");

  if (t === "notify") {
    await invokeAlert(admin, serviceKey, rule.company_id, "spend_anomaly", `rule:${rule.name}`);
    await audit(admin, {
      company_id: rule.company_id, entity_id: camp.id, entity_name: camp.name,
      action: "auto_notify", is_automatic: true,
      changes: { rule_id: rule.id, rule_name: rule.name, metric: rule.trigger?.metric, metric_value: metricValue },
      notes: `Notifica automatica: ${rule.name}`,
    });
    return "notify";
  }

  const token = await campaignToken(admin, camp.integration_id);
  if (!token) return false;

  if (t === "pause") {
    const ok = await metaPost(camp.meta_campaign_id, { status: "PAUSED" }, token);
    if (!ok) return false;
    await admin.from("meta_campaigns").update({ status: "paused", last_synced_at: new Date().toISOString() }).eq("id", camp.id);
    await audit(admin, {
      company_id: rule.company_id, entity_id: camp.id, entity_name: camp.name,
      action: "auto_pause", is_automatic: true,
      changes: { rule_id: rule.id, rule_name: rule.name, metric: rule.trigger?.metric, metric_value: metricValue },
      notes: `Pausa automatica: ${rule.name}`,
    });
    return "pause";
  }

  if (t === "scale") {
    const factor = Number(rule.action?.params?.factor ?? 1.2) || 1.2;
    const current = Number(camp.daily_budget_cents ?? 0);
    if (current <= 0) return false; // niente budget noto su cui scalare
    const next = Math.round(current * factor);
    // Meta vuole il budget in unità minori (cent) come stringa
    const ok = await metaPost(camp.meta_campaign_id, { daily_budget: String(next) }, token);
    if (!ok) return false;
    await admin.from("meta_campaigns").update({ daily_budget_cents: next, last_synced_at: new Date().toISOString() }).eq("id", camp.id);
    await audit(admin, {
      company_id: rule.company_id, entity_id: camp.id, entity_name: camp.name,
      action: "auto_scale", is_automatic: true,
      changes: { rule_id: rule.id, rule_name: rule.name, from_cents: current, to_cents: next, factor },
      notes: `Budget scalato automaticamente (${factor}×): ${rule.name}`,
    });
    return "scale";
  }

  return false;
}

async function campaignToken(admin: Any, integrationId: string | null): Promise<string | null> {
  if (!integrationId) return null;
  const { data: integ } = await admin
    .from("integrations")
    .select("access_token_encrypted, status")
    .eq("id", integrationId)
    .maybeSingle();
  if (!integ?.access_token_encrypted || integ.status !== "connected") return null;
  try {
    const encKey = await getEncryptionKey();
    return await decrypt(integ.access_token_encrypted, encKey);
  } catch {
    return null;
  }
}

async function metaPost(metaCampaignId: string, fields: Record<string, string>, token: string): Promise<boolean> {
  try {
    const res = await fetch(`https://graph.facebook.com/${apiVersion}/${metaCampaignId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...fields, access_token: token }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function invokeAlert(admin: Any, serviceKey: string, companyId: string, alertType: string, reason: string) {
  try {
    await admin.functions.invoke("send-ads-alert", {
      body: { company_id: companyId, alert_type: alertType, reason },
      headers: { Authorization: `Bearer ${serviceKey}` },
    });
  } catch { /* best-effort */ }
}

async function audit(admin: Any, row: {
  company_id: string; entity_id: string; entity_name?: string | null;
  action: string; is_automatic: boolean; changes: Record<string, unknown>; notes?: string;
}) {
  await admin.from("ad_audit_log").insert({
    company_id: row.company_id,
    entity_type: "campaign",
    entity_id: row.entity_id,
    entity_name: row.entity_name ?? null,
    action: row.action,
    is_automatic: row.is_automatic,
    changes: row.changes,
    notes: row.notes ?? null,
  }).then(() => {}, () => {});
}

function json(payload: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(payload), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
