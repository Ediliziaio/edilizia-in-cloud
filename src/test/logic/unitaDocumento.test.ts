/**
 * Fattura, proforma, DDT e nota di credito dalla commessa: l'unità è quella
 * della riga. Prima era sempre «pz», e una riga da 12,5 m² sarebbe uscita
 * «12,5 pz», anche nella fattura elettronica.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { quantitaConUnita, totaleQuantita, unitaDocumento } from "@/lib/orders/unitaDocumento";
import { buildRigaFromItem, type RigaComposerItem } from "@/components/orders/RigheComposer";

const voce: RigaComposerItem = { id: "i1", name: "Intonaco", description: null, quantity: 12.5, unit_price: 34, vat_rate: 10, discount_percent: 0, position: 0 };

describe("unità sui documenti della commessa", () => {
  it("quella della riga; «pz» solo se manca", () => {
    expect(unitaDocumento("m²")).toBe("m²");
    expect(unitaDocumento("  kg ")).toBe("kg");
    expect(unitaDocumento("")).toBe("pz");
    expect(unitaDocumento(null)).toBe("pz");
    expect(unitaDocumento(undefined)).toBe("pz");
  });

  it("la riga di proforma, DDT e nota di credito porta 12,5 m² e il totale giusto", () => {
    const r = buildRigaFromItem({ ...voce, unita_misura: "m²" }, 10);
    expect(r).toMatchObject({ quantita: 12.5, unita_misura: "m²", prezzo_unitario: 34, imponibile: 425 });
    expect(buildRigaFromItem(voce, 10).unita_misura).toBe("pz");
  });

  it("i quattro documenti leggono l'unità della riga della commessa", () => {
    for (const f of ["CreaFatturaDialog", "CreaProformaDialog", "CreaDDTDialog", "CreaNotaCreditoDialog"]) {
      const src = readFileSync(`src/components/orders/${f}.tsx`, "utf8");
      expect(src, f).toContain('.select("id, name, description, quantity, unita_misura, unit_price, vat_rate, discount_percent, position")');
    }
    const fattura = readFileSync("src/components/orders/CreaFatturaDialog.tsx", "utf8");
    expect(fattura).toContain("unita_misura: unitaDocumento(item.unita_misura),");
  });

  it("anche la richiesta d'offerta al fornitore porta l'unità della riga, non «pz» fisso", () => {
    const src = readFileSync("src/components/orders/OrdinaPerFornitorePanel.tsx", "utf8");
    expect(src).toContain("unita_misura: unitaMateriale(i)");
    expect(src).not.toMatch(/unita_misura: "pz"/);
  });
});

describe("PDF della commessa: quantità con l'unità", () => {
  it("mostra l'unità accanto alla quantità, non per i pezzi", () => {
    expect(quantitaConUnita(12.5, "m²")).toBe("12,5 m²");
    expect(quantitaConUnita(3, "pz")).toBe("3");
    expect(quantitaConUnita(3, null)).toBe("3");
  });
  it("somma le quantità solo se l'unità è la stessa", () => {
    expect(totaleQuantita([{ quantity: 12.5, unita_misura: "m²" }, { quantity: 7.5, unita_misura: "m²" }])).toBe("20 m²");
    expect(totaleQuantita([{ quantity: 2, unita_misura: null }, { quantity: 3, unita_misura: "pz" }])).toBe("5");
    expect(totaleQuantita([{ quantity: 12.5, unita_misura: "m²" }, { quantity: 3, unita_misura: null }])).toBe("—");
  });
  it("il PDF usa le due funzioni", () => {
    const src = readFileSync("src/components/orders/OrdinePDF.tsx", "utf8");
    expect(src).toContain("quantitaConUnita(qty, item.unita_misura)");
    expect(src).toContain("totaleQuantita(items)");
  });
});
