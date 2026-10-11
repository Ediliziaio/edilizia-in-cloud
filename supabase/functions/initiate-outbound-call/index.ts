import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getPlatformSetting } from "../_shared/getPlatformSetting.ts";
import { saldoVoce, SOGLIA_MINIMA_CHIAMATA_EUR } from "../_shared/voiceCredits.ts";
import { prezzoMinutoVoce } from "../_shared/voicePricing.ts";
import { outboundVoiceRequest } from "../_shared/outboundVoice.ts";
import { agentCompanyAccess } from "../_shared/agentCompanyAccess.ts";
import { normalizeVoicePhone, voiceContactExclusion } from "../_shared/contactVoice.ts";
import { segnalaErroreAI } from "../_shared/allarmeAI.ts";

import { getCorsHeaders } from "../_shared/headers.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json(req, { error: "Unauthorized" }, 401);

    const token = authHeader.replace("Bearer ", "");
    const isServiceCall = token === serviceRoleKey;

    let userId: string | null = null;
    let companyId: string | null = null;

    if (isServiceCall) {
      // Internal call (e.g. from process-automation)
      const body = await req.json();
      const { agent_id, contact_id, phone_number } = body;
      companyId = body.company_id;
      userId = body.user_id || "00000000-0000-0000-0000-000000000000";

      return await handleOutboundCall(req, adminClient, {
        agentId: agent_id,
        contactId: contact_id,
        phoneNumber: phone_number,
        companyId: companyId!,
        userId: userId!,
        skipSubscriptionCheck: body.skip_subscription_check || false,
        dynamicVars: body.dynamic_vars,
        campaignRecipientId: body.campaign_recipient_id,
        campaignClaimToken: body.campaign_claim_token,
      });
    }

    // User auth
    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: { user } } = await anonClient.auth.getUser(token);
    if (!user) return json(req, { error: "Unauthorized" }, 401);

    userId = user.id;

    const body = await req.json();
    const { agent_id, contact_id, phone_number } = body;
    const access = await agentCompanyAccess(adminClient, userId, body.company_id, getCorsHeaders(req));
    companyId = access.companyId;

    return await handleOutboundCall(req, adminClient, {
      agentId: agent_id,
      contactId: contact_id,
      phoneNumber: phone_number,
      companyId: access.companyId,
      userId,
      skipSubscriptionCheck: false,
      dynamicVars: body.dynamic_vars,
    });
  } catch (err: unknown) {
    if (err instanceof Response) return err;
    const message = err instanceof Error ? err.message : "Internal error";
    console.error("initiate-outbound-call error:", message);
    return json(req, { error: message }, 500);
  }
});

interface OutboundCallParams {
  agentId: string;
  contactId?: string;
  phoneNumber?: string;
  companyId: string;
  userId: string;
  skipSubscriptionCheck: boolean;
  dynamicVars?: Record<string, string>;
  campaignRecipientId?: string;
  campaignClaimToken?: string;
}

