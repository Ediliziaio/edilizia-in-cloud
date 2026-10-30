import { describe, expect, it } from "vitest";
import {
  calcolaInvestitori, capitaleGiorni, interessiSu, meseDopo, movimentiAmmessi, numeriDalPiano, rimborsiPianificati, tirDaFlussi,
  type Fonte, type Movimento, type NumeriOperazione,
} from "@/lib/orders/generali/investitoriConti";
import type { NumeriInvestitori } from "@/lib/orders/generali/pianoConti";

/**
 * Banca, mutuo e altri finanziamenti come fonti piene: costo del debito, piani di rimborso,
 * erogazioni secondo il fabbisogno del piano, rendimento dei mezzi propri contro quello
 * dell'operazione (leva) e scenari sul debito.
 */
const fonte = (f: Partial<Fonte> & Pick<Fonte, "id" | "tipo">): Fonte => ({
  nome: f.id, soggetto: "persona", clienteId: null, email: null, impegno: 0, quotaUtilePct: null,
  tassoPct: null, dataInizio: null, scadenza: null, nota: null, ordine: 0, ...f,
});
let n = 0;
const mov = (fonteId: string, tipo: Movimento["tipo"], data: string, importo: number): Movimento => ({ id: `d${++n}`, fonteId, tipo, data, importo, nota: null });
const numeri = (o: Partial<NumeriOperazione> = {}): NumeriOperazione => ({
  marginePrevisto: 200_000, margineStima: 200_000, capitaleMassimo: 1_000_000, meseCapitaleMassimo: "2027-06",
  capitaleInvestitoOggi: 0, inizio: "2027-01", fine: "2027-12", interessiNelPiano: false, ...o,
});

describe("piani di rimborso", () => {
  it("a rate: quote mensili uguali che sommano al capitale, l'ultima alla scadenza", () => {
    const r = rimborsiPianificati("rate", 120_000, "2027-01-01", "2027-12-31", "2028-06-30");
    expect(r).toHaveLength(12);
    expect(r.reduce((t, x) => t + x.importo, 0)).toBeCloseTo(120_000, 2);
    expect(r[0]).toEqual({ tipo: "rimborso", data: "2027-01-31", importo: 10_000 });
    expect(r[11].data).toBe("2027-12-31");
  });
  it("tutto alla scadenza, o con le vendite a fine operazione", () => {
    expect(rimborsiPianificati("scadenza", 50, "2027-01-01", "2027-06-30", "2028-01-31")).toEqual([{ tipo: "rimborso", data: "2027-06-30", importo: 50 }]);
    expect(rimborsiPianificati("vendite", 50, "2027-01-01", "2029-06-30", "2028-01-31")).toEqual([{ tipo: "rimborso", data: "2028-01-31", importo: 50 }]);
    expect(rimborsiPianificati("rate", 0, "2027-01-01", "2027-06-30", "2028-01-31")).toEqual([]);
  });
  it("a rate gli interessi sono circa la metà che tutto alla scadenza", () => {
    const base = { tipo: "banca" as const, impegno: 120_000, tassoPct: 5, dataInizio: "2027-01-01", scadenza: "2027-12-31" };
    const m = [mov("B", "versamento", "2027-01-01", 120_000)];
    const tutto = calcolaInvestitori({ fonti: [fonte({ id: "B", ...base })], movimenti: m, numeri: numeri(), oggi: "2027-01-02" }).fonti[0];
    const rate = calcolaInvestitori({ fonti: [fonte({ id: "B", ...base, rimborso: "rate" })], movimenti: m, numeri: numeri(), oggi: "2027-01-02" }).fonti[0];
    expect(tutto.rendimento.stima).toBe(interessiSu(120_000 * 364, 5));
    expect(rate.rendimento.stima / tutto.rendimento.stima).toBeGreaterThan(0.5);
    expect(rate.rendimento.stima / tutto.rendimento.stima).toBeLessThan(0.6);
    expect(rate.rendimento.previsto).toBeCloseTo(rate.rendimento.stima, -2);
    expect(rate.regola).toContain("a rate mensili");
  });
});

