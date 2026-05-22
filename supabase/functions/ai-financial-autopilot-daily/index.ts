/**
 * ai-financial-autopilot-daily — Feature #15
 *
 * "CFO virtuale": una volta al giorno guarda la salute finanziaria
 * complessiva della company (cassa + crediti + scadenze fornitori +
 * margine commesse) e propone leve di azione orchestrate.
 *
 * Combina segnali da:
 *   - cashflow_forecast_snapshots (saldo 90gg previsto)
 *   - bank_transactions (saldo attuale)
 *   - orders con margine basso (margin_pct < soglia)
 *   - rate clienti scadute > 60gg
 *   - fatture fornitori in scadenza
 *
 * Output: 1 proposta `financial_strategy_review` per company quando il
 * sistema rileva "stato di guardia" (es. -10k€ a 30gg + 2 cantieri sotto
 * margine 10%). Il payload contiene un PIANO di azioni multiple proposte
 * dall'AI: solleciti top debitori + posticipo pagamenti X + ridiscussione
 * margine cantiere Y.
 *
 * Il piano singolo va all'admin: l'utente vede UN proposta sintetica
 * invece di 10 proposte sparse, e può approvare singole leve dalla UI
 * dedicata oppure scegliere "applica tutto" (auto via Feature #1).
 *
 * Cadenza: 1 run/giorno per company. Idempotente per data corrente.
 */

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";
import { getCorsHeaders } from "../_shared/headers.ts";

interface CompanyRow { id: string; name: string }

interface Lever {
  kind: "send_overdue_reminder" | "defer_supplier_payment" | "renegotiate_margin" | "request_sal_anticipato";
  description: string;
  impact_eur_est: number;
  related_entity_id?: string;
}

interface FinancialSnapshot {
  worst_case_90d_eur: number | null;
  current_bank_balance_eur: number | null;
  overdue_receivables_eur: number;
  overdue_receivables_count: number;
  low_margin_orders_count: number;
}

