// MP03 — process-scheduled-broadcasts (cron ogni 1min)
// Processa broadcasts con scheduled_at ≤ NOW. Rispetta opt-out + rate limit 60/min/numero.
//
// FIX 2026-07 (schema drift + robustezza):
//  • le select usavano colonne INESISTENTI (phone_number, variables) → la
//    query falliva, recipients=null e il broadcast veniva marcato "completed"
//    con 0 invii. Colonna reale: phone; le variabili si risolvono qui dal
//    mapping broadcast.template_variables + dati contatto.
//  • CLAIM ATOMICO per-recipient (pending→sending): prima due tick consecutivi
//    ripescavano gli stessi pending (un lotto da 60 dura ~60s = 1 tick) →
//    stesso destinatario inviato due volte a Meta.
//  • window_start/window_end ora rispettate (prima decorative): fuori
//    finestra il broadcast resta in coda al tick successivo.
//  • opt-out canale-specifico: oltre a opt_out si controllano
//    optout_whatsapp e unsubscribed (GDPR/Meta).
//  • sent_count/failed_count sul broadcast ora aggiornati (prima sempre 0:
//    barra progresso e riepiloghi morti) — ricalcolati con head-count esatti.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/headers.ts";

const MAX_PER_TICK_PER_NUMBER = 60;
const MAX_BROADCASTS_PER_TICK = 5;

function extractJwtRole(authHeader: string): string | null {
  if (!authHeader.startsWith("Bearer ")) return null;
  const jwt = authHeader.substring(7);
  const parts = jwt.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
    return typeof payload.role === "string" ? payload.role : null;
  } catch {
    return null;
  }
}

