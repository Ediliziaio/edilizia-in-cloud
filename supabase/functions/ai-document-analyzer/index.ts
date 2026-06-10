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
import { gateAiPayment } from "../_shared/requirePaymentMethod.ts";

interface AnalyzeRequest {
  storage_bucket: string;
  storage_path: string;
  company_id?: string;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
  hint?: string;
}

type AnyRecord = Record<string, unknown>;

interface ValidationWarning {
  code: string;
  field?: string;
  message: string;
  severity: "info" | "warn" | "error";
}

interface ParserInvocation {
  functionName: string;
  body: AnyRecord;
  metadata?: AnyRecord;
}

const TOL_INVOICE = 0.05;
const TOL_COMPUTO = 1.0;
const ROUTER_CLASSIFIER_MAX_SIZE = 18 * 1024 * 1024;

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

function safeStorageName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 140) || "documento.pdf";
}

function inferComputoFileType(fileName?: string, mimeType?: string): "pdf" | "xlsx" | "xls" | "xpwe" | "dcf" | "image" {
  const lower = String(fileName ?? "").toLowerCase();
  if ((mimeType ?? "").startsWith("image/")) return "image";
  if (lower.endsWith(".xlsx")) return "xlsx";
  if (lower.endsWith(".xls")) return "xls";
  if (lower.endsWith(".xpwe")) return "xpwe";
  if (lower.endsWith(".dcf")) return "dcf";
  return "pdf";
}

async function downloadStorageAsBase64(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  bucket: string,
  path: string,
): Promise<{ base64: string; blob: Blob; bytes: number }> {
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error || !data) {
    throw new Error(`download storage: ${error?.message ?? "file non trovato"}`);
  }
  const blob = data as Blob;
  const buffer = await blob.arrayBuffer();
  const bytes = buffer.byteLength;
  const view = new Uint8Array(buffer);
  let raw = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < view.length; i += chunkSize) {
    raw += String.fromCharCode(...view.subarray(i, i + chunkSize));
  }
  return { base64: btoa(raw), blob, bytes };
}

async function copyStorageForParser(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  params: {
    fromBucket: string;
    fromPath: string;
    toBucket: string;
    toPath: string;
    mimeType?: string;
  },
): Promise<string> {
  if (params.fromBucket === params.toBucket && params.fromPath === params.toPath) {
    return params.toPath;
  }
  const { blob } = await downloadStorageAsBase64(supabase, params.fromBucket, params.fromPath);
  const { error } = await supabase.storage
    .from(params.toBucket)
    .upload(params.toPath, blob, {
      contentType: params.mimeType ?? "application/pdf",
      upsert: false,
    });
  if (error && !String(error.message ?? "").toLowerCase().includes("already exists")) {
    throw new Error(`copy ${params.toBucket}: ${error.message}`);
  }
  return params.toPath;
}

async function ensureComputoUpload(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseAdmin: any,
  params: {
    companyId: string;
    userId: string;
    storageBucket: string;
    storagePath: string;
    fileName?: string;
    fileSize?: number;
    mimeType?: string;
    analysisId: string;
  },
): Promise<string> {
  let computoStoragePath = params.storagePath;
  const fileName = params.fileName ?? params.storagePath.split("/").pop() ?? "computo.pdf";

  if (params.storageBucket !== "computi") {
    const { blob, bytes } = await downloadStorageAsBase64(
      supabaseAdmin,
      params.storageBucket,
      params.storagePath,
    );
    computoStoragePath = `${params.companyId}/document-ai/${params.analysisId}-${safeStorageName(fileName)}`;
    const { error: upErr } = await supabaseAdmin.storage
      .from("computi")
      .upload(computoStoragePath, blob, {
        contentType: params.mimeType ?? "application/pdf",
        upsert: false,
      });
    if (upErr && !String(upErr.message ?? "").toLowerCase().includes("already exists")) {
      throw new Error(`copy computo: ${upErr.message}`);
    }
    params.fileSize = params.fileSize ?? bytes;
  }

  const { data: upload, error } = await supabaseAdmin
    .from("computo_uploads")
    .insert({
      company_id: params.companyId,
      uploaded_by: params.userId,
      file_name: fileName,
      file_type: inferComputoFileType(fileName, params.mimeType),
      file_size: params.fileSize ?? 0,
      storage_path: computoStoragePath,
      extraction_status: "uploading",
    })
    .select("id")
    .single();

  if (error || !upload?.id) {
    throw new Error(`computo_uploads insert: ${error?.message ?? "id mancante"}`);
  }
  return upload.id as string;
}

