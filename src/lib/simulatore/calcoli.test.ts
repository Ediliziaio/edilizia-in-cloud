import { describe, it, expect } from "vitest";
import {
  calcolaVoce,
  calcolaTotali,
  calcolaIva,
  calcolaFasi,
  calcolaEconomia,
  calcolaPrezzoObiettivo,
  calcolaProvvigione,
  calcolaProvvigioni,
  calcolaCassa,
} from "./calcoli";
import type { VoceSim, FaseSim, ProvvigioneSim } from "./tipi";

const voce = (p: Partial<VoceSim>): VoceSim => ({
  id: "1", fase_id: null, descrizione: "x", fonte: "libera", riferimento_id: null,
  codice: null, quantita: 1, unita: "pz", costo_unitario: 0, ricarico_pct: 0,
  prezzo_unitario: 0, vat_rate: 10, bene_significativo: false,
  valore_posa_associata: null, is_manodopera: false, ordine: 0, ...p,
});

const fase = (p: Partial<FaseSim>): FaseSim => ({
  id: "f1", nome: "Fase", ordine: 0, durata_settimane: 1,
  inizio_offset_settimane: 0, giorni_uomo: 0, note: null, ...p,
});

describe("calcolaVoce", () => {
  it("calcola imponibili e margine", () => {
    const r = calcolaVoce(voce({ quantita: 10, costo_unitario: 12, prezzo_unitario: 18 }));
    expect(r.imponibile_costo).toBe(120);
    expect(r.imponibile_ricavo).toBe(180);
    expect(r.margine).toBe(60);
  });
});

describe("calcolaTotali", () => {
  it("somma costi/ricavi e calcola margine %", () => {
    const r = calcolaTotali([
      voce({ quantita: 1, costo_unitario: 100, prezzo_unitario: 150 }),
      voce({ quantita: 2, costo_unitario: 25, prezzo_unitario: 50 }),
    ]);
    expect(r.costo_totale).toBe(150);
    expect(r.ricavo_imponibile).toBe(250);
    expect(r.margine_valore).toBe(100);
    expect(r.margine_pct).toBe(40);
  });
  it("margine_pct=0 con ricavo 0 (no NaN)", () => {
    expect(calcolaTotali([]).margine_pct).toBe(0);
  });
});

describe("calcolaIva", () => {
  it("singola: tutto a una aliquota", () => {
    const r = calcolaIva([voce({ quantita: 1, prezzo_unitario: 1000, vat_rate: 22 })], {
      iva_mode: "singola",
      iva_rate_singola: 10,
      iva_confronto: [],
      finanziamento: null,
    });
    expect(r.iva_totale).toBe(100);
    expect(r.riepilogo_iva).toEqual([{ aliquota: 10, imponibile: 1000, imposta: 100 }]);
  });
  it("mista: somma per aliquota di riga", () => {
    const r = calcolaIva(
      [
        voce({ quantita: 1, prezzo_unitario: 1000, vat_rate: 10 }),
        voce({ quantita: 1, prezzo_unitario: 500, vat_rate: 22 }),
      ],
      { iva_mode: "mista", iva_rate_singola: 10, iva_confronto: [], finanziamento: null },
    );
    expect(r.iva_totale).toBe(210);
  });
  it("mista: bene significativo split 10/22", () => {
    // bene 1000, posa 300 → 10% su 300+300=600, 22% su 700
    const r = calcolaIva(
      [
        voce({
          quantita: 1,
          prezzo_unitario: 1000,
          vat_rate: 10,
          bene_significativo: true,
          valore_posa_associata: 300,
        }),
      ],
      { iva_mode: "mista", iva_rate_singola: 10, iva_confronto: [], finanziamento: null },
    );
    const r10 = r.riepilogo_iva.find((x) => x.aliquota === 10)!;
    const r22 = r.riepilogo_iva.find((x) => x.aliquota === 22)!;
    expect(r10.imponibile).toBe(600);
    expect(r10.imposta).toBe(60);
    expect(r22.imponibile).toBe(700);
    expect(r22.imposta).toBe(154);
  });
});

