import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getPlatformSetting } from "../_shared/getPlatformSetting.ts";
import { checkRateLimit, rateLimitResponse } from "../_shared/rateLimit.ts";

import { TTS_MODEL_VOCE } from "../_shared/voicePricing.ts";
import { getCorsHeaders } from "../_shared/headers.ts";
import { agentCompanyAccess } from "../_shared/agentCompanyAccess.ts";
import { CAMPAIGN_ACTIONS, CampaignError, campaignPreparation } from "../_shared/campaignPreparation.ts";
import { CHAT_HISTORY_ACTIONS, agentChatHistory } from "../_shared/agentChatHistory.ts";
import { campaignPermission } from "../_shared/campaignPermission.ts";

const EL_BASE = "https://api.elevenlabs.io/v1";

// ── FIX BUG #1 — Voce italiana di default ──────────────────────────────────
// "JBFqnCBsd6RMkjVDRZzb" (George) è una voce inglese monolingua: produce output
// in inglese anche con testo italiano. Usare always eleven_multilingual_v2.
// Rachel (21m00Tcm4TlvDq8ikWAM) supporta italiano nativo con multilingual_v2.
// Prima era "21m00Tcm4TlvDq8ikWAM" (Rachel), una voce INGLESE spacciata per
// italiana nel commento. Si usa la stessa voce che la UI propone per prima
// ("Giulia", multilingue), cosi' agente creato e agente mostrato coincidono.
const DEFAULT_ITALIAN_VOICE_ID = "EXAVITQu4vr4xnSDxMaL";
// Flash v2.5: ~75ms di inferenza contro ~300ms di multilingual_v2, italiano
// supportato, costo per carattere circa dimezzato. Al telefono la qualità
// extra di multilingual non passa dal codec della linea, la latenza invece è
// TUTTA nell'esperienza: un agente che risponde con mezzo secondo di ritardo
// sembra rotto. (Guida ufficiale ElevenLabs: "speed-optimized TTS like Flash
// for real-time voice agents".) Vale per gli agenti NUOVI; gli esistenti
// tengono il loro modello.
const DEFAULT_TTS_MODEL = TTS_MODEL_VOCE; // unica fonte: _shared/voicePricing.ts

// ── FIX BUG #2 — Tool builder inline (non può importare da src/) ─────────────
// Converte tools_config (JSONB dal DB) nel formato array richiesto da ElevenLabs ConvAI.

interface ToolsConfigEdiliziaTool { enabled: boolean; webhook_url: string }
/** Dove passare la chiamata quando l'agente decide di coinvolgere una persona. */
interface TrasferimentoConfig {
  /** Numero dell'operatore in formato internazionale (+39...). */
  numero?: string;
  /** Quando trasferire, in parole: e' la condizione che legge il modello. */
  condizione?: string;
}
interface ToolsConfig {
  system_tools?: Record<string, boolean>;
  custom_tools?: Array<{ id: string; name: string; description: string }>;
  edilizia_tools?: Record<string, ToolsConfigEdiliziaTool>;
  trasferimento?: TrasferimentoConfig;
}

const CONDIZIONE_TRASFERIMENTO_DEFAULT =
  "Quando la persona e' interessata e qualificata, oppure quando chiede espressamente di parlare con un collega.";

/**
 * Costruisce lo strumento di sistema, aggiungendo la configurazione ai due che
 * non funzionano se dichiarati e basta.
 *
 * `transfer_to_number` senza `params.transfers` viene accettato da ElevenLabs
 * ma l'agente non sa DOVE trasferire: la chiamata muore li'. Serve almeno una
 * destinazione con la condizione in cui usarla.
 *
 * Tipo `conference`, che e' anche il default di ElevenLabs: EL squilla al numero
 * dell'operatore mentre il cliente resta in linea, li unisce in una stanza e poi
 * si toglie di mezzo, lasciando soli cliente e operatore.
 *
 * NON si usa `sip_refer` benche' i nostri numeri passino da un trunk SIP Telnyx:
 * REFER richiede che il trunk lo consenta esplicitamente, e se non e' abilitato
 * il trasferimento fallisce in chiamata, davanti al cliente. `conference`
 * funziona sia con i numeri sia col trunk SIP e non chiede configurazioni in
 * piu'. `blind` e' escluso perche' e' solo Twilio nativo.
 *
 * Quello che con Telnyx NON si puo' avere e' `agent_message`, cioe' l'AI che
 * riassume a voce all'operatore prima di passargli il cliente: e' riservato a
 * Twilio nativo. Per questo il riassunto lo diamo a schermo.
 */
async function costruisciStrumentoSistema(
  elName: string,
  toolsConfig: ToolsConfig,
  companyId: string,
  adminClient: SupabaseClient,
): Promise<unknown | null> {
  if (elName !== "transfer_to_number") return {};

  // ElevenLabs vuole le destinazioni DICHIARATE in anticipo: non si può passare
  // un numero qualunque a chiamata in corso. Quindi si dichiarano tutti gli
  // operatori che hanno registrato un numero, ognuno con la sua condizione che
  // ne fa il nome. A chiamata in corso lo strumento `passa_a_operatore` dice
  // all'assistente CHI è libero adesso, e l'assistente sceglie quella voce.
  //
  // Conseguenza da conoscere: l'elenco è una fotografia del momento in cui si
  // salva l'agente. Chi si registra dopo entra al salvataggio successivo — per
  // questo il numero di riserva resta sempre in fondo alla lista.
  const destinazioni: Array<{ transfer_destination: unknown; condition: string; transfer_type: string }> = [];
  const gia = new Set<string>();

  const aggiungi = (numero: string | null | undefined, condizione: string) => {
    const pulito = (numero ?? "").replace(/\s/g, "");
    if (!pulito || gia.has(pulito)) return;
    gia.add(pulito);
    destinazioni.push({
      transfer_destination: { type: "phone", phone_number: pulito },
      condition: condizione,
      transfer_type: "conference",
    });
  };

  try {
    const { data: operatori } = await adminClient
      .from("operatori_presenza")
      .select("telefono, profiles!operatori_presenza_user_id_fkey(first_name, last_name, email)")
      .eq("company_id", companyId)
      .not("telefono", "is", null)
      .limit(20);

    for (const op of (operatori ?? []) as Array<Record<string, unknown>>) {
      const p = (op.profiles ?? {}) as { first_name?: string; last_name?: string; email?: string };
      const nome = [p.first_name, p.last_name].filter(Boolean).join(" ").trim() || p.email || "collega";
      aggiungi(op.telefono as string, `Quando lo strumento passa_a_operatore indica ${nome} come collega libero.`);
    }
  } catch (e) {
    console.warn("[PROXY] elenco operatori non letto, resta il numero di riserva:", e instanceof Error ? e.message : e);
  }

  // Numero di riserva: l'ultima spiaggia quando nessun operatore è registrato.
  aggiungi(toolsConfig.trasferimento?.numero, toolsConfig.trasferimento?.condizione?.trim() || CONDIZIONE_TRASFERIMENTO_DEFAULT);

  // Nessuna destinazione = promessa vuota. Meglio non dare lo strumento che
  // far dire "le passo un collega" nel nulla.
  if (destinazioni.length === 0) {
    throw new Error("Trasferimento abilitato senza destinazione: configura un numero operatore o disabilita il trasferimento");
  }

  return {
    type: "system",
    name: "transfer_to_number",
    description: "Passa la chiamata a una persona in carne e ossa, dopo aver chiamato passa_a_operatore per sapere chi è libero.",
    params: { system_tool_type: "transfer_to_number", transfers: destinazioni },
  };
}