async function buildParserInvocation(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseAdmin: any,
  params: {
    parserName: string;
    docType: string;
    companyId: string;
    userId: string;
    analysisId: string;
    storageBucket: string;
    storagePath: string;
    fileName?: string;
    fileSize?: number;
    mimeType?: string;
    hint?: string;
  },
): Promise<ParserInvocation | null> {
  const resolvedFileName = params.fileName ?? params.storagePath.split("/").pop() ?? "documento";
  const baseStorageBody = {
    storage_bucket: params.storageBucket,
    storage_path: params.storagePath,
    file_name: resolvedFileName,
    mime_type: params.mimeType ?? "application/pdf",
    company_id: params.companyId,
  };

  switch (params.parserName) {
    case "ddt-ai-extract":
      return { functionName: params.parserName, body: baseStorageBody };

    case "generic-doc-ai-extract":
      return {
        functionName: params.parserName,
        body: { ...baseStorageBody, doc_type: params.docType },
      };

    case "ai-fattura-ricevuta-ocr":
      return {
        functionName: params.parserName,
        body: {
          storage_bucket: params.storageBucket,
          bucket: params.storageBucket,
          storage_path: params.storagePath,
          file_name: resolvedFileName,
          mime_type: params.mimeType ?? "application/pdf",
          company_id: params.companyId,
          auto_create: false,
        },
      };

    case "computo-ai-extract": {
      const computoUploadId = await ensureComputoUpload(supabaseAdmin, {
        companyId: params.companyId,
        userId: params.userId,
        storageBucket: params.storageBucket,
        storagePath: params.storagePath,
        fileName: params.fileName,
        fileSize: params.fileSize,
        mimeType: params.mimeType,
        analysisId: params.analysisId,
      });
      return {
        functionName: params.parserName,
        body: { computoUploadId },
        metadata: { computo_upload_id: computoUploadId },
      };
    }

    case "ai-tabella-finanziamento-extract":
      {
        const financeStoragePath = params.storageBucket === "finanziamenti-tabelle"
          ? params.storagePath
          : await copyStorageForParser(supabaseAdmin, {
              fromBucket: params.storageBucket,
              fromPath: params.storagePath,
              toBucket: "finanziamenti-tabelle",
              toPath: `${params.companyId}/document-ai/${params.analysisId}-${safeStorageName(resolvedFileName)}`,
              mimeType: params.mimeType,
            });
        if (!financeStoragePath.startsWith(`${params.companyId}/`)) return null;
        return {
          functionName: params.parserName,
          body: { storage_path: financeStoragePath, hint: params.hint ? { note: params.hint } : undefined },
        };
      }

    case "ai-listino-extract":
      {
        const listinoStoragePath = params.storageBucket === "listini-tmp" && params.storagePath.startsWith(`${params.userId}/`)
          ? params.storagePath
          : await copyStorageForParser(supabaseAdmin, {
              fromBucket: params.storageBucket,
              fromPath: params.storagePath,
              toBucket: "listini-tmp",
              toPath: `${params.userId}/document-ai/${params.analysisId}-${safeStorageName(resolvedFileName)}`,
              mimeType: params.mimeType,
            });
        if (!listinoStoragePath.startsWith(`${params.userId}/`)) return null;
        return {
          functionName: params.parserName,
          body: { storage_path: listinoStoragePath, object_type: "product" },
        };
      }

    case "ai-biz-card-ocr": {
      if (!(params.mimeType ?? "").startsWith("image/")) return null;
      const { base64 } = await downloadStorageAsBase64(supabaseAdmin, params.storageBucket, params.storagePath);
      return {
        functionName: params.parserName,
        body: {
          image_base64: base64,
          mime: params.mimeType ?? "image/jpeg",
          company_id: params.companyId,
          auto_create_contact: false,
        },
      };
    }

    default:
      return null;
  }
}

