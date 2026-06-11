/**
 * parse-matrix-image — Edge Function EiC
 *
 * OCR AI di una tabella/matrice di prezzi (L × H) da immagine.
 * Tipico caso d'uso: listino fornitore serramentistica caricato come
 * screenshot/foto PDF. Restituisce JSON strutturato { xValues, yValues, cells[] }
 * pronto per l'import via `GridBulkImportDialog` (preview + apply).
 *
 * Multi-provider (auto-discovery da env):
 *  - OpenAI   (gpt-4o-mini / gpt-4o)  — default se OPENAI_API_KEY configurata
 *  - Anthropic (claude-sonnet-4)        — se ANTHROPIC_API_KEY configurata
 *  - Gemini   (gemini-2.5-pro / flash) — se GEMINI_API_KEY configurata
 *
 * Il client può specificare `provider` (default: primo disponibile in ordine
 * sopra). Se il provider richiesto non ha chiave → 503 con hint configurazione.
 *
 * Input (POST JSON):
 *   {
 *     image_base64: string,          // base64 puro senza prefix "data:…;base64,"
 *     mime_type: string,             // "image/png" | "image/jpeg" | ...
 *     provider?: "openai" | "anthropic" | "gemini" | "auto",
 *     hint?: string,                 // (opzionale) contesto per il modello
 *   }
 *
 * Output (200 JSON):
 *   {
 *     ok: true,
 *     provider: "openai" | "anthropic" | "gemini",
 *     model: string,
 *     data: {
 *       xValues: number[],           // colonne (es. larghezze mm), ordinate asc
 *       yValues: number[],           // righe (es. altezze mm), ordinate asc
 *       cells: { x: number, y: number, value: number }[],
 *     },
 *     warnings?: string[],
 *     usage?: { input_tokens?: number, output_tokens?: number, cost_usd?: number },
 *   }
 *
 * Errori (200/4xx/5xx con shape `{ ok: false, error: string, code: string }`):
 *   - 400 validation_error   — payload malformato
 *   - 401 unauthorized       — JWT mancante/invalido
 *   - 413 payload_too_large  — immagine oltre limite
 *   - 503 provider_unconfigured — nessun provider con chiave valida
 *   - 502 provider_error     — errore rete/quota provider
 *   - 422 parse_error        — risposta provider non parsabile
 *
 * NOTA: questa funzione NON persiste nulla sul DB — è stateless. La persistenza
 * avviene lato frontend via GridBulkImportDialog → FamilyGridEditor.saveGrid().
 */

import { getCorsHeaders } from "../_shared/headers.ts";
import { requireAuth, requireCompanyAccess } from "../_shared/auth.ts";
import { chargeAndLogDirect, estimateTokenCostUsd } from "../_shared/ai-provider/directApi.ts";
import { claudeMessages, hasClaudeProvider } from "../_shared/claudeProxy.ts";

// ── Limiti difensivi ────────────────────────────────────────────────────────
const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
]);

// ── Provider configuration ──────────────────────────────────────────────────
type ProviderId = "openai" | "anthropic" | "gemini";

interface ProviderConfig {
  id: ProviderId;
  apiKey: string;
  model: string;
  displayName: string;
}

function getAvailableProviders(): ProviderConfig[] {
  const providers: ProviderConfig[] = [];

  const openaiKey = Deno.env.get("OPENAI_API_KEY") ?? "";
  if (openaiKey) {
    providers.push({
      id: "openai",
      apiKey: openaiKey,
      model: Deno.env.get("PARSE_MATRIX_OPENAI_MODEL") ?? "gpt-4o",
      displayName: "OpenAI GPT-4o",
    });
  }

  if (hasClaudeProvider()) {
    providers.push({
      id: "anthropic",
      // La chiave è gestita internamente da claudeMessages (ANTHROPIC_API_KEY o OPENROUTER_API_KEY).
      apiKey: "",
      model: Deno.env.get("PARSE_MATRIX_ANTHROPIC_MODEL") ?? "claude-sonnet-4-20250514",
      displayName: "Anthropic Claude Sonnet 4",
    });
  }

  const geminiKey = Deno.env.get("GEMINI_API_KEY") ?? "";
  if (geminiKey) {
    providers.push({
      id: "gemini",
      apiKey: geminiKey,
      model: Deno.env.get("PARSE_MATRIX_GEMINI_MODEL") ?? "gemini-2.5-pro",
      displayName: "Google Gemini 2.5 Pro",
    });
  }

  return providers;
}