// Nomi CANONICI di ElevenLabs (verificati sulla documentazione 2026-09):
// end_call, language_detection, skip_turn, transfer_to_agent,
// transfer_to_number, play_keypad_touch_tone, voicemail_detection.
// Due erano inventati — "transfer_call" e "play_dtmf" non esistono, quindi
// l'agente non avrebbe mai potuto passare la chiamata a una persona: EL
// avrebbe rifiutato lo strumento sconosciuto. Nessuno se n'era accorto perche'
// finora nessuna schermata permetteva di accenderli.
const SYSTEM_TOOL_MAP: Record<string, string> = {
  end_conversation: "end_call",
  detect_language: "language_detection",
  skip_turn: "skip_turn",
  transfer_agent: "transfer_to_agent",
  transfer_number: "transfer_to_number",
  play_dtmf: "play_keypad_touch_tone",
  voicemail_detection: "voicemail_detection",
};

// ── Definizioni tool nel formato VERO di ElevenLabs ─────────────────────────
// Prima si mandavano oggetti {type:"webhook", url, method, headers} inline in
// conversation_config.agent.tools: quel campo e' deprecato e, soprattutto,
// senza `api_schema.request_body_schema` il modello non sa QUALI campi mettere
// nel body (data, ora, motivo...). I tool vanno creati con POST /convai/tools e
// collegati all'agente via prompt.tool_ids. I nomi sono quelli canonici
// italiani citati nei prompt dei template: prima l'LLM leggeva
// "create_appointment" nella lista tool e "fissa_appuntamento" nel prompt.
type SchemaCampo = { type: "string"; description?: string; dynamic_variable?: string };
const TELEFONO: SchemaCampo = { type: "string", dynamic_variable: "system__caller_id" };
const campo = (description: string): SchemaCampo => ({ type: "string", description });

const DEFINIZIONI_TOOL: Record<string, { description: string; properties: Record<string, SchemaCampo>; required: string[] }> = {
  info_cliente: {
    description: "Riepilogo del chiamante nel gestionale: intestatario del numero, lavori e preventivi aperti. Usalo a inizio chiamata se serve capire chi chiama. Nessun dato da chiedere: il numero e' quello del chiamante.",
    properties: { telefono: TELEFONO }, required: [],
  },
  stato_consegna: {
    description: "Stato dell'ultima commessa del chiamante: merce arrivata in magazzino, avanzamento dei lavori, fine prevista. Usalo quando chiede 'quando arriva la merce' o 'a che punto siamo'.",
    properties: { telefono: TELEFONO }, required: [],
  },
  stato_preventivo: {
    description: "Stato dell'ultimo preventivo del chiamante: in preparazione, inviato, visto, accettato, firmato o scaduto.",
    properties: { telefono: TELEFONO }, required: [],
  },
  disponibilita: {
    description: "Orari liberi in agenda per un giorno. Usalo PRIMA di fissare, se il cliente non ha un orario preciso.",
    properties: { data: campo("Giorno richiesto, formato AAAA-MM-GG") }, required: ["data"],
  },
  fissa_appuntamento: {
    description: "Fissa un appuntamento reale in agenda (sopralluogo, consulenza). Se l'orario e' occupato la risposta contiene alternative: proponile e riprova. Conferma a voce giorno e ora.",
    properties: {
      data: campo("Giorno, formato AAAA-MM-GG"),
      ora: campo("Orario, formato HH:MM (tra le 8 e le 18)"),
      motivo: campo("Motivo breve, es. 'Sopralluogo infissi'"),
      nome: campo("Nome del cliente, se lo ha detto"),
      telefono: TELEFONO,
    }, required: ["data"],
  },
  crea_ticket: {
    description: "Apre una segnalazione di assistenza con il racconto del cliente e restituisce il riferimento da comunicare a voce.",
    properties: {
      descrizione: campo("Il problema, fedele alle parole del cliente"),
      nome: campo("Nome del cliente, se noto"),
      urgenza: campo("'urgente' se il cliente lo dichiara o e' un'emergenza (perdita, allagamento, non funziona)"),
      telefono: TELEFONO,
    }, required: ["descrizione"],
  },
  passa_a_operatore: {
    description: "Chiamalo PRIMA di passare la chiamata a un collega, sempre. Ti dice se c'e' qualcuno libero adesso e a quale numero trasferire, e nel frattempo gli fa comparire a schermo la scheda del cliente. Se risponde che non c'e' nessuno, NON dire al cliente che glielo passi: proponi un appuntamento o un richiamo.",
    properties: {
      riassunto: campo("Cosa hai capito finora, in due righe: che lavoro serve, dove, tempi, budget, chi decide. È quello che il collega legge mentre gli squilla il telefono."),
      nome: campo("Nome del cliente, se lo sai"),
      telefono: TELEFONO,
    }, required: ["riassunto"],
  },
  richiesta_richiamo: {
    description: "Il cliente vuole parlare con una persona, o la chiamata va chiusa lasciando un messaggio: registra la richiesta di richiamo per l'ufficio.",
    properties: {
      motivo: campo("Motivo del richiamo, o esito della chiamata"),
      nome: campo("Nome del cliente, se noto"),
      urgenza: campo("'urgente' se serve il richiamo in giornata"),
      telefono: TELEFONO,
    }, required: ["motivo"],
  },
  info_prodotto: {
    description: "Cerca un prodotto o materiale nel listino aziendale e dice se lo trattiamo.",
    properties: { prodotto: campo("Nome del prodotto o materiale") }, required: ["prodotto"],
  },
};

// Gli id usati dalla UI (STRUMENTI_CHIAMATA) e i sinonimi → nome canonico.
const CANONICO: Record<string, string> = {
  get_lead_info: "info_cliente", info_cliente: "info_cliente",
  stato_consegna: "stato_consegna",
  stato_preventivo: "stato_preventivo",
  get_availability: "disponibilita", disponibilita: "disponibilita",
  create_appointment: "fissa_appuntamento", fissa_appuntamento: "fissa_appuntamento",
  crea_ticket: "crea_ticket",
  assign_to_user: "richiesta_richiamo", richiesta_richiamo: "richiesta_richiamo",
  search_products: "info_prodotto", info_prodotto: "info_prodotto",
  passa_a_operatore: "passa_a_operatore",
};

