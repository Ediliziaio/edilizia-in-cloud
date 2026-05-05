/**
 * Edge Function: verify-purchase-order
 * FASE 4+6 — Motore AI di Verifica OdA
 *
 * Confronta un ordine d'acquisto (fornitore) con l'ordine cliente
 * usando Claude AI per identificare discrepanze.
 *
 * Modalita:
 *  - auto: confronto dati strutturati OdA vs ordine cliente
 *  - document_upload: confronto con documento fornitore (PDF/immagine)
 */

import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { requireAuth, requireCompanyAccess } from "../_shared/auth.ts";
import { buildStableAiIdempotencyKey, chargeDirectAiCall, estimateTokenCostUsd } from "../_shared/directAiLedger.ts";

// ── Types ─────────────────────────────────────────────────────────────────

interface VerifyRequest {
  purchase_order_id: string;
  order_id?: string;
  supplier_document_url?: string;
  supplier_document_base64?: string;
  verification_mode: "auto" | "manual" | "document_upload";
  idempotency_key?: string;
}

interface VerificationResult {
  overall_result: "match" | "mismatch" | "partial_match";
  confidence_score: number;
  summary: string;
  total_items_checked: number;
  items_matched: number;
  items_mismatched: number;
  items_missing: number;
  items_extra: number;
  discrepancies: Array<{
    type: string;
    severity: "critical" | "warning" | "info";
    item_reference: string;
    field_name: string;
    expected_value: string;
    actual_value: string;
    explanation: string;
    suggestion: string;
    confidence: number;
  }>;
  recommendations: string[];
  price_analysis?: {
    client_total: number;
    supplier_total: number;
    difference: number;
    difference_percent: number;
    price_note: string;
  };
}

// ── Constants ─────────────────────────────────────────────────────────────

const DAILY_LIMIT = 10;
const MAX_DOC_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
const AI_TIMEOUT_MS = 60000;
const AI_MODEL = "claude-sonnet-4-20250514";

function compactDocumentForFingerprint(documentBase64?: string): string | null {
  if (!documentBase64) return null;
  // The input may be a multi-MB base64 document. A deterministic slice is enough
  // for retry idempotency without keeping a large payload in memory twice.
  const prefix = documentBase64.slice(0, 2048);
  const suffix = documentBase64.slice(-2048);
  return `${documentBase64.length}:${prefix}:${suffix}`;
}

// ── System Prompt (FASE 6) ────────────────────────────────────────────────

const SYSTEM_PROMPT = `Sei un esperto verificatore di ordini nel settore edilizia e serramenti in Italia.

Il tuo compito è confrontare DUE documenti:
1. DOCUMENTO CLIENTE: l'ordine originale del cliente (cosa ha richiesto)
2. DOCUMENTO FORNITORE: il preventivo/conferma d'ordine del fornitore (cosa verrà prodotto/consegnato)

Devi verificare che OGNI articolo, misura, specifica e dettaglio del documento fornitore corrisponda ESATTAMENTE a quanto richiesto dal cliente.

CONTESTO SETTORE:
- Lavori nel settore edilizia italiana (serramenti, infissi, materiali da costruzione)
- Le misure sono tipicamente in millimetri (mm) o centimetri (cm)
- I colori seguono le codifiche RAL (es. RAL 9010 Bianco Puro)
- I materiali comuni: PVC, alluminio, legno, legno-alluminio, acciaio
- Le tipologie: finestra, porta-finestra, scorrevole, vasistas, anta-ribalta, fisso
- Accessori: maniglie, cerniere, vetrocamera, cassonetti, avvolgibili, zanzariere, soglie
- Certificazioni: marcatura CE, UNI EN 14351-1, trasmittanza termica Uw

REGOLE DI SEVERITA:
- CRITICAL: Discrepanza che causa problemi gravi se non corretta (misura sbagliata >5mm, materiale diverso, tipologia apertura diversa, articolo mancante, quantità diversa)
- WARNING: Discrepanza che potrebbe causare problemi (colore leggermente diverso, accessorio mancante, prezzo diverso >5%, vetro composizione diversa)
- INFO: Differenza minore o migliorativa (misura entro tolleranza, prezzo più basso, accessorio aggiuntivo gratuito, tempistica diversa)`;