/** "HH:MM" corrente in Europe/Rome (le finestre orarie sono in ora italiana). */
function nowHHMMRome(): string {
  return new Intl.DateTimeFormat("it-IT", {
    timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(new Date());
}

function withinWindow(start: string | null, end: string | null): boolean {
  if (!start || !end) return true;
  const now = nowHHMMRome();
  const s = start.slice(0, 5);
  const e = end.slice(0, 5);
  // finestra normale (09:00-18:00) o a cavallo di mezzanotte (22:00-06:00)
  return s <= e ? now >= s && now <= e : now >= s || now <= e;
}

/** Risolve il mapping variabili del broadcast sui dati del contatto. */
function resolveVariables(
  mapping: Record<string, unknown> | null,
  contact: { first_name?: string | null; last_name?: string | null; phone?: string | null } | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(mapping ?? {})) {
    const v = String(value ?? "");
    if (v === "nome") out[key] = contact?.first_name ?? "";
    else if (v === "cognome") out[key] = contact?.last_name ?? "";
    else if (v === "telefono") out[key] = contact?.phone ?? "";
    else out[key] = v; // valore letterale
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization") ?? "";
  const cronSecret = req.headers.get("x-cron-secret") ?? "";
  const internalSecret = Deno.env.get("INTERNAL_CRON_SECRET") ?? "";
  const roleClaim = extractJwtRole(authHeader);
  const authorized =
    roleClaim === "service_role" ||
    (internalSecret.length > 0 && cronSecret === internalSecret);
  if (!authorized) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);
  const NOW = new Date();
  const NOW_ISO = NOW.toISOString();

  const { data: broadcasts } = await supabase
    .from("whatsapp_broadcasts")
    .select("*")
    .in("status", ["scheduled", "sending"])
    .lte("scheduled_at", NOW_ISO)
    .limit(MAX_BROADCASTS_PER_TICK);

  let processed = 0;
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  let deferred = 0;

  for (const b of broadcasts ?? []) {
    // Finestra oraria: fuori orario il broadcast resta in coda (prima la
    // finestra era salvata ma mai letta → messaggi anche di notte).
    if (!withinWindow(b.window_start, b.window_end)) {
      deferred++;
      continue;
    }

    if (b.status === "scheduled") {
      await supabase
        .from("whatsapp_broadcasts")
        .update({ status: "sending", started_at: NOW_ISO })
        .eq("id", b.id);
    }

    // 1) candidati pending
    const { data: candidates, error: candErr } = await supabase
      .from("whatsapp_broadcast_recipients")
      .select("id")
      .eq("broadcast_id", b.id)
      .eq("status", "pending")
      .limit(MAX_PER_TICK_PER_NUMBER);
    if (candErr) {
      console.error(`[broadcast ${b.id}] select pending fallita:`, candErr.message);
      continue;
    }

    if (!candidates || candidates.length === 0) {
      // niente pending → ricalcola i contatori e chiudi
      const [sentRes, failedRes] = await Promise.all([
        supabase.from("whatsapp_broadcast_recipients").select("id", { count: "exact", head: true }).eq("broadcast_id", b.id).eq("status", "sent"),
        supabase.from("whatsapp_broadcast_recipients").select("id", { count: "exact", head: true }).eq("broadcast_id", b.id).eq("status", "failed"),
      ]);
      await supabase
        .from("whatsapp_broadcasts")
        .update({
          status: "completed",
          completed_at: NOW_ISO,
          sent_count: sentRes.count ?? 0,
          failed_count: failedRes.count ?? 0,
        })
        .eq("id", b.id);
      continue;
    }

    // 2) CLAIM atomico: pending → sending. Solo le righe effettivamente
    //    claimate vengono inviate; un tick concorrente non le rivede.
    const { data: claimed, error: claimErr } = await supabase
      .from("whatsapp_broadcast_recipients")
      .update({ status: "sending" })
      .in("id", candidates.map((c) => c.id))
      .eq("status", "pending")
      .select("id, contact_id, phone");
    if (claimErr || !claimed || claimed.length === 0) {
      if (claimErr) console.error(`[broadcast ${b.id}] claim fallito:`, claimErr.message);
      continue;
    }

    // 3) dati contatto per opt-out + variabili (un solo roundtrip)
    const contactIds = claimed.filter((r) => r.contact_id).map((r) => r.contact_id as string);
    const { data: contacts } = contactIds.length
      ? await supabase
          .from("marketing_contacts")
          .select("id, first_name, last_name, phone, opt_out, optout_whatsapp, unsubscribed")
          .in("id", contactIds)
      : { data: [] as never[] };
    const contactById = new Map((contacts ?? []).map((c: { id: string }) => [c.id, c]));

    const mapping = (b.template_variables ?? {}) as Record<string, unknown>;

    for (const r of claimed) {
      processed++;

      const contact = r.contact_id ? contactById.get(r.contact_id) : undefined;
      // opt-out ricontrollato al momento dell'invio (anche canale-specifico)
      if (contact && (contact.opt_out || contact.optout_whatsapp || contact.unsubscribed)) {
        await supabase
          .from("whatsapp_broadcast_recipients")
          .update({ status: "skipped_opt_out" })
          .eq("id", r.id);
        skipped++;
        continue;
      }

      try {
        const sendResp = await fetch(
          `${Deno.env.get("SUPABASE_URL")}/functions/v1/whatsapp-send`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${serviceKey}`,
            },
            body: JSON.stringify({
              wa_number_id: b.wa_number_id,
              company_id: b.company_id,
              to: r.phone,
              template: {
                name: b.template_name,
                language: "it",
                variables: resolveVariables(mapping, contact),
              },
            }),
          },
        );

        if (sendResp.ok) {
          await supabase
            .from("whatsapp_broadcast_recipients")
            .update({ status: "sent", sent_at: new Date().toISOString() })
            .eq("id", r.id);
          sent++;
        } else {
          const txt = await sendResp.text();
          await supabase
            .from("whatsapp_broadcast_recipients")
            .update({
              status: "failed",
              error_message: txt.substring(0, 500),
            })
            .eq("id", r.id);
          failed++;
        }
      } catch (e) {
        await supabase
          .from("whatsapp_broadcast_recipients")
          .update({ status: "failed", error_message: String(e).substring(0, 500) })
          .eq("id", r.id);
        failed++;
      }

      // Rate limit: 1 sec tra messaggi
      await new Promise((r) => setTimeout(r, 1000));
    }

    // 4) aggiorna i contatori del broadcast (head-count esatti, race-safe)
    const [sentRes, failedRes] = await Promise.all([
      supabase.from("whatsapp_broadcast_recipients").select("id", { count: "exact", head: true }).eq("broadcast_id", b.id).eq("status", "sent"),
      supabase.from("whatsapp_broadcast_recipients").select("id", { count: "exact", head: true }).eq("broadcast_id", b.id).eq("status", "failed"),
    ]);
    await supabase
      .from("whatsapp_broadcasts")
      .update({ sent_count: sentRes.count ?? 0, failed_count: failedRes.count ?? 0 })
      .eq("id", b.id);
  }

  return new Response(
    JSON.stringify({
      ts: NOW_ISO,
      processed,
      sent,
      failed,
      skipped,
      deferred,
      broadcasts: broadcasts?.length ?? 0,
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
