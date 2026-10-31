/**
 * Fusione dei frammenti e modifiche della bozza (fase 0, lotto 0.1).
 * Casi scritti con dati inventati: il repository è pubblico.
 */
import { describe, it, expect } from "vitest";
import type { Fonte, Frammento, PianoCommessa, Valore } from "../../../shared/silvio-commessa/piano.ts";
import {
  annulla, applica, fondi, pianoVuoto, spostaGiorniLavorativi, stessaFonte, stessoValore,
} from "../../../shared/silvio-commessa/fondi.ts";

const PREVENTIVO: Fonte = { tipo: "preventivo", id: "q-1", etichetta: "preventivo PR-0001", dove: "riga 3" };
const CONTRATTO: Fonte = { tipo: "contratto", id: "f-1", etichetta: "Contratto.pdf", dove: "pagina 4" };
const TESTO: Fonte = { tipo: "testo", etichetta: "testo libero" };
const PERSONA: Fonte = { tipo: "persona", etichetta: "commessa esistente" };

function frammento(fonte: Fonte, aree: Frammento["aree"], extra: Partial<Frammento> = {}): Frammento {
  return { fonte, aree, ...extra };
}
const v = (valore: unknown, fiducia = 1): Omit<Valore, "fonte"> => ({ valore, fiducia, stato: "fatto" });
const importo = (p: PianoCommessa) => p.aree.economia?.["economia.total_amount"];

