/**
 * Edge Function: ai-tabella-finanziamento-extract
 *
 * Estrae righe di una tabella finanziaria (Fiditalia, Findomestic, Compass…)
 * da un PDF caricato in storage `finanziamenti-tabelle/<company_id>/<file>.pdf`
 * usando OpenAI GPT-4o con vision-on-PDF.
 *
 * Body payload:
 *   {
 *     storage_path: "<company_id>/<filename>.pdf",
 *     hint?: { finanziaria?: string; nome_prodotto?: string; subtariffa_default?: string }
 *   }
 *
 * Output:
 *   {
 *     rows: Array<{
 *       subtariffa, importo_erogato, spese_istruttoria,
 *       importo_totale_credito, numero_rate, durata_mesi, prima_rata_giorni,
 *       importo_rata, spese_incasso_rata, interessi_cliente,
 *       importo_totale_dovuto, tan, taeg, icc, provvigione_dealer
 *     }>,
 *     confidence: number,                           // 0..1
 *     detected: { finanziaria, prodotto, condizione, tan_base } | null,
 *     tokens: { input, output },
 *     cost_cents: number
 *   }
 *
 * Pattern derivato da ai-listino-extract (Sprint C — Catalogo Esteso).
 */

import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { requireAuth, requireCompanyAccess } from "../_shared/auth.ts";
import { buildStableAiIdempotencyKey } from "../_shared/directAiLedger.ts";

interface Hint {
  finanziaria?: string;
  nome_prodotto?: string;
  subtariffa_default?: string;
}

interface ExtractPayload {
  storage_path: string;
  hint?: Hint;
}

// Prezzi GPT-4o (Apr 2026) — stessi valori di ai-listino-extract
const GPT4O_INPUT_PER_1M = 2.5;
const GPT4O_OUTPUT_PER_1M = 10.0;
const USD_TO_EUR_CENTS = 92;

function estimateCostCents(tokensIn: number, tokensOut: number): number {
  const usd = (tokensIn / 1_000_000) * GPT4O_INPUT_PER_1M + (tokensOut / 1_000_000) * GPT4O_OUTPUT_PER_1M;
  const eurCents = usd * USD_TO_EUR_CENTS;
  return Math.round(eurCents * 10000) / 10000;
}

