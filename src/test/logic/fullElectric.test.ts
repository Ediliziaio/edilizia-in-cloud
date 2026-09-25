import { describe, expect, it } from "vitest";
import { calcolaFullElectric, co2Testo, intero, kwh, type FullElectricEconomia } from "@/lib/fullElectric/calcoli";
import { DATI_FULL_ELECTRIC_INIZIALI, economiaFullElectric, leggiDatiFullElectric } from "@/lib/fullElectric/dati";
import { DATI_FULL_ELECTRIC_DIMOSTRATIVI } from "@/lib/fullElectric/anteprima";
import { datiPdfFullElectric, eFullElectric, fotoFullElectric, MODELLO_FULL_ELECTRIC } from "@/lib/fullElectric/pdfDelPreventivo";
import { eContoTermico } from "@/lib/contoTermico/pdfDelPreventivo";
import { buildIdrModulePreview, createFullIdrTemplate } from "@/lib/moduli-vendita/fullIdrModules";
import type { IdrPdfEnriched } from "@/hooks/useTermoidraulicoPDF";
import type { IdrTemplatePdf } from "@/types/termoidraulico";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// La villetta d'esempio: 28.600 € IVA inclusa, 6 kWp, gas e luce per 2.660 € l'anno.
const esempio = (): FullElectricEconomia => economiaFullElectric(DATI_FULL_ELECTRIC_DIMOSTRATIVI, 28600, 10);

