import { expect, it } from "vitest";
import {
  fiscalDate,
  fiscalDue,
  fiscalMatch,
  fiscalReadable,
  fiscalToday,
  fiscalVatGroups,
} from "@/lib/fatturazione/fiscalInsights";
import { fiscalRows } from "@/lib/fatturazione/fiscalWorkspace";
it("formats calendar dates without DST shifts and rejects impossible dates", () => {
  expect(fiscalDate("2024-02-29")).toBe("29/02/2024");
  expect(fiscalDate("2026-02-29")).toBe("Da verificare");
  expect(fiscalDate("2026-13-02")).toBe("Da verificare");
  expect(fiscalDate(null, "Non indicata")).toBe("Non indicata");
  expect(fiscalDate("2026-10-26T23:30:00Z")).toBe("27/10/2026");
  expect(fiscalToday(new Date("2026-10-26T23:30:00Z"))).toBe("2026-10-27");
});
it("distinguishes overdue, today, the inclusive thirty-day boundary and missing dates", () => {
  expect(fiscalDue("2026-10-26", "2026-10-27")).toBe("scaduta");
  expect(fiscalDue("2026-10-27", "2026-10-27")).toBe("prossima");
  expect(fiscalDue("2026-11-26", "2026-10-27")).toBe("prossima");
  expect(fiscalDue("2026-11-27", "2026-10-27")).toBe("futura");
  expect(fiscalDue("2026-02-31", "2026-10-27")).toBe("mancante");
  expect(fiscalDue(null, "2026-10-27")).toBe("mancante");
});
it("matches accents and whitespace without stringifying missing values", () => {
  expect(fiscalMatch("  attivita ", "Attività", null)).toBe(true);
  expect(fiscalMatch("undefined", undefined)).toBe(false);
});
it("groups actual VAT rows, preserving signs, unknown values and multi-rate document counts", () => {
  const rows = fiscalRows(
    [
      {
        id: "doc",
        tipo: "nota_credito",
        imponibile_totale: 150,
        iva_totale: 27,
        totale_documento: 177,
        riepilogo_iva: [
          { aliquota: 22, imponibile: 100, imposta: 22 },
          { aliquota: 10, imponibile: 50, imposta: 5 },
        ],
      },
    ],
    [],
  );
  const before = JSON.stringify(rows);
  const groups = fiscalVatGroups([
    ...rows,
    { ...rows[0], id: "projection", synthetic: true, tax: 99999 },
  ]);
  expect(groups).toHaveLength(2);
  expect(groups.map((group) => group.tax)).toEqual([-2200, -500]);
  expect(groups.every((group) => group.count === 1)).toBe(true);
  expect(fiscalVatGroups([{ ...rows[0], tax: null }])[0].tax).toBeNull();
  expect(JSON.stringify(rows)).toBe(before);
});
it("renders server facts as named values rather than raw JSON or invented zeroes", () => {
  expect(fiscalReadable({ imposta: 1116.85, aliquota: 22 })[0].value).toMatch(
    /1.116,85/,
  );
  expect(fiscalReadable({ imposta: 1116.85, aliquota: 22 })[1].value).toBe(
    "22%",
  );
  expect(
    fiscalReadable({
      vendite: 2,
      acquisti: null,
      dettaglio_nuovo: [{ motivo: "Data da controllare" }],
    }),
  ).toEqual([
    { label: "Documenti di vendita", value: "2" },
    { label: "Documenti di acquisto", value: "Non disponibile" },
    {
      label: "dettaglio nuovo · Voce 1 · motivo",
      value: "Data da controllare",
    },
  ]);
});
