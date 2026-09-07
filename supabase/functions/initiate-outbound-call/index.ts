import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getPlatformSetting } from "../_shared/getPlatformSetting.ts";
import { saldoVoce, SOGLIA_MINIMA_CHIAMATA_EUR } from "../_shared/voiceCredits.ts";
import { prezzoMinutoVoce } from "../_shared/voicePricing.ts";

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
      });
    }

    // User auth
    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: { user } } = await anonClient.auth.getUser(token);
    if (!user) return json(req, { error: "Unauthorized" }, 401);

    userId = user.id;

    const { data: profile } = await adminClient
      .from("profiles")
      .select("company_id")
      .eq("id", userId)
      .single();

    if (!profile?.company_id) return json(req, { error: "No company" }, 400);
    companyId = profile.company_id;

    const body = await req.json();
    const { agent_id, contact_id, phone_number } = body;

    return await handleOutboundCall(req, adminClient, {
      agentId: agent_id,
      contactId: contact_id,
      phoneNumber: phone_number,
      companyId,
      userId,
      skipSubscriptionCheck: false,
      dynamicVars: body.dynamic_vars,
    });
  } catch (err: unknown) {
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
}

async function handleOutboundCall(
  req: Request,
  adminClient: ReturnType<typeof createClient>,
  params: OutboundCallParams
) {
  const { agentId, contactId, phoneNumber, companyId, userId, skipSubscriptionCheck, dynamicVars } = params;

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
  };
  let agent: CallAgent | null = null;
  let agenteV2 = false;

  const { data: agentV2 } = await adminClient
    .from("ai_agents_v2")
    .select("id, elevenlabs_agent_id, nome, durata_max_secondi")
    .eq("id", agentId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (agentV2) {
    agent = {
      id: agentV2.id,
      elevenlabs_agent_id: agentV2.elevenlabs_agent_id,
      name: agentV2.nome,
      durataMassimaSecondi: agentV2.durata_max_secondi ?? null,
    };
    agenteV2 = true;
  } else {
    const { data: agentLegacy } = await adminClient
      .from("ai_agents")
      .select("id, elevenlabs_agent_id, name, business_hours_enabled, orario_apertura, orario_chiusura, giorni_attivi, max_duration")
      .eq("id", agentId)
      .eq("company_id", companyId)
      .maybeSingle();
    agent = agentLegacy as CallAgent | null;
    if (agent && agentLegacy) {
      agent.durataMassimaSecondi =
        (agentLegacy as { max_duration?: number | null }).max_duration ?? null;
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
    const { data: contact } = await adminClient
      .from("marketing_contacts")
      .select("id, phone, optout_call")
      .eq("id", contactId)
      .eq("company_id", companyId)
      .single();

    if (!contact) return json(req, { error: "Contatto non trovato" }, 404);
    if (contact.optout_call) return json(req, { error: "Contatto in DND per chiamate." }, 403);
    if (!contact.phone) return json(req, { error: "Contatto senza numero di telefono" }, 400);

    targetPhone = contact.phone;
    targetContactId = contact.id;
  }

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
    // Il client qui e' quello permissivo delle edge function: il cast tiene
    // buono il generico dell'aiutante condiviso.
    const tariffa = await prezzoMinutoVoce(adminClient as never, companyId, null, null);
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

  const { data: phoneV2 } = await adminClient
    .from("ai_phone_numbers_v2")
    .select("elevenlabs_phone_id")
    .eq("agent_id", agentId)
    .eq("company_id", companyId)
    .limit(1)
    .maybeSingle();
  if (phoneV2?.elevenlabs_phone_id) {
    elPhoneId = phoneV2.elevenlabs_phone_id;
  } else {
    const { data: phoneConfig } = await adminClient
      .from("ai_agent_phone_numbers")
      .select("elevenlabs_phone_id, elevenlabs_phone_number_id")
      .eq("agent_id", agentId)
      .eq("company_id", companyId)
      .limit(1)
      .maybeSingle();
    elPhoneId = phoneConfig?.elevenlabs_phone_number_id || phoneConfig?.elevenlabs_phone_id || null;
  }

  if (!elPhoneId) {
    return json(req, { error: "Nessun numero di telefono configurato per questo agente." }, 400);
  }

  // Build ElevenLabs call payload with optional dynamic variables
  const elPayload: Record<string, unknown> = {
    agent_id: agent.elevenlabs_agent_id,
    agent_phone_number_id: elPhoneId,
    to_number: targetPhone,
  };

  if (dynamicVars && Object.keys(dynamicVars).length > 0) {
    elPayload.conversation_config = {
      agent: {
        dynamic_variables: dynamicVars,
      },
    };
  }

  // Initiate outbound call via ElevenLabs Telnyx endpoint (with 429 retry, max 3 attempts)
  let callRes: Response | null = null;
  let callData: Record<string, unknown> = {};
  const MAX_ATTEMPTS = 3;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    callRes = await fetch("https://api.elevenlabs.io/v1/convai/telnyx/outbound-call", {
      method: "POST",
      headers: {
        "xi-api-key": elevenLabsApiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(elPayload),
    });
    callData = await callRes.json();

    if (callRes.status !== 429) break;

    if (attempt < MAX_ATTEMPTS) {
      console.warn(`[OUTBOUND] Rate limit 429 — retry ${attempt}/${MAX_ATTEMPTS - 1} in 2s`);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  if (!callRes!.ok) {
    console.error("[OUTBOUND] ElevenLabs error:", callData);
    return json(req, { error: (callData as any)?.detail?.message || (callData as any)?.detail || "Errore ElevenLabs" }, callRes!.status);
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
    metadata: { outbound: true, phone: targetPhone, initiated_by: userId, provider: "telnyx" },
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
      provider: "telnyx",
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
