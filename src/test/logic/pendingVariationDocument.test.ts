import { describe, expect, it } from "vitest";
import { pendingVariationDocument, variationEventDate } from "@/lib/orders/pendingVariationDocument";

const row = { order_id: "order", company_id: "company", status: "in_attesa", numero_odv: 4,
  titolo: "Extra", descrizione: "Opere extra", impatto_economico: -50, impatto_giorni: 2,
  note_interne: "PRIVATE", firma_token: "TOKEN", firma_cliente: "SIGNATURE" };
describe("Proposta di una variante registrata", () => {
  it("esporta solo termini pubblici e mantiene le riduzioni", () => {
    const result = pendingVariationDocument(row, "order", "company");
    expect(result).toMatchObject({ impatto_economico: -50, impatto_giorni: 2 });
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE|TOKEN|SIGNATURE/);
  });
  it.each(["approvato", "rifiutato", "annullato", "unknown"])("non ristampa %s come proposta da approvare", status => {
    expect(() => pendingVariationDocument({ ...row, status }, "order", "company")).toThrow("non è più in attesa");
  });
  it.each([["wrong", "company"], ["order", "wrong"], ["", "company"]])("verifica ambito %s/%s", (order, company) => {
    expect(() => pendingVariationDocument(row, order, company)).toThrow("non appartiene");
  });
  it.each([{ numero_odv: 0 }, { titolo: " " }, { impatto_economico: NaN }, { impatto_giorni: -1 }, { impatto_giorni: 1.5 }])("blocca dati incompleti %j", patch => {
    expect(() => pendingVariationDocument({ ...row, ...patch }, "order", "company")).toThrow("incompleti");
  });
  it("le date errate non bloccano la commessa né diventano date inventate", () => {
    for (const date of [null, "", "bad", "2026-02-30", "2026-02-30T10:00:00Z"]) expect(variationEventDate(date)).toBeNull();
    expect(variationEventDate("2026-10-13T23:30:00Z")).toBe("14/10/2026");
  });
});