describe("calcolaEconomia", () => {
  it("spese generali 15% su costo 1000 → costo_pieno 1150; sconto 10% su ricavo 1500 → netto 1350, margine 200, ~14.81%", () => {
    const e = calcolaEconomia({
      costo_diretto: 1000,
      ricavo_lordo: 1500,
      spese_generali_pct: 15,
      utile_pct: 0,
      sconto_pct: 10,
    });
    expect(e.spese_generali).toBe(150);
    expect(e.costo_pieno).toBe(1150);
    expect(e.sconto_valore).toBe(150);
    expect(e.ricavo_netto).toBe(1350);
    expect(e.margine_netto_valore).toBe(200);
    expect(e.margine_netto_pct).toBe(14.81);
  });

  it("utile_target = costo_pieno × utile_pct/100", () => {
    const e = calcolaEconomia({
      costo_diretto: 1000,
      ricavo_lordo: 1500,
      spese_generali_pct: 0,
      utile_pct: 20,
      sconto_pct: 0,
    });
    expect(e.costo_pieno).toBe(1000);
    expect(e.utile_target).toBe(200);
  });

  it("sconto/spese a 0 → netto = lordo, pieno = diretto", () => {
    const e = calcolaEconomia({
      costo_diretto: 600,
      ricavo_lordo: 1000,
      spese_generali_pct: 0,
      utile_pct: 0,
      sconto_pct: 0,
    });
    expect(e.costo_pieno).toBe(600);
    expect(e.ricavo_netto).toBe(1000);
    expect(e.margine_netto_valore).toBe(400);
    expect(e.margine_netto_pct).toBe(40);
  });

  it("margine_netto_pct=0 con ricavo_netto 0 (no NaN)", () => {
    const e = calcolaEconomia({
      costo_diretto: 100,
      ricavo_lordo: 0,
      spese_generali_pct: 0,
      utile_pct: 0,
      sconto_pct: 0,
    });
    expect(e.margine_netto_pct).toBe(0);
  });
});

describe("calcolaPrezzoObiettivo", () => {
  it("dato prezzo obiettivo → sconto% necessario e margine corretti", () => {
    // costo_pieno 1150, ricavo_lordo 1500, obiettivo 1350 → sconto 10%, margine 200
    const r = calcolaPrezzoObiettivo(1150, 1500, 1350);
    expect(r.sconto_pct_necessario).toBe(10);
    expect(r.margine_valore).toBe(200);
    expect(r.margine_pct).toBe(14.81);
  });

  it("obiettivo = lordo → sconto 0", () => {
    const r = calcolaPrezzoObiettivo(600, 1000, 1000);
    expect(r.sconto_pct_necessario).toBe(0);
    expect(r.margine_valore).toBe(400);
  });

  it("ricavo_lordo 0 → sconto 0 (no divisione per zero)", () => {
    const r = calcolaPrezzoObiettivo(100, 0, 0);
    expect(r.sconto_pct_necessario).toBe(0);
  });
});

describe("calcolaProvvigione", () => {
  const prov = (p: Partial<ProvvigioneSim>): ProvvigioneSim => ({
    id: "p1", nome: "Commerciale", base: "ricavo", valore: 0, ...p,
  });

  it("base 'ricavo' → % su ricavo_netto", () => {
    // 5% di 1000 = 50
    expect(calcolaProvvigione(prov({ base: "ricavo", valore: 5 }), 1000, 300)).toBe(50);
  });

  it("base 'margine' → % sul margine pre-provvigioni", () => {
    // 10% di 300 = 30
    expect(calcolaProvvigione(prov({ base: "margine", valore: 10 }), 1000, 300)).toBe(30);
  });

  it("base 'fisso' → importo in €", () => {
    expect(calcolaProvvigione(prov({ base: "fisso", valore: 20 }), 1000, 300)).toBe(20);
  });

  it("base 'margine' con margine negativo → 0 (mai provvigione su perdita)", () => {
    expect(calcolaProvvigione(prov({ base: "margine", valore: 10 }), 1000, -50)).toBe(0);
  });

  it("arrotonda a 2 decimali", () => {
    // 3.33% di 1000 = 33.3
    expect(calcolaProvvigione(prov({ base: "ricavo", valore: 3.33 }), 1000, 300)).toBe(33.3);
  });
});

