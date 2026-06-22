import { describe, it, expect } from "vitest";
import { calcRigaImporto, calcPrezzoVoce, calcTotaliComputo } from "./calcoli";

describe("climatizzazione/calcoli", () => {
  describe("calcRigaImporto", () => {
    it("moltiplica quantità × prezzo senza sconto", () => {
      expect(calcRigaImporto({ quantita: 3, prezzo_unitario: 100, sconto_pct: 0 })).toBe(300);
    });
    it("applica lo sconto percentuale di riga", () => {
      expect(calcRigaImporto({ quantita: 2, prezzo_unitario: 100, sconto_pct: 10 })).toBe(180);
    });
    it("clampa sconto >100 → importo 0 e valori negativi → 0", () => {
      expect(calcRigaImporto({ quantita: 5, prezzo_unitario: 50, sconto_pct: 150 })).toBe(0);
      expect(calcRigaImporto({ quantita: -3, prezzo_unitario: 50, sconto_pct: 0 })).toBe(0);
    });
    it("tratta input non numerici come 0", () => {
      expect(calcRigaImporto({ quantita: NaN as unknown as number, prezzo_unitario: 100, sconto_pct: 0 })).toBe(0);
    });
  });

  describe("calcPrezzoVoce", () => {
    it("somma materiali + manodopera applicando il ricarico", () => {
      expect(calcPrezzoVoce({ costo_materiali: 40, costo_manodopera: 60, ricarico_pct: 20 })).toBe(120);
    });
    it("ricarico 0 = costo pieno", () => {
      expect(calcPrezzoVoce({ costo_materiali: 10, costo_manodopera: 5, ricarico_pct: 0 })).toBe(15);
    });
  });

  describe("calcTotaliComputo", () => {
    const righe = [
      { capitolo_nome: "Sanitari", quantita: 1, prezzo_unitario: 1000, sconto_pct: 0, costo_materiali: 400, costo_manodopera: 200 },
      { capitolo_nome: "Rivestimenti", quantita: 10, prezzo_unitario: 50, sconto_pct: 0, costo_materiali: 20, costo_manodopera: 15 },
    ];
    it("calcola imponibile, IVA (10% climatizzazione) e totale", () => {
      const t = calcTotaliComputo(righe, { sconto_pct: 0, iva_pct: 10 });
      expect(t.imponibile).toBe(1500); // 1000 + 10×50
      expect(t.iva).toBeCloseTo(150);
      expect(t.totale).toBeCloseTo(1650);
    });
    it("applica lo sconto globale PRIMA dell'IVA", () => {
      const t = calcTotaliComputo(righe, { sconto_pct: 10, iva_pct: 10 });
      expect(t.imponibile).toBeCloseTo(1350); // 1500 × 0.9
      expect(t.totale).toBeCloseTo(1485); // 1350 × 1.10
    });
    it("calcola il margine (imponibile − costi)", () => {
      const t = calcTotaliComputo(righe, { sconto_pct: 0, iva_pct: 10 });
      expect(t.costoTot).toBe(950); // (400+200)×1 + (20+15)×10
      expect(t.margineEur).toBe(550); // 1500 − 950
      expect(t.marginePct).toBeCloseTo((550 / 1500) * 100);
    });
    it("raggruppa gli importi per capitolo", () => {
      const t = calcTotaliComputo(righe, { sconto_pct: 0, iva_pct: 10 });
      expect(t.perCapitolo).toHaveLength(2);
      expect(t.perCapitolo.find((c) => c.nome === "Sanitari")?.imponibile).toBe(1000);
    });
  });

});
