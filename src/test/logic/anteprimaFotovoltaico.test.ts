// L'anteprima del preventivo fotovoltaico: righe, prezzo e numeri dell'impianto dallo
// stato del wizard, senza conti suoi (righe della Fase 5, prezzo del server).
import { describe, expect, it } from "vitest";
import type { DiscountRule } from "@/hooks/useDiscountRules";
import {
  type DatiAnteprimaFv,
  type OpzioniAnteprimaFv,
  anteprimaFotovoltaico,
  stimaProduzioneFv,
} from "@/lib/fotovoltaico/anteprima";
import { righeSenzaPrezzo } from "@/lib/preventivatore/anteprima";

const DATI: DatiAnteprimaFv = {
  cliente_nome: "Mario", cliente_cognome: "Rossi", cliente_telefono: "347 123 4567", cliente_email: "mario@example.it",
  indirizzo: "Via Roma 4", cap: "36100", comune: "Vicenza", provincia: "VI",
  consumo_annuo_kwh: 5000, ore_sole_annue: 1400, numero_pannelli_max: 24, potenza_max_kwp: 12.96,
  kit_bundle_id: null, kit_nome: null, kit_prezzo: null, potenza_kwp: 8.64, con_accumulo: false, capacita_accumulo_kwh: 0,
  numero_pannelli_scelti: 16, pannello_id: "p1", inverter_id: "i1", accumulo_id: null,
  prodotti_extra: [], prezzo_vendita_manuale: null, iva_aliquota: 0.1, sconto_tipo: "pct", sconto_valore: null,
  manodopera_righe: [{ descrizione: "Installazione impianto", ore: 20, tariffa_oraria_netta: 25, tariffa_oraria_vendita: 40 }],
  servizi_righe: [{ descrizione: "Pratica GSE", quantita: 1, prezzo_netto: 400, prezzo_vendita: 600 }],
};

const OPZIONI: OpzioniAnteprimaFv = {
  emittente: "Solare Bianchi",
  numero: "FV-2026-0128",
  oggi: new Date(2026, 9, 5),
  impiantoConfigurato: true,
  regoleSconto: [] as DiscountRule[],
  listino: {
    pannelli: [{ id: "p1", descrizione: "Pannello 540 W", prezzo_vendita: 150, prezzo_acquisto: 90, potenza_w: 540 }],
    inverter: [{ id: "i1", descrizione: "Inverter 6 kW", prezzo_vendita: 1200, prezzo_acquisto: 800, potenza_kw: 6 }],
    accumuli: [{ id: "a1", descrizione: "Batteria 10 kWh", prezzo_vendita: 5200, prezzo_acquisto: 3900, capacita_kwh: 10 }],
  },
};

const costruisci = (extra: Partial<DatiAnteprimaFv> = {}, opzioni: Partial<OpzioniAnteprimaFv> = {}) =>
  anteprimaFotovoltaico({ ...DATI, ...extra }, { ...OPZIONI, ...opzioni });

