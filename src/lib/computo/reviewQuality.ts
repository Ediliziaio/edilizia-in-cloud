import type { ComputoVoceLocal } from "@/types/computo";
import { isComputoProductMatch, isComputoTariffaMatch } from "./quoteItemMapping";

export type ComputoReviewFilter =
  | "all"
  | "blocking"
  | "warnings"
  | "low_confidence"
  | "unmatched"
  | "duplicates";

export type ComputoReviewIssueType = "blocking" | "warning";

export type ComputoReviewIssueCode =
  | "zero_quantity"
  | "zero_price"
  | "low_confidence"
  | "missing_unit"
  | "unmatched_catalog"
  | "possible_duplicate"
  | "amount_mismatch"
  | "ai_warning";

export interface ComputoReviewIssue {
  voceId: string;
  type: ComputoReviewIssueType;
  code: ComputoReviewIssueCode;
  message: string;
}

export interface ComputoReviewSummary {
  totalRows: number;
  includedRows: number;
  excludedRows: number;
  blockingCount: number;
  warningCount: number;
  lowConfidenceCount: number;
  unmatchedCount: number;
  duplicateCount: number;
  zeroPriceCount: number;
  zeroQuantityCount: number;
  totalComputo: number;
  totalImpresa: number;
  deltaImpresaVsComputo: number;
  averageConfidence: number;
  matchRatePct: number;
  hasBlockingIssues: boolean;
}

const LOW_CONFIDENCE_THRESHOLD = 0.7;

function normalizeSignature(value: string | null | undefined) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function duplicateSignature(voce: ComputoVoceLocal) {
  return [
    normalizeSignature(voce.descrizione_breve || voce.descrizione_estesa),
    normalizeSignature(voce.unita_misura),
    Number(voce.quantita || 0).toFixed(3),
    Number(voce._prezzoImpresa || 0).toFixed(2),
  ].join("|");
}

function isIncluded(voce: ComputoVoceLocal) {
  return voce._isIncluded !== false;
}

function isMatched(voce: ComputoVoceLocal) {
  return isComputoProductMatch(voce) || isComputoTariffaMatch(voce);
}

export function getComputoReviewIssues(voci: ComputoVoceLocal[]): ComputoReviewIssue[] {
  const issues: ComputoReviewIssue[] = [];
  const included = voci.filter(isIncluded);
  const duplicateMap = new Map<string, ComputoVoceLocal[]>();

  for (const voce of included) {
    const signature = duplicateSignature(voce);
    if (!duplicateMap.has(signature)) duplicateMap.set(signature, []);
    duplicateMap.get(signature)!.push(voce);
  }

  const duplicateIds = new Set(
    [...duplicateMap.values()]
      .filter((rows) => rows.length > 1)
      .flat()
      .map((row) => row.id),
  );

  for (const voce of included) {
    if ((voce.quantita ?? 0) <= 0) {
      issues.push({
        voceId: voce.id,
        type: "blocking",
        code: "zero_quantity",
        message: "Quantita mancante o pari a zero.",
      });
    }

    if ((voce._prezzoImpresa ?? 0) <= 0) {
      issues.push({
        voceId: voce.id,
        type: "warning",
        code: "zero_price",
        message: "Prezzo impresa pari a zero: verifica che non sia una riga descrittiva.",
      });
    }

    if ((voce.confidence ?? 1) < LOW_CONFIDENCE_THRESHOLD) {
      issues.push({
        voceId: voce.id,
        type: "warning",
        code: "low_confidence",
        message: "Bassa confidenza AI: confronta la riga con il documento originale.",
      });
    }

    if (!voce.unita_misura?.trim()) {
      issues.push({
        voceId: voce.id,
        type: "warning",
        code: "missing_unit",
        message: "Unita di misura assente.",
      });
    }

    if (!isMatched(voce)) {
      issues.push({
        voceId: voce.id,
        type: "warning",
        code: "unmatched_catalog",
        message: "Voce non abbinata al listino aziendale.",
      });
    }

    const expected = Number(voce.quantita || 0) * Number(voce._prezzoImpresa || 0);
    if (expected > 0 && Math.abs(expected - Number(voce._importoImpresa || 0)) > 0.5) {
      issues.push({
        voceId: voce.id,
        type: "warning",
        code: "amount_mismatch",
        message: "Importo impresa non coerente con quantita x prezzo.",
      });
    }

    if (duplicateIds.has(voce.id)) {
      issues.push({
        voceId: voce.id,
        type: "warning",
        code: "possible_duplicate",
        message: "Possibile voce duplicata nel computo.",
      });
    }

    for (const warning of voce.warnings ?? []) {
      issues.push({
        voceId: voce.id,
        type: "warning",
        code: "ai_warning",
        message: warning,
      });
    }
  }

  return issues;
}

