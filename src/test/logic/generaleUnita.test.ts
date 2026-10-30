import { describe, expect, it } from "vitest";
import {
  bloccoCambioStato, erroriCambioStato, etichettaPiano, leggiElencoUnita, ordinePiano, prezzoProposto,
  raggruppaTabellone, requisitiStato, tipiMovimentoAmmessi, type DatiCambioStato, type ElencoUnita, type MovimentoUnita, type UnitaGenerale,
} from "@/lib/orders/generali/unita";
import {
  avvisoGaranzie, completaDivisione, contiUnita, criterioRiparto, pagamentiUnita, proponiDivisione, riepilogoVendite, ripartisci, type ParteDivisione,
} from "@/lib/orders/generali/unitaConti";
import { controllaSerie, generaSigle, incollaInTabella, isIncollaDaFoglio, leggiIncolla, rigaVuota } from "@/lib/orders/generali/unitaSerie";

/**
 * Modulo «Unità e vendite» della commessa generale (30/10/2026): stati di vendita, pagamenti,
 * ripartizione dei costi comuni, margine per unità, divisione, serie da Excel.
 */
const unita = (over: Partial<UnitaGenerale> = {}): UnitaGenerale => ({
  orderId: over.sigla ? `o-${over.sigla}` : "o-A1",
  codice: null,
  nome: "A1",
  scheda: true,
  id: over.sigla ? `u-${over.sigla}` : "u-A1",
  sigla: "A1",
  edificio: null,
  piano: null,
  tipologia: null,
  mq: null,
  millesimi: null,
  listino: null,
  trattato: null,
  rogito: null,
  provvigione: null,
  stato: "libera",
  dataPrenotazione: null,
  dataCompromesso: null,
  rogitoPrevisto: null,
  dataRogito: null,
  acquirenteId: null,
  acquirente: null,
  agenzia: null,
  note: null,
  origineId: null,
  divisaIl: null,
  movimenti: [],
  importoCommessa: null,
  costoDiretto: 0,
  ...over,
});

const mov = (tipo: MovimentoUnita["tipo"], importo: number | null, id = `${tipo}-${importo}`): MovimentoUnita => ({ id, tipo, importo, data: "2026-10-30", descrizione: null });

const permessi = { importi: true, costi: true, margini: true, modifica: true };
const elenco = (lista: UnitaGenerale[], over: Partial<ElencoUnita> = {}): ElencoUnita => ({
  modello: "sviluppo", costiGenerale: 0, unita: lista, permessi, ...over,
});

describe("lettura dell'elenco", () => {
  it("legge figlie con e senza scheda, e i permessi", () => {
    const e = leggiElencoUnita({
      modello: "compravendita",
      costi_comuni: "1200.50",
      permessi: { importi: true, costi: false, margini: true, modifica: false },
      figlie: [
        { order_id: "a", codice: "O-1", nome: "A1 — Appartamento", importo: 300000, costo: 1000,
          unita: { id: "ua", sigla: "A1", stato: "compromesso", mq_commerciali: "95.50", prezzo_listino: 300000, prezzo_trattato: 290000,
            movimenti: [{ id: "m", tipo: "caparra", importo: 30000, data: "2026-10-01" }, { id: "x", tipo: "boh", importo: 1 }] } },
        { order_id: "b", codice: "O-2", nome: "Bilocale", importo: 180000, costo: null, unita: null },
        { codice: "senza id" },
      ],
    })!;
    expect(e.modello).toBe("compravendita");
    expect(e.costiGenerale).toBe(1200.5);
    expect(e.permessi).toEqual({ importi: true, costi: false, margini: true, modifica: false });
    expect(e.unita).toHaveLength(2);
    expect(e.unita[0]).toMatchObject({ sigla: "A1", stato: "compromesso", mq: 95.5, trattato: 290000, scheda: true, costoDiretto: 1000 });
    expect(e.unita[0].movimenti).toEqual([{ id: "m", tipo: "caparra", importo: 30000, data: "2026-10-01", descrizione: null }]);
    // Senza scheda: libera, sigla dal codice, listino dall'importo della commessa.
    expect(e.unita[1]).toMatchObject({ scheda: false, sigla: "O-2", stato: "libera", listino: 180000, id: null });
  });

  it("una risposta storta non è un elenco", () => {
    expect(leggiElencoUnita(null)).toBeNull();
    expect(leggiElencoUnita({ figlie: "no" })).toBeNull();
  });
});

