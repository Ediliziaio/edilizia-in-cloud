/**
 * I numeri dell'appalto: la copertura dei costi, la tendenza del margine e i
 * totali. La prova che conta è che il margine percentuale si calcoli sul ricavo
 * di cui si conosce il costo — è l'errore che faceva uscire 28,9% dove il
 * margine vero era 30,6%.
 */
import { describe, it, expect } from "vitest";
import {
  coperturaCosti,
  tendenzaMargine,
  totaliConti,
  tendenzePerCommittente,
  periodoNumeri,
  meseBreve,
  type ContiCommittente,
} from "@/lib/appalto/numeri";

const conti = (o: Partial<ContiCommittente>): ContiCommittente => ({
  committente_id: "k1", nome: "Impresa Alfa", cantieri: 1, righe: 5,
  rendicontato: 10000, in_bozza: 0, costo: 7000, margine: 3000,
  margine_pct: 30, rendicontato_con_costo: 10000, righe_senza_costo: 0,
  rendiconti: 1, chiuso_in_rendiconti: 10000, da_rendicontare: 0,
  ritenuta_trattenuta: 400, fatturato: 0, incassato: 0, da_incassare: 0, ...o,
});

describe("coperturaCosti", () => {
  it("dice su quanta parte del rendicontato il costo si conosce", () => {
    expect(coperturaCosti({ rendicontato: 18734, rendicontato_con_costo: 17654 })).toBe(94);
    expect(coperturaCosti({ rendicontato: 10000, rendicontato_con_costo: 10000 })).toBe(100);
  });

  it("senza nessun costo noto non inventa una percentuale", () => {
    expect(coperturaCosti({ rendicontato: 10000, rendicontato_con_costo: null })).toBeNull();
    expect(coperturaCosti({ rendicontato: 0, rendicontato_con_costo: 0 })).toBeNull();
  });
});

describe("tendenzaMargine", () => {
  const serie = (pct: Array<number | null>) =>
    pct.map((p, i) => ({ mese: `2026-${String(i + 1).padStart(2, "0")}-01`, margine_pct: p }));

  it("un margine che scende da mesi si chiama peggiora", () => {
    const t = tendenzaMargine(serie([34, 33, 32, 29, 28, 27]));
    expect(t.tendenza).toBe("peggiora");
    expect(t.delta).toBeLessThan(0);
    expect(t.mesi).toBe(6);
  });

  it("un margine che sale si chiama migliora", () => {
    expect(tendenzaMargine(serie([24, 25, 26, 30, 31, 32])).tendenza).toBe("migliora");
  });

  it("un oscillare di un punto è rumore, non una tendenza", () => {
    expect(tendenzaMargine(serie([30, 31, 30, 29, 30, 31])).tendenza).toBe("stabile");
  });

  it("un solo mese strano non fa dire «peggiora»", () => {
    // Cinque mesi a 30 e uno a 20: l'ultimo mese crolla, la media no.
    expect(tendenzaMargine(serie([30, 30, 30, 30, 30, 20])).tendenza).toBe("stabile");
  });

  it("con meno di quattro mesi calcolabili la risposta onesta è «non si sa»", () => {
    expect(tendenzaMargine(serie([30, 28, 26])).tendenza).toBe("non-si-sa");
    expect(tendenzaMargine(serie([30, null, null, 26, null])).tendenza).toBe("non-si-sa");
    expect(tendenzaMargine([]).tendenza).toBe("non-si-sa");
  });

  it("i mesi senza margine non entrano nel conto, e l'ordine non dipende da come arrivano", () => {
    const disordinati = [
      { mese: "2026-06-01", margine_pct: 26 },
      { mese: "2026-01-01", margine_pct: 34 },
      { mese: "2026-03-01", margine_pct: null },
      { mese: "2026-05-01", margine_pct: 27 },
      { mese: "2026-02-01", margine_pct: 33 },
      { mese: "2026-04-01", margine_pct: 28 },
    ];
    const t = tendenzaMargine(disordinati);
    expect(t.mesi).toBe(5);
    expect(t.tendenza).toBe("peggiora");
  });
});