describe("movimenti del debito", () => {
  it("l'accollo all'acquirente toglie capitale come un rimborso, solo su banca e finanziamenti", () => {
    expect(capitaleGiorni([{ tipo: "versamento", data: "2027-01-01", importo: 100 }, { tipo: "accollo", data: "2027-01-11", importo: 40 }], "2027-01-21")).toBe(100 * 20 - 40 * 10);
    expect(movimentiAmmessi("banca")).toEqual(expect.arrayContaining(["accollo", "spese", "interessi"]));
    expect(movimentiAmmessi("prestito")).not.toContain("accollo");
    expect(movimentiAmmessi("finanziamento")).toContain("accollo");
    const c = calcolaInvestitori({
      fonti: [fonte({ id: "M", tipo: "banca", impegno: 300_000, tassoPct: 4, dataInizio: "2027-01-01", scadenza: "2030-12-31", rimborso: "vendite" })],
      movimenti: [mov("M", "versamento", "2027-01-01", 300_000), mov("M", "accollo", "2027-06-01", 100_000)],
      numeri: numeri(), oggi: "2027-07-01",
    }).fonti[0];
    expect(c.capitaleDentro).toBe(200_000);
    expect(c.rimborsato).toBe(100_000);
    // Con le vendite il resto si chiude a fine operazione, non alla scadenza del mutuo.
    expect(c.proiezione.find((p) => p.tipo === "rimborso")).toEqual({ tipo: "rimborso", data: "2027-12-31", importo: 200_000 });
  });

  it("le spese entrano nel costo del debito, con il costo annuo effettivo", () => {
    const r = calcolaInvestitori({
      fonti: [fonte({ id: "B", tipo: "banca", impegno: 100_000, tassoPct: 5, speseIniziali: 2000, dataInizio: "2027-01-01", scadenza: "2027-12-31" })],
      movimenti: [mov("B", "versamento", "2027-01-01", 100_000), mov("B", "spese", "2027-01-01", 1500)],
      numeri: numeri(), oggi: "2027-02-01",
    });
    const b = r.fonti[0];
    expect(b.spese).toEqual({ previsto: 2000, adOggi: 1500, aFinire: 500, stima: 2000 });
    expect(r.costoDebito.spese.stima).toBe(2000);
    expect(r.costoDebito.totale).toBe(arrotonda(b.rendimento.stima + 2000));
    // 5% di interessi più 2% di spese su un anno (quasi).
    expect(b.costoAnnuo!).toBeCloseTo(0.07, 2);
    // L'utile da dividere perde interessi e spese.
    expect(r.utile.interessiTolti.stima).toBe(r.costoDebito.totale);
    // Il costo mese per mese torna col totale degli interessi.
    const mensili = r.costoDebito.mensile;
    expect(mensili[0].mese).toBe("2027-01");
    expect(mensili.reduce((t, m) => t + m.interessi, 0)).toBeCloseTo(b.rendimento.stima, 0);
    expect(mensili.reduce((t, m) => t + m.spese, 0)).toBeCloseTo(2000, 2);
    expect(mensili[0].reale).toBe(true);
    expect(mensili[11].reale).toBe(false);
  });

  it("avvisa se un finanziamento scade prima della fine dell'operazione", () => {
    const r = calcolaInvestitori({
      fonti: [fonte({ id: "F", tipo: "finanziamento", nome: "Fido", impegno: 50_000, tassoPct: 7, scadenza: "2027-06-30" })],
      movimenti: [], numeri: numeri(), oggi: "2027-02-01",
    });
    expect(r.avvisi.join(" ")).toContain("Fido scade il 30/06/2027, prima della fine");
  });
});

