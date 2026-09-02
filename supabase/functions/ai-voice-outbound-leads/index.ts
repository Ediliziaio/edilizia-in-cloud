/**
 * ai-voice-outbound-leads — richiamo AI dei lead caldi entro minuti
 *
 * RICABLATO SUL FLUSSO VERO (prima era uno scheletro con provider via env
 * GLOBALE di piattaforma e tabella voice_agent_calls parallela — un provider
 * per tutte le aziende non ha senso in multi-tenant, ed è stato rimosso).
 *
 * Flusso attuale:
 *   1. Cron ogni 5 minuti: trova marketing_opportunities nuove (<30 min)
 *      con contatto telefonabile (no optout_phone/optout_call).
 *   2. Risolve l'AGENTE VOCALE DELL'AZIENDA: ai_agents_v2 attivo, tipo
 *      vocale/campagna, collegato a ElevenLabs e con un numero in
 *      ai_phone_numbers_v2. Niente agente pronto → nessuna proposta
 *      (una proposta ineseguibile è solo rumore).
 *   3. Crea la proposta `make_voice_call_lead` (human-in-loop di default;
 *      auto_execute solo se la policy azienda lo consente — Feature #1).
 *   4. L'ESECUZIONE è in silvio-execute-action → initiate-outbound-call:
 *      DND, orari agente, abbonamento, crediti e billing restano nell'unico
 *      flusso che già li gestisce. Qui non si chiama MAI nessuno.
 *
 * Auth: cron secret via cronAuth condiviso (tutti i nomi noti) o service-role.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";
import { getCorsHeaders } from "../_shared/headers.ts";
import { cronSecretValido } from "../_shared/cronAuth.ts";

const HOT_LEAD_WINDOW_MINUTES = 30; // intercetta lead arrivati negli ultimi 30 min
const MAX_CALLS_PER_RUN = 5;

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST only" }), {
      status: 405,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  // Auth: cron secret (cronAuth condiviso — leggere UN solo nome env è il
  // guasto documentato in cronAuth.ts: 4 funzioni morte 11 giorni) o service-role.
  const authHeader = req.headers.get("Authorization") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "_no_match_";
  const isServiceRole = authHeader === `Bearer ${serviceKey}`;
  if (!cronSecretValido(req) && !isServiceRole) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);
  const t0 = Date.now();

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
    skipped_no_phone: 0,
    skipped_optout: 0,
    skipped_no_agent: 0,
    skipped_existing: 0,
    duration_ms: 0,
  };

  // Cache per run: azienda → agente vocale pronto (id) o null.
  const agentePerAzienda = new Map<string, { id: string; nome: string } | null>();
  async function risolviAgente(companyId: string): Promise<{ id: string; nome: string } | null> {
    if (agentePerAzienda.has(companyId)) return agentePerAzienda.get(companyId)!;
    let pronto: { id: string; nome: string } | null = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: agenti } = await (supabase as any)
      .from("ai_agents_v2")
      .select("id, nome")
      .eq("company_id", companyId)
      .eq("stato", "attivo")
      .in("tipo", ["vocale", "campagna"])
      .not("elevenlabs_agent_id", "is", null)
      .order("creato_il", { ascending: false })
      .limit(5);
    for (const a of (agenti ?? []) as Array<{ id: string; nome: string }>) {
      // Un agente senza numero non può chiamare: verifica ai_phone_numbers_v2.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: phone } = await (supabase as any)
        .from("ai_phone_numbers_v2")
        .select("id")
        .eq("agent_id", a.id)
        .eq("company_id", companyId)
        .limit(1)
        .maybeSingle();
      if (phone) { pronto = a; break; }
    }
    agentePerAzienda.set(companyId, pronto);
    return pronto;
  }

  const adminPerAzienda = new Map<string, string | null>();
  async function adminAzienda(companyId: string): Promise<string | null> {
    if (adminPerAzienda.has(companyId)) return adminPerAzienda.get(companyId)!;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: membri } = await (supabase as any)
      .from("profiles").select("id").eq("company_id", companyId).limit(50);
    const ids = ((membri ?? []) as Array<{ id: string }>).map((m) => m.id);
    let scelto: string | null = null;
    if (ids.length) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: ruoli } = await (supabase as any)
        .from("user_roles").select("user_id, role").in("user_id", ids)
        .in("role", ["company_admin", "company_staff"]);
      const r = (ruoli ?? []) as Array<{ user_id: string; role: string }>;
      scelto = r.find((x) => x.role === "company_admin")?.user_id ?? r[0]?.user_id ?? null;
    }
    adminPerAzienda.set(companyId, scelto);
    return scelto;
  }

  for (const o of (opps ?? []) as Array<Record<string, unknown>>) {
    if (summary.proposals_created >= MAX_CALLS_PER_RUN) break;
    summary.scanned += 1;

    const contactId = o.contact_id as string;
    const companyId = o.company_id as string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: contact } = await (supabase as any)
      .from("marketing_contacts")
      // optout_phone NON esiste: con quella colonna la select falliva, il
      // contatto risultava null e OGNI lead finiva in skipped_no_phone. Il cron
      // girava ogni 5 minuti senza proporre mai una chiamata.
      .select("first_name, last_name, phone, optout_call")
      .eq("id", contactId)
      .maybeSingle();

    if (!contact) {
      summary.skipped_no_phone += 1;
      continue;
    }
    if (contact.optout_call === true) {
      summary.skipped_optout += 1;
      continue;
    }
    const phone = typeof contact.phone === "string" ? contact.phone.replace(/\s/g, "") : "";
    if (!phone || phone.length < 9) {
      summary.skipped_no_phone += 1;
      continue;
    }

    // Agente vocale pronto per QUESTA azienda: senza, la proposta non sarebbe
    // eseguibile — si salta e si conta, l'azienda lo vede nel summary del cron.
    const agente = await risolviAgente(companyId);
    if (!agente) {
      summary.skipped_no_agent += 1;
      continue;
    }

    // Risolvi un admin dell'azienda. user_roles NON ha company_id (e' solo
    // user_id+role): l'appartenenza sta in profiles. Prima la query filtrava
    // su una colonna inesistente e nessuna proposta veniva mai creata.
    const adminUserId = await adminAzienda(companyId);
    if (!adminUserId) continue;

    const contactName = [contact.first_name, contact.last_name].filter(Boolean).join(" ") || "Cliente";
    const oppName = String(o.name ?? "—").slice(0, 80);

    // Crea proposta canonica `make_voice_call_lead` — il payload è ESATTAMENTE
    // ciò che l'handler in silvio-execute-action passa a initiate-outbound-call.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: propId, error: propErr } = await (supabase as any).rpc("create_proactive_proposal", {
      p_company_id: companyId,
      p_user_id: adminUserId,
      p_persona_key: "sales",
      p_action_type: "make_voice_call_lead",
      p_summary: `Agente "${agente.nome}": chiamo ${contactName} (${phone}) per "${oppName}"?`.slice(0, 200),
      p_payload: {
        opportunity_id: o.id,
        contact_id: contactId,
        contact_name: contactName,
        phone,
        opportunity_name: oppName,
        agent_id: agente.id,
        agent_name: agente.nome,
      },
      p_signal_type: "voice_outbound_hot_lead_5min",
      p_signal_entity_id: o.id,
      p_signal_metadata: {
        source: o.source ?? null,
        created_at: o.created_at,
        agent_id: agente.id,
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
  }

  summary.duration_ms = Date.now() - t0;
  return new Response(JSON.stringify(summary, null, 2), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
