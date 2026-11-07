/**
 * La quantità scritta nella finestra di una riga della commessa.
 *
 * Fino al 07/11/2026 la finestra arrotondava all'intero (Math.round): un
 * materiale da 12,4 kg generato dal computo, aperto e risalvato da lì, diventava
 * 12 senza avvisare. order_items.quantity ha i decimali dalla migrazione
 * 20281222140000: la finestra li tiene.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { quantitaDaCampo } from "@/lib/orders/quantitaDaCampo";

describe("quantità di una riga della commessa", () => {
  it("12,4 e 12.4 restano 12,4: niente arrotondamento all'intero", () => {
    expect(quantitaDaCampo("12,4")).toBe(12.4);
    expect(quantitaDaCampo("12.4")).toBe(12.4);
    expect(quantitaDaCampo("0,3")).toBe(0.3);
    expect(quantitaDaCampo("3")).toBe(3);
  });

  it("quattro decimali, come il database", () => {
    expect(quantitaDaCampo("1,23456")).toBe(1.2346);
  });

  it("vuoto o illeggibile vale 0, e la finestra lo rifiuta come quantità non valida", () => {
    expect(quantitaDaCampo("")).toBe(0);
    expect(quantitaDaCampo("boh")).toBe(0);
  });

  it("nessun arrotondamento all'intero è rimasto nella finestra", () => {
    const src = readFileSync("src/components/orders/OrderItemsList.tsx", "utf8");
    expect(src).not.toMatch(/Math\.round\(Number\(itemQuantity\)\)/);
    expect(src).not.toMatch(/parseInt\(itemQuantity\)/);
  });
});
