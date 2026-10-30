import { describe, expect, it } from "vitest";
import {
  calcolaIpotesi, confrontaIpotesi, fontiIpotesi, ipotesiDiPartenza, leggiIpotesi, mqTotali, nuovaTipologia,
  sensibilita, tempi, unitaTotali, vociIpotesi, vociPiano, type Ipotesi,
} from "@/lib/orders/generali/simulatore";
import { motivoSenzaUnita, operazioneDaIpotesi, unitaDaIpotesi } from "@/lib/orders/generali/simulatoreOperazione";
import { calcolaPianoEconomico, numeriPerInvestitori, type VocePiano } from "@/lib/orders/generali/pianoConti";
import { calcolaInvestitori, numeriDalPiano } from "@/lib/orders/generali/investitoriConti";
import { controllaSerie } from "@/lib/orders/generali/unitaSerie";

/**
 * Simulatore prima dell'acquisto: l'ipotesi diventa voci del piano e fonti, e i conti li
 * fanno pianoConti e investitoriConti. Qui si controlla la trasformazione (importi, mesi,
 * ritocchi, leve), che i numeri siano quelli dei moduli della generale, la sensibilità,
 * il confronto e cosa crea «Diventa operazione».
 */

/** Un'ipotesi semplice da contare a mente. */
const semplice = (p: Partial<Ipotesi> = {}): Ipotesi => ({
  ...ipotesiDiPartenza("sviluppo", "2027-01"),
  acquisto: 100_000,
  impostePct: 10,
  tipologie: [{ id: "app", nome: "Appartamenti", quante: 4, mq: 100, prezzoMq: 2_000, costoMq: null }],
  costoMq: 1_000,
  oneri: 20_000,
  tecniciPct: 10,
  commercializzazionePct: 5,
  imprevistiPct: 5,
  mesiPermessi: 3,
  mesiLavori: 10,
  venditeDopoLavori: 0,
  mesiVendite: 4,
  mezziPropri: 0,
  mutuo: { importo: 0, tassoPct: 0, speseIniziali: 0, rimborso: "vendite" },
  investitori: [],
  ritocchi: {},
  aggiunte: [],
  ...p,
});

const perChiave = (ip: Ipotesi) => new Map(vociIpotesi(ip).map((v) => [v.chiave, v]));

