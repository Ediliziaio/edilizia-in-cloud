import { describe, it, expect } from "vitest";
import {
  fiscalBucket,
  fiscalCents,
  fiscalNumber,
  fiscalPeriod,
  fiscalRows,
  fiscalTotals,
  fiscalHref,
  fiscalSection,
  updateFiscalParams,
  partitionFiscalMonths,
  fiscalAmountTotal,
  fiscalDocumentIssues,
  type FiscalDocument,
} from "@/lib/fatturazione/fiscalWorkspace";
const sale = (extra: Partial<FiscalDocument> = {}): FiscalDocument => ({
  id: "s",
  tipo: "fattura",
  numero: "A/1",
  data_emissione: "2026-10-01",
  imponibile_totale: 100,
  iva_totale: 22,
  totale_documento: 122,
  riepilogo_iva: [{ aliquota_iva: "22", imponibile: 100, imposta: 22 }],
  ...extra,
});
describe("fiscal data contract", () => {
  it("synchronizes month and quarter without losing section, search or delegated context", () => {
    let params = new URLSearchParams(
      "anno=2024&mese=10&trimestre=1&sezione=contabilita&q_iva=test&commercialistaMode=1",
    );
    params = updateFiscalParams(params, { mese: "2" });
    expect(fiscalPeriod(params)).toMatchObject({
      mese: 2,
      trimestre: 1,
      al: "2024-02-29",
    });
    params = updateFiscalParams(params, { periodo: "trimestrale" });
    expect(fiscalPeriod(params)).toMatchObject({
      dal: "2024-01-01",
      al: "2024-03-31",
    });
    params = updateFiscalParams(params, { trimestre: "4" });
    params = updateFiscalParams(params, { periodo: "mensile" });
    expect(fiscalPeriod(params)).toMatchObject({ mese: 10, trimestre: 4 });
    expect(params.get("sezione")).toBe("contabilita");
    expect(params.get("q_iva")).toBe("test");
    expect(params.get("commercialistaMode")).toBe("1");
  });
  it("preserves a month already inside the chosen quarter and ignores invalid period values", () => {
    const now = new Date("2026-10-26T12:00:00Z");
    const params = new URLSearchParams("anno=2026&mese=11&trimestre=4");
    expect(
      fiscalPeriod(updateFiscalParams(params, { trimestre: "4" }, now)).mese,
    ).toBe(11);
    expect(
      fiscalPeriod(updateFiscalParams(params, { mese: "99" }, now), now),
    ).toMatchObject({ mese: 10, trimestre: 4 });
    expect(params.get("mese")).toBe("11");
  });
  it("keeps unassigned annual F24 records out of every monthly and quarterly total", () => {
    const entries = [
      { mese: null },
      { mese: 0 },
      { mese: 13 },
      { mese: 10 },
      { mese: 11 },
      { mese: 2 },
    ];
    expect(
      partitionFiscalMonths(entries, {
        tipo: "mensile",
        mese: 10,
        trimestre: 4,
      }),
    ).toEqual({ selected: [{ mese: 10 }], unassigned: entries.slice(0, 3) });
    expect(
      partitionFiscalMonths(entries, {
        tipo: "trimestrale",
        mese: 10,
        trimestre: 4,
      }).selected,
    ).toEqual([{ mese: 10 }, { mese: 11 }]);
  });
  it("sums amounts in cents and does not turn incomplete amounts into zero", () => {
    expect(fiscalAmountTotal([0.1, 0.2, "12,50"])).toBe(12.8);
    expect(fiscalAmountTotal([])).toBe(0);
    expect(fiscalAmountTotal([22, null])).toBeNull();
    expect(fiscalAmountTotal([22, "invalid"])).toBeNull();
  });
  it("groups repeated checks by source and register, without deleting VAT rows or same-number documents", () => {
    const source = sale({
      riepilogo_iva: [
        { imponibile: 100, imposta: 22 },
        { imponibile: 50, imposta: 5 },
      ],
    });
    const rows = fiscalRows(
      [source, sale({ id: "another", riepilogo_iva: [] })],
      [],
    );
    const checks = fiscalDocumentIssues(rows);
    expect(rows).toHaveLength(3);
    expect(checks).toHaveLength(2);
    expect(
      checks[0].issues.filter((issue) => issue === "Aliquota non verificata"),
    ).toHaveLength(1);
    expect(fiscalTotals(rows).count).toBe(2);
  });
  it("reads historical aliquota_iva and does not invent zero", () => {
    expect(
      fiscalBucket({
        aliquota_iva: "22",
        imponibile: 5076.6,
        imposta: 1116.85,
      }),
    ).toMatchObject({ rate: "22", base: 507660, tax: 111685, issues: [] });
    expect(fiscalBucket({ imponibile: 100, imposta: 22 }).rate).toBeNull();
  });
  it("detects conflicting aliases and distinguishes verified zero", () => {
    expect(fiscalBucket({ aliquota: 10, aliquota_iva: 22 }).issues).toContain(
      "Aliquote sorgente in conflitto",
    );
    expect(
      fiscalBucket({ aliquota: 0, imponibile: 100, imposta: 0 }).rate,
    ).toBe("0");
  });
  it.each(["", null, undefined, "garbage", "1,2,3", Infinity])(
    "rejects unknown amount %s rather than zero",
    (v) => expect(fiscalNumber(v)).toBeNull(),
  );
  it("reads Italian amounts and signed cents", () => {
    expect(fiscalCents("1.250,50")).toBe(125050);
    expect(fiscalCents("-12,50")).toBe(-1250);
    expect(fiscalCents(0)).toBe(0);
    expect(fiscalCents(10.075)).toBe(1008);
    expect(fiscalCents(-10.075)).toBe(-1008);
  });
  it("does not rewrite original data while applying credit note signs", () => {
    const source = sale({ tipo: "nota_credito" }),
      copy = JSON.stringify(source);
    const rows = fiscalRows([source], []);
    expect(rows[0]).toMatchObject({ base: -10000, tax: -2200, rate: "22" });
    expect(JSON.stringify(source)).toBe(copy);
  });
  it("keeps missing totals unknown", () => {
    const rows = fiscalRows(
      [sale({ iva_totale: null, riepilogo_iva: [] })],
      [],
    );
    expect(fiscalTotals(rows).tax).toBeNull();
  });
  it("does not assume a reverse charge rate", () => {
    const rows = fiscalRows(
      [],
      [
        sale({
          tipo_documento: "TD01",
          data_fattura: "2026-10-01",
          riepilogo_iva: [
            { aliquota: 0, natura: "N6.3", imponibile: 100, imposta: 0 },
          ],
        }),
      ],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].issues.join(" ")).toContain("non confermata");
  });
  it("marks RC as provisional and excludes projections from documented totals", () => {
    const rows = fiscalRows(
      [],
      [
        sale({
          aliquota_reverse_charge: 10,
          data_fattura: "2026-10-01",
          data_ricezione_sdi: "2026-10-01T10:00:00Z",
          riepilogo_iva: [
            { aliquota: 0, natura: "N6.3", imponibile: 100, imposta: 0 },
          ],
        }),
      ],
    );
    expect(rows.filter((r) => r.synthetic)).toHaveLength(2);
    expect(fiscalDocumentIssues(rows)).toHaveLength(1);
    expect(fiscalDocumentIssues(rows)[0].side).toBe("acquisti");
    expect(fiscalTotals(rows.filter((r) => r.side === "vendite")).tax).toBe(0);
    expect(
      fiscalTotals(rows.filter((r) => r.side === "acquisti")),
    ).toMatchObject({ base: 10000, tax: 0, count: 1 });
  });
  it("preserves split payment and flags cash accounting rather than certifying it", () => {
    expect(
      fiscalRows([sale({ esigibilita_iva: "S" })], [])[0].exigibility,
    ).toBe("S");
    expect(
      fiscalRows([sale({ esigibilita_iva: "D" })], [])[0].issues.join(" "),
    ).toContain("incasso");
  });
  it("flags missing SDI receipt, retaining period source", () => {
    const r = fiscalRows(
      [],
      [sale({ data_fattura: "2026-09-30", data_detrazione: "2026-10-10" })],
    )[0];
    expect(r.periodDate).toBe("2026-10-10");
    expect(r.issues.join(" ")).toContain("Ricezione");
  });
});
describe("fiscal navigation", () => {
  it("shares validated periods including leap day", () => {
    expect(fiscalPeriod(new URLSearchParams("anno=2024&mese=2"))).toMatchObject(
      { dal: "2024-02-01", al: "2024-02-29" },
    );
    expect(
      fiscalPeriod(
        new URLSearchParams("anno=2026&periodo=trimestrale&trimestre=4"),
      ),
    ).toMatchObject({ dal: "2026-10-01", al: "2026-12-31" });
  });
  it("rejects invalid URL values and preserves delegated context on legacy links", () => {
    expect(
      fiscalPeriod(
        new URLSearchParams("anno=foo&mese=13"),
        new Date("2026-10-26T12:00:00Z"),
      ),
    ).toMatchObject({ anno: 2026, mese: 10 });
    const href = fiscalHref("archivio", "?commercialistaMode=1&anno=2025");
    expect(href).toContain("commercialistaMode=1");
    expect(href).toContain("anno=2025");
    expect(fiscalSection(new URLSearchParams("sezione=wrong"))).toBe("iva");
  });
});