describe("Casa Full Electric: i conti del preventivo", () => {
  it("energia: il tetto copre i consumi fin dove arriva, il resto si vende", () => {
    const r = calcolaFullElectric(esempio());
    // 60% di 7.500 kWh consumati in casa; il resto della casa dalla rete.
    expect(r.energia).toEqual({ produzione: 7500, consumo: 7200, autoconsumo: 4500, dallaRete: 2700, immessa: 3000, coperturaPct: 63 });
    // I mesi sono l'anno diviso secondo l'andamento tipico: sommati, tornano i totali.
    expect(r.mesi).toHaveLength(12);
    expect(r.mesi.reduce((s, m) => s + m.produzione, 0)).toBeCloseTo(7500, 6);
    expect(r.mesi.reduce((s, m) => s + m.consumo, 0)).toBeCloseTo(7200, 6);
    // D'inverno la casa consuma più di quanto il tetto produce.
    expect(r.mesi[0].consumo).toBeGreaterThan(r.mesi[0].produzione);
    expect(r.mesi[6].produzione).toBeGreaterThan(r.mesi[6].consumo);
  });

  it("bollette: oggi gas e luce, domani solo la luce presa dalla rete meno quella venduta", () => {
    const r = calcolaFullElectric(esempio());
    expect(r.bollette.oggi).toEqual({ gas: 1700, luce: 960, totale: 2660 });
    // 2.700 kWh × 0,28 € + 150 € di quote fisse; 3.000 kWh venduti a 0,10 €.
    expect(r.bollette.domani).toEqual({ luce: 906, ricavo: 300, totale: 606 });
    expect(r.risparmioAnnuo).toBe(2054);
    expect(r.risparmioMensile).toBeCloseTo(171.17, 2);
    expect(r.imponibile).toBe(26000);
    expect(r.iva).toBe(2600);
  });

  it("incentivi su componenti diversi: detrazione sulla sua spesa, Conto Termico a parte", () => {
    const r = calcolaFullElectric(esempio());
    expect(r.incentivi).toEqual({ detrazione: { pct: 50, base: 16000, totale: 8000, perAnno: 800 }, contributoCt: 3500, scontoInFattura: true, totale: 11500 });
    // Il Conto Termico in fattura: ai lavori si paga il prezzo meno il contributo.
    expect(r.pagaOggi).toBe(25100);
    expect(r.costoNetto).toBe(17100);
    // La detrazione arriva in 10 quote uguali, poi restano i risparmi.
    expect(r.anniBeneficio[0].cumulato).toBe(-25100);
    expect(r.anniBeneficio[1]).toMatchObject({ risparmio: 2054, incentivi: 800 });
    expect(r.anniBeneficio[10].incentivi).toBe(800);
    expect(r.anniBeneficio[11].incentivi).toBe(0);
    // L'energia rincara del 2% l'anno: il risparmio cresce con lei.
    expect(r.anniBeneficio[2].risparmio).toBeCloseTo(2095.08, 2);
    expect(r.anniDiRientro).toBe(8.3);
    expect(r.beneficioFinale).toBeCloseTo(32806.8, 2);
  });

  it("Conto Termico a rimborso: si anticipa tutto, il contributo arriva il primo anno", () => {
    const sconto = calcolaFullElectric(esempio());
    const r = calcolaFullElectric({ ...esempio(), incentivi: { ...esempio().incentivi, modalitaCt: "rimborso" } });
    expect(r.pagaOggi).toBe(28600);
    expect(r.anniBeneficio[1].incentivi).toBe(4300);
    // Stesso punto d'arrivo: cambia solo quando arrivano i soldi.
    expect(r.costoNetto).toBe(sconto.costoNetto);
    expect(r.beneficioFinale).toBeCloseTo(sconto.beneficioFinale, 2);
  });

  it("senza incentivi il rientro viene solo dalle bollette", () => {
    const r = calcolaFullElectric({ ...esempio(), incentivi: { detrazionePct: null, importoDetraibile: null, contributoCt: 0, modalitaCt: "sconto_in_fattura" } });
    expect(r.incentivi).toEqual({ detrazione: null, contributoCt: 0, scontoInFattura: true, totale: 0 });
    expect(r.costoNetto).toBe(28600);
    expect(r.anniDiRientro).toBe(12.4);
  });

  it("incentivi scritti troppo alti non fanno guadagnare il cliente sulla carta", () => {
    const r = calcolaFullElectric({ ...esempio(), incentivi: { detrazionePct: 50, importoDetraibile: null, contributoCt: 50000, modalitaCt: "sconto_in_fattura" } });
    expect(r.incentivi.contributoCt).toBe(28600);
    expect(r.incentivi.detrazione?.totale).toBe(0);
    expect(r.incentivi.totale).toBe(28600);
    expect(r.costoNetto).toBe(0);
    expect(r.anniDiRientro).toBe(0);
    // La detrazione non supera il massimale di 96.000 € di spesa.
    const villa = calcolaFullElectric({ ...esempio(), prezzoIvaInclusa: 150000, incentivi: { detrazionePct: 50, importoDetraibile: null, contributoCt: 0, modalitaCt: "sconto_in_fattura" } });
    expect(villa.incentivi.detrazione).toMatchObject({ base: 96000, totale: 48000, perAnno: 4800 });
  });

  it("il tetto non copre più dei consumi, e senza consumi non si divide per zero", () => {
    const grande = calcolaFullElectric({ ...esempio(), domani: { ...esempio().domani, produzioneKwh: 20000, consumoKwh: 3000 } });
    expect(grande.energia).toMatchObject({ autoconsumo: 3000, dallaRete: 0, immessa: 17000, coperturaPct: 100 });
    const vuoto = calcolaFullElectric({ ...esempio(), domani: { ...esempio().domani, produzioneKwh: 0, consumoKwh: 0 } });
    expect(vuoto.energia.coperturaPct).toBe(0);
    expect(Number.isFinite(vuoto.risparmioAnnuo)).toBe(true);
  });

  it("la CO2: oggi gas e luce dalla rete, domani solo la luce dalla rete", () => {
    const r = calcolaFullElectric(esempio());
    // 1.400 Smc × 1,96 + 3.000 kWh × 0,26; domani 2.700 kWh × 0,26.
    expect(r.ambiente).toEqual({ gasSmcEvitati: 1400, co2OggiKg: 3524, co2DomaniKg: 702, co2EvitataKg: 2822, co2EvitataTotaleKg: 56440, alberi: 113 });
  });

  it("numeri all'italiana, col punto delle migliaia anche a quattro cifre", () => {
    expect(intero(1400)).toBe("1.400");
    expect(intero(-2500)).toBe("-2.500");
    expect(intero(999.6)).toBe("1.000");
    expect(kwh(7500)).toBe("7.500 kWh");
    expect(co2Testo(2822)).toBe("2,8 t");
    expect(co2Testo(702)).toBe("702 kg");
  });
});

