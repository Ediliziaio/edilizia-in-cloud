/**
 * Finanziamento del preventivo (controllo del 06/10/2026).
 *
 *  - rata «da X €/mese» dei moduli (calcolaRataMensile): rata × N rispetto al totale,
 *    con TAN 0 e con TAN > 0. L'atteso non è la formula: si fa ammortizzare il debito
 *    mese per mese e si controlla che con quella rata il saldo arrivi a zero.
 *  - finanziamento del classico (calcolaFinanziamento, su tabella della finanziaria):
 *    riga esatta, interpolazione lineare fra due importi, errori dichiarati.
 */
import { describe, expect, it } from "vitest";
import { calcolaRataMensile, parseFinanziamentoPromo } from "@/lib/preventivi/finanziamentoLite";
import { calcolaFinanziamento } from "@/lib/finanziamenti/calcolaFinanziamento";
import type { RigaTabellaFinanziamento } from "@/lib/finanziamenti/types";

/** Il saldo dopo `n` rate di importo `rata` a tasso mensile `i`: si ammortizza davvero, mese per mese. */
function saldoDopo(capitale: number, rata: number, n: number, tanPct: number): number {
  const i = tanPct / 100 / 12;
  let saldo = capitale;
  for (let m = 0; m < n; m++) saldo = saldo * (1 + i) - rata;
  return saldo;
}

describe("calcolaRataMensile (rata dei moduli)", () => {
  it("TAN 0: il totale diviso le rate, e rata × N torna il totale", () => {
    expect(calcolaRataMensile(12000, 24, 0)).toBe(500);
    expect(calcolaRataMensile(1000, 12, 0) * 12).toBeCloseTo(1000, 9);
    expect(calcolaRataMensile(99.99, 3, 0) * 3).toBeCloseTo(99.99, 9);
  });

  it.each([
    [12000, 24, 5], [8500.5, 60, 7.9], [30000, 120, 4.75], [450, 12, 12], [1, 1, 10],
  ])("TAN > 0: %i € in %i rate al %f%% — con quella rata il debito arriva a zero", (totale, rate, tan) => {
    const rata = calcolaRataMensile(totale, rate, tan);
    expect(rata).toBeGreaterThan(totale / rate);
    expect(Math.abs(saldoDopo(totale, rata, rate, tan))).toBeLessThan(1e-6);
    // Gli interessi sono davvero interessi: rata × N supera il capitale.
    expect(rata * rate).toBeGreaterThan(totale);
  });

  it("un esempio a mano: 10.000 € in 12 rate al 6% (0,5% al mese) = 860,66 €", () => {
    // rata = 10000 × 0,005 / (1 − 1,005^−12) = 860,664…
    expect(calcolaRataMensile(10000, 12, 6)).toBeCloseTo(860.664, 3);
  });

  it("valori sporchi: totale zero o negativo → 0; rate zero o rotte → 1 rata; TAN negativo → come 0", () => {
    expect(calcolaRataMensile(0, 24, 5)).toBe(0);
    expect(calcolaRataMensile(-500, 24, 5)).toBe(0);
    expect(calcolaRataMensile(Number.NaN, 24, 5)).toBe(0);
    expect(calcolaRataMensile(1200, 0, 0)).toBe(1200);
    expect(calcolaRataMensile(1200, Number.NaN, 0)).toBe(1200);
    expect(calcolaRataMensile(1200, 12, -3)).toBe(100);
    expect(calcolaRataMensile(1200, 11.6, 0)).toBeCloseTo(100, 9); // 11,6 → 12 rate
  });

  it("la promo dal modello: serve «attivo», almeno una rata, TAN non negativo", () => {
    expect(parseFinanziamentoPromo({ attivo: true, rate: 24, tan_pct: 5.5 })).toEqual({ attivo: true, rate: 24, tan_pct: 5.5 });
    expect(parseFinanziamentoPromo({ attivo: false, rate: 24, tan_pct: 5 })).toBeNull();
    expect(parseFinanziamentoPromo({ attivo: true, rate: 0, tan_pct: 5 })).toBeNull();
    expect(parseFinanziamentoPromo({ attivo: true, rate: "boh", tan_pct: 5 })).toBeNull();
    expect(parseFinanziamentoPromo({ attivo: true, rate: 36.4, tan_pct: -2 })).toEqual({ attivo: true, rate: 36, tan_pct: 0 });
    expect(parseFinanziamentoPromo(null)).toBeNull();
  });
});

