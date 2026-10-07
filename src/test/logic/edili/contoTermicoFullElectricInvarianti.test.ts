/**
 * Conto Termico e Casa Full Electric dentro il termoidraulico (06/10/2026): gli invarianti dei
 * loro conti, con scenari fatti a mano e un sondaggio a caso. La detrazione generica non si
 * applica (il modello ha i suoi incentivi): qui la detrazione ha base IVA INCLUSA, tetto
 * 96.000 € e 10 quote annuali.
 */
import { describe, expect, it } from "vitest";
import { calcolaContoTermico, type ContoTermicoEconomia } from "@/lib/contoTermico/calcoli";
import { numeroRate } from "@/lib/contoTermico/regole";
import { calcolaFullElectric, type FullElectricEconomia } from "@/lib/fullElectric/calcoli";

// Centesimi interi; «+ 0» toglie il segno a uno zero negativo (i documenti non lo scrivono mai: euro() mette il meno solo sotto zero).
const cent = (x: number) => Math.round(x * 100) + 0;
let seme = 20261006;
const caso = () => { seme = (seme * 1664525 + 1013904223) % 4294967296; return seme / 4294967296; };
const scegli = <T,>(a: readonly T[]) => a[Math.floor(caso() * a.length)];

const ct = (extra: Partial<ContoTermicoEconomia> = {}): ContoTermicoEconomia => ({
  prezzoIvaInclusa: 12900, ivaPct: 10, contributo: 4800, modalita: "sconto_in_fattura", potenzaKw: 8,
  spesaAnnuaAttuale: 2100, spesaAnnuaNuova: 1000, aumentoEnergiaPct: 2, anni: 15, detrazionePct: 50, ...extra,
});

describe("Conto Termico: i conti", () => {
  // 12.900 € IVA 10% inclusa: imponibile 12.900 / 1,10 = 11.727,27; IVA 1.172,73. Contributo 4.800 sotto i 15.000: una rata.
  // Sconto in fattura: il cliente paga subito 12.900 − 4.800 = 8.100. Detrazione 50% su min(12.900; 96.000) = 6.450 in 10 anni → 645.
  it("scenario a mano: sconto in fattura, una rata, detrazione di confronto", () => {
    const r = calcolaContoTermico(ct());
    expect(r.imponibile).toBe(11727.27);
    expect(r.iva).toBe(1172.73);
    expect(r.restaATe).toBe(8100);
    expect(r.pagaOggi).toBe(8100);
    expect(r.rate).toEqual([{ numero: 1, anno: 1, importo: 4800 }]);
    expect(r.detrazione).toEqual({ pct: 50, totale: 6450, perAnno: 645 });
    expect(r.risparmioAnnuo).toBe(1100);
    expect(r.risparmioMensile).toBe(91.67);
  });

  it("la detrazione di confronto ha base IVA inclusa e tetto 96.000 €: 150.000 € al 50% → 48.000 in 10 quote da 4.800", () => {
    const r = calcolaContoTermico(ct({ prezzoIvaInclusa: 150000, contributo: 0 }));
    expect(r.detrazione).toEqual({ pct: 50, totale: 48000, perAnno: 4800 });
  });

  it("rate del contributo: ≤ 15.000 € una; sopra, 2 annualità (5 oltre i 35 kW); la somma è sempre il contributo", () => {
    expect(numeroRate(15000, null)).toBe(1);
    expect(numeroRate(15000.01, null)).toBe(2);
    expect(numeroRate(15000.01, 35)).toBe(2);
    expect(numeroRate(15000.01, 35.1)).toBe(5);
    expect(numeroRate(0, 50)).toBe(0);
    for (let k = 0; k < 400; k++) {
      const contributo = Math.round(caso() * 6_000_000) / 100;
      const prezzo = contributo + Math.round(caso() * 3_000_000) / 100 + 1;
      const modalita = scegli(["sconto_in_fattura", "rimborso"] as const);
      const r = calcolaContoTermico(ct({ prezzoIvaInclusa: prezzo, contributo, potenzaKw: scegli([null, 8, 35, 40, 120]), modalita }));
      expect(r.rate.reduce((s, x) => s + cent(x.importo), 0), `rate k=${k}`).toBe(cent(contributo));
      expect(cent(r.restaATe) + cent(r.contributo)).toBe(cent(r.prezzo));
      expect(cent(r.imponibile) + cent(r.iva)).toBe(cent(r.prezzo));
      expect(r.pagaOggi).toBe(modalita === "sconto_in_fattura" ? r.restaATe : r.prezzo);
    }
  });

  it("sconto in fattura: paga oggi il netto; rimborso: anticipa tutto e il contributo rientra nelle annualità", () => {
    const sconto = calcolaContoTermico(ct({ modalita: "sconto_in_fattura" }));
    const rimborso = calcolaContoTermico(ct({ modalita: "rimborso" }));
    expect(sconto.pagaOggi).toBe(8100);
    expect(rimborso.pagaOggi).toBe(12900);
    expect(rimborso.anniBeneficio[0]).toMatchObject({ anno: 0, flusso: -12900, cumulato: -12900 });
    // Il beneficio finale è lo stesso a parità di anni: cambia solo quando arriva il contributo.
    expect(rimborso.beneficioFinale).toBe(sconto.beneficioFinale);
  });

  it("valori sporchi: nessun NaN, mai un contributo oltre il prezzo, prezzo negativo = 0", () => {
    for (const sporco of [Number.NaN, -100, Number.POSITIVE_INFINITY, undefined as unknown as number, null as unknown as number]) {
      const r = calcolaContoTermico(ct({ prezzoIvaInclusa: sporco, contributo: sporco, ivaPct: sporco, anni: sporco, aumentoEnergiaPct: sporco, spesaAnnuaAttuale: sporco }));
      for (const x of [r.prezzo, r.imponibile, r.iva, r.contributo, r.restaATe, r.pagaOggi, r.risparmioAnnuo, r.beneficioFinale]) expect(Number.isFinite(x)).toBe(true);
      expect(r.contributo).toBeLessThanOrEqual(r.prezzo);
    }
    expect(calcolaContoTermico(ct({ contributo: 99999 })).contributo).toBe(12900);
    expect(calcolaContoTermico(ct({ anni: 99 })).anniBeneficio).toHaveLength(31); // al massimo 30 anni, più l'anno 0
  });
});

