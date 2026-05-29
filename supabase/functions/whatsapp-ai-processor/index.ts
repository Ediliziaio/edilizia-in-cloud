// MP02 — whatsapp-ai-processor refactored con tool-calling + loop agentico.
// Sostituisce la pipeline a switch-case (941 righe pre-MP02).
//
// Flusso per ogni messaggio:
//   1. Load message + lock processing_status=processing
//   2. Identity via whatsapp-identity-router
//   3. Budget check (soft → gpt-4o-mini, hard → skip)
//   4. Media handling (audio → transcribe, image → analyze)
//   5. Build history (ultimi 10 turni)
//   6. Loop agentico max 3 iter: OpenAI + tool calls paralleli
//   7. Invio risposta via whatsapp-send
//   8. Consume budget + mark processed

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/headers.ts";
import {
  filterToolsByGrants,
  findTool,
  toOpenAISpec,
} from "./tools/registry.ts";
import { SYSTEM_PROMPT_OPERAIO } from "./prompts/system_operaio.ts";
import { SYSTEM_PROMPT_TITOLARE } from "./prompts/system_titolare.ts";
import { STR } from "./prompts/strings.ts";
// 🛡️ Anti chain-of-thought leak — strip tool names + opener narrativi prima
// di rispondere su WhatsApp (operai, titolari).
import { sanitizeAnswer } from "../_shared/structuredOutput.ts";
import { resolveIdentity } from "./identity.ts";
import { analyzeImage, transcribeAudio } from "./media.ts";
import { callOpenAI, type ChatMessage } from "./openai.ts";
import { InsufficientCreditsError } from "../_shared/ai-provider/index.ts";
import { checkBudget, consumeBudget, estimateCostEur } from "./budget.ts";
import { logToolCall } from "./observability.ts";
import type { ToolCtx } from "./tools/shared/types.ts";
import {
  buildOperationalSystemPrompt,
  filterOperationalTools,
  normalizeOperationalSettings,
} from "./settings.ts";
import {
  buildTriagePrompt,
  classifyOperationalMessage,
} from "./operationalTriage.ts";

const OPENAI_MODEL_DEFAULT = Deno.env.get("OPENAI_MODEL_DEFAULT") ?? "gpt-4o";
const MAX_ITERATIONS = 3;