describe("calcolaFinanziamento (tabella della finanziaria)", () => {
  const riga = (importo: number, rate: number, rata: number, extra: Partial<RigaTabellaFinanziamento> = {}): RigaTabellaFinanziamento => ({
    id: `r${importo}-${rate}`, tabella_id: "t1", company_id: "c1", subtariffa: null, importo_erogato: importo, spese_istruttoria: 0,
    importo_totale_credito: importo, numero_rate: rate, durata_mesi: rate, prima_rata_giorni: 30, importo_rata: rata, spese_incasso_rata: 3,
    interessi_cliente: rata * rate - importo, importo_totale_dovuto: (rata + 3) * rate, tan: 8.75, taeg: 9.9, icc: null, provvigione_dealer: 0,
    created_at: "2026-10-01", ...extra,
  });
  const tabella = [riga(5000, 24, 230), riga(10000, 24, 450), riga(15000, 24, 670), riga(10000, 60, 207)];

  it("importo uguale a una riga: la riga, senza interpolare", () => {
    const r = calcolaFinanziamento({ importo: 10000, numero_rate: 24, righe: tabella });
    expect(r).toMatchObject({ modalita: "esatto", importo_rata: 450, spese_incasso_rata: 3, rata_completa: 453, importo_totale_dovuto: 10872 });
  });

  it("importo fra due righe: interpolazione lineare di ogni campo", () => {
    // 12.000 sta al 40% fra 10.000 (rata 450) e 15.000 (rata 670): 450 + 0,4 × 220 = 538.
    const r = calcolaFinanziamento({ importo: 12000, numero_rate: 24, righe: tabella });
    expect(r.modalita).toBe("interpolato");
    expect(r.importo_rata).toBe(538);
    expect(r.rata_completa).toBe(541);
    // Totale dovuto: (453 + 0,4 × 220) × 24 = 541 × 24 = 12.984.
    expect(r.importo_totale_dovuto).toBe(12984);
    expect(r.righe_interpolazione?.fattore).toBeCloseTo(0.4, 12);
  });

  it("la rata cresce con l'importo, dentro la tabella (nessun salto all'indietro)", () => {
    let prima = 0;
    for (let importo = 5000; importo <= 15000; importo += 250) {
      const r = calcolaFinanziamento({ importo, numero_rate: 24, righe: tabella });
      expect(r.modalita).not.toBe("errore");
      expect(r.rata_completa!).toBeGreaterThanOrEqual(prima);
      prima = r.rata_completa!;
    }
  });

  it("errori dichiarati: fuori range, durata assente, importo non valido, tabella vuota", () => {
    expect(calcolaFinanziamento({ importo: 20000, numero_rate: 24, righe: tabella })).toMatchObject({ modalita: "errore", errore: "importo_fuori_range", importo_min: 5000, importo_max: 15000 });
    expect(calcolaFinanziamento({ importo: 1000, numero_rate: 24, righe: tabella })).toMatchObject({ modalita: "errore", errore: "importo_fuori_range" });
    expect(calcolaFinanziamento({ importo: 10000, numero_rate: 36, righe: tabella })).toMatchObject({ modalita: "errore", errore: "durata_non_disponibile", durate_disponibili: [24, 60] });
    expect(calcolaFinanziamento({ importo: 0, numero_rate: 24, righe: tabella })).toMatchObject({ modalita: "errore", errore: "input_non_valido" });
    expect(calcolaFinanziamento({ importo: Number.NaN, numero_rate: 24, righe: tabella })).toMatchObject({ errore: "input_non_valido" });
    expect(calcolaFinanziamento({ importo: 10000, numero_rate: 0, righe: tabella })).toMatchObject({ errore: "input_non_valido" });
    expect(calcolaFinanziamento({ importo: 10000, numero_rate: 24, righe: [] })).toMatchObject({ errore: "tabella_vuota" });
  });

  it("agli estremi della tabella (importo minimo e massimo) si usa la riga, non un errore", () => {
    expect(calcolaFinanziamento({ importo: 5000, numero_rate: 24, righe: tabella }).modalita).toBe("esatto");
    expect(calcolaFinanziamento({ importo: 15000, numero_rate: 24, righe: tabella }).modalita).toBe("esatto");
  });
});