describe("erogazioni secondo il fabbisogno del piano", () => {
  const fabbisogno = [
    { mese: "2027-01", importo: 100_000 },
    { mese: "2027-03", importo: 250_000 },
    { mese: "2027-06", importo: 400_000 },
    { mese: "2027-09", importo: 100_000 },
  ];
  const fonti = [
    fonte({ id: "B", tipo: "banca", impegno: 500_000, tassoPct: 6, dataInizio: "2027-01-01", scadenza: "2028-12-31" }),
    fonte({ id: "P", tipo: "propri", impegno: 150_000 }),
  ];

  it("prima i mezzi propri, poi la banca, e solo quanto serve", () => {
    const r = calcolaInvestitori({ fonti, movimenti: [], numeri: numeri({ fabbisogno, capitaleMassimo: 400_000 }), oggi: "2027-01-01" });
    const p = r.fonti.find((c) => c.fonte.id === "P")!;
    const b = r.fonti.find((c) => c.fonte.id === "B")!;
    expect(p.proiezione.filter((x) => x.tipo === "versamento")).toEqual([
      { tipo: "versamento", data: "2027-01-01", importo: 100_000 },
      { tipo: "versamento", data: "2027-03-01", importo: 50_000 },
    ]);
    expect(b.proiezione.filter((x) => x.tipo === "versamento")).toEqual([
      { tipo: "versamento", data: "2027-03-01", importo: 100_000 },
      { tipo: "versamento", data: "2027-06-01", importo: 150_000 },
    ]);
    expect(b.daVersare).toBe(500_000);
    expect(b.daUsare).toBe(250_000);
    expect(b.capitale.aFinire).toBe(250_000);
  });

  it("la composizione nel tempo segue i prelievi e mostra il fabbisogno", () => {
    const r = calcolaInvestitori({ fonti, movimenti: [], numeri: numeri({ fabbisogno, capitaleMassimo: 400_000 }), oggi: "2027-01-01" });
    const per = new Map(r.composizione.map((m) => [m.mese, m]));
    expect(per.get("2027-01")).toMatchObject({ propri: 100_000, investitori: 0, debito: 0, fabbisogno: 100_000, reale: true });
    expect(per.get("2027-03")).toMatchObject({ propri: 150_000, debito: 100_000, fabbisogno: 250_000 });
    expect(per.get("2027-06")).toMatchObject({ propri: 150_000, debito: 250_000, reale: false });
    // I mezzi propri tornano a fine operazione, il mutuo alla sua scadenza.
    expect(per.get("2028-01")).toMatchObject({ propri: 0, debito: 250_000 });
    expect(r.composizione[r.composizione.length - 1].mese).toBe("2028-12");
  });
});

describe("rendimento: mezzi propri contro operazione", () => {
  it("TIR da flussi datati: 100 oggi, 110 fra un anno = 10%", () => {
    expect(tirDaFlussi([{ data: "2027-01-15", importo: -100 }, { data: "2028-01-15", importo: 110 }])).toBeCloseTo(0.1, 6);
    expect(tirDaFlussi([{ data: "2027-01-15", importo: -100 }])).toBeNull();
    expect(meseDopo("2027-12")).toBe("2028-01");
    expect(meseDopo("2027-01", -1)).toBe("2026-12");
  });

  it("con un debito che costa meno del progetto, i mezzi propri rendono di più (leva positiva)", () => {
    const fonti = [
      fonte({ id: "P", tipo: "propri", impegno: 300_000, dataInizio: "2027-01-01" }),
      fonte({ id: "B", tipo: "banca", impegno: 700_000, tassoPct: 4, dataInizio: "2027-01-01", scadenza: "2027-12-31" }),
    ];
    const m = [mov("P", "versamento", "2027-01-01", 300_000), mov("B", "versamento", "2027-01-01", 700_000)];
    const r = calcolaInvestitori({ fonti, movimenti: m, numeri: numeri({ tirProgetto: 0.2 }), oggi: "2027-02-01" });
    const { progetto, mezziPropri, leva } = r.rendimenti;
    expect(progetto.roi).toBeCloseTo(0.2, 6);
    expect(progetto.tir).toBe(0.2);
    const interessi = interessiSu(700_000 * 364, 4);
    expect(mezziPropri!.utile).toBeCloseTo(200_000 - interessi, 2);
    expect(mezziPropri!.roe).toBeCloseTo((200_000 - interessi) / 300_000, 6);
    expect(leva!).toBeGreaterThan(0.25);
    expect(mezziPropri!.tir!).toBeGreaterThan(0.4);
    // Il rendimento di ciascuno: la banca il suo 4% circa.
    expect(r.fonti.find((c) => c.fonte.id === "B")!.tir!).toBeCloseTo(0.04, 2);
  });

  it("se il piano ha già gli oneri finanziari, il margine del progetto li rimette", () => {
    const r = calcolaInvestitori({
      fonti: [fonte({ id: "P", tipo: "propri", impegno: 100 })], movimenti: [],
      numeri: numeri({ interessiNelPiano: true, oneriNelPiano: { previsto: 30_000, stima: 25_000 }, margineStima: 175_000 }), oggi: "2027-02-01",
    });
    expect(r.rendimenti.progetto.margine).toBe(200_000);
    expect(r.utile.stima).toBe(175_000);
  });

  it("senza mezzi propri non c'è un ROE da mostrare", () => {
    const r = calcolaInvestitori({ fonti: [fonte({ id: "C", tipo: "capitale", impegno: 1 })], movimenti: [], numeri: numeri(), oggi: "2027-02-01" });
    expect(r.rendimenti.mezziPropri).toBeNull();
    expect(r.rendimenti.leva).toBeNull();
  });
});

