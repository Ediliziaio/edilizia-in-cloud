import { describe, it, expect, vi } from "vitest";
import { computoNumber, computoSummaryRow, checkComputoExtraction, commitComputoExtraction } from "../../../supabase/functions/_shared/computoExtractionQuality";
const voice = (extra = {}) => ({ descrizione_breve: "Posa", quantita: 2, prezzo_unitario: 10, importo: 20, confidence: 0.9, warnings: [], ...extra });
const result = (rows = [voice()], total: unknown = 20) => ({ metadata: { totale_computo: total }, capitoli: [{ numero: 1, totale: total, voci: rows }] });

describe("computo source numbers", () => {
  it.each([["1.234,56 €",1234.56],["12.5",12.5],["0.123",0.123],["1,234",1.234],["-1,25",-1.25],["1 000,50",1000.5],[0,0],["0",0],[null,null],[undefined,null],["",null],["12abc",null],["1,2,3",null],[NaN,null],[Infinity,null]])("parses %s without manufacturing zero", (source, expected) => { expect(computoNumber(source)).toBe(expected); });
  it("requires an explicit locale for dot-separated thousands", () => {
    expect(computoNumber("1.234", "italian")).toBe(1234);
    expect(computoNumber("1.234")).toBe(1.234);
    expect(computoNumber("0.123", "italian")).toBe(.123);
  });
  it.each(["1.2.3,45", "1EUR2", "12,34,56", "1.23,45"])("rejects malformed numbers %s", source => {
    expect(computoNumber(source)).toBeNull();
  });
  it("accepts Italian decimals without an integer part", () => { expect(computoNumber(",56")).toBe(.56); });
});

describe("deterministic computo checks", () => {
  it.each(["TOTALE", "Totale generale", "Totale computo metrico", "Totale lavori:"])("identifies document totals (%s) instead of new work rows", label => {
    expect(computoSummaryRow(label, null, null)).toBe("document_total");
  });
  it.each(["Subtotale opere", "A riportare", "Riporto", "Sommano", "Totale capitolo 1"])("excludes summaries (%s) without manufacturing a global total", label => {
    expect(computoSummaryRow(label, 0, 0)).toBe("summary");
  });
  it("keeps real work and negative deductions even if their description mentions totals", () => {
    expect(computoSummaryRow("Totale posa", 2, 10)).toBeNull();
    expect(computoSummaryRow("Totale sconto", -1, 20)).toBeNull();
    expect(computoSummaryRow("Demolizione", null, null)).toBeNull();
  });
  it("reconciles valid totals without warnings", () => {
    expect(checkComputoExtraction(result())).toMatchObject({ errors: [], warnings: [], checks: { row_count: 1, computed_total: 20, requires_review: false } });
  });
  it("preserves the original amount even when quantity × price disagrees", () => {
    const source = result([voice({ importo: 25 })], 25);
    const checked = checkComputoExtraction(source);
    expect(source.capitoli[0].voci[0].importo).toBe(25);
    expect(source.capitoli[0].voci[0].warnings).toEqual(expect.arrayContaining([expect.stringContaining("quantità × prezzo") ]));
    expect(checked.checks?.requires_review).toBe(true);
    expect(source.capitoli[0].voci[0].confidence).toBeLessThan(.7);
  });
  it("separates unreadable/missing numbers from genuine zero", () => {
    const source = result([voice({ quantita: null, prezzo_unitario: "illeggibile", importo: null })]);
    expect(checkComputoExtraction(source).checks).toMatchObject({ missing_numeric_fields: 3, computed_total: null, total_comparable: false });
    expect(source.capitoli[0].voci[0].quantita).toBeNull();
    expect(checkComputoExtraction(result([voice({ quantita: 0, prezzo_unitario: 0, importo: 0 })], 0)).checks?.missing_numeric_fields).toBe(0);
  });
  it("keeps zero confidence and legitimate negative deductions", () => {
    const source = result([voice({ quantita: -2, importo: -20, confidence: 0 })], -20);
    expect(checkComputoExtraction(source).checks?.computed_total).toBe(-20);
    expect(source.capitoli[0].voci[0].confidence).toBe(0);
  });
  it("reconciles cents rather than floating point noise", () => {
    expect(checkComputoExtraction(result([voice({ quantita: 3, prezzo_unitario: .1, importo: .3 })], .3)).warnings).toEqual([]);
  });
  it("warns on chapter and document total mismatches", () => {
    expect(checkComputoExtraction(result([voice()], 30)).warnings).toEqual(expect.arrayContaining([expect.stringContaining("Capitolo"), expect.stringContaining("Totale documento")]));
  });
  it("does not hide an unreadable declared total", () => {
    expect(checkComputoExtraction(result([voice()], "???")).checks?.requires_review).toBe(true);
  });
  it.each([null, {}, { capitoli: [] }, { capitoli: [null] }, { capitoli: [{ voci: [null] }] }, result([voice({ descrizione_breve: " " })])])("rejects invalid extraction structures", source => {
    expect(checkComputoExtraction(source).errors.length).toBeGreaterThan(0);
  });
  it("blocks incomplete PDF coverage", () => {
    expect(checkComputoExtraction({ ...result(), document_coverage: { complete: false } }).errors).toEqual(expect.arrayContaining([expect.stringContaining("incompleta")]));
  });
});

describe("atomic extraction receipt", () => {
  const args = { uploadId: "upload", companyId: "company", rows: [{ descrizione_breve: "Posa" }], result: result(), method: "pdf_text", confidence: .9 };
  it("only accepts a complete, company-scoped RPC receipt", async () => {
    const rpc = vi.fn(async () => ({ data: { upload_id: "upload", saved_count: 1 }, error: null }));
    await expect(commitComputoExtraction({ rpc }, args)).resolves.toMatchObject({ saved_count: 1 });
    expect(rpc).toHaveBeenCalledExactlyOnceWith("computo_salva_estrazione_atomica", expect.objectContaining({ p_upload_id: "upload", p_company_id: "company", p_rows: args.rows }));
  });
  it.each([{ data: null, error: { message: "migration missing" } }, { data: { upload_id: "upload", saved_count: 0 }, error: null }, { data: { upload_id: "other", saved_count: 1 }, error: null }, { data: null, error: null }])("fails closed without delete/insert fallback", async receipt => {
    const rpc = vi.fn(async () => receipt);
    await expect(commitComputoExtraction({ rpc }, args)).rejects.toThrow(/non confermato/);
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});