/**
 * Comparison costant-time per evitare timing attacks su credenziali statiche.
 * Se le due stringhe hanno lunghezze diverse ritorna comunque false ma scorre
 * sull'intera lunghezza per non rivelare via timing dove avviene il mismatch.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

interface ProcessRequest {
  message_id: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // SECURITY (v8.6.74 — FIX B2): questa edge function gira con SERVICE_ROLE
  // e processa un messaggio WhatsApp arbitrario (costo OpenAI + send_whatsapp
  // come side-effect). Va chiamata SOLO da worker interni (whatsapp-webhook →
  // handlers/*) che possiedono INTERNAL_WORKER_KEY.
  //
  // PRIMA del fix: se INTERNAL_WORKER_KEY non era settato, il check era
  // bypassato con un warning → endpoint pubblico in pratica. Un attaccante
  // poteva chiamare /functions/v1/whatsapp-ai-processor con qualsiasi
  // message_id e far ripartire l'elaborazione AI (drain budget OpenAI +
  // possibile invio di messaggi WhatsApp duplicati).
  //
  // DOPO: se la env manca, restituiamo 503 (Service Unavailable) — non si
  // procede MAI senza chiave. Header check obbligatorio. Comparison
  // costant-time per evitare timing attacks.
  const workerKey = Deno.env.get("INTERNAL_WORKER_KEY");
  if (!workerKey) {
    console.error(
      "[whatsapp-ai-processor] FATAL: INTERNAL_WORKER_KEY non configurato. Edge function disabilitata per sicurezza.",
    );
    return new Response(
      JSON.stringify({ error: "service_unavailable", reason: "missing_worker_key" }),
      {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
  const provided = req.headers.get("x-internal-worker-key");
  if (!provided || !timingSafeEqual(provided, workerKey)) {
    console.warn("[whatsapp-ai-processor] worker key mismatch — rejecting");
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let body: ProcessRequest;
  try {
    body = (await req.json()) as ProcessRequest;
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  if (!body.message_id) {
    return json({ error: "missing_message_id" }, 400);
  }

  const { data: msg, error: msgErr } = await supabase
    .from("whatsapp_messages")
    .select(
      "id, company_id, wa_number_id, wa_message_id, from_phone, to_phone, message_type, content_text, media_url, media_storage_path, processing_status, metadata, ai_extracted_data, created_at",
    )
    .eq("id", body.message_id)
    .maybeSingle();

  if (msgErr || !msg) {
    return json({ error: "message_not_found" }, 404);
  }

  if (msg.processing_status && !["received", "processing"].includes(msg.processing_status)) {
    return json({ skip: "already_processed", status: msg.processing_status }, 200);
  }

  const { data: waNumberSettings } = msg.wa_number_id
    ? await supabase
      .from("ai_whatsapp_numbers")
      .select("operational_settings")
      .eq("id", msg.wa_number_id)
      .maybeSingle()
    : { data: null };
  const operationalSettings = normalizeOperationalSettings(
    waNumberSettings?.operational_settings,
  );

  // Lock ottimistico
  await supabase
    .from("whatsapp_messages")
    .update({ processing_status: "processing" })
    .eq("id", body.message_id)
    .eq("processing_status", "received");

  try {
    // ── MP-SILVIO-07 — conferma verifica canale (reverse-OTP) ─────────────────
    // Se il messaggio è un codice di verifica pendente per QUESTO numero,
    // colleghiamo il canale (verificato=true) e confermiamo. Gira PRIMA di tutto
    // (anche dell'identità operativa): il numero in verifica può non essere
    // ancora un operaio/profilo noto. Nessun match → si prosegue invariati.
    if (msg.message_type === "text" && (msg.content_text ?? "").trim()) {
      const canaleVerificato = await tryConfermaVerificaCanale(supabase, msg);
      if (canaleVerificato) {
        return markDone(supabase, body.message_id, "processed");
      }
    }

    let operationalTriage = classifyOperationalMessage({
      contentText: msg.content_text,
      messageType: msg.message_type,
    });
    await persistOperationalTriage(supabase, body.message_id, msg.ai_extracted_data, operationalTriage);

    // Identity (inline, no inter-function fetch)
    const identity = await resolveIdentity(supabase, msg.from_phone, msg.company_id);
    if (!identity.matched) {
      if (operationalSettings.unknown_worker_mode === "create_review_ticket") {
        await createUnknownWorkerTicket(supabase, msg);
      }
      await sendReply(
        msg,
        operationalSettings.unknown_worker_mode === "create_review_ticket"
          ? "Non ti riconosco ancora. Ho avvisato l'ufficio per collegare questo numero all'anagrafica corretta."
          : STR.operaio.unknown_user,
      );
      return markDone(supabase, body.message_id, "processed");
    }

    // ── MP-SILVIO-07 — hook multicanale (ADDITIVO, guardato) ──────────────────
    // Inoltra a silvio-canale-adapter SOLO i messaggi di TESTO che il bot
    // operativo non sa classificare (intent "unknown"): NON sono comandi
    // operativi (rapportino/ddt/foto/presenze/segnalazione/conferma/annulla),
    // che restano interamente sul flusso esistente.
    //
    // L'adapter verifica l'identità Silvio del numero (silvio_canali_identita,
    // verificato=true) e, se collegata, delega all'orchestratore che con
    // origine=whatsapp mette TUTTO in coda (approvazione in-app, nessuna
    // auto-esecuzione). forwardToSilvio() "prende in carico" il messaggio SOLO
    // se Silvio ha davvero accodato/eseguito qualcosa; in ogni altro caso
    // (numero non collegato a Silvio, nulla da fare, errore o timeout) ritorna
    // false e si PROSEGUE col bot operativo esistente — zero regressioni sul
    // webhook passato da Meta App Review.
    if (msg.message_type === "text" && operationalTriage.intent === "unknown") {
      const presoInCaricoDaSilvio = await forwardToSilvio(msg, msg.content_text ?? "");
      if (presoInCaricoDaSilvio) {
        return markDone(supabase, body.message_id, "processed");
      }
    }

    // Budget
    const budget = await checkBudget(supabase, msg.company_id);
    if (!budget.ok) {
      await sendReply(msg, budget.user_message);
      return markDone(supabase, body.message_id, "failed", "budget_exceeded");
    }

    // Media handling
    let userContent = msg.content_text ?? "";
    if (msg.message_type === "audio" && msg.media_storage_path) {
      try {
        const transcript = await transcribeAudio(supabase, msg.media_storage_path);
        userContent = `[Audio trascritto]: ${transcript}`;
      } catch (e) {
        console.error(JSON.stringify({ level: "error", fn: "transcribe", error: String(e) }));
        userContent = "[Audio non trascrivibile]";
      }
    } else if (msg.message_type === "image" && msg.media_url) {
      try {
        const hint = /ddt/i.test(userContent) ? "ddt" : "generic";
        const analysis = await analyzeImage(msg.media_url, hint as "ddt" | "generic");
        userContent = `[Immagine — analisi]: ${analysis}\n\nTesto dell'utente: ${msg.content_text ?? "(nessuno)"}`;
      } catch (e) {
        console.error(JSON.stringify({ level: "error", fn: "analyze", error: String(e) }));
        userContent = "[Immagine — analisi non disponibile]";
      }
    }

    operationalTriage = classifyOperationalMessage({
      contentText: userContent || msg.content_text,
      messageType: msg.message_type,
    });
    await persistOperationalTriage(supabase, body.message_id, msg.ai_extracted_data, operationalTriage);

    // History: ultimi 10 turni
    const { data: history } = await supabase
      .from("whatsapp_messages")
      .select("direction, content_text, created_at")
      .eq("company_id", msg.company_id)
      .eq("from_phone", msg.from_phone)
      .lt("created_at", msg.created_at ?? new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(10);

    const historyFormatted: ChatMessage[] = (history ?? [])
      .reverse()
      .filter((h) => h.content_text && h.content_text.trim().length > 0)
      .map((h) => ({
        role: h.direction === "inbound" ? "user" : "assistant",
        content: h.content_text ?? "",
      }));

    const systemPrompt =
      identity.kind === "titolare" || identity.kind === "admin"
        ? SYSTEM_PROMPT_TITOLARE
        : `${SYSTEM_PROMPT_OPERAIO}\n\n${buildOperationalSystemPrompt(operationalSettings)}\n\n${buildTriagePrompt(operationalTriage)}`;

    const messages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      ...historyFormatted,
      { role: "user", content: userContent },
    ];

    // Tool filter per role
    const grantedTools = filterToolsByGrants(identity.role_grants);
    const availableTools =
      identity.kind === "operaio"
        ? filterOperationalTools(grantedTools, operationalSettings)
        : grantedTools;
    const openaiTools = toOpenAISpec(availableTools);

    // Session
    let sessionId: string | null = null;
    const { data: existingSess } = await supabase
      .from("whatsapp_sessions")
      .select("id")
      .eq("phone_number", msg.from_phone)
      .eq("company_id", msg.company_id)
      .maybeSingle();
    if (existingSess) {
      sessionId = existingSess.id;
      await supabase
        .from("whatsapp_sessions")
        .update({ last_activity_at: new Date().toISOString() })
        .eq("id", sessionId);
    } else if (identity.user_id) {
      const { data: newSess } = await supabase
        .from("whatsapp_sessions")
        .insert({
          company_id: msg.company_id,
          phone_number: msg.from_phone,
          operaio_id: identity.user_id,
          last_activity_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      sessionId = newSess?.id ?? null;
    }

    const toolCtx: ToolCtx = {
      supabase,
      company_id: msg.company_id,
      user_id: identity.user_id,
      employee_id: identity.employee_id,
      phone: msg.from_phone,
      role_grants: identity.role_grants,
      locale: identity.locale,
      waNumberId: msg.wa_number_id ?? "",
      sessionId,
      kind: identity.kind,
    };

    const model = budget.model_override ?? OPENAI_MODEL_DEFAULT;
    // MP05 — routing per task_kind. Titolare/admin → modello premium per
    // ragionamento/tool calling complesso. Operaio/default → modello economico
    // (deepseek/haiku) configurato in ai_model_config.
    const taskKind =
      identity.kind === "titolare" || identity.kind === "admin"
        ? ("bot_operativo_titolare" as const)
        : ("bot_operativo_operaio" as const);
    const conv: ChatMessage[] = [...messages];
    let finalText: string | null = null;
    let totalTokensIn = 0;
    let totalTokensOut = 0;

    for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
      const resp = await callOpenAI({
        model: budget.model_override ? model : undefined,
        task_kind: taskKind,
        company_id: msg.company_id,
        wa_message_id: msg.id,
        messages: conv,
        tools: openaiTools.length > 0 ? openaiTools : undefined,
        tool_choice: openaiTools.length > 0 ? "auto" : undefined,
        temperature: 0.5,
        max_tokens: 800,
      });

      totalTokensIn += resp.usage?.prompt_tokens ?? 0;
      totalTokensOut += resp.usage?.completion_tokens ?? 0;

      const choice = resp.choices[0];
      const assistantMsg = choice.message;

      if (!assistantMsg.tool_calls || assistantMsg.tool_calls.length === 0) {
        finalText = assistantMsg.content ?? STR.shared.generic_error;
        break;
      }

      // Esegui tool in parallelo
      const results = await Promise.all(
        assistantMsg.tool_calls.map(async (tc) => {
          const tool = findTool(tc.function.name);
          if (!tool) {
            return {
              tool_call_id: tc.id,
              result: {
                ok: false,
                error: "tool_not_found",
                user_message: STR.shared.tool_unavailable,
              },
            };
          }
          // Re-check grants
          const hasGrants = tool.requires_grants.every((g) =>
            identity.role_grants.includes(g)
          );
          if (!hasGrants) {
            return {
              tool_call_id: tc.id,
              result: {
                ok: false,
                error: "forbidden",
                user_message: STR.shared.tool_unavailable,
              },
            };
          }

          let args: Record<string, unknown> = {};
          try {
            args = JSON.parse(tc.function.arguments);
          } catch {
            return {
              tool_call_id: tc.id,
              result: {
                ok: false,
                error: "invalid_args",
                user_message: STR.shared.generic_error,
              },
            };
          }

          const t0 = Date.now();
          let result;
          try {
            result = await tool.handler(toolCtx, args);
          } catch (e) {
            result = {
              ok: false as const,
              error: String(e),
              user_message: STR.shared.generic_error,
            };
          }
          const dur = Date.now() - t0;

          await logToolCall(supabase, {
            company_id: msg.company_id,
            wa_message_id: msg.id,
            tool_name: tc.function.name,
            role_kind: identity.kind,
            args,
            result,
            duration_ms: dur,
            model_used: model,
          });

          return { tool_call_id: tc.id, result };
        }),
      );

      conv.push(assistantMsg);
      for (const r of results) {
        conv.push({
          role: "tool",
          tool_call_id: r.tool_call_id,
          content: JSON.stringify(r.result),
        });
      }
    }

    if (!finalText) finalText = STR.operaio.max_iterations;

    // 🛡️ Sanitize: strip tool names ("send_attendance ritorna..."), opener
    // narrativi ("Ho i dati dai tool. Analizzo:") prima dell'invio WhatsApp.
    const sanitizedReply = sanitizeAnswer(finalText);
    if (sanitizedReply.wasModified) {
      console.warn(JSON.stringify({
        level: "warn", fn: "whatsapp-ai-processor",
        msg: "chain-of-thought leak rimosso prima dell'invio WhatsApp",
        wa_message_id: msg.id,
      }));
    }
    if (sanitizedReply.isFullyChainOfThought) {
      console.error(JSON.stringify({
        level: "error", fn: "whatsapp-ai-processor",
        msg: "risposta era TUTTA chain-of-thought, fallback generico",
        wa_message_id: msg.id,
      }));
      finalText = STR.operaio.max_iterations;
    } else {
      finalText = sanitizedReply.cleaned || finalText;
    }

    await sendReply(msg, finalText);

    const costEur = estimateCostEur(model, totalTokensIn, totalTokensOut);
    await consumeBudget(supabase, msg.company_id, costEur);

    return markDone(supabase, body.message_id, "processed");
  } catch (err) {
    // MP05-FIX — Gestione crediti insufficienti: messaggio user-friendly
    // senza rivelare modello o costo reale (F1-F3).
    if (err instanceof InsufficientCreditsError) {
      try {
        await sendReply(msg, err.user_message_it);
      } catch {
        // silent fail
      }
      return markDone(
        supabase,
        body.message_id,
        "failed",
        `credits_${err.reason}`,
      );
    }

    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(
      JSON.stringify({
        level: "error",
        fn: "whatsapp-ai-processor",
        msg: "uncaught",
        message_id: body.message_id,
        error: errorMsg,
      }),
    );
    try {
      await sendReply(msg, STR.shared.generic_error);
    } catch {
      // nada
    }
    return markDone(supabase, body.message_id, "failed", errorMsg);
  }
});

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function mergeOperationalTriage(
  value: unknown,
  triage: unknown,
): Record<string, unknown> {
  return {
    ...(isPlainRecord(value) ? value : {}),
    operational_triage: triage,
  };
}

async function persistOperationalTriage(
  supabase: SupabaseClient,
  id: string,
  existingExtractedData: unknown,
  triage: {
    intent: string;
    confidence: number;
  },
): Promise<void> {
  const { error } = await supabase
    .from("whatsapp_messages")
    .update({
      ai_intent: triage.intent,
      ai_confidence: triage.confidence,
      ai_extracted_data: mergeOperationalTriage(existingExtractedData, triage),
    })
    .eq("id", id);

  if (error) {
    console.warn(JSON.stringify({
      level: "warn",
      fn: "persistOperationalTriage",
      error: error.message,
      wa_message_id: id,
    }));
  }
}

async function markDone(
  supabase: SupabaseClient,
  id: string,
  status: "processed" | "failed" = "processed",
  error?: string,
): Promise<Response> {
  await supabase
    .from("whatsapp_messages")
    .update({
      processing_status: status,
      processing_error: error ?? null,
      processed_at: new Date().toISOString(),
    })
    .eq("id", id);
  return json({ ok: true, status }, 200);
}

interface MsgForSend {
  id?: string;
  wa_number_id: string | null;
  from_phone: string;
  content_text?: string | null;
  message_type?: string;
  company_id: string;
}

async function createUnknownWorkerTicket(
  supabase: SupabaseClient,
  msg: MsgForSend,
): Promise<void> {
  try {
    await supabase.from("support_tickets").insert({
      company_id: msg.company_id,
      titolo: "WhatsApp operativo: numero non riconosciuto",
      descrizione: [
        `Numero: ${msg.from_phone}`,
        `Tipo messaggio: ${msg.message_type ?? "sconosciuto"}`,
        msg.content_text ? `Messaggio: ${msg.content_text}` : null,
      ].filter(Boolean).join("\n"),
      categoria: "whatsapp_operativo",
      source: "whatsapp_operativo",
      stato: "aperto",
      urgenza: "media",
      channel_msg_id: msg.id ?? null,
    });
  } catch (e) {
    console.error(JSON.stringify({
      level: "warn",
      fn: "createUnknownWorkerTicket",
      error: String(e),
    }));
  }
}

/**
 * MP-SILVIO-07 — conferma di una verifica canale (reverse-OTP).
 *
 * Ritorna `true` se il testo era un codice valido e non scaduto per QUESTO
 * numero: il canale viene collegato (verificato=true) e la risposta è già stata
 * inviata. Additivo: nessun match → `false` e il flusso operativo prosegue
 * identico. Usa il client service_role del processor (nessun problema di RLS).
 */
