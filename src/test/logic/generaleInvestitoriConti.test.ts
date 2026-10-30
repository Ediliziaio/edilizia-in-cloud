import { describe, expect, it } from "vitest";
import {
  calcolaInvestitori, capitaleGiorni, fineMese, fineOperazione, giorniTra, interessiSu,
  movimentiAmmessi, numeriDalPiano, spiegaRegola,
  type Fonte, type Movimento, type NumeriOperazione,
} from "@/lib/orders/generali/investitoriConti";
import { contaVendite, leggiFonti, leggiMovimenti, leggiRendiconti } from "@/lib/orders/generali/investitoriLettura";
import { avanzamentoMedio, datiRendiconto, nomeFileRendiconto } from "@/lib/orders/generali/investitoriRendiconto";
import type { RiepilogoGenerale } from "@/lib/orders/commesseGenerali";
import type { NumeriInvestitori } from "@/lib/orders/generali/pianoConti";

const fonte = (f: Partial<Fonte> & Pick<Fonte, "id" | "tipo">): Fonte => ({
  nome: f.id, soggetto: "persona", clienteId: null, email: null, impegno: 0, quotaUtilePct: null,
  tassoPct: null, dataInizio: null, scadenza: null, nota: null, ordine: 0, ...f,
});
let n = 0;
const mov = (fonteId: string, tipo: Movimento["tipo"], data: string, importo: number): Movimento => ({ id: `m${++n}`, fonteId, tipo, data, importo, nota: null });

const numeri = (o: Partial<NumeriOperazione> = {}): NumeriOperazione => ({
  marginePrevisto: 100_000, margineStima: 100_000, capitaleMassimo: 0, meseCapitaleMassimo: null,
  capitaleInvestitoOggi: 0, inizio: "2027-01", fine: "2027-12", interessiNelPiano: true, ...o,
});

describe("date e capitale nel tempo", () => {
  it("conta i giorni e la fine del mese (anche bisestile)", () => {
    expect(giorniTra("2027-01-01", "2027-01-31")).toBe(30);
    expect(giorniTra("2027-02-01", "2027-01-01")).toBe(0);
    expect(fineMese("2028-02")).toBe("2028-02-29");
    expect(fineMese("2027-02")).toBe("2027-02-28");
    expect(fineMese("2027-12")).toBe("2027-12-31");
  });

  it("euro × giorni: il versamento conta dal suo giorno, il rimborso toglie dal suo", () => {
    const m = [mov("a", "versamento", "2027-01-01", 1000), mov("a", "rimborso", "2027-01-11", 400)];
    // 1000 × 20 − 400 × 10
    expect(capitaleGiorni(m, "2027-01-21")).toBe(16_000);
    // Le distribuzioni non toccano il capitale.
    expect(capitaleGiorni([...m, mov("a", "distribuzione", "2027-01-05", 999)], "2027-01-21")).toBe(16_000);
    // Prima di ogni versamento: zero.
    expect(capitaleGiorni(m, "2026-12-01")).toBe(0);
  });

  it("interessi semplici annui", () => {
    expect(interessiSu(100_000 * 365, 5)).toBe(5000);
  });

  it("la fine dell'operazione: dal piano, altrimenti la scadenza più lontana, altrimenti oggi", () => {
    expect(fineOperazione({ fine: "2028-06" }, [], "2027-01-01")).toBe("2028-06-30");
    expect(fineOperazione(null, [fonte({ id: "b", tipo: "banca", scadenza: "2029-03-31" })], "2027-01-01")).toBe("2029-03-31");
    expect(fineOperazione(null, [], "2027-01-01")).toBe("2027-01-01");
  });

  it("a capitale si distribuisce l'utile, a prestito si pagano interessi", () => {
    expect(movimentiAmmessi("capitale")).toContain("distribuzione");
    expect(movimentiAmmessi("capitale")).not.toContain("interessi");
    expect(movimentiAmmessi("banca")).toContain("interessi");
  });
});

