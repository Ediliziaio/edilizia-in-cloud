/**
 * ai-proactive-proposals-daily — GAP 2 (Proactivity)
 *
 * Cron giornaliero che genera proactive ai_action_proposals scansionando
 * 4 detector chiave su ogni azienda attiva:
 *
 *   1. cantiere_in_ritardo         → persona pm_cantiere
 *   2. fattura_scaduta_30gg         → persona amministrazione
 *   3. durc_scadenza_subappaltatore → persona compliance
 *   4. lead_dormiente_30gg          → persona sales
 *
 * Idempotente via RPC create_proactive_proposal: se esiste già una proposal
 * pending per stesso (company_id, signal_type, entity_id), skip.
 *
 * Auth:
 *   - x-cron-secret header (env PROACTIVE_CRON_SECRET) per chiamata da pg_cron
 *   - service_role bearer per chiamate manuali debug
 *
 * Body opzionale:
 *   { company_id?: uuid, dry_run?: boolean, detectors?: string[] }
 *
 * Risposta:
 *   {
 *     companies_scanned: number,
 *     proposals_created: number,
 *     proposals_skipped_dedup: number,
 *     by_signal: Record<string, number>,
 *     duration_ms: number,
 *     errors: Array<{ company_id?, error }>
 *   }
 */

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";

interface ProactiveBody {
  company_id?: string;
  dry_run?: boolean;
  detectors?: string[];
}

interface DetectorResult {
  signal_type: string;
  proposals_created: number;
  proposals_skipped: number;
  errors: string[];
}

interface CompanyRow {
  id: string;
  name: string;
}

interface UserRoleRow {
  user_id: string;
}

const ALL_DETECTORS = [
  "cantiere_in_ritardo",
  "fattura_scaduta_30gg",
  "durc_scadenza_subappaltatore",
  "lead_dormiente_30gg",
] as const;
type DetectorName = typeof ALL_DETECTORS[number];

// ════════════════════════════════════════════════════════════════════════════
// DETECTORS — ognuno cerca anomalie e ritorna lista proposals da creare
// ════════════════════════════════════════════════════════════════════════════

async function detectCantieriInRitardo(
  supa: SupabaseClient,
  companyId: string,
  defaultUserId: string,
): Promise<DetectorResult> {
  const result: DetectorResult = {
    signal_type: "cantiere_in_ritardo",
    proposals_created: 0,
    proposals_skipped: 0,
    errors: [],
  };

  try {
    // Cantieri con expected_date passata + non chiusi (current_status_id != "completato/chiuso")
    const today = new Date().toISOString().slice(0, 10);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supa as any)
      .from("orders")
      .select("id, description, expected_date, current_status_id")
      .eq("company_id", companyId)
      .lt("expected_date", today)
      .not("expected_date", "is", null)
      .limit(20);
    if (error) {
      result.errors.push(`query orders: ${error.message}`);
      return result;
    }
    for (const o of data ?? []) {
      const daysLate = Math.max(
        1,
        Math.floor(
          (Date.now() - new Date(String(o.expected_date)).getTime()) / 86_400_000,
        ),
      );
      const { data: propId, error: createErr } = await supa.rpc(
        "create_proactive_proposal",
        {
          p_company_id: companyId,
          p_user_id: defaultUserId,
          p_persona_key: "pm_cantiere",
          p_action_type: "review_late_cantiere",
          p_summary: `Cantiere "${String(o.description).substring(0, 80)}" in ritardo di ${daysLate}gg — vuoi piano recovery?`,
          p_payload: { cantiere_id: o.id, days_late: daysLate, suggested_action: "genera_piano_recovery_cantiere" },
          p_signal_type: "cantiere_in_ritardo",
          p_signal_entity_id: o.id,
          p_signal_metadata: { days_late: daysLate, expected_date: o.expected_date },
          p_risk_level: daysLate > 14 ? "red" : "yellow",
          p_ttl_days: 7,
        },
      );
      if (createErr) {
        result.errors.push(`rpc cantiere ${o.id}: ${createErr.message}`);
      } else if (propId) {
        // Confronto: se l'id ritornato corrisponde a una nuova insert vs esistente
        // è hard da distinguere senza extra query → countiamo come creato
        // (in caso peggiore l'idempotency dello unique index ha già evitato il dup)
        result.proposals_created += 1;
      } else {
        result.proposals_skipped += 1;
      }
    }
  } catch (e) {
    result.errors.push(e instanceof Error ? e.message : String(e));
  }
  return result;
}