async function tryConfermaVerificaCanale(
  supabase: SupabaseClient,
  msg: MsgForSend,
): Promise<boolean> {
  const code = (msg.content_text ?? "").trim().toUpperCase();
  // Codici = 6 hex maiuscoli (vedi RPC silvio_canale_avvia_verifica). Filtro a
  // monte: nessuna query per i messaggi che non possono essere un codice.
  if (!/^[0-9A-F]{6}$/.test(code)) return false;

  const digits = (msg.from_phone ?? "").replace(/[^0-9]/g, "");
  if (!digits) return false;
  const identificativo = `+${digits}`;

  const { data: row, error } = await supabase
    .from("silvio_canali_identita")
    .select("id, codice, codice_scadenza")
    .eq("canale", "whatsapp")
    .eq("identificativo", identificativo)
    .eq("verificato", false)
    .maybeSingle();
  if (error || !row || !row.codice) return false;
  if (String(row.codice).toUpperCase() !== code) return false;

  if (row.codice_scadenza && new Date(row.codice_scadenza).getTime() < Date.now()) {
    await sendReply(
      msg,
      "Il codice è scaduto. Generane uno nuovo in app: Impostazioni → Silvio → Canali.",
    );
    return true; // gestito: non passare al bot operativo
  }

  const { error: updErr } = await supabase
    .from("silvio_canali_identita")
    .update({
      verificato: true,
      verificato_at: new Date().toISOString(),
      codice: null,
      codice_scadenza: null,
    })
    .eq("id", row.id)
    .eq("verificato", false);
  if (updErr) return false;

  await sendReply(
    msg,
    "✅ Numero collegato a Silvio. Scrivimi qui le tue richieste: preparo tutto e tu confermi in app.",
  );
  return true;
}

