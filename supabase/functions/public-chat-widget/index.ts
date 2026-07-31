/**
 * public-chat-widget — endpoint pubblico (anon) per chatbot embeddable
 *
 * NO AUTH richiesta. Usa widget_token come company tenant identifier.
 * Rate limit per visitor_token + IP.
 *
 * Endpoints:
 *   POST { action: 'init', widget_token, source_page, utm } → { session_id, welcome }
 *   POST { action: 'message', session_id, content } → { response, qualified? }
 */
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";
import { aiRouterComplete, type AiRouterMessage } from "../_shared/aiRouter.ts";
// 🛡️ Anti chain-of-thought leak — strip tool names + opener narrativi prima
// di mostrare la risposta nel widget pubblico (visitatori sito).
import { sanitizeAnswer } from "../_shared/structuredOutput.ts";
// Strumenti cliente condivisi coi canali voce/WhatsApp. Qui SOLO il subset
// pubblico (CUSTOMER_TOOL_SPECS_PUBBLICHE): il visitatore web è anonimo e il
// telefono è DIGITATO, non verificato → mai strumenti che rivelano dati
// (stato consegna/preventivo), solo quelli che ne creano (appuntamenti,
// richiamo, ricerca listino).
import {
  CUSTOMER_TOOL_SPECS_PUBBLICHE,
  eseguiCustomerTool,
  suffissoTelefono,
  type CustomerToolCtx,
} from "../_shared/ediliziaCustomerTools.ts";

const SYSTEM_PROMPT = `Sei un assistente virtuale per un'azienda edile italiana. Il tuo compito è:
1. Rispondere a domande generali sui servizi (preventivi, lavori, tempistiche)
2. Qualificare il visitatore: chiedi GENTILMENTE nome, email, telefono, tipo lavoro che lo interessa
3. Una volta raccolti almeno nome+email O nome+telefono → rispondi con "QUALIFY:" seguito da JSON con i dati

STRUMENTI REALI (usali, non promettere a vuoto):
- info_prodotto: verifica se un prodotto/materiale è in catalogo
- disponibilita: orari liberi in agenda per un giorno (data AAAA-MM-GG)
- fissa_appuntamento: prenota davvero un sopralluogo (chiedi PRIMA nome e telefono, poi data e ora)
- richiesta_richiamo: lascia all'ufficio la richiesta di essere richiamati (serve il telefono)
Per appuntamenti e richiami RACCOGLI SEMPRE prima nome e telefono: senza, l'ufficio non può confermare.

REGOLE:
- Tono cordiale, professionale, italiano corretto
- Massimo 2 domande per messaggio
- NON inventare prezzi precisi (di' "ti contatteremo entro 24h con un preventivo")
- NON puoi dare informazioni su pratiche, consegne o preventivi esistenti: per quelle invita a chiamare o farsi richiamare
- Se utente fornisce email/telefono e nome → considera qualificato
- Se 8+ messaggi senza qualificare → suggerisci contatto diretto

OUTPUT FORMAT:
- Risposta normale: testo libero
- Quando qualifichi: includi "QUALIFY:{\\"name\\":\\"...\\",\\"email\\":\\"...\\",\\"phone\\":\\"...\\",\\"intent\\":\\"preventivo|info|demo|altro\\"}"
  alla fine del messaggio (verrà rimosso dal display)`;

interface InitBody {
  action: "init";
  widget_token: string;
  source_page?: string;
  source_referrer?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  visitor_token: string;
}

interface MessageBody {
  action: "message";
  session_id: string;
  visitor_token: string;
  content: string;
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: CORS,
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let body: InitBody | MessageBody;
  try {
    body = await req.json();
  } catch {
    return jsonError("invalid_json");
  }

  // Estrai IP visitor (best-effort dietro CDN)
  const forwarded = req.headers.get("x-forwarded-for") ?? "";
  const visitorIp = forwarded.split(",")[0].trim() || null;
  const ua = req.headers.get("user-agent") || null;