const fe = (extra: Partial<FullElectricEconomia> = {}): FullElectricEconomia => ({
  prezzoIvaInclusa: 30000, ivaPct: 10,
  oggi: { spesaGas: 1500, spesaLuce: 900, gasSmc: 1200, luceKwh: 3000 },
  domani: { produzioneKwh: 6000, consumoKwh: 7500, autoconsumoPct: 50, prezzoLuce: 0.3, prezzoImmissione: 0.1, quotaFissa: 120 },
  incentivi: { detrazionePct: 50, importoDetraibile: null, contributoCt: 3000, modalitaCt: "sconto_in_fattura" },
  aumentoEnergiaPct: 2, anni: 20, ...extra,
});

describe("Casa Full Electric: i conti", () => {
  // Autoconsumo min(6.000 × 50%; 7.500) = 3.000 kWh; dalla rete 4.500; immessi 3.000.
  // Luce domani 4.500 × 0,30 + 120 = 1.470; ricavo 3.000 × 0,10 = 300 → bolletta 1.170; oggi 2.400 → risparmio 1.230.
  // Detrazione: base min(30.000; 96.000) = 30.000, 50% = 15.000, ma non oltre prezzo − CT (27.000): 15.000 → 1.500 l'anno.
  // Paga oggi 30.000 − 3.000 = 27.000; costo netto 30.000 − 3.000 − 15.000 = 12.000.
  it("scenario a mano: energia, bollette, incentivi", () => {
    const r = calcolaFullElectric(fe());
    expect(r.energia).toMatchObject({ autoconsumo: 3000, dallaRete: 4500, immessa: 3000, coperturaPct: 40 });
    expect(r.bollette.domani).toMatchObject({ luce: 1470, ricavo: 300, totale: 1170 });
    expect(r.risparmioAnnuo).toBe(1230);
    expect(r.incentivi.detrazione).toEqual({ pct: 50, base: 30000, totale: 15000, perAnno: 1500 });
    expect(r.pagaOggi).toBe(27000);
    expect(r.costoNetto).toBe(12000);
  });

  it("la detrazione ha tetto 96.000 € e si ferma al prezzo meno il Conto Termico", () => {
    const grande = calcolaFullElectric(fe({ prezzoIvaInclusa: 200000, incentivi: { detrazionePct: 50, importoDetraibile: null, contributoCt: 0, modalitaCt: "rimborso" } }));
    expect(grande.incentivi.detrazione).toMatchObject({ base: 96000, totale: 48000, perAnno: 4800 });
    // La spesa detraibile scritta a mano (senza la pompa di calore) vince sul prezzo, ma non supera il prezzo.
    const scritta = calcolaFullElectric(fe({ incentivi: { detrazionePct: 36, importoDetraibile: 20000, contributoCt: 3000, modalitaCt: "sconto_in_fattura" } }));
    expect(scritta.incentivi.detrazione).toMatchObject({ base: 20000, totale: 7200, perAnno: 720 });
    const oltre = calcolaFullElectric(fe({ incentivi: { detrazionePct: 50, importoDetraibile: 90000, contributoCt: 0, modalitaCt: "rimborso" } }));
    expect(oltre.incentivi.detrazione?.base).toBe(30000);
  });

  it("200 casi a caso: bilanci dell'energia, dei mesi, dei soldi e delle quote", () => {
    for (let k = 0; k < 200; k++) {
      const prezzo = 5000 + Math.round(caso() * 30_000_000) / 100;
      const produzione = Math.round(caso() * 12000);
      const consumo = Math.round(caso() * 15000);
      const r = calcolaFullElectric(fe({
        prezzoIvaInclusa: prezzo, ivaPct: scegli([4, 10, 22]),
        domani: { produzioneKwh: produzione, consumoKwh: consumo, autoconsumoPct: Math.round(caso() * 100), prezzoLuce: 0.25, prezzoImmissione: 0.1, quotaFissa: 100 },
        incentivi: { detrazionePct: scegli([null, 36, 50]), importoDetraibile: scegli([null, prezzo / 2]), contributoCt: Math.round(caso() * prezzo), modalitaCt: scegli(["sconto_in_fattura", "rimborso"]) },
      }));
      // Energia: il tetto non copre più dei consumi né più di quello che produce.
      expect(r.energia.autoconsumo).toBeLessThanOrEqual(Math.min(produzione, consumo) + 0.01);
      expect(cent(r.energia.dallaRete) + cent(r.energia.autoconsumo)).toBe(cent(consumo));
      expect(cent(r.energia.immessa) + cent(r.energia.autoconsumo)).toBe(cent(produzione));
      // I mesi dell'anno tipo sommano all'anno (a meno degli arrotondamenti mensili).
      expect(Math.abs(r.mesi.reduce((s, m) => s + m.produzione, 0) - produzione)).toBeLessThanOrEqual(0.07);
      expect(Math.abs(r.mesi.reduce((s, m) => s + m.consumo, 0) - consumo)).toBeLessThanOrEqual(0.07);
      // Soldi: imponibile + IVA = prezzo; nessun incentivo supera il prezzo; costo netto = prezzo − incentivi.
      expect(cent(r.imponibile) + cent(r.iva)).toBe(cent(r.prezzo));
      expect(r.incentivi.contributoCt).toBeLessThanOrEqual(r.prezzo);
      expect(cent(r.costoNetto)).toBe(cent(r.prezzo) - cent(r.incentivi.contributoCt) - cent(r.incentivi.detrazione?.totale ?? 0));
      expect((r.incentivi.detrazione?.totale ?? 0) + r.incentivi.contributoCt).toBeLessThanOrEqual(r.prezzo + 0.01);
      if (r.incentivi.detrazione) {
        expect(r.incentivi.detrazione.base).toBeLessThanOrEqual(96000);
        // La quota annuale è un'informazione (totale / 10, al centesimo): dieci quote arrotondate stanno entro 5 centesimi dal totale.
        expect(Math.abs(r.incentivi.detrazione.perAnno * 10 - r.incentivi.detrazione.totale)).toBeLessThanOrEqual(0.05 + 1e-9);
      }
      for (const x of [r.risparmioAnnuo, r.pagaOggi, r.costoNetto, r.beneficioFinale]) expect(Number.isFinite(x)).toBe(true);
    }
  });

  it("valori sporchi: nessun NaN né divisione per zero; senza consumi la copertura è 0", () => {
    const r = calcolaFullElectric(fe({
      prezzoIvaInclusa: Number.NaN, ivaPct: -3,
      oggi: { spesaGas: Number.NaN, spesaLuce: -5, gasSmc: Number.POSITIVE_INFINITY, luceKwh: undefined as unknown as number },
      domani: { produzioneKwh: -1, consumoKwh: 0, autoconsumoPct: 400, prezzoLuce: Number.NaN, prezzoImmissione: -1, quotaFissa: Number.NaN },
      incentivi: { detrazionePct: Number.NaN, importoDetraibile: Number.NaN, contributoCt: Number.NaN, modalitaCt: "rimborso" },
    }));
    expect(r.energia.coperturaPct).toBe(0);
    for (const x of [r.prezzo, r.imponibile, r.iva, r.risparmioAnnuo, r.pagaOggi, r.costoNetto, r.beneficioFinale, r.ambiente.co2OggiKg, r.ambiente.alberi]) expect(Number.isFinite(x)).toBe(true);
  });
});
