/**
 * Edge Function: ai-customers-extract
 *
 * Estrae righe di anagrafica clienti da un file caricato nel bucket
 * "contacts-tmp" (PDF, Excel, immagine) usando OpenAI GPT-4o Vision.
 *
 * Body payload:
 *   {
 *     storage_path: "<user_id>/<filename>",
 *     mime_type?: string
 *   }
 *
 * Output:
 *   {
 *     rows: Array<{ first_name, last_name, email, phone, fiscal_code,
 *                   address, site_address, notes, confidence }>,
 *     detected_context: string | null,
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
  mime_type?: string;
}

const GPT4O_INPUT_PER_1M = 2.5;
const GPT4O_OUTPUT_PER_1M = 10.0;
const USD_TO_EUR_CENTS = 92;

function estimateCostCents(tokensIn: number, tokensOut: number): number {
  const usd = (tokensIn / 1_000_000) * GPT4O_INPUT_PER_1M + (tokensOut / 1_000_000) * GPT4O_OUTPUT_PER_1M;
  const eurCents = usd * USD_TO_EUR_CENTS;
  return Math.round(eurCents * 10000) / 10000;
}

// ─────────────────────────────────────────────────────────────────────────────

// deno-lint-ignore no-explicit-any
async function downloadBase64(supabaseAdmin: any, storagePath: string): Promise<{ base64: string; contentType: string; bytes: number }> {
  const { data, error } = await supabaseAdmin.storage.from("contacts-tmp").download(storagePath);
  if (error || !data) throw new Error(`Download storage error: ${error?.message ?? "empty"}`);
  const buf = new Uint8Array(await data.arrayBuffer());
  let bin = "";
  // chunked to avoid call-stack blow-up on big files
  const CHUNK = 0x8000;
  for (let i = 0; i < buf.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, buf.subarray(i, i + CHUNK) as unknown as number[]);
  }
  return {
    base64: btoa(bin),
    contentType: (data as Blob).type || "application/octet-stream",
    bytes: buf.length,
  };
}

// ─────────────────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Sei un assistente esperto nell'estrazione di dati strutturati da documenti
(PDF, Excel, immagini, fatture, elenchi cartacei) contenenti anagrafiche CLIENTI per aziende edili.

TASK: estrai TUTTI i potenziali clienti individuabili nel documento e restituisci un JSON.

STRUTTURA OUTPUT (JSON valido, nessun altro testo):
{
  "rows": [
    {
      "first_name": "string",                    // OBBLIGATORIO (deduci se serve, usa "" se persona giuridica senza persona fisica)
      "last_name": "string",                     // OBBLIGATORIO (per persone giuridiche usa la ragione sociale come last_name, first_name="")
      "email": "string | null",                  // null se non presente
      "phone": "string | null",                  // solo cifre, +, spazi, - . ( ) ; null altrimenti
      "fiscal_code": "string | null",            // CF 16 char o P.IVA 11 cifre
      "address": "string | null",                // residenza / sede legale
      "site_address": "string | null",           // indirizzo cantiere se presente
      "notes": "string | null",                  // note aggiuntive utili (referenze, preferenze)
      "confidence": "number"                     // 0..1 certezza estrazione per questa riga
    }
  ],
  "detected_context": "string | null",           // descrizione breve del documento (es: "elenco contatti 2025", "scheda cliente")
  "warnings": ["string"]                         // eventuali avvisi (dati ambigui, dupl. possibili, ecc.)
}

REGOLE IMPORTANTI:
- Non inventare dati: se un campo non è leggibile → null (o "" solo per first_name quando è persona giuridica).
- Email deve contenere "@" e un dominio valido, altrimenti null.
- Partita IVA = 11 cifre, Codice Fiscale = 16 caratteri alfanumerici; se ambiguo metti in fiscal_code il primo che matcha.
- Normalizza il telefono: rimuovi punti consecutivi, mantieni spazi e prefisso "+39 ".
- Se il documento non contiene nessun cliente o non è leggibile → rows: [], confidence: 0.
- Massimo 300 righe per chiamata (se più lungo, prendi le prime 300 e alza un warning).
- Ogni riga deve avere almeno 1 tra: email, phone, fiscal_code (altrimenti scarta la riga).`;

// deno-lint-ignore no-explicit-any
async function callOpenAI(apiKey: string, fileBase64: string, contentType: string): Promise<{
  rows: any[];
  detected_context: string | null;
  warnings: string[];
  tokensIn: number;
  tokensOut: number;
}> {
  const userText = `Estrai gli anagrafica clienti dal documento allegato. Ritorna SOLO JSON valido.`;

  // GPT-4o accetta PDF/immagini come image_url con data URI.
  // Per file non PDF/immagine (es. Excel) l'estrazione via Vision è sconsigliata —
  // in quel caso il client dovrebbe usare exceljs lato frontend e non questa function.
  const isVisionInput = contentType.startsWith("image/") || contentType === "application/pdf";
  if (!isVisionInput) {
    throw new Error(`Tipo file non supportato per estrazione AI: ${contentType}. Carica PDF o immagini.`);
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: userText },
            {
              type: "image_url",
              image_url: {
                url: `data:${contentType};base64,${fileBase64}`,
                detail: "high",
              },
            },
          ],
        },
      ],
      max_tokens: 8000,
      temperature: 0.1,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI error ${response.status}: ${text}`);
  }
  const json = await response.json();
  const content = json.choices?.[0]?.message?.content ?? "{}";
  const tokensIn = json.usage?.prompt_tokens ?? 0;
  const tokensOut = json.usage?.completion_tokens ?? 0;

  // deno-lint-ignore no-explicit-any
  let parsed: any = {};
  try {
    parsed = JSON.parse(content);
  } catch {
    parsed = { rows: [], detected_context: null, warnings: ["Risposta AI non parseabile come JSON"] };
  }

  return {
    rows: Array.isArray(parsed.rows) ? parsed.rows : [],
    detected_context: parsed.detected_context ?? null,
    warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [],
    tokensIn,
    tokensOut,
  };
}

// ─────────────────────────────────────────────────────────────────────────────

// deno-lint-ignore no-explicit-any
async function logAiUsage(
  supabaseAdmin: any,
  companyId: string,
  userId: string,
  tokensIn: number,
  tokensOut: number,
  costCents: number,
  storagePath: string,
  status: "success" | "error",
  errorMessage?: string,
  resultPreview?: Record<string, unknown>,
): Promise<void> {
  try {
    await supabaseAdmin.from("ai_usage_logs").insert({
      company_id: companyId,
      user_id: userId,
      function_name: "ai-customers-extract",
      tokens_input: tokensIn,
      tokens_output: tokensOut,
      cost_cents: costCents,
      storage_path: storagePath,
      status,
      error_message: errorMessage ?? null,
      result_preview: resultPreview ?? null,
    });
  } catch (err) {
    console.error("[ai-customers-extract] Failed to log ai_usage:", err);
  }
}

// deno-lint-ignore no-explicit-any
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
    // deno-lint-ignore no-explicit-any
    const supabaseAdmin = auth.supabaseAdmin as any;

    companyId = await resolveCompanyId(supabaseAdmin, userId);
    if (!companyId) return errorResponse("Nessuna azienda associata", 400, corsHeaders);

    const body = (await req.json()) as ExtractPayload;
    storagePath = body?.storage_path ?? "";
    if (!storagePath) return errorResponse("storage_path mancante", 400, corsHeaders);

    // Sicurezza: path deve iniziare con userId
    if (!storagePath.startsWith(`${userId}/`)) {
      return errorResponse("storage_path fuori scope utente", 403, corsHeaders);
    }

    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) {
      await logAiUsage(supabaseAdmin, companyId, userId, 0, 0, 0, storagePath, "error", "OPENAI_API_KEY non configurata");
      return errorResponse("AI non configurata sul server", 500, corsHeaders);
    }

    const { base64, contentType, bytes } = await downloadBase64(supabaseAdmin, storagePath);
    if (bytes > 20 * 1024 * 1024) {
      return errorResponse("File troppo grande (>20MB)", 413, corsHeaders);
    }

    const extracted = await callOpenAI(openaiKey, base64, body.mime_type || contentType);
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
      { rows_count: extracted.rows.length },
    );

    // Cleanup del file temporaneo (best-effort)
    try {
      await supabaseAdmin.storage.from("contacts-tmp").remove([storagePath]);
    } catch { /* ignore */ }

    return jsonResponse(
      {
        rows: extracted.rows,
        detected_context: extracted.detected_context,
        warnings: extracted.warnings,
        tokens: { input: extracted.tokensIn, output: extracted.tokensOut },
        cost_cents: costCents,
      },
      200,
      corsHeaders,
    );
  } catch (err) {
    if (err instanceof Response) return err;
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[ai-customers-extract] error:", msg);
    if (userId && companyId) {
      try {
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
