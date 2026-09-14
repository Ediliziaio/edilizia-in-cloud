import { describe, expect, it } from "vitest";
import {
  misuraDaTesto,
  quantitaDaTesto,
  totaliCambiati,
  totaliDelPreventivo,
} from "@/lib/serramenti/righePreventivo";
import type { SrAccessorioRow, SrSerramentoRow } from "@/types/serramenti";

const serramento = (extra: Partial<SrSerramentoRow>) =>
  ({ quantita: 1, prezzo_unitario: 0, prezzo_totale: null, larghezza_mm: null, altezza_mm: null, metri_quadri: null, ...extra }) as SrSerramentoRow;
const accessorio = (extra: Partial<SrAccessorioRow>) =>
  ({ quantita: 1, prezzo_unitario: 0, prezzo_totale: null, ...extra }) as SrAccessorioRow;

describe("totali sulla riga del preventivo serramenti", () => {
  const detail = {
    serramenti: [
      serramento({ larghezza_mm: 1000, altezza_mm: 1450, quantita: 2, prezzo_unitario: 957, prezzo_totale: 1914 }),
      serramento({ larghezza_mm: 800, altezza_mm: 1000, quantita: 1, prezzo_unitario: 528, prezzo_totale: 528 }),
    ],
    accessori: [accessorio({ quantita: 3, prezzo_unitario: 50, prezzo_totale: 150 })],
  };

  it("totale IVA inclusa, pezzi e metri quadri dalle posizioni", () => {
    expect(totaliDelPreventivo(detail, { iva_percentuale: 10 })).toEqual({
      // (1914 + 528 + 150) × 1,10
      totale_min: 2851.2,
      totale_max: 2851.2,
      totale_serramenti: 3,
      totale_accessori: 3,
      // 1,00 × 1,45 × 2 + 0,80 × 1,00
      metri_quadri_totali: 3.7,
    });
  });

  it("sconto fisso, poi percentuale, poi IVA: come il passo Economia", () => {
    // 2592 − 92 = 2500; −10% = 2250; +22% = 2745
    expect(totaliDelPreventivo(detail, { iva_percentuale: 22, sconto_importo: 92, sconto_percentuale: 10 }).totale_max).toBe(2745);
  });

  it("riscrive solo i totali diversi da quelli salvati", () => {
    const calcolati = totaliDelPreventivo(detail, { iva_percentuale: 10 });
    expect(
      totaliCambiati(
        { totale_min: 2851.4, totale_max: 2851.4, totale_serramenti: 0, totale_accessori: 3, metri_quadri_totali: null },
        calcolati,
      ),
    ).toEqual({ totale_serramenti: 3, metri_quadri_totali: 3.7 });
  });
});

describe("misure e pezzi scritti nei campi", () => {
  it("millimetri interi e positivi; vuoto toglie la misura", () => {
    expect(misuraDaTesto("1200")).toBe(1200);
    expect(misuraDaTesto("1200.6")).toBe(1201);
    expect(misuraDaTesto("")).toBeNull();
    expect(misuraDaTesto("-5")).toBeUndefined();
    expect(misuraDaTesto("0")).toBeUndefined();
  });

  it("pezzi interi da 1 in su", () => {
    expect(quantitaDaTesto("3")).toBe(3);
    expect(quantitaDaTesto("1.5")).toBeUndefined();
    expect(quantitaDaTesto("0")).toBeUndefined();
    expect(quantitaDaTesto("")).toBeUndefined();
  });
});