describe("calcolaProvvigioni", () => {
  const prov = (p: Partial<ProvvigioneSim>): ProvvigioneSim => ({
    id: "p1", nome: "x", base: "ricavo", valore: 0, ...p,
  });

  it("somma 'ricavo' 5% + 'margine' 10% + 'fisso' 20 = 100 (ricavo 1000, margine 300)", () => {
    const totale = calcolaProvvigioni(
      [
        prov({ id: "a", base: "ricavo", valore: 5 }), // 50
        prov({ id: "b", base: "margine", valore: 10 }), // 30
        prov({ id: "c", base: "fisso", valore: 20 }), // 20
      ],
      1000,
      300,
    );
    expect(totale).toBe(100);
  });

  it("lista vuota → 0", () => {
    expect(calcolaProvvigioni([], 1000, 300)).toBe(0);
  });
});

describe("calcolaFasi", () => {
  it("durata totale = max(inizio_offset + durata)", () => {
    const r = calcolaFasi(
      [
        fase({ id: "a", inizio_offset_settimane: 0, durata_settimane: 2 }),
        fase({ id: "b", inizio_offset_settimane: 2, durata_settimane: 3 }), // finisce a 5
        fase({ id: "c", inizio_offset_settimane: 1, durata_settimane: 2 }), // finisce a 3
      ],
      [],
    );
    expect(r.durata_settimane).toBe(5);
    expect(r.perFase).toHaveLength(3);
  });

  it("durata totale = 0 senza fasi", () => {
    expect(calcolaFasi([], []).durata_settimane).toBe(0);
  });

  it("costo e manodopera per fase", () => {
    const r = calcolaFasi(
      [fase({ id: "a", inizio_offset_settimane: 1, durata_settimane: 2 })],
      [
        voce({ id: "v1", fase_id: "a", quantita: 2, costo_unitario: 50 }), // costo 100, materiale
        voce({ id: "v2", fase_id: "a", quantita: 1, costo_unitario: 80, is_manodopera: true }), // costo 80, manodopera
        voce({ id: "v3", fase_id: "b", quantita: 1, costo_unitario: 999 }), // altra fase → escluso
      ],
    );
    const a = r.perFase.find((p) => p.fase_id === "a")!;
    expect(a.costo).toBe(180);
    expect(a.manodopera_costo).toBe(80);
    expect(a.inizio).toBe(1);
    expect(a.durata).toBe(2);
  });
});

