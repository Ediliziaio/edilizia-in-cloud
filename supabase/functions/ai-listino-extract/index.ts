/**
 * Sprint C — Catalogo Esteso
 * Edge Function: ai-listino-extract
 *
 * Estrae righe di listino da un PDF caricato in storage (bucket "listini-tmp")
 * usando OpenAI GPT-4o. Logga l'uso in ai_usage_logs.
 *
 * Body payload:
 *   {
 *     storage_path: "user_id/<filename>.pdf",
 *     object_type: "product" | "tariffa",
 *     max_pages?: number   // default 10
 *   }
 *
 * Output:
 *   {
 *     rows: Array<{ code, name, unit, cost, list_price, ...}>,
 *     confidence: number,
 *     tokens: { input, output },
 *     cost_cents: number
 *   }
 */
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { requireAuth } from "../_shared/auth.ts";

interface ExtractPayload {
  storage_path: string;
  object_type?: "product" | "tariffa";
  max_pages?: number;
}

// Prezzi (USD) GPT-4o @ Apr 2026
const GPT4O_INPUT_PER_1M = 2.5; // $/M input tokens
const GPT4O_OUTPUT_PER_1M = 10.0; // $/M output tokens
const USD_TO_EUR_CENTS = 92; // stima: 1 USD ≈ 0.92 EUR = 92 cents

function estimateCostCents(tokensIn: number, tokensOut: number): number {
  const usd = (tokensIn / 1_000_000) * GPT4O_INPUT_PER_1M + (tokensOut / 1_000_000) * GPT4O_OUTPUT_PER_1M;
  const eurCents = usd * USD_TO_EUR_CENTS;
  return Math.round(eurCents * 10000) / 10000; // 4 decimali
}

// ─────────────────────────────────────────────────────────────────────────────

async function downloadPdfBase64(supabaseAdmin: any, storagePath: string): Promise<string> {
  const { data, error } = await supabaseAdmin.storage.from("listini-tmp").download(storagePath);
  if (error || !data) throw new Error(`Download storage error: ${error?.message ?? "empty"}`);
  const buf = new Uint8Array(await data.arrayBuffer());
  // base64 encode
  let bin = "";
  for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
  return btoa(bin);
}

// ─────────────────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Sei un assistente esperto nell'estrazione di dati strutturati da listini prezzi PDF del settore edilizia/serramenti.

TASK: leggi il PDF fornito e ritorna un JSON con la lista di articoli estratti.

STRUTTURA OUTPUT:
{
  "rows": [
    {
      "code": "string | null",        // codice articolo
      "name": "string",               // descrizione articolo (OBBLIGATORIO)
      "category": "string | null",    // categoria se deducibile
      "unit": "string | null",        // UM (pz/kg/m/mq)
      "base_price": "number | null",  // prezzo base / listino
      "list_price": "number | null",  // prezzo vendita
      "cost": "number | null",        // costo se presente
      "vat_rate": "number | null",    // aliquota IVA
      "notes": "string | null"        // note
    }
  ],
  "confidence": "number",             // 0..1 qualità estrazione
  "detected_supplier": "string | null" // nome fornitore rilevato nel listino
}