describe("ipotesi → voci del piano", () => {
  it("importi: ricavi per tipologia, costruzione al m², percentuali sulla costruzione e sui ricavi", () => {
    const v = perChiave(semplice());
    expect(v.get("vendite:app")!.importo).toBe(800_000);
    expect(v.get("acquisto")!.importo).toBe(100_000);
    expect(v.get("imposte")!.importo).toBe(10_000);
    expect(v.get("costruzione")!.importo).toBe(400_000);
    expect(v.get("oneri")!.importo).toBe(20_000);
    expect(v.get("tecnici")!.importo).toBe(40_000);
    expect(v.get("imprevisti")!.importo).toBe(20_000);
    expect(v.get("commercializzazione")!.importo).toBe(40_000);
    expect(v.get("vendite:app")!.regola).toContain("4 × 100 m²");
  });

  it("tempi: acquisto al mese 0, lavori dopo i permessi, vendite dalla fine dei lavori", () => {
    const ip = semplice();
    const v = perChiave(ip);
    expect(tempi(ip)).toEqual({ lavori: 3, vendite: 13, fineLavori: 12, fineVendite: 16 });
    expect([v.get("acquisto")!.dopoMesi, v.get("acquisto")!.durataMesi]).toEqual([0, 1]);
    expect([v.get("tecnici")!.dopoMesi, v.get("tecnici")!.durataMesi]).toEqual([0, 13]);
    expect([v.get("oneri")!.dopoMesi, v.get("oneri")!.durataMesi]).toEqual([3, 1]);
    expect([v.get("costruzione")!.dopoMesi, v.get("costruzione")!.durataMesi]).toEqual([3, 10]);
    expect([v.get("vendite:app")!.dopoMesi, v.get("vendite:app")!.durataMesi]).toEqual([13, 4]);
    expect(v.get("commercializzazione")!.dopoMesi).toBe(13);
  });

  it("le vendite possono partire prima della fine dei lavori, mai prima dell'acquisto", () => {
    expect(tempi(semplice({ venditeDopoLavori: -4 })).vendite).toBe(9);
    expect(tempi(semplice({ venditeDopoLavori: -40 })).vendite).toBe(0);
  });

  it("più tipologie: m², unità, ricavi e costo di costruzione proprio della tipologia", () => {
    const ip = semplice({
      tipologie: [
        { id: "app", nome: "Appartamenti", quante: 4, mq: 100, prezzoMq: 2_000, costoMq: null },
        { id: "box", nome: "Box", quante: 2, mq: 15, prezzoMq: 1_000, costoMq: 400 },
      ],
    });
    expect(mqTotali(ip)).toBe(430);
    expect(unitaTotali(ip)).toBe(6);
    const v = perChiave(ip);
    expect(v.get("vendite:box")!.importo).toBe(30_000);
    expect(v.get("vendite:box")!.descrizione).toBe("Vendita box");
    expect(v.get("costruzione")!.importo).toBe(400_000 + 12_000);
    expect(v.get("commercializzazione")!.importo).toBe(41_500);
  });

  it("un ritocco cambia la voce e le percentuali che ne dipendono", () => {
    const v = perChiave(semplice({ ritocchi: { costruzione: { importo: 500_000, durataMesi: 12 } } }));
    expect(v.get("costruzione")!.importo).toBe(500_000);
    expect(v.get("costruzione")!.calcolato.importo).toBe(400_000);
    expect(v.get("costruzione")!.ritoccata).toBe(true);
    expect(v.get("costruzione")!.durataMesi).toBe(12);
    expect(v.get("tecnici")!.importo).toBe(50_000);
    expect(v.get("imprevisti")!.importo).toBe(25_000);
  });

  it("le voci aggiunte a mano entrano; quelle a zero non diventano voci del piano", () => {
    const ip = semplice({
      oneri: 0,
      aggiunte: [{ id: "x", tipo: "costo", categoria: "allacci", descrizione: "Allacci", importo: 8_000, dopoMesi: 12, durataMesi: 2 }],
    });
    const voci = vociPiano(ip);
    expect(voci.find((v) => v.id === "oneri")).toBeUndefined();
    const allacci = voci.find((v) => v.id === "aggiunta:x")!;
    expect(allacci).toMatchObject({ categoria: "allacci", importo: 8_000, mese: "2028-01", durataMesi: 2 });
    expect(voci.map((v) => v.ordine)).toEqual(voci.map((_, i) => i + 1));
  });

  it("i mesi del piano si contano dal mese dell'acquisto", () => {
    const voci = vociPiano(semplice());
    expect(voci.find((v) => v.id === "acquisto")!.mese).toBe("2027-01");
    expect(voci.find((v) => v.id === "costruzione")!.mese).toBe("2027-04");
    expect(voci.find((v) => v.id === "vendite:app")!.mese).toBe("2028-02");
  });

  it("durate oltre i 120 mesi (vincolo del piano) si fermano a 120", () => {
    const v = perChiave(semplice({ mesiLavori: 200 }));
    expect(v.get("costruzione")!.durataMesi).toBe(120);
  });
});

