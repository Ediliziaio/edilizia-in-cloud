export interface ComputoDocumentReview {
  incomplete: boolean;
  pagesRead: number | null;
  pagesTotal: number | null;
  declaredTotal: number | null;
  computedTotal: number | null;
  requiresReview: boolean;
  warnings: string[];
}
const object = (v: unknown): Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
const number = (v: unknown) => typeof v === "number" && Number.isFinite(v) ? v : null;

export function getComputoDocumentReview(raw: unknown): ComputoDocumentReview {
  const source = object(raw), checks = object(source.document_checks), coverage = object(source.document_coverage);
  const warnings = Array.isArray(checks.warnings) ? checks.warnings.filter((v): v is string => typeof v === "string") : [];
  return {
    incomplete: coverage.complete === false,
    pagesRead: number(coverage.pages_inspected), pagesTotal: number(coverage.pages_total),
    declaredTotal: number(checks.source_declared_total), computedTotal: number(checks.computed_total),
    requiresReview: checks.requires_review === true || warnings.length > 0, warnings,
  };
}

export function canConfirmComputoDocument(review: ComputoDocumentReview, acknowledged: boolean) {
  return !review.incomplete && (!review.requiresReview || acknowledged);
}
