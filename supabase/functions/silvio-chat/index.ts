/**
 * Edge Function: silvio-chat
 *
 * Bridge Internal Chat (Chat Team) ↔ Silvio (meta-persona orchestrator AI).
 * Supporta TOOL CALLING: Silvio invoca tool RPC su dati reali aziendali
 * (commesse, fatture, cashflow, preventivi, clienti) via OpenRouter
 * function-calling capability.
 *
 * Flow:
 *   1. Auth → user_id, company_id
 *   2. Verifica channel silvio-ai + membership + RBAC
 *   3. Carica Silvio system_prompt + ruolo utente
 *   4. Costruisci messages: system + history + user
 *   5. Loop tool-calling (max 4 iterazioni):
 *      a. Chiama OpenRouter con tools[]
 *      b. Se LLM ritorna tool_calls → esegui server-side
 *      c. Aggiungi tool messages e ricallia LLM
 *      d. Se LLM ritorna content finale → esci dal loop
 *   6. Posta risposta finale in internal_chat_messages
 */

import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { requireAuth, requireCompanyAccess } from "../_shared/auth.ts";
import { aiRouterComplete } from "../_shared/aiRouter.ts";
import { getToolsForChannel, toolsToOpenAISpec, type ToolContext } from "../_shared/silvioTools.ts";
import { executeToolWithRouting } from "../_shared/silvioToolExecution.ts";
import { buildEnrichedSystemPrompt } from "../_shared/promptBuilder.ts";
import { buildStableAiIdempotencyKey } from "../_shared/directAiLedger.ts";
import { buildPreRagContext, type RagSource } from "../_shared/ragInjector.ts";
import { validateCitations, getCitationMode } from "../_shared/citationValidator.ts";
// MP-04: structured output per CoT + confidence
import {
  AI_RESPONSE_SCHEMA,
  parseStructuredResponse,
  type StructuredAiResponse,
} from "../_shared/structuredOutput.ts";
// MP-09: auto-delegate al Council orchestrator quando la query è multi-area
import { classifyQuery, type QueryClassification } from "../_shared/queryClassifier.ts";

const SILVIO_SENDER_ID = "00000000-0000-0000-0000-000000000002";
const PERSONA_KEY = "silvio";
const MAX_HISTORY = 12;
// FIX 18 (A5): aumentato 4 → 6. Workflow complessi (es. "estrai DDT, cerca
// fornitore, controlla saldo, proponi azione") richiedono ≥5 tool sequenziali.
// Limite alzato cautamente: con MAX 6 iterazioni il modello ha più spazio per
// catene di reasoning, ma resta protetto contro loop infiniti.
const MAX_TOOL_ITERATIONS = 6;

interface ChatAttachment {
  /** Path nel bucket silvio-uploads (es. "<company>/<user>/<ts>-foto.jpg") */
  storage_path: string;
  /** MIME type (image/png, application/pdf, audio/webm, ...) */
  mime_type: string;
  /** Nome originale del file mostrato all'utente */
  file_name: string;
  /** Categoria semantica per il modello */
  kind: "image" | "pdf" | "audio" | "text-doc" | "office-doc" | "other";
}

interface ChatPayload {
  channel_id: string;
  message: string;
  attachments?: ChatAttachment[];
  /**
   * AI Test Lab — modello scelto dall'utente demo nel selettore UI.
   * Validato server-side via isModelAllowed regex; ignorato se non demo.
   */
  model?: string;
}

// AI Test Lab — gating server-side
const AI_TEST_LAB_DEMO_COMPANY_ID = "778a2c76-1253-49f2-a5e8-283363ac3e29";
const AI_TEST_LAB_DEMO_USER_EMAIL = "demo@azienda.srl";

// Whitelist regex — coerente con frontend OPENROUTER_ALLOWED_PATTERNS (models.config.ts)
// Catch-all per provider: tutti i modelli del provider sono accettati.
const AI_TEST_LAB_ALLOWED_PATTERNS: RegExp[] = [
  /^moonshotai\//,
  /^anthropic\//,
  /^openai\//,
  /^google\/(gemini|gemma)/,
  /^deepseek\//,
  /^x-ai\//,
  /^meta-llama\//,
  /^mistralai\//,
  /^cohere\//,
  /^qwen\//,
  /^perplexity\//,
  /^nvidia\//,
  /^microsoft\//,
  /^amazon\/nova/,
  /^liquid\//,
  /^inflection\//,
  /^thudm\//,
  /^z-ai\//,
];
const AI_TEST_LAB_EXCLUDE_PATTERNS: RegExp[] = [
  /:free$/i,
  /-vision$/i,
];
function isAITestLabModelAllowed(modelId?: string | null): boolean {
  if (!modelId) return false;
  if (AI_TEST_LAB_EXCLUDE_PATTERNS.some((re) => re.test(modelId))) return false;
  return AI_TEST_LAB_ALLOWED_PATTERNS.some((re) => re.test(modelId));
}

// ─────────────────────────────────────────────────────────────────────────────
// FIX 10 (A3): hash messaggio per RBAC audit log senza esporre PII.
// Il messaggio integro PUÒ contenere dati sensibili (nomi cliente, importi,
// dati sanitari, password). Per compliance GDPR + AI Act, salviamo solo:
//   - lunghezza
//   - SHA-256 troncato (64 bit) — sufficient per detecting duplicati
//   - prima parola (max 20 char) per debugging tipologia tentativo
// ─────────────────────────────────────────────────────────────────────────────
async function hashMessageForAudit(rawMessage: string): Promise<string> {
  const trimmed = (rawMessage ?? "").trim();
  if (!trimmed) return "[empty]";
  const len = trimmed.length;
  const firstWord = trimmed.split(/\s+/)[0]?.substring(0, 20) ?? "";
  const encoder = new TextEncoder();
  const data = encoder.encode(trimmed);
  const hashBuf = await crypto.subtle.digest("SHA-256", data);
  const hashArr = Array.from(new Uint8Array(hashBuf));
  const hashHex = hashArr.slice(0, 8).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `[len:${len}|sha:${hashHex}|w0:${firstWord}]`;
}

function hasUnsafeStoragePathSegment(storagePath: string): boolean {
  return (
    !storagePath ||
    storagePath.startsWith("/") ||
    storagePath.includes("\\") ||
    storagePath.split("/").some((segment) => segment === ".." || segment === "")
  );
}

function isAuthorizedSilvioUploadPath(storagePath: string, companyId: string, userId: string): boolean {
  const clean = String(storagePath ?? "").trim();
  if (hasUnsafeStoragePathSegment(clean)) return false;
  return clean.startsWith(`${companyId}/`) || clean.startsWith(`${userId}/`);
}

function attachmentLogLabel(storagePath: string): string {
  const clean = String(storagePath ?? "").replace(/\\/g, "/");
  return clean.split("/").pop()?.slice(0, 80) || "allegato";
}

serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405, corsHeaders);

  try {
    const auth = await requireAuth(req, corsHeaders);
    const userId = auth.userId;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabaseAdmin = auth.supabaseAdmin as any;

    const body = (await req.json()) as ChatPayload;
    const channelId = body?.channel_id?.trim();
    const userMessage = body?.message?.trim() ?? "";
    const attachments: ChatAttachment[] = Array.isArray(body?.attachments) ? body.attachments : [];

    // ── AI Test Lab — accept body.model SOLO per Demo Azienda + utente demo ──
    // Per tutti gli altri tenant il campo viene ignorato (sicurezza server-side).
    let aiTestLabForceModel: string | undefined = undefined;

    if (!channelId) return errorResponse("channel_id mancante", 400, corsHeaders);
    // userMessage può essere vuoto se ci sono allegati (es. solo foto)
    if (!userMessage && attachments.length === 0) {
      return errorResponse("message o attachments mancanti", 400, corsHeaders);
    }
    if (userMessage.length > 8000) return errorResponse("message troppo lungo (max 8000 char)", 400, corsHeaders);
    if (attachments.length > 5) return errorResponse("massimo 5 allegati per messaggio", 400, corsHeaders);
    for (const a of attachments) {
      if (!a.storage_path || !a.mime_type || !a.kind) {
        return errorResponse("attachment incompleto (manca storage_path/mime_type/kind)", 400, corsHeaders);
      }
      if (a.storage_path.length > 600) {
        return errorResponse("attachment storage_path troppo lungo", 400, corsHeaders);
      }
    }

    // ── 1) Verifica channel + membership ────────────────────────────────
    const { data: channel } = await supabaseAdmin
      .from("internal_chat_channels")
      .select("id, name, company_id, dm_user_ids")
      .eq("id", channelId)
      .maybeSingle();

    if (!channel) return errorResponse("Canale non trovato", 404, corsHeaders);
    if (channel.name !== "silvio-ai") return errorResponse("Canale non è Silvio", 400, corsHeaders);

    const companyId: string = channel.company_id;
    await requireCompanyAccess(supabaseAdmin, userId, companyId, corsHeaders);

    // ── AI Test Lab — server-side gating del body.model ───────────────────
    // Resolve user email per la conferma; ignora il param se NON demo.
    if (companyId === AI_TEST_LAB_DEMO_COMPANY_ID && body?.model) {
      try {
        const { data: u } = await supabaseAdmin.auth.admin.getUserById(userId);
        const userEmail = (u as { user?: { email?: string } } | null)?.user?.email?.toLowerCase();
        if (
          userEmail === AI_TEST_LAB_DEMO_USER_EMAIL &&
          isAITestLabModelAllowed(body.model)
        ) {
          aiTestLabForceModel = body.model;
        } else {
          console.warn("[silvio-chat] AI Test Lab: model param ignorato (non demo user o modello non in whitelist)");
        }
      } catch (e) {
        console.warn("[silvio-chat] AI Test Lab gating skip:", e instanceof Error ? e.message : e);
      }
    }

    for (const a of attachments) {
      if (!isAuthorizedSilvioUploadPath(a.storage_path, companyId, userId)) {
        return errorResponse("attachment non autorizzato per questa azienda/utente", 403, corsHeaders);
      }
    }

    const { data: membership } = await supabaseAdmin
      .from("internal_chat_members")
      .select("user_id")
      .eq("channel_id", channelId)
      .eq("user_id", userId)
      .maybeSingle();

    if (!membership) return errorResponse("Utente non membro del canale", 403, corsHeaders);

    // ── 2) Persona Silvio ───────────────────────────────────────────────
    const { data: persona } = await supabaseAdmin
      .from("ai_personas")
      .select("system_prompt, recommended_tier_key, recommended_model, enabled, kb_areas_filter, system_prompt_version")
      .eq("persona_key", PERSONA_KEY)
      .maybeSingle();

    if (!persona) return errorResponse("Silvio non configurato", 500, corsHeaders);
    if (!persona.enabled) return errorResponse("Silvio temporaneamente disabilitato", 503, corsHeaders);

    // ── 3) RBAC check ───────────────────────────────────────────────────
    const { data: rbacResult } = await supabaseAdmin.rpc("can_user_use_persona", {
      p_user_id: userId,
      p_persona_key: PERSONA_KEY,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rbac = rbacResult as any;
    if (!rbac?.allowed) {
      // FIX 10 (A3): hash messaggio per evitare PII in audit log
      const hashedMessage = await hashMessageForAudit(userMessage);
      await supabaseAdmin.rpc("log_rbac_violation", {
        p_company_id: companyId,
        p_user_id: userId,
        p_attempted_persona: PERSONA_KEY,
        p_user_role: null,
        p_attempted_message: hashedMessage,
        p_reason: rbac?.reason ?? "unknown",
        p_client_ip: req.headers.get("x-forwarded-for") ?? null,
        p_user_agent: req.headers.get("user-agent") ?? null,
      });
      // FIX 11 (A4): messaggio RBAC actionable con required_roles + current_roles
      const rbacReason: string = String(rbac?.reason ?? "unknown");
      const personaLabel: string = String(rbac?.persona_label ?? "Silvio");
      const requiredRoles: string[] = Array.isArray(rbac?.required_roles)
        ? rbac.required_roles.map((r: unknown) => String(r))
        : [];
      const currentRoles: string[] = Array.isArray(rbac?.current_roles)
        ? rbac.current_roles.map((r: unknown) => String(r))
        : [];

      let denialContent = `🚫 Non posso aiutarti su ${personaLabel} con il tuo ruolo attuale.`;
      if (rbacReason === "no_roles") {
        denialContent = `🚫 Il tuo account non ha ruoli assegnati. Chiedi all'amministratore di assegnarti un ruolo per usare ${personaLabel}.`;
      } else if (rbacReason === "persona_disabled") {
        denialContent = `⏸️ ${personaLabel} è temporaneamente disabilitato dall'amministratore. Riprova più tardi.`;
      } else if (rbacReason === "explicit_deny") {
        denialContent = `🚫 L'amministratore ha esplicitamente negato l'accesso a ${personaLabel} per il tuo account. Contattalo per chiarimenti.`;
      } else if (rbacReason === "not_in_allowed_roles" && requiredRoles.length > 0) {
        const reqList = requiredRoles.join(", ");
        const curList = currentRoles.length > 0 ? currentRoles.join(", ") : "nessuno";
        denialContent = `🚫 Per usare ${personaLabel} serve uno di questi ruoli: ${reqList}.\nIl tuo ruolo attuale: ${curList}.\nChiedi all'amministratore di estendere i permessi se necessario.`;
      }

      await supabaseAdmin.from("internal_chat_messages").insert({
        channel_id: channelId, sender_id: SILVIO_SENDER_ID, company_id: companyId,
        content: denialContent,
        message_type: "text",
      });
      return jsonResponse({
        ok: false,
        error: "rbac_denied",
        reason: rbacReason,
        required_roles: requiredRoles,
        current_roles: currentRoles,
      }, 200, corsHeaders);
    }

    // ── 4) Profile + role ───────────────────────────────────────────────
    const { data: profile } = await supabaseAdmin
      .from("profiles").select("first_name, last_name, email")
      .eq("id", userId).maybeSingle();
    const { data: userRoles } = await supabaseAdmin
      .from("user_roles").select("role").eq("user_id", userId);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const roleList: string[] = (userRoles ?? []).map((r: any) => r.role);
    const rolePriority = ["super_admin", "company_admin", "salesperson", "call_center", "company_staff", "employee", "subcontractor", "worker"];
    const primaryRole = rolePriority.find((p) => roleList.includes(p)) ?? roleList[0] ?? "company_staff";
    const userName = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || profile?.email || "Utente";

    const roleScopeMap: Record<string, string> = {
      super_admin: "Accesso completo a tutto.",
      company_admin: "Titolare/amministratore — può chiedere QUALSIASI cosa: finanza, cantieri, vendite, personale, legale, strategia.",
      company_staff: "Impiegato di staff — accesso a operations e amministrazione di base. Ha accesso a get_overdue_payments e get_revenue_forecast (gestione crediti). NO finanza globale (saldo banca, EBITDA).",
      salesperson: "Venditore — accesso a clienti/preventivi. NO finanza globale, NO HR di altri.",
      call_center: "Operatore call-center — accesso a info cliente in linea + FAQ. NO finanza, NO HR.",
      employee: "Dipendente — info proprie (presenze, ferie). NO altri dipendenti, NO finanza globale.",
      worker: "Operaio — info SUO cantiere assegnato. NO finanza, NO HR di altri, NO commerciale.",
      subcontractor: "Subappaltatore esterno — solo dati propri lavori. NO altre commesse, NO finanza, NO HR.",
    };
    const userScope = roleScopeMap[primaryRole] ?? "Accesso limitato — chiedi conferma per dati sensibili.";

    // ── 5) System prompt arricchito con contesto utente + tool guidance ─
    const userContextPrompt = [
      "",
      "# CONTESTO UTENTE CORRENTE (CRITICO per RBAC e personalizzazione)",
      `- Nome: ${userName}`,
      `- Ruolo: ${primaryRole}`,
      `- Perimetro: ${userScope}`,
      "",
      "# REGOLE DUE-DILIGENCE NEI DATI",
      "1. PRIMA di rispondere a domande SU DATI AZIENDALI (commesse, fatture, cashflow, clienti, ecc), DEVI invocare il tool appropriato. NON inventare numeri.",
      "2. Se un tool ritorna un errore o dati vuoti, dillo esplicitamente.",
      "3. Se la domanda è cross-area (es. 'posso assumere?'), invoca PIÙ tool e sintetizza.",
      "4. Se il dato richiesto NON è coperto dai tool, dillo: 'Per questa info devi consultare [area]'.",
      "5. Riporta SEMPRE i numeri reali dai tool, non arrotondamenti vaghi.",
      "6. Cita sempre la fonte (es. 'in base alle 41 commesse attive registrate').",
      "7. Se un tool ritorna data_quality.warnings, non trattare lo zero come certezza: spiega cosa manca e dai solo una lettura prudente.",
      "8. Se un tool ritorna priorita_recupero o campi priorita, usa quell'ordine per dire chi/cosa fare prima.",
      "9. Non nominare mai personas/consulenti interni nella risposta finale: rispondi come una sola regia, Silvio.",
      "10. Se un tool ritorna proposalId, _proposal o riskLevel yellow/red, l'azione NON è conclusa: dì che è pronta/in attesa di conferma, non che è stata eseguita.",
      "",
      "# REGOLA FORMATO",
      "- Numeri sempre formato italiano: € 1.234,56",
      "- Date sempre dd/mm/yyyy",
      "- Risposte concise (max 250 parole) salvo richiesta esplicita di approfondimento",
    ].join("\n");

    // ── 4.ter) Carica memoria long-term: facts azienda + sintesi recenti utente
    let memoryContextPrompt = "";
    try {
      const { data: memCtx } = await supabaseAdmin.rpc("silvio_get_memory_context", {
        p_company_id: companyId,
        p_user_id: userId,
        p_max_summaries: 3,
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ctx = memCtx as any;
      const facts = (ctx?.facts ?? []) as Array<{ key: string; value: unknown; confidence: number }>;
      const summaries = (ctx?.recent_summaries ?? []) as Array<{ period: { start: string; end: string }; summary: string; topics?: string[] }>;

      if (facts.length > 0 || summaries.length > 0) {
        const lines: string[] = ["", "# MEMORIA LONG-TERM (uso interno, non mostrare all'utente direttamente)"];
        if (facts.length > 0) {
          lines.push("## Fatti aziendali noti");
          for (const f of facts.slice(0, 20)) {
            lines.push(`- ${f.key}: ${JSON.stringify(f.value)} (confidence ${(f.confidence ?? 0).toFixed(2)})`);
          }
        }
        if (summaries.length > 0) {
          lines.push("## Conversazioni recenti con questo utente");
          for (const s of summaries) {
            lines.push(`- [${s.period.end}] ${s.summary}${s.topics?.length ? ` (topics: ${s.topics.join(", ")})` : ""}`);
          }
        }
        lines.push("");
        lines.push("REGOLA: usa questa memoria per CONTESTUALIZZARE le risposte. Es. se l'utente dice 'la solita banca' e sai che è Intesa, rispondi con quella. Se l'utente ricorda una decisione passata, conferma. NON dire mai 'come dicevamo' se non c'è coerenza con summaries.");
        memoryContextPrompt = lines.join("\n");
      }
    } catch (e) {
      console.warn("[silvio-chat] memory context fetch failed:", e);
    }

    // ── MP-01: Pre-RAG automatico ─────────────────────────────────────
    // Carica top-K chunk universali + company brain pertinenti alla query
    // PRIMA di chiamare il modello. Marker [S1], [S2]... iniettati nel prompt.
    let ragSources: RagSource[] = [];
    let ragMinSimilarity = 0;
    let ragContextBlock = "";
    try {
      const ragResult = await buildPreRagContext({
        supabase: supabaseAdmin,
        query: userMessage,
        companyId,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        kbAreasFilter: (persona as any).kb_areas_filter ?? null,
        topKUniversal: 3,
        topKCompany: 3,
      });
      ragSources = ragResult.sources;
      ragMinSimilarity = ragResult.minSimilarity;
      ragContextBlock = ragResult.contextBlock;
    } catch (e) {
      console.warn("[silvio-chat] pre-RAG failed (graceful):", e instanceof Error ? e.message : e);
    }

    // ── MP-02: promptBuilder centralizzato ───────────────────────────────
    // Unifica persona, preambolo, memoria, RAG, citation rules, structured
    // output e prompt A/B senza duplicare logica nelle singole edge function.
    const builtPrompt = await buildEnrichedSystemPrompt({
      supabase: supabaseAdmin,
      personaKey: PERSONA_KEY,
      basePrompt: persona.system_prompt,
      personaVersion: persona.system_prompt_version ?? null,
      recommendedTierKey: persona.recommended_tier_key ?? null,
      userContext: userContextPrompt,
      memoryContext: memoryContextPrompt,
      ragContextBlock,
      ragSourcesCount: ragSources.length,
      sessionId: channelId,
      companyId,
      userId,
    });
    const enrichedSystemPrompt = builtPrompt.systemPrompt;
    const preamboloVersion = builtPrompt.preamboloVersion;
    const useStructured = builtPrompt.useStructured;
    if (!preamboloVersion) {
      console.warn("[silvio-chat] preambolo costituzionale NON applicato (graceful degradation attiva)");
    }

    // ── 6) Carica history (ultimi 12 msg dalla chat) ────────────────────
    const { data: historyRaw } = await supabaseAdmin
      .from("internal_chat_messages")
      .select("sender_id, content, created_at")
      .eq("channel_id", channelId)
      .order("created_at", { ascending: false })
      .limit(MAX_HISTORY);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const history: Array<{ sender_id: string; content: string }> = (historyRaw ?? []).reverse() as any;

    // ── 7) Ottieni tool disponibili per il ruolo ────────────────────────
    const allowedTools = getToolsForChannel({
      channel: "internal_chat",
      role: primaryRole,
      personaKey: PERSONA_KEY,
    });
    const toolSchemas = toolsToOpenAISpec(allowedTools);

    const toolCtx: ToolContext = {
      supabase: supabaseAdmin,
      companyId,
      userId,
      primaryRole,
      personaKey: PERSONA_KEY,
      channel: "internal_chat",
      // Track 1: Silvio ha kb_areas_filter=NULL (vede tutte le aree).
      // Per coerenza passiamo il valore reale così il tool search_brain lo usa.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      kbAreasFilter: (persona as any).kb_areas_filter ?? null,
    };

    // ── 8) Costruisci messages iniziali ─────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const messages: any[] = [
      { role: "system", content: enrichedSystemPrompt },
      ...history.map((m) => ({
        role: m.sender_id === SILVIO_SENDER_ID ? "assistant" : "user",
        content: m.content,
      })),
    ];

    // Sprint AI Upload: se ci sono allegati di qualunque tipo (image/pdf/text/office),
    // costruiamo content multimodal (array). Per gli audio l'utente li avrà già
    // trascritti client-side via /silvio-transcribe-audio prima di inviare il
    // messaggio, quindi qui arrivano sempre come testo normale.
    let userContent: unknown = userMessage || "(allegati senza testo)";
    const visualAttachments = attachments.filter(
      (a) => a.kind === "image" || a.kind === "pdf" || a.kind === "text-doc" || a.kind === "office-doc",
    );
    if (visualAttachments.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const parts: any[] = [];
      const introNote = userMessage
        ? userMessage
        : "Analizza il file allegato e dimmi cosa contiene + cosa è rilevante per la mia attività edile.";
      parts.push({ type: "text", text: introNote });
      for (const att of visualAttachments) {
        if (att.kind === "image") {
          // Per immagini: signed URL passata direttamente al modello vision
          const { data: signed, error: sErr } = await supabaseAdmin.storage
            .from("silvio-uploads")
            .createSignedUrl(att.storage_path, 300);
          if (sErr || !signed?.signedUrl) {
            console.warn("[silvio-chat] signedUrl fallita per", attachmentLogLabel(att.storage_path), sErr?.message ?? sErr);
            continue;
          }
          parts.push({
            type: "image_url",
            image_url: { url: signed.signedUrl, detail: "high" },
          });
        } else if (att.kind === "pdf") {
          // Element 1 Sprint AI Uploads: estrazione testo PDF reale via
          // edge function silvio-extract-pdf (pdfjs-dist server-side).
          // Il testo viene iniettato nel prompt come blocco "[CONTENUTO PDF]".
          try {
            const { data: pdfRes, error: pdfErr } = await supabaseAdmin.functions.invoke(
              "silvio-extract-pdf",
              {
                body: { storage_path: att.storage_path, max_chars: 30_000 },
                headers: {
                  Authorization: req.headers.get("Authorization") ?? "",
                },
              },
            );
            const extracted = (pdfRes as {
              text?: string;
              pages_count?: number;
              truncated?: boolean;
              vision_fallback?: boolean;
              vision_error?: string;
              vision_model?: string;
            } | null) ?? null;
            // FIX 5 (C6): error message chiaro su PDF estrazione fallita.
            // Distinzione casi:
            //   1. RPC error → problema tecnico (storage/auth)
            //   2. text vuoto + vision_error → vision OCR fallito (timeout/budget)
            //   3. text vuoto + vision_fallback=false (no error) → PDF non scansione + non testo nativo (raro: probabilmente PDF protetto)
            //   4. text presente con vision_fallback=true → OK (OCR ha lavorato)
            //   5. text presente nativo → OK (estrazione standard)
            if (pdfErr) {
              console.warn("[silvio-chat] PDF extract RPC error:", pdfErr.message);
              parts.push({
                type: "text",
                text: `[ALLEGATO PDF "${att.file_name}" — IMPOSSIBILE LEGGERE]\nErrore tecnico: ${pdfErr.message.substring(0, 150)}.\nIstruzioni per Silvio: NON inventare contenuti del PDF. Chiedi all'utente di:\n1) verificare che il PDF sia accessibile (non protetto da password)\n2) se possibile, copiare/incollare il testo nel messaggio\n3) oppure scattare una foto chiara del documento.`,
              });
            } else if (!extracted?.text || extracted.text.length < 10) {
              const visionErr = extracted?.vision_error;
              const errorReason = visionErr
                ? `OCR vision fallito: ${visionErr}`
                : "PDF apparentemente vuoto, protetto da password, oppure contiene solo immagini non leggibili";
              parts.push({
                type: "text",
                text: `[ALLEGATO PDF "${att.file_name}" — CONTENUTO NON ESTRAIBILE]\n${errorReason}.\nIstruzioni per Silvio: NON inventare cosa contiene il PDF. Rispondi all'utente:\n"Mi dispiace, non riesco a leggere il PDF '${att.file_name}'. Possibili cause: PDF protetto da password, scansione di bassa qualità, o documento con solo immagini complesse. Soluzioni: copia/incolla il testo, scatta una foto chiara, oppure mandami un'export digitale (es. PDF generato da Word/Excel)."`,
              });
            } else {
              const truncatedNote = extracted.truncated ? " (testo troncato a 30K char)" : "";
              const sourceLabel = extracted.vision_fallback
                ? `OCR vision (${extracted.vision_model ?? "?"})`
                : `estrazione testo nativo`;
              parts.push({
                type: "text",
                text: `[CONTENUTO PDF "${att.file_name}" — ${extracted.pages_count ?? "?"} pagine · fonte: ${sourceLabel}${truncatedNote}]\n\n${extracted.text}\n\n[FINE PDF]`,
              });
            }
          } catch (pdfCatch) {
            const msg = pdfCatch instanceof Error ? pdfCatch.message : String(pdfCatch);
            console.warn("[silvio-chat] PDF extract exception:", msg);
            parts.push({
              type: "text",
              text: `[ALLEGATO PDF "${att.file_name}" — ERRORE TECNICO]\n${msg.substring(0, 200)}.\nIstruzioni per Silvio: NON inventare contenuti del PDF. Chiedi all'utente di riprovare tra qualche istante o di copiare/incollare il testo direttamente in chat.`,
            });
          }
        } else if (att.kind === "text-doc") {
          // .txt / .csv / .md / .json / .log / .xml — leggi come testo
          try {
            const docText = await downloadAsText(supabaseAdmin, att.storage_path, 30_000);
            parts.push({
              type: "text",
              text: `[CONTENUTO DOCUMENTO "${att.file_name}" (${att.mime_type})]\n\n${docText}\n\n[FINE DOCUMENTO]`,
            });
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            parts.push({
              type: "text",
              text: `[Allegato documento testo "${att.file_name}" — lettura fallita: ${msg.substring(0, 120)}]`,
            });
          }
        } else if (att.kind === "office-doc") {
          // .docx / .xlsx — estrazione via libreria esm
          try {
            const officeText = await extractOfficeDocument(
              supabaseAdmin,
              att.storage_path,
              att.mime_type,
              att.file_name,
            );
            parts.push({
              type: "text",
              text: `[CONTENUTO OFFICE "${att.file_name}"]\n\n${officeText.substring(0, 30_000)}\n\n[FINE OFFICE]`,
            });
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            parts.push({
              type: "text",
              text: `[Allegato office "${att.file_name}" — estrazione fallita: ${msg.substring(0, 120)}]`,
            });
          }
        }
      }
      userContent = parts;
    }

    // Aggiungi user message se non già presente come ultimo
    const lastHist = history[history.length - 1];
    const isDuplicate = typeof userContent === "string" && lastHist?.content === userContent;
    if (history.length === 0 || !isDuplicate) {
      messages.push({ role: "user", content: userContent });
    }

    // ── 8.5) MP-09: Auto-delegate al Council se la query è multi-area ───
    // Se la classificazione segnala is_multi_area + complexity != simple, invochiamo
    // ai-council-orchestrator. La sua synthesis diventa la response finale (skip tool loop).
    // Graceful degradation: ogni errore qui NON blocca la chat, fa fallback al flow normale.
    let councilData: {
      is_multi_area: boolean;
      involved_personas?: string[];
      involved_areas?: string[];
      estimated_complexity?: "simple" | "medium" | "complex";
      sub_outputs?: unknown[];
      synthesis_used?: boolean;
    } | null = null;
    let councilSynthesis: string | null = null;
    const ENABLE_COUNCIL_AUTO = Deno.env.get("ENABLE_COUNCIL_AUTO_DELEGATE") !== "false";
    if (
      ENABLE_COUNCIL_AUTO &&
      typeof userContent === "string" && // skip multi-modal (immagini/pdf): troppo costoso classificare
      userMessage.length >= 25 &&         // skip query troppo brevi (probabilmente conversational)
      attachments.length === 0
    ) {
      try {
        const classification: QueryClassification = await classifyQuery({
          supabase: supabaseAdmin,
          query: userMessage,
          currentPersona: PERSONA_KEY,
          companyId,
          userId,
        });
        if (classification.is_multi_area && classification.estimated_complexity !== "simple") {
          console.log(
            `[silvio-chat] MP-09 council auto-delegate: ${classification.involved_personas.length} personas, complexity=${classification.estimated_complexity}`,
          );
          const { data: councilRes, error: councilErr } = await supabaseAdmin.functions.invoke(
            "ai-council-orchestrator",
            {
              body: {
                query: userMessage,
                current_persona: PERSONA_KEY,
                company_id: companyId,
                max_personas: 4,
              },
              headers: { Authorization: req.headers.get("Authorization") ?? "" },
            },
          );
          if (councilErr) {
            console.warn("[silvio-chat] council invoke failed:", councilErr.message);
          } else if (councilRes && (councilRes as { multi_area?: boolean }).multi_area) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const r = councilRes as any;
            councilSynthesis = (r.synthesis as string | null) ?? null;
            councilData = {
              is_multi_area: true,
              involved_personas: r.classification?.involved_personas ?? [],
              involved_areas: r.classification?.involved_areas ?? [],
              estimated_complexity: r.classification?.estimated_complexity ?? "medium",
              sub_outputs: Array.isArray(r.sub_outputs) ? r.sub_outputs : [],
              synthesis_used: !!councilSynthesis,
            };
          }
        }
      } catch (e) {
        console.warn(
          "[silvio-chat] council auto-delegate fallita (graceful):",
          e instanceof Error ? e.message : String(e),
        );
      }
    }

    // ── 9) Tool-calling loop ────────────────────────────────────────────
    const idempotencyBase = await buildStableAiIdempotencyKey("silvio_chat", [
      companyId,
      channelId,
      userId,
      persona.system_prompt_version ?? null,
      messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
    ]);
    let finalContent = "";
    let lastResult: Awaited<ReturnType<typeof aiRouterComplete>> | null = null;
    let iteration = 0;
    const toolCallsLog: Array<{
      name: string;
      args: unknown;
      result_preview: string;
      proposal_id?: string | null;
      risk_level?: string | null;
    }> = [];

    // MP-09: se il council ha già prodotto la synthesis, usa quella come finalContent
    // e salta il tool-calling loop. Manteniamo gli altri flow (citation check, evidence,
    // structured output check) che girano normalmente più sotto.
    if (councilSynthesis && councilSynthesis.trim().length > 0) {
      finalContent = councilSynthesis;
    }

    // AI Test Lab — verifica supporto tools per il modello selezionato.
    // Da OpenRouter `/api/v1/models` la maggior parte dei modelli moderni
    // (Kimi K2.x, Anthropic, OpenAI, Google, DeepSeek, Llama 3.3+) supporta
    // nativamente `tools` + `tool_choice`. Disabilitiamo SOLO per modelli
    // legacy noti per tool-calling instabile.
    const PROVIDERS_NO_TOOLS_REGEX: RegExp[] = [
      /^meta-llama\/llama-(2|3\.0|3\.1)/,  // Llama 2 + 3.0/3.1 vecchi (tools instabili)
      /^thudm\/glm-4-9b/,                   // GLM-4 vecchio
    ];
    const effectiveModel = aiTestLabForceModel ?? persona.recommended_model ?? "";
    const skipToolsForModel = PROVIDERS_NO_TOOLS_REGEX.some((re) => re.test(effectiveModel));
    if (skipToolsForModel && toolSchemas.length > 0) {
      console.log(`[silvio-chat] AI Test Lab: tools disabilitati per ${effectiveModel} (legacy)`);
    }

    while (!finalContent && iteration < MAX_TOOL_ITERATIONS) {
      iteration++;
      const idempotencyKey = `${idempotencyBase}_iter${iteration}`;

      let result;
      try {
        result = await aiRouterComplete({
          supabase: supabaseAdmin,
          taskKey: "persona_silvio",
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          messages: messages as any,
          params: {
            temperature: 0.3,
            max_tokens: 2500,
            // Skip tools per modelli non supportati (Kimi/DeepSeek/Llama/...)
            tools: skipToolsForModel ? [] : toolSchemas,
            tool_choice: skipToolsForModel ? undefined : "auto",
          },
          // MP-04: structured output (json_schema strict) per tier balanced/premium.
          // Disabilitato durante tool calls (json_schema entra in conflitto con tool_choice=auto).
          // Disabilitato anche per modelli non Anthropic/OpenAI (json_schema strict instabile).
          responseFormat: useStructured && toolSchemas.length === 0 && !skipToolsForModel
            ? { type: "json_schema", json_schema: { name: "AiResponse", schema: AI_RESPONSE_SCHEMA, strict: true } }
            : undefined,
          companyId,
          userId,
          personaKey: PERSONA_KEY,
          idempotencyKey,
          // AI Test Lab override (demo only) > persona.recommended_model > config primary
          forceModel: aiTestLabForceModel ?? persona.recommended_model ?? undefined,
        });
        lastResult = result;
      } catch (aiErr) {
        const errMsg = aiErr instanceof Error ? aiErr.message : String(aiErr);
        console.error("[silvio-chat] aiRouter iter", iteration, "error:", errMsg);
        // Messaggio utente-friendly + suggerimento per AI Test Lab
        const userFriendlyMsg = aiTestLabForceModel
          ? `⚠️ Il modello **${aiTestLabForceModel}** ha avuto un problema:\n\n\`${errMsg.slice(0, 200)}\`\n\n💡 Prova un altro modello dal selettore (Claude/GPT-4 sono i più stabili) o riformula la domanda.`
          : `⚠️ C'è stato un problema tecnico: ${errMsg.slice(0, 300)}`;
        await supabaseAdmin.from("internal_chat_messages").insert({
          channel_id: channelId, sender_id: SILVIO_SENDER_ID, company_id: companyId,
          content: userFriendlyMsg,
          message_type: "text",
        });
        return jsonResponse({ ok: false, error: errMsg }, 200, corsHeaders);
      }

      // Inspect raw response to extract tool_calls
      const rawChoice = result.rawResponse?.choices?.[0];
      const toolCalls = rawChoice?.message?.tool_calls ?? [];

      if (toolCalls.length > 0) {
        // L'LLM vuole chiamare uno o più tool
        // Aggiungi assistant message con tool_calls a messages[]
        messages.push({
          role: "assistant",
          content: rawChoice.message.content ?? null,
          tool_calls: toolCalls,
        });

        // Esegui ogni tool e aggiungi tool message
        for (const tc of toolCalls) {
          const toolName = tc.function?.name;
          let toolArgs: Record<string, unknown> = {};
          try {
            toolArgs = JSON.parse(tc.function?.arguments ?? "{}");
          } catch {
            toolArgs = {};
          }

          const toolResult = await executeToolWithRouting(toolName, toolArgs, toolCtx);
          const resultStr = JSON.stringify(toolResult).slice(0, 8000);

          toolCallsLog.push({
            name: toolName,
            args: toolArgs,
            result_preview: resultStr.slice(0, 200),
            proposal_id: toolResult.proposalId ?? null,
            risk_level: toolResult.riskLevel ?? null,
          });

          messages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: resultStr,
          });
        }

        // Continue loop: re-invoke LLM with tool results
        continue;
      }

      // No more tool_calls — final answer
      finalContent = result.content || "";
      break;
    }

    if (!finalContent && iteration >= MAX_TOOL_ITERATIONS) {
      finalContent = "⚠️ Non sono riuscito a completare l'analisi. Riformula la domanda in modo più specifico.";
    }
    // ── MP-04: Tenta parsing structured output (per tier balanced/premium) ──
    let structured: StructuredAiResponse | null = null;
    if (useStructured) {
      structured = parseStructuredResponse(finalContent);
      if (structured) {
        finalContent = structured.answer; // sostituisce il JSON con il solo answer
      } else {
        console.warn("[silvio-chat] structured output: parse failed, fallback to raw content");
      }
    }

    finalContent = appendEvidenceFooter(finalContent, toolCallsLog, lastResult);

    // ── MP-03: Citation enforcement validation ──────────────────────────
    const citationMode = getCitationMode();
    const citationCheck = validateCitations(finalContent, ragSources, citationMode);
    if (citationCheck.citationsMissing) {
      console.warn(`[silvio-chat] citation MISSING: ${ragSources.length} sources fornite ma 0 citate`);
    }
    if (citationCheck.invalidCitations.length > 0) {
      console.warn(`[silvio-chat] citation INVALID: ${citationCheck.invalidCitations.join(", ")} non esistono in sources`);
    }
    // Modalità "enforce" → usa la response con sezione Fonti normalizzata
    if (citationMode === "enforce") {
      finalContent = citationCheck.cleanedResponse;
    }

    // ── 10) Salva risposta nella chat ───────────────────────────────────
    // Sessione 1 — Persist MP-01 (rag_sources), MP-04 (confidence/review/followup)
    // e MP-09 (council_data) per rendering UI con citation tooltip + badge + chip.
    // ── AI Test Lab metadata: persist run info (model, cost, latency, tokens)
    const aiRunMeta = lastResult ? {
      last_model_id: lastResult.modelUsed,
      last_provider: lastResult.modelUsed.split('/')[0] ?? null,
      last_cost_usd: lastResult.costUsd,
      last_latency_ms: lastResult.durationMs,
      last_input_tokens: lastResult.promptTokens,
      last_output_tokens: lastResult.completionTokens,
      last_generation_id: (lastResult.rawResponse as { id?: string } | undefined)?.id ?? null,
    } : {};

    const { data: insertedMsg } = await supabaseAdmin
      .from("internal_chat_messages")
      .insert({
        channel_id: channelId,
        sender_id: SILVIO_SENDER_ID,
        company_id: companyId,
        content: finalContent,
        message_type: "text",
        rag_sources: ragSources.length > 0 ? ragSources : null,
        rag_min_similarity: ragSources.length > 0 ? ragMinSimilarity : null,
        ai_confidence: structured?.confidence ?? null,
        ai_requires_human_review: structured?.requires_human_review ?? null,
        followup_suggestions:
          structured?.followup_suggestions && structured.followup_suggestions.length > 0
            ? structured.followup_suggestions.slice(0, 3)
            : null,
        council_data: councilData,
        ...aiRunMeta,
      })
      .select()
      .single();

    // ── 11) FIX 8 (C4): Decision Log per AI Act compliance ─────────────────
    // Inserisce un record in silvio_decision_log per ogni interazione chat,
    // con metadati completi (tool usati, modello, costo, decisione utente).
    // Required by EU AI Act art. 15 (logging system per high-risk AI).
    try {
      const hasToolErrors = toolCallsLog.some((t) =>
        (t.result_preview ?? "").toLowerCase().includes("\"error\""),
      );
      const confidence = toolCallsLog.length === 0
        ? "medium"
        : hasToolErrors
          ? "low"
          : "high";
      // FIX 12 (A8): tool effettivamente esistenti con effetto laterale
      const SIDE_EFFECT_TOOLS = ["create_quote_draft", "create_invoice_draft", "propose_action"];
      const isCritical = toolCallsLog.some((t) => SIDE_EFFECT_TOOLS.includes(t.name));
      const pendingProposalIds = toolCallsLog
        .map((t) => t.proposal_id)
        .filter((proposalId): proposalId is string => Boolean(proposalId));
      const hasPendingActionProposal = pendingProposalIds.length > 0;
      await supabaseAdmin.from("silvio_decision_log").insert({
        company_id: companyId,
        user_id: userId,
        persona_key: PERSONA_KEY,
        trigger_type: "chat_user_request",
        trigger_source_type: "internal_chat_message",
        trigger_source_id: insertedMsg?.id ?? null,
        trigger_metadata: {
          channel_id: channelId,
          attachments_count: attachments.length,
          attachment_kinds: attachments.map((a) => a.kind),
        },
        situation_description: userMessage.substring(0, 500) || "(messaggio con solo allegati)",
        ai_diagnosis: finalContent.substring(0, 1000),
        ai_diagnosis_data: {
          tool_calls: toolCallsLog.map((t) => ({
            name: t.name,
            risk_level: t.risk_level ?? null,
            proposal_id: t.proposal_id ?? null,
            has_error: (t.result_preview ?? "").includes("\"error\""),
          })),
          pending_proposal_ids: pendingProposalIds,
          iterations: iteration,
          attachments_count: attachments.length,
        },
        ai_options_proposed: toolCallsLog.length > 0
          ? toolCallsLog.map((t, i) => ({ id: `opt_${i}`, tool: t.name, summary: t.name }))
          : [{ id: "opt_general", tool: "knowledge_only", summary: "Risposta basata su conoscenza generale" }],
        ai_recommended_option_id: toolCallsLog.length > 0 ? "opt_0" : "opt_general",
        ai_confidence_level: confidence,
        ai_model_used: lastResult?.modelUsed ?? null,
        ai_tokens_total: (lastResult?.promptTokens ?? 0) + (lastResult?.completionTokens ?? 0),
        ai_cost_eur: lastResult?.costBilledEur ?? 0,
        status: hasPendingActionProposal ? "pending_review" : "executed",
        decided_at: hasPendingActionProposal ? null : new Date().toISOString(),
        executed_at: hasPendingActionProposal ? null : new Date().toISOString(),
        is_critical: isCritical || hasPendingActionProposal,
        // MP-01: Pre-RAG audit
        rag_sources: ragSources.length > 0 ? ragSources : null,
        rag_min_similarity: ragSources.length > 0 ? ragMinSimilarity : null,
        rag_source_count: ragSources.length,
        // MP-03: Citation enforcement audit
        citations_used: citationCheck.citationsUsed.length > 0 ? citationCheck.citationsUsed : null,
        citations_missing: citationCheck.citationsMissing,
        invalid_citations: citationCheck.invalidCitations.length > 0 ? citationCheck.invalidCitations : null,
        no_rag_prefix: citationCheck.noRagPrefix,
        // MP-04: CoT + Confidence audit
        ai_thinking: structured?.thinking ?? null,
        ai_confidence: structured?.confidence ?? null,
        ai_uncertainty_reasons: structured?.uncertainty_reasons ?? null,
        followup_suggestions: structured?.followup_suggestions ?? null,
        requires_human_review: structured?.requires_human_review ?? false,
      });
    } catch (logErr) {
      // Non bloccare la response per un fail di logging — solo warn
      console.warn("[silvio-chat] decision_log insert fallito (non bloccante):", logErr instanceof Error ? logErr.message : String(logErr));
    }

    // ── 11.5) FIX 12 (A8): Auto-INSERT ai_action_proposals per tool laterali ─
    // I tool create_quote_draft / create_invoice_draft creano direttamente un
    // record draft (effetto laterale immediato), ma senza traccia nel pannello
    // "Azioni proposte da Silvio". Inseriamo qui con status='applied' per
    // audit trail unificato. propose_action già lo fa via RPC: skip per evitare
    // duplicati.
    try {
      const sideEffectsToTrack = toolCallsLog.filter((t) =>
        ["create_quote_draft", "create_invoice_draft"].includes(t.name) && !t.proposal_id,
      );
      for (const t of sideEffectsToTrack) {
        let draftId: string | null = null;
        let summary = "";
        const args = (t.args ?? {}) as Record<string, unknown>;
        try {
          const parsed = JSON.parse(t.result_preview);
          draftId = (parsed?.id ?? parsed?.quote_id ?? parsed?.invoice_id ?? null) as string | null;
        } catch {
          /* result_preview troncato: lasciamo draftId null */
        }
        if (t.name === "create_quote_draft") {
          summary = `Bozza preventivo creata${args.client_name ? " per " + String(args.client_name).substring(0, 60) : ""}`;
        } else {
          summary = `Bozza fattura creata${args.client_name ? " per " + String(args.client_name).substring(0, 60) : ""}`;
        }
        await supabaseAdmin.from("ai_action_proposals").insert({
          company_id: companyId,
          user_id: userId,
          persona_key: PERSONA_KEY,
          action_type: t.name,
          summary: summary.substring(0, 200),
          payload: {
            tool_name: t.name,
            tool_args: args,
            draft_id: draftId,
          },
          status: "applied", // già applicato dal tool
          risk_level: "yellow",
          applied_at: new Date().toISOString(),
          applied_result: { tool_result_preview: t.result_preview.substring(0, 500) },
        });
      }
    } catch (proposalErr) {
      console.warn(
        "[silvio-chat] ai_action_proposals insert fallito (non bloccante):",
        proposalErr instanceof Error ? proposalErr.message : String(proposalErr),
      );
    }

    // ── 12) FIX 9 (C5): trigger memory extract periodico ─────────────────
    // Ogni MEMORY_EXTRACT_THRESHOLD messaggi nel canale, lancia in background
    // l'estrazione fatti+sintesi conversazione → ai_brain_facts +
    // ai_brain_chat_summaries. Fire-and-forget (no await) — l'utente non
    // aspetta. Senza questo, Silvio "non ricorda" mai conversazioni precedenti.
    try {
      const totalMsgInChannel = (history?.length ?? 0) + 2; // +2 per user + silvio appena inseriti
      const MEMORY_EXTRACT_THRESHOLD = 8;
      // Trigger ogni 8 messaggi, evitando ri-trigger su soglie già superate
      // (uso modulo: trigger esatto su 8, 16, 24, ...)
      if (
        totalMsgInChannel >= MEMORY_EXTRACT_THRESHOLD &&
        totalMsgInChannel % MEMORY_EXTRACT_THRESHOLD === 0
      ) {
        // Fire-and-forget: invoke con waitUntil pattern
        // Non await: l'utente riceve la response subito.
        void supabaseAdmin.functions.invoke("silvio-memory-extract", {
          body: {
            mode: "user",
            user_id: userId,
            channel_id: channelId,
            lookback_hours: 24,
          },
          headers: {
            Authorization: req.headers.get("Authorization") ?? "",
          },
        }).catch((e: unknown) => {
          console.warn("[silvio-chat] memory extract trigger fallito:", e instanceof Error ? e.message : String(e));
        });
      }
    } catch (memErr) {
      console.warn("[silvio-chat] memory trigger error (non bloccante):", memErr instanceof Error ? memErr.message : String(memErr));
    }

    return jsonResponse({
      ok: true,
      reply: finalContent,
      message_id: insertedMsg?.id,
      iterations: iteration,
      tool_calls: toolCallsLog,
      model_used: lastResult?.modelUsed,
      tokens_in: lastResult?.promptTokens,
      tokens_out: lastResult?.completionTokens,
      cost_billed_eur: lastResult?.costBilledEur,
      ledger_id: lastResult?.ledgerId,
    }, 200, corsHeaders);

  } catch (err) {
    if (err instanceof Response) return err;
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[silvio-chat] error:", msg);
    return errorResponse(msg, 500, corsHeaders);
  }
});