/**
 * MP-SILVIO-07 — inoltro ADDITIVO a silvio-canale-adapter (canale WhatsApp).
 *
 * Ritorna `true` SOLO se Silvio ha preso in carico il messaggio (ha accodato o
 * eseguito qualcosa) e la risposta è già stata inviata all'utente. In tutti gli
 * altri casi ritorna `false` → il chiamante PROSEGUE col bot operativo
 * esistente, così il flusso storico non cambia mai:
 *   - numero non collegato a un'identità Silvio verificata (verifica_identita)
 *   - Silvio non aveva nulla da fare / non ha capito (fatto a vuoto, riformula)
 *   - errore HTTP, timeout o INTERNAL_WORKER_KEY mancante
 */
async function forwardToSilvio(msg: MsgForSend, testo: string): Promise<boolean> {
  const trimmed = (testo ?? "").trim();
  if (!trimmed) return false;

  const baseUrl = Deno.env.get("SUPABASE_URL")!;
  const workerKey = Deno.env.get("INTERNAL_WORKER_KEY") ?? "";
  // Senza chiave non possiamo autenticarci verso l'adapter → fallback al bot.
  if (!workerKey) return false;

  // L'identità Silvio è memorizzata in E.164 (con prefisso "+"), mentre il
  // "from" WhatsApp arriva in sole cifre. Normalizziamo per far combaciare la
  // RPC silvio_canale_risolvi_utente, che fa un match ESATTO su identificativo.
  const digits = (msg.from_phone ?? "").replace(/[^0-9]/g, "");
  if (!digits) return false;
  const identificativo = `+${digits}`;

  try {
    const res = await fetch(`${baseUrl}/functions/v1/silvio-canale-adapter`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-worker-key": workerKey,
      },
      body: JSON.stringify({
        canale: "whatsapp",
        identificativo,
        testo: trimmed,
        // Testo DIGITATO (non trascritto) → confidenza piena: senza questo
        // l'adapter tratterebbe l'input come incerto e risponderebbe sempre
        // "riformula" (richiedeRiformulazione(undefined) === true).
        confidenza: 1,
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return false;

    const j = await res.json().catch(() => ({}));
    const azione = String(j?.azione ?? "");
    const inviati = Number(j?.dettaglio?.inviati ?? 0);
    const inCoda = Number(j?.dettaglio?.in_coda ?? 0);

    // Presa in carico SOLO se Silvio ha davvero accodato/eseguito qualcosa.
    const presoInCarico =
      (azione === "in_coda" || azione === "fatto") && inviati + inCoda > 0;
    if (!presoInCarico) return false;

    const messaggio = typeof j?.messaggio === "string" ? j.messaggio.trim() : "";
    if (!messaggio) return false;

    await sendReply(msg, messaggio);
    return true;
  } catch (e) {
    console.warn(
      JSON.stringify({ level: "warn", fn: "forwardToSilvio", error: String(e) }),
    );
    return false;
  }
}

async function sendReply(msg: MsgForSend, text: string): Promise<void> {
  const baseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  try {
    await fetch(`${baseUrl}/functions/v1/whatsapp-send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        wa_number_id: msg.wa_number_id,
        company_id: msg.company_id,
        to: msg.from_phone,
        text,
      }),
    });
  } catch (e) {
    console.error(
      JSON.stringify({ level: "error", fn: "sendReply", error: String(e) }),
    );
  }
}