describe("fondi", () => {
  it("riempie un piano vuoto e ricorda la fonte", () => {
    const p = fondi(pianoVuoto("az-1"), frammento(PREVENTIVO, {
      economia: { "economia.total_amount": v(12000) },
      cliente: { "cliente.nome": v("Cliente Prova") },
    }));
    expect(importo(p)?.valore).toBe(12000);
    expect(importo(p)?.fonte).toEqual(PREVENTIVO);
    expect(p.aree.cliente?.["cliente.nome"]?.valore).toBe("Cliente Prova");
    expect(p.fonti).toEqual([PREVENTIVO]);
    expect(p.conflitti).toEqual([]);
  });

  it("non tocca il piano che riceve", () => {
    const vuoto = pianoVuoto("az-1");
    fondi(vuoto, frammento(PREVENTIVO, { economia: { "economia.total_amount": v(1) } }));
    expect(vuoto.aree).toEqual({});
  });

  it("due fonti diverse con valori diversi: conflitto, non sceglie", () => {
    let p = fondi(pianoVuoto("az-1"), frammento(PREVENTIVO, { economia: { "economia.total_amount": v(47900) } }));
    p = fondi(p, frammento(CONTRATTO, { economia: { "economia.total_amount": v(48500) } }));
    expect(p.conflitti).toHaveLength(1);
    const c = p.conflitti[0];
    expect(c.area).toBe("economia");
    expect(c.chiave).toBe("economia.total_amount");
    // In ordine di fiducia: il contratto prima del preventivo.
    expect(c.candidati.map((x) => [x.fonte.tipo, x.valore])).toEqual([["contratto", 48500], ["preventivo", 47900]]);
    // Nel piano si vede la più fidata, segnata ⚠.
    expect(importo(p)?.valore).toBe(48500);
    expect(importo(p)?.stato).toBe("attenzione");
  });

  it("stesso valore da due fonti: niente conflitto, resta la più fidata", () => {
    let p = fondi(pianoVuoto("az-1"), frammento(TESTO, { economia: { "economia.total_amount": v(12000, 0.6) } }));
    p = fondi(p, frammento(CONTRATTO, { economia: { "economia.total_amount": v(12000.001) } }));
    expect(p.conflitti).toEqual([]);
    expect(importo(p)?.fonte.tipo).toBe("contratto");
    // E una fonte meno fidata con lo stesso valore non la scalza.
    p = fondi(p, frammento({ tipo: "stima", etichetta: "stima di Silvio" }, { economia: { "economia.total_amount": v(12000) } }));
    expect(importo(p)?.fonte.tipo).toBe("contratto");
  });

  it("una terza fonte si aggiunge al conflitto aperto, e i doppioni si fondono", () => {
    let p = fondi(pianoVuoto("az-1"), frammento(PREVENTIVO, { economia: { "economia.total_amount": v(47900) } }));
    p = fondi(p, frammento(TESTO, { economia: { "economia.total_amount": v(48500) } }));
    p = fondi(p, frammento(CONTRATTO, { economia: { "economia.total_amount": v(48500) } }));
    expect(p.conflitti).toHaveLength(1);
    // 48.500 lo dicono testo e contratto: resta il contratto, un candidato solo.
    expect(p.conflitti[0].candidati.map((x) => x.fonte.tipo)).toEqual(["contratto", "preventivo"]);
    p = fondi(p, frammento({ tipo: "offerta", id: "o-1", etichetta: "offerta ditta" }, { economia: { "economia.total_amount": v(50000) } }));
    expect(p.conflitti[0].candidati.map((x) => x.valore)).toEqual([48500, 47900, 50000]);
  });

  it("rileggere la stessa fonte sostituisce la lettura vecchia, senza conflitto", () => {
    let p = fondi(pianoVuoto("az-1"), frammento(CONTRATTO, { economia: { "economia.total_amount": v(48000) } }));
    p = fondi(p, frammento(CONTRATTO, { economia: { "economia.total_amount": v(48500) } }));
    expect(p.conflitti).toEqual([]);
    expect(importo(p)?.valore).toBe(48500);
    expect(p.fonti).toHaveLength(1);
  });

  it("se la rilettura mette d'accordo le fonti, il conflitto si chiude", () => {
    let p = fondi(pianoVuoto("az-1"), frammento(PREVENTIVO, { economia: { "economia.total_amount": v(47900) } }));
    p = fondi(p, frammento(CONTRATTO, { economia: { "economia.total_amount": v(48500) } }));
    p = fondi(p, frammento(CONTRATTO, { economia: { "economia.total_amount": v(47900) } }));
    expect(p.conflitti).toEqual([]);
    expect(importo(p)?.fonte.tipo).toBe("contratto");
    expect(importo(p)?.stato).toBe("fatto");
  });

  it("un valore scritto da una persona non si sovrascrive mai, neanche col contratto", () => {
    let p = fondi(pianoVuoto("az-1", "ord-1"), frammento(PERSONA, { fasi: { "fasi.work_start_date": v("2026-11-09") } }));
    p = fondi(p, frammento(CONTRATTO, { fasi: { "fasi.work_start_date": v("2026-12-01") } }));
    expect(p.aree.fasi?.["fasi.work_start_date"]?.valore).toBe("2026-11-09");
    expect(p.aree.fasi?.["fasi.work_start_date"]?.fonte.tipo).toBe("persona");
    expect(p.conflitti).toEqual([]);
  });

  it("un valore di una persona che arriva dopo chiude il conflitto e vince", () => {
    let p = fondi(pianoVuoto("az-1"), frammento(PREVENTIVO, { economia: { "economia.total_amount": v(47900) } }));
    p = fondi(p, frammento(CONTRATTO, { economia: { "economia.total_amount": v(48500) } }));
    p = fondi(p, frammento(PERSONA, { economia: { "economia.total_amount": v(48000) } }));
    expect(p.conflitti).toEqual([]);
    expect(importo(p)?.valore).toBe(48000);
  });

  it("le liste si confrontano per intero", () => {
    const fasi = [{ name: "Demolizioni", start_date: "2026-11-09" }, { name: "Impianti" }];
    let p = fondi(pianoVuoto("az-1"), frammento(PREVENTIVO, { fasi: { "fasi.order_work_phases": v(fasi) } }));
    p = fondi(p, frammento({ tipo: "computo", id: "c-1", etichetta: "computo" }, {
      fasi: { "fasi.order_work_phases": v([{ start_date: "2026-11-09", name: "Demolizioni" }, { name: "Impianti" }]) },
    }));
    expect(p.conflitti).toEqual([]);
    p = fondi(p, frammento(CONTRATTO, { fasi: { "fasi.order_work_phases": v([{ name: "Demolizioni" }]) } }));
    expect(p.conflitti).toHaveLength(1);
  });

  it("chiavi e aree sconosciute non entrano, ma lasciano un avviso", () => {
    const p = fondi(pianoVuoto("az-1"), {
      fonte: TESTO,
      aree: {
        economia: { "economia.inventata": v(1), "fasi.work_start_date": v("2026-11-09") },
        // Un lettore AI può inventare un'area: il tipo non lo impedisce a runtime.
        giardino: { "giardino.siepe": v(1) },
      } as Frammento["aree"],
      avvisi: ["pagina 7 illeggibile"],
    });
    expect(p.aree.economia ?? {}).toEqual({});
    expect(p.avvisi).toEqual([
      "testo libero: pagina 7 illeggibile",
      "testo libero: «economia.inventata» non è una variabile dell'area economia, ignorata",
      "testo libero: «fasi.work_start_date» non è una variabile dell'area economia, ignorata",
      "testo libero: l'area «giardino» non esiste, ignorata",
    ]);
  });

  it("un valore può portare una fonte sua, più precisa di quella del frammento", () => {
    const pagina: Fonte = { ...CONTRATTO, dove: "pagina 9", citazione: "penale di 100 € al giorno" };
    const p = fondi(pianoVuoto("az-1"), frammento(CONTRATTO, {
      economia: { "economia.total_amount": { ...v(48500), fonte: pagina } },
    }));
    expect(importo(p)?.fonte.dove).toBe("pagina 9");
  });
});