/**
 * Pulisce il contenuto rimuovendo eventuali footer di evidence legacy che
 * potrebbero arrivare dal modello o da risposte cached. I metadati (tool
 * usati, modello, costo) restano disponibili nella response JSON dell'edge
 * function (per audit/debug developer) ma NON nel testo visibile all'utente.
 *
 * Modifica del 2026-05-05: l'utente non vuole vedere il footer "Fonti dati
 * usate / Confidenza / modello" alla fine di ogni risposta — appesantisce
 * la conversazione e fa sembrare la chat tecnica anziché conversazionale.
 * I metadati restano fruibili dal pannello Decision Log e dal payload API.
 */
function appendEvidenceFooter(
  content: string,
  _toolCallsLog: Array<{ name: string; args: unknown; result_preview: string }>,
  _lastResult: Awaited<ReturnType<typeof aiRouterComplete>> | null,
): string {
  const cleanContent = (content ?? "").trim();
  if (!cleanContent) return cleanContent;
  // Strip eventuale footer legacy "Fonti dati usate: ... Confidenza: ... modello: ..."
  // che potrebbe essere stato incluso da risposte precedenti o dal modello stesso.
  // Pattern: "\n---\n_Fonti dati usate: ... ._" oppure "\n\n---\n_Fonti dati usate: ... ._"
  const stripped = cleanContent.replace(
    /\n+---\n_Fonti dati usate:[\s\S]*?\._\s*$/,
    "",
  ).trim();
  return stripped;
}