// ── Prompt condiviso — istruzioni in italiano per evitare output in EN ──────
const SYSTEM_PROMPT = `Sei un esperto analista di listini prezzi per serramentistica italiana.
L'utente ti mostra un'IMMAGINE di una tabella matrice larghezza × altezza (L × H) di un listino fornitore.
Il tuo unico output è un oggetto JSON valido.`;

const USER_PROMPT = `Analizza questa matrice di prezzi L × H e restituisci ESCLUSIVAMENTE un oggetto JSON con questa struttura:

{
  "xValues": [<numeri delle LARGHEZZE nella riga di intestazione, in mm, ordinati crescenti>],
  "yValues": [<numeri delle ALTEZZE nella colonna di sinistra, in mm, ordinati crescenti>],
  "cells": [
    { "x": <larghezza in mm>, "y": <altezza in mm>, "value": <prezzo in €, numero intero o decimale> },
    ...
  ],
  "notes": "<eventuali note del tuo parsing — es. 'usata solo prima riga Square Plus' — massimo 200 caratteri>"
}

REGOLE RIGIDE:
1. Le larghezze (xValues) sono nell'HEADER ORIZZONTALE (prima riga della matrice).
2. Le altezze (yValues) sono nella COLONNA SINISTRA (prima colonna della matrice).
3. Se per una stessa altezza ci sono PIÙ RIGHE di prezzi (es. Square Plus / Konfortline / Ravia), usa SOLO la PRIMA (profilo base).
4. Celle VUOTE, trattini "—", barrate o fuori range (taglia non disponibile) NON vanno incluse in "cells".
5. I prezzi sono numeri in €. Se vedi "1.234" interpreta come 1234 (migliaia italiane). Se "1,23" interpreta come 1.23 (decimale italiano).
6. NON aggiungere virgolette, commenti, markdown, testo prima/dopo il JSON.
7. I valori in xValues/yValues devono essere gli stessi presenti nelle celle (es. se in cells usi x=500, 500 deve stare in xValues).

Output: SOLO il JSON, nient'altro.`;

// ── Risposta normalizzata (shape consumabile dal frontend) ──────────────────
interface ParsedMatrix {
  xValues: number[];
  yValues: number[];
  cells: { x: number; y: number; value: number }[];
  notes?: string;
}

