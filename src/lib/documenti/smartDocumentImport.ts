export const SMART_CLASSIFIER_MAX_SIZE = 18 * 1024 * 1024;
export const SMART_IMPORT_MAX_SIZE = 50 * 1024 * 1024;
export const SMART_LOW_CONFIDENCE_THRESHOLD = 0.7;

export const SMART_ACCEPTED_EXT = [
  ".pdf",
  ".jpg",
  ".jpeg",
  ".png",
  ".heic",
  ".webp",
  ".xlsx",
  ".xls",
  ".xpwe",
  ".dcf",
] as const;

export const SMART_DOC_TYPE_LABEL: Record<string, string> = {
  computo_metrico: "Computo metrico",
  ddt: "Documento di Trasporto (DDT)",
  fattura: "Fattura",
  ricevuta: "Ricevuta",
  contratto: "Contratto",
  preventivo: "Preventivo / offerta",
  listino_prezzi: "Listino prezzi",
  biglietto_visita: "Biglietto da visita",
  foto_cantiere: "Foto cantiere",
  foto_generale: "Foto generica",
  tabella_finanziamento: "Tabella finanziamento",
  documento_identita: "Documento d'identità",
  verbale_collaudo: "Verbale di collaudo",
  polizza_assicurativa: "Polizza assicurativa",
  documento_pa: "Documento PA",
  scheda_tecnica: "Scheda tecnica",
  documento_generico: "Documento generico",
  altro: "Altro / non riconosciuto",
};

export const SMART_DOC_TYPE_EMOJI: Record<string, string> = {
  computo_metrico: "📐",
  ddt: "🚚",
  fattura: "💰",
  ricevuta: "🧾",
  contratto: "📜",
  preventivo: "📝",
  listino_prezzi: "📊",
  biglietto_visita: "👤",
  foto_cantiere: "🏗️",
  foto_generale: "🖼️",
  tabella_finanziamento: "💳",
  documento_identita: "🪪",
  verbale_collaudo: "✅",
  polizza_assicurativa: "🛡️",
  documento_pa: "🏛️",
  scheda_tecnica: "📄",
  documento_generico: "📁",
  altro: "❓",
};

export const SMART_DOC_TYPE_OPTIONS = Object.entries(SMART_DOC_TYPE_LABEL).map(([value, label]) => ({
  value,
  label,
}));

export type SmartValidationWarning = {
  severity?: "info" | "warn" | "error" | string;
  message?: string;
};

export type SmartNextAction = {
  kind?: "autoflow" | "redirect" | "manual" | string;
  autoflow_function?: string;
  redirect_url?: string;
  hint?: string;
};

export type SmartImportActionPlan =
  | {
      kind: "computo_review";
      label: string;
      computoUploadId: string;
    }
  | {
      kind: "review_extracted";
      label: string;
    }
  | {
      kind: "redirect";
      label: string;
      url: string;
    }
  | {
      kind: "manual";
      label: string;
      hint?: string;
    };

export type SmartImportFileKind = "pdf" | "image" | "spreadsheet" | "computo_data" | "other";

export type SmartDocumentInboxRow = {
  id: string;
  doc_type: string;
  parser_used?: string | null;
  status?: string | null;
  structured_fields?: Record<string, unknown> | null;
  validation_warnings?: SmartValidationWarning[] | null;
};

export type SmartDocumentInboxStatusTone = "success" | "warning" | "error" | "processing";

export type SmartDocumentInboxSummary = {
  total: number;
  ready: number;
  processing: number;
  reviewRequired: number;
  failed: number;
};

export type SmartDocumentReviewTone = "success" | "warning" | "error" | "neutral";

export type SmartDocumentReviewField = {
  path: string;
  label: string;
  value: string;
  confidence: number | null;
  tone: SmartDocumentReviewTone;
  source: string | null;
};

export type SmartDocumentReviewGroup = {
  path: string;
  label: string;
  count: number;
  sample: string | null;
};

export type SmartDocumentReviewModel = {
  fields: SmartDocumentReviewField[];
  groups: SmartDocumentReviewGroup[];
  warnings: SmartValidationWarning[];
  missingCritical: string[];
  lowConfidenceCount: number;
  sourceEvidenceCount: number;
  reviewScore: number;
};

const MODULE_REDIRECTS: Record<string, string> = {
  computo_metrico: "/azienda/marketing/preventivi?action=import-computo",
  preventivo: "/azienda/marketing/preventivi?action=import-computo",
  // Un contratto FIRMATO è una commessa, non un preventivo: la destinazione è
  // Nuova Commessa col dialog "Importa da contratto" già aperto (estrattore
  // dedicato contratto_commessa: voci, rate, cliente). Prima "contratto" non
  // aveva modulo e il piano finiva in "manual" — vicolo cieco.
  contratto: "/azienda/ordini/nuovo?action=import-contratto",
  fattura: "/azienda/amministrazione/fatture?action=import",
  ricevuta: "/azienda/amministrazione/ricevute?action=import",
  listino_prezzi: "/azienda/operativo/listino?action=import",
  tabella_finanziamento: "/azienda/operativo/finanziamenti?action=import",
  biglietto_visita: "/azienda/marketing/contatti?action=import-card",
};