// ─────────────────────────────────────────────────────────────────────────
// Helpers estrazione contenuto allegati (Sprint AI Uploads — formati estesi)
// ─────────────────────────────────────────────────────────────────────────

/**
 * Scarica un file di testo dal bucket silvio-uploads e lo decodifica come UTF-8.
 * Supporta .txt, .csv, .md, .json, .log, .xml, .yaml, ecc.
 *
 * @param maxBytes — limite massimo per evitare context overflow (default 50KB)
 */
async function downloadAsText(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseAdmin: any,
  storagePath: string,
  maxBytes = 50_000,
): Promise<string> {
  const { data: file, error } = await supabaseAdmin.storage
    .from("silvio-uploads")
    .download(storagePath);
  if (error || !file) throw new Error(error?.message ?? "download fallito");
  const buffer = await file.arrayBuffer();
  if (buffer.byteLength === 0) throw new Error("file vuoto");
  // BOM + UTF-8 decoding
  const decoder = new TextDecoder("utf-8", { fatal: false });
  let text = decoder.decode(buffer);
  // Strip BOM
  if (text.charCodeAt(0) === 0xFEFF) text = text.substring(1);
  // Cap a maxBytes char (~ 1 byte = 1 char per UTF-8 plain)
  if (text.length > maxBytes) {
    text = text.substring(0, maxBytes) + "\n\n[... TRONCATO]";
  }
  return text;
}

