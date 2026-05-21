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
 *     storage_path: "company_id/file.pdf" | "user_id/file.pdf",
 *     storage_bucket?: "documenti-smart" | "silvio-uploads" | "...",
 *     bucket?: "silvio-uploads",         // legacy alias
 *     auto_create?: true                  // se true, crea record subito
 *   }
 */

import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { requireAuth, requireCompanyAccess } from "../_shared/auth.ts";
import { aiRouterComplete } from "../_shared/aiRouter.ts";

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
  storage_bucket?: string;
  file_name?: string;
  mime_type?: string;
  company_id?: string;
  auto_create?: boolean;
}

function bufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
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

    const body = (await req.json()) as OcrPayload;
    const storagePath = body?.storage_path?.trim();
    const bucket = body?.storage_bucket ?? body?.bucket ?? "silvio-uploads";
    const autoCreate = body?.auto_create ?? false;
    const requestedCompanyId = body?.company_id?.trim();

    if (!storagePath) return errorResponse("storage_path mancante", 400, corsHeaders);

    const { data: profile } = await supabaseAdmin
      .from("profiles").select("company_id").eq("id", userId).maybeSingle();
    const companyId: string | null = requestedCompanyId || profile?.company_id || null;
    if (!companyId) return errorResponse("Nessuna azienda associata", 400, corsHeaders);
    await requireCompanyAccess(supabaseAdmin, userId, companyId, corsHeaders);

    const isUserScoped = storagePath.startsWith(`${userId}/`);
    const isCompanyScoped = storagePath.startsWith(`${companyId}/`);
    if (!isUserScoped && !isCompanyScoped) {
      return errorResponse("storage_path fuori scope utente/azienda", 403, corsHeaders);
    }

    const { data: file, error: dlErr } = await supabaseAdmin.storage
      .from(bucket)
      .download(storagePath);
    if (dlErr || !file) {
      return errorResponse(`Download storage fallito: ${dlErr?.message ?? "file non trovato"}`, 500, corsHeaders);
    }
    const buffer = await (file as Blob).arrayBuffer();
    if (buffer.byteLength > 18 * 1024 * 1024) {
      return errorResponse("Documento troppo grande per OCR fattura (max 18MB)", 413, corsHeaders);
    }

    const mimeType = body?.mime_type || (file as Blob).type || "application/pdf";
    const base64 = bufferToBase64(buffer);
    const dataUrl = `data:${mimeType};base64,${base64}`;
    const isImage = mimeType.startsWith("image/");
    const userContent: unknown[] = [
      { type: "text", text: "Estrai dati fattura nel formato JSON specificato." },
      isImage
        ? { type: "image_url", image_url: { url: dataUrl, detail: "high" } }
        : {
            type: "file",
            file: {
              filename: body?.file_name ?? storagePath.split("/").pop() ?? "fattura.pdf",
              file_data: dataUrl,
            },
          },
    ];

    const { data: signed } = await supabaseAdmin.storage
      .from(bucket)
      .createSignedUrl(storagePath, 600);
    const previewUrl = signed?.signedUrl ?? null;

    const aiResult = await aiRouterComplete({
      supabase: supabaseAdmin,
      taskKey: "fattura_ricevuta_ocr",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
      params: { max_tokens: 3500, temperature: 0.0 },
      responseFormat: { type: "json_object" },
      companyId,
      userId,
      idempotencyKey: `ocr_fattura_${companyId}_${bucket}_${storagePath}`,
      estimatedCostEur: 0.12,
    });
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(aiResult.content || "{}");
    } catch {
      return errorResponse("OCR ha restituito JSON invalido", 500, corsHeaders);
    }

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
          pdf_url: previewUrl,
          pdf_storage_bucket: bucket,
          pdf_storage_path: storagePath,
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
      cost_real_eur: aiResult.costRealEur,
      duration_ms: aiResult.durationMs,
      model_used: aiResult.modelUsed,
      ledger_id: aiResult.ledgerId ?? null,
      created_invoice_id: createdId,
      preview_url: previewUrl,
      file_ref: { bucket, storage_path: storagePath },
    }, 200, corsHeaders);
  } catch (err) {
    if (err instanceof Response) return err;
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[ai-fattura-ricevuta-ocr] error:", msg);
    return errorResponse(msg, 500, corsHeaders);
  }
});