// deno-lint-ignore no-explicit-any
async function downloadPdfBase64(supabaseAdmin: any, storagePath: string): Promise<string> {
  const { data, error } = await supabaseAdmin.storage
    .from("finanziamenti-tabelle")
    .download(storagePath);
  if (error || !data) throw new Error(`Download storage error: ${error?.message ?? "empty"}`);
  const buf = new Uint8Array(await data.arrayBuffer());
  let bin = "";
  // Chunk per evitare stack overflow su file grandi
  const CHUNK = 0x8000;
  for (let i = 0; i < buf.length; i += CHUNK) {
    bin += String.fromCharCode(...buf.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

const SYSTEM_PROMPT = `Sei un assistente esperto nell'estrazione di dati strutturati da TABELLE FINANZIARIE PDF di finanziarie italiane (Fiditalia, Findomestic, Compass, Agos, Cofidis, Deutsche Bank, BNL, Banca Sella, Younited, Santander, IBL, ecc.).

TASK: leggi il PDF e ritorna un JSON con TUTTE le righe importo×durata della tabella in FORMATO COMPATTO (array of arrays) per minimizzare i token.

Le 14 colonne nel seguente ORDINE FISSO:
[subtariffa, importo_erogato, spese_istruttoria, importo_totale_credito, numero_rate, durata_mesi, prima_rata_giorni, importo_rata, spese_incasso_rata, interessi_cliente, importo_totale_dovuto, tan, taeg, icc, provvigione_dealer]

OUTPUT JSON:
{
  "detected": { "finanziaria": string|null, "prodotto": string|null, "condizione": string|null, "tan_base": number|null },
  "rows": [
    ["GT57T", 3000, 0, 3000, 24, 24, 30, 137, 3, 288, 3382.40, 8.96, 12.51, 18.50, 60],
    ["GT57T", 3000, 0, 3000, 36, 36, 30, 96, 3, 456, 3589.60, 9.43, 12.79, 18.91, 60]
  ],
  "confidence": 0.95
}

REGOLE CRITICHE:
- USA SEMPRE array of arrays nel campo "rows", MAI array of objects. Risparmio massimo di token.
- Numeri italiani: "3.000,00" → 3000.00. "8,96 %" → 8.96 (number, no string).
- subtariffa: stringa o null. Tutti gli altri campi: number. ICC può essere null.
- Estrai TUTTE le righe del PDF, anche se sono 500+. Non riassumere.
- Se PDF non è tabella finanziaria → rows: [], confidence: 0.
- Rispondi SOLO con JSON valido, nessun testo extra.`;

interface ChunkRange {
  min: number;
  max: number;
  label: string;
}

const CHUNK_RANGES: ChunkRange[] = [
  { min: 0, max: 6000, label: "fino a 6.000 €" },
  { min: 6000, max: 12000, label: "tra 6.000 € e 12.000 €" },
  { min: 12000, max: 18000, label: "tra 12.000 € e 18.000 €" },
  { min: 18000, max: 25000, label: "tra 18.000 € e 25.000 €" },
  { min: 25000, max: 32000, label: "tra 25.000 € e 32.000 €" },
  { min: 32000, max: 40000, label: "tra 32.000 € e 40.000 €" },
  { min: 40000, max: 50000, label: "tra 40.000 € e 50.000 €" },
  { min: 50000, max: 200000, label: "oltre 50.000 €" },
];

async function callOpenAIChunk(
  pdfBase64: string,
  filename: string,
  range: ChunkRange | null,
  hint?: Hint,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseAdmin?: any,
  companyId?: string | null,
  userId?: string | null,
  sourceKey?: string,
): Promise<{
  rows: unknown[];
  detected: { finanziaria: string | null; prodotto: string | null; condizione: string | null; tan_base: number | null } | null;
  confidence: number;
  tokensIn: number;
  tokensOut: number;
}> {
  const userTextParts = ["Estrai le righe della tabella finanziaria da questo PDF. Ritorna SOLO JSON valido."];
  if (range) {
    userTextParts.push(
      `RANGE OBBLIGATORIO: include SOLO righe con importo_erogato STRETTAMENTE > ${range.min} € e <= ${range.max} € (${range.label}). Tutte le durate per ciascun importo.`,
    );
  }
  if (hint?.finanziaria) userTextParts.push(`Finanziaria attesa: ${hint.finanziaria}`);
  if (hint?.nome_prodotto) userTextParts.push(`Prodotto atteso: ${hint.nome_prodotto}`);
  if (hint?.subtariffa_default) userTextParts.push(`Subtariffa default: ${hint.subtariffa_default}`);

  // Migrato ad aiRouter — task tabella_finanziamento_extract (gpt-4o-mini, ~85% saving vs gpt-4o)
  let content = "{}";
  let tokensIn = 0, tokensOut = 0;
  try {
    const { aiRouterComplete } = await import("../_shared/aiRouter.ts");
    const idempotencyKey = await buildStableAiIdempotencyKey("tabella_finanziamento_extract", [
      companyId ?? null,
      userId ?? null,
      sourceKey ?? filename,
      range?.label ?? "all",
      hint ?? null,
    ]);
    const result = await aiRouterComplete({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: supabaseAdmin as any,
      taskKey: "tabella_finanziamento_extract",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: userTextParts.join("\n") },
            { type: "image_url", image_url: { url: `data:application/pdf;base64,${pdfBase64}`, detail: "high" } },
          ] as any,
        },
      ],
      params: { temperature: 0.1, max_tokens: 16000 },
      responseFormat: { type: "json_object" },
      companyId: companyId ?? null,
      userId: userId ?? null,
      idempotencyKey,
    });
    content = result.content || "{}";
    tokensIn = result.promptTokens;
    tokensOut = result.completionTokens;
  } catch (err) {
    throw new Error(`AI Router error: ${err instanceof Error ? err.message : String(err)}`);
  }
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(content);
  } catch {
    parsed = { rows: [], confidence: 0, detected: null };
  }
  return {
    rows: Array.isArray(parsed.rows) ? parsed.rows : [],
    detected: (parsed.detected as never) ?? null,
    confidence: Number(parsed.confidence) || 0,
    tokensIn,
    tokensOut,
  };
}

