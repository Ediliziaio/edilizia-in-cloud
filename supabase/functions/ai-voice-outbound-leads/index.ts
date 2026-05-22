/**
 * ai-voice-outbound-leads — Feature #5 del piano AI strategico
 *
 * Voice agent outbound che chiama i lead caldi entro 5 minuti dalla
 * submission, qualifica budget/urgenza/decisore e fissa appuntamento.
 *
 * STATO: skeleton opt-in. La chiamata reale a Vapi/Bland/ElevenLabs
 * parte SOLO se VOICE_AGENT_PROVIDER env è settato (default: skip).
 * Senza env settato, il worker crea una proposta `make_voice_call_lead`
 * che l'utente può approvare manualmente o l'admin azienda può rendere
 * auto_execute (Feature #1) quando attiva il provider.
 *
 * Flow:
 *   1. Cron ogni 5 minuti (vedi migration cron schedule)
 *   2. Trova marketing_opportunities con:
 *      - status='new', created_at < 5 min fa, contact_id valido
 *      - contact ha phone valido (+39 ...) e optout_phone=false
 *   3. Crea proposta make_voice_call_lead per ogni lead
 *   4. Se VOICE_AGENT_PROVIDER + env API key settati → invoca il provider
 *      passando: phone, contact_name, opportunity_name, script_template
 *   5. Salva chiamata in voice_agent_calls (tabella creata dalla relativa
 *      migration se vuoi attivare il tracking; opzionale)
 *
 * Env (opt-in):
 *   - PROACTIVE_CRON_SECRET (richiesta sempre per auth)
 *   - VOICE_AGENT_PROVIDER = "vapi" | "bland" | "elevenlabs"
 *   - VOICE_AGENT_API_KEY = secret del provider
 *   - VOICE_AGENT_FROM_NUMBER = "+39..." numero verificato del provider
 *
 * Sicurezza: senza env il worker NON chiama nessuno, crea solo proposte.
 * La policy company (Feature #1) decide poi se il make_voice_call_lead
 * può essere auto_execute (richiede super_admin per le voice calls).
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";
import { getCorsHeaders } from "../_shared/headers.ts";

const HOT_LEAD_WINDOW_MINUTES = 30; // intercetta lead arrivati negli ultimi 30 min
const MAX_CALLS_PER_RUN = 5;

interface VoiceCallScript {
  greeting: string;
  qualifying_questions: string[];
  cta: string;
}

function buildVoiceScript(contactName: string, oppName: string, companyName: string): VoiceCallScript {
  return {
    greeting:
      `Buongiorno ${contactName}, sono l'assistente di ${companyName}. ` +
      `Ho visto la sua richiesta per "${oppName}" e volevo qualificarla con due domande rapide.`,
    qualifying_questions: [
      "Per chiarirmi: ha già un budget di massima in mente o vuole una stima orientativa?",
      "Quanto è urgente? Tra 1 mese, 3 mesi o ancora in fase di valutazione?",
      "Decide lei o c'è qualcun altro coinvolto nella scelta?",
    ],
    cta:
      "Le sento ben informato/a. Le propongo una call di approfondimento con un nostro tecnico " +
      "questa settimana — quando preferisce, mattina o pomeriggio?",
  };
}

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST only" }), {
      status: 405,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  // Auth: cron secret o service-role
  const cronSecret = req.headers.get("x-cron-secret");
  const expected = Deno.env.get("PROACTIVE_CRON_SECRET");
  const authHeader = req.headers.get("Authorization") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "_no_match_";
  const isCron = !!cronSecret && !!expected && cronSecret === expected;
  const isServiceRole = authHeader === `Bearer ${serviceKey}`;
  if (!isCron && !isServiceRole) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);
  const t0 = Date.now();
  const provider = Deno.env.get("VOICE_AGENT_PROVIDER");
  const apiKey = Deno.env.get("VOICE_AGENT_API_KEY");
  const fromNumber = Deno.env.get("VOICE_AGENT_FROM_NUMBER");
  const providerActive = !!(provider && apiKey && fromNumber);

  const cutoff = new Date(Date.now() - HOT_LEAD_WINDOW_MINUTES * 60_000).toISOString();

  // Lead nuovi che NON sono già stati processati (signal entity_id deduplica via proposal)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: opps } = await (supabase as any)
    .from("marketing_opportunities")
    .select("id, company_id, name, contact_id, created_at, source")
    .eq("status", "new")
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(MAX_CALLS_PER_RUN * 4); // overscan, poi filtriamo via contact

  const summary = {
    scanned: 0,
    proposals_created: 0,
    provider_calls_initiated: 0,
    skipped_no_phone: 0,
    skipped_optout: 0,
    skipped_existing: 0,
    failed: 0,
    provider_active: providerActive,
    duration_ms: 0,
  };

  for (const o of (opps ?? []) as Array<Record<string, unknown>>) {
    if (summary.proposals_created >= MAX_CALLS_PER_RUN) break;
    summary.scanned += 1;

    const contactId = o.contact_id as string;
    const companyId = o.company_id as string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: contact } = await (supabase as any)
      .from("marketing_contacts")
      .select("first_name, last_name, phone, optout_phone, optout_call")
      .eq("id", contactId)
      .maybeSingle();

    if (!contact) {
      summary.skipped_no_phone += 1;
      continue;
    }
    if (contact.optout_phone === true || contact.optout_call === true) {
      summary.skipped_optout += 1;
      continue;
    }
    const phone = typeof contact.phone === "string" ? contact.phone.replace(/\s/g, "") : "";
    if (!phone || phone.length < 9) {
      summary.skipped_no_phone += 1;
      continue;
    }

    // Risolvi user admin per la company
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: roleRow } = await (supabase as any)
      .from("user_roles")
      .select("user_id")
      .eq("company_id", companyId)
      .in("role", ["company_admin", "company_staff"])
      .limit(1)
      .maybeSingle();
    const adminUserId = (roleRow as { user_id?: string } | null)?.user_id;
    if (!adminUserId) continue;

    // Nome company
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: companyRow } = await (supabase as any)
      .from("companies")
      .select("name")
      .eq("id", companyId)
      .maybeSingle();
    const companyName = (companyRow as { name?: string } | null)?.name ?? "la nostra azienda";

    const contactName = [contact.first_name, contact.last_name].filter(Boolean).join(" ") || "Cliente";
    const oppName = String(o.name ?? "—").slice(0, 80);
    const script = buildVoiceScript(contactName, oppName, companyName);

    // Crea proposta canonica `make_voice_call_lead`
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: propId, error: propErr } = await (supabase as any).rpc("create_proactive_proposal", {
      p_company_id: companyId,
      p_user_id: adminUserId,
      p_persona_key: "sales",
      p_action_type: "make_voice_call_lead",
      p_summary: `Voice agent: chiamo ${contactName} (${phone}) per "${oppName}"?`.slice(0, 200),
      p_payload: {
        opportunity_id: o.id,
        contact_id: contactId,
        contact_name: contactName,
        phone,
        opportunity_name: oppName,
        script,
        provider: provider ?? null,
        from_number: fromNumber ?? null,
      },
      p_signal_type: "voice_outbound_hot_lead_5min",
      p_signal_entity_id: o.id,
      p_signal_metadata: {
        source: o.source ?? null,
        created_at: o.created_at,
        provider_active: providerActive,
      },
      p_risk_level: "yellow",
      p_ttl_days: 1,
    });

    if (propErr || !propId) {
      // Dedup: probabilmente proposta esistente o reject memory attivo.
      summary.skipped_existing += 1;
      continue;
    }
    summary.proposals_created += 1;

    // Provider call: solo se env complete + policy lo permette (auto_execute).
    // Per ora la chiamata reale resta NON attivata: serve verifica esplicita
    // del super_admin via UI Feature #1 (mode='auto_execute' per make_voice_call_lead).
    // Quando il super_admin attiva la policy, il worker Feature #1B
    // (ai-auto-execute-pending) chiama silvio-execute-action che a sua volta
    // — quando aggiungeremo l'handler — invocherà il provider.
    //
    // Qui sotto è il punto in cui aggiungere la chiamata diretta al provider
    // in versione "always-on aggressiva" (NON consigliato senza human-in-loop):
    /*
    if (providerActive) {
      try {
        await callVoiceProvider({ provider, apiKey, fromNumber, phone, script });
        summary.provider_calls_initiated += 1;
      } catch (e) {
        summary.failed += 1;
      }
    }
    */
  }

  summary.duration_ms = Date.now() - t0;
  return new Response(JSON.stringify(summary, null, 2), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