describe("scenari sul debito", () => {
  const fonti = [
    fonte({ id: "P", tipo: "propri", impegno: 300_000, dataInizio: "2027-01-01" }),
    fonte({ id: "B", tipo: "banca", impegno: 700_000, tassoPct: 4, dataInizio: "2027-01-01", scadenza: "2027-12-31" }),
  ];
  const m = [mov("P", "versamento", "2027-01-01", 300_000), mov("B", "versamento", "2027-01-01", 500_000)];

  it("tasso +1%: il debito costa di più e i mezzi propri rendono meno", () => {
    const base = calcolaInvestitori({ fonti, movimenti: m, numeri: numeri(), oggi: "2027-02-01" });
    const piu = calcolaInvestitori({ fonti, movimenti: m, numeri: numeri(), oggi: "2027-02-01", scenario: { tassoPunti: 1, debitoPct: 0 } });
    expect(piu.costoDebito.interessi.stima / base.costoDebito.interessi.stima).toBeCloseTo(5 / 4, 6);
    expect(piu.rendimenti.mezziPropri!.roe!).toBeLessThan(base.rendimenti.mezziPropri!.roe!);
    expect(piu.fonti.find((c) => c.fonte.id === "B")!.fonte.tassoPct).toBe(5);
  });

  it("mutuo più basso: si apre un buco sul picco di esposizione", () => {
    const meno = calcolaInvestitori({ fonti, movimenti: m, numeri: numeri(), oggi: "2027-02-01", scenario: { tassoPunti: 0, debitoPct: -30 } });
    expect(meno.fonti.find((c) => c.fonte.id === "B")!.fonte.impegno).toBe(490_000);
    // L'erogato (500.000) resta: l'impegno conta come il più alto dei due.
    expect(meno.totali.impegno).toBe(800_000);
    expect(meno.scoperto).toBe(200_000);
  });
});

describe("dal piano: fabbisogno, oneri e TIR", () => {
  it("il fabbisogno è il cumulato negativo della cassa", () => {
    const n: NumeriInvestitori = {
      capitaleMassimoImpegnato: 300, meseCapitaleMassimo: "2027-02", capitaleInvestitoOggi: 0,
      previsto: { ricavi: 0, costi: 0, margine: 0 }, stimaFinale: { ricavi: 0, costi: 0, margine: 0 }, tirAnnuo: 0.12, durataMesi: 3,
      flussoMensile: [
        { mese: "2027-01", entrate: 0, uscite: 100, netto: -100, cumulato: -100 },
        { mese: "2027-02", entrate: 0, uscite: 200, netto: -200, cumulato: -300 },
        { mese: "2027-03", entrate: 500, uscite: 0, netto: 500, cumulato: 200 },
      ],
    };
    const o = numeriDalPiano(n, [{ categoria: "finanziari", previsto: 10, stima: 12 }, { categoria: "finanziari", previsto: 5, stima: 0 }]);
    expect(o.fabbisogno).toEqual([{ mese: "2027-01", importo: 100 }, { mese: "2027-02", importo: 300 }, { mese: "2027-03", importo: 0 }]);
    expect(o.oneriNelPiano).toEqual({ previsto: 15, stima: 12 });
    expect(o.tirProgetto).toBe(0.12);
  });
});

const arrotonda = (x: number) => Math.round(x * 100) / 100;
