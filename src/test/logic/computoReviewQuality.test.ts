import { describe, expect, it } from "vitest";
import {
  buildComputoReviewSummary,
  canGenerateComputoQuote,
  filterComputoReviewRows,
  getComputoReviewIssues,
} from "@/lib/computo/reviewQuality";
import type { ComputoVoceLocal } from "@/types/computo";

function voce(overrides: Partial<ComputoVoceLocal> = {}): ComputoVoceLocal {
  const base: ComputoVoceLocal = {
    id: "v1",
    computo_upload_id: "c1",
    company_id: "co1",
    capitolo_numero: 1,
    capitolo_nome: "Opere edili",
    codice_voce: "1.1",
    codice_prezzario: "E.01",
    descrizione_breve: "Demolizione pavimento",
    descrizione_estesa: "Demolizione pavimento esistente",
    unita_misura: "mq",
    quantita: 10,
    prezzo_unitario_computo: 20,
    importo_computo: 200,
    prezzo_unitario_impresa: null,
    ricarico_percentuale: null,
    sconto_percentuale: 0,
    importo_impresa: null,
    confidence: 0.93,
    warnings: null,
    ai_notes: null,
    is_included: true,
    is_modified: false,
    ordine: 1,
    created_at: "2026-05-24T00:00:00Z",
    matched_template_id: null,
    matched_family_id: null,
    matched_tariffa_id: null,
    matched_name: null,
    match_type: null,
    match_confidence: null,
    _prezzoImpresa: 24,
    _ricarico: 20,
    _importoImpresa: 240,
    _isIncluded: true,
    _match_type: "none",
  };

  return { ...base, ...overrides };
}

describe("computo review quality", () => {
  it("blocks quote generation when included rows have invalid quantities", () => {
    const rows = [voce({ quantita: 0, _importoImpresa: 0 })];

    const issues = getComputoReviewIssues(rows);
    const summary = buildComputoReviewSummary(rows);

    expect(issues.some((issue) => issue.code === "zero_quantity")).toBe(true);
    expect(summary.blockingCount).toBe(1);
    expect(canGenerateComputoQuote(rows)).toBe(false);
  });

  it("surfaces commercial warnings without blocking clean rows", () => {
    const rows = [
      voce({ id: "v1", confidence: 0.62, _match_type: "none", _prezzoImpresa: 0, _importoImpresa: 0 }),
      voce({
        id: "v2",
        _match_type: "manual",
        _matched_template_id: "article-1",
        _matched_name: "Demolizione pavimento listino",
      }),
    ];

    const summary = buildComputoReviewSummary(rows);

    expect(summary.lowConfidenceCount).toBe(1);
    expect(summary.unmatchedCount).toBe(1);
    expect(summary.zeroPriceCount).toBe(1);
    expect(summary.matchRatePct).toBe(50);
    expect(canGenerateComputoQuote(rows)).toBe(true);
  });

  it("counts tariff and labor matches as catalog matches", () => {
    const rows = [
      voce({
        id: "v1",
        descrizione_breve: "Posa pavimento",
        _match_type: "manual",
        _matched_tariffa_id: "tariffa-posa",
        _matched_name: "Posa pavimento al mq",
      }),
      voce({
        id: "v2",
        descrizione_breve: "Manodopera operaio specializzato",
        matched_tariffa_id: "tariffa-manodopera",
        matched_name: "Manodopera specializzata",
        match_type: "vector",
      }),
    ];

    const summary = buildComputoReviewSummary(rows);
    const issues = getComputoReviewIssues(rows);

    expect(summary.matchRatePct).toBe(100);
    expect(issues.some((issue) => issue.code === "unmatched_catalog")).toBe(false);
  });

  it("detects duplicate extracted rows and supports review filters", () => {
    const rows = [
      voce({ id: "v1", descrizione_breve: "Posa battiscopa", quantita: 20, _prezzoImpresa: 12, _importoImpresa: 240 }),
      voce({ id: "v2", descrizione_breve: "posa battiscopa", quantita: 20, _prezzoImpresa: 12, _importoImpresa: 240 }),
      voce({ id: "v3", descrizione_breve: "Tinteggiatura pareti", confidence: 0.55 }),
    ];

    const issues = getComputoReviewIssues(rows);
    const duplicates = filterComputoReviewRows(rows, "duplicates", issues);
    const lowConfidence = filterComputoReviewRows(rows, "low_confidence", issues);

    expect(issues.filter((issue) => issue.code === "possible_duplicate")).toHaveLength(2);
    expect(duplicates.map((row) => row.id)).toEqual(["v1", "v2"]);
    expect(lowConfidence.map((row) => row.id)).toEqual(["v3"]);
  });
});
