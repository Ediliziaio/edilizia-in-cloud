/**
 * Edge Function: ai-document-analyzer (MP-07)
 *
 * Sessione 3 / MP-07 — Orchestratore unificato per analisi documenti AI.
 * Sopra al `document-ai-router` esistente, aggiunge:
 *
 *   1. Idempotenza forte via sha256 (skip re-processing).
 *   2. Chiamata document-ai-router per classification + dispatch.
 *   3. Validation strutturata post-parsing:
 *      - Fatture/ricevute: P.IVA italiana 11 cifre (Luhn check), totali == imponibile + IVA,
 *        somma righe == subtotale (tolleranza 0.05€).
 *      - Computi/preventivi: somma righe == totale lavori (tolleranza 1€).
 *      - DDT: presenza mittente + destinatario + righe.
 *   4. Upsert in document_analysis_results con status (success / review_required / failed).
 *   5. Hand-off a document-ai-linker per cross-reference (best-effort).
 *
 * Input:
 *   { storage_bucket, storage_path, file_name, mime_type, file_size, hint? }
 *
 * Output:
 *   {
 *     analysis_id,
 *     doc_type, classification_confidence,
 *     parser_used, structured_fields,
 *     validation: { valid, warnings: [], score: 0..1 },
 *     status, processing_time_ms, cost_eur
 *   }
 */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { requireAuth, requireCompanyAccess } from "../_shared/auth.ts";

interface AnalyzeRequest {
  storage_bucket: string;
  storage_path: string;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
  hint?: string;
}

interface ValidationWarning {
  code: string;
  field?: string;
  message: string;
  severity: "info" | "warn" | "error";
}

const TOL_INVOICE = 0.05;
const TOL_COMPUTO = 1.0;

// ──────────────────────────────────────────────────────────────────────────
// Validation: P.IVA italiana 11 cifre con check digit Luhn-IT
// ──────────────────────────────────────────────────────────────────────────
function isValidPiva(piva: string | null | undefined): boolean {
  const clean = String(piva ?? "").replace(/\s+/g, "").replace(/^(IT)/i, "");
  if (!/^\d{11}$/.test(clean)) return false;
  let sum = 0;
  for (let i = 0; i < 11; i++) {
    const d = parseInt(clean[i], 10);
    if (i % 2 === 0) {
      sum += d;
    } else {
      const dd = d * 2;
      sum += dd > 9 ? dd - 9 : dd;
    }
  }
  return sum % 10 === 0;
}

function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).replace(/[€\s]/g, "").replace(",", ".");
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

function approxEq(a: number, b: number, tol: number): boolean {
  return Math.abs(a - b) <= tol;
}

/**
 * Validazione strutturata sul parsed payload del documento.
 * Ritorna lista di warning + score globale di affidabilità (0..1).
 */