describe("Casa Full Electric: i dati salvati sul preventivo", () => {
  it("un preventivo senza dati parte dai valori iniziali", () => {
    expect(leggiDatiFullElectric(null)).toEqual(DATI_FULL_ELECTRIC_INIZIALI);
    expect(leggiDatiFullElectric("rotto")).toEqual(DATI_FULL_ELECTRIC_INIZIALI);
  });

  it("ripulisce quello che arriva dal database", () => {
    const d = leggiDatiFullElectric({
      componenti: [
        { tipo: "fotovoltaico", titolo: "  ", dettaglio: "6 kWp" },
        { tipo: "fotovoltaico", titolo: "Doppione" },
        { tipo: "turbina", titolo: "Inventato" },
        null,
        { tipo: "wallbox", titolo: "Wallbox 7,4 kW" },
      ],
      spesa_gas: "1700,5", spesa_luce: -10, autoconsumo_pct: 150, prezzo_luce: 9, detrazione_pct: 0,
      importo_detraibile: "", contributo_ct: "3500", modalita_ct: "boh", anni: 99, aumento_energia_pct: 40,
      caratteristiche: [{ etichetta: "Batteria", valore: "10 kWh" }, { etichetta: "vuota", valore: "" }, null],
    });
    expect(d.componenti).toEqual([
      { tipo: "fotovoltaico", titolo: "Impianto fotovoltaico", dettaglio: "6 kWp" },
      { tipo: "wallbox", titolo: "Wallbox 7,4 kW", dettaglio: "" },
    ]);
    expect(d.spesa_gas).toBe(1700.5);
    expect(d.spesa_luce).toBe(0);
    expect(d.autoconsumo_pct).toBe(100);
    expect(d.prezzo_luce).toBe(2);
    expect(d.detrazione_pct).toBeNull();
    expect(d.importo_detraibile).toBeNull();
    expect(d.contributo_ct).toBe(3500);
    expect(d.modalita_ct).toBe("sconto_in_fattura");
    expect(d.anni).toBe(30);
    expect(d.aumento_energia_pct).toBe(10);
    expect(d.caratteristiche).toEqual([{ etichetta: "Batteria", valore: "10 kWh" }]);
    // Chi toglie tutti i pezzi resta senza pezzi; chi non ha mai scelto parte dai quattro di serie.
    expect(leggiDatiFullElectric({ componenti: [] }).componenti).toEqual([]);
    expect(leggiDatiFullElectric({}).componenti).toHaveLength(4);
    expect(leggiDatiFullElectric({ detrazione_pct: null }).detrazione_pct).toBeNull();
    expect(leggiDatiFullElectric({ anni: 2 }).anni).toBe(5);
  });

  it("dal preventivo ai numeri dei conti", () => {
    expect(esempio()).toMatchObject({
      prezzoIvaInclusa: 28600,
      ivaPct: 10,
      oggi: { spesaGas: 1700, spesaLuce: 960, gasSmc: 1400, luceKwh: 3000 },
      domani: { produzioneKwh: 7500, consumoKwh: 7200, autoconsumoPct: 60, quotaFissa: 150 },
      incentivi: { detrazionePct: 50, importoDetraibile: 16000, contributoCt: 3500, modalitaCt: "sconto_in_fattura" },
      anni: 20,
    });
  });
});