describe("anteprimaFotovoltaico — le righe", () => {
  it("impianto, manodopera e pratiche in gruppi, con unità e dettagli; i gruppi vuoti restano vuoti", () => {
    const a = costruisci();
    expect(a.gruppi.map((g) => [g.id, g.righe.length])).toEqual([["impianto", 2], ["extra", 0], ["manodopera", 1], ["servizi", 1]]);
    const [pannello, inverter] = a.gruppi[0].righe;
    expect(pannello).toMatchObject({ titolo: "Pannello 540 W", dettaglio: "540 W", quantita: 16, unita: "pz", prezzoUnitario: 150, totale: 2400, costo: 1440 });
    expect(inverter).toMatchObject({ titolo: "Inverter 6 kW", dettaglio: "6 kW", totale: 1200, costo: 800 });
    expect(a.gruppi[2].righe[0]).toMatchObject({ titolo: "Installazione impianto", quantita: 20, unita: "h", prezzoUnitario: 40, totale: 800, costo: 500 });
    expect(a.gruppi[3].righe[0]).toMatchObject({ titolo: "Pratica GSE", quantita: 1, totale: 600, costo: 400 });
  });

  it("un kit è una voce sola: «kit», potenza e accumulo nel dettaglio", () => {
    const a = costruisci({ kit_bundle_id: "k1", kit_nome: "Kit 6 kWp + batteria", kit_prezzo: 9800, potenza_kwp: 6, con_accumulo: true, capacita_accumulo_kwh: 10, pannello_id: null, inverter_id: null, manodopera_righe: [], servizi_righe: [] });
    expect(a.gruppi[0].righe).toHaveLength(1);
    expect(a.gruppi[0].righe[0]).toMatchObject({ titolo: "Kit 6 kWp + batteria", dettaglio: "6 kWp · accumulo 10 kWh", quantita: 1, unita: "kit", totale: 9800, costo: null });
  });

  it("i prodotti extra stanno nel loro gruppo, non fra i componenti dell'impianto", () => {
    const a = costruisci({ prodotti_extra: [{ descrizione: "Colonnina 7 kW", quantita: 1, prezzo_vendita: 1500, prezzo_acquisto: 1000 }] });
    expect(a.gruppi[0].righe.map((r) => r.titolo)).toEqual(["Pannello 540 W", "Inverter 6 kW"]);
    expect(a.gruppi[1].righe.map((r) => [r.titolo, r.totale])).toEqual([["Colonnina 7 kW", 1500]]);
  });

  it("una riga di listino senza prezzo è «da prezzare»; col prezzo a corpo non si segnala", () => {
    const senzaPrezzi = { ...OPZIONI.listino, pannelli: [{ id: "p1", descrizione: "Pannello", potenza_w: 540 }] };
    const a = costruisci({}, { listino: senzaPrezzi });
    expect(righeSenzaPrezzo(a)).toBe(1);
    expect(righeSenzaPrezzo(costruisci({ prezzo_vendita_manuale: 9000 }, { listino: senzaPrezzi }))).toBe(0);
  });
});

describe("anteprimaFotovoltaico — il prezzo", () => {
  it("è quello del calcolo del server: 4.000 + 800 + 600 = 5.000 + IVA 10% = 5.500", () => {
    const a = costruisci({ manodopera_righe: DATI.manodopera_righe });
    // componenti 2.400 + 1.200 = 3.600; manodopera 800; servizi 600
    expect(a.totali.map((t) => [t.id, t.etichetta, t.importo])).toEqual([
      ["lordo", "Totale voci", 5000],
      ["iva", "IVA 10%", 500],
      ["totale", "Totale", 5500],
    ]);
    expect(a.totaleDocumento).toBe(5500);
  });

  it("con lo sconto: si toglie e l'imponibile si riscrive; se le regole lo limitano, lo dice", () => {
    const a = costruisci({ sconto_tipo: "pct", sconto_valore: 5 });
    expect(a.totali.map((t) => [t.etichetta, t.importo])).toEqual([
      ["Totale voci", 5000], ["Sconto 5%", 250], ["Imponibile", 4750], ["IVA 10%", 475], ["Totale", 5225],
    ]);
    expect(a.avvisi).toEqual([]);
    const limitato = costruisci({ sconto_tipo: "importo", sconto_valore: 800 });
    expect(limitato.totali.find((t) => t.id === "sconto")).toMatchObject({ etichetta: "Sconto", importo: 500 });
    expect(limitato.avvisi[0]).toMatch(/Sconto richiesto € 800.*limitano a € 500/);
  });

  it("col prezzo a corpo parte da quello, lo dice, e lo sconto non vale", () => {
    const a = costruisci({ prezzo_vendita_manuale: 4000, sconto_tipo: "pct", sconto_valore: 5 });
    expect(a.prezzoACorpo).toBe(true);
    expect(a.totali.map((t) => [t.etichetta, t.importo])).toEqual([["Prezzo concordato", 4000], ["IVA 10%", 400], ["Totale", 4400]]);
    expect(a.note.join(" ")).toMatch(/Prezzo scritto a mano.*€ 5\.000/);
  });

  it("con un kit il prezzo a corpo non vale (lo azzera anche il salvataggio)", () => {
    const a = costruisci({ kit_bundle_id: "k1", kit_prezzo: 9800, prezzo_vendita_manuale: 4000, pannello_id: null, inverter_id: null, manodopera_righe: [], servizi_righe: [] });
    expect(a.prezzoACorpo).toBe(false);
    expect(a.totaleDocumento).toBe(10780);
  });

  it("l'IVA è quella scelta nel preventivo (22%) e si legge senza decimali inutili", () => {
    const a = costruisci({ iva_aliquota: 0.22 });
    expect(a.totali.find((t) => t.id === "iva")).toMatchObject({ etichetta: "IVA 22%", importo: 1100 });
    expect(costruisci({ iva_aliquota: 0.04 }).totali.find((t) => t.id === "iva")?.etichetta).toBe("IVA 4%");
  });

  it("senza niente da sommare non c'è totale; col solo prezzo a corpo sì", () => {
    const vuoto = costruisci({ pannello_id: null, inverter_id: null, manodopera_righe: [], servizi_righe: [] });
    expect(vuoto.totali).toEqual([]);
    expect(vuoto.totaleDocumento).toBeNull();
    expect(vuoto.impresa).toBeNull();
    expect(costruisci({ pannello_id: null, inverter_id: null, manodopera_righe: [], servizi_righe: [], prezzo_vendita_manuale: 7000 }).totaleDocumento).toBe(7700);
  });
});