describe("tendenzePerCommittente", () => {
  const riga = (nome: string, id: string, mese: string, pct: number | null) =>
    ({ committente_id: id, nome, mese, margine_pct: pct });

  it("legge ogni committente per conto suo: uno fermo e uno che scende non fanno «stabile»", () => {
    const serie = [
      ...[30, 31, 30, 29, 30, 31].map((p, i) => riga("Rossi", "k1", `2026-0${i + 1}-01`, p)),
      ...[18, 16, 13, 10, 11, 12].map((p, i) => riga("Brianza", "k2", `2026-0${i + 1}-01`, p)),
    ];
    const t = tendenzePerCommittente(serie);
    expect(t).toHaveLength(2);
    // Ordinati dal peggiore: chi scende di piu' sta davanti.
    expect(t[0].nome).toBe("Brianza");
    expect(t[0].tendenza).toBe("peggiora");
    expect(t.find((x) => x.nome === "Rossi")!.tendenza).toBe("stabile");
  });

  it("un committente con due soli mesi non riceve una tendenza inventata", () => {
    const t = tendenzePerCommittente([
      riga("Alpine", "k3", "2026-09-01", 39),
      riga("Alpine", "k3", "2026-10-01", 22),
    ]);
    expect(t[0].tendenza).toBe("non-si-sa");
  });

  it("serie vuota, nessuna tendenza", () => {
    expect(tendenzePerCommittente([])).toEqual([]);
  });
});

describe("totaliConti", () => {
  it("somma quello che si somma", () => {
    const t = totaliConti([
      conti({ rendicontato: 10000, margine: 3000, rendicontato_con_costo: 10000, da_rendicontare: 500, ritenuta_trattenuta: 400, fatturato: 9600, da_incassare: 9600 }),
      conti({ committente_id: "k2", rendicontato: 5000, margine: 1000, rendicontato_con_costo: 5000, da_rendicontare: 0, ritenuta_trattenuta: 0, fatturato: 5000, da_incassare: 0 }),
    ]);
    expect(t.rendicontato).toBe(15000);
    expect(t.margine).toBe(4000);
    expect(t.margine_pct).toBe(26.7); // 4000 / 15000
    expect(t.da_rendicontare).toBe(500);
    expect(t.ritenuta_trattenuta).toBe(400);
    expect(t.fatturato).toBe(14600);
    expect(t.da_incassare).toBe(9600);
  });

  it("la percentuale usa il ricavo di cui si conosce il costo, non il totale", () => {
    // 18.734 rendicontati, ma il costo si conosce su 17.654: il margine è
    // 5.405, cioè il 30,6% — non il 28,9% che uscirebbe dividendo per il totale.
    const t = totaliConti([
      conti({ rendicontato: 18734, margine: 5405, rendicontato_con_costo: 17654, righe_senza_costo: 2 }),
    ]);
    expect(t.margine_pct).toBe(30.6);
  });

  it("se nessuno sa i costi il margine resta vuoto, non zero", () => {
    const t = totaliConti([conti({ margine: null, costo: null, rendicontato_con_costo: null })]);
    expect(t.margine).toBeNull();
    expect(t.margine_pct).toBeNull();
    expect(t.rendicontato).toBe(10000);
  });

  it("nessun committente, nessun numero inventato", () => {
    const t = totaliConti([]);
    expect(t.rendicontato).toBe(0);
    expect(t.margine).toBeNull();
  });
});

describe("periodoNumeri", () => {
  it("«quest'anno» è l'anno di calendario", () => {
    expect(periodoNumeri("anno", new Date(2026, 9, 28))).toEqual({ dal: "2026-01-01", al: "2026-12-31" });
  });

  it("«dodici mesi» copre dodici mesi veri, anche a gennaio e a dicembre", () => {
    expect(periodoNumeri("dodici-mesi", new Date(2026, 9, 28)).dal).toBe("2025-11-01");
    expect(periodoNumeri("dodici-mesi", new Date(2026, 0, 15)).dal).toBe("2025-02-01");
    expect(periodoNumeri("dodici-mesi", new Date(2026, 11, 3)).dal).toBe("2026-01-01");
  });

  it("la finestra arriva a fine mese, non a oggi: il rendiconto di ottobre finisce il 31", () => {
    // Il 29/10 il rendiconto 01/10 → 31/10 deve starci dentro, con la sua
    // ritenuta e la sua fattura.
    expect(periodoNumeri("dodici-mesi", new Date(2026, 9, 29)).al).toBe("2026-10-31");
    expect(periodoNumeri("dodici-mesi", new Date(2026, 10, 4)).al).toBe("2026-11-30");
    expect(periodoNumeri("dodici-mesi", new Date(2028, 1, 10)).al).toBe("2028-02-29");
  });

  it("«tutto» non mette limiti", () => {
    expect(periodoNumeri("tutto")).toEqual({ dal: null, al: null });
  });
});

describe("meseBreve", () => {
  it("scrive il mese in italiano", () => {
    expect(meseBreve("2026-10-01")).toBe("ott 2026");
    expect(meseBreve("2026-01-01")).toBe("gen 2026");
  });
});