describe("Casa Full Electric: il modello nel preventivatore Termoidraulico", () => {
  const template = createFullIdrTemplate({ id: "online", company_id: "demo", ragione_sociale: "Azienda", default_detrazione_pct: 50 } as IdrTemplatePdf, "full-electric");

  it("si riconosce dal modello congelato e dal modello di libreria, e non si confonde col Conto Termico", () => {
    const preview = buildIdrModulePreview("demo", template, "full-electric");
    expect(eFullElectric(preview)).toBe(true);
    expect(eContoTermico(preview)).toBe(false);
    expect(eFullElectric({ progetto: { ...preview.progetto, modello_snapshot: { modelId: MODELLO_FULL_ELECTRIC } } as never, template: {} as IdrTemplatePdf })).toBe(true);
    const ct = createFullIdrTemplate({ id: "online", company_id: "demo" } as IdrTemplatePdf, "conto-termico");
    expect(eFullElectric(buildIdrModulePreview("demo", ct, "conto-termico"))).toBe(false);
    const caldaia = createFullIdrTemplate({ id: "online", company_id: "demo" } as IdrTemplatePdf, "caldaia");
    expect(eFullElectric(buildIdrModulePreview("demo", caldaia, "caldaia"))).toBe(false);
  });

  it("l'anteprima della libreria ha numeri d'esempio e il prezzo delle righe d'esempio", () => {
    const preview = buildIdrModulePreview("demo", template, "full-electric");
    expect(preview.progetto.iva_pct).toBe(10);
    expect(leggiDatiFullElectric(preview.progetto.full_electric).produzione_kwh).toBe(7500);
    expect(template.default_detrazione_pct).toBe(0);
    // 14.200 + 10.300 + 1.500 = 26.000 € di imponibile: 28.600 € con l'IVA al 10%.
    expect(preview.computo.reduce((s, v) => s + Number(v.quantita) * Number(v.prezzo_unitario), 0)).toBe(26000);
  });

  it("i dati del PDF vengono dal preventivo: cliente, voci, prezzo finale e testi del modello", () => {
    const preview = buildIdrModulePreview("demo", template, "full-electric");
    const enriched = {
      ...preview,
      progetto: { ...preview.progetto, cliente_nome: "Anna", cliente_cognome: "Bianchi", cantiere_indirizzo: "Via Verdi 3", cantiere_cap: "20100", cantiere_citta: "Milano", cantiere_provincia: "MI" },
      company: { ragione_sociale: "Impresa Demo", colore_marca: "#0f766e", website: "https://impresa.it" },
      capitoli: [{ nome: "Sistema", voci: preview.computo, subtotale: 26000, costo: 0 }],
      totali: { totale: 28600, ivaPct: 10 },
      images: {},
    } as unknown as IdrPdfEnriched;
    const d = datiPdfFullElectric(enriched, fotoFullElectric(DATI_FULL_ELECTRIC_DIMOSTRATIVI.componenti));
    expect(d.cliente).toEqual({ nome: "Anna Bianchi", indirizzo: "Via Verdi 3, 20100 Milano (MI)" });
    expect(d.azienda).toMatchObject({ nome: "Impresa Demo", sito: "impresa.it" });
    expect(d.colorePrimario).toBe("#0f766e");
    expect(d.economia).toMatchObject({ prezzoIvaInclusa: 28600, ivaPct: 10, incentivi: { contributoCt: 3500 } });
    expect(d.sistema.componenti.map((c) => c.tipo)).toEqual(["fotovoltaico", "accumulo", "pompa_calore", "induzione"]);
    expect(d.sistema.voci).toHaveLength(3);
    expect(d.testi?.faq).toHaveLength(8);
    expect(d.testi?.passaggi).toHaveLength(4);
    // Le pagine di ogni preventivo: gli stessi dati del documento degli altri interventi.
    expect(d.standard?.capitoli.map((c) => c.nome)).toEqual(["Sistema"]);
    expect(d.standard?.modello.usp[0]?.titolo).toBe("Un solo progetto");
    expect(d.standard?.modello.garanzie.map((g) => g.titolo)).toContain("Pratiche seguite");
    expect(d.standard?.modello.condizioniLegali).toEqual([]);
  });

  it("le foto seguono i pezzi scelti; il piano a induzione resta senza una foto sbagliata", () => {
    const foto = fotoFullElectric(DATI_FULL_ELECTRIC_DIMOSTRATIVI.componenti);
    expect(foto.fotovoltaico).toContain("vista-drone");
    expect(foto.pompa_calore).toContain("pompa-di-calore");
    expect(foto.induzione).toBeUndefined();
    expect(foto.wallbox).toBeUndefined();
    expect(fotoFullElectric([{ tipo: "wallbox", titolo: "Wallbox", dettaglio: "" }]).wallbox).toContain("wallbox");
    expect(foto.copertina).toContain("villa-tetto-coppi");
  });

  it("il modello ha garanzie e «perché sceglierci» scritti per lui", () => {
    const testi = [...(template.usp ?? []), ...(template.garanzie ?? [])].map((x) => `${x.titolo} ${x.descrizione}`).join(" ");
    expect(testi).not.toContain("Il contributo, messo in chiaro");
    expect(template.garanzie).toHaveLength(4);
    expect(template.usp).toHaveLength(3);
  });

  it("il documento carica il tema del racconto (Buffer e parole intere nel browser)", () => {
    const documento = readFileSync(resolve("src/components/termoidraulico/fullElectric/FullElectricPDF.tsx"), "utf8");
    expect(documento).toContain('from "@/components/preventivi/pdf/racconto/temaRacconto"');
  });
});