describe("stati di vendita", () => {
  it("ogni stato chiede solo il suo", () => {
    expect(requisitiStato("libera")).toMatchObject({ acquirente: false, prezzo: "nessuno", caparra: false, saldo: false });
    expect(requisitiStato("prenotata")).toMatchObject({ acquirente: true, prezzo: "facoltativo", caparra: true, saldo: false });
    expect(requisitiStato("compromesso")).toMatchObject({ acquirente: true, prezzo: "obbligatorio", caparra: true, rogitoPrevisto: true });
    expect(requisitiStato("rogitata")).toMatchObject({ acquirente: true, prezzo: "obbligatorio", caparra: false, saldo: true });
  });

  it("il prezzo proposto è quello che userebbe il database", () => {
    const u: Pick<UnitaGenerale, "listino" | "trattato" | "rogito"> = { listino: 300000, trattato: null, rogito: null };
    expect(prezzoProposto(u, "prenotata")).toBeNull();
    expect(prezzoProposto(u, "compromesso")).toBe(300000);
    expect(prezzoProposto({ ...u, trattato: 290000 }, "rogitata")).toBe(290000);
  });

  it("non si rimette in vendita un'unità con dei pagamenti, né si torna indietro col saldo", () => {
    const pagata = unita({ stato: "rogitata", movimenti: [mov("caparra", 10), mov("saldo", 100)] });
    expect(bloccoCambioStato(pagata, "libera")).toMatch(/pagamenti registrati/);
    expect(bloccoCambioStato(pagata, "compromesso")).toMatch(/saldo del rogito/);
    expect(bloccoCambioStato(pagata, "rogitata")).toBeNull();
    expect(bloccoCambioStato(unita({ divisaIl: "2026-10-30" }), "prenotata")).toMatch(/divisa/);
    expect(bloccoCambioStato(unita({ stato: "prenotata" }), "libera")).toBeNull();
  });

  it("dice cosa manca prima di confermare", () => {
    const libera = unita({ listino: null });
    const vuoto: DatiCambioStato = { acquirenteId: null, data: null, prezzo: null, caparra: null, saldo: null, rogitoPrevisto: null };
    expect(erroriCambioStato(libera, "prenotata", vuoto, true)).toEqual(["Scegli l'acquirente."]);
    expect(erroriCambioStato(libera, "compromesso", { ...vuoto, acquirenteId: "c" }, true)).toEqual(["Scrivi il prezzo pattuito nel compromesso."]);
    // Col listino il prezzo c'è già; chi non vede gli importi non deve scriverlo.
    expect(erroriCambioStato(unita({ listino: 250000 }), "compromesso", { ...vuoto, acquirenteId: "c" }, true)).toEqual([]);
    expect(erroriCambioStato(libera, "rogitata", { ...vuoto, acquirenteId: "c" }, false)).toEqual([]);
    expect(erroriCambioStato(libera, "prenotata", { ...vuoto, acquirenteId: "c", caparra: -1 }, true)).toEqual(["La caparra non può essere negativo."]);
  });

  it("i pagamenti si registrano dopo la prenotazione, il saldo solo al rogito", () => {
    expect(tipiMovimentoAmmessi("libera")).toEqual([]);
    expect(tipiMovimentoAmmessi("compromesso")).toEqual(["caparra", "acconto", "permuta"]);
    expect(tipiMovimentoAmmessi("rogitata")).toContain("saldo");
  });
});

describe("tabellone", () => {
  it("i piani si ordinano come in cantiere", () => {
    const piani = ["2", "S1", "T", "Attico", "1", "S2", "Rialzato", "seminterrato", "terzo"];
    expect([...piani].sort((a, b) => ordinePiano(a) - ordinePiano(b))).toEqual(["S2", "S1", "seminterrato", "T", "Rialzato", "1", "2", "terzo", "Attico"]);
    expect(etichettaPiano("1")).toBe("1° piano");
    expect(etichettaPiano("PT")).toBe("Piano terra");
    expect(etichettaPiano(null)).toBe("Piano non indicato");
  });

  it("per edificio, piani dall'alto, sigle in ordine; le unità divise non ci sono", () => {
    const g = raggruppaTabellone([
      unita({ sigla: "A10", edificio: "A", piano: "1" }),
      unita({ sigla: "A2", edificio: "A", piano: "1" }),
      unita({ sigla: "A1", edificio: "A", piano: "T" }),
      unita({ sigla: "B1", edificio: "B", piano: "T", divisaIl: "2026-10-30" }),
      unita({ sigla: "B1a", edificio: "B", piano: "T" }),
      unita({ sigla: "X", edificio: null, piano: null }),
    ]);
    expect(g.map((e) => e.edificio)).toEqual(["A", "B", null]);
    expect(g[0].piani.map((p) => p.etichetta)).toEqual(["1° piano", "Piano terra"]);
    expect(g[0].piani[0].unita.map((u) => u.sigla)).toEqual(["A2", "A10"]);
    expect(g[1].piani[0].unita.map((u) => u.sigla)).toEqual(["B1a"]);
  });
});