// ── User Prompt Builder ───────────────────────────────────────────────────

function buildUserPrompt(
  orderData: { code: string; items: unknown[]; total: number },
  poData: { oda_number: string; supplier_name: string; items: unknown[]; total: number; notes?: string },
): string {
  return `ISTRUZIONI DI VERIFICA:

Confronta i due documenti seguenti e identifica OGNI discrepanza.

Per ogni articolo, verifica TUTTI questi campi:
1. QUANTITA: il numero di pezzi deve corrispondere esattamente
2. MISURE: Larghezza (L) e Altezza (H) in mm. Tolleranza: ±2mm per serramenti, ±5mm per muratura
3. MATERIALE: tipo di materiale (PVC, alluminio, legno, ecc.)
4. COLORE/FINITURA: codice RAL, finitura, colore interno vs esterno
5. MODELLO/TIPOLOGIA: tipo apertura, numero ante, senso apertura
6. VETRO/VETROCAMERA: composizione, gas, trattamenti, trasmittanza Ug
7. ACCESSORI: maniglia, cerniere, cassonetto, avvolgibile, zanzariera, soglia, controtelaio
8. PREZZI: prezzo unitario, sconti, totale per riga, totale complessivo, IVA
9. TEMPI DI CONSEGNA: data consegna, condizioni
10. CONDIZIONI COMMERCIALI: termini pagamento, garanzia, posa in opera

=== DOCUMENTO CLIENTE (Ordine #${orderData.code}) ===

Articoli ordinati dal cliente:
${JSON.stringify(orderData.items, null, 2)}

Totale ordine cliente: €${orderData.total}

=== DOCUMENTO FORNITORE (OdA #${poData.oda_number}) ===

Fornitore: ${poData.supplier_name}
${poData.notes ? `Note: ${poData.notes}` : ""}

Articoli nel preventivo/conferma fornitore:
${JSON.stringify(poData.items, null, 2)}

Totale fornitore: €${poData.total}

FORMATO OUTPUT OBBLIGATORIO (rispondi SOLO con questo JSON, nessun altro testo):

{
  "overall_result": "match" | "mismatch" | "partial_match",
  "confidence_score": <numero 0-100>,
  "summary": "<riassunto in italiano max 200 caratteri>",
  "total_items_checked": <numero>,
  "items_matched": <numero>,
  "items_mismatched": <numero>,
  "items_missing": <numero articoli cliente non trovati nel fornitore>,
  "items_extra": <numero articoli fornitore non richiesti>,
  "discrepancies": [
    {
      "type": "<quantity_mismatch|measurement_mismatch|material_mismatch|color_mismatch|model_mismatch|accessory_missing|accessory_extra|price_mismatch|item_missing|item_extra|specification_mismatch|delivery_mismatch|other>",
      "severity": "critical" | "warning" | "info",
      "item_reference": "<riferimento articolo es. Finestra #3>",
      "field_name": "<nome campo es. larghezza>",
      "expected_value": "<valore ordine cliente>",
      "actual_value": "<valore fornitore>",
      "explanation": "<spiegazione in italiano>",
      "suggestion": "<suggerimento per risolvere>",
      "confidence": <0-100>
    }
  ],
  "recommendations": ["<raccomandazione in italiano>"],
  "price_analysis": {
    "client_total": <numero>,
    "supplier_total": <numero>,
    "difference": <numero>,
    "difference_percent": <numero>,
    "price_note": "<nota su differenza prezzi>"
  }
}`;
}