describe("prestiti e banca", () => {
  it("interessi previsti, maturati, stima e quanto spetta", () => {
    const f = fonte({ id: "p", tipo: "prestito", impegno: 100_000, tassoPct: 10, dataInizio: "2027-01-01", scadenza: "2028-01-01" });
    const m = [mov("p", "versamento", "2027-01-01", 100_000), mov("p", "interessi", "2027-07-01", 2000)];
    const c = calcolaInvestitori({ fonti: [f], movimenti: m, numeri: numeri(), oggi: "2027-07-02" }).fonti[0];
    expect(c.capitale).toEqual({ previsto: 100_000, adOggi: 100_000, aFinire: 0, stima: 100_000 });
    // Un anno intero al 10%.
    expect(c.rendimento.previsto).toBe(10_000);
    expect(c.rendimento.stima).toBe(10_000);
    expect(c.rendimento.adOggi).toBe(2000);
    expect(c.rendimento.aFinire).toBe(8000);
    // 182 giorni.
    expect(c.interessiMaturati).toBeCloseTo((100_000 * 0.1 * 182) / 365, 2);
    expect(c.spettaAFine).toBe(108_000);
    expect(c.rendimentoPct).toBeCloseTo(0.1, 5);
    expect(c.regola).toContain("10% annuo");
  });

  it("un rimborso a metà ferma gli interessi su quella parte", () => {
    const f = fonte({ id: "b", tipo: "banca", impegno: 200_000, tassoPct: 4, dataInizio: "2027-01-01", scadenza: "2028-01-01" });
    const m = [mov("b", "versamento", "2027-01-01", 200_000), mov("b", "rimborso", "2027-07-02", 100_000)];
    const c = calcolaInvestitori({ fonti: [f], movimenti: m, numeri: numeri(), oggi: "2027-08-01" }).fonti[0];
    const atteso = interessiSu(200_000 * 182 + 100_000 * 183, 4);
    expect(c.rendimento.stima).toBe(atteso);
    expect(c.capitaleDentro).toBe(100_000);
    expect(c.spettaAFine).toBe(100_000 + atteso);
  });

  it("l'impegno non ancora erogato si conta da oggi", () => {
    const f = fonte({ id: "b", tipo: "banca", impegno: 100_000, tassoPct: 5, dataInizio: "2027-01-01", scadenza: "2027-12-31" });
    const c = calcolaInvestitori({ fonti: [f], movimenti: [mov("b", "versamento", "2027-01-01", 40_000)], numeri: numeri(), oggi: "2027-07-01" }).fonti[0];
    expect(c.daVersare).toBe(60_000);
    expect(c.capitale.aFinire).toBe(60_000);
    expect(c.rendimento.stima).toBe(interessiSu(40_000 * 364 + 60_000 * 183, 5));
  });

  it("senza tasso: capitale indietro, nessun interesse, con un avviso", () => {
    const r = calcolaInvestitori({ fonti: [fonte({ id: "p", tipo: "prestito", nome: "Zio", impegno: 10_000 })], movimenti: [], numeri: numeri(), oggi: "2027-03-01" });
    expect(r.fonti[0].rendimento.stima).toBe(0);
    expect(r.fonti[0].spettaAFine).toBe(10_000);
    expect(r.avvisi.join(" ")).toContain("Zio: manca il tasso");
  });
});