describe("pagamenti e riepilogo vendite", () => {
  const a1 = unita({ sigla: "A1", stato: "compromesso", listino: 300000, trattato: 290000, movimenti: [mov("caparra", 30000), mov("acconto", 50000), mov("permuta", 20000)] });
  const a2 = unita({ sigla: "A2", stato: "rogitata", trattato: 200000, rogito: 205000, movimenti: [mov("caparra", 20000), mov("saldo", 185000)] });
  const a3 = unita({ sigla: "A3", stato: "prenotata", listino: 180000, movimenti: [mov("caparra", 5000)] });
  const a4 = unita({ sigla: "A4", listino: 150000 });

  it("incassato, permuta e residuo di un'unità", () => {
    expect(pagamentiUnita(a1)).toEqual({ incassato: 80000, permute: 20000, pagato: 100000, residuo: 190000 });
    expect(pagamentiUnita(a2)).toEqual({ incassato: 205000, permute: 0, pagato: 205000, residuo: 0 });
    expect(pagamentiUnita(a4).residuo).toBeNull();
    expect(pagamentiUnita(unita({ stato: "prenotata", movimenti: [mov("caparra", null)] })).incassato).toBeNull();
  });

  it("contatori, venduto (compromessi e rogiti), incassato e da incassare", () => {
    const r = riepilogoVendite(elenco([a1, a2, a3, a4, unita({ sigla: "Z", divisaIl: "x", listino: 1 })]));
    expect(r.unita).toBe(4);
    expect(r.conteggi).toEqual({ libera: 1, prenotata: 1, compromesso: 1, rogitata: 1 });
    expect(r.venduto).toBe(495000);
    expect(r.prenotato).toBe(180000);
    expect(r.inVendita).toBe(150000);
    expect(r.incassato).toBe(290000);
    expect(r.permute).toBe(20000);
    expect(r.daIncassare).toBe(190000);
  });

  it("senza il permesso degli importi: solo i contatori", () => {
    const r = riepilogoVendite(elenco([a1], { permessi: { ...permessi, importi: false } }));
    expect(r.conteggi.compromesso).toBe(1);
    expect(r.venduto).toBeNull();
    expect(r.incassato).toBeNull();
  });
});

describe("ripartizione dei costi comuni", () => {
  it("le quote tornano al centesimo", () => {
    expect(ripartisci(100, [1, 1, 1])).toEqual([33.34, 33.33, 33.33]);
    expect(ripartisci(1000, [600, 400])).toEqual([600, 400]);
    expect(ripartisci(10, [0, 0])).toEqual([5, 5]);
    expect(ripartisci(-10, [1, 3])).toEqual([-2.5, -7.5]);
    expect(ripartisci(1, [1, 1, 1], 3).reduce((t, q) => t + q, 0)).toBeCloseTo(1, 10);
  });

  it("millesimi se ce li hanno tutte, poi m², poi prezzo, poi parti uguali", () => {
    expect(criterioRiparto([unita({ millesimi: 600, mq: 100 }), unita({ millesimi: 400, mq: 80 })])).toBe("millesimi");
    expect(criterioRiparto([unita({ millesimi: 600, mq: 100 }), unita({ mq: 80 })])).toBe("mq");
    expect(criterioRiparto([unita({ mq: 100, listino: 1 }), unita({ listino: 2 })])).toBe("prezzo");
    expect(criterioRiparto([unita({ listino: 1 }), unita({})])).toBe("uguale");
  });
});