export function buildComputoReviewSummary(voci: ComputoVoceLocal[]): ComputoReviewSummary {
  const included = voci.filter(isIncluded);
  const issues = getComputoReviewIssues(voci);
  const issueIdsByCode = (code: ComputoReviewIssueCode) => new Set(issues.filter((issue) => issue.code === code).map((issue) => issue.voceId)).size;
  const matchedRows = included.filter(isMatched).length;
  const totalComputo = included.reduce((sum, voce) => sum + Number(voce.importo_computo || 0), 0);
  const totalImpresa = included.reduce((sum, voce) => sum + Number(voce._importoImpresa || 0), 0);
  const averageConfidence = included.length
    ? included.reduce((sum, voce) => sum + Number(voce.confidence ?? 0), 0) / included.length
    : 0;
  const blockingCount = issues.filter((issue) => issue.type === "blocking").length;
  const warningCount = issues.filter((issue) => issue.type === "warning").length;

  return {
    totalRows: voci.length,
    includedRows: included.length,
    excludedRows: voci.length - included.length,
    blockingCount,
    warningCount,
    lowConfidenceCount: issueIdsByCode("low_confidence"),
    unmatchedCount: issueIdsByCode("unmatched_catalog"),
    duplicateCount: issueIdsByCode("possible_duplicate"),
    zeroPriceCount: issueIdsByCode("zero_price"),
    zeroQuantityCount: issueIdsByCode("zero_quantity"),
    totalComputo,
    totalImpresa,
    deltaImpresaVsComputo: totalImpresa - totalComputo,
    averageConfidence,
    matchRatePct: included.length ? Math.round((matchedRows / included.length) * 100) : 0,
    hasBlockingIssues: blockingCount > 0,
  };
}

export function filterComputoReviewRows(
  voci: ComputoVoceLocal[],
  filter: ComputoReviewFilter,
  issues = getComputoReviewIssues(voci),
) {
  if (filter === "all") return voci;

  const idsFor = (predicate: (issue: ComputoReviewIssue) => boolean) =>
    new Set(issues.filter(predicate).map((issue) => issue.voceId));

  if (filter === "blocking") {
    const ids = idsFor((issue) => issue.type === "blocking");
    return voci.filter((voce) => ids.has(voce.id));
  }

  if (filter === "warnings") {
    const ids = idsFor((issue) => issue.type === "warning");
    return voci.filter((voce) => ids.has(voce.id));
  }

  if (filter === "low_confidence") {
    const ids = idsFor((issue) => issue.code === "low_confidence");
    return voci.filter((voce) => ids.has(voce.id));
  }

  if (filter === "unmatched") {
    const ids = idsFor((issue) => issue.code === "unmatched_catalog");
    return voci.filter((voce) => ids.has(voce.id));
  }

  if (filter === "duplicates") {
    const ids = idsFor((issue) => issue.code === "possible_duplicate");
    return voci.filter((voce) => ids.has(voce.id));
  }

  return voci;
}

export function canGenerateComputoQuote(voci: ComputoVoceLocal[]) {
  const summary = buildComputoReviewSummary(voci);
  return summary.includedRows > 0 && !summary.hasBlockingIssues;
}