describe("ripartizione dell'utile", () => {
  it("pro quota del capitale e del tempo: chi entra prima prende di più", () => {
    // Stesso capitale, A entra a gennaio, B a luglio: A resta dentro il doppio (circa).
    const fonti = [fonte({ id: "A", tipo: "capitale", impegno: 100_000 }), fonte({ id: "B", tipo: "capitale", impegno: 100_000 })];
    const m = [mov("A", "versamento", "2027-01-01", 100_000), mov("B", "versamento", "2027-07-02", 100_000)];
    const r = calcolaInvestitori({ fonti, movimenti: m, numeri: numeri({ margineStima: 90_000 }), oggi: "2027-08-01" });
    const [a, b] = r.fonti;
    const pa = 100_000 * giorniTra("2027-01-01", "2027-12-31");
    const pb = 100_000 * giorniTra("2027-07-02", "2027-12-31");
    expect(a.quota!.stima).toBeCloseTo(pa / (pa + pb), 6);
    expect(a.rendimento.stima + b.rendimento.stima).toBeCloseTo(90_000, 0);
    expect(a.rendimento.stima).toBeGreaterThan(b.rendimento.stima);
    expect(a.spettaAFine).toBeCloseTo(100_000 + a.rendimento.stima, 2);
    expect(a.regola).toContain("Pro quota");
  });

  it("le quote fisse vengono prima, il resto pro quota; senza pro quota resta all'azienda", () => {
    const fonti = [
      fonte({ id: "F", tipo: "capitale", impegno: 50_000, quotaUtilePct: 30 }),
      fonte({ id: "P", tipo: "propri", impegno: 200_000 }),
    ];
    const m = [mov("F", "versamento", "2027-01-01", 50_000), mov("P", "versamento", "2027-01-01", 200_000)];
    const r = calcolaInvestitori({ fonti, movimenti: m, numeri: numeri(), oggi: "2027-02-01" });
    expect(r.fonti.find((c) => c.fonte.id === "F")!.rendimento.stima).toBe(30_000);
    expect(r.fonti.find((c) => c.fonte.id === "P")!.rendimento.stima).toBe(70_000);
    expect(r.quotaAzienda.stima).toBe(0);

    const solo = calcolaInvestitori({ fonti: [fonti[0]], movimenti: m, numeri: numeri(), oggi: "2027-02-01" });
    expect(solo.quotaAzienda.stima).toBeCloseTo(0.7, 9);
    expect(spiegaRegola(solo).join(" ")).toContain("rimane all'azienda");
  });

  it("quote fisse oltre il 100%: ridotte in proporzione, con un avviso", () => {
    const fonti = [fonte({ id: "X", tipo: "capitale", quotaUtilePct: 80 }), fonte({ id: "Y", tipo: "capitale", quotaUtilePct: 80 })];
    const r = calcolaInvestitori({ fonti, movimenti: [], numeri: numeri(), oggi: "2027-02-01" });
    expect(r.fonti[0].rendimento.stima).toBe(50_000);
    expect(r.fonti[1].rendimento.stima).toBe(50_000);
    expect(r.avvisi[0]).toContain("sommano a 160%");
  });

  it("gli interessi si tolgono dall'utile solo se il piano non li ha già", () => {
    const fonti = [
      fonte({ id: "P", tipo: "propri", impegno: 100_000 }),
      fonte({ id: "B", tipo: "banca", impegno: 100_000, tassoPct: 10, dataInizio: "2027-01-01", scadenza: "2028-01-01" }),
    ];
    const m = [mov("P", "versamento", "2027-01-01", 100_000), mov("B", "versamento", "2027-01-01", 100_000)];
    const nel = calcolaInvestitori({ fonti, movimenti: m, numeri: numeri(), oggi: "2027-02-01" });
    expect(nel.utile.stima).toBe(100_000);
    const fuori = calcolaInvestitori({ fonti, movimenti: m, numeri: numeri({ interessiNelPiano: false }), oggi: "2027-02-01" });
    expect(fuori.utile.interessiTolti.stima).toBe(10_000);
    expect(fuori.utile.stima).toBe(90_000);
    expect(fuori.fonti.find((c) => c.fonte.id === "P")!.rendimento.stima).toBe(90_000);
    expect(spiegaRegola(fuori)[0]).toContain("meno gli interessi");
  });

  it("previsto sull'impegno, stima sui versamenti veri; il già distribuito è «ad oggi»", () => {
    const fonti = [fonte({ id: "A", tipo: "capitale", impegno: 100_000 }), fonte({ id: "B", tipo: "capitale", impegno: 100_000 })];
    const m = [mov("A", "versamento", "2027-01-01", 100_000), mov("B", "versamento", "2027-01-01", 100_000), mov("A", "distribuzione", "2027-06-01", 10_000)];
    const r = calcolaInvestitori({ fonti, movimenti: m, numeri: numeri({ marginePrevisto: 80_000, margineStima: 60_000 }), oggi: "2027-07-01" });
    const a = r.fonti[0];
    expect(a.rendimento.previsto).toBe(40_000);
    expect(a.rendimento.adOggi).toBe(10_000);
    expect(a.rendimento.aFinire).toBe(20_000);
    expect(a.rendimento.stima).toBe(30_000);
    expect(a.spettaAFine).toBe(120_000);
  });

  it("in perdita la quota di perdita riduce il capitale, mai sotto zero", () => {
    const f = fonte({ id: "A", tipo: "capitale", impegno: 50_000 });
    const r = calcolaInvestitori({ fonti: [f], movimenti: [mov("A", "versamento", "2027-01-01", 50_000)], numeri: numeri({ margineStima: -80_000 }), oggi: "2027-02-01" });
    expect(r.fonti[0].rendimento.stima).toBe(-80_000);
    expect(r.fonti[0].spettaAFine).toBe(0);
  });

  it("nessun capitale né impegno: parti uguali tra i pro quota", () => {
    const fonti = [fonte({ id: "A", tipo: "capitale" }), fonte({ id: "B", tipo: "propri" })];
    const r = calcolaInvestitori({ fonti, movimenti: [], numeri: numeri(), oggi: "2027-02-01" });
    expect(r.fonti.map((c) => c.rendimento.stima)).toEqual([50_000, 50_000]);
  });

  it("senza piano non c'è utile da dividere, e lo dice", () => {
    const r = calcolaInvestitori({ fonti: [fonte({ id: "A", tipo: "capitale", impegno: 1 })], movimenti: [], numeri: null, oggi: "2027-02-01" });
    expect(r.utile.stima).toBe(0);
    expect(r.scoperto).toBe(0);
    expect(r.avvisi.join(" ")).toContain("piano economico non c'è ancora");
  });
});