async function callOpenAI(
  pdfBase64: string,
  filename: string,
  hint?: Hint,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseAdmin?: any,
  companyId?: string | null,
  userId?: string | null,
  sourceKey?: string,
): Promise<{
  rows: Array<Record<string, unknown>>;
  detected: { finanziaria: string | null; prodotto: string | null; condizione: string | null; tan_base: number | null } | null;
  confidence: number;
  tokensIn: number;
  tokensOut: number;
}> {
  // Strategia: chiamate parallele su 4 range di importo per evitare il limite
  // di 16k token output di gpt-4o. Ogni range estrae solo le sue righe.
  const results = await Promise.all(
    CHUNK_RANGES.map((range) =>
      callOpenAIChunk(pdfBase64, filename, range, hint, supabaseAdmin, companyId, userId, sourceKey).then((result) => ({
        ...result,
        failed: false,
      })).catch((err) => {
        console.error(`[chunk ${range.label}] ${err}`);
        return { rows: [], detected: null, confidence: 0, tokensIn: 0, tokensOut: 0, failed: true };
      }),
    ),
  );
  const successfulChunks = results.filter((r) => !r.failed).length;
  if (successfulChunks === 0) {
    throw new Error("AI Router non ha restituito nessun chunk valido per la tabella finanziaria");
  }

  // Aggrega: rows concatenati, detected dal primo che lo trova, confidence media
  const allRows: unknown[] = [];
  let detected: typeof results[0]["detected"] = null;
  let confSum = 0;
  let confCount = 0;
  let tokensIn = 0;
  let tokensOut = 0;
  for (const r of results) {
    allRows.push(...r.rows);
    if (!detected && r.detected) detected = r.detected;
    if (r.confidence > 0) {
      confSum += r.confidence;
      confCount++;
    }
    tokensIn += r.tokensIn;
    tokensOut += r.tokensOut;
  }
  const confidence = confCount > 0 ? confSum / confCount : 0;
  const parsed: Record<string, unknown> = { rows: allRows, detected, confidence };

  // Trasforma array of arrays in array of objects.
  // Ordine canonico delle 15 colonne (corrispondente al SYSTEM_PROMPT).
  const COLUMN_ORDER = [
    "subtariffa",
    "importo_erogato",
    "spese_istruttoria",
    "importo_totale_credito",
    "numero_rate",
    "durata_mesi",
    "prima_rata_giorni",
    "importo_rata",
    "spese_incasso_rata",
    "interessi_cliente",
    "importo_totale_dovuto",
    "tan",
    "taeg",
    "icc",
    "provvigione_dealer",
  ];

  let rowsAsObjects: Array<Record<string, unknown>> = [];
  const rawRows = Array.isArray(parsed.rows) ? parsed.rows : [];
  for (const r of rawRows) {
    if (Array.isArray(r)) {
      const obj: Record<string, unknown> = {};
      for (let i = 0; i < COLUMN_ORDER.length && i < r.length; i++) {
        obj[COLUMN_ORDER[i]] = r[i];
      }
      rowsAsObjects.push(obj);
    } else if (r && typeof r === "object") {
      rowsAsObjects.push(r as Record<string, unknown>);
    }
  }

  return {
    rows: rowsAsObjects,
    detected: (parsed.detected as never) ?? null,
    confidence: Number(parsed.confidence) || 0,
    tokensIn,
    tokensOut,
  };
}

