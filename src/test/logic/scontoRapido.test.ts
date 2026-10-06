/**
 * I conti dello sconto veloce (06/10/2026): lo sconto che porta il totale IVA inclusa a una cifra tonda, i tasti
 * 0 / 5 / 10 %, e come si legge un totale scritto a mano.
 */
import { describe, expect, it } from "vitest";
import { SCONTI_VELOCI, scontoDaPercentuale, scontoPerArrivareA, totaleDaTesto } from "@/lib/preventivi/scontoRapido";
import { calcTotaliComputo as calcBagni } from "@/lib/bagni/calcoli";
import { calcTotaliComputo as calcTetti } from "@/lib/tetti/calcoli";
import { calcTotaliComputo as calcClimatizzazione } from "@/lib/climatizzazione/calcoli";
import { calcTotaliComputo as calcElettrico } from "@/lib/elettrico/calcoli";
import { calcTotaliComputo as calcTermoidraulico } from "@/lib/termoidraulico/calcoli";
import { calcTotaliComputo as calcPavimenti } from "@/lib/pavimenti/calcoli";
import { calcTotaliComputo as calcPiscine } from "@/lib/piscine/calcoli";
import { calcTotaliComputo as calcRistrutturazione } from "@/lib/ristrutturazione/calcoli";

describe("scontoPerArrivareA", () => {
  it("20.000 € di imponibile con IVA al 10% fanno 22.000 €: per arrivare a 20.900 serve il 5%", () => {
    expect(scontoPerArrivareA(20_000, 10, 20_900)).toEqual({ esito: "ok", pct: 5, importo: 1_000 });
  });

  it("con IVA al 22% lo sconto non è tondo: la percentuale tiene otto decimali, l'importo è in centesimi", () => {
    // 10.000 × 1,22 = 12.200 → per 12.000: imponibile 9.836,0655… → sconto 163,9344… € = 1,63934426%
    expect(scontoPerArrivareA(10_000, 22, 12_000)).toEqual({ esito: "ok", pct: 1.63934426, importo: 163.93 });
  });

  it("due decimali non bastano: su 150.000 € di imponibile il totale si sposterebbe di una decina di euro", () => {
    // Con la percentuale al centesimo di punto «arriva a 160.000» finiva a 159.996,90 (visto dalla revisione).
    const r = scontoPerArrivareA(150_000, 22, 160_000);
    expect(r.esito).toBe("ok");
    if (r.esito !== "ok") return;
    expect(r.pct).not.toBe(Math.round(r.pct * 100) / 100);
    expect(Math.abs(calcBagni([RIGA(150_000)], { sconto_pct: r.pct, iva_pct: 22 }).totale - 160_000)).toBeLessThan(0.005);
  });

  it("se il totale senza sconto è già pari o sotto la cifra voluta, non serve nessuno sconto", () => {
    expect(scontoPerArrivareA(10_000, 10, 11_000)).toEqual({ esito: "gia-sotto", totaleSenzaSconto: 11_000 });
    expect(scontoPerArrivareA(10_000, 10, 12_000)).toEqual({ esito: "gia-sotto", totaleSenzaSconto: 11_000 });
  });

  it("senza imponibile, senza una cifra, o con numeri non validi, non c'è niente da calcolare", () => {
    for (const [lordo, iva, voluto] of [[0, 10, 100], [-5, 10, 100], [100, 10, 0], [100, 10, -3], [100, -1, 50], [NaN, 10, 50], [100, 10, Infinity]] as const) {
      expect(scontoPerArrivareA(lordo, iva, voluto), `${lordo}/${iva}/${voluto}`).toEqual({ esito: "non-valido" });
    }
  });
});

/** Una voce sola da `prezzo` € (IVA esclusa): basta a far lavorare lo sconto globale. */
const RIGA = (prezzo: number) => ({
  capitolo_nome: "Lavori", quantita: 1, prezzo_unitario: prezzo, sconto_pct: 0, costo_materiali: 0, costo_manodopera: 0,
});

/** Numeri casuali ma sempre gli stessi (generatore congruenziale): il test non deve cambiare da una corsa all'altra. */
const casuale = (seme: number) => () => {
  seme = (seme * 1_664_525 + 1_013_904_223) % 4_294_967_296;
  return seme / 4_294_967_296;
};

