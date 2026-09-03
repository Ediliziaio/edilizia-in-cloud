/**
 * ai-voice-outbound-leads — richiamo AI dei lead caldi entro minuti
 *
 * RICABLATO SUL FLUSSO VERO (prima era uno scheletro con provider via env
 * GLOBALE di piattaforma e tabella voice_agent_calls parallela — un provider
 * per tutte le aziende non ha senso in multi-tenant, ed è stato rimosso).
 *
 * Vale per TUTTE le aziende, compresa "Platform Admin CRM" dove vivono i lead
 * AEDIX: stesso motore, stesso cancello del consenso, destinatari diversi.
 *
 * Flusso attuale:
 *   1. Cron ogni 5 minuti: trova le marketing_opportunities ancora da lavorare
 *      degli ultimi 7 giorni, dalla più recente, con contatto telefonabile
 *      (no optout_call) e con consenso esplicito a essere richiamato.
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

// Quanto indietro si guarda. Il valore che conta è il primo: un lead chiamato
// entro pochi minuti converte molto più di uno chiamato domani, e l'ordinamento
// dal più recente fa sì che i caldi passino sempre per primi.
//
// La finestra però non può essere di soli 30 minuti: un cron saltato, un agente
// configurato il giorno dopo o un lead arrivato di notte lo perderebbero per
// sempre. Sette giorni è il compromesso — oltre, una telefonata "a proposito
// della richiesta della settimana scorsa" fa più danno che altro.
const FINESTRA_GIORNI = 7;
const MAX_CALLS_PER_RUN = 5;

// Gli stati di un'opportunità ancora da lavorare. "new" NON esisteva: tutte
// nascono `open` (316 su 316 negli ultimi 90 giorni). Con il filtro sbagliato
// la query non tornava MAI una riga e il cron girava a vuoto ogni 5 minuti,
// per tutte le aziende, senza che nulla lo segnalasse.
const STATI_DA_LAVORARE = ["open", "new"];

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

  const cutoff = new Date(Date.now() - FINESTRA_GIORNI * 24 * 60 * 60_000).toISOString();

  // Lead ancora da lavorare, dal più recente. Chi è già stato proposto viene
  // scartato più avanti da create_proactive_proposal (dedup su signal entity),
  // quindi l'overscan serve a raggiungere comunque quelli mai visti.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: opps } = await (supabase as any)
    .from("marketing_opportunities")
    .select("id, company_id, name, contact_id, created_at, source")
    .in("status", STATI_DA_LAVORARE)
    .is("deleted_at", null)
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(60);

  const summary = {
    scanned: 0,
    proposals_created: 0,
    skipped_no_phone: 0,
    skipped_optout: 0,
    skipped_no_consent: 0,
    skipped_no_agent: 0,
    skipped_no_owner: 0,
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

  // Il super admin, letto una volta sola: è il destinatario di riserva quando
  // l'azienda non ha membri propri.
  let superAdminId: string | null | undefined;
  async function unSuperAdmin(): Promise<string | null> {
    if (superAdminId !== undefined) return superAdminId;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from("user_roles").select("user_id").eq("role", "super_admin").limit(1).maybeSingle();
    superAdminId = (data?.user_id as string | undefined) ?? null;
    return superAdminId;
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
    // I lead AEDIX vivono in "Platform Admin CRM", che non ha NESSUN profilo:
    // senza questo ripiego la proposta non aveva a chi andare e ogni lead della
    // piattaforma veniva scartato in silenzio. Il super admin è il titolare di
    // quei lead, quindi è il destinatario giusto, non una toppa.
    if (!scelto) scelto = await unSuperAdmin();
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
      .select("first_name, last_name, phone, optout_call, marketing_consent")
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
    // CONSENSO — il cancello che rende legittima la telefonata.
    //
    // Una voce automatica che chiama senza operatore e' un "sistema
    // automatizzato di chiamata" (art. 130 Codice Privacy): richiede consenso
    // ESPLICITO PREVENTIVO. Non basta l'assenza dal Registro delle Opposizioni,
    // che copre solo le chiamate fatte da una persona.
    //
    // Quindi si chiama SOLO con marketing_consent === true. NULL significa "non
    // lo sappiamo" e vale come no: il lead resta lavorabile a mano dal
    // commerciale, che essendo umano puo' chiamarlo.
    if (contact.marketing_consent !== true) {
      summary.skipped_no_consent += 1;
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
    if (!adminUserId) {
      // Contato invece che ignorato: uno `continue` muto è il motivo per cui i
      // lead della piattaforma sparivano senza lasciare traccia nel riepilogo.
      summary.skipped_no_owner += 1;
      continue;
    }

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