async function logAiUsage(
  // deno-lint-ignore no-explicit-any
  supabaseAdmin: any,
  companyId: string | null,
  userId: string,
  tokensIn: number,
  tokensOut: number,
  costCents: number,
  storagePath: string,
  status: "success" | "error" | "timeout",
  errorMessage?: string,
  resultPreview?: Record<string, unknown>,
): Promise<void> {
  try {
    await supabaseAdmin.from("ai_usage_logs").insert({
      company_id: companyId,
      user_id: userId,
      function_name: "ai-tabella-finanziamento-extract",
      tokens_input: tokensIn,
      tokens_output: tokensOut,
      cost_cents: costCents,
      storage_path: storagePath,
      status,
      error_message: errorMessage ?? null,
      result_preview: resultPreview ?? null,
    });
  } catch (err) {
    console.error("[ai-tabella-finanziamento-extract] log failed:", err);
  }
}

// deno-lint-ignore no-explicit-any
async function resolveCompanyId(supabaseAdmin: any, userId: string): Promise<string | null> {
  const { data } = await supabaseAdmin.from("profiles").select("company_id").eq("id", userId).maybeSingle();
  return ((data as { company_id: string | null } | null)?.company_id) ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405, corsHeaders);

  let companyId: string | null = null;
  let userId: string | null = null;
  let storagePath = "";
  // deno-lint-ignore no-explicit-any
  let supabaseAdmin: any = null;

  try {
    const auth = await requireAuth(req, corsHeaders);
    userId = auth.userId;
    supabaseAdmin = auth.supabaseAdmin;

    companyId = await resolveCompanyId(supabaseAdmin, userId);
    if (!companyId) return errorResponse("Nessuna azienda associata", 400, corsHeaders);
    await requireCompanyAccess(supabaseAdmin, userId, companyId, corsHeaders);

    const payload = (await req.json().catch(() => ({}))) as ExtractPayload;
    storagePath = payload.storage_path?.trim() ?? "";
    if (!storagePath) return errorResponse("storage_path mancante", 400, corsHeaders);

    // Verifica che il path sia nella cartella della company (RLS-friendly check)
    if (!storagePath.startsWith(`${companyId}/`)) {
      return errorResponse("storage_path fuori dalla cartella company", 403, corsHeaders);
    }

    // Download PDF
    const pdfBase64 = await downloadPdfBase64(supabaseAdmin, storagePath);

    // Limite di sicurezza: PDF base64 max ~30MB (≈22MB binario)
    if (pdfBase64.length > 30 * 1024 * 1024) {
      throw new Error("PDF troppo grande per estrazione AI (max 22MB binario)");
    }

    // Call OpenAI
    const filename = storagePath.split("/").pop() ?? "tabella.pdf";
    const { rows, detected, confidence, tokensIn, tokensOut } = await callOpenAI(
      pdfBase64,
      filename,
      payload.hint,
      supabaseAdmin,
      companyId,
      userId,
      storagePath,
    );
    const costCents = estimateCostCents(tokensIn, tokensOut);

    await logAiUsage(supabaseAdmin, companyId, userId, tokensIn, tokensOut, costCents, storagePath, "success", undefined, {
      rows_count: rows.length,
      confidence,
      detected,
    });

    return jsonResponse(
      {
        rows,
        detected,
        confidence,
        tokens: { input: tokensIn, output: tokensOut },
        cost_cents: costCents,
      },
      200,
      corsHeaders,
    );
  } catch (err) {
    // requireAuth lancia direttamente una Response in caso di JWT invalido
    if (err instanceof Response) return err;
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[ai-tabella-finanziamento-extract] ERROR:", msg);
    if (userId && supabaseAdmin) {
      await logAiUsage(supabaseAdmin, companyId, userId, 0, 0, 0, storagePath, "error", msg);
    }
    return errorResponse(msg, 500, corsHeaders);
  }
});