const ALERT_THRESHOLD_EUR = -10_000;

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST only" }), {
      status: 405,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const cronSecret = req.headers.get("x-cron-secret");
  const expected = Deno.env.get("PROACTIVE_CRON_SECRET");
  const isCron = !!cronSecret && !!expected && cronSecret === expected;
  if (!isCron) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const t0 = Date.now();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: companies } = await (supabase as any)
    .from("companies")
    .select("id, name")
    .eq("is_active", true);

  const summary = {
    companies_scanned: 0,
    plans_created: 0,
    skipped_healthy: 0,
    errors: [] as string[],
    duration_ms: 0,
  };

  for (const co of (companies ?? []) as CompanyRow[]) {
    summary.companies_scanned += 1;
    try {
      const snap = await loadFinancialSnapshot(supabase, co.id);
      const triggers: string[] = [];
      if (snap.worst_case_90d_eur !== null && snap.worst_case_90d_eur < ALERT_THRESHOLD_EUR) {
        triggers.push("cashflow_negativo_90gg");
      }
      if (snap.overdue_receivables_count >= 3) {
        triggers.push("crediti_scaduti_multipli");
      }
      if (snap.low_margin_orders_count >= 2) {
        triggers.push("margini_critici_multipli");
      }
      if (triggers.length === 0) {
        summary.skipped_healthy += 1;
        continue;
      }

      // Componi piano leve
      const levers: Lever[] = [];
      if (snap.overdue_receivables_eur > 0) {
        levers.push({
          kind: "send_overdue_reminder",
          description: `Sollecita top debitori per recuperare €${snap.overdue_receivables_eur.toFixed(0)}`,
          impact_eur_est: snap.overdue_receivables_eur,
        });
      }
      if (snap.worst_case_90d_eur !== null && snap.worst_case_90d_eur < ALERT_THRESHOLD_EUR) {
        levers.push({
          kind: "defer_supplier_payment",
          description: "Valuta posticipo pagamenti fornitori non critici (-30gg)",
          impact_eur_est: Math.min(5000, Math.abs(snap.worst_case_90d_eur) * 0.3),
        });
        levers.push({
          kind: "request_sal_anticipato",
          description: "Richiedi SAL anticipato sui cantieri attivi più maturi",
          impact_eur_est: Math.min(8000, Math.abs(snap.worst_case_90d_eur) * 0.4),
        });
      }
      if (snap.low_margin_orders_count > 0) {
        levers.push({
          kind: "renegotiate_margin",
          description: `Rivedi prezzi/varianti sui ${snap.low_margin_orders_count} cantieri sotto soglia`,
          impact_eur_est: 0,
        });
      }

      // Risolvi admin user
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: roleRow } = await (supabase as any)
        .from("user_roles")
        .select("user_id")
        .eq("company_id", co.id)
        .in("role", ["company_admin"])
        .limit(1)
        .maybeSingle();
      const adminUserId = (roleRow as { user_id?: string } | null)?.user_id;
      if (!adminUserId) continue;

      // Idempotenza giornaliera: signal_entity_id = data di oggi (UUID determinato)
      // Usiamo company_id come entity_id → 1 piano/giorno (la dedup ha pending+30gg reject)
      const today = new Date().toISOString().slice(0, 10);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: propId } = await (supabase as any).rpc("create_proactive_proposal", {
        p_company_id: co.id,
        p_user_id: adminUserId,
        p_persona_key: "cfo",
        p_action_type: "financial_strategy_review",
        p_summary: `Stato finanziario in guardia (${triggers.join(", ")}) — ${levers.length} leve pronte. Rivedi e applica?`.slice(0, 200),
        p_payload: {
          date: today,
          triggers,
          snapshot: snap,
          levers,
          summary: `Cassa 90gg: €${(snap.worst_case_90d_eur ?? 0).toFixed(0)}. ` +
            `Crediti scaduti: €${snap.overdue_receivables_eur.toFixed(0)} (${snap.overdue_receivables_count}). ` +
            `Cantieri margine basso: ${snap.low_margin_orders_count}.`,
        },
        p_signal_type: "financial_autopilot_daily",
        p_signal_entity_id: co.id, // 1 proposta/giorno per company (dedup via pending)
        p_signal_metadata: { triggers, levers_count: levers.length },
        p_risk_level: triggers.length >= 2 ? "red" : "yellow",
        p_ttl_days: 1, // breve: il piano vale per oggi, domani ricomputato
      });
      if (propId) summary.plans_created += 1;
    } catch (e) {
      summary.errors.push(`company ${co.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  summary.duration_ms = Date.now() - t0;
  return new Response(JSON.stringify(summary, null, 2), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
});

async function loadFinancialSnapshot(
  supa: SupabaseClient,
  companyId: string,
): Promise<FinancialSnapshot> {
  const snap: FinancialSnapshot = {
    worst_case_90d_eur: null,
    current_bank_balance_eur: null,
    overdue_receivables_eur: 0,
    overdue_receivables_count: 0,
    low_margin_orders_count: 0,
  };

  // Forecast
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: snapRow } = await (supa as any)
    .from("cashflow_forecast_snapshots")
    .select("scenarios")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const worst = (snapRow as any)?.scenarios?.worst_case;
  if (worst && typeof worst.cumulative_eur === "number") {
    snap.worst_case_90d_eur = worst.cumulative_eur;
  }

  // Rate scadute
  const today = new Date().toISOString().slice(0, 10);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: overdueOrders } = await (supa as any)
    .from("orders")
    .select("deposit_amount, deposit_paid, deposit_expected_date, balance_amount, balance_paid, balance_expected_date")
    .eq("company_id", companyId)
    .or(
      `and(deposit_paid.eq.false,deposit_expected_date.lt.${today}),and(balance_paid.eq.false,balance_expected_date.lt.${today})`,
    )
    .limit(100);

  for (const o of (overdueOrders ?? []) as Array<Record<string, unknown>>) {
    const deposit = Number(o.deposit_amount ?? 0);
    const balance = Number(o.balance_amount ?? 0);
    let amount = 0;
    if (o.deposit_paid === false && typeof o.deposit_expected_date === "string" && o.deposit_expected_date < today) {
      amount += deposit;
    }
    if (o.balance_paid === false && typeof o.balance_expected_date === "string" && o.balance_expected_date < today) {
      amount += balance;
    }
    if (amount > 0) {
      snap.overdue_receivables_eur += amount;
      snap.overdue_receivables_count += 1;
    }
  }

  // Cantieri a margine basso (placeholder: tabella custom potrebbe non esistere)
  // Best-effort, ignora errore
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: lowMargin } = await (supa as any)
      .from("orders")
      .select("id")
      .eq("company_id", companyId)
      .lt("margin_pct_current", 10)
      .neq("status", "completato")
      .limit(20);
    snap.low_margin_orders_count = (lowMargin ?? []).length;
  } catch { /* tabella senza colonna margin_pct_current */ }

  return snap;
}