describe("copertura del capitale massimo", () => {
  it("divide per fonte e avvisa se le fonti non coprono il picco", () => {
    const fonti = [
      fonte({ id: "P", tipo: "propri", impegno: 100_000 }),
      fonte({ id: "I", tipo: "prestito", impegno: 150_000, tassoPct: 6 }),
      fonte({ id: "C", tipo: "capitale", impegno: 50_000 }),
      fonte({ id: "B", tipo: "banca", impegno: 300_000, tassoPct: 4 }),
    ];
    const m = [mov("P", "versamento", "2027-01-01", 100_000), mov("B", "versamento", "2027-02-01", 120_000)];
    const r = calcolaInvestitori({ fonti, movimenti: m, numeri: numeri({ capitaleMassimo: 700_000, meseCapitaleMassimo: "2027-09", capitaleInvestitoOggi: 260_000 }), oggi: "2027-03-01" });
    expect(r.copertura).toEqual([
      { gruppo: "propri", nome: "Mezzi propri", impegno: 100_000, dentro: 100_000 },
      { gruppo: "investitori", nome: "Investitori", impegno: 200_000, dentro: 0 },
      { gruppo: "banca", nome: "Banca", impegno: 300_000, dentro: 120_000 },
    ]);
    expect(r.totali.impegno).toBe(600_000);
    expect(r.scoperto).toBe(100_000);
    expect(r.avvisi.join(" ")).toMatch(/mancano 100\.000\s€ al picco/);
    expect(r.avvisi.join(" ")).toContain("settembre 2027");
    expect(r.avvisi.join(" ")).toContain("la sta anticipando l'azienda");
  });

  it("un versamento oltre l'impegno conta come impegno e si segnala", () => {
    const r = calcolaInvestitori({
      fonti: [fonte({ id: "A", tipo: "capitale", nome: "Anna", impegno: 10_000 })],
      movimenti: [mov("A", "versamento", "2027-01-01", 15_000)],
      numeri: numeri({ capitaleMassimo: 15_000 }), oggi: "2027-02-01",
    });
    expect(r.scoperto).toBe(0);
    expect(r.avvisi.join(" ")).toContain("Anna ha versato");
  });
});

describe("dal piano", () => {
  const n: NumeriInvestitori = {
    capitaleMassimoImpegnato: 500_000, meseCapitaleMassimo: "2027-09", capitaleInvestitoOggi: 120_000,
    previsto: { ricavi: 1_000_000, costi: 800_000, margine: 200_000 },
    stimaFinale: { ricavi: 950_000, costi: 820_000, margine: 130_000 },
    tirAnnuo: 0.15, durataMesi: 24,
    flussoMensile: [{ mese: "2027-03", entrate: 0, uscite: 1, netto: -1, cumulato: -1 }, { mese: "2027-01", entrate: 0, uscite: 1, netto: -1, cumulato: -2 }],
  };
  it("prende margine, capitale e mesi; gli interessi sono nel piano solo con una voce di oneri finanziari", () => {
    const o = numeriDalPiano(n, [{ categoria: "costruzione", previsto: 5, stima: 5 }]);
    expect(o).toMatchObject({ marginePrevisto: 200_000, margineStima: 130_000, capitaleMassimo: 500_000, inizio: "2027-01", fine: "2027-03", interessiNelPiano: false });
    expect(numeriDalPiano(n, [{ categoria: "finanziari", previsto: 0, stima: 10 }]).interessiNelPiano).toBe(true);
    expect(numeriDalPiano({ ...n, flussoMensile: [] }, []).fine).toBeNull();
  });
});