// Tool con un backend reale in agent-tools: per questi il proxy genera da solo
// l'URL del webhook (tool id → azione canonica passata come ?tool=). Gli id
// NON in mappa restano configurabili solo con webhook_url manuale.
const BACKED_EDILIZIA_TOOLS: Record<string, string> = CANONICO;

// Chiave per-azienda negli URL dei tool: HMAC(secret, "agent-tools:"+company_id).
// agent-tools accetta questa O il master secret; negli URL va SOLO la derivata,
// così il secret di piattaforma non lascia mai il server (gli URL finiscono
// nella config ElevenLabs, visibile a chi ha accesso all'account EL).
async function deriveAgentToolsKey(companyId: string): Promise<string | null> {
  const secret = Deno.env.get("AGENT_TOOLS_SECRET") || Deno.env.get("ELEVENLABS_WEBHOOK_SECRET");
  if (!secret) return null;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(`agent-tools:${companyId}`));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Factory degli URL automatici dei tool per un agente EL; null se il secret manca. */
async function makeAutoToolUrl(companyId: string, elevenlabsAgentId: string): Promise<((toolId: string) => string | null) | null> {
  const derived = await deriveAgentToolsKey(companyId);
  if (!derived) return null;
  const base = `${Deno.env.get("SUPABASE_URL")}/functions/v1/agent-tools`;
  return (toolId: string) => {
    const azione = BACKED_EDILIZIA_TOOLS[toolId];
    if (!azione) return null;
    return `${base}?agent=${encodeURIComponent(elevenlabsAgentId)}&key=${derived}&tool=${azione}`;
  };
}

/**
 * Crea su ElevenLabs i tool abilitati in tools_config (POST /convai/tools) e
 * restituisce gli id da collegare all'agente. I tool precedenti restano attivi
 * fino al completamento del salvataggio remoto e locale.
 */
async function sincronizzaToolElevenLabs(
  apiKey: string,
  companyId: string,
  elevenlabsAgentId: string,
  toolsConfig: ToolsConfig | null | undefined,
  adminClient: SupabaseClient,
): Promise<{ toolIds: string[]; systemTools: Record<string, unknown> }> {
  // Prepare replacements first: the currently attached tools remain live
  // until the agent and its local tool IDs have both been updated.
  // Explicit null disables a previously enabled built-in tool on PATCH.
  const systemTools: Record<string, unknown> = Object.fromEntries(Object.values(SYSTEM_TOOL_MAP).map(name => [name, null]));
  if (toolsConfig?.system_tools) {
    for (const [id, enabled] of Object.entries(toolsConfig.system_tools)) {
      const elName = SYSTEM_TOOL_MAP[id];
      if (!enabled || !elName) continue;
      const strumento = await costruisciStrumentoSistema(elName, toolsConfig, companyId, adminClient);
      if (strumento) systemTools[elName] = strumento;
    }
  }
  const autoUrl = await makeAutoToolUrl(companyId, elevenlabsAgentId);
  const daCreare = new Map<string, string | null>(); // canonico → url esplicito
  for (const [id, cfg] of Object.entries(toolsConfig?.edilizia_tools ?? {})) {
    if (!cfg.enabled) continue;
    const canon = CANONICO[id];
    if (!canon) continue;
    daCreare.set(canon, cfg.webhook_url || null);
  }
  const toolIds: string[] = [];
  for (const [canon, urlEsplicito] of daCreare) {
    const url = urlEsplicito || autoUrl?.(canon) || null;
    if (!url) {
      await cleanupTools(apiKey, toolIds);
      throw new Error(`Strumento ${canon} non configurabile: manca l'URL sicuro`);
    }
    const def = DEFINIZIONI_TOOL[canon];
    const body = {
      tool_config: {
        type: "webhook",
        name: canon,
        description: def.description,
        response_timeout_secs: 20,
        api_schema: {
          url,
          method: "POST",
          request_headers: { "Content-Type": "application/json" },
          request_body_schema: { type: "object", properties: def.properties, required: def.required },
        },
      },
    };
    try {
      const res = await elFetch("/convai/tools", "POST", apiKey, body);
      const id = res?.id ?? res?.tool_id;
      if (!id) throw new Error(`ElevenLabs non ha restituito l'ID dello strumento ${canon}`);
      toolIds.push(String(id));
    } catch (e) {
      await cleanupTools(apiKey, toolIds);
      throw e;
    }
  }
  return { toolIds, systemTools };
}

// buildElevenLabsToolsFromConfig e' stato rimosso: era una SECONDA copia della
// costruzione dei tool, non chiamata da nessuno, che ripeteva la stessa mappa
// dei nomi di sistema. E' il motivo per cui i nomi sbagliati ("transfer_call",
// "play_dtmf") sono sopravvissuti tanto a lungo: correggerne una non correggeva
// l'altra. La costruzione vive solo in sincronizzaToolElevenLabs.

