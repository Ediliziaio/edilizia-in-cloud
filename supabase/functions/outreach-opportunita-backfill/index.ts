/**
 * outreach-opportunita-backfill — operazione UNA TANTUM: applica la stessa
 * logica del flusso live (classifica se manca, poi crea l'opportunità se il
 * segnale vale) allo storico già accumulato, sui due canali. Si invoca una
 * volta sola durante il rollout, non a cron, non da un bottone permanente.
 *
 * A lotti (non un'unica transazione gigante): il volume atteso è modesto
 * (decine, non decine di migliaia — i numeri reali delle campagne sono a una
 * o due cifre di risposte "interessate"), ma il lotto resta comunque buona
 * pratica per poter verificare il risultato invece di doverlo dedurre.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";
import { classifyIntentBatch } from "./classifyIntentBatch.ts";
import { classificaUnaRisposta } from "../_shared/openwa-classifica-una-risposta.ts";
import { triggerOpportunityFromSignal } from "../_shared/outreach-opportunity-trigger.ts";

const PLATFORM_COMPANY = "00000000-0000-0000-0000-000000000001";
const LOTTO = 50;

Deno.serve(async (req) => {
  const corsH = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsH });
  const jsonH = { ...corsH, "Content-Type": "application/json" };

  try {
    const { userId, supabaseAdmin } = await requireAuth(req, corsH);
    await requireRole(supabaseAdmin, userId, ["super_admin"], corsH);
    const admin = supabaseAdmin ?? createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const riepilogo = {
      email_classificate: 0, email_opportunita_create: 0, email_gia_avevano: 0,
      whatsapp_classificati: 0, whatsapp_opportunita_create: 0, whatsapp_gia_avevano: 0,
    };

    // ── Email: risposte senza intent, poi tutte quelle con intent "interested" ──
    riepilogo.email_classificate = await classifyIntentBatch(admin, PLATFORM_COMPANY, LOTTO);

    const { data: interessate } = await admin
      .from("outreach_replies")
      .select("id, contact_id, snippet")
      .eq("company_id", PLATFORM_COMPANY)
      .eq("intent", "interested")
      .not("contact_id", "is", null);
    for (const r of (interessate ?? []) as Array<{ id: string; contact_id: string; snippet: string | null }>) {
      const id = await triggerOpportunityFromSignal(admin, {
        channel: "email", contactId: r.contact_id, sourceRefTable: "outreach_replies", sourceRefId: r.id, snippet: r.snippet,
      });
      if (id) riepilogo.email_opportunita_create++; else riepilogo.email_gia_avevano++;
    }

    // ── WhatsApp: destinatari "risposto" senza esito, poi tutti gli "appuntamento" ──
    const { data: daClassificare } = await admin
      .from("openwa_campagna_destinatari")
      .select("id, contact_id, primo_inviato_at")
      .eq("stato", "risposto")
      .is("esito", null)
      .limit(LOTTO);
    for (const d of (daClassificare ?? []) as Array<{ id: string; contact_id: string; primo_inviato_at: string | null }>) {
      const esito = await classificaUnaRisposta(admin, d);
      if (esito !== "senza_testo" && esito !== "incerto") riepilogo.whatsapp_classificati++;
    }

    const { data: appuntamenti } = await admin
      .from("openwa_campagna_destinatari")
      .select("id, contact_id")
      .eq("esito", "appuntamento")
      .not("contact_id", "is", null);
    for (const d of (appuntamenti ?? []) as Array<{ id: string; contact_id: string }>) {
      const id = await triggerOpportunityFromSignal(admin, {
        channel: "whatsapp", contactId: d.contact_id, sourceRefTable: "openwa_campagna_destinatari", sourceRefId: d.id,
      });
      if (id) riepilogo.whatsapp_opportunita_create++; else riepilogo.whatsapp_gia_avevano++;
    }

    return new Response(JSON.stringify({ ok: true, ...riepilogo }), { headers: jsonH });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[outreach-opportunita-backfill]", e);
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), { status: 500, headers: jsonH });
  }
});