function buildDocumentPrompt(
  orderData: { code: string; items: unknown[]; total: number },
  documentType: "pdf" | "image",
): string {
  return `ISTRUZIONI DI VERIFICA:

Confronta il documento del cliente con il documento del fornitore allegato.

${documentType === "image" ? `ISTRUZIONI AGGIUNTIVE PER DOCUMENTO IMMAGINE:
L'immagine allegata è una foto/scansione del preventivo del fornitore.
1. ESTRAI tutti i dati leggibili dall'immagine
2. Se alcune parti sono illeggibili, indica CHIARAMENTE quali
3. Se il documento è in formato tabellare, leggi riga per riga
4. Abbreviazioni tipiche: AR=anta-ribalta, VAS=vasistas, PF=porta-finestra, SC=scorrevole, BI=bianco, EL=effetto legno
` : ""}

=== DOCUMENTO CLIENTE (Ordine #${orderData.code}) ===

Articoli ordinati dal cliente:
${JSON.stringify(orderData.items, null, 2)}

Totale ordine cliente: €${orderData.total}

=== DOCUMENTO FORNITORE ===
${documentType === "image" ? "Vedi immagine allegata." : "Vedi documento PDF allegato - analizza il testo estratto."}

FORMATO OUTPUT OBBLIGATORIO (rispondi SOLO con questo JSON, nessun altro testo):

{
  "overall_result": "match" | "mismatch" | "partial_match",
  "confidence_score": <numero 0-100>,
  "summary": "<riassunto in italiano max 200 caratteri>",
  "total_items_checked": <numero>,
  "items_matched": <numero>,
  "items_mismatched": <numero>,
  "items_missing": <numero>,
  "items_extra": <numero>,
  "discrepancies": [
    {
      "type": "<tipo dalla lista>",
      "severity": "critical" | "warning" | "info",
      "item_reference": "<riferimento articolo>",
      "field_name": "<nome campo>",
      "expected_value": "<valore ordine cliente>",
      "actual_value": "<valore fornitore>",
      "explanation": "<spiegazione in italiano>",
      "suggestion": "<suggerimento per risolvere>",
      "confidence": <0-100>
    }
  ],
  "recommendations": ["<raccomandazione in italiano>"],
  "price_analysis": {
    "client_total": <numero>,
    "supplier_total": <numero>,
    "difference": <numero>,
    "difference_percent": <numero>,
    "price_note": "<nota>"
  }
}`;
}