function readComputoUploadId(fields: Record<string, unknown> | null | undefined): string | null {
  if (!fields) return null;
  const meta = fields._parser_meta;
  if (!meta || typeof meta !== "object") return null;
  const id = (meta as { computo_upload_id?: unknown }).computo_upload_id;
  return typeof id === "string" && id.trim() ? id : null;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isReviewInternalKey(key: string): boolean {
  return key.startsWith("_") || ["raw_text", "full_text", "ocr_text", "document_text"].includes(key);
}

function prettifyFieldLabel(path: string): string {
  const last = path.split(".").pop() ?? path;
  return last
    .replace(/_eur$/i, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function stringifyReviewValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  const raw = typeof value === "string" ? value : String(value);
  const normalized = raw.replace(/\s+/g, " ").trim();
  if (normalized.length <= 160) return normalized;
  return `${normalized.slice(0, 157).trimEnd()}...`;
}

function getConfidenceMap(fields: Record<string, unknown> | null | undefined): Record<string, unknown> {
  if (!fields) return {};
  const candidates = [
    fields._field_confidence,
    fields._confidence,
    fields.confidence_by_field,
    fields.field_confidence,
  ];
  return candidates.find(isPlainRecord) ?? {};
}

function getSourceMap(fields: Record<string, unknown> | null | undefined): Record<string, unknown> {
  if (!fields) return {};
  const candidates = [
    fields._source_refs,
    fields._source_references,
    fields._field_sources,
    fields.source_by_field,
  ];
  return candidates.find(isPlainRecord) ?? {};
}

function readFieldConfidence(confidenceMap: Record<string, unknown>, path: string): number | null {
  const value = confidenceMap[path];
  return typeof value === "number" ? value : null;
}

function formatSourceRef(ref: unknown): string | null {
  if (!ref) return null;
  if (typeof ref === "string") return stringifyReviewValue(ref);
  if (!isPlainRecord(ref)) return null;

  const parts: string[] = [];
  const page = ref.page ?? ref.pagina;
  const row = ref.row ?? ref.riga;
  const line = ref.line ?? ref.linea;
  const text = ref.text ?? ref.excerpt ?? ref.snippet;

  if (typeof page === "number" || typeof page === "string") parts.push(`Pag. ${page}`);
  if (typeof row === "number" || typeof row === "string") parts.push(`Riga ${row}`);
  else if (typeof line === "number" || typeof line === "string") parts.push(`Riga ${line}`);
  if (typeof text === "string" && text.trim()) parts.push(stringifyReviewValue(text));

  return parts.length > 0 ? parts.join(" · ") : null;
}

function getReviewTone(confidence: number | null, warning: SmartValidationWarning | undefined): SmartDocumentReviewTone {
  if (warning?.severity === "error") return "error";
  if (confidence !== null && confidence < SMART_LOW_CONFIDENCE_THRESHOLD) return "warning";
  if (warning?.severity === "warn") return "warning";
  if (confidence !== null) return "success";
  return "neutral";
}

function collectReviewFields(
  fields: Record<string, unknown> | null | undefined,
  warnings: SmartValidationWarning[],
): SmartDocumentReviewField[] {
  if (!fields) return [];

  const confidenceMap = getConfidenceMap(fields);
  const sourceMap = getSourceMap(fields);
  const collected: SmartDocumentReviewField[] = [];

  const visit = (record: Record<string, unknown>, prefix: string) => {
    Object.entries(record).forEach(([key, value]) => {
      if (isReviewInternalKey(key)) return;
      const path = prefix ? `${prefix}.${key}` : key;

      if (Array.isArray(value)) return;
      if (isPlainRecord(value)) {
        visit(value, path);
        return;
      }

      const renderedValue = stringifyReviewValue(value);
      if (!renderedValue) return;

      const confidence = readFieldConfidence(confidenceMap, path);
      const fieldWarning = warnings.find((warning) => warning.message?.toLowerCase().includes(path.toLowerCase()));
      collected.push({
        path,
        label: prettifyFieldLabel(path),
        value: renderedValue,
        confidence,
        tone: getReviewTone(confidence, fieldWarning),
        source: formatSourceRef(sourceMap[path]),
      });
    });
  };

  visit(fields, "");
  return collected;
}

function sampleArrayGroupItem(value: unknown[]): string | null {
  const first = value[0];
  if (typeof first === "string") return stringifyReviewValue(first);
  if (!isPlainRecord(first)) return null;
  const sample =
    first.descrizione ??
    first.description ??
    first.nome ??
    first.name ??
    first.titolo ??
    first.title ??
    null;
  return typeof sample === "string" ? stringifyReviewValue(sample) : null;
}

function collectReviewGroups(fields: Record<string, unknown> | null | undefined): SmartDocumentReviewGroup[] {
  if (!fields) return [];

  return Object.entries(fields)
    .filter(([key, value]) => !isReviewInternalKey(key) && Array.isArray(value))
    .map(([key, value]) => ({
      path: key,
      label: prettifyFieldLabel(key),
      count: (value as unknown[]).length,
      sample: sampleArrayGroupItem(value as unknown[]),
    }))
    .filter((group) => group.count > 0);
}

function hasAnyPath(paths: string[], checks: Array<string | RegExp>): boolean {
  return checks.some((check) =>
    paths.some((path) => typeof check === "string" ? path === check || path.startsWith(`${check}.`) : check.test(path)),
  );
}

function getMissingCriticalFields(docType: string, fields: SmartDocumentReviewField[], groups: SmartDocumentReviewGroup[]): string[] {
  const paths = fields.map((field) => field.path);
  const groupPaths = groups.map((group) => group.path);
  const availablePaths = [...paths, ...groupPaths];

  if (docType === "computo_metrico" || docType === "preventivo") {
    return [
      { label: "Voci/righe", checks: ["righe", "voci", "items", "linee"] },
      { label: "Totale/importo", checks: [/totale/i, /importo/i, /subtotal/i] },
    ]
      .filter((rule) => !hasAnyPath(availablePaths, rule.checks))
      .map((rule) => rule.label);
  }

  if (docType === "fattura" || docType === "ricevuta") {
    return [
      { label: "Fornitore", checks: ["fornitore", "mittente", "supplier"] },
      { label: "Numero documento", checks: [/numero/i, /number/i] },
      { label: "Data documento", checks: [/data/i, /date/i] },
      { label: "Totale/importo", checks: [/totale/i, /importo/i, /amount/i] },
    ]
      .filter((rule) => !hasAnyPath(availablePaths, rule.checks))
      .map((rule) => rule.label);
  }

  if (docType === "listino_prezzi") {
    return hasAnyPath(availablePaths, ["articoli", "prodotti", "righe", "items"]) ? [] : ["Articoli/prodotti"];
  }

  if (docType === "tabella_finanziamento") {
    return [
      { label: "Importo finanziato", checks: [/importo/i, /amount/i] },
      { label: "Rate/durata", checks: [/rata/i, /rate/i, /durata/i, /mesi/i] },
    ]
      .filter((rule) => !hasAnyPath(availablePaths, rule.checks))
      .map((rule) => rule.label);
  }

  return [];
}

export function requiresDocTypeConfirmation(confidence: number | null | undefined): boolean {
  return typeof confidence !== "number" || confidence < SMART_LOW_CONFIDENCE_THRESHOLD;
}

export function getSmartImportRiskLevel(
  confidence: number | null | undefined,
  warnings: SmartValidationWarning[] | null | undefined,
): "ok" | "warn" | "error" {
  if (warnings?.some((warning) => warning.severity === "error")) return "error";
  if (requiresDocTypeConfirmation(confidence) || warnings?.some((warning) => warning.severity === "warn")) {
    return "warn";
  }
  return "ok";
}

export function getSmartImportFileKind(fileName: string, mimeType?: string | null): SmartImportFileKind {
  const lower = fileName.toLowerCase();
  const mime = (mimeType ?? "").toLowerCase();
  if (mime.startsWith("image/") || /\.(jpe?g|png|webp|heic)$/i.test(lower)) return "image";
  if (mime === "application/pdf" || lower.endsWith(".pdf")) return "pdf";
  if (/\.(xlsx|xls)$/i.test(lower)) return "spreadsheet";
  if (/\.(xpwe|dcf)$/i.test(lower)) return "computo_data";
  return "other";
}

export function buildSmartImportRedirectPath(
  url: string,
  params: { analysisId?: string | null; docType?: string | null },
): string {
  const parsed = new URL(url, "http://localhost");
  if (params.analysisId) parsed.searchParams.set("analysis_id", params.analysisId);
  if (params.docType) parsed.searchParams.set("doc_type", params.docType);
  return `${parsed.pathname}${parsed.search}`;
}

export function buildSmartImportActionPlan(params: {
  docType: string;
  nextAction?: SmartNextAction | null;
  parserUsed?: string | null;
  structuredFields?: Record<string, unknown> | null;
}): SmartImportActionPlan {
  const { docType, nextAction, parserUsed, structuredFields } = params;
  const computoUploadId = readComputoUploadId(structuredFields);
  const isComputoLike = docType === "computo_metrico" || docType === "preventivo";

  if (isComputoLike && parserUsed === "computo-ai-extract" && computoUploadId) {
    return {
      kind: "computo_review",
      label: "Apri revisione computo",
      computoUploadId,
    };
  }

  if (isComputoLike) {
    return {
      kind: "redirect",
      label: "Apri import computo",
      url: MODULE_REDIRECTS.computo_metrico,
    };
  }

  if (nextAction?.kind === "autoflow" && parserUsed && parserUsed !== "router_only" && structuredFields) {
    return {
      kind: "review_extracted",
      label: "Vedi dati estratti",
    };
  }

  const redirectUrl = nextAction?.redirect_url ?? MODULE_REDIRECTS[docType];
  const redirectLabel = docType === "contratto" ? "Crea commessa dal contratto" : "Apri modulo dedicato";
  if (nextAction?.kind === "redirect" && redirectUrl) {
    return {
      kind: "redirect",
      label: docType === "contratto" ? redirectLabel : "Vai al modulo",
      url: redirectUrl,
    };
  }

  if (nextAction?.kind === "autoflow" && redirectUrl) {
    return {
      kind: "redirect",
      label: redirectLabel,
      url: redirectUrl,
    };
  }

  if (redirectUrl) {
    return {
      kind: "redirect",
      label: redirectLabel,
      url: redirectUrl,
    };
  }

  return {
    kind: "manual",
    label: "Ho capito",
    hint: nextAction?.hint,
  };
}

export function buildSmartDocumentInboxAction(row: SmartDocumentInboxRow): SmartImportActionPlan {
  const plan = buildSmartImportActionPlan({
    docType: row.doc_type,
    nextAction: null,
    parserUsed: row.parser_used,
    structuredFields: row.structured_fields,
  });

  if (plan.kind === "redirect") {
    return {
      ...plan,
      url: buildSmartImportRedirectPath(plan.url, {
        analysisId: row.id,
        docType: row.doc_type,
      }),
    };
  }

  return plan;
}

export function buildSmartDocumentReviewModel(row: SmartDocumentInboxRow): SmartDocumentReviewModel {
  const warnings = row.validation_warnings ?? [];
  const fields = collectReviewFields(row.structured_fields, warnings).slice(0, 12);
  const groups = collectReviewGroups(row.structured_fields);
  const lowConfidenceCount = fields.filter(
    (field) => field.confidence !== null && field.confidence < SMART_LOW_CONFIDENCE_THRESHOLD,
  ).length;
  const sourceEvidenceCount = fields.filter((field) => !!field.source).length;
  const missingCritical = getMissingCriticalFields(row.doc_type, fields, groups);
  const errorCount = warnings.filter((warning) => warning.severity === "error").length;
  const warnCount = warnings.filter((warning) => warning.severity === "warn").length;

  const penalty =
    errorCount * 25 +
    warnCount * 12 +
    lowConfidenceCount * 8 +
    missingCritical.length * 20 +
    (fields.length === 0 && groups.length === 0 ? 30 : 0);

  return {
    fields,
    groups,
    warnings,
    missingCritical,
    lowConfidenceCount,
    sourceEvidenceCount,
    reviewScore: Math.max(0, Math.min(100, 100 - penalty)),
  };
}

export function getSmartDocumentInboxStatusTone(row: SmartDocumentInboxRow): SmartDocumentInboxStatusTone {
  const status = (row.status ?? "").toLowerCase();

  if (row.validation_warnings?.some((warning) => warning.severity === "error")) return "error";
  if (status === "failed" || status === "error") return "error";
  if (status === "processing" || status === "pending" || status === "queued") return "processing";
  if (
    status === "review_required" ||
    status === "needs_review" ||
    row.validation_warnings?.some((warning) => warning.severity === "warn")
  ) {
    return "warning";
  }

  return "success";
}

export function summarizeSmartDocumentInbox(rows: SmartDocumentInboxRow[]): SmartDocumentInboxSummary {
  return rows.reduce<SmartDocumentInboxSummary>(
    (summary, row) => {
      const status = (row.status ?? "").toLowerCase();
      const tone = getSmartDocumentInboxStatusTone(row);

      summary.total += 1;
      if (tone === "processing") summary.processing += 1;
      else if (tone === "error") summary.failed += 1;
      else if (status === "review_required" || status === "needs_review" || tone === "warning") {
        summary.reviewRequired += 1;
      } else {
        summary.ready += 1;
      }

      return summary;
    },
    {
      total: 0,
      ready: 0,
      processing: 0,
      reviewRequired: 0,
      failed: 0,
    },
  );
}
