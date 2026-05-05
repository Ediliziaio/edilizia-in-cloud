/**
 * Edge Function: ai-fattura-ricevuta-ocr
 *
 * OCR specializzato per fatture passive (fatture_ricevute):
 *   1. Riceve PDF/immagine fattura via storage_path
 *   2. Vision (gpt-4o) estrae i dati strutturati in JSON
 *   3. Inserisce/aggiorna `fatture_ricevute` (idempotente per numero+cedente)
 *   4. Ritorna anteprima per conferma utente
 *
 * Body:
 *   {
 *     storage_path: "user_id/file.pdf",  // bucket fatture-tmp o silvio-uploads
 *     bucket?: "silvio-uploads",         // default
 *     auto_create?: true                  // se true, crea record subito
 *   }
 */

import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { requireAuth } from "../_shared/auth.ts";

const SYSTEM_PROMPT = `Estrai da fattura passiva italiana i seguenti campi in JSON.

Output SCHEMA (no commenti, no markdown):
{
  "numero_fattura": "string",
  "data_fattura": "YYYY-MM-DD",
  "data_scadenza": "YYYY-MM-DD | null",
  "tipo_documento": "TD01 (fattura) | TD04 (nota credito) | TD05 (nota debito) | other",
  "cedente": {
    "ragione_sociale": "string",
    "piva": "IT00000000000 | null",
    "cf": "string | null",
    "indirizzo": "string | null",
    "cap": "string | null",
    "comune": "string | null",
    "provincia": "string | null"
  },
  "imponibile_totale": number,
  "iva_totale": number,
  "totale_documento": number,
  "righe": [
    { "descrizione": "...", "quantita": number, "um": "...", "prezzo_unit": number, "totale_riga": number, "iva_pct": number }
  ],
  "riepilogo_iva": [
    { "aliquota": number, "imponibile": number, "imposta": number }
  ],
  "note": "string | null",
  "confidence": 0..1
}

Se un campo non è leggibile → null.
Numeri come number (no stringhe). Decimali con punto.
Lingua italiano. Se è una NOTA CREDITO usa numeri positivi e segna tipo_documento='TD04'.`;

interface OcrPayload {
  storage_path: string;
  bucket?: string;
  auto_create?: boolean;
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

    const { data: profile } = await supabaseAdmin
      .from("profiles").select("company_id").eq("id", userId).maybeSingle();
    const companyId: string | null = profile?.company_id ?? null;
    if (!companyId) return errorResponse("Nessuna azienda associata", 400, corsHeaders);

    const body = (await req.json()) as OcrPayload;
    const storagePath = body?.storage_path?.trim();
    const bucket = body?.bucket ?? "silvio-uploads";
    const autoCreate = body?.auto_create ?? false;

    if (!storagePath) return errorResponse("storage_path mancante", 400, corsHeaders);
    if (!storagePath.startsWith(`${userId}/`)) {
      return errorResponse("storage_path fuori scope utente", 403, corsHeaders);
    }

    // Get signed URL
    const { data: signed, error: sErr } = await supabaseAdmin.storage
      .from(bucket).createSignedUrl(storagePath, 600);
    if (sErr || !signed?.signedUrl) {
      return errorResponse(`Storage URL fallita: ${sErr?.message ?? "no url"}`, 500, corsHeaders);
    }

    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) return errorResponse("OPENAI_API_KEY non configurata", 500, corsHeaders);

    // Vision call
    const start = Date.now();
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o",
        max_tokens: 3500,
        temperature: 0.0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              { type: "text", text: "Estrai dati fattura nel formato JSON specificato." },
              { type: "image_url", image_url: { url: signed.signedUrl, detail: "high" } },
            ],
          },
        ],
      }),
    });
    const durationMs = Date.now() - start;

    if (!res.ok) {
      const errText = await res.text();
      return errorResponse(`Vision OCR ${res.status}: ${errText.slice(0, 300)}`, 500, corsHeaders);
    }
    const data = await res.json();
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(data?.choices?.[0]?.message?.content ?? "{}");
    } catch {
      return errorResponse("OCR ha restituito JSON invalido", 500, corsHeaders);
    }

    const usage = data?.usage ?? {};
    const costUsd = ((usage.prompt_tokens ?? 0) / 1_000_000) * 2.5
                  + ((usage.completion_tokens ?? 0) / 1_000_000) * 10;

    // Charge ledger
    try {
      await supabaseAdmin.rpc("charge_ai_call", {
        p_idempotency_key: `ocr_fattura_${userId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        p_company_id: companyId, p_user_id: userId,
        p_task_key: "fattura_ricevuta_ocr", p_tier_key: "t4_premium",
        p_model_used: "openai/gpt-4o", p_used_primary: true, p_fallback_index: 0,
        p_persona_key: null,
        p_tokens_in: usage.prompt_tokens ?? 0, p_tokens_out: usage.completion_tokens ?? 0,
        p_cost_real_usd: costUsd, p_fx_usd_to_eur: Number(Deno.env.get("AI_FX_USD_EUR") ?? "0.92"),
        p_status: "success", p_duration_ms: durationMs,
        p_metadata: { storage_path: storagePath },
      });
    } catch { /* best-effort */ }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cedente = (parsed.cedente ?? {}) as any;

    // Auto-create record se richiesto
    let createdId: string | null = null;
    if (autoCreate) {
      const { data: ins, error: insErr } = await supabaseAdmin
        .from("fatture_ricevute")
        .upsert({
          company_id: companyId,
          numero_fattura: parsed.numero_fattura,
          data_fattura: parsed.data_fattura,
          tipo_documento: parsed.tipo_documento ?? "TD01",
          cedente_ragione_sociale: cedente.ragione_sociale,
          cedente_piva: cedente.piva,
          cedente_cf: cedente.cf,
          cedente_indirizzo: cedente.indirizzo,
          cedente_cap: cedente.cap,
          cedente_comune: cedente.comune,
          cedente_provincia: cedente.provincia,
          imponibile_totale: parsed.imponibile_totale,
          iva_totale: parsed.iva_totale,
          totale_documento: parsed.totale_documento,
          righe: parsed.righe ?? [],
          riepilogo_iva: parsed.riepilogo_iva ?? [],
          pdf_url: signed.signedUrl,
          stato: "da_verificare",
          note: `OCR Silvio (confidence ${parsed.confidence ?? "n/a"})`,
        }, { onConflict: "company_id,numero_fattura,cedente_piva", ignoreDuplicates: false })
        .select("id").single();
      if (insErr) {
        console.error("[ai-fattura-ocr] insert failed:", insErr);
      } else {
        createdId = ins?.id ?? null;
      }
    }

    return jsonResponse({
      ok: true,
      extracted: parsed,
      cost_real_eur: Math.round(costUsd * 0.92 * 10000) / 10000,
      duration_ms: durationMs,
      created_invoice_id: createdId,
      preview_url: signed.signedUrl,
    }, 200, corsHeaders);
  } catch (err) {
    if (err instanceof Response) return err;
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[ai-fattura-ricevuta-ocr] error:", msg);
    return errorResponse(msg, 500, corsHeaders);
  }
});