/** True se il config abilita almeno un tool che richiede l'URL auto-generato. */
function hasAutoBackedTools(toolsConfig: ToolsConfig | null | undefined): boolean {
  if (!toolsConfig?.edilizia_tools) return false;
  return Object.entries(toolsConfig.edilizia_tools).some(
    ([id, cfg]) => cfg.enabled && !cfg.webhook_url && BACKED_EDILIZIA_TOOLS[id],
  );
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    // --- Auth ---
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) {
      return json({ error: "Unauthorized" }, 401);
    }

    const userId = user.id;

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const body = await req.json();
    const { action, agent_id } = body;
    let payload = body.payload;
    const access = await agentCompanyAccess(adminClient, userId, body.company_id, corsHeaders);
    const companyId = access.companyId;
    if (action === "get_capabilities") {
      const ready = await adminClient.rpc("voice_campaign_runtime_ready");
      return json({ version: 2, tenant_scoped: true, draft_provisioning: true, campaign_preparation: true,
        campaign_dispatch: !ready.error && ready.data === true, chat_history: true });
    }
    if (CHAT_HISTORY_ACTIONS.includes(action)) {
      if (payload !== undefined && (!payload || typeof payload !== "object" || Array.isArray(payload))) return json({ error: "Dati chat non validi" }, 400);
      await campaignPermission(adminClient, userId, companyId, access.isSuperAdmin, action, corsHeaders);
      const chatLimit = await checkRateLimit({ functionName: "agent-chat-history", callerId: companyId, maxCalls: 60, windowSeconds: 60 });
      if (!chatLimit.allowed) return rateLimitResponse(chatLimit.retryAfterSeconds ?? 60, corsHeaders);
      try { return json(await agentChatHistory(adminClient, companyId, action, payload)); }
      catch (error) { return json({ error: error instanceof Error ? error.message : "Cronologia non disponibile" }, 400); }
    }
    if (CAMPAIGN_ACTIONS.includes(action)) {
      if (payload !== undefined && (!payload || typeof payload !== "object" || Array.isArray(payload))) return json({ error: "Dati campagna non validi" }, 400);
      await campaignPermission(adminClient, userId, companyId, access.isSuperAdmin, action, corsHeaders);
      if (["create_campaign", "delete_campaign", "prepare_campaign", "start_campaign", "pause_campaign"].includes(action) && !access.isSuperAdmin) {
        // Must use the USER client: auth.uid() in this RPC must not be service_role.
        const { data: readOnly, error: permissionError } = await userClient.rpc("utente_sola_lettura", { p_company_id: companyId });
        if (permissionError || readOnly !== false) return json({ error: "Sola lettura o permesso di modifica non verificabile" }, 403);
      }
      const rl = await checkRateLimit({ functionName: "campaign-preparation", callerId: companyId, maxCalls: 60, windowSeconds: 60 });
      if (!rl.allowed) return rateLimitResponse(rl.retryAfterSeconds ?? 60, corsHeaders);
      try { return json(await campaignPreparation(adminClient, companyId, action, payload)); }
      catch (error) {
        if (error instanceof CampaignError) return json({ error: error.message }, error.status);
        throw error;
      }
    }

    // --- Get API key from platform_settings first, then env fallback ---
    const apiKey = await getPlatformSetting("elevenlabs_api_key", "ELEVENLABS_API_KEY");
    if (!apiKey) {
      return json({ error: "Chiave API ElevenLabs non configurata. Contattare l'amministratore." }, 500);
    }

    // Rate limit expensive AI operations: max 30 calls per minute per company
    const expensiveActions = [
      "create_agent",
      "update_agent",
      "delete_agent",
      "get_conversations",
      "get_conversation",
      "get_conversation_audio",
      "link_phone_number",
      "assign_phone_agent",
      "add_kb_doc",
      "remove_kb_doc",
      "add_voice",
    ];
    if (expensiveActions.includes(action)) {
      const rl = await checkRateLimit({
        functionName: "elevenlabs-proxy",
        callerId: companyId,
        maxCalls: 30,
        windowSeconds: 60,
      });
      if (!rl.allowed) {
        return rateLimitResponse(rl.retryAfterSeconds ?? 60, getCorsHeaders(req));
      }
    }

    let result: unknown;

    switch (action) {
      case "create_agent": {
        if (!payload?.local_agent_id) return json({ error: "Salva prima una bozza dell'agente" }, 400);
        const { data: draft, error: draftError } = await adminClient.from("ai_agents_v2")
          .select("*").eq("id", payload.local_agent_id).eq("company_id", companyId).single();
        if (draftError || !draft) return json({ error: "Bozza non trovata o non autorizzata" }, 403);
        if (draft.elevenlabs_agent_id) {
          return json({ agent_id: draft.id, elevenlabs_agent_id: draft.elevenlabs_agent_id,
            elevenlabs_tool_ids: draft.tools_config?.elevenlabs_tool_ids ?? [] });
        }
        if (!["vocale", "campagna"].includes(draft.tipo) || !["bozza", "pausa"].includes(draft.stato)) {
          return json({ error: "Solo una bozza vocale può essere collegata" }, 400);
        }
        payload = { local_agent_id: draft.id, name: draft.nome, system_prompt: draft.system_prompt,
          first_message: draft.primo_messaggio, llm_model: draft.llm_model, temperature: draft.temperatura ?? 0.7,
          language: draft.lingua, voice_id: draft.elevenlabs_voice_id, tools_config: draft.tools_config };
        // FIX BUG #1: usa voce italiana di default e modello multilingual
        const voiceId = payload?.voice_id || DEFAULT_ITALIAN_VOICE_ID;

        const storedTools = payload?.tools_config as ToolsConfig | null | undefined;
        const createToolsConfig: ToolsConfig = {
          ...storedTools,
          system_tools: { ...storedTools?.system_tools,
            ...(typeof draft.rileva_segreteria === "boolean" ? { voicemail_detection: draft.rileva_segreteria } : {}) },
        };

        const createBody: Record<string, unknown> = {
          conversation_config: {
            conversation: { max_duration_seconds: validMaxDuration(draft.durata_max_secondi ?? 300) },
            agent: {
              prompt: { prompt: payload?.system_prompt || "", llm: payload?.llm_model || "gemini-2.5-flash", ...(payload?.temperature !== undefined ? { temperature: validTemperature(payload.temperature) } : {}) },
              first_message: payload?.first_message || "",
              language: payload?.language || "it",
            },
            tts: {
              voice_id: voiceId,
              model_id: DEFAULT_TTS_MODEL, // Flash v2.5 — latenza da telefono, italiano ok
            },
          },
          name: payload?.name || "Nuovo Agente",
          platform_settings: { privacy: { record_voice: draft.registra_chiamate !== false } },
        };

        const elRes = await elFetch("/convai/agents/create", "POST", apiKey, createBody);

        const elAgentId = elRes?.agent_id;
        if (!elAgentId) throw new Error("ElevenLabs non ha restituito l'ID dell'agente");

        // Tool: gli URL contengono l'agent id EL, che esiste solo ora. Si creano
        // i tool e si collegano all'agente via prompt.tool_ids (il campo
        // prompt.tools inline e' deprecato).
        let elToolIds: string[] = [];
        if (elAgentId && createToolsConfig) {
          try {
            const sync = await sincronizzaToolElevenLabs(apiKey, companyId, elAgentId, createToolsConfig, adminClient);
            elToolIds = sync.toolIds;
            await elFetch(`/convai/agents/${elAgentId}`, "PATCH", apiKey, {
              conversation_config: { agent: { prompt: { tool_ids: elToolIds, built_in_tools: sync.systemTools } } },
            });
          } catch (toolErr) {
            await cleanupTools(apiKey, elToolIds);
            try { await elFetch(`/convai/agents/${elAgentId}`, "DELETE", apiKey); } catch { /* Original error remains visible. */ }
            throw toolErr;
          }
        }

        const { data: bound, error: bindError } = await adminClient.from("ai_agents_v2")
          .update({ elevenlabs_agent_id: elAgentId, tools_config: { ...draft.tools_config, elevenlabs_tool_ids: elToolIds } })
          .eq("id", draft.id).eq("company_id", companyId).is("elevenlabs_agent_id", null).select("id").single();
        if (bindError || !bound) {
          try { await elFetch(`/convai/agents/${elAgentId}`, "DELETE", apiKey); } catch { console.warn("Pulizia agente non completata"); }
          await cleanupTools(apiKey, elToolIds);
          throw bindError || new Error("Collegamento non salvato: riprova dalla bozza");
        }
        await auditLog(adminClient, companyId, draft.id, userId, "create_agent", { name: payload?.name, elevenlabs_agent_id: elAgentId });
        result = { agent_id: draft.id, elevenlabs_agent_id: elAgentId, elevenlabs_tool_ids: elToolIds };
        break;
      }

      case "update_agent": {
        if (!agent_id) throw new Error("agent_id richiesto");

        // SICUREZZA: verifica che l'elevenlabs_agent_id appartenga alla company del chiamante.
        // Senza questo check, un utente autenticato poteva modificare l'agente di un'altra azienda.
        const ownership = await findOwnedAgentByElevenLabsId(adminClient, companyId, agent_id);
        if (!ownership) {
          return json({ error: "Agente non trovato o non autorizzato" }, 403);
        }

        // FIX BUG #1 + BUG #2: costruisci il body ElevenLabs con merge corretto
        const agentPatch: Record<string, unknown> = {};
        const ttsPatch: Record<string, unknown> = {};

        if (payload?.system_prompt !== undefined) {
          agentPatch.prompt = { prompt: payload.system_prompt };
        }
        if (payload?.llm_model !== undefined || payload?.temperature !== undefined) {
          agentPatch.prompt = { ...(agentPatch.prompt as Record<string, unknown> ?? {}),
            ...(payload.llm_model !== undefined ? { llm: payload.llm_model } : {}),
            ...(payload.temperature !== undefined ? { temperature: validTemperature(payload.temperature) } : {}),
          };
        }
        if (payload?.first_message !== undefined) {
          agentPatch.first_message = payload.first_message;
        }
        if (payload?.language !== undefined) {
          agentPatch.language = payload.language;
        }

        // FIX BUG #2: quando tools_config viene aggiornato, ri-sincronizza i tool su
        // ElevenLabs. Qui l'agent id EL è noto → gli URL auto dei tool con backend
        // vengono generati subito.
        let nuoviToolIds: string[] | null = null;
        let precedenti: string[] = [];
        if (payload?.tools_config !== undefined) {
          const cfg = payload.tools_config as (ToolsConfig & { elevenlabs_tool_ids?: string[] }) | null;
          precedenti = await toolIdsPrecedenti(adminClient, ownership);
          const sync = await sincronizzaToolElevenLabs(apiKey, companyId, agent_id, cfg, adminClient);
          nuoviToolIds = sync.toolIds;
          agentPatch.prompt = { ...(agentPatch.prompt as Record<string, unknown> ?? {}), tool_ids: nuoviToolIds, built_in_tools: sync.systemTools };
        }

        // FIX BUG #1: usa modello multilingual quando la voce viene aggiornata
        if (payload?.voice_id !== undefined) {
          ttsPatch.voice_id = payload.voice_id;
          ttsPatch.model_id = DEFAULT_TTS_MODEL;
        }

        if (payload?.name !== undefined) {
          // name è top-level in ElevenLabs, non dentro conversation_config
        }

        const updateBody: Record<string, unknown> = {};
        if (Object.keys(agentPatch).length > 0 || Object.keys(ttsPatch).length > 0) {
          updateBody.conversation_config = {};
          if (Object.keys(agentPatch).length > 0) {
            (updateBody.conversation_config as Record<string, unknown>).agent = agentPatch;
          }
          if (Object.keys(ttsPatch).length > 0) {
            (updateBody.conversation_config as Record<string, unknown>).tts = ttsPatch;
          }
        }
        if (payload?.name !== undefined) updateBody.name = payload.name;

        if (Object.keys(updateBody).length > 0) {
          try {
            await elFetch(`/convai/agents/${agent_id}`, "PATCH", apiKey, updateBody);
          } catch (err) {
            await cleanupTools(apiKey, nuoviToolIds ?? []);
            throw err;
          }
        }

        if (ownership.v2AgentId) {
          const v2Patch: Record<string, unknown> = {};
          if (payload?.name !== undefined) v2Patch.nome = payload.name;
          if (payload?.system_prompt !== undefined) v2Patch.system_prompt = payload.system_prompt;
          if (payload?.first_message !== undefined) v2Patch.primo_messaggio = payload.first_message;
          if (payload?.language !== undefined) v2Patch.lingua = payload.language;
          if (payload?.llm_model !== undefined) v2Patch.llm_model = payload.llm_model;
          if (payload?.temperature !== undefined) v2Patch.temperatura = validTemperature(payload.temperature);
          if (payload?.voice_id !== undefined) v2Patch.elevenlabs_voice_id = payload.voice_id;
          if (payload?.tools_config !== undefined) v2Patch.tools_config = { ...(payload.tools_config as Record<string, unknown>), elevenlabs_tool_ids: nuoviToolIds ?? [] };
          if (Object.keys(v2Patch).length > 0) {
            const { data: saved, error } = await adminClient
              .from("ai_agents_v2")
              .update(v2Patch)
              .eq("id", ownership.v2AgentId)
              .eq("company_id", companyId).select("id").single();
            if (error || !saved) throw error || new Error("Agente non aggiornato nel gestionale");
          }
        }

        if (ownership.legacyAgentId) {
          const legacyPatch: Record<string, unknown> = {};
          if (payload?.name !== undefined) legacyPatch.name = payload.name;
          if (payload?.system_prompt !== undefined) legacyPatch.system_prompt = payload.system_prompt;
          if (payload?.first_message !== undefined) legacyPatch.first_message = payload.first_message;
          if (payload?.language !== undefined) legacyPatch.language = payload.language;
          if (payload?.llm_model !== undefined) legacyPatch.llm_model = payload.llm_model;
          if (payload?.voice_id !== undefined) legacyPatch.voice_id = payload.voice_id;
          if (payload?.tools_config !== undefined) legacyPatch.tools_config = { ...(payload.tools_config as Record<string, unknown>), elevenlabs_tool_ids: nuoviToolIds ?? [] };
          if (Object.keys(legacyPatch).length > 0) {
            const { data: saved, error } = await adminClient
              .from("ai_agents")
              .update(legacyPatch)
              .eq("id", ownership.legacyAgentId)
              .eq("company_id", companyId).select("id").single();
            if (error || !saved) throw error || new Error("Agente non aggiornato nel gestionale");
          }
        }

        await auditLog(adminClient, companyId, ownership.legacyAgentId ?? ownership.v2AgentId, userId, "update_agent", { agent_id, changes: Object.keys(payload || {}) });
        if (nuoviToolIds !== null) await cleanupTools(apiKey, precedenti.filter(id => !nuoviToolIds!.includes(id)));
        result = { success: true, ...(nuoviToolIds !== null ? { elevenlabs_tool_ids: nuoviToolIds } : {}) };
        break;
      }

      case "delete_agent": {
        if (!agent_id) throw new Error("agent_id richiesto");

        // SICUREZZA: verifica ownership prima di cancellare su ElevenLabs
        const ownership = await findOwnedAgentByElevenLabsId(adminClient, companyId, agent_id);
        if (!ownership) {
          return json({ error: "Agente non trovato o non autorizzato" }, 403);
        }

        try {
          await elFetch(`/convai/agents/${agent_id}`, "DELETE", apiKey);
        } catch (err) {
          if (!(err instanceof ElevenLabsApiError && err.status === 404)) throw err;
        }
        await cleanupTools(apiKey, await toolIdsPrecedenti(adminClient, ownership));
        await auditLog(adminClient, companyId, null, userId, "delete_agent", { agent_id });
        result = { success: true };
        break;
      }

      case "get_voices": {
        const voices = await elFetch("/voices", "GET", apiKey);
        result = voices;
        break;
      }

      case "get_models": {
        const models = await elFetch("/models", "GET", apiKey);
        result = models;
        break;
      }

      // --- KB Sync Actions (FIX 8) ---
      case "add_kb_doc": {
        if (!agent_id) throw new Error("agent_id richiesto");
        if (!payload?.source_url && !payload?.text) throw new Error("URL o testo del documento richiesti");
        // Ownership check
        const own = await findOwnedAgentByElevenLabsId(adminClient, companyId, agent_id);
        if (!own) return json({ error: "Agente non trovato o non autorizzato" }, 403);

        const remote = await elFetch(`/convai/agents/${agent_id}`, "GET", apiKey);
        const prompt = remote?.conversation_config?.agent?.prompt ?? {};
        const type = payload.source_url ? "url" : "text";
        const docResult = await elFetch(`/convai/knowledge-base/${type}`, "POST", apiKey,
          { name: payload.name, ...(type === "url" ? { url: payload.source_url } : { text: payload.text }) });
        if (!docResult?.id) throw new Error("ElevenLabs non ha restituito l'ID del documento");
        try {
          await elFetch(`/convai/agents/${agent_id}`, "PATCH", apiKey, {
            conversation_config: { agent: { prompt: { ...prompt, knowledge_base: [
              ...(prompt.knowledge_base ?? []), { id: docResult.id, name: payload.name, type },
            ] } } },
          });
        } catch (err) {
          try { await elFetch(`/convai/knowledge-base/${docResult.id}`, "DELETE", apiKey); } catch { /* Original failure stays visible. */ }
          throw err;
        }
        result = { elevenlabs_doc_id: docResult.id };
        break;
      }

      case "remove_kb_doc": {
        if (!agent_id || !payload?.doc_id) throw new Error("agent_id e doc_id richiesti");
        const own = await findOwnedAgentByElevenLabsId(adminClient, companyId, agent_id);
        if (!own) return json({ error: "Agente non trovato o non autorizzato" }, 403);

        const remote = await elFetch(`/convai/agents/${agent_id}`, "GET", apiKey);
        const prompt = remote?.conversation_config?.agent?.prompt ?? {};
        await elFetch(`/convai/agents/${agent_id}`, "PATCH", apiKey, {
          conversation_config: { agent: { prompt: { ...prompt,
            knowledge_base: (prompt.knowledge_base ?? []).filter((doc: { id: string }) => doc.id !== payload.doc_id),
          } } },
        });
        result = { success: true };
        break;
      }

      case "list_kb_docs": {
        if (!agent_id) throw new Error("agent_id richiesto");
        const own = await findOwnedAgentByElevenLabsId(adminClient, companyId, agent_id);
        if (!own) return json({ error: "Agente non trovato o non autorizzato" }, 403);

        const remote = await elFetch(`/convai/agents/${agent_id}`, "GET", apiKey);
        result = { documents: remote?.conversation_config?.agent?.prompt?.knowledge_base ?? [] };
        break;
      }

      case "get_conversations": {
        if (!agent_id) throw new Error("agent_id richiesto");
        const own = await findOwnedAgentByElevenLabsId(adminClient, companyId, agent_id);
        if (!own) return json({ error: "Agente non trovato o non autorizzato" }, 403);

        const convRes = await elFetch(
          `/convai/conversations?agent_id=${agent_id}&page_size=${payload?.page_size || 20}${payload?.cursor ? `&cursor=${payload.cursor}` : ""}`,
          "GET",
          apiKey
        );
        result = convRes;
        break;
      }

      case "get_conversation": {
        if (!payload?.conversation_id) throw new Error("conversation_id richiesto");
        const canReadConversation = await hasConversationAccess(
          adminClient,
          companyId,
          String(payload.conversation_id),
        );
        if (!canReadConversation) {
          return json({ error: "Conversazione non trovata o non autorizzata" }, 403);
        }
        const convDetail = await elFetch(
          `/convai/conversations/${payload.conversation_id}`,
          "GET",
          apiKey
        );
        result = convDetail;
        break;
      }

      case "get_conversation_audio": {
        if (!payload?.conversation_id) throw new Error("conversation_id richiesto");
        const canReadConversation = await hasConversationAccess(
          adminClient,
          companyId,
          String(payload.conversation_id),
        );
        if (!canReadConversation) {
          return json({ error: "Conversazione non trovata o non autorizzata" }, 403);
        }
        const audioRes = await fetch(
          `${EL_BASE}/convai/conversations/${payload.conversation_id}/audio`,
          {
            headers: { "xi-api-key": apiKey },
          }
        );
        if (!audioRes.ok) {
          throw new Error(`ElevenLabs audio error ${audioRes.status}`);
        }
        // Return as base64
        const audioBuffer = await audioRes.arrayBuffer();
        const { encode: base64Encode } = await import("https://deno.land/std@0.168.0/encoding/base64.ts");
        const base64Audio = base64Encode(audioBuffer);
        result = { audio_base64: base64Audio, content_type: audioRes.headers.get("content-type") || "audio/mpeg" };
        break;
      }

      case "get_phone_numbers": {
        const phonesRes = await elFetch("/convai/phone-numbers", "GET", apiKey);

        const rawNumbers = Array.isArray(phonesRes?.phone_numbers)
          ? phonesRes.phone_numbers
          : Array.isArray(phonesRes)
            ? phonesRes
            : [];
        const { data: localNumbers, error: numbersError } = await adminClient
          .from("ai_phone_numbers_v2")
          .select("numero, elevenlabs_phone_id")
          .eq("company_id", companyId);
        if (numbersError) throw numbersError;
        const allowedIds = new Set(
          ((localNumbers as Array<{ elevenlabs_phone_id?: string | null }> | null) ?? [])
            .map((n) => n.elevenlabs_phone_id)
            .filter(Boolean),
        );
        const allowedNumbers = new Set(
          ((localNumbers as Array<{ numero?: string | null }> | null) ?? [])
            .map((n) => normalizePhone(n.numero))
            .filter(Boolean),
        );
        const filtered = rawNumbers.filter((n: Record<string, unknown>) => {
          const id = String(n.phone_number_id ?? n.id ?? "");
          const phone = normalizePhone(n.phone_number ?? n.number ?? "");
          return (id && allowedIds.has(id)) || (phone && allowedNumbers.has(phone));
        });
        result = Array.isArray(phonesRes)
          ? { phone_numbers: filtered }
          : { ...phonesRes, phone_numbers: filtered };
        break;
      }

      case "add_voice": {
        // P2-05: Add voice clone from base64 audio
        if (!payload?.name || !payload?.audio_base64) {
          throw new Error("name e audio_base64 richiesti");
        }
        const { decode: base64Decode } = await import("https://deno.land/std@0.168.0/encoding/base64.ts");
        const audioBytes = base64Decode(payload.audio_base64 as string);
        const formData = new FormData();
        formData.append("name", payload.name as string);
        if (payload.description) formData.append("description", payload.description as string);
        const blob = new Blob([new Uint8Array(audioBytes).buffer], { type: "audio/mpeg" });
        formData.append("files", blob, "sample.mp3");

        const voiceRes = await fetch(`${EL_BASE}/voices/add`, {
          method: "POST",
          headers: { "xi-api-key": apiKey },
          body: formData,
        });
        if (!voiceRes.ok) {
          const err = await voiceRes.json().catch(() => ({}));
          throw new Error(`ElevenLabs add_voice error: ${err?.detail?.message || voiceRes.status}`);
        }
        result = await voiceRes.json();
        break;
      }

      case "sync_kb": {
        // Sync local docs to EL — just returns current EL docs for comparison
        if (!agent_id) throw new Error("agent_id richiesto");
        const own = await findOwnedAgentByElevenLabsId(adminClient, companyId, agent_id);
        if (!own) return json({ error: "Agente non trovato o non autorizzato" }, 403);
        const remote = await elFetch(`/convai/agents/${agent_id}`, "GET", apiKey);
        result = { elevenlabs_docs: remote?.conversation_config?.agent?.prompt?.knowledge_base || [] };
        break;
      }

      case "assign_phone_agent": {
        if (!payload?.local_phone_id) return json({ error: "Numero locale richiesto" }, 400);
        const { data: number, error: numberError } = await adminClient.from("ai_phone_numbers_v2")
          .select("id, elevenlabs_phone_id").eq("company_id", companyId).eq("id", payload.local_phone_id).single();
        if (numberError || !number) return json({ error: "Numero non trovato o non autorizzato" }, 403);
        let localAgentId: string | null = null;
        if (agent_id) {
          const own = await findOwnedAgentByElevenLabsId(adminClient, companyId, agent_id);
          if (!own?.v2AgentId) return json({ error: "Agente non trovato o non autorizzato" }, 403);
          localAgentId = own.v2AgentId;
        }
        if (number.elevenlabs_phone_id) await elFetch(`/convai/phone-numbers/${number.elevenlabs_phone_id}`,
          "PATCH", apiKey, { agent_id: agent_id ?? null });
        const { data: saved, error } = await adminClient.from("ai_phone_numbers_v2")
          .update({ agent_id: localAgentId }).eq("id", number.id).eq("company_id", companyId).select("id").single();
        if (error || !saved) throw error || new Error("Assegnazione numero non salvata");
        result = { success: true };
        break;
      }

      case "link_phone_number": {
        if (!agent_id) throw new Error("agent_id richiesto (elevenlabs_agent_id)");
        if (!payload?.phone_number) throw new Error("phone_number richiesto");

        // Ownership check
        const own = await findOwnedAgentByElevenLabsId(adminClient, companyId, agent_id);
        if (!own) return json({ error: "Agente non trovato o non autorizzato" }, 403);
        const [{ data: v2Number, error: v2ReadError }, { data: legacyNumber, error: legacyReadError }] = await Promise.all([
          adminClient.from("ai_phone_numbers_v2").select("id, elevenlabs_phone_id")
            .eq("company_id", companyId).eq("numero", payload.phone_number).maybeSingle(),
          adminClient.from("ai_agent_phone_numbers").select("id, elevenlabs_phone_number_id")
            .eq("company_id", companyId).eq("phone_number", payload.phone_number).maybeSingle(),
        ]);
        if (v2ReadError || legacyReadError) throw v2ReadError || legacyReadError;
        if (!v2Number && !legacyNumber) return json({ error: "Numero non appartenente all'azienda" }, 403);

        // Chiave Telnyx: secret env prima, tabella dopo. In produzione la
        // tabella ha api_key_encrypted VUOTO e questo ramo falliva sempre con
        // "Telnyx non configurato" — con TELNYX_API_KEY sano a un metro.
        let elPhoneNumberId = v2Number?.elevenlabs_phone_id || legacyNumber?.elevenlabs_phone_number_id;
        if (!elPhoneNumberId) {
          // A retry after a local write failure must not import the same number twice.
          const existing = await elFetch("/convai/phone-numbers", "GET", apiKey);
          const remoteNumbers = Array.isArray(existing) ? existing : existing?.phone_numbers ?? [];
          const found = remoteNumbers.find((n: Record<string, unknown>) => normalizePhone(n.phone_number) === normalizePhone(payload.phone_number));
          elPhoneNumberId = found?.phone_number_id || found?.id;
        }
        if (!elPhoneNumberId) throw new Error("Importa prima questo numero in ElevenLabs come trunk SIP Telnyx e configura l'instradamento. La sola chiave API Telnyx non collega il numero.");

        // ── FIX F5 voce INBOUND ─────────────────────────────────────────────
        // Il create registra il numero su ElevenLabs ma NON lo assegna
        // all'agente: le chiamate outbound funzionavano, quelle IN ENTRATA
        // squillavano nel vuoto (nessun agente collegato al numero lato EL).
        // L'assegnazione esplicita chiude il cerchio: numero → agente.
        let inboundAssigned = false;
        if (elPhoneNumberId) {
          try {
            await elFetch(
              `/convai/phone-numbers/${elPhoneNumberId}`,
              "PATCH",
              apiKey,
              { agent_id },
            );
            inboundAssigned = true;
          } catch (assignErr) {
            console.error("[elevenlabs-proxy] assegnazione agente al numero fallita:", assignErr);
          }
        }

        // Salvataggio dell'id ElevenLabs sul record locale.
        //
        // 2026-08-18: prima l'id veniva scritto SOLO su ai_agent_phone_numbers
        // (il modello legacy) e SOLO se il chiamante passava local_phone_id.
        // Ma initiate-outbound-call legge PRIMA ai_phone_numbers_v2, il modello
        // nuovo usato dalla UI Agenti AI: un numero agganciato dal percorso v2
        // restava quindi senza id ElevenLabs, e ogni chiamata moriva con
        // "Nessun numero di telefono configurato per questo agente" — con il
        // numero però gia' acquistato e fatturato sia su Telnyx sia su
        // ElevenLabs. Ora l'id finisce su ENTRAMBI i modelli.
        if (elPhoneNumberId) {
          if (legacyNumber) {
            const { error: legacyWriteError } = await adminClient
              .from("ai_agent_phone_numbers")
              .update({ elevenlabs_phone_number_id: elPhoneNumberId })
              .eq("id", legacyNumber.id)
              .eq("company_id", companyId);
            if (legacyWriteError) throw legacyWriteError;
          }

          // Modello v2: match sul numero (l'unico dato sempre disponibile qui).
          // Se non esiste una riga v2 per questo numero l'update non tocca
          // nulla — nessun errore, il percorso legacy resta valido.
          const { error: v2Err, count: v2Count } = await adminClient
            .from("ai_phone_numbers_v2")
            .update(
              { elevenlabs_phone_id: elPhoneNumberId, ...(own.v2AgentId && inboundAssigned ? { agent_id: own.v2AgentId } : {}) },
              { count: "exact" },
            )
            .eq("company_id", companyId)
            .eq("numero", payload.phone_number);
          if (v2Err) {
            throw v2Err;
          } else {
            console.log(
              `[elevenlabs-proxy] id ElevenLabs propagato su ${v2Count ?? 0} riga/e v2 per ${payload.phone_number}`,
            );
          }
        }

        await auditLog(adminClient, companyId, null, userId, "link_phone_number", {
          phone_number: payload.phone_number,
          elevenlabs_phone_number_id: elPhoneNumberId,
          inbound_assigned: inboundAssigned,
        });

        result = { success: true, elevenlabs_phone_number_id: elPhoneNumberId, inbound_assigned: inboundAssigned };
        break;
      }

      default:
        return json({ error: `Azione non supportata: ${action}` }, 400);
    }

    return json(result);
  } catch (err: unknown) {
    if (err instanceof Response) return err;
    const message = err instanceof Error ? err.message : "Errore interno";
    console.error("elevenlabs-proxy error:", message);
    return json({ error: message }, 500);
  }
});