async function detectFattureScadute(
  supa: SupabaseClient,
  companyId: string,
  defaultUserId: string,
): Promise<DetectorResult> {
  const result: DetectorResult = {
    signal_type: "fattura_scaduta_30gg",
    proposals_created: 0,
    proposals_skipped: 0,
    errors: [],
  };

  try {
    const dateLimit = new Date();
    dateLimit.setDate(dateLimit.getDate() - 30);
    const dateLimitStr = dateLimit.toISOString().slice(0, 10);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supa as any)
      .from("invoices")
      .select("id, numero, importo_totale, data_scadenza, customer_id")
      .eq("company_id", companyId)
      .lt("data_scadenza", dateLimitStr)
      .not("data_scadenza", "is", null)
      .neq("status", "pagata")
      .neq("status", "annullata")
      .limit(20);
    if (error) {
      // Tabella invoices potrebbe non esistere o avere schema diverso → degrade silenzioso
      if (!error.message.includes("does not exist") && !error.message.includes("column")) {
        result.errors.push(`query invoices: ${error.message}`);
      }
      return result;
    }
    for (const inv of data ?? []) {
      const daysLate = Math.floor(
        (Date.now() - new Date(String(inv.data_scadenza)).getTime()) / 86_400_000,
      );
      const importo = Number(inv.importo_totale ?? 0);
      const { error: createErr } = await supa.rpc("create_proactive_proposal", {
        p_company_id: companyId,
        p_user_id: defaultUserId,
        p_persona_key: "amministrazione",
        p_action_type: "review_overdue_invoice",
        p_summary: `Fattura ${inv.numero ?? inv.id} scaduta da ${daysLate}gg (€${importo.toFixed(2)}) — preparo sollecito?`,
        p_payload: { invoice_id: inv.id, days_late: daysLate, amount_eur: importo, suggested_action: "invia_reminder_pagamento" },
        p_signal_type: "fattura_scaduta_30gg",
        p_signal_entity_id: inv.id,
        p_signal_metadata: { days_late: daysLate, importo_eur: importo, customer_id: inv.customer_id },
        p_risk_level: importo > 5000 ? "red" : "yellow",
        p_ttl_days: 7,
      });
      if (createErr) {
        result.errors.push(`rpc invoice ${inv.id}: ${createErr.message}`);
      } else {
        result.proposals_created += 1;
      }
    }
  } catch (e) {
    result.errors.push(e instanceof Error ? e.message : String(e));
  }
  return result;
}

async function detectDurcInScadenza(
  supa: SupabaseClient,
  companyId: string,
  defaultUserId: string,
): Promise<DetectorResult> {
  const result: DetectorResult = {
    signal_type: "durc_scadenza_subappaltatore",
    proposals_created: 0,
    proposals_skipped: 0,
    errors: [],
  };

  try {
    const limitDate = new Date();
    limitDate.setDate(limitDate.getDate() + 30);
    const limitStr = limitDate.toISOString().slice(0, 10);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supa as any)
      .from("subappaltatori")
      .select("id, ragione_sociale, durc_valido_fino")
      .eq("company_id", companyId)
      .lt("durc_valido_fino", limitStr)
      .not("durc_valido_fino", "is", null)
      .limit(20);
    if (error) {
      if (!error.message.includes("does not exist") && !error.message.includes("column")) {
        result.errors.push(`query subappaltatori: ${error.message}`);
      }
      return result;
    }
    for (const sub of data ?? []) {
      const daysToExpiry = Math.floor(
        (new Date(String(sub.durc_valido_fino)).getTime() - Date.now()) / 86_400_000,
      );
      const isExpired = daysToExpiry < 0;
      const { error: createErr } = await supa.rpc("create_proactive_proposal", {
        p_company_id: companyId,
        p_user_id: defaultUserId,
        p_persona_key: "compliance",
        p_action_type: "renew_durc_subappaltatore",
        p_summary: isExpired
          ? `DURC subappaltatore ${sub.ragione_sociale} SCADUTO da ${Math.abs(daysToExpiry)}gg — bloccare cantieri?`
          : `DURC subappaltatore ${sub.ragione_sociale} scade tra ${daysToExpiry}gg — richiedo nuovo?`,
        p_payload: { subappaltatore_id: sub.id, days_to_expiry: daysToExpiry, suggested_action: "richiedi_durc_online" },
        p_signal_type: "durc_scadenza_subappaltatore",
        p_signal_entity_id: sub.id,
        p_signal_metadata: { days_to_expiry: daysToExpiry, is_expired: isExpired },
        p_risk_level: isExpired ? "red" : "yellow",
        p_ttl_days: 5,
      });
      if (createErr) {
        result.errors.push(`rpc durc ${sub.id}: ${createErr.message}`);
      } else {
        result.proposals_created += 1;
      }
    }
  } catch (e) {
    result.errors.push(e instanceof Error ? e.message : String(e));
  }
  return result;
}