/** Parse + sanitize della risposta raw del modello. */
function parseAndValidate(raw: string): { data: ParsedMatrix; warnings: string[] } {
  const warnings: string[] = [];

  // Cerca il primo { e l'ultimo } — gestisce preamboli accidentali del modello.
  const first = raw.indexOf("{");
  const last = raw.lastIndexOf("}");
  if (first === -1 || last === -1 || last <= first) {
    throw new Error("Nessun oggetto JSON trovato nella risposta");
  }
  const jsonStr = raw.slice(first, last + 1);

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    throw new Error(`JSON malformato: ${String(e)}`);
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Output non è un oggetto JSON");
  }

  const obj = parsed as Record<string, unknown>;

  const toNumArray = (v: unknown, label: string): number[] => {
    if (!Array.isArray(v)) throw new Error(`Campo ${label} non è un array`);
    const nums: number[] = [];
    for (const item of v) {
      const n = typeof item === "number" ? item : Number(item);
      if (!Number.isFinite(n) || n <= 0) continue;
      nums.push(Math.round(n));
    }
    return Array.from(new Set(nums)).sort((a, b) => a - b);
  };

  const xValues = toNumArray(obj.xValues, "xValues");
  const yValues = toNumArray(obj.yValues, "yValues");

  if (xValues.length === 0) throw new Error("Nessun valore xValues valido");
  if (yValues.length === 0) throw new Error("Nessun valore yValues valido");

  const rawCells = obj.cells;
  if (!Array.isArray(rawCells)) throw new Error("Campo cells non è un array");

  const cells: { x: number; y: number; value: number }[] = [];
  const seen = new Set<string>();
  const xSet = new Set(xValues);
  const ySet = new Set(yValues);

  for (const c of rawCells) {
    if (!c || typeof c !== "object") continue;
    const cell = c as Record<string, unknown>;
    const x = Math.round(Number(cell.x));
    const y = Math.round(Number(cell.y));
    const value = Number(cell.value);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(value)) continue;
    if (x <= 0 || y <= 0 || value <= 0) continue;
    if (!xSet.has(x)) {
      warnings.push(`Cella con x=${x} non presente in xValues — ignorata`);
      continue;
    }
    if (!ySet.has(y)) {
      warnings.push(`Cella con y=${y} non presente in yValues — ignorata`);
      continue;
    }
    const key = `${x}_${y}`;
    if (seen.has(key)) {
      warnings.push(`Cella duplicata ${x}×${y} — tenuta prima occorrenza`);
      continue;
    }
    seen.add(key);
    cells.push({ x, y, value });
  }

  if (cells.length === 0) throw new Error("Nessuna cella valida nella risposta");

  const notes =
    typeof obj.notes === "string" && obj.notes.trim().length > 0
      ? obj.notes.trim().slice(0, 400)
      : undefined;

  return { data: { xValues, yValues, cells, notes }, warnings };
}

// ── Adapter OpenAI Chat Completions (Vision) ────────────────────────────────
async function callOpenAI(
  cfg: ProviderConfig,
  imageBase64: string,
  mimeType: string,
  hint?: string,
): Promise<{ raw: string; usage?: { input_tokens?: number; output_tokens?: number } }> {
  const body = {
    model: cfg.model,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          { type: "text", text: hint ? `${USER_PROMPT}\n\nContesto aggiuntivo: ${hint}` : USER_PROMPT },
          { type: "image_url", image_url: { url: `data:${mimeType};base64,${imageBase64}`, detail: "high" } },
        ],
      },
    ],
    response_format: { type: "json_object" },
    temperature: 0,
    max_tokens: 4096,
  };

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 120_000);
  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!resp.ok) {
      const txt = await resp.text();
      throw new Error(`OpenAI ${resp.status}: ${txt.substring(0, 500)}`);
    }
    const data = await resp.json();
    const raw = data.choices?.[0]?.message?.content ?? "";
    const usage = data.usage
      ? {
          input_tokens: data.usage.prompt_tokens,
          output_tokens: data.usage.completion_tokens,
        }
      : undefined;
    return { raw, usage };
  } finally {
    clearTimeout(t);
  }
}

