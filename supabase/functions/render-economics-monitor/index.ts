/**
 * render-economics-monitor (Supermaster — Parte B7)
 *
 * Edge function scheduled che periodicamente rileva anomalie economics sul
 * modulo Render:
 *  - negative_margin    → company con margine cumulato < 0 nel periodo
 *  - high_cost_per_render → costo medio API superiore a soglia
 *  - zero_revenue_usage → render consumati senza revenue FIFO (crediti omaggio
 *                         esauriti senza acquisto → margine = -100%)
 *
 * Le anomalie vengono inserite in `render_economics_alerts` con uniq index su
 * (company_id, alert_type, period_from, period_to) WHERE resolved_at IS NULL
 * → l'ON CONFLICT garantisce idempotenza del cron.
 *
 * Auth:
 *  - header `x-cron-secret: <CRON_SECRET>`   → invocazione da scheduler
 *  - oppure Bearer JWT con ruolo super_admin → invocazione manuale da UI
 *
 * Body (opzionale, JSON):
 *  - `period_hours`: int, default 24 (finestra di analisi)
 *  - `cost_per_render_threshold_eur`: number, default 0.08
 *  - `dry_run`: boolean, default false (non scrive alert, ritorna preview)
 *
 * Risposta: { ok: true, period, inserted: n, candidates: {...}, alerts: [...] }
 */

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, jsonResponse, errorResponse } from "../_shared/headers.ts";
import { cronSecretValido } from "../_shared/cronAuth.ts";

type AlertType = "negative_margin" | "high_cost_per_render" | "zero_revenue_usage";
type Severity = "info" | "warning" | "critical";

interface EconomicsByCompanyRow {
  company_id: string;
  company_name: string;
  renders_count: number;
  cost_total_eur: number;
  revenue_total_eur: number;
  margin_total_eur: number;
  margin_pct: number;
  avg_cost_per_render: number;
  avg_revenue_per_render: number;
  last_activity: string | null;
}

interface MonitorConfig {
  periodHours: number;
  costPerRenderThresholdEur: number;
  dryRun: boolean;
}

interface AlertInsert {
  company_id: string;
  alert_type: AlertType;
  severity: Severity;
  period_from: string;
  period_to: string;
  renders_count: number;
  cost_total: number;
  revenue_total: number;
  margin_total: number;
  details: Record<string, unknown>;
}

function parseConfig(body: Record<string, unknown> | null): MonitorConfig {
  const periodHours =
    typeof body?.period_hours === "number" && body.period_hours > 0 && body.period_hours <= 24 * 30
      ? body.period_hours
      : 24;
  const costPerRenderThresholdEur =
    typeof body?.cost_per_render_threshold_eur === "number" && body.cost_per_render_threshold_eur >= 0
      ? body.cost_per_render_threshold_eur
      : 0.08;
  const dryRun = body?.dry_run === true;
  return { periodHours, costPerRenderThresholdEur, dryRun };
}

function severityForMargin(marginPct: number): Severity {
  // marginPct già in percentuale (0..100 / -100..0 etc)
  if (marginPct <= -50) return "critical";
  if (marginPct < 0) return "warning";
  return "info";
}

function buildAlerts(
  rows: EconomicsByCompanyRow[],
  period: { from: string; to: string },
  config: MonitorConfig,
): AlertInsert[] {
  const alerts: AlertInsert[] = [];
  for (const r of rows) {
    if (r.renders_count <= 0) continue;

    // 1. negative_margin
    if (r.margin_total_eur < 0) {
      alerts.push({
        company_id: r.company_id,
        alert_type: "negative_margin",
        severity: severityForMargin(r.margin_pct),
        period_from: period.from,
        period_to: period.to,
        renders_count: r.renders_count,
        cost_total: Number(r.cost_total_eur.toFixed(4)),
        revenue_total: Number(r.revenue_total_eur.toFixed(4)),
        margin_total: Number(r.margin_total_eur.toFixed(4)),
        details: {
          company_name: r.company_name,
          margin_pct: r.margin_pct,
          avg_cost_per_render: r.avg_cost_per_render,
          avg_revenue_per_render: r.avg_revenue_per_render,
          last_activity: r.last_activity,
        },
      });
    }

    // 2. high_cost_per_render (soglia superata)
    if (r.avg_cost_per_render > config.costPerRenderThresholdEur) {
      alerts.push({
        company_id: r.company_id,
        alert_type: "high_cost_per_render",
        severity: r.avg_cost_per_render > config.costPerRenderThresholdEur * 1.5 ? "critical" : "warning",
        period_from: period.from,
        period_to: period.to,
        renders_count: r.renders_count,
        cost_total: Number(r.cost_total_eur.toFixed(4)),
        revenue_total: Number(r.revenue_total_eur.toFixed(4)),
        margin_total: Number(r.margin_total_eur.toFixed(4)),
        details: {
          company_name: r.company_name,
          avg_cost_per_render: r.avg_cost_per_render,
          threshold_eur: config.costPerRenderThresholdEur,
          excess_pct: Number(
            (((r.avg_cost_per_render - config.costPerRenderThresholdEur) /
              config.costPerRenderThresholdEur) *
              100).toFixed(2),
          ),
        },
      });
    }

    // 3. zero_revenue_usage (render consumati ma revenue totale = 0)
    if (r.renders_count > 0 && r.revenue_total_eur <= 0) {
      alerts.push({
        company_id: r.company_id,
        alert_type: "zero_revenue_usage",
        severity: r.renders_count >= 10 ? "warning" : "info",
        period_from: period.from,
        period_to: period.to,
        renders_count: r.renders_count,
        cost_total: Number(r.cost_total_eur.toFixed(4)),
        revenue_total: 0,
        margin_total: Number(r.margin_total_eur.toFixed(4)),
        details: {
          company_name: r.company_name,
          avg_cost_per_render: r.avg_cost_per_render,
          note: "Render consumati senza revenue FIFO — probabile esaurimento crediti omaggio",
        },
      });
    }
  }
  return alerts;
}