describe("margine dell'unità", () => {
  const a1 = unita({ sigla: "A1", millesimi: 600, mq: 100, stato: "compromesso", trattato: 300000, costoDiretto: 150000, provvigione: 9000,
    movimenti: [mov("permuta", 40000)] });
  const a2 = unita({ sigla: "A2", millesimi: 400, mq: 80, listino: 200000, costoDiretto: 110000 });

  it("prezzo − costi della commessa − provvigione − quota dei costi comuni (registrati + permute)", () => {
    const c = contiUnita(elenco([a1, a2], { costiGenerale: 60000 }));
    expect(c.criterio).toBe("millesimi");
    expect(c.permute).toBe(40000);
    expect(c.costiComuni).toBe(100000);
    expect(c.perUnita.get("o-A1")).toMatchObject({ quotaComuni: 60000, margine: 300000 - 150000 - 9000 - 60000 });
    expect(c.perUnita.get("o-A2")).toMatchObject({ quotaComuni: 40000, margine: 200000 - 110000 - 40000 });
    // Ogni euro una volta sola: le quote sommano i costi comuni.
    expect([...c.perUnita.values()].reduce((t, x) => t + (x.quotaComuni ?? 0), 0)).toBe(100000);
  });

  it("i costi di un'unità divisa passano alle parti per m²", () => {
    const madre = unita({ sigla: "B1", mq: 90, costoDiretto: 9000, divisaIl: "2026-10-30" });
    const b1a = unita({ sigla: "B1a", mq: 60, listino: 100000, costoDiretto: 1000, origineId: "u-B1" });
    const b1b = unita({ sigla: "B1b", mq: 30, listino: 50000, costoDiretto: 0, origineId: "u-B1" });
    const c = contiUnita(elenco([madre, b1a, b1b], { costiGenerale: 0 }));
    expect(c.perUnita.has("o-B1")).toBe(false);
    expect(c.perUnita.get("o-B1a")).toMatchObject({ costoEreditato: 6000, margine: 100000 - 1000 - 6000 });
    expect(c.perUnita.get("o-B1b")).toMatchObject({ costoEreditato: 3000, margine: 50000 - 3000 });
  });

  it("un'unità divisa senza più parti qui lascia i suoi costi tra quelli comuni", () => {
    const c = contiUnita(elenco([unita({ sigla: "B1", costoDiretto: 500, divisaIl: "x" }), unita({ sigla: "A1", listino: 1000 })], { costiGenerale: 100 }));
    expect(c.costiSenzaParti).toBe(500);
    expect(c.costiComuni).toBe(600);
    expect(c.perUnita.get("o-A1")!.margine).toBe(400);
  });

  it("senza permessi niente margine, e niente costi a chi non li vede", () => {
    const senzaMargini = contiUnita(elenco([a1, a2], { permessi: { ...permessi, margini: false } }));
    expect(senzaMargini.perUnita.get("o-A1")!.margine).toBeNull();
    expect(senzaMargini.perUnita.get("o-A1")!.quotaComuni).toBe(24000);
    const senzaCosti = contiUnita(elenco([{ ...a1, costoDiretto: null }, a2], { costiGenerale: null, permessi: { ...permessi, costi: false, margini: false } }));
    expect(senzaCosti.costiComuni).toBeNull();
    expect(senzaCosti.perUnita.get("o-A2")).toMatchObject({ costoDiretto: null, quotaComuni: null, margine: null });
  });
});

describe("garanzie D.Lgs. 122/2005", () => {
  it("solo per lo sviluppo, sulle unità con somme versate prima del rogito", () => {
    const lista = [
      unita({ sigla: "A3", stato: "compromesso", movimenti: [mov("caparra", 20000), mov("acconto", 30000)] }),
      unita({ sigla: "A1", stato: "prenotata", movimenti: [mov("permuta", 10000)] }),
      unita({ sigla: "A2", stato: "rogitata", movimenti: [mov("acconto", 99)] }),
      unita({ sigla: "A4", stato: "prenotata" }),
    ];
    expect(avvisoGaranzie(elenco(lista))).toEqual({ sigle: ["A1", "A3"], somme: 60000 });
    expect(avvisoGaranzie(elenco(lista, { modello: "compravendita" }))).toBeNull();
    expect(avvisoGaranzie(elenco([unita({ stato: "compromesso" })]))).toBeNull();
  });
});