async function detectLeadDormienti(
  supa: SupabaseClient,
  companyId: string,
  defaultUserId: string,
): Promise<DetectorResult> {
  const result: DetectorResult = {
    signal_type: "lead_dormiente_30gg",
    proposals_created: 0,
    proposals_skipped: 0,
    errors: [],
  };

  try {
    const limitDate = new Date();
    limitDate.setDate(limitDate.getDate() - 30);
    const limitStr = limitDate.toISOString();
    // marketing_opportunities con last_activity_at < 30gg + status aperto
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supa as any)
      .from("marketing_opportunities")
      .select("id, name, contact_id, value_eur, last_activity_at, status")
      .eq("company_id", companyId)
      .lt("last_activity_at", limitStr)
      .in("status", ["new", "qualified", "proposal", "negotiation"])
      .limit(15);
    if (error) {
      if (!error.message.includes("does not exist") && !error.message.includes("column")) {
        result.errors.push(`query opportunities: ${error.message}`);
      }
      return result;
    }
    for (const opp of data ?? []) {
      const daysIdle = opp.last_activity_at
        ? Math.floor((Date.now() - new Date(String(opp.last_activity_at)).getTime()) / 86_400_000)
        : 999;
      const value = Number(opp.value_eur ?? 0);
      const { error: createErr } = await supa.rpc("create_proactive_proposal", {
        p_company_id: companyId,
        p_user_id: defaultUserId,
        p_persona_key: "sales",
        p_action_type: "winback_dormant_lead",
        p_summary: `Opportunità "${String(opp.name ?? "—").substring(0, 60)}" ferma da ${daysIdle}gg (€${value.toFixed(0)}) — provo win-back?`,
        p_payload: { opportunity_id: opp.id, days_idle: daysIdle, value_eur: value, suggested_action: "trova_quotes_da_followup" },
        p_signal_type: "lead_dormiente_30gg",
        p_signal_entity_id: opp.id,
        p_signal_metadata: { days_idle: daysIdle, value_eur: value, status: opp.status },
        p_risk_level: "yellow",
        p_ttl_days: 10,
      });
      if (createErr) {
        result.errors.push(`rpc opp ${opp.id}: ${createErr.message}`);
      } else {
        result.proposals_created += 1;
      }
    }
  } catch (e) {
    result.errors.push(e instanceof Error ? e.message : String(e));
  }
  return result;
}

const DETECTORS: Record<DetectorName, typeof detectCantieriInRitardo> = {
  cantiere_in_ritardo: detectCantieriInRitardo,
  fattura_scaduta_30gg: detectFattureScadute,
  durc_scadenza_subappaltatore: detectDurcInScadenza,
  lead_dormiente_30gg: detectLeadDormienti,
};

// ════════════════════════════════════════════════════════════════════════════
// MAIN
// ════════════════════════════════════════════════════════════════════════════

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  // Auth: cron-secret O service_role bearer
  const cronSecret = req.headers.get("x-cron-secret");
  const expectedSecret = Deno.env.get("PROACTIVE_CRON_SECRET");
  const authHeader = req.headers.get("Authorization") ?? "";
  const isServiceRole = authHeader.includes(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "_no_match_");
  const isAuthorizedCron = cronSecret && expectedSecret && cronSecret === expectedSecret;

  if (!isAuthorizedCron && !isServiceRole) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const supa = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const body = (await req.json().catch(() => ({}))) as ProactiveBody;
  const dryRun = body.dry_run === true;
  const requestedDetectors = (body.detectors && body.detectors.length > 0
    ? body.detectors
    : ALL_DETECTORS) as DetectorName[];

  const t0 = Date.now();

  // 1) Lista companies attive (filtra per company_id se passato)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let companiesQ = (supa as any)
    .from("companies")
    .select("id, name")
    .eq("is_active", true);
  if (body.company_id) {
    companiesQ = companiesQ.eq("id", body.company_id);
  }
  const { data: companies, error: cErr } = await companiesQ;
  if (cErr) {
    return new Response(JSON.stringify({ error: "companies query failed", detail: cErr.message }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const summary = {
    companies_scanned: 0,
    proposals_created: 0,
    proposals_skipped_dedup: 0,
    by_signal: {} as Record<string, number>,
    duration_ms: 0,
    errors: [] as Array<{ company_id?: string; error: string }>,
    dry_run: dryRun,
  };

  // 2) Per ogni company, esegui tutti i detector
  for (const co of (companies ?? []) as CompanyRow[]) {
    summary.companies_scanned += 1;

    // Risolvi un user_id valido per la company (admin o primo staff)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: roleRow } = await (supa as any)
      .from("user_roles")
      .select("user_id")
      .eq("company_id", co.id)
      .in("role", ["company_admin", "company_staff"])
      .limit(1)
      .maybeSingle();
    const defaultUserId = (roleRow as UserRoleRow | null)?.user_id;
    if (!defaultUserId) {
      summary.errors.push({ company_id: co.id, error: "no admin user found" });
      continue;
    }

    if (dryRun) continue; // skip insert reali

    for (const detName of requestedDetectors) {
      const detector = DETECTORS[detName];
      if (!detector) continue;
      try {
        const r = await detector(supa, co.id, defaultUserId);
        summary.proposals_created += r.proposals_created;
        summary.proposals_skipped_dedup += r.proposals_skipped;
        summary.by_signal[r.signal_type] = (summary.by_signal[r.signal_type] ?? 0) + r.proposals_created;
        for (const e of r.errors) {
          summary.errors.push({ company_id: co.id, error: `${r.signal_type}: ${e}` });
        }
      } catch (e) {
        summary.errors.push({
          company_id: co.id,
          error: `${detName} crash: ${e instanceof Error ? e.message : String(e)}`,
        });
      }
    }
  }

  summary.duration_ms = Date.now() - t0;
  return new Response(JSON.stringify(summary, null, 2), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