async function fetchEconomicsByCompany(
  supabase: SupabaseClient,
  fromIso: string,
  toIso: string,
): Promise<EconomicsByCompanyRow[]> {
  // Chiamata alla RPC super_admin. Service role bypassa il role check interno.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc("get_render_economics_by_company", {
    _from: fromIso,
    _to: toIso,
  });
  if (error) {
    throw new Error(`RPC get_render_economics_by_company failed: ${error.message}`);
  }
  return (data ?? []) as EconomicsByCompanyRow[];
}

async function insertAlerts(
  supabase: SupabaseClient,
  alerts: AlertInsert[],
): Promise<{ inserted: number; skipped: number; errors: string[] }> {
  let inserted = 0;
  let skipped = 0;
  const errors: string[] = [];
  if (alerts.length === 0) return { inserted, skipped, errors };

  for (const a of alerts) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("render_economics_alerts")
      .insert(a);
    if (error) {
      // Codice 23505 = unique violation (già esiste alert identico non risolto)
      if (error.code === "23505") {
        skipped++;
      } else {
        errors.push(`${a.company_id}/${a.alert_type}: ${error.message}`);
      }
    } else {
      inserted++;
    }
  }
  return { inserted, skipped, errors };
}

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: cors });
  }

  // Auth: segreto del cron oppure un vero super_admin.
  //
  // Il commento diceva gia' "JWT super_admin", ma il codice si limitava a
  // `authHeader.startsWith("Bearer ")`: passava QUALUNQUE token, quindi ogni
  // utente autenticato poteva far girare il monitor. E il segreto veniva
  // confrontato solo con CRON_SECRET, mentre i job ne mandano un altro dei tre
  // nomi in uso: cronSecretValido() li accetta tutti.
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  let autorizzato = cronSecretValido(req);

  if (!autorizzato && token) {
    const url = Deno.env.get("SUPABASE_URL");
    const chiaveServizio = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (chiaveServizio && token === chiaveServizio) {
      autorizzato = true;
    } else if (url && chiaveServizio) {
      const admin = createClient(url, chiaveServizio);
      const { data: utente } = await admin.auth.getUser(token);
      if (utente?.user) {
        const { data: ruoli } = await admin
          .from("user_roles").select("role").eq("user_id", utente.user.id);
        autorizzato = (ruoli ?? []).some((r: { role: string }) => r.role === "super_admin");
      }
    }
  }
  if (!autorizzato) {
    return errorResponse("Unauthorized", 401, cors);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) {
      return errorResponse("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY", 500, cors);
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    // Nota: qui c'era una seconda verifica del ruolo super_admin che leggeva
    // `hasCronAuth` e `hasBearer`. Il refactor dell'auth (commit b67869c4d,
    // 2026-08-28) ha sostituito quelle variabili con authHeader/token/
    // autorizzato ma ha lasciato indietro questa riga: essendo binding mai
    // dichiarati, in strict mode ogni chiamata AUTORIZZATA finiva in
    // ReferenceError, catturato dal catch in fondo e restituito come 500.
    // Il controllo era comunque ridondante: il blocco di autenticazione sopra
    // ammette solo cron secret, service key o un vero super_admin, e altrimenti
    // esce con 401 prima di arrivare qui.

    // Parse body (config opzionale)
    let body: Record<string, unknown> | null = null;
    try {
      const text = await req.text();
      body = text ? JSON.parse(text) : null;
    } catch {
      body = null;
    }
    const config = parseConfig(body);

    // Finestra temporale
    const now = new Date();
    const from = new Date(now.getTime() - config.periodHours * 3600 * 1000);
    const period = { from: from.toISOString(), to: now.toISOString() };

    // Fetch aggregato per company
    const rows = await fetchEconomicsByCompany(supabase, period.from, period.to);

    // Build alerts
    const alerts = buildAlerts(rows, period, config);

    // Insert (tranne in dry-run)
    const { inserted, skipped, errors } = config.dryRun
      ? { inserted: 0, skipped: 0, errors: [] }
      : await insertAlerts(supabase, alerts);

    // Summary by type (utile per dashboard monitoring)
    const byType = alerts.reduce<Record<string, number>>((acc, a) => {
      acc[a.alert_type] = (acc[a.alert_type] ?? 0) + 1;
      return acc;
    }, {});

    return jsonResponse(
      {
        ok: true,
        period,
        config,
        companies_analyzed: rows.length,
        alerts_generated: alerts.length,
        inserted,
        skipped,
        errors,
        by_type: byType,
        dry_run: config.dryRun,
        alerts: config.dryRun ? alerts : undefined,
      },
      200,
      cors,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[render-economics-monitor]", msg);
    return errorResponse(msg, 500, cors);
  }
});