describe("calcolaCassa", () => {
  // Scenario base: 2 fasi note.
  //   A: inizio 0, durata 2, costo voci 100 → settimane 1,2.
  //   B: inizio 2, durata 2, costo voci 300 → settimane 3,4.
  // costoPieno 800 (> costo voci 400): quota per fase ∝ costo voce →
  //   A pesa 200 (100/wk su 1,2), B pesa 600 (300/wk su 3,4).
  // costo_cum: [0,100,200,500,800].
  const fasi = [
    fase({ id: "a", inizio_offset_settimane: 0, durata_settimane: 2 }),
    fase({ id: "b", inizio_offset_settimane: 2, durata_settimane: 2 }),
  ];
  const voci = [
    voce({ id: "va", fase_id: "a", quantita: 1, costo_unitario: 100 }),
    voce({ id: "vb", fase_id: "b", quantita: 1, costo_unitario: 300 }),
  ];

  it("acconto 30 / saldo 10: serie su 0..W, acconto iniziale, saldo finale, netto finale", () => {
    const r = calcolaCassa(fasi, voci, 800, 1000, { acconto_pct: 30, saldo_pct: 10 });

    // Durata totale W = 4 → 5 punti (0..4).
    expect(r.serie).toHaveLength(5);
    expect(r.serie.map((p) => p.settimana)).toEqual([0, 1, 2, 3, 4]);

    // Costi cumulati attesi.
    expect(r.serie.map((p) => p.costo_cum)).toEqual([0, 100, 200, 500, 800]);

    // Acconto iniziale = 30% di 1000 = 300 alla settimana 0.
    expect(r.serie[0].incasso_cum).toBe(300);

    // Incasso finale = prezzoCliente (acconto + corpo + saldo).
    expect(r.serie[4].incasso_cum).toBe(1000);

    // Netto finale = prezzoCliente − costoPieno = 200.
    expect(r.serie[4].netto).toBe(200);
    expect(r.serie[4].netto).toBe(1000 - 800);

    // Incassi cumulati attesi: 300 + (costo_cum/800)*600 (+100 al saldo).
    expect(r.serie.map((p) => p.incasso_cum)).toEqual([300, 375, 450, 675, 1000]);
    // Netti: incasso_cum − costo_cum.
    expect(r.serie.map((p) => p.netto)).toEqual([300, 275, 250, 175, 200]);

    // max_esposizione = minimo della serie netto (qui 175 alla settimana 3).
    const minNetto = Math.min(...r.serie.map((p) => p.netto));
    expect(r.max_esposizione).toBe(minNetto);
    expect(r.max_esposizione).toBe(175);
    expect(r.settimana_max_esposizione).toBe(3);
  });

  it("acconto 0 / saldo 0: esposizione massima negativa (minimo della serie)", () => {
    const r = calcolaCassa(fasi, voci, 800, 1000, { acconto_pct: 0, saldo_pct: 0 });
    // Senza acconto, l'incasso segue 1:1 i costi (corpo = intero prezzo).
    // incasso_cum = (costo_cum/800)*1000 → [0,125,250,625,1000].
    // netto = incasso_cum − costo_cum → [0,25,50,125,200]: nessun negativo,
    // ma il minimo è 0 alla settimana 0.
    const minNetto = Math.min(...r.serie.map((p) => p.netto));
    expect(r.max_esposizione).toBe(minNetto);
    expect(r.serie[4].incasso_cum).toBe(1000);
    expect(r.serie[4].netto).toBe(200);
  });

  it("incasso anticipato sui costi → esposizione negativa quando i costi corrono avanti", () => {
    // costoPieno alto e acconto basso: il netto va sotto zero a metà lavori.
    // A: costo 300 su sett 1,2; B: costo 100 su sett 3,4. costoPieno 1000.
    //   quota A = (300/400)*1000 = 750 (375/wk), quota B = 250 (125/wk).
    // costo_cum: [0,375,750,875,1000].
    // prezzo 1000, acconto 10% = 100, saldo 0, corpo 900.
    // incasso_durante = (costo_cum/1000)*900 → [0,337.5,675,787.5,900].
    // incasso_cum = 100 + durante → [100,437.5,775,887.5,1000].
    // netto = incasso_cum − costo_cum → [100,62.5,25,12.5,0].
    const fasi2 = [
      fase({ id: "a", inizio_offset_settimane: 0, durata_settimane: 2 }),
      fase({ id: "b", inizio_offset_settimane: 2, durata_settimane: 2 }),
    ];
    const voci2 = [
      voce({ id: "va", fase_id: "a", quantita: 1, costo_unitario: 300 }),
      voce({ id: "vb", fase_id: "b", quantita: 1, costo_unitario: 100 }),
    ];
    const r = calcolaCassa(fasi2, voci2, 1000, 1000, { acconto_pct: 10, saldo_pct: 0 });
    expect(r.serie.map((p) => p.netto)).toEqual([100, 62.5, 25, 12.5, 0]);
    expect(r.max_esposizione).toBe(0);
    expect(r.settimana_max_esposizione).toBe(4);
  });

  it("senza fasi → serie vuota, esposizione 0", () => {
    const r = calcolaCassa([], [], 1000, 1500, { acconto_pct: 30, saldo_pct: 10 });
    expect(r.serie).toEqual([]);
    expect(r.max_esposizione).toBe(0);
    expect(r.settimana_max_esposizione).toBe(0);
  });

  it("fasi senza costo → costo distribuito uniformemente su W", () => {
    // 1 fase, durata 4, nessuna voce → costoPieno 800 distribuito uniforme:
    // 200/wk → costo_cum [0,200,400,600,800].
    const r = calcolaCassa(
      [fase({ id: "a", inizio_offset_settimane: 0, durata_settimane: 4 })],
      [],
      800,
      1000,
      { acconto_pct: 0, saldo_pct: 0 },
    );
    expect(r.serie.map((p) => p.costo_cum)).toEqual([0, 200, 400, 600, 800]);
  });
});