/**
 * Estrae testo da un documento Office (.docx / .xlsx).
 * Per .docx usa mammoth (markdown), per .xlsx usa xlsx (CSV-like).
 * Fallback graceful: se la libreria fallisce, ritorna messaggio descrittivo.
 */
async function extractOfficeDocument(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseAdmin: any,
  storagePath: string,
  mimeType: string,
  fileName: string,
): Promise<string> {
  const { data: file, error } = await supabaseAdmin.storage
    .from("silvio-uploads")
    .download(storagePath);
  if (error || !file) throw new Error(error?.message ?? "download fallito");
  const buffer = await file.arrayBuffer();
  const lowerName = fileName.toLowerCase();

  // .docx → mammoth
  if (
    mimeType.includes("wordprocessingml") ||
    mimeType === "application/msword" ||
    lowerName.endsWith(".docx")
  ) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mammoth: any = await import("https://esm.sh/mammoth@1.8.0?bundle");
    const result = await mammoth.extractRawText({ arrayBuffer: buffer });
    const text = (result?.value ?? "").trim();
    if (!text) throw new Error(".docx vuoto o non leggibile");
    return text;
  }

  // .xlsx → xlsx (sheetjs)
  if (
    mimeType.includes("spreadsheetml") ||
    mimeType === "application/vnd.ms-excel" ||
    lowerName.endsWith(".xlsx") ||
    lowerName.endsWith(".xls")
  ) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const xlsx: any = await import("https://esm.sh/xlsx@0.18.5?bundle");
    const wb = xlsx.read(new Uint8Array(buffer), { type: "array" });
    const sheets: string[] = [];
    for (const sheetName of wb.SheetNames as string[]) {
      const sheet = wb.Sheets[sheetName];
      const csv = xlsx.utils.sheet_to_csv(sheet, { blankrows: false });
      if (csv && csv.trim().length > 0) {
        sheets.push(`=== Foglio: ${sheetName} ===\n${csv}`);
      }
    }
    if (sheets.length === 0) throw new Error(".xlsx vuoto");
    return sheets.join("\n\n");
  }

  throw new Error(`MIME non supportato: ${mimeType}`);
}