describe("anteprimaFotovoltaico — vista impresa", () => {
  it("costi e margine veri quando tutte le righe vendute hanno il costo", () => {
    const a = costruisci();
    expect(a.impresa).toMatchObject({ costi: 3140, margine: 1860, costiCompleti: true, righeSenzaCosto: 0 });
    expect(a.impresa?.marginePct).toBeCloseTo(37.2, 5);
  });

  it("con un kit o un componente senza costo il margine non si conosce: «null», non un numero inventato", () => {
    const kit = costruisci({ kit_bundle_id: "k1", kit_prezzo: 9800, pannello_id: null, inverter_id: null, manodopera_righe: [], servizi_righe: [] });
    expect(kit.impresa).toMatchObject({ margine: null, marginePct: null, costiCompleti: false });
    const senzaCosto = costruisci({}, { listino: { ...OPZIONI.listino, inverter: [{ id: "i1", descrizione: "Inverter", prezzo_vendita: 1200, potenza_kw: 6 }] } });
    expect(senzaCosto.impresa).toMatchObject({ margine: null, righeSenzaCosto: 1 });
  });

  it("a chi non può vedere i margini il blocco non si prepara", () => {
    expect(costruisci({}, { conImpresa: false }).impresa).toBeNull();
  });
});

describe("anteprimaFotovoltaico — i numeri dell'impianto", () => {
  it("dalla Fase 5: potenza, moduli, accumulo, produzione stimata e quanto copre dei consumi", () => {
    const a = costruisci({ con_accumulo: true, capacita_accumulo_kwh: 10, accumulo_id: "a1" });
    // 8,64 kWp × 1.400 h × 0,7565 = 9.150,5 kWh
    expect(a.sintesi).toEqual([
      { id: "potenza", etichetta: "Potenza", valore: "8,64 kWp" },
      { id: "moduli", etichetta: "Moduli", valore: "16" },
      { id: "accumulo", etichetta: "Accumulo", valore: "10 kWh" },
      { id: "produzione", etichetta: "Produzione stimata", valore: "9.151 kWh/anno" },
      { id: "copertura", etichetta: "Rispetto ai consumi", valore: "183%" },
    ]);
    expect(a.titolo).toBe("Impianto fotovoltaico da 8,64 kWp");
  });

  it("la produzione è la stessa stima della Fase 5", () => {
    expect(stimaProduzioneFv({ potenza_kwp: 8.64, ore_sole_annue: 1400 })).toBeCloseTo(8.64 * 1400 * 0.7565, 8);
    expect(stimaProduzioneFv({ potenza_kwp: 8.64, ore_sole_annue: null })).toBe(0);
    expect(stimaProduzioneFv({ potenza_kwp: null, ore_sole_annue: 1400 })).toBe(0);
  });

  it("prima della Fase 5 potenza e moduli sono quelli di partenza del wizard, non una scelta: si mostrano consumi e tetto", () => {
    const a = costruisci({}, { impiantoConfigurato: false });
    expect(a.sintesi?.map((v) => v.id)).toEqual(["consumo", "ore-sole", "tetto"]);
    expect(a.sintesi?.find((v) => v.id === "tetto")?.valore).toBe("fino a 24 moduli (12,96 kWp)");
    expect(a.titolo).toBe("Impianto fotovoltaico");
  });

  it("con un kit non si dicono i moduli (li decide il kit)", () => {
    const a = costruisci({ kit_bundle_id: "k1", kit_prezzo: 9800, potenza_kwp: 6 });
    expect(a.sintesi?.map((v) => v.id)).not.toContain("moduli");
    expect(a.sintesi?.[0]).toMatchObject({ id: "potenza", valore: "6 kWp" });
  });
});