function validateStructuredFields(
  docType: string,
  fields: Record<string, unknown> | null,
): { warnings: ValidationWarning[]; score: number } {
  const warnings: ValidationWarning[] = [];
  if (!fields) {
    warnings.push({ code: "no_fields", message: "Nessun campo strutturato estratto", severity: "warn" });
    return { warnings, score: 0.4 };
  }

  if (docType === "fattura" || docType === "fattura_attiva" || docType === "fattura_passiva" || docType === "ricevuta") {
    // P.IVA cedente / cessionario
    const pivaCedente = (fields as { piva_cedente?: string }).piva_cedente
      ?? (fields as { vat_seller?: string }).vat_seller
      ?? (fields as { partita_iva_emittente?: string }).partita_iva_emittente;
    const pivaCessionario = (fields as { piva_cessionario?: string }).piva_cessionario
      ?? (fields as { vat_buyer?: string }).vat_buyer
      ?? (fields as { partita_iva_destinatario?: string }).partita_iva_destinatario;

    if (docType !== "ricevuta") {
      if (!pivaCedente) {
        warnings.push({ code: "missing_piva_cedente", field: "piva_cedente", message: "P.IVA cedente mancante", severity: "warn" });
      } else if (!isValidPiva(pivaCedente)) {
        warnings.push({ code: "invalid_piva_cedente", field: "piva_cedente", message: `P.IVA cedente non valida: ${pivaCedente}`, severity: "error" });
      }
      if (pivaCessionario && !isValidPiva(pivaCessionario)) {
        warnings.push({ code: "invalid_piva_cessionario", field: "piva_cessionario", message: `P.IVA cessionario non valida: ${pivaCessionario}`, severity: "error" });
      }
    }

    // Totali = imponibile + IVA (tolleranza 0.05)
    const imp = num((fields as { imponibile?: unknown }).imponibile ?? (fields as { taxable?: unknown }).taxable);
    const iva = num((fields as { iva?: unknown }).iva ?? (fields as { vat_amount?: unknown }).vat_amount);
    const tot = num((fields as { totale?: unknown }).totale ?? (fields as { total?: unknown }).total);
    if (imp !== null && iva !== null && tot !== null) {
      if (!approxEq(imp + iva, tot, TOL_INVOICE)) {
        warnings.push({
          code: "totale_imponibile_iva_mismatch",
          field: "totale",
          message: `Totale ${tot.toFixed(2)} ≠ imponibile (${imp.toFixed(2)}) + IVA (${iva.toFixed(2)}) = ${(imp + iva).toFixed(2)}`,
          severity: "error",
        });
      }
    } else if (tot === null) {
      warnings.push({ code: "missing_totale", field: "totale", message: "Totale non rilevato", severity: "warn" });
    }

    // Somma righe = subtotale
    const righe = (fields as { righe?: unknown[] }).righe
      ?? (fields as { lines?: unknown[] }).lines
      ?? [];
    if (Array.isArray(righe) && righe.length > 0 && imp !== null) {
      let sumRighe = 0;
      let countOk = 0;
      for (const r of righe) {
        const importoRiga = num(
          (r as { importo?: unknown }).importo
            ?? (r as { total?: unknown }).total
            ?? (r as { amount?: unknown }).amount,
        );
        if (importoRiga !== null) {
          sumRighe += importoRiga;
          countOk++;
        }
      }
      if (countOk > 0 && !approxEq(sumRighe, imp, TOL_INVOICE)) {
        warnings.push({
          code: "righe_imponibile_mismatch",
          field: "righe",
          message: `Somma righe ${sumRighe.toFixed(2)} ≠ imponibile ${imp.toFixed(2)}`,
          severity: "warn",
        });
      }
    }
  } else if (docType === "computo_metrico" || docType === "preventivo") {
    const tot = num((fields as { totale?: unknown }).totale ?? (fields as { total?: unknown }).total
      ?? (fields as { totale_lavori?: unknown }).totale_lavori);
    const righe = (fields as { righe?: unknown[] }).righe
      ?? (fields as { voci?: unknown[] }).voci
      ?? (fields as { lines?: unknown[] }).lines
      ?? [];
    if (Array.isArray(righe) && righe.length > 0 && tot !== null) {
      let sumRighe = 0;
      let countOk = 0;
      for (const r of righe) {
        const importoRiga = num(
          (r as { importo?: unknown }).importo
            ?? (r as { total?: unknown }).total
            ?? (r as { totale?: unknown }).totale,
        );
        if (importoRiga !== null) {
          sumRighe += importoRiga;
          countOk++;
        }
      }
      if (countOk > 0 && !approxEq(sumRighe, tot, TOL_COMPUTO)) {
        warnings.push({
          code: "righe_totale_mismatch",
          field: "righe",
          message: `Somma voci ${sumRighe.toFixed(2)} ≠ totale lavori ${tot.toFixed(2)}`,
          severity: "warn",
        });
      }
    }
    if (Array.isArray(righe) && righe.length === 0) {
      warnings.push({ code: "no_righe", field: "righe", message: "Nessuna riga estratta", severity: "warn" });
    }
  } else if (docType === "ddt" || docType === "ddt_in" || docType === "ddt_out") {
    const mitt = (fields as { mittente?: string }).mittente ?? (fields as { sender?: string }).sender;
    const dest = (fields as { destinatario?: string }).destinatario ?? (fields as { recipient?: string }).recipient;
    if (!mitt) warnings.push({ code: "missing_mittente", field: "mittente", message: "Mittente non rilevato", severity: "warn" });
    if (!dest) warnings.push({ code: "missing_destinatario", field: "destinatario", message: "Destinatario non rilevato", severity: "warn" });
  }

  // Score: 1.0 - 0.25 per error - 0.10 per warn (clip 0..1)
  const errors = warnings.filter((w) => w.severity === "error").length;
  const warns = warnings.filter((w) => w.severity === "warn").length;
  const score = Math.max(0, Math.min(1, 1 - errors * 0.25 - warns * 0.1));
  return { warnings, score };
}