REGOLE:
- Non inventare codici o prezzi: se non leggibile → null.
- Usa "." come separatore decimale.
- Se il PDF non è un listino o non è leggibile → rows: [], confidence: 0.
- Limita a max 500 righe per chiamata.
- Rispondi SOLO con JSON valido. Nessun testo aggiuntivo.`;

async function callOpenAI(
  apiKey: string,
  pdfBase64: string,
  objectType: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseAdmin: any,
  companyId: string | null,
  userId: string | null,
): Promise<{
  rows: any[];
  confidence: number;
  detected_supplier: string | null;
  tokensIn: number;
  tokensOut: number;
}> {
  const userPrompt = `Estrai gli articoli da questo PDF (tipo: ${objectType}). Ritorna solo JSON.`;

  // PDF input: passato come immagine multimodale (formato OpenAI vision-style).
  // OpenRouter mappa automaticamente al formato del modello scelto.
  const messages = [
    { role: "system" as const, content: SYSTEM_PROMPT },
    {
      role: "user" as const,
      content: [
        { type: "text", text: userPrompt },
        {
          type: "image_url",
          image_url: {
            url: `data:application/pdf;base64,${pdfBase64}`,
            detail: "high",
          },
        },
      ],
    },
  ];

  // Tenta prima via AI Router (OpenRouter) — modello cost-optimized configurato
  // dal SuperAdmin per task "listino_extract". Se OPENROUTER_API_KEY manca o
  // tutti i modelli falliscono, fallback a OpenAI GPT-4o direttamente.
  let content = "{}";
  let tokensIn = 0;
  let tokensOut = 0;

  try {
    const { aiRouterComplete } = await import("../_shared/aiRouter.ts");
    const result = await aiRouterComplete({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: supabaseAdmin as any,
      taskKey: "listino_extract",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      messages: messages as any,
      params: { temperature: 0.1, max_tokens: 8000 },
      responseFormat: { type: "json_object" },
      companyId,
      userId,
    });
    content = result.content;
    tokensIn = result.promptTokens;
    tokensOut = result.completionTokens;
    console.log(`[ai-listino-extract] via aiRouter: model=${result.modelUsed} cost=$${result.costUsd.toFixed(6)}`);
  } catch (routerErr) {
    console.warn(`[ai-listino-extract] aiRouter failed, fallback to direct OpenAI:`, (routerErr as Error).message);
    // Fallback: chiamata diretta a OpenAI (comportamento legacy)
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        response_format: { type: "json_object" },
        messages,
        max_tokens: 8000,
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`OpenAI error ${response.status}: ${text}`);
    }
    const json = await response.json();
    content = json.choices?.[0]?.message?.content ?? "{}";
    tokensIn = json.usage?.prompt_tokens ?? 0;
    tokensOut = json.usage?.completion_tokens ?? 0;
  }

  let parsed: any = {};
  try {
    parsed = JSON.parse(content);
  } catch {
    parsed = { rows: [], confidence: 0, detected_supplier: null };
  }

  return {
    rows: Array.isArray(parsed.rows) ? parsed.rows : [],
    confidence: Number(parsed.confidence) || 0,
    detected_supplier: parsed.detected_supplier ?? null,
    tokensIn,
    tokensOut,
  };
}

// ─────────────────────────────────────────────────────────────────────────────

async function logAiUsage(
  supabaseAdmin: any,
  companyId: string,
  userId: string,
  tokensIn: number,
  tokensOut: number,
  costCents: number,
  storagePath: string,
  status: "success" | "error" | "timeout" | "quota_exceeded",
  errorMessage?: string,
  resultPreview?: Record<string, unknown>,
): Promise<void> {
  try {
    await supabaseAdmin.from("ai_usage_logs").insert({
      company_id: companyId,
      user_id: userId,
      function_name: "ai-listino-extract",
      tokens_input: tokensIn,
      tokens_output: tokensOut,
      cost_cents: costCents,
      storage_path: storagePath,
      status,
      error_message: errorMessage ?? null,
      result_preview: resultPreview ?? null,
    });
  } catch (err) {
    console.error("[ai-listino-extract] Failed to log ai_usage:", err);
  }
}

async function resolveCompanyId(supabaseAdmin: any, userId: string): Promise<string | null> {
  const { data } = await supabaseAdmin.from("profiles").select("company_id").eq("id", userId).maybeSingle();
  return (data as { company_id: string | null } | null)?.company_id ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405, corsHeaders);

  let companyId: string | null = null;
  let userId: string | null = null;
  let storagePath = "";

  try {
    const auth = await requireAuth(req, corsHeaders);
    userId = auth.userId;
    const supabaseAdmin = auth.supabaseAdmin as any;

    companyId = await resolveCompanyId(supabaseAdmin, userId);
    if (!companyId) return errorResponse("Nessuna azienda associata", 400, corsHeaders);

    const body = (await req.json()) as ExtractPayload;
    storagePath = body?.storage_path ?? "";
    const objectType = body?.object_type ?? "product";
    if (!storagePath) return errorResponse("storage_path mancante", 400, corsHeaders);

    // Verifica che storage_path inizi con userId (path-scoped policy)
    if (!storagePath.startsWith(`${userId}/`)) {
      return errorResponse("storage_path fuori scope utente", 403, corsHeaders);
    }

    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) {
      await logAiUsage(
        supabaseAdmin,
        companyId,
        userId,
        0,
        0,
        0,
        storagePath,
        "error",
        "OPENAI_API_KEY non configurata",
      );
      return errorResponse("AI non configurata", 500, corsHeaders);
    }

    const pdfBase64 = await downloadPdfBase64(supabaseAdmin, storagePath);

    const extracted = await callOpenAI(openaiKey, pdfBase64, objectType, supabaseAdmin, companyId, userId);
    const costCents = estimateCostCents(extracted.tokensIn, extracted.tokensOut);

    await logAiUsage(
      supabaseAdmin,
      companyId,
      userId,
      extracted.tokensIn,
      extracted.tokensOut,
      costCents,
      storagePath,
      "success",
      undefined,
      { rows_count: extracted.rows.length, confidence: extracted.confidence },
    );

    return jsonResponse(
      {
        rows: extracted.rows,
        confidence: extracted.confidence,
        detected_supplier: extracted.detected_supplier,
        tokens: { input: extracted.tokensIn, output: extracted.tokensOut },
        cost_cents: costCents,
      },
      200,
      corsHeaders,
    );
  } catch (err) {
    if (err instanceof Response) return err;
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[ai-listino-extract] error:", msg);
    if (userId && companyId) {
      const auth = { supabaseAdmin: null } as any;
      try {
        // best-effort log
        const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
        const sb = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        );
        await logAiUsage(sb, companyId, userId, 0, 0, 0, storagePath, "error", msg);
      } catch { /* ignore */ }
    }
    return errorResponse(msg, 500, corsHeaders);
  }
});