// --- Helpers ---

async function elFetch(path: string, method: string, apiKey: string, body?: unknown) {
  const opts: RequestInit = {
    method,
    signal: AbortSignal.timeout(30_000),
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
    },
  };
  if (body && method !== "GET") opts.body = JSON.stringify(body);

  const res = await fetch(`${EL_BASE}${path}`, opts);
  if (!res.ok) {
    const text = await res.text();
    throw new ElevenLabsApiError(res.status, text);
  }
  if (res.status === 204) return null;
  return res.json();
}

class ElevenLabsApiError extends Error {
  constructor(public status: number, detail: string) { super(`ElevenLabs API error ${status}: ${detail}`); }
}
function validMaxDuration(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 30 || value > 3600) {
    throw new Error("La durata massima deve essere tra 30 e 3600 secondi");
  }
  return value;
}

function validTemperature(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) throw new Error("Temperatura non valida: usa un valore tra 0 e 1");
  return value;
}
async function cleanupTools(apiKey: string, ids: string[]) {
  for (const id of ids) {
    try { await elFetch(`/convai/tools/${id}`, "DELETE", apiKey); }
    catch { console.warn("Pulizia strumento ElevenLabs incompleta"); }
  }
}

async function auditLog(
  client: SupabaseClient,
  companyId: string,
  agentId: string | null,
  userId: string,
  action: string,
  details: Record<string, unknown>
) {
  await client.from("ai_agent_audit_log").insert({
    company_id: companyId,
    agent_id: agentId,
    user_id: userId,
    action,
    details,
  });
}