describe("i numeri sono quelli dei moduli della generale", () => {
  it("ricavi, costi, margine e indicatori del piano economico", () => {
    const r = calcolaIpotesi(semplice());
    expect(r.numeri.ricavi).toBe(800_000);
    expect(r.numeri.costi).toBe(630_000);
    expect(r.numeri.margine).toBe(170_000);
    expect(r.numeri.marginePct).toBeCloseTo(0.2125, 6);
    expect(r.numeri.roi).toBeCloseTo(170_000 / 630_000, 6);
    expect(r.numeri.mq).toBe(400);
    expect(r.numeri.prezzoMq).toBe(2_000);
    expect(r.numeri.costoMq).toBe(1_050); // costruzione + imprevisti
    expect(r.numeri.pareggioMq).toBe(1_575);
    expect(r.numeri.durataMesi).toBe(17);
    expect(r.numeri.inizio).toBe("2027-01");
    expect(r.numeri.fine).toBe("2028-05");
    expect(r.numeri.tirProgetto).not.toBeNull();
  });

  it("coincidono con calcolaPianoEconomico e calcolaInvestitori chiamati a mano", () => {
    const ip = semplice({ mezziPropri: 200_000, mutuo: { importo: 400_000, tassoPct: 5, speseIniziali: 4_000, rimborso: "vendite" } });
    const r = calcolaIpotesi(ip);
    const piano = calcolaPianoEconomico({ oggi: "2027-01", generaleId: "x", voci: vociPiano(ip), righe: [], incassi: [], figlie: [] });
    expect(r.numeri.capitaleMassimo).toBe(piano.capitale.massimoPrevisto);
    expect(r.numeri.tirProgetto).toBe(piano.indicatori.previsto.tir);
    const conti = calcolaInvestitori({
      fonti: fontiIpotesi(ip), movimenti: [],
      numeri: numeriDalPiano(numeriPerInvestitori(piano), piano.confronto.costi), oggi: "2027-01-01",
    });
    expect(r.numeri.oneriFinanziari).toBe(conti.costoDebito.totale);
    expect(r.numeri.utileNetto).toBe(conti.utile.stima);
    expect(r.numeri.roe).toBe(conti.rendimenti.mezziPropri!.roe);
    expect(r.numeri.leva).toBe(conti.rendimenti.leva);
  });

  it("senza debito l'utile è il margine; con il mutuo cala degli interessi e il ROE sale", () => {
    const senza = calcolaIpotesi(semplice({ mezziPropri: 700_000 }));
    expect(senza.numeri.oneriFinanziari).toBe(0);
    expect(senza.numeri.utileNetto).toBe(170_000);
    const con = calcolaIpotesi(semplice({ mezziPropri: 200_000, mutuo: { importo: 500_000, tassoPct: 5, speseIniziali: 5_000, rimborso: "vendite" } }));
    expect(con.numeri.oneriFinanziari).toBeGreaterThan(5_000);
    expect(con.numeri.utileNetto).toBeCloseTo(170_000 - con.numeri.oneriFinanziari, 2);
    expect(con.numeri.roe!).toBeGreaterThan(senza.numeri.roe!);
    expect(con.numeri.leva!).toBeGreaterThan(0);
    // Il debito entra solo quando i mezzi propri sono finiti: il pareggio al m² li comprende.
    expect(con.numeri.pareggioMq).toBeCloseTo((630_000 + con.numeri.oneriFinanziari) / 400, 2);
  });

  it("un investitore a capitale divide l'utile con i mezzi propri", () => {
    const solo = calcolaIpotesi(semplice({ mezziPropri: 700_000 }));
    const insieme = calcolaIpotesi(semplice({
      mezziPropri: 350_000,
      investitori: [{ id: "i", nome: "Rossi", tipo: "capitale", importo: 350_000, tassoPct: null, quotaUtilePct: 50 }],
    }));
    const propri = insieme.conti.fonti.find((f) => f.fonte.tipo === "propri")!;
    expect(propri.rendimento.stima).toBeCloseTo(solo.numeri.utileNetto / 2, 0);
  });

  it("dice quando le fonti non coprono il picco di capitale", () => {
    const r = calcolaIpotesi(semplice({ mezziPropri: 100_000 }));
    expect(r.numeri.scoperto).toBeGreaterThan(0);
    expect(r.avvisi.some((a) => a.includes("mancano"))).toBe(true);
    expect(r.avvisi.some((a) => a.startsWith("A oggi"))).toBe(false);
  });

  it("avvisa quando l'operazione perde e quando mancano unità o mezzi propri", () => {
    const perde = calcolaIpotesi(semplice({ tipologie: [{ id: "a", nome: "A", quante: 4, mq: 100, prezzoMq: 1_000, costoMq: null }], mezziPropri: 1_000_000 }));
    expect(perde.numeri.utileNetto).toBeLessThan(0);
    expect(perde.avvisi.some((a) => a.includes("perde"))).toBe(true);
    const vuota = calcolaIpotesi(semplice({ tipologie: [] }));
    expect(vuota.numeri.mq).toBe(0);
    expect(vuota.numeri.pareggioMq).toBeNull();
    expect(vuota.avvisi.some((a) => a.includes("m²"))).toBe(true);
    expect(vuota.avvisi.some((a) => a.includes("mezzi propri"))).toBe(true);
  });

  it("le ipotesi di partenza dei due modelli guadagnano", () => {
    for (const m of ["sviluppo", "compravendita"] as const) {
      const r = calcolaIpotesi(ipotesiDiPartenza(m, "2027-01"));
      expect(r.numeri.utileNetto).toBeGreaterThan(0);
      expect(r.numeri.roe).not.toBeNull();
      expect(r.numeri.tirPropri).not.toBeNull();
    }
  });
});