function normalizeParserResult(
  parserName: string,
  parserRes: unknown,
  metadata?: AnyRecord,
): AnyRecord {
  const res = (parserRes && typeof parserRes === "object" ? parserRes : {}) as AnyRecord;
  let extracted: AnyRecord;

  if (parserName === "ddt-ai-extract") {
    extracted = ((res.ddt as AnyRecord | undefined) ?? res) as AnyRecord;
  } else if (parserName === "generic-doc-ai-extract" || parserName === "ai-fattura-ricevuta-ocr" || parserName === "ai-biz-card-ocr") {
    extracted = ((res.extracted as AnyRecord | undefined) ?? res) as AnyRecord;
  } else if (parserName === "ai-listino-extract") {
    extracted = {
      rows: res.rows ?? [],
      confidence: res.confidence ?? null,
      detected_supplier: res.detected_supplier ?? null,
    };
  } else if (parserName === "ai-tabella-finanziamento-extract") {
    extracted = {
      rows: res.rows ?? [],
      detected: res.detected ?? null,
      confidence: res.confidence ?? null,
    };
  } else {
    extracted = res;
  }

  return metadata ? { ...extracted, _parser_meta: metadata } : extracted;
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
    const { storage_bucket, storage_path, company_id, file_name, mime_type, file_size, hint } = body;
    if (!storage_bucket || !storage_path) {
      return errorResponse("storage_bucket and storage_path required", 400, cors);
    }
    const resolvedFileName = file_name ?? storage_path.split("/").pop() ?? "documento";
    const resolvedMimeType = mime_type ?? "application/pdf";

    // Resolve company_id dell'utente, ma rispetta l'azienda effettiva passata dal client
    // (necessario per super admin / company switcher).
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("company_id")
      .eq("id", userId)
      .single();
    const companyId = company_id ?? profile?.company_id;
    if (!companyId) return errorResponse("company_id non risolto per utente", 403, cors);
    await requireCompanyAccess(supabaseAdmin, userId, companyId, cors);

    // Gate carta (audit AI 2026-06): strumento a costo senza controllo pagamento.
    const paymentBlock = await gateAiPayment(supabaseAdmin, companyId, cors);
    if (paymentBlock) return paymentBlock;

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
        file_name: resolvedFileName,
        mime_type: resolvedMimeType,
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
    const fileExt = resolvedFileName.split(".").pop()?.toLowerCase() ?? "";
    const canTreatLargeFileAsComputo = !!file_size
      && file_size > ROUTER_CLASSIFIER_MAX_SIZE
      && ["pdf", "xlsx", "xls", "xpwe", "dcf"].includes(fileExt);

    if (canTreatLargeFileAsComputo) {
      routerOut = {
        success: true,
        doc_type: "computo_metrico",
        confidence: 0.55,
        reasoning: "File sopra soglia del classificatore universale: instradato al parser computo/preventivo dedicato da 50MB.",
        key_fields: {
          file_name: resolvedFileName,
          file_size_mb: Math.round((file_size / (1024 * 1024)) * 10) / 10,
        },
        next_action: {
          kind: "autoflow",
          autoflow_function: "computo-ai-extract",
        },
        ai_meta: { model_used: "large-file-bypass", cost_eur: 0 },
      };
    } else try {
      const { data: routerRes, error: routerErr } = await supabaseAdmin.functions.invoke(
        "document-ai-router",
        {
          body: {
            storage_bucket,
            storage_path,
            file_name: resolvedFileName,
            file_size,
            mime_type: resolvedMimeType,
            hint,
            company_id: companyId,
          },
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
    const parserWarnings: ValidationWarning[] = [];
    if (routerOut.next_action?.kind === "autoflow" && routerOut.next_action.autoflow_function) {
      try {
        const invocation = await buildParserInvocation(supabaseAdmin, {
          parserName: routerOut.next_action.autoflow_function,
          docType,
          companyId,
          userId,
          analysisId,
          storageBucket: storage_bucket,
          storagePath: storage_path,
          fileName: resolvedFileName,
          fileSize: file_size,
          mimeType: resolvedMimeType,
          hint,
        });

        if (!invocation) {
          parserUsed = "router_only";
          parserWarnings.push({
            code: "parser_requires_dedicated_flow",
            message: `Il parser ${routerOut.next_action.autoflow_function} richiede un flusso dedicato o un bucket specifico.`,
            severity: "info",
          });
        } else {
          const { data: parserRes, error: parserErr } = await supabaseAdmin.functions.invoke(
            invocation.functionName,
            {
              body: invocation.body,
              headers: { Authorization: req.headers.get("Authorization") ?? "" },
            },
          );
          if (parserErr) {
            console.warn("[ai-document-analyzer] parser fallito (graceful):", parserErr.message);
            parserWarnings.push({
              code: "parser_failed",
              message: `Parser ${invocation.functionName} fallito: ${parserErr.message}`,
              severity: "warn",
            });
          } else if (parserRes && typeof parserRes === "object") {
            structuredFields = normalizeParserResult(invocation.functionName, parserRes, invocation.metadata);
            parserUsed = invocation.functionName;
          }
        }
      } catch (e) {
        console.warn("[ai-document-analyzer] parser exception (graceful):", e instanceof Error ? e.message : e);
        parserWarnings.push({
          code: "parser_exception",
          message: `Parser exception: ${e instanceof Error ? e.message : String(e)}`,
          severity: "warn",
        });
      }
    }

    // ── 5) Validate ─────────────────────────────────────────────────────
    const validation = validateStructuredFields(docType, structuredFields);
    const warnings = [...parserWarnings, ...validation.warnings];
    const score = Math.max(0, validation.score - parserWarnings.filter((w) => w.severity === "warn").length * 0.1);
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
      const { data: linkerRes } = await supabaseAdmin.functions.invoke("document-ai-linker", {
        body: {
          doc_type: docType,
          extracted: structuredFields ?? {},
          company_id: companyId,
          file_info: {
            storage_bucket,
            storage_path,
            file_name: resolvedFileName,
          },
        },
        headers: { Authorization: req.headers.get("Authorization") ?? "" },
      });
      if (linkerRes && typeof linkerRes === "object") {
        await supabaseAdmin
          .from("document_analysis_results")
          .update({ related_entities: (linkerRes as { suggestions?: unknown[] }).suggestions ?? [] })
          .eq("id", analysisId);
      }
    } catch (e) {
      console.warn("[ai-document-analyzer] linker exception (graceful):", e instanceof Error ? e.message : e);
    }

    return jsonResponse({
      analysis_id: analysisId,
      cached: false,
      doc_type: docType,
      classification_confidence: classificationConfidence,
      reasoning: routerOut.reasoning ?? null,
      key_fields: keyFields,
      next_action: routerOut.next_action ?? null,
      parser_used: parserUsed,
      structured_fields: structuredFields,
      validation: { warnings, valid: !hasErrors, score },
      status: finalStatus,
      processing_time_ms: processingMs,
      cost_eur: costEur,
      file: {
        storage_bucket,
        storage_path,
        name: resolvedFileName,
        size: file_size ?? null,
        mime_type: resolvedMimeType,
      },
    }, 200, cors);
  } catch (err) {
    if (err instanceof Response) return err;
    return errorResponse(err instanceof Error ? err.message : String(err), 500, getCorsHeaders(req));
  }
});
