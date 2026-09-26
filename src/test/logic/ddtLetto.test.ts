import { describe, expect, it } from "vitest";
import {
  normalizzaDdtLetto,
  sembraDdtDallaDidascalia,
  testoDdtPerAssistente,
} from "../../../supabase/functions/_shared/ddtLetto";

describe("DDT letto dalla foto WhatsApp", () => {
  it("riconosce le parole del cantiere per un DDT", () => {
    expect(sembraDdtDallaDidascalia("ecco la bolla del cemento")).toBe(true);
    expect(sembraDdtDallaDidascalia("DDT Rossi")).toBe(true);
    expect(sembraDdtDallaDidascalia("foto del tetto finito")).toBe(false);
    expect(sembraDdtDallaDidascalia(null)).toBe(false);
  });

  it("ripulisce il JSON del lettore e scarta le righe senza descrizione", () => {
    const ddt = normalizzaDdtLetto({
      supplier_name: "Edilmix Srl",
      supplier_vat: null,
      ddt_number: "1234",
      ddt_date: "2026-09-24",
      items: [
        { description: "Cemento 32.5 sacchi", quantity: 40, unit: "pz", code: "CEM325" },
        { description: "Rete elettrosaldata", quantity: "12,5", unit: "mq", code: null },
        { description: "", quantity: 3 },
        "spazzatura",
      ],
      confidenza_estrazione: "Alta",
    });
    expect(ddt.fornitore).toBe("Edilmix Srl");
    expect(ddt.righe).toHaveLength(2);
    expect(ddt.righe[1].quantita).toBe(12.5);
    expect(ddt.affidabilita).toBe("alta");
  });

  it("legge i numeri col punto decimale e all'italiana", () => {
    const ddt = normalizzaDdtLetto({ items: [
      { description: "a", quantity: "1.5" },
      { description: "b", quantity: "1.234,5" },
      { description: "c", quantity: "non leggibile" },
    ] });
    expect(ddt.righe.map((r) => r.quantita)).toEqual([1.5, 1234.5, null]);
  });

  it("scrive per l'assistente fornitore, numero, righe e il testo dell'operaio", () => {
    const testo = testoDdtPerAssistente(
      normalizzaDdtLetto({
        supplier_name: "Edilmix Srl",
        ddt_number: "1234",
        items: [{ description: "Cemento", quantity: 40, unit: "pz", code: "CEM" }],
        confidenza_estrazione: "media",
      }),
      "cantiere Rossi",
    );
    expect(testo).toContain("Fornitore: Edilmix Srl");
    expect(testo).toContain("Numero DDT: 1234");
    expect(testo).toContain("Data: non leggibile");
    expect(testo).toContain("- Cemento × 40 pz (cod. CEM)");
    expect(testo).toContain("Testo dell'utente: cantiere Rossi");
  });

  it("senza fornitore né righe non è un DDT", () => {
    expect(testoDdtPerAssistente(normalizzaDdtLetto({ items: [] }), "")).toBeNull();
    expect(testoDdtPerAssistente(normalizzaDdtLetto(null), "")).toBeNull();
  });
});