describe("sensibilità", () => {
  const ip = semplice({ mezziPropri: 300_000, mutuo: { importo: 400_000, tassoPct: 5, speseIniziali: 0, rimborso: "vendite" } });
  const base = calcolaIpotesi(ip).numeri;
  const righe = new Map(sensibilita(ip, base).map((r) => [r.caso.chiave, r]));

  it("prezzi −10%: ricavi giù del 10%, commercializzazione con loro", () => {
    const r = righe.get("prezzo-10")!;
    expect(r.numeri.ricavi).toBe(720_000);
    expect(r.numeri.costi).toBe(630_000 - 4_000);
    expect(r.differenzaUtile).toBeLessThan(0);
  });

  it("costi +10%: tutto tranne acquisto e imposte", () => {
    const r = righe.get("costi+10")!;
    expect(r.numeri.costi).toBeCloseTo(110_000 + (630_000 - 110_000) * 1.1, 2);
    expect(righe.get("costi-10")!.differenzaUtile).toBeGreaterThan(0);
  });

  it("vendite 6 mesi più tardi: stessi margini, durata più lunga, più interessi", () => {
    const r = righe.get("ritardo6")!;
    expect(r.numeri.margine).toBe(base.margine);
    expect(r.numeri.durataMesi).toBe(base.durataMesi! + 6);
    expect(r.numeri.oneriFinanziari).toBeGreaterThan(base.oneriFinanziari);
    expect(r.numeri.tirProgetto!).toBeLessThan(base.tirProgetto!);
  });

  it("tasso +1%: stesso margine, più interessi", () => {
    const r = righe.get("tasso+1")!;
    expect(r.numeri.margine).toBe(base.margine);
    expect(r.numeri.oneriFinanziari).toBeGreaterThan(base.oneriFinanziari);
    expect(r.differenzaUtile).toBeCloseTo(base.oneriFinanziari - r.numeri.oneriFinanziari, 2);
  });

  it("un mese ritoccato a mano si sposta col ritardo", () => {
    const conRitocco = semplice({ ritocchi: { "vendite:app": { dopoMesi: 10 } } });
    const v = vociIpotesi(conRitocco, { ritardoVendite: 6 }).find((x) => x.chiave === "vendite:app")!;
    expect(v.dopoMesi).toBe(16);
  });
});

describe("confronto di ipotesi", () => {
  it("6 appartamenti contro 4 + 2 box: differenze dalla prima e la migliore per riga", () => {
    const sei = semplice({ tipologie: [{ id: "a", nome: "Appartamenti", quante: 6, mq: 70, prezzoMq: 2_000, costoMq: null }] });
    const misto = semplice({
      tipologie: [{ id: "a", nome: "Appartamenti", quante: 4, mq: 100, prezzoMq: 2_000, costoMq: null }, { ...nuovaTipologia(), id: "b", quante: 2 }],
    });
    const righe = confrontaIpotesi([calcolaIpotesi(sei).numeri, calcolaIpotesi(misto).numeri]);
    const unita = righe.find((r) => r.metrica.chiave === "unita")!;
    expect(unita.valori).toEqual([6, 6]);
    expect(unita.diversa).toBe(false);
    expect(unita.migliore).toBeNull();
    const ricavi = righe.find((r) => r.metrica.chiave === "ricavi")!;
    expect(ricavi.valori).toEqual([840_000, 845_000]);
    expect(ricavi.differenze).toEqual([0, 5_000]);
    expect(ricavi.migliore).toBe(1);
    const costi = righe.find((r) => r.metrica.chiave === "costi")!;
    expect(costi.migliore).toBe(costi.valori[0]! < costi.valori[1]! ? 0 : 1);
  });

  it("valori mancanti non vincono e non fanno differenza", () => {
    const a = calcolaIpotesi(semplice()).numeri;
    const b = calcolaIpotesi(semplice({ mezziPropri: 700_000 })).numeri;
    const roe = confrontaIpotesi([a, b]).find((r) => r.metrica.chiave === "roe")!;
    expect(roe.valori[0]).toBeNull();
    expect(roe.differenze).toEqual([null, null]);
    expect(roe.migliore).toBeNull();
  });
});