async function handleOutboundCall(
  req: Request,
  adminClient: SupabaseClient,
  params: OutboundCallParams
) {
  const { agentId, contactId, phoneNumber, companyId, userId, skipSubscriptionCheck, dynamicVars } = params;

  if (typeof companyId !== "string" || !companyId) return json(req, { error: "company_id obbligatorio" }, 400);
  if (!agentId) return json(req, { error: "agent_id obbligatorio" }, 400);
  if (!contactId && !phoneNumber) return json(req, { error: "contact_id o phone_number obbligatorio" }, 400);

  // Get agent — prima il nuovo modello ai_agents_v2 (quello creato dalla UI Agenti AI),
  // fallback al legacy ai_agents. Additivo: nessun cambio di comportamento per gli
  // agenti legacy esistenti.
  type CallAgent = {
    id: string;
    elevenlabs_agent_id: string | null;
    name: string;
    business_hours_enabled?: boolean | null;
    orario_apertura?: string | null;
    orario_chiusura?: string | null;
    giorni_attivi?: number[] | null;
    /** Quanto puo' durare al massimo la telefonata. Si configurava e non lo
     *  leggeva nessuno: v2 la chiama `durata_max_secondi`, il modello legacy
     *  `max_duration`. */
    durataMassimaSecondi?: number | null;
    llmModel?: string | null;
  };
  let agent: CallAgent | null = null;
  let agenteV2 = false;

  const { data: agentV2, error: agentV2Error } = await adminClient
    .from("ai_agents_v2")
    .select("id, elevenlabs_agent_id, nome, durata_max_secondi, stato, llm_model")
    .eq("id", agentId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (agentV2Error) return json(req, { error: "Impossibile verificare l'agente" }, 500);
  if (agentV2) {
    if (agentV2.stato !== "attivo") return json(req, { error: "Attiva l'agente prima di avviare una chiamata" }, 400);
    agent = {
      id: agentV2.id,
      elevenlabs_agent_id: agentV2.elevenlabs_agent_id,
      name: agentV2.nome,
      durataMassimaSecondi: agentV2.durata_max_secondi ?? null,
      llmModel: agentV2.llm_model ?? null,
    };
    agenteV2 = true;
  } else {
    const { data: agentLegacy, error: legacyError } = await adminClient
      .from("ai_agents")
      .select("id, elevenlabs_agent_id, name, status, business_hours_enabled, orario_apertura, orario_chiusura, giorni_attivi, max_duration, llm_model")
      .eq("id", agentId)
      .eq("company_id", companyId)
      .maybeSingle();
    if (legacyError) return json(req, { error: "Impossibile verificare l'agente legacy" }, 500);
    if (agentLegacy && agentLegacy.status !== "active") return json(req, { error: "Attiva l'agente prima di avviare una chiamata" }, 400);
    agent = agentLegacy as CallAgent | null;
    if (agent && agentLegacy) {
      agent.durataMassimaSecondi =
        (agentLegacy as { max_duration?: number | null }).max_duration ?? null;
      agent.llmModel = agentLegacy.llm_model ?? null;
    }
  }

  if (!agent) return json(req, { error: "Agente non trovato" }, 404);
  if (!agent.elevenlabs_agent_id) return json(req, { error: "Agente non configurato su ElevenLabs" }, 400);

  // Business hours check (Italian timezone)
  if (agent.business_hours_enabled) {
    const nowIT = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Rome" }));
    const dayIT = nowIT.getDay(); // 0=domenica
    const timeNow = nowIT.getHours() * 60 + nowIT.getMinutes();
    const activeDays: number[] = agent.giorni_attivi ?? [1, 2, 3, 4, 5];
    if (!activeDays.includes(dayIT)) {
      return json(req, { error: "Fuori dagli orari di disponibilità (giorno non attivo)" }, 403);
    }
    const [openH, openM] = (agent.orario_apertura ?? "08:00:00").split(":").map(Number);
    const [closeH, closeM] = (agent.orario_chiusura ?? "20:00:00").split(":").map(Number);
    const openMin = openH * 60 + openM;
    const closeMin = closeH * 60 + closeM;
    if (timeNow < openMin || timeNow >= closeMin) {
      return json(req, { error: `Fuori dagli orari di disponibilità (${agent.orario_apertura?.slice(0, 5)}–${agent.orario_chiusura?.slice(0, 5)})` }, 403);
    }
  }

  // Resolve phone number
  let targetPhone = phoneNumber;
  let targetContactId = contactId;

  if (contactId) {
    const { data: contact, error: contactError } = await adminClient
      .from("marketing_contacts")
      .select("id, phone, optout_call, opt_out, deleted_at, ricontatta_dopo, marketing_consent")
      .eq("id", contactId)
      .eq("company_id", companyId)
      .maybeSingle();

    if (contactError) return json(req, { error: "Impossibile verificare il contatto" }, 500);
    if (!contact) return json(req, { error: "Contatto non trovato" }, 404);
    const excluded = voiceContactExclusion(contact, !!params.campaignRecipientId);
    if (excluded) return json(req, { error: excluded, contact_excluded: true }, 403);

    targetPhone = contact.phone;
    targetContactId = contact.id;
  }

  const normalizedPhone = normalizeVoicePhone(targetPhone);
  if (!normalizedPhone) {
    return json(req, { error: "Numero di telefono non valido: usa il prefisso internazionale (es. +39)." }, 400);
  }
  targetPhone = normalizedPhone;

  // Gate funzionalita'. Prima si guardava ai_subscriptions, tabella del vecchio
  // modulo AI che in produzione e' VUOTA: ogni utente non super_admin riceveva
  // "Abbonamento AI non attivo" e le chiamate in uscita erano impossibili per
  // costruzione. La fonte di verita' e' il feature gating dei piani
  // (resolve_company_feature), la stessa usata dalla UI per mostrare l'area.
  if (!skipSubscriptionCheck) {
    const { data: roleData } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "super_admin")
      .maybeSingle();

    if (!roleData) {
      const { data: feat, error: featErr } = await adminClient.rpc("resolve_company_feature", {
        p_company_id: companyId,
        p_feature_key: "ai_agents",
      });
      const abilitata = Array.isArray(feat) ? feat[0]?.is_enabled === true : (feat as { is_enabled?: boolean } | null)?.is_enabled === true;
      if (featErr) console.error("[OUTBOUND] resolve_company_feature:", featErr.message);
      if (!abilitata) {
        return json(req, { error: "Gli agenti vocali AI non sono inclusi nel piano di questa azienda." }, 403);
      }
    }
  }

  // Crediti: saldo spendibile (ricarica + omaggio) e soglia unica per tutti i flussi.
  const saldo = await saldoVoce(adminClient, companyId);
  if (saldo.bloccato) {
    return json(req, {
      error: saldo.motivo === "insufficient_balance"
        ? `Crediti AI insufficienti (saldo ${saldo.spendibile.toFixed(2)} €, minimo ${SOGLIA_MINIMA_CHIAMATA_EUR.toFixed(2)} €).`
        : "Chiamate AI bloccate: credito esaurito.",
    }, 402);
  }

  // Il credito deve coprire la telefonata PIU' LUNGA che l'agente puo' fare.
  //
  // La soglia sopra chiede un minuto pagato, e basta: con dieci centesimi di
  // saldo partiva una chiamata che l'agente puo' tenere aperta quanto vuole —
  // il campo «durata massima» si configurava e non lo leggeva nessuno. Alla
  // fine si addebita tutto e il saldo resta negativo, cioe' la piattaforma ha
  // fatto credito senza deciderlo.
  //
  // Il tetto e' quello dell'agente; la tariffa e' la stessa che usa il conteggio
  // dopo la chiamata, quindi le due cifre parlano la stessa lingua.
  if (agent.durataMassimaSecondi && agent.durataMassimaSecondi > 0) {
    const tariffa = await prezzoMinutoVoce(adminClient, companyId, agent.llmModel, null);
    const minutiMax = agent.durataMassimaSecondi / 60;
    const costoMassimo = Number((minutiMax * tariffa.prezzoPerMin).toFixed(2));
    if (saldo.spendibile < costoMassimo) {
      return json(req, {
        error:
          `Crediti insufficienti per una chiamata intera: «${agent.name}» puo' parlare fino a ` +
          `${Math.round(agent.durataMassimaSecondi / 60)} minuti, che costano fino a ` +
          `${costoMassimo.toFixed(2)} €, e il saldo e' ${saldo.spendibile.toFixed(2)} €. ` +
          `Ricarica, oppure abbassa la durata massima dell'agente.`,
        saldo_eur: saldo.spendibile,
        costo_massimo_eur: costoMassimo,
        durata_massima_secondi: agent.durataMassimaSecondi,
      }, 402);
    }
  }

  // Get ElevenLabs API key
  const elevenLabsApiKey = await getPlatformSetting("elevenlabs_api_key", "ELEVENLABS_API_KEY");
  if (!elevenLabsApiKey) return json(req, { error: "ElevenLabs API key non configurata" }, 500);

  // Get phone number config — prima ai_phone_numbers_v2 (nuovo modello), fallback al
  // legacy ai_agent_phone_numbers. Si usa l'ID numero ElevenLabs (Telnyx-linked).
  let elPhoneId: string | null = null;
  let phoneProvider = "telnyx";

  const { data: phoneV2, error: phoneV2Error } = await adminClient
    .from("ai_phone_numbers_v2")
    .select("elevenlabs_phone_id, provider")
    .eq("agent_id", agentId)
    .eq("company_id", companyId)
    .eq("attivo", true)
    .not("elevenlabs_phone_id", "is", null)
    .limit(1)
    .maybeSingle();
  if (phoneV2Error) return json(req, { error: "Impossibile verificare il numero dell'agente" }, 500);
  if (phoneV2?.elevenlabs_phone_id) {
    elPhoneId = phoneV2.elevenlabs_phone_id;
    phoneProvider = phoneV2.provider || "telnyx";
  } else {
    const { data: phoneConfig, error: phoneError } = await adminClient
      .from("ai_agent_phone_numbers")
      .select("elevenlabs_phone_id, elevenlabs_phone_number_id, provider")
      .eq("agent_id", agentId)
      .eq("company_id", companyId)
      .limit(1)
      .maybeSingle();
    if (phoneError) return json(req, { error: "Impossibile verificare il numero dell'agente" }, 500);
    elPhoneId = phoneConfig?.elevenlabs_phone_number_id || phoneConfig?.elevenlabs_phone_id || null;
    phoneProvider = phoneConfig?.provider || "twilio";
  }

  if (!elPhoneId) {
    return json(req, { error: "Nessun numero di telefono configurato per questo agente." }, 400);
  }

  const { url: outboundUrl, payload: elPayload } = outboundVoiceRequest(phoneProvider, agent.elevenlabs_agent_id, elPhoneId, targetPhone, dynamicVars);
  if (params.campaignRecipientId) {
    const { data: begun, error: beginError } = await adminClient.rpc("begin_voice_campaign_call" as never, {
      p_company_id: companyId, p_recipient_id: params.campaignRecipientId, p_token: params.campaignClaimToken,
      p_agent_id: agentId, p_contact_id: targetContactId,
    } as never);
    if (beginError || begun !== true) {
      const { data: queue } = await adminClient.from("ai_campaign_contacts").select("stato")
        .eq("id", params.campaignRecipientId).maybeSingle();
      return json(req, { error: "Campagna in pausa, fuori orario o tentativo già preso in carico",
        outcome_unknown: queue?.stato === "in_chiamata" }, 409);
    }
  }

  // Initiate via the configured provider (with 429 retry, max 3 attempts).
  let callRes: Response | null = null;
  let callData: Record<string, unknown> = {};
  const MAX_ATTEMPTS = 3;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try { callRes = await fetch(outboundUrl, {
      method: "POST",
      signal: AbortSignal.timeout(30_000),
      headers: {
        "xi-api-key": elevenLabsApiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(elPayload),
    }); } catch (error) {
      segnalaErroreAI(error, { funzione: "initiate-outbound-call", companyId, modello: agent.llmModel || undefined });
      // No retry after an ambiguous network outcome: a call may already have started.
      return json(req, { error: "Esito della chiamata non verificabile. Controlla le conversazioni prima di riprovare.", outcome_unknown: true }, 502);
    }
    callData = await callRes.json().catch(() => ({}));

    if (callRes.status !== 429) break;

    if (attempt < MAX_ATTEMPTS) {
      console.warn(`[OUTBOUND] Rate limit 429 — retry ${attempt}/${MAX_ATTEMPTS - 1} in 2s`);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  if (!callRes!.ok) {
    segnalaErroreAI({ provider: "elevenlabs", stato: callRes!.status, messaggio: JSON.stringify(callData) }, { funzione: "initiate-outbound-call", companyId });
    console.error("[OUTBOUND] ElevenLabs error:", callData);
    return json(req, { error: (callData as any)?.detail?.message || (callData as any)?.detail || "Errore ElevenLabs" }, callRes!.status);
  }
  if (callData.success === false || (callData.success !== true && !callData.conversation_id)) {
    segnalaErroreAI({ provider: "elevenlabs", stato: 502, messaggio: "Avvio outbound non confermato" }, { funzione: "initiate-outbound-call", companyId });
    return json(req, { error: "Il provider non ha confermato l'avvio della chiamata." }, 502);
  }

  // Save conversation record. Per gli agenti v2 la FK e' agent_v2_id: prima
  // si scriveva agent_id (FK su ai_agents v1) e l'insert falliva in silenzio —
  // il webhook post-call non trovava il segnaposto e perdeva contatto,
  // telefono e chi aveva avviato la chiamata.
  const { error: convErr } = await adminClient.from("ai_agent_conversations").insert({
    ...(agenteV2 ? { agent_v2_id: agent.id } : { agent_id: agent.id }),
    company_id: companyId,
    contact_id: targetContactId || null,
    elevenlabs_conversation_id: callData.conversation_id || null,
    call_direction: "outbound",
    status: "in_progress",
    duration_seconds: 0,
    messages_count: 0,
    metadata: { outbound: true, call_direction: "outbound", phone: targetPhone, initiated_by: userId, provider: phoneProvider,
      ...(params.campaignRecipientId ? { campaign_recipient_id: params.campaignRecipientId, campaign_claim_token: params.campaignClaimToken } : {}) },
  });
  if (convErr) console.error("[OUTBOUND] segnaposto conversazione NON salvato:", convErr.message);

  // Audit log
  await adminClient.from("ai_agent_audit_log").insert({
    company_id: companyId,
    agent_id: agent.id,
    user_id: userId,
    action: "outbound_call_initiated",
    details: {
      contact_id: targetContactId,
      phone: targetPhone,
      elevenlabs_conversation_id: callData.conversation_id,
      provider: phoneProvider,
    },
  });

  return json(req, {
    success: true,
    conversation_id: callData.conversation_id,
    message: `Chiamata in uscita avviata verso ${targetPhone}`,
  });
}

function json(req: Request, data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });
}