/** Gli id dei tool EL salvati nel tools_config locale (v2, poi legacy). */
async function toolIdsPrecedenti(
  client: SupabaseClient,
  ownership: { legacyAgentId: string | null; v2AgentId: string | null },
): Promise<string[]> {
  if (ownership.v2AgentId) {
    const { data } = await client.from("ai_agents_v2").select("tools_config").eq("id", ownership.v2AgentId).maybeSingle();
    const ids = (data as { tools_config?: { elevenlabs_tool_ids?: string[] } } | null)?.tools_config?.elevenlabs_tool_ids;
    if (Array.isArray(ids)) return ids.map(String);
  }
  if (ownership.legacyAgentId) {
    const { data } = await client.from("ai_agents").select("tools_config").eq("id", ownership.legacyAgentId).maybeSingle();
    const ids = (data as { tools_config?: { elevenlabs_tool_ids?: string[] } } | null)?.tools_config?.elevenlabs_tool_ids;
    if (Array.isArray(ids)) return ids.map(String);
  }
  return [];
}

async function findOwnedAgentByElevenLabsId(
  client: SupabaseClient,
  companyId: string,
  elevenlabsAgentId: string,
): Promise<{ legacyAgentId: string | null; v2AgentId: string | null } | null> {
  const [{ data: legacyAgent }, { data: v2Agent }] = await Promise.all([
    client
      .from("ai_agents")
      .select("id")
      .eq("elevenlabs_agent_id", elevenlabsAgentId)
      .eq("company_id", companyId)
      .maybeSingle(),
    client
      .from("ai_agents_v2")
      .select("id")
      .eq("elevenlabs_agent_id", elevenlabsAgentId)
      .eq("company_id", companyId)
      .maybeSingle(),
  ]);

  const legacyAgentId = (legacyAgent as { id?: string } | null)?.id ?? null;
  const v2AgentId = (v2Agent as { id?: string } | null)?.id ?? null;
  if (!legacyAgentId && !v2AgentId) return null;
  return { legacyAgentId, v2AgentId };
}

async function hasConversationAccess(
  client: SupabaseClient,
  companyId: string,
  elevenlabsConversationId: string,
): Promise<boolean> {
  const [{ data: legacyConversation }, { data: v2Conversation }] = await Promise.all([
    client
      .from("ai_agent_conversations")
      .select("id")
      .eq("elevenlabs_conversation_id", elevenlabsConversationId)
      .eq("company_id", companyId)
      .maybeSingle(),
    client
      .from("ai_conversations_v2")
      .select("id")
      .eq("elevenlabs_conversation_id", elevenlabsConversationId)
      .eq("company_id", companyId)
      .maybeSingle(),
  ]);

  return Boolean(
    (legacyConversation as { id?: string } | null)?.id ||
    (v2Conversation as { id?: string } | null)?.id,
  );
}

function normalizePhone(value: unknown): string {
  return String(value ?? "").replace(/[^\d+]/g, "");
}