describe("applicato dal preventivo vero, il totale coincide con la cifra voluta al centesimo", () => {
  const MODULI = [
    ["bagni", calcBagni], ["tetti", calcTetti], ["climatizzazione", calcClimatizzazione], ["elettrico", calcElettrico],
    ["termoidraulico", calcTermoidraulico], ["pavimenti", calcPavimenti], ["piscine", calcPiscine], ["ristrutturazione", calcRistrutturazione],
  ] as const;

  it.each(MODULI)("%s: 300 casi (imponibile da 500 a 900.000 €, IVA 0/4/10/22, cifre tonde e con i centesimi)", (_nome, calc) => {
    const r = casuale(20_261_006);
    for (let i = 0; i < 300; i++) {
      const lordo = Math.round((500 + r() * 899_500) * 100) / 100;
      const iva = [0, 4, 10, 22][Math.floor(r() * 4)];
      const pieno = lordo * (1 + iva / 100);
      const voluto = i % 2 === 0 ? Math.round(pieno * (0.55 + r() * 0.44)) : Math.round(pieno * (0.55 + r() * 0.44) * 100) / 100;
      const esito = scontoPerArrivareA(lordo, iva, voluto);
      expect(esito.esito, `${lordo} + IVA ${iva}% → ${voluto}`).toBe("ok");
      if (esito.esito !== "ok") continue;
      const t = calc([RIGA(lordo)], { sconto_pct: esito.pct, iva_pct: iva });
      expect(Math.abs(t.totale - voluto), `${lordo} + IVA ${iva}% → ${voluto}: totale ${t.totale}`).toBeLessThan(0.005);
      // L'importo che il messaggio promette è quello che il preventivo toglie davvero.
      expect(Math.abs(lordo - t.imponibile - esito.importo), `importo ${esito.importo}`).toBeLessThanOrEqual(0.0051);
    }
  });

  it("l'esempio della revisione: 20.000 € + IVA 10%, voluto 18.000 → totale 18.000,00 (non 18.000,40)", () => {
    const r = scontoPerArrivareA(20_000, 10, 18_000);
    expect(r).toEqual({ esito: "ok", pct: 18.18181818, importo: 3_636.36 });
    expect(Math.abs(calcBagni([RIGA(20_000)], { sconto_pct: 18.18181818, iva_pct: 10 }).totale - 18_000)).toBeLessThan(0.005);
  });
});

describe("scontoDaPercentuale e i tasti", () => {
  it("i tasti sono Nessuno, 5% e 10%", () => {
    expect([...SCONTI_VELOCI]).toEqual([0, 5, 10]);
  });

  it("la percentuale e l'importo che toglie, in euro e centesimi", () => {
    expect(scontoDaPercentuale(20_000, 5)).toEqual({ pct: 5, importo: 1_000 });
    expect(scontoDaPercentuale(1_234.56, 10)).toEqual({ pct: 10, importo: 123.46 });
    expect(scontoDaPercentuale(20_000, 0)).toEqual({ pct: 0, importo: 0 });
    expect(scontoDaPercentuale(-50, 5)).toEqual({ pct: 5, importo: 0 });
  });
});

describe("totaleDaTesto", () => {
  it("legge i modi in cui si scrive una cifra in italiano", () => {
    expect(totaleDaTesto("24.500")).toBe(24_500);
    expect(totaleDaTesto("24500")).toBe(24_500);
    expect(totaleDaTesto("24500,50")).toBe(24_500.5);
    expect(totaleDaTesto("24.500,50")).toBe(24_500.5);
    expect(totaleDaTesto("1.234.567")).toBe(1_234_567);
    expect(totaleDaTesto("24 500 €")).toBe(24_500);
    expect(totaleDaTesto("€ 24500")).toBe(24_500);
    expect(totaleDaTesto("  24,5 ")).toBe(24.5);
  });

  it("un punto seguito da meno o più di tre cifre è un decimale, non le migliaia", () => {
    expect(totaleDaTesto("24.5")).toBe(24.5);
    expect(totaleDaTesto("24.50")).toBe(24.5);
    expect(totaleDaTesto("24.5000")).toBe(24.5);
  });

  it("vuoto, zero, negativo e illeggibile sono null", () => {
    for (const t of ["", "   ", "0", "0,00", "-100", "abc", "12abc", "1,2,3", "€"]) expect(totaleDaTesto(t), t).toBeNull();
  });

  it("meno di mezzo centesimo è zero centesimi, non una cifra", () => {
    for (const t of ["0,004", "0,001", "0.0004"]) expect(totaleDaTesto(t), t).toBeNull();
    expect(totaleDaTesto("0,01")).toBe(0.01);
  });
});