describe("confronti", () => {
  it("stessoValore: centesimi, spazi, oggetti in ordine diverso", () => {
    expect(stessoValore(100, 100.004)).toBe(true);
    expect(stessoValore(100, 100.01)).toBe(false);
    expect(stessoValore(" Monza ", "Monza")).toBe(true);
    expect(stessoValore({ a: 1, b: [1, 2] }, { b: [1, 2], a: 1 })).toBe(true);
    expect(stessoValore([1, 2], [2, 1])).toBe(false);
    expect(stessoValore(null, 0)).toBe(false);
  });

  it("stessaFonte: per id, o per etichetta se l'id manca", () => {
    expect(stessaFonte(PREVENTIVO, { ...PREVENTIVO, etichetta: "altro nome" })).toBe(true);
    expect(stessaFonte(PREVENTIVO, { ...PREVENTIVO, id: "q-2" })).toBe(false);
    expect(stessaFonte(TESTO, { tipo: "testo", etichetta: "testo libero" })).toBe(true);
    expect(stessaFonte(TESTO, { tipo: "documento", etichetta: "testo libero" })).toBe(false);
  });
});

describe("applica e annulla", () => {
  const base = () => {
    let p = fondi(pianoVuoto("az-1"), frammento(PREVENTIVO, {
      economia: { "economia.total_amount": v(47900) },
      fasi: {
        "fasi.work_start_date": v("2026-11-09"),
        "fasi.work_end_date": v("2026-11-20"),
        "fasi.order_work_phases": v([
          { name: "Demolizioni", start_date: "2026-11-09", end_date: "2026-11-11" },
          { name: "Impianti", start_date: "2026-11-12", end_date: "2026-11-16" },
          { name: "Finiture", start_date: "2026-11-17", end_date: "2026-11-20" },
        ]),
      },
      persone: { "persone.squadra": v(["dip-1", "dip-2"]) },
    }));
    p = fondi(p, frammento(CONTRATTO, { economia: { "economia.total_amount": v(48500) } }));
    return p;
  };

  it("cambia_valore: diventa della persona, chiude il conflitto, e si annulla", () => {
    const p0 = base();
    const { piano: p1, storia } = applica(p0, { tipo: "cambia_valore", area: "economia", chiave: "economia.total_amount", valore: 48000 });
    expect(importo(p1)?.valore).toBe(48000);
    expect(importo(p1)?.fonte.tipo).toBe("persona");
    expect(p1.conflitti).toEqual([]);
    expect(storia).toHaveLength(1);

    const indietro = annulla(p1, storia);
    expect(indietro.piano.aree).toEqual(p0.aree);
    expect(indietro.piano.conflitti).toEqual(p0.conflitti);
    expect(indietro.storia).toEqual([]);
  });

  it("dopo cambia_valore un frammento nuovo non rimette il valore di Silvio", () => {
    const { piano } = applica(base(), { tipo: "cambia_valore", area: "economia", chiave: "economia.total_amount", valore: 48000 });
    const dopo = fondi(piano, frammento({ tipo: "offerta", id: "o-1", etichetta: "offerta" }, { economia: { "economia.total_amount": v(1) } }));
    expect(importo(dopo)?.valore).toBe(48000);
  });

  it("scegli_fonte: tiene il candidato scelto, la ⓘ porta ancora al documento", () => {
    const { piano } = applica(base(), { tipo: "scegli_fonte", area: "economia", chiave: "economia.total_amount", fonte: "preventivo" });
    expect(importo(piano)?.valore).toBe(47900);
    expect(importo(piano)?.fonte).toMatchObject({ tipo: "persona", id: "q-1", dove: "riga 3", etichetta: "scelto da te: preventivo PR-0001" });
    expect(importo(piano)?.stato).toBe("fatto");
    expect(piano.conflitti).toEqual([]);
  });

  it("scegli_fonte senza conflitto o con una fonte assente: errore chiaro", () => {
    const p = base();
    expect(() => applica(p, { tipo: "scegli_fonte", area: "fasi", chiave: "fasi.work_start_date", fonte: "contratto" }))
      .toThrow("non c'è niente da scegliere");
    expect(() => applica(p, { tipo: "scegli_fonte", area: "economia", chiave: "economia.total_amount", fonte: "computo" }))
      .toThrow("nessun valore dalla fonte computo");
  });

  it("togli e aggiungi sulle liste, togli tutto resta come «tolto da te»", () => {
    let b = applica(base(), { tipo: "togli", area: "persone", chiave: "persone.squadra", indice: 0 });
    expect(b.piano.aree.persone?.["persone.squadra"]?.valore).toEqual(["dip-2"]);
    b = applica(b.piano, { tipo: "aggiungi", area: "persone", chiave: "persone.squadra", valore: "dip-3" }, b.storia);
    expect(b.piano.aree.persone?.["persone.squadra"]?.valore).toEqual(["dip-2", "dip-3"]);
    b = applica(b.piano, { tipo: "togli", area: "persone", chiave: "persone.squadra" }, b.storia);
    expect(b.piano.aree.persone?.["persone.squadra"]).toMatchObject({ valore: null, fonte: { tipo: "persona" } });
    expect(b.storia).toHaveLength(3);

    // Un frammento dopo non rimette la squadra tolta.
    const dopo = fondi(b.piano, frammento(TESTO, { persone: { "persone.squadra": v(["dip-9"]) } }));
    expect(dopo.aree.persone?.["persone.squadra"]?.valore).toBeNull();

    // Tre annulla riportano alla lista di partenza.
    let a = annulla(b.piano, b.storia);
    a = annulla(a.piano, a.storia);
    a = annulla(a.piano, a.storia);
    expect(a.piano.aree.persone?.["persone.squadra"]?.valore).toEqual(["dip-1", "dip-2"]);
    expect(annulla(a.piano, a.storia)).toEqual(a);
  });

  it("aggiungi su una variabile vuota crea la lista; su un valore singolo è un errore", () => {
    const { piano } = applica(pianoVuoto("az-1"), { tipo: "aggiungi", area: "persone", chiave: "persone.venditori", valore: "v-1" });
    expect(piano.aree.persone?.["persone.venditori"]?.valore).toEqual(["v-1"]);
    expect(() => applica(base(), { tipo: "aggiungi", area: "economia", chiave: "economia.total_amount", valore: 1 }))
      .toThrow("non è un elenco");
    expect(() => applica(base(), { tipo: "togli", area: "persone", chiave: "persone.squadra", indice: 5 }))
      .toThrow("non ha un elemento 5");
  });

  it("una chiave fuori dal registro o nell'area sbagliata non passa", () => {
    expect(() => applica(base(), { tipo: "cambia_valore", area: "economia", chiave: "fasi.work_start_date", valore: 1 }))
      .toThrow("non è una variabile dell'area economia");
  });

  it("sposta_date: tutto di una settimana lavorativa, saltando i fine settimana", () => {
    const { piano, storia } = applica(base(), { tipo: "sposta_date", giorniLavorativi: 5 });
    const fasi = piano.aree.fasi!;
    expect(fasi["fasi.work_start_date"].valore).toBe("2026-11-16");
    expect(fasi["fasi.work_end_date"].valore).toBe("2026-11-27");
    expect(fasi["fasi.order_work_phases"].valore).toEqual([
      { name: "Demolizioni", start_date: "2026-11-16", end_date: "2026-11-18" },
      { name: "Impianti", start_date: "2026-11-19", end_date: "2026-11-23" },
      { name: "Finiture", start_date: "2026-11-24", end_date: "2026-11-27" },
    ]);
    expect(fasi["fasi.work_start_date"].fonte.tipo).toBe("persona");
    expect(annulla(piano, storia).piano.aree.fasi).toEqual(base().aree.fasi);
  });

  it("sposta_date da una fase: le precedenti e l'inizio restano", () => {
    const { piano } = applica(base(), { tipo: "sposta_date", giorniLavorativi: 2, daFase: "Impianti" });
    const fasi = piano.aree.fasi!;
    expect(fasi["fasi.work_start_date"].valore).toBe("2026-11-09");
    expect((fasi["fasi.order_work_phases"].valore as { start_date: string }[]).map((f) => f.start_date))
      .toEqual(["2026-11-09", "2026-11-16", "2026-11-19"]);
    expect(fasi["fasi.work_end_date"].valore).toBe("2026-11-24");
    expect(() => applica(base(), { tipo: "sposta_date", giorniLavorativi: 2, daFase: "Tetto" })).toThrow("«Tetto» non c'è");
  });

  it("sposta_date di zero giorni non lascia passi nella storia", () => {
    const p = base();
    expect(applica(p, { tipo: "sposta_date", giorniLavorativi: 0 })).toEqual({ piano: p, storia: [] });
  });

  it("annulla rimette solo le variabili del passo: un frammento arrivato dopo resta", () => {
    const b = applica(base(), { tipo: "cambia_valore", area: "economia", chiave: "economia.vat_rate", valore: 10 });
    const conAltro = fondi(b.piano, frammento(TESTO, { cantiere: { "cantiere.indirizzo": v("Via Inventata 1, Monza") } }));
    const a = annulla(conAltro, b.storia);
    expect(a.piano.aree.economia?.["economia.vat_rate"]).toBeUndefined();
    expect(a.piano.aree.cantiere?.["cantiere.indirizzo"]?.valore).toBe("Via Inventata 1, Monza");
    expect(a.piano.conflitti).toHaveLength(1);
  });
});

describe("giorni lavorativi", () => {
  it("salta sabato e domenica, avanti e indietro", () => {
    expect(spostaGiorniLavorativi("2026-11-13", 1)).toBe("2026-11-16"); // venerdì → lunedì
    expect(spostaGiorniLavorativi("2026-11-16", -1)).toBe("2026-11-13");
    expect(spostaGiorniLavorativi("2026-11-09", 10)).toBe("2026-11-23");
    expect(spostaGiorniLavorativi("non è una data", 3)).toBe("non è una data");
  });
});