// ── Main Handler ──────────────────────────────────────────────────────────

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  const corsH = getCorsHeaders(req);

  try {
    const { userId, supabaseAdmin } = await requireAuth(req, corsH);
    const body: VerifyRequest = await req.json();
    const { purchase_order_id, order_id, supplier_document_url, supplier_document_base64, verification_mode } = body;

    if (!purchase_order_id) {
      return errorResponse("purchase_order_id obbligatorio", 400, corsH);
    }

    // ── 1. Get company_id and validate ownership ──────────────────────

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("company_id")
      .eq("id", userId)
      .single();

    if (!profile?.company_id) {
      return errorResponse("Utente non associato a un'azienda", 403, corsH);
    }
    const companyId: string = profile.company_id;
    await requireCompanyAccess(supabaseAdmin, userId, companyId, corsH);

    // ── 2. Load OdA data ──────────────────────────────────────────────

    const { data: po, error: poErr } = await supabaseAdmin
      .from("purchase_orders")
      .select("*, suppliers(name, vat_number)")
      .eq("id", purchase_order_id)
      .eq("company_id", companyId)
      .single();

    if (poErr || !po) {
      return errorResponse("Ordine d'acquisto non trovato", 404, corsH);
    }

    const { data: poItems } = await supabaseAdmin
      .from("purchase_order_items")
      .select("*")
      .eq("purchase_order_id", purchase_order_id)
      .order("sort_order");

    // ── 3. Rate limiting (10/day per company) ─────────────────────────

    const today = new Date().toISOString().slice(0, 10);
    const { count: dailyCount } = await supabaseAdmin
      .from("purchase_order_verifications")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .gte("created_at", `${today}T00:00:00Z`);

    if ((dailyCount ?? 0) >= DAILY_LIMIT) {
      return errorResponse(
        `Limite giornaliero raggiunto (${DAILY_LIMIT} verifiche/giorno). Riprova domani.`,
        429,
        corsH,
      );
    }

    // ── 4. Load order data if needed ──────────────────────────────────

    const effectiveOrderId = order_id || po.order_id;
    let orderData: { code: string; items: unknown[]; total: number } | null = null;

    if (effectiveOrderId) {
      const { data: order } = await supabaseAdmin
        .from("orders")
        .select("order_code, total_amount")
        .eq("id", effectiveOrderId)
        .eq("company_id", companyId)
        .single();

      // Items live in order_items table, join supplier name
      const { data: orderItemRows } = await supabaseAdmin
        .from("order_items")
        .select("name, quantity, purchase_price, unit_price, description, status, supplier_id, suppliers(name)")
        .eq("order_id", effectiveOrderId)
        .order("position");

      if (order) {
        const rawItems = orderItemRows ?? [];
        orderData = {
          code: order.order_code || effectiveOrderId,
          items: rawItems.map((item: Record<string, unknown>, idx: number) => ({
            numero: idx + 1,
            nome: item.name || "Articolo",
            quantita: item.quantity || 1,
            prezzo_unitario: item.purchase_price || item.unit_price || 0,
            descrizione: item.description || "",
            fornitore: (item.suppliers as Record<string, unknown>)?.name || "",
            stato: item.status || "da_ordinare",
          })),
          total: Number(order.total_amount) || 0,
        };
      }
    }

    // ── 5. Determine document source ──────────────────────────────────

    let supplierDocumentUrl = supplier_document_url || "";
    let supplierDocType: string = "purchase_order";
    let imageBase64: string | null = null;

    if (verification_mode === "document_upload") {
      if (supplier_document_base64) {
        // Check size (base64 is ~33% larger than binary)
        if (supplier_document_base64.length > MAX_DOC_SIZE_BYTES * 1.34) {
          return errorResponse("Documento troppo grande (max 10MB)", 400, corsH);
        }
        // Detect if it's an image or PDF by data URL prefix or magic bytes
        const isImage = supplier_document_base64.startsWith("data:image/") ||
          supplier_document_base64.startsWith("/9j/") || // JPEG
          supplier_document_base64.startsWith("iVBOR"); // PNG

        if (isImage) {
          supplierDocType = "uploaded_image";
          imageBase64 = supplier_document_base64.replace(/^data:image\/[^;]+;base64,/, "");
        } else {
          supplierDocType = "uploaded_pdf";
        }
      } else if (supplier_document_url) {
        supplierDocumentUrl = supplier_document_url;
        supplierDocType = supplier_document_url.match(/\.(jpg|jpeg|png|webp)$/i)
          ? "uploaded_image"
          : "uploaded_pdf";
      } else {
        return errorResponse("Documento fornitore non fornito per modalità upload", 400, corsH);
      }
    }

    // ── 6. Build AI prompt ────────────────────────────────────────────

    const poDataForPrompt = {
      oda_number: po.oda_number,
      supplier_name: (po.suppliers as Record<string, unknown>)?.name as string || "Fornitore",
      items: (poItems ?? []).map((item: Record<string, unknown>, idx: number) => ({
        numero: idx + 1,
        descrizione: item.description || "",
        quantita: item.quantity || 1,
        prezzo_unitario: item.unit_price || 0,
        sconto: item.discount_percent || 0,
        iva: item.vat_rate || 22,
        unita_misura: item.unit_of_measure || "pz",
      })),
      total: Number(po.total) || 0,
      notes: po.notes || "",
    };

    // Build messages for Claude API
    const messages: Array<{ role: string; content: unknown }> = [];

    // Detect raw base64 for PDF (non-image document upload)
    const pdfBase64 = (verification_mode === "document_upload" && supplier_document_base64 && supplierDocType === "uploaded_pdf")
      ? supplier_document_base64.replace(/^data:application\/pdf;base64,/, "")
      : null;

    if (verification_mode === "document_upload" && pdfBase64 && orderData) {
      // PDF document mode — send as document block
      messages.push({
        role: "user",
        content: [
          {
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: pdfBase64 },
          },
          {
            type: "text",
            text: buildDocumentPrompt(orderData, "pdf"),
          },
        ],
      });
    } else if (verification_mode === "document_upload" && imageBase64 && orderData) {
      // Vision mode — send image
      messages.push({
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: "image/jpeg", data: imageBase64 },
          },
          {
            type: "text",
            text: buildDocumentPrompt(orderData, "image"),
          },
        ],
      });
    } else if (verification_mode === "document_upload" && !orderData) {
      return errorResponse("Ordine cliente necessario per confronto documento", 400, corsH);
    } else if (orderData) {
      // Structured or manual comparison
      messages.push({
        role: "user",
        content: buildUserPrompt(orderData, poDataForPrompt),
      });
    } else {
      return errorResponse("Ordine cliente non trovato — impossibile verificare", 400, corsH);
    }

    // ── 7. Call Claude API ────────────────────────────────────────────

    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!anthropicKey) {
      return errorResponse("Chiave API Anthropic non configurata", 500, corsH);
    }

    const startTime = Date.now();
    let result: VerificationResult;
    let tokensUsed = 0;
    let rawResponse: unknown = null;

    const callClaude = async (retry = 0): Promise<Response> => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

      try {
        const resp = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": anthropicKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: AI_MODEL,
            max_tokens: 4096,
            system: SYSTEM_PROMPT,
            messages,
          }),
          signal: controller.signal,
        });
        clearTimeout(timeout);
        return resp;
      } catch (err) {
        clearTimeout(timeout);
        if (retry < 1) {
          // Exponential backoff retry
          await new Promise((r) => setTimeout(r, 2000 * (retry + 1)));
          return callClaude(retry + 1);
        }
        throw err;
      }
    };

    const aiResponse = await callClaude();

    if (!aiResponse.ok) {
      const errBody = await aiResponse.text();
      console.error("Claude API error:", aiResponse.status, errBody);

      // Create error record
      await supabaseAdmin.from("purchase_order_verifications").insert({
        company_id: companyId,
        purchase_order_id,
        order_id: effectiveOrderId || null,
        status: "error",
        supplier_document_url: supplierDocumentUrl || "structured_data",
        supplier_document_type: supplierDocType,
        overall_summary: `Errore API AI: ${aiResponse.status}`,
        processing_time_ms: Date.now() - startTime,
        verified_by: userId,
      });

      return errorResponse(`Errore nell'analisi AI: ${aiResponse.status}`, 502, corsH);
    }

    const aiData = await aiResponse.json();
    rawResponse = aiData;
    const inputTokens = Number(aiData.usage?.input_tokens ?? 0);
    const outputTokens = Number(aiData.usage?.output_tokens ?? 0);
    tokensUsed = inputTokens + outputTokens;
    const requestIdempotencyKey = typeof body.idempotency_key === "string"
      ? body.idempotency_key.trim().replace(/[^a-zA-Z0-9:_-]/g, "_").slice(0, 160)
      : "";
    const chargeIdempotencyKey = requestIdempotencyKey
      ? `purchase_order_verification_${companyId}_${requestIdempotencyKey}`
      : await buildStableAiIdempotencyKey("purchase_order_verification", [{
      company_id: companyId,
      purchase_order_id,
      order_id: effectiveOrderId ?? null,
      verification_mode,
      supplier_document_type: supplierDocType,
      supplier_document_url: supplierDocumentUrl || null,
      supplier_document_base64: compactDocumentForFingerprint(supplier_document_base64),
      order_data: orderData,
      purchase_order_data: poDataForPrompt,
    }]);

    await chargeDirectAiCall({
      supabase: supabaseAdmin,
      idempotencyKey: chargeIdempotencyKey,
      companyId,
      userId,
      taskKey: "purchase_order_verification",
      tierKey: "t3_balanced",
      modelUsed: AI_MODEL,
      tokensIn: inputTokens,
      tokensOut: outputTokens,
      costRealUsd: estimateTokenCostUsd({
        provider: "anthropic",
        inputTokens,
        outputTokens,
        fallbackCostUsd: 0.01,
      }),
      metadata: {
        purchase_order_id,
        order_id: effectiveOrderId ?? null,
        verification_mode,
      },
    });

    // Parse the JSON response from Claude
    const textContent = aiData.content?.find((c: Record<string, unknown>) => c.type === "text");
    if (!textContent?.text) {
      throw new Error("Risposta AI vuota");
    }

    // Extract JSON from response (handle markdown code blocks)
    let jsonStr = textContent.text.trim();
    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    }

    try {
      result = JSON.parse(jsonStr) as VerificationResult;
    } catch {
      console.error("Failed to parse AI response:", jsonStr.slice(0, 500));
      throw new Error("Risposta AI non valida (JSON non parsabile)");
    }

    const processingTimeMs = Date.now() - startTime;

    // ── 8. Save verification record ───────────────────────────────────

    const { data: verification, error: vErr } = await supabaseAdmin
      .from("purchase_order_verifications")
      .insert({
        company_id: companyId,
        purchase_order_id,
        order_id: effectiveOrderId || null,
        status: "completed",
        result: result.overall_result,
        confidence_score: result.confidence_score,
        overall_summary: result.summary,
        client_document_url: orderData ? `order:${effectiveOrderId}` : null,
        client_document_type: orderData ? "order_items" : null,
        supplier_document_url: supplierDocumentUrl || "structured_data",
        supplier_document_type: supplierDocType,
        total_items_checked: result.total_items_checked,
        items_matched: result.items_matched,
        items_mismatched: result.items_mismatched,
        items_missing: result.items_missing,
        items_extra: result.items_extra,
        ai_model: AI_MODEL,
        ai_tokens_used: tokensUsed,
        ai_raw_response: rawResponse,
        processing_time_ms: processingTimeMs,
        verified_by: userId,
        verified_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (vErr) throw new Error(`Errore salvataggio verifica: ${vErr.message}`);

    // ── 9. Save discrepancies ─────────────────────────────────────────

    if (result.discrepancies && result.discrepancies.length > 0) {
      const discRows = result.discrepancies.map((d) => ({
        verification_id: verification!.id,
        company_id: companyId,
        discrepancy_type: d.type,
        severity: d.severity,
        item_reference: d.item_reference,
        field_name: d.field_name,
        expected_value: d.expected_value,
        actual_value: d.actual_value,
        expected_source: orderData ? `Ordine cliente #${orderData.code}` : null,
        actual_source: `OdA fornitore #${po.oda_number}`,
        ai_explanation: d.explanation,
        ai_suggestion: d.suggestion,
        ai_confidence: d.confidence,
      }));

      const { error: dErr } = await supabaseAdmin
        .from("verification_discrepancies")
        .insert(discRows);

      if (dErr) console.error("Error saving discrepancies:", dErr);
    }

    // ── 10. Update purchase_orders.last_verification_id ───────────────

    await supabaseAdmin
      .from("purchase_orders")
      .update({ last_verification_id: verification!.id })
      .eq("id", purchase_order_id);

    // ── 11. Track AI usage ────────────────────────────────────────────

    const month = new Date().toISOString().slice(0, 7);
    const { data: existing } = await supabaseAdmin
      .from("company_ai_usage")
      .select("id, usage_count, total_tokens")
      .eq("company_id", companyId)
      .eq("feature", "purchase_order_verification")
      .eq("month", month)
      .maybeSingle();

    if (existing) {
      await supabaseAdmin
        .from("company_ai_usage")
        .update({
          usage_count: (existing.usage_count || 0) + 1,
          total_tokens: (existing.total_tokens || 0) + tokensUsed,
        })
        .eq("id", existing.id);
    } else {
      await supabaseAdmin
        .from("company_ai_usage")
        .insert({
          company_id: companyId,
          feature: "purchase_order_verification",
          month,
          usage_count: 1,
          usage_limit: 300, // monthly limit
          total_tokens: tokensUsed,
        });
    }

    // ── 12. Return result ─────────────────────────────────────────────

    return jsonResponse({
      verification_id: verification!.id,
      status: "completed",
      result: result.overall_result,
      confidence_score: result.confidence_score,
      summary: result.summary,
      total_items_checked: result.total_items_checked,
      items_matched: result.items_matched,
      items_mismatched: result.items_mismatched,
      items_missing: result.items_missing,
      items_extra: result.items_extra,
      discrepancies: result.discrepancies,
      recommendations: result.recommendations,
      price_analysis: result.price_analysis,
      processing_time_ms: processingTimeMs,
      tokens_used: tokensUsed,
    }, 200, corsH);

  } catch (err) {
    if (err instanceof Response) return err;
    console.error("verify-purchase-order error:", err);
    return errorResponse(
      `Errore nella verifica: ${err instanceof Error ? err.message : "errore sconosciuto"}`,
      500,
      corsH,
    );
  }
});