describe("anteprimaFotovoltaico — detrazione dall'ultimo calcolo", () => {
  const scenario = (totale: number): Record<string, unknown> => ({
    costi: { prezzo_vendita_iva_inclusa: totale },
    incentivi: [{ codice: "IVA_10", importo_eur: 300 }, { codice: "DETR_50_PRIMA", nome: "Detrazione 50%", importo_eur: 2750 }],
  });

  it("se il calcolo è ancora sul totale di adesso, la detrazione c'è, col suo 50%", () => {
    const a = costruisci({}, { scenario: scenario(5500) });
    expect(a.detrazione).toMatchObject({ pct: 50, importo: 2750, massimale: null, nota: "In 10 quote annuali, dal calcolo finanziario." });
    expect(a.avvisi).toEqual([]);
  });

  it("la seconda casa è il 36%", () => {
    const s = { costi: { prezzo_vendita_iva_inclusa: 5500 }, incentivi: [{ codice: "DETR_36_SECONDA", importo_eur: 1980 }] };
    expect(costruisci({}, { scenario: s }).detrazione).toMatchObject({ pct: 36, importo: 1980 });
  });

  it("se il totale è cambiato dopo il calcolo, non si mostra una detrazione vecchia: si dice di ricalcolare", () => {
    const a = costruisci({}, { scenario: scenario(4400) });
    expect(a.detrazione).toBeNull();
    expect(a.avvisi.join(" ")).toMatch(/calcolo finanziario era su € 4\.400.*ricalcolalo/);
  });

  it("senza calcolo (o senza detrazione fra gli incentivi) non c'è", () => {
    expect(costruisci().detrazione).toBeNull();
    expect(costruisci({}, { scenario: { costi: { prezzo_vendita_iva_inclusa: 5500 }, incentivi: [{ codice: "IVA_10", importo_eur: 300 }] } }).detrazione).toBeNull();
  });
});

describe("anteprimaFotovoltaico — la testata", () => {
  it("emittente, numero, data, cliente e indirizzo dell'impianto", () => {
    const a = costruisci();
    expect(a).toMatchObject({ emittente: "Solare Bianchi", codice: "FV-2026-0128", cantiere: "Via Roma 4, 36100 Vicenza, VI" });
    expect(a.dataEtichetta).toBe("5 ottobre 2026");
    expect(a.cliente).toEqual({ nome: "Mario Rossi", righe: ["347 123 4567", "mario@example.it"] });
  });

  it("un preventivo appena aperto ha solo ciò che c'è", () => {
    const a = costruisci({ cliente_nome: "", cliente_cognome: "", cliente_telefono: "", cliente_email: "", indirizzo: "", cap: "", comune: "", provincia: "", pannello_id: null, inverter_id: null, manodopera_righe: [], servizi_righe: [] }, { impiantoConfigurato: false, numero: null });
    expect(a.cliente).toEqual({ nome: null, righe: [] });
    expect(a.cantiere).toBeNull();
    expect(a.codice).toBeNull();
    expect(a.totaleDocumento).toBeNull();
  });
});
