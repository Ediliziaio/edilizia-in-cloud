/** Ristrutturazione: IVA al 10% con i beni significativi (DM 29/12/1999). */
import { describe, expect, it } from "vitest";
import { calcTotaliComputo, type ComputoRigaInput } from "@/lib/ristrutturazione/calcoli";

const riga = (importo: number, bene = false): ComputoRigaInput => ({
  capitolo_nome: "Opere", quantita: 1, prezzo_unitario: importo, sconto_pct: 0,
  costo_materiali: 0, costo_manodopera: 0, bene_significativo: bene,
});

describe("IVA con i beni significativi", () => {
  it("i beni oltre il resto dei lavori pagano il 22% sull'eccedenza", () => {
    // Infissi 8.000, resto dei lavori 5.000: 5.000 di infissi al 10%, 3.000 al 22%.
    const t = calcTotaliComputo([riga(8000, true), riga(5000)], { sconto_pct: 0, iva_pct: 10, iva_beni_significativi: true });
    expect(t.ivaRipartita).toEqual({ beniSignificativi: 8000, imponibile10: 10000, imponibile22: 3000, iva10: 1000, iva22: 660 });
    expect(t.iva).toBe(1660);
    expect(t.totale).toBe(14660);
    expect(t.imponibile).toBe(13000);
  });

  it("se i beni non superano il resto, tutto resta al 10%", () => {
    const t = calcTotaliComputo([riga(3000, true), riga(5000)], { sconto_pct: 0, iva_pct: 10, iva_beni_significativi: true });
    expect(t.ivaRipartita?.imponibile22).toBe(0);
    expect(t.iva).toBe(800);
  });

  it("lo sconto globale si spalma su beni e lavori prima della divisione", () => {
    const t = calcTotaliComputo([riga(8000, true), riga(5000)], { sconto_pct: 10, iva_pct: 10, iva_beni_significativi: true });
    // Netto 11.700: beni 7.200, resto 4.500 → 2.700 al 22%.
    expect(t.imponibile).toBe(11700);
    expect(t.ivaRipartita?.imponibile22).toBe(2700);
    expect(t.imponibile + t.iva).toBe(t.totale);
  });

  it("senza l'opzione, o con un'aliquota diversa dal 10%, un'aliquota sola come prima", () => {
    const righe = [riga(8000, true), riga(5000)];
    expect(calcTotaliComputo(righe, { sconto_pct: 0, iva_pct: 10 }).ivaRipartita).toBeUndefined();
    expect(calcTotaliComputo(righe, { sconto_pct: 0, iva_pct: 10 }).iva).toBe(1300);
    expect(calcTotaliComputo(righe, { sconto_pct: 0, iva_pct: 22, iva_beni_significativi: true }).ivaRipartita).toBeUndefined();
  });
});