  if (body.action === "init") {
    return await handleInit(supabase, body, visitorIp, ua);
  }
  if (body.action === "message") {
    return await handleMessage(supabase, body);
  }
  return jsonError("invalid_action");
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleInit(supabase: any, body: InitBody, ip: string | null, ua: string | null): Promise<Response> {
  // Risolvi config widget
  const { data: configRes } = await supabase.rpc("get_chatbot_config", {
    p_widget_token: body.widget_token,
  });
  const config = configRes as { ok: boolean; company_id?: string; welcome_message?: string; bot_name?: string; primary_color?: string; error?: string };
  if (!config?.ok) {
    return jsonError(config?.error ?? "widget_not_found", 404);
  }

  // Crea sessione
  const { data: session, error } = await supabase
    .from("public_chat_sessions")
    .insert({
      company_id: config.company_id,
      visitor_token: body.visitor_token,
      visitor_ip: ip,
      visitor_user_agent: ua,
      source_page: body.source_page,
      source_referrer: body.source_referrer,
      utm_source: body.utm_source,
      utm_medium: body.utm_medium,
      utm_campaign: body.utm_campaign,
    })
    .select("id")
    .single();

  if (error) {
    return jsonError(`session_create: ${error.message}`, 500);
  }

  // Insert welcome message
  await supabase.from("public_chat_messages").insert({
    session_id: session.id,
    company_id: config.company_id,
    role: "assistant",
    content: config.welcome_message,
  });

  return jsonOk({
    session_id: session.id,
    welcome: config.welcome_message,
    bot_name: config.bot_name,
    primary_color: config.primary_color,
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleMessage(supabase: any, body: MessageBody): Promise<Response> {
  // Verify session
  const { data: session } = await supabase
    .from("public_chat_sessions")
    .select("*")
    .eq("id", body.session_id)
    .eq("visitor_token", body.visitor_token)
    .single();

  if (!session) {
    return jsonError("session_invalid", 401);
  }
  if (session.status !== "active" && session.status !== "qualified") {
    return jsonError("session_closed", 400);
  }

  // Rate limit semplice
  if (session.message_count > 30) {
    return jsonError("session_message_limit", 429);
  }

  // Save user message
  await supabase.from("public_chat_messages").insert({
    session_id: body.session_id,
    company_id: session.company_id,
    role: "user",
    content: body.content,
  });

  // Get history
  const { data: history } = await supabase
    .from("public_chat_messages")
    .select("role, content")
    .eq("session_id", body.session_id)
    .order("created_at", { ascending: true })
    .limit(20);

  const messages: AiRouterMessage[] = [
    { role: "system" as const, content: SYSTEM_PROMPT },
    ...((history ?? []) as Array<{ role: string; content: string }>).map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
  ];

  // Contesto per gli strumenti: il telefono è quello DICHIARATO dal visitatore
  // in sessione (non verificato) — sufficiente per creare appuntamenti/task,
  // mai usato per rivelare dati (subset pubblico degli strumenti).
  const telefonoDichiarato = String(session.collected_phone ?? "");
  const toolCtx: CustomerToolCtx = {
    rawPhone: telefonoDichiarato,
    suffix: suffissoTelefono(telefonoDichiarato),
    fallbackCreatedBy: null,
  };

  // AI call con loop tool (max 3 giri): il router inoltra `tools` a OpenRouter
  // e restituisce i tool_calls in rawResponse.
  let aiText = "";
  try {
    const conv: AiRouterMessage[] = [...messages];
    for (let iter = 0; iter < 3; iter++) {
      const aiRes = await aiRouterComplete({
        supabase,
        taskKey: "public_chat",
        messages: conv,
        params: {
          temperature: 0.4,
          max_tokens: 500,
          tools: CUSTOMER_TOOL_SPECS_PUBBLICHE,
          tool_choice: "auto",
        },
        companyId: session.company_id,
        personaKey: "sales",
        estimatedCostEur: 0.005,
      });
      const choice = (aiRes.rawResponse as {
        choices?: Array<{ message?: { content?: string | null; tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }> } }>;
      })?.choices?.[0];
      const toolCalls = choice?.message?.tool_calls;
      if (!toolCalls || toolCalls.length === 0) {
        aiText = aiRes.content || choice?.message?.content || "";
        break;
      }
      conv.push(choice!.message as unknown as AiRouterMessage);
      for (const tc of toolCalls) {
        let args: Record<string, unknown> = {};
        try { args = JSON.parse(tc.function.arguments); } catch { /* args vuoti */ }
        let result;
        try {
          result = await eseguiCustomerTool(supabase, session.company_id, toolCtx, tc.function.name, args);
        } catch (e) {
          console.error("widget_tool_error", tc.function.name, e);
          result = { risposta: "Strumento momentaneamente non disponibile: proponi il contatto diretto." };
        }
        conv.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(result) });
      }
    }
    if (!aiText) {
      aiText = "Ho registrato la tua richiesta: ti ricontatteremo al più presto. Posso aiutarti con altro?";
    }
  } catch (e) {
    aiText = "Mi dispiace, c'è stato un problema tecnico. Riprovo? Oppure puoi contattarci direttamente.";
    console.error("ai_error", e);
  }

  // Estrai QUALIFY directive se presente
  const qualifyMatch = aiText.match(/QUALIFY:(\{[^}]+\})/);
  let qualified = false;
  let displayText = aiText;
  if (qualifyMatch) {
    displayText = aiText.replace(/QUALIFY:\{[^}]+\}/, "").trim();
    try {
      const data = JSON.parse(qualifyMatch[1]);
      // Aggiorna sessione con dati raccolti
      await supabase
        .from("public_chat_sessions")
        .update({
          collected_name: data.name ?? session.collected_name,
          collected_email: data.email ?? session.collected_email,
          collected_phone: data.phone ?? session.collected_phone,
          collected_intent: data.intent ?? session.collected_intent,
          last_message_at: new Date().toISOString(),
        })
        .eq("id", body.session_id);

      // Trigger qualification (crea contact)
      const { data: qualRes } = await supabase.rpc("silvio_tool_qualify_public_lead", {
        p_session_id: body.session_id,
      });
      qualified = (qualRes as { ok?: boolean } | null)?.ok ?? false;
    } catch (e) {
      console.error("qualify_parse_error", e);
    }
  }

  // 🛡️ Sanitize displayText prima di salvare/mostrare al visitatore.
  // Il widget pubblico è il primo touchpoint: zero tolerance per leak.
  const sanitizedDisplay = sanitizeAnswer(displayText);
  if (sanitizedDisplay.wasModified) {
    console.warn("[public-chat-widget] CoT leak rimosso prima della risposta al visitatore");
  }
  if (sanitizedDisplay.isFullyChainOfThought) {
    console.error("[public-chat-widget] risposta era TUTTA CoT, fallback generico");
    displayText = "Mi dispiace, posso aiutarti meglio con una domanda più specifica. Cosa ti interessa di Edilizia in Cloud?";
  } else {
    displayText = sanitizedDisplay.cleaned || displayText;
  }

  // Save assistant message
  await supabase.from("public_chat_messages").insert({
    session_id: body.session_id,
    company_id: session.company_id,
    role: "assistant",
    content: displayText,
  });

  // Bump counter
  await supabase
    .from("public_chat_sessions")
    .update({
      message_count: (session.message_count ?? 0) + 2,
      last_message_at: new Date().toISOString(),
    })
    .eq("id", body.session_id);

  return jsonOk({ response: displayText, qualified });
}

function jsonOk(body: unknown): Response {
  return new Response(JSON.stringify({ ok: true, ...((body as object) ?? {}) }), {
    status: 200,
    headers: CORS,
  });
}

function jsonError(error: string, status = 400): Response {
  return new Response(JSON.stringify({ ok: false, error }), {
    status,
    headers: CORS,
  });
}
