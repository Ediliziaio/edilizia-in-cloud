import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { costoMaterialiIvato } from "@/lib/orders/cassaMateriali";

describe("cassa della commessa: materiali IVA inclusa", () => {
  it("porta il prezzo d'acquisto a IVA inclusa con l'aliquota della riga", () => {
    expect(costoMaterialiIvato([
      { purchase_price: 100, quantity: 2, vat_rate: 22 },
      { purchase_price: 50, quantity: 1, vat_rate: 10 },
      { purchase_price: 10, quantity: 3, vat_rate: 0 },
    ])).toBeCloseTo(244 + 55 + 30, 6);
  });

  it("senza aliquota sulla riga usa il 22%", () => {
    expect(costoMaterialiIvato([{ purchase_price: 100, quantity: 1 }])).toBeCloseTo(122, 6);
  });

  it("la scheda commessa usa i materiali ivati e chiama la riga «Incassato»", () => {
    const src = readFileSync(resolve(process.cwd(), "src/pages/azienda/OrderDetail.tsx"), "utf8");
    expect(src).toContain("const costoMaterialiGross = costoMaterialiIvato(displayItems);");
    expect(src).not.toContain("Acconto incassato");
  });
});