describe("lettura dell'ipotesi salvata", () => {
  it("un'ipotesi salvata torna uguale", () => {
    const ip = semplice({
      investitori: [{ id: "i", nome: "Bianchi", tipo: "prestito", importo: 50_000, tassoPct: 8, quotaUtilePct: null }],
      ritocchi: { costruzione: { importo: 450_000 } },
      aggiunte: [{ id: "x", tipo: "costo", categoria: "allacci", descrizione: "Allacci", importo: 8_000, dopoMesi: 12, durataMesi: 2 }],
    });
    expect(leggiIpotesi(JSON.parse(JSON.stringify(ip)), "sviluppo", "2026-10")).toEqual(ip);
  });

  it("campi mancanti o scritti male prendono i valori di partenza, senza numeri negativi", () => {
    const ip = leggiIpotesi({ acquisto: "abc", costoMq: -5, mesiVendite: 0, inizio: "2027-13-01", mutuo: { rimborso: "boh" }, ritocchi: { x: "no" } }, "compravendita", "2026-11");
    const partenza = ipotesiDiPartenza("compravendita", "2026-11");
    expect(ip.acquisto).toBe(partenza.acquisto);
    expect(ip.costoMq).toBe(0);
    expect(ip.mesiVendite).toBe(1);
    expect(ip.inizio).toBe("2026-11");
    expect(ip.mutuo.rimborso).toBe("vendite");
    expect(ip.ritocchi).toEqual({});
    expect(leggiIpotesi(null, "sviluppo", "2027-01").modello).toBe("sviluppo");
  });

  it("il tasso resta solo a chi presta e la quota solo a chi sta a capitale", () => {
    const ip = leggiIpotesi({ investitori: [{ tipo: "capitale", tassoPct: 5, quotaUtilePct: 30 }, { tipo: "prestito", tassoPct: 7, quotaUtilePct: 30 }] }, "sviluppo", "2027-01");
    expect(ip.investitori.map((i) => [i.tassoPct, i.quotaUtilePct])).toEqual([[null, 30], [7, null]]);
  });
});