describe("dividere un'unità", () => {
  const a1 = unita({ sigla: "A1", mq: 101, millesimi: 120, listino: 301000 });

  it("propone A1a e A1b in parti uguali", () => {
    expect(proponiDivisione(a1)).toEqual([
      { sigla: "A1a", mq: 50.5, listino: 150500, tipologia: null },
      { sigla: "A1b", mq: 50.5, listino: 150500, tipologia: null },
    ]);
    expect(proponiDivisione(a1, 3).map((p) => p.sigla)).toEqual(["A1a", "A1b", "A1c"]);
  });

  it("millesimi in proporzione ai m², e la somma torna", () => {
    const { parti, errori } = completaDivisione(a1, [
      { sigla: "A1a", mq: 70, listino: 200000, tipologia: null },
      { sigla: " A1b ", mq: 31, listino: 101000, tipologia: "Bilocale" },
    ], ["A1", "A2"]);
    expect(errori).toEqual([]);
    expect(parti.map((p) => p.millesimi)).toEqual([83.168, 36.832]);
    expect(parti[1].sigla).toBe("A1b");
  });

  it("i m² devono tornare; sigle nuove e diverse; solo un'unità libera senza pagamenti", () => {
    const parti: ParteDivisione[] = [{ sigla: "A2", mq: 50, listino: null, tipologia: null }, { sigla: "a2", mq: 40, listino: null, tipologia: null }];
    const { errori } = completaDivisione({ ...a1, stato: "prenotata", movimenti: [mov("caparra", 1)] }, parti, ["A1", "A2"]);
    expect(errori).toEqual([
      "Si divide solo un'unità libera.",
      "Su A1 ci sono pagamenti registrati: non si può dividere.",
      "C'è già un'unità A2.",
      "Due parti hanno la stessa sigla: a2.",
      "I m² delle parti (90) non tornano con quelli di A1 (101).",
    ]);
  });
});

describe("nuove unità in serie", () => {
  it("genera le sigle", () => {
    expect(generaSigle("A", 1, 6)).toEqual(["A1", "A2", "A3", "A4", "A5", "A6"]);
    expect(generaSigle("Box ", 3, 4)).toEqual(["Box3", "Box4"]);
    expect(generaSigle("A", 5, 1)).toEqual([]);
    expect(generaSigle("A", 1, 500)).toHaveLength(100);
  });

  it("incolla da Excel con intestazione: le colonne si riconoscono dal nome", () => {
    const righe = leggiIncolla("Unità\tPiano\tSuperficie mq\tPrezzo listino\tMillesimi\nA1\tT\t95,5\t250.000\t120\r\nA2\t1\t80\t€ 210.000,00\t100\n\n");
    expect(righe).toEqual([
      { ...rigaVuota(), sigla: "A1", piano: "T", mq: "95,5", listino: "250.000", millesimi: "120" },
      { ...rigaVuota(), sigla: "A2", piano: "1", mq: "80", listino: "€ 210.000,00", millesimi: "100" },
    ]);
  });

  it("incolla senza intestazione: valgono le colonne della tabella; CSV col punto e virgola", () => {
    expect(leggiIncolla("A1\tScala A\t2\tAppartamento\t90\t110\t240000")[0]).toEqual({
      sigla: "A1", edificio: "Scala A", piano: "2", tipologia: "Appartamento", mq: "90", millesimi: "110", listino: "240000",
    });
    expect(leggiIncolla("B1;;T;Box;15")[0]).toMatchObject({ sigla: "B1", edificio: "", piano: "T", tipologia: "Box", mq: "15" });
  });

  it("una colonna incollata a metà tabella riempie quella colonna dalla riga giusta", () => {
    const prima = generaSigle("A", 1, 3).map((sigla) => ({ ...rigaVuota(), sigla }));
    const dopo = incollaInTabella(prima, "95\n80\n70\n60\n", 1, "mq");
    expect(dopo.map((r) => [r.sigla, r.mq])).toEqual([["A1", ""], ["A2", "95"], ["A3", "80"], ["", "70"], ["", "60"]]);
    expect(prima[1].mq).toBe("");
    expect(isIncollaDaFoglio("250000")).toBe(false);
    expect(isIncollaDaFoglio("250000\n")).toBe(false);
    expect(isIncollaDaFoglio("A1\tT")).toBe(true);
  });

  it("controlla prima di salvare", () => {
    const r = controllaSerie([
      { ...rigaVuota(), sigla: "A1", mq: "95,5 m²", listino: "250.000" },
      { ...rigaVuota(), sigla: "a1" },
      { ...rigaVuota(), sigla: "B1", mq: "tanti" },
      { ...rigaVuota(), sigla: "C1", millesimi: "-3" },
      { ...rigaVuota(), sigla: "Z9" },
      rigaVuota(),
    ], ["Z9"]);
    expect(r.righe).toHaveLength(5);
    expect(r.righe.map((x) => x.errori)).toEqual([
      ["A1 è ripetuta."], ["a1 è ripetuta."], ["m²: non è un numero."], ["millesimi: negativo."], ["C'è già un'unità Z9."],
    ]);
    expect(r.errori).toBe(5);
    expect(r.unita[0]).toEqual({ sigla: "A1", edificio: null, piano: null, tipologia: null, mq_commerciali: 95.5, millesimi: null, prezzo_listino: 250000 });
  });
});