describe("lettura", () => {
  it("legge fonti e movimenti senza fidarsi della forma", () => {
    expect(leggiFonti([{ id: "a", tipo: "capitale", nome: " ", impegno: "1000.5", quota_utile_pct: "25", data_inizio: "2027-01-01T00:00:00" }, { id: "b", tipo: "boh" }, null])).toEqual([
      { id: "a", tipo: "capitale", nome: "Fonte senza nome", soggetto: "persona", clienteId: null, email: null, impegno: 1000.5, quotaUtilePct: 25, tassoPct: null, dataInizio: "2027-01-01", scadenza: null, nota: null, ordine: 0 },
    ]);
    expect(leggiFonti({})).toEqual([]);
    expect(leggiMovimenti([{ id: "m", fonte_id: "a", tipo: "versamento", data: "2027-02-03", importo: "10" }, { id: "x", fonte_id: "a", tipo: "versamento", data: null }])).toHaveLength(1);
    expect(leggiRendiconti([{ id: "r", stato: "strano" }])[0].stato).toBe("in_invio");
  });

  it("conta le unità per stato, senza le divise e senza le figlie di altri", () => {
    const v = contaVendite([
      { order_id: "u1", stato_vendita: "rogitata" },
      { order_id: "u2", stato_vendita: "compromesso" },
      { order_id: "u3", stato_vendita: "libera", divisa_il: "2027-01-01" },
      { order_id: "altra", stato_vendita: "rogitata" },
      { order_id: "u4" },
    ], ["u1", "u2", "u3", "u4"]);
    expect(v).toEqual({ totale: 3, perStato: { libera: 1, prenotata: 0, compromesso: 1, rogitata: 1 } });
    expect(contaVendite(null, ["u1"])).toBeNull();
  });
});

describe("rendiconto", () => {
  const riepilogo: RiepilogoGenerale = {
    generale: { id: "g", codice: "C-1", nome: "Residenza Via Roma", cliente: null, clienteId: null, modello: "sviluppo", creataIl: null, valore: null },
    figlie: [
      { id: "u1", codice: null, nome: "A1", stato: null, statoNome: null, statoColore: null, indirizzo: null, inizio: null, fine: null, avanzamento: 100, importo: 300_000, eseguito: null, fatturato: null, incassato: 50_000, costo: null, margine: null },
      { id: "u2", codice: null, nome: "A2", stato: null, statoNome: null, statoColore: null, indirizzo: null, inizio: null, fine: null, avanzamento: 0, importo: 100_000, eseguito: null, fatturato: null, incassato: null, costo: null, margine: null },
    ],
    permessi: { importi: true, costi: true, margini: true },
  };

  it("avanzamento pesato sull'importo, semplice senza importi", () => {
    expect(avanzamentoMedio(riepilogo.figlie)).toBe(75);
    expect(avanzamentoMedio(riepilogo.figlie.map((f) => ({ ...f, importo: null as number | null })))).toBe(50);
    expect(avanzamentoMedio([])).toBeNull();
  });

  it("mette insieme i numeri dell'investitore", () => {
    const conti = calcolaInvestitori({
      fonti: [fonte({ id: "A", tipo: "capitale", nome: "Mario Rossi", impegno: 100_000 })],
      movimenti: [mov("A", "versamento", "2027-01-01", 100_000)],
      numeri: numeri(), oggi: "2027-02-01",
    });
    const d = datiRendiconto({
      oggi: "2027-02-01", riepilogo, numeri: null, conti, fonteId: "A", vendite: null, unitaNome: "Unità",
      azienda: { nome: "Edil", partitaIva: null, indirizzo: null, email: null, telefono: null, logo: null }, note: "  ",
    })!;
    expect(d.investitore).toEqual({ nome: "Mario Rossi", tipo: "capitale", tipoNome: "Investitore a capitale", email: null });
    expect(d.incassato).toBe(50_000);
    expect(d.avanzamento).toBe(75);
    expect(d.conto.rendimentoNome).toBe("Utile");
    expect(d.conto.spettaAFine).toBe(200_000);
    expect(d.economia).toBeNull();
    expect(d.note).toBeNull();
    expect(d.regole.length).toBeGreaterThan(1);
    expect(datiRendiconto({ oggi: "x", riepilogo, numeri: null, conti, fonteId: "nessuna", vendite: null, unitaNome: "", azienda: d.azienda })).toBeNull();
    expect(nomeFileRendiconto(d)).toBe("Rendiconto Residenza Via Roma - Mario Rossi 2027-02-01.pdf");
  });

  it("senza permesso sugli importi non mostra gli incassi", () => {
    const conti = calcolaInvestitori({ fonti: [fonte({ id: "A", tipo: "propri" })], movimenti: [], numeri: null, oggi: "2027-02-01" });
    const d = datiRendiconto({
      oggi: "2027-02-01", riepilogo: { ...riepilogo, permessi: { importi: false, costi: false, margini: true } }, numeri: null, conti, fonteId: "A",
      vendite: null, unitaNome: "Unità", azienda: { nome: "Edil", partitaIva: null, indirizzo: null, email: null, telefono: null, logo: null },
    })!;
    expect(d.incassato).toBeNull();
  });
});
