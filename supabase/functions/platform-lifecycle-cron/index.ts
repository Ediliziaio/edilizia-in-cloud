import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getCorsHeaders, jsonResponse, errorResponse } from "../_shared/headers.ts";
import { requireInternalSecret } from "../_shared/auth.ts";
import { serveConMetricheRapida } from "../_shared/withMetricsRapida.ts";
import { PLATFORM_ADMIN_COMPANY_ID, PLATFORM_EVENTS } from "../_shared/platformAutomation.ts";
import { platformLifecycleWindows, platformAvailableCredits, platformInvoiceDeadline, platformRows } from "../_shared/platformLifecycle.ts";

serveConMetricheRapida("platform-lifecycle-cron", async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    requireInternalSecret(req, cors);
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const flows = await platformRows((offset, size) => supabase.from("automation_flows").select("id")
      .eq("company_id", PLATFORM_ADMIN_COMPANY_ID).eq("status", "published").is("deleted_at", null).order("id").range(offset, offset + size - 1));
    const counts = { trial_expiring: 0, ai_credits_low: 0, invoice_overdue: 0, invoice_deadline_unknown: 0 };
    if (!flows.length) return jsonResponse({ ok: true, ...counts }, 200, cors);
    const configs: Record<string, any>[] = [];
    for (let i = 0; i < flows.length; i += 100) {
      const nodes = await platformRows((offset, size) => supabase.from("automation_nodes").select("id, config_json")
        .in("flow_id", flows.slice(i, i + 100).map(f => f.id)).eq("node_type", "trigger").order("id").range(offset, offset + size - 1));
      configs.push(...nodes.map(n => n.config_json ?? {}));
    }
    const { trialDays, creditThreshold } = platformLifecycleWindows(configs);
    const creditsEnabled = configs.some(c => ["crediti_ai_bassi", "PLATFORM_AI_CREDITS_LOW"].includes(c.trigger_type ?? c.item_id ?? c.itemId ?? c.trigger_event));
    const invoiceEnabled = configs.some(c => ["fattura_piattaforma_scaduta", "PLATFORM_INVOICE_OVERDUE"].includes(c.trigger_type ?? c.item_id ?? c.itemId ?? c.trigger_event));
    const now = new Date(), nowIso = now.toISOString();
    const day = now.toLocaleDateString("en-CA", { timeZone: "Europe/Rome" });
    const emit = async (event: string, companyId: string, payload: Record<string, unknown>, identity = companyId) => {
      const { error } = await supabase.from("automation_trigger_events").insert({
        company_id: PLATFORM_ADMIN_COMPANY_ID, trigger_event: event, entity_id: companyId, entity_type: "company", payload,
        dedup_key: JSON.stringify(["platform", event, identity, day]),
      });
      if (error?.code === "23505") return false;
      if (error) throw error;
      return true;
    };
    if (trialDays > 0) {
      const trials = await platformRows((offset, size) => supabase.from("companies").select("id, name, trial_ends_at, status")
        .eq("status", "trial").gte("trial_ends_at", nowIso).lte("trial_ends_at", new Date(now.getTime() + trialDays * 86400000).toISOString())
        .order("id").range(offset, offset + size - 1));
      for (const c of trials) {
        if (c.id === PLATFORM_ADMIN_COMPANY_ID) continue;
        if (await emit(PLATFORM_EVENTS.TRIAL_EXPIRING, c.id, {
          "azienda.id": c.id, "azienda.name": c.name, "trial.scadenza": c.trial_ends_at,
          "trial.giorni_rimasti": Math.ceil((Date.parse(c.trial_ends_at) - now.getTime()) / 86400000),
        }, c.id + ":" + c.trial_ends_at)) counts.trial_expiring++;
      }
    }
    if (creditsEnabled) {
      const credits = await platformRows((offset, size) => supabase.from("ai_credits").select("company_id, balance_eur, free_balance_eur, total_available_eur")
        .or(`total_available_eur.lt.${creditThreshold},total_available_eur.is.null`).order("company_id").range(offset, offset + size - 1));
      for (let i = 0; i < credits.length; i += 100) {
        const batch = credits.slice(i, i + 100);
        const { data: companies, error } = await supabase.from("companies").select("id, name").in("id", batch.map(r => r.company_id)).in("status", ["active", "trial", "free"]);
        if (error) throw error;
        const byId = new Map((companies ?? []).map((c: any) => [c.id, c]));
        for (const row of batch) {
          const c: any = byId.get(row.company_id), available = platformAvailableCredits(row);
          if (!c || c.id === PLATFORM_ADMIN_COMPANY_ID || available >= creditThreshold) continue;
          if (await emit(PLATFORM_EVENTS.AI_CREDITS_LOW, c.id, { "azienda.id": c.id, "azienda.name": c.name, "crediti.saldo": available })) counts.ai_credits_low++;
        }
      }
    }
    if (invoiceEnabled) {
      const invoices = await platformRows((offset, size) => supabase.from("subscription_invoices").select("id, company_id, stripe_invoice_id, amount_due, due_date, period_end, status")
        .eq("status", "open").order("id").range(offset, offset + size - 1));
      for (const inv of invoices) {
        const deadline = platformInvoiceDeadline(inv);
        if (inv.company_id === PLATFORM_ADMIN_COMPANY_ID) continue;
        if (!deadline) { counts.invoice_deadline_unknown++; continue; }
        if (Date.parse(deadline) >= now.getTime()) continue;
        if (await emit(PLATFORM_EVENTS.INVOICE_OVERDUE, inv.company_id, {
          "azienda.id": inv.company_id, "fattura.id": inv.id, "fattura.importo": Number(inv.amount_due) / 100,
          "fattura.scadenza": deadline, "fattura.giorni_ritardo": Math.floor((now.getTime() - Date.parse(deadline)) / 86400000),
        }, inv.id + ":" + deadline)) counts.invoice_overdue++;
      }
    }
    return jsonResponse({ ok: true, ...counts }, 200, cors);
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("platform-lifecycle-cron error:", (error as Error)?.message);
    return errorResponse("Errore scansione automazioni piattaforma: controllare i log", 500, cors);
  }
});
