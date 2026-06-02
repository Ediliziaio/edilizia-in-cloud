// supabase/functions/platform-lifecycle-cron/index.ts
//
// Cron di PIATTAFORMA (area superadmin). Emette in `automation_trigger_events`
// gli eventi schedulati che non hanno un punto di emissione "event-driven":
//   • PLATFORM_TRIAL_EXPIRING  — trial in scadenza entro N giorni
//   • PLATFORM_AI_CREDITS_LOW  — crediti AI sotto soglia
//   • PLATFORM_INVOICE_OVERDUE — fattura abbonamento scaduta non pagata
//
// Tutti gli eventi vengono scritti con company_id = PLATFORM_ADMIN_COMPANY_ID
// (vedi emitPlatformEvent), così SOLO i flussi del builder admin li ricevono.
// Va schedulato da pg_cron / scheduler con l'header x-internal-cron-secret.
//
// NB: il deploy è fuori scope (ambiente locale). La funzione è pronta all'uso.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getCorsHeaders } from "../_shared/headers.ts";
import { requireInternalSecret } from "../_shared/auth.ts";
import {
  emitPlatformEvent,
  PLATFORM_ADMIN_COMPANY_ID,
  PLATFORM_EVENTS,
} from "../_shared/platformAutomation.ts";

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    requireInternalSecret(req, cors);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Parametri opzionali (default sensati). Le soglie per-flusso restano nel
    // config del trigger; qui usiamo finestre ampie e lasciamo filtrare i flussi.
    let trialDays = 7;
    let creditThreshold = 5;
    try {
      const body = await req.json();
      if (Number.isFinite(body?.trial_days)) trialDays = Number(body.trial_days);
      if (Number.isFinite(body?.credit_threshold)) creditThreshold = Number(body.credit_threshold);
    } catch { /* nessun body: usa i default */ }

    const now = new Date();
    const nowIso = now.toISOString();
    const counts = { trial_expiring: 0, ai_credits_low: 0, invoice_overdue: 0 };

    // ── 1) Trial in scadenza ───────────────────────────────────────────────
    const windowEnd = new Date(now.getTime() + trialDays * 86400000).toISOString();
    const { data: trials } = await supabase
      .from("companies")
      .select("id, name, trial_ends_at, status")
      .eq("status", "trial")
      .gte("trial_ends_at", nowIso)
      .lte("trial_ends_at", windowEnd);
    for (const c of trials ?? []) {
      if (c.id === PLATFORM_ADMIN_COMPANY_ID) continue;
      const giorni = Math.max(
        0,
        Math.ceil((new Date(c.trial_ends_at).getTime() - now.getTime()) / 86400000),
      );
      if (await emitPlatformEvent(supabase, PLATFORM_EVENTS.TRIAL_EXPIRING, {
        entityId: c.id,
        entityType: "company",
        payload: {
          "azienda.id": c.id,
          "azienda.name": c.name,
          "trial.scadenza": c.trial_ends_at,
          "trial.giorni_rimasti": giorni,
        },
      })) counts.trial_expiring++;
    }

    // ── 2) Crediti AI bassi ────────────────────────────────────────────────
    const { data: lowCredits } = await supabase
      .from("ai_credits")
      .select("company_id, balance_eur")
      .lt("balance_eur", creditThreshold);
    const lowIds = Array.from(
      new Set((lowCredits ?? []).map((r: { company_id: string }) => r.company_id).filter(Boolean)),
    ).filter((id) => id !== PLATFORM_ADMIN_COMPANY_ID);
    const nameById: Record<string, string> = {};
    if (lowIds.length > 0) {
      const { data: comps } = await supabase.from("companies").select("id, name").in("id", lowIds);
      for (const c of comps ?? []) nameById[c.id] = c.name;
    }
    for (const r of lowCredits ?? []) {
      if (!r.company_id || r.company_id === PLATFORM_ADMIN_COMPANY_ID) continue;
      if (await emitPlatformEvent(supabase, PLATFORM_EVENTS.AI_CREDITS_LOW, {
        entityId: r.company_id,
        entityType: "company",
        payload: {
          "azienda.id": r.company_id,
          "azienda.name": nameById[r.company_id] ?? null,
          "crediti.saldo": r.balance_eur,
        },
      })) counts.ai_credits_low++;
    }

    // ── 3) Fatture abbonamento scadute ─────────────────────────────────────
    const { data: overdue } = await supabase
      .from("subscription_invoices")
      .select("company_id, amount_due, period_end, status")
      .eq("status", "open")
      .lt("period_end", nowIso);
    for (const inv of overdue ?? []) {
      if (!inv.company_id || inv.company_id === PLATFORM_ADMIN_COMPANY_ID) continue;
      const giorniRitardo = inv.period_end
        ? Math.max(0, Math.floor((now.getTime() - new Date(inv.period_end).getTime()) / 86400000))
        : 0;
      if (await emitPlatformEvent(supabase, PLATFORM_EVENTS.INVOICE_OVERDUE, {
        entityId: inv.company_id,
        entityType: "company",
        payload: {
          "azienda.id": inv.company_id,
          "fattura.importo": typeof inv.amount_due === "number" ? inv.amount_due / 100 : null,
          "fattura.scadenza": inv.period_end,
          "fattura.giorni_ritardo": giorniRitardo,
        },
      })) counts.invoice_overdue++;
    }

    return new Response(JSON.stringify({ ok: true, ...counts }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("platform-lifecycle-cron error:", (err as Error)?.message);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