describe("ipotesi → operazione", () => {
  const ip = semplice({
    mezziPropri: 200_000,
    mutuo: { importo: 400_000, tassoPct: 5, speseIniziali: 4_000, rimborso: "vendite" },
    investitori: [
      { id: "c", nome: "Rossi", tipo: "capitale", importo: 50_000, tassoPct: null, quotaUtilePct: 20 },
      { id: "p", nome: "", tipo: "prestito", importo: 30_000, tassoPct: 7, quotaUtilePct: null },
      { id: "z", nome: "Zero", tipo: "capitale", importo: 0, tassoPct: null, quotaUtilePct: null },
    ],
    tipologie: [
      { id: "a", nome: "Appartamenti", quante: 3, mq: 100, prezzoMq: 2_000, costoMq: null },
      { id: "b", nome: "Box", quante: 2, mq: 15, prezzoMq: 1_000, costoMq: 400 },
    ],
  });
  const op = operazioneDaIpotesi(ip, { nome: "  Residenza Via Roma ", conUnita: true });

  it("la generale: modello, nome pulito e valore = ricavi", () => {
    expect(op.modello).toBe("sviluppo");
    expect(op.nome).toBe("Residenza Via Roma");
    expect(op.valore).toBe(630_000);
  });

  it("le voci del piano coi mesi al primo giorno e gli stessi importi del simulatore", () => {
    const simulate = vociPiano(ip);
    expect(op.voci).toHaveLength(simulate.length);
    expect(op.voci.every((v) => /^\d{4}-\d{2}-01$/.test(v.mese))).toBe(true);
    expect(op.voci.reduce((t, v) => t + v.importo, 0)).toBeCloseTo(simulate.reduce((t, v) => t + v.importo, 0), 2);
    expect(op.voci.find((v) => v.categoria === "costruzione")).toMatchObject({ mese: "2027-04-01", durata_mesi: 10, tipo: "costo" });
    expect(op.voci.every((v) => v.importo > 0 && v.durata_mesi >= 1 && v.durata_mesi <= 120)).toBe(true);
    expect(op.voci.some((v) => v.categoria === "finanziari")).toBe(false);
  });

  it("le fonti: mezzi propri, investitori con importo, mutuo fondiario a SAL", () => {
    expect(op.fonti.map((f) => [f.tipo, f.nome, f.impegno])).toEqual([
      ["propri", "Mezzi propri", 200_000],
      ["capitale", "Rossi", 50_000],
      ["prestito", "Investitore 2", 30_000],
      ["banca", "Mutuo", 400_000],
    ]);
    const mutuo = op.fonti.find((f) => f.tipo === "banca")!;
    expect(mutuo).toMatchObject({ tasso_pct: 5, forma: "mutuo_fondiario", spese_iniziali: 4_000, rimborso: "vendite", data_inizio: "2027-01-01" });
    expect(op.fonti.find((f) => f.tipo === "capitale")).toMatchObject({ quota_utile_pct: 20, tasso_pct: null });
    expect(op.fonti.find((f) => f.tipo === "prestito")).toMatchObject({ quota_utile_pct: null, tasso_pct: 7 });
    expect(op.fonti.find((f) => f.tipo === "propri")).toMatchObject({ quota_utile_pct: null, tasso_pct: null });
  });

  it("le unità in serie: A1…A3, B1, B2 con m² e listino, e passano il controllo della serie", () => {
    expect(op.unita.map((u) => u.sigla)).toEqual(["A1", "A2", "A3", "B1", "B2"]);
    expect(op.unita[0]).toMatchObject({ tipologia: "Appartamenti", mq_commerciali: 100, prezzo_listino: 200_000, millesimi: null });
    expect(op.unita[3]).toMatchObject({ tipologia: "Box", mq_commerciali: 15, prezzo_listino: 15_000 });
    const righe = op.unita.map((u) => ({ sigla: u.sigla, edificio: "", piano: "", tipologia: u.tipologia ?? "", mq: String(u.mq_commerciali ?? ""), millesimi: "", listino: String(u.prezzo_listino ?? "") }));
    expect(controllaSerie(righe, []).errori).toBe(0);
  });

  it("senza unità se non richieste; due tipologie con la stessa iniziale hanno sigle diverse", () => {
    expect(operazioneDaIpotesi(ip, { nome: "x", conUnita: false }).unita).toEqual([]);
    const doppia = unitaDaIpotesi(semplice({
      tipologie: [
        { id: "a", nome: "Attici", quante: 1, mq: 120, prezzoMq: 3_000, costoMq: null },
        { id: "b", nome: "Appartamenti", quante: 2, mq: 80, prezzoMq: 2_500, costoMq: null },
      ],
    }));
    expect(doppia.map((u) => u.sigla)).toEqual(["A1", "B1", "B2"]);
  });

  it("oltre 100 unità non si creano in serie e il motivo lo dice", () => {
    const tante = semplice({ tipologie: [{ id: "a", nome: "Posti auto", quante: 120, mq: 12, prezzoMq: 1_000, costoMq: null }] });
    expect(motivoSenzaUnita(tante)).toContain("120 unità");
    expect(operazioneDaIpotesi(tante, { nome: "x", conUnita: true }).unita).toEqual([]);
    expect(motivoSenzaUnita(semplice({ tipologie: [] }))).toContain("Non ci sono");
    expect(motivoSenzaUnita(ip)).toBeNull();
  });

  it("l'operazione creata dà gli stessi numeri dell'ipotesi", () => {
    const voci = op.voci.map((v, i): VocePiano => ({
      id: `v${i}`, tipo: v.tipo, categoria: v.categoria as VocePiano["categoria"], descrizione: v.descrizione, importo: v.importo,
      mese: v.mese.slice(0, 7), durataMesi: v.durata_mesi, figliaId: null, categorieCosto: [], aFinire: null, nota: null, ordine: v.ordine, origineId: null,
    }));
    const piano = calcolaPianoEconomico({ oggi: "2027-01", generaleId: "g", voci, righe: [], incassi: [], figlie: [] });
    const r = calcolaIpotesi(ip);
    expect(piano.confronto.totali.margine.previsto).toBe(r.numeri.margine);
    expect(piano.capitale.massimoPrevisto).toBe(r.numeri.capitaleMassimo);
  });
});