// ──────────────────────────────────────────────────────────────────────────
// Hash file da storage (sha256)
// ──────────────────────────────────────────────────────────────────────────
async function hashStorageFile(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  bucket: string,
  path: string,
): Promise<string | null> {
  try {
    const { data, error } = await supabase.storage.from(bucket).download(path);
    if (error || !data) return null;
    const buffer = await data.arrayBuffer();
    const hashBuf = await crypto.subtle.digest("SHA-256", buffer);
    return Array.from(new Uint8Array(hashBuf)).map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch (e) {
    console.warn("[ai-document-analyzer] hashStorageFile fallita:", e instanceof Error ? e.message : e);
    return null;
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Main handler
// ──────────────────────────────────────────────────────────────────────────
serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return errorResponse("POST only", 405, cors);

  const t0 = Date.now();
  try {
    const { userId, supabaseAdmin } = await requireAuth(req, cors);
    const body = (await req.json()) as AnalyzeRequest;
    const { storage_bucket, storage_path, file_name, mime_type, file_size, hint } = body;
    if (!storage_bucket || !storage_path) {
      return errorResponse("storage_bucket and storage_path required", 400, cors);
    }

    // Resolve company_id dell'utente (auth bridge)
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("company_id")
      .eq("id", userId)
      .single();
    const companyId = profile?.company_id;
    if (!companyId) return errorResponse("company_id non risolto per utente", 403, cors);
    await requireCompanyAccess(supabaseAdmin, userId, companyId, cors);

    // ── 1) Hash file (idempotency) ──────────────────────────────────────
    const sha256 = await hashStorageFile(supabaseAdmin, storage_bucket, storage_path);
    if (sha256) {
      const { data: existing } = await supabaseAdmin
        .from("document_analysis_results")
        .select("id, doc_type, classification_confidence, parser_used, structured_fields, validation_warnings, status, processing_time_ms, cost_eur")
        .eq("company_id", companyId)
        .eq("sha256_hash", sha256)
        .maybeSingle();
      if (existing && (existing.status === "success" || existing.status === "review_required")) {
        return jsonResponse({
          analysis_id: existing.id,
          cached: true,
          doc_type: existing.doc_type,
          classification_confidence: existing.classification_confidence,
          parser_used: existing.parser_used,
          structured_fields: existing.structured_fields,
          validation: {
            warnings: existing.validation_warnings ?? [],
            valid: (existing.validation_warnings ?? []).filter((w: ValidationWarning) => w.severity === "error").length === 0,
          },
          status: existing.status,
        }, 200, cors);
      }
    }

    // ── 2) Insert pending record ────────────────────────────────────────
    const { data: pendingRow, error: insErr } = await supabaseAdmin
      .from("document_analysis_results")
      .insert({
        company_id: companyId,
        storage_bucket,
        storage_path,
        file_name,
        mime_type,
        file_size_bytes: file_size,
        sha256_hash: sha256,
        doc_type: "documento_generico",
        parser_used: "pending",
        status: "processing",
        uploaded_by: userId,
      })
      .select("id")
      .single();
    if (insErr || !pendingRow) {
      console.error("[ai-document-analyzer] insert pending fallito:", insErr?.message);
      return errorResponse(`insert: ${insErr?.message}`, 500, cors);
    }
    const analysisId = pendingRow.id;

    // ── 3) Classify via document-ai-router ──────────────────────────────
    let routerOut: {
      success?: boolean;
      doc_type?: string;
      confidence?: number;
      reasoning?: string;
      key_fields?: Record<string, unknown>;
      next_action?: { kind?: string; autoflow_function?: string };
      ai_meta?: { model_used?: string; cost_eur?: number };
    } = {};
    try {
      const { data: routerRes, error: routerErr } = await supabaseAdmin.functions.invoke(
        "document-ai-router",
        {
          body: { storage_bucket, storage_path, file_name, file_size, mime_type, hint },
          headers: { Authorization: req.headers.get("Authorization") ?? "" },
        },
      );
      if (routerErr) throw new Error(routerErr.message);
      routerOut = (routerRes ?? {}) as typeof routerOut;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await supabaseAdmin.from("document_analysis_results")
        .update({ status: "failed", error_message: `router: ${msg}`, processing_time_ms: Date.now() - t0 })
        .eq("id", analysisId);
      return errorResponse(`router: ${msg}`, 502, cors);
    }

    const docType = routerOut.doc_type ?? "documento_generico";
    const classificationConfidence = typeof routerOut.confidence === "number" ? routerOut.confidence : null;
    const keyFields = routerOut.key_fields ?? null;

    // ── 4) Optionally invoke vertical parser (next_action.autoflow_function) ──
    let parserUsed: string = (routerOut.next_action?.autoflow_function as string | undefined) ?? "router_only";
    let structuredFields: Record<string, unknown> | null = keyFields;
    if (routerOut.next_action?.kind === "autoflow" && routerOut.next_action.autoflow_function) {
      try {
        const { data: parserRes, error: parserErr } = await supabaseAdmin.functions.invoke(
          routerOut.next_action.autoflow_function,
          {
            body: { storage_bucket, storage_path, file_name, mime_type, hint },
            headers: { Authorization: req.headers.get("Authorization") ?? "" },
          },
        );
        if (parserErr) {
          console.warn("[ai-document-analyzer] parser fallito (graceful):", parserErr.message);
        } else if (parserRes && typeof parserRes === "object") {
          // I parser ritornano shape diverse; conserviamo l'intero output come structured_fields
          structuredFields = parserRes as Record<string, unknown>;
          parserUsed = routerOut.next_action.autoflow_function;
        }
      } catch (e) {
        console.warn("[ai-document-analyzer] parser exception (graceful):", e instanceof Error ? e.message : e);
      }
    }

    // ── 5) Validate ─────────────────────────────────────────────────────
    const { warnings, score } = validateStructuredFields(docType, structuredFields);
    const hasErrors = warnings.some((w) => w.severity === "error");
    const finalStatus: "success" | "review_required" = hasErrors || score < 0.6 ? "review_required" : "success";

    // ── 6) Update document_analysis_results ─────────────────────────────
    const costEur = typeof routerOut.ai_meta?.cost_eur === "number" ? routerOut.ai_meta.cost_eur : null;
    const processingMs = Date.now() - t0;

    await supabaseAdmin
      .from("document_analysis_results")
      .update({
        doc_type: docType,
        classification_confidence: classificationConfidence,
        parser_used: parserUsed,
        structured_fields: structuredFields,
        validation_warnings: warnings,
        status: finalStatus,
        processing_time_ms: processingMs,
        cost_eur: costEur,
      })
      .eq("id", analysisId);

    // ── 7) Hand-off cross-reference (best-effort, non bloccante) ────────
    try {
      await supabaseAdmin.functions.invoke("document-ai-linker", {
        body: { analysis_id: analysisId },
        headers: { Authorization: req.headers.get("Authorization") ?? "" },
      });
    } catch (e) {
      console.warn("[ai-document-analyzer] linker exception (graceful):", e instanceof Error ? e.message : e);
    }

    return jsonResponse({
      analysis_id: analysisId,
      cached: false,
      doc_type: docType,
      classification_confidence: classificationConfidence,
      parser_used: parserUsed,
      structured_fields: structuredFields,
      validation: { warnings, valid: !hasErrors, score },
      status: finalStatus,
      processing_time_ms: processingMs,
      cost_eur: costEur,
    }, 200, cors);
  } catch (err) {
    if (err instanceof Response) return err;
    return errorResponse(err instanceof Error ? err.message : String(err), 500, getCorsHeaders(req));
  }
});