// ── Adapter Anthropic Messages API (Vision) ─────────────────────────────────
async function callAnthropic(
  cfg: ProviderConfig,
  imageBase64: string,
  mimeType: string,
  hint?: string,
): Promise<{ raw: string; usage?: { input_tokens?: number; output_tokens?: number } }> {
  const resp = await claudeMessages({
    model: cfg.model,
    max_tokens: 4096,
    temperature: 0,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mimeType, data: imageBase64 },
          },
          { type: "text", text: hint ? `${USER_PROMPT}\n\nContesto aggiuntivo: ${hint}` : USER_PROMPT },
        ],
      },
    ],
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Anthropic ${resp.status}: ${txt.substring(0, 500)}`);
  }
  const data = await resp.json();
  const raw = (data.content ?? [])
    .filter((c: { type: string }) => c.type === "text")
    .map((c: { text: string }) => c.text)
    .join("\n");
  const usage = data.usage
    ? {
        input_tokens: data.usage.input_tokens,
        output_tokens: data.usage.output_tokens,
      }
    : undefined;
  return { raw, usage };
}

// ── Adapter Gemini generateContent (Vision) ─────────────────────────────────
async function callGemini(
  cfg: ProviderConfig,
  imageBase64: string,
  mimeType: string,
  hint?: string,
): Promise<{ raw: string; usage?: { input_tokens?: number; output_tokens?: number } }> {
  const body = {
    contents: [
      {
        role: "user",
        parts: [
          { text: `${SYSTEM_PROMPT}\n\n${hint ? `${USER_PROMPT}\n\nContesto aggiuntivo: ${hint}` : USER_PROMPT}` },
          { inline_data: { mime_type: mimeType, data: imageBase64 } },
        ],
      },
    ],
    generationConfig: {
      temperature: 0,
      maxOutputTokens: 4096,
      responseMimeType: "application/json",
    },
  };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${cfg.model}:generateContent?key=${cfg.apiKey}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 120_000);
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!resp.ok) {
      const txt = await resp.text();
      throw new Error(`Gemini ${resp.status}: ${txt.substring(0, 500)}`);
    }
    const data = await resp.json();
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const usage = data.usageMetadata
      ? {
          input_tokens: data.usageMetadata.promptTokenCount,
          output_tokens: data.usageMetadata.candidatesTokenCount,
        }
      : undefined;
    return { raw, usage };
  } finally {
    clearTimeout(t);
  }
}

// ── Handler ─────────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  const corsH = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsH });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, code: "method_not_allowed", error: "POST only" }), {
      status: 405,
      headers: { ...corsH, "Content-Type": "application/json" },
    });
  }

  try {
    const { userId, supabaseAdmin } = await requireAuth(req, corsH);

    // Payload
    const body = await req.json().catch(() => ({}));
    const {
      image_base64,
      mime_type,
      provider: requestedProvider,
      hint,
      company_id,
    } = body as {
      image_base64?: string;
      mime_type?: string;
      provider?: ProviderId | "auto";
      hint?: string;
      company_id?: string;
    };

    let companyId = typeof company_id === "string" && company_id.trim() ? company_id.trim() : "";
    if (!companyId) {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("company_id")
        .eq("id", userId)
        .maybeSingle();
      companyId = (profile as { company_id?: string } | null)?.company_id ?? "";
    }
    await requireCompanyAccess(supabaseAdmin, userId, companyId, corsH);

    if (!image_base64 || typeof image_base64 !== "string") {
      return new Response(
        JSON.stringify({ ok: false, code: "validation_error", error: "image_base64 mancante" }),
        { status: 400, headers: { ...corsH, "Content-Type": "application/json" } },
      );
    }
    if (!mime_type || !ALLOWED_MIME.has(mime_type)) {
      return new Response(
        JSON.stringify({
          ok: false,
          code: "validation_error",
          error: `mime_type non supportato. Usa: ${Array.from(ALLOWED_MIME).join(", ")}`,
        }),
        { status: 400, headers: { ...corsH, "Content-Type": "application/json" } },
      );
    }
    // Stima dimensione byte: base64 ≈ 3/4 del size raw
    const estimatedBytes = Math.floor((image_base64.length * 3) / 4);
    if (estimatedBytes > MAX_IMAGE_BYTES) {
      return new Response(
        JSON.stringify({
          ok: false,
          code: "payload_too_large",
          error: `Immagine troppo grande (${Math.round(estimatedBytes / 1024 / 1024)} MB, max ${MAX_IMAGE_BYTES / 1024 / 1024} MB)`,
        }),
        { status: 413, headers: { ...corsH, "Content-Type": "application/json" } },
      );
    }

    // Provider selection
    const available = getAvailableProviders();
    if (available.length === 0) {
      return new Response(
        JSON.stringify({
          ok: false,
          code: "provider_unconfigured",
          error:
            "Nessun provider AI configurato. Imposta OPENAI_API_KEY, ANTHROPIC_API_KEY/OPENROUTER_API_KEY o GEMINI_API_KEY nei secrets della Edge Function.",
        }),
        { status: 503, headers: { ...corsH, "Content-Type": "application/json" } },
      );
    }

    let chosen: ProviderConfig | undefined;
    if (requestedProvider && requestedProvider !== "auto") {
      chosen = available.find((p) => p.id === requestedProvider);
      if (!chosen) {
        return new Response(
          JSON.stringify({
            ok: false,
            code: "provider_unconfigured",
            error: `Provider "${requestedProvider}" non configurato. Disponibili: ${available.map((p) => p.id).join(", ")}`,
          }),
          { status: 503, headers: { ...corsH, "Content-Type": "application/json" } },
        );
      }
    } else {
      chosen = available[0]; // priorità: OpenAI → Anthropic → Gemini
    }

    // Call provider
    let rawText = "";
    let usage: { input_tokens?: number; output_tokens?: number } | undefined;
    try {
      const result =
        chosen.id === "openai"
          ? await callOpenAI(chosen, image_base64, mime_type, hint)
          : chosen.id === "anthropic"
            ? await callAnthropic(chosen, image_base64, mime_type, hint)
            : await callGemini(chosen, image_base64, mime_type, hint);
      rawText = result.raw;
      usage = result.usage;
    } catch (err) {
      console.error("[parse-matrix-image] provider error:", err);
      return new Response(
        JSON.stringify({
          ok: false,
          code: "provider_error",
          error: `Errore provider ${chosen.displayName}: ${String(err).slice(0, 500)}`,
        }),
        { status: 502, headers: { ...corsH, "Content-Type": "application/json" } },
      );
    }

    const inputTokens = Number(usage?.input_tokens ?? 0);
    const outputTokens = Number(usage?.output_tokens ?? 0);
    const costUsd = estimateTokenCostUsd({
      provider: chosen.id,
      model: chosen.model,
      inputTokens,
      outputTokens,
      fallbackCostUsd: chosen.id === "anthropic" ? 0.025 : chosen.id === "openai" ? 0.02 : 0.01,
    });
    await chargeAndLogDirect({
      supabase: supabaseAdmin,
      company_id: companyId,
      task_kind: "vision_matrix",
      model_used: `${chosen.id}/${chosen.model}`,
      cost_usd_real: costUsd,
      cost_is_estimated: true,
      tokens_prompt: inputTokens,
      tokens_completion: outputTokens,
      metadata: {
        user_id: userId,
        provider: chosen.id,
        mime_type,
        estimated_image_bytes: estimatedBytes,
        hint: hint ?? null,
      },
    });

    // Parse + validate
    let parsed: { data: ParsedMatrix; warnings: string[] };
    try {
      parsed = parseAndValidate(rawText);
    } catch (err) {
      return new Response(
        JSON.stringify({
          ok: false,
          code: "parse_error",
          error: `Risposta AI non parsabile: ${String(err).slice(0, 300)}`,
          raw_preview: rawText.slice(0, 500),
        }),
        { status: 422, headers: { ...corsH, "Content-Type": "application/json" } },
      );
    }

    if (parsed.data.notes) {
      parsed.warnings = [`Note modello: ${parsed.data.notes}`, ...parsed.warnings];
    }

    return new Response(
      JSON.stringify({
        ok: true,
        provider: chosen.id,
        model: chosen.model,
        data: {
          xValues: parsed.data.xValues,
          yValues: parsed.data.yValues,
          cells: parsed.data.cells,
        },
        warnings: parsed.warnings,
        usage,
      }),
      { status: 200, headers: { ...corsH, "Content-Type": "application/json" } },
    );
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[parse-matrix-image] unhandled:", err);
    return new Response(
      JSON.stringify({ ok: false, code: "internal_error", error: String(err).slice(0, 300) }),
      { status: 500, headers: { ...corsH, "Content-Type": "application/json" } },
    );
  }
});
