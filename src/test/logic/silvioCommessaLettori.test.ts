/**
 * Lettori a regole di Silvio (fase 1, lotto 1.1): da tre preventivi d'esempio (bagno,
 * ristrutturazione, classico con rate) e da un computo esce il frammento che farebbe
 * l'ufficio; fusi, danno un piano molto più completo della commessa media di oggi (32/100).
 * Dati inventati: il repository è pubblico.
 */
import { describe, it, expect } from "vitest";
import type { FaseDelPiano, Frammento, PianoCommessa, RataDelPiano } from "../../../shared/silvio-commessa/piano.ts";
import { fondi, pianoVuoto } from "../../../shared/silvio-commessa/fondi.ts";
import { completezzaPiano } from "../../../shared/silvio-commessa/completezza.ts";
import { variabile } from "../../../shared/silvio-commessa/registro.ts";
import { frammentoDaPreventivo, moduloDelPreventivo } from "@/lib/silvio-commessa/lettori/preventivo";
import { frammentoDaComputo } from "@/lib/silvio-commessa/lettori/computo";
import { frammentoDaCommessa } from "@/lib/silvio-commessa/lettori/commessa";
import { bozzaComputoSchema, type BozzaComputo } from "@/lib/computo/editorNativo";

const PROGETTO_BAGNO = "11111111-1111-4111-8111-111111111111";
const PROGETTO_RST = "22222222-2222-4222-8222-222222222222";
const LUNEDI = "2026-11-09";

/** Il valore di una chiave nel frammento (cerca nell'area del registro). */
function val<T = unknown>(fr: Frammento | PianoCommessa, chiave: string): T | undefined {
  return fr.aree[variabile(chiave)!.area]?.[chiave]?.valore as T | undefined;
}
function voce(fr: Frammento, chiave: string) {
  return fr.aree[variabile(chiave)!.area]?.[chiave];
}
/** Ogni chiave del frammento è del registro e sta nella sua area. */
function soloChiaviDelRegistro(fr: Frammento) {
  for (const [area, valori] of Object.entries(fr.aree)) {
    for (const chiave of Object.keys(valori ?? {})) expect(variabile(chiave)?.area, chiave).toBe(area);
  }
}

// ── 1. Preventivo del bagno (preventivatore edile, firmato) ─────────────────
const bagno = () => frammentoDaPreventivo({
  quote: {
    id: "q-bagno", quote_number: "PR-0101", title: "Rifacimento bagno", status: "accettata", signed_at: "2026-10-20T10:00:00Z",
    source: `modulo:bagni:${PROGETTO_BAGNO}`, subtotal: 9000, discount_amount: 0, vat_amount: 900, total: 9900,
    client_name: "Mario Prova", client_email: "mario@example.test", client_phone: "333 0000000",
  },
  righe: [],
  modulo: {
    chiave: "bagni",
    progetto: {
      id: PROGETTO_BAGNO, tipo_intervento: "Rifacimento completo", cliente_nome: "Mario", cliente_cognome: "Prova",
      cantiere_indirizzo: "Via degli Esempi 1", cantiere_cap: "20900", cantiere_citta: "Monza", cantiere_provincia: "mb",
      iva_pct: 10, totale_imponibile: 9000, totale: 9900, detrazione_pct: 50,
      cronoprogramma: [
        { fase: "Demolizioni", durata: "2 giorni" }, { fase: "Impianti", durata: "3 giorni" }, { fase: "Rivestimenti", durata: "1 settimana" },
      ],
      piano_pagamento: { modo: "rate", righe: [
        { nome: "Acconto", percent: 30, evento: "firma_contratto" }, { nome: "Saldo", percent: 70, evento: "fine_lavori" },
      ] },
    },
    voci: [
      { capitolo_nome: "Impianti", descrizione: "Impianto idrico completo\ncon raccordi", quantita: 1, unita_misura: "corpo", importo: 2000, costo_materiali: 400, costo_manodopera: 600, ordine: 1 },
      { capitolo_nome: "Accessori", descrizione: "Specchio", quantita: 1, unita_misura: "cad", importo: 150, costo_materiali: 80, costo_manodopera: 0, ordine: 2 },
    ],
  },
  inizio: LUNEDI,
});

// ── 2. Preventivo di ristrutturazione, non firmato, senza cronoprogramma ────
const ristrutturazione = () => frammentoDaPreventivo({
  quote: {
    id: "q-rst", quote_number: "PR-0102", title: "Ristrutturazione appartamento", status: "inviata",
    source: `modulo:rst:${PROGETTO_RST}`, subtotal: 0, total: 13200,
  },
  righe: [],
  modulo: {
    chiave: "rst",
    progetto: {
      id: PROGETTO_RST, cliente_nome: "Anna", cliente_cognome: "Esempio", cliente_email: "anna@example.test",
      cantiere_indirizzo: "Corso Finto 10", cantiere_citta: "Lecco", iva_pct: 10, totale_imponibile: 12000, totale: 13200,
      piano_pagamento: { modo: "sal", righe: [
        { nome: "Acconto", percent: 20, evento: "firma_contratto" }, { nome: "SAL 1", percent: 40, evento: "sal_numero", numero: 1 },
        { nome: "SAL 2", percent: 30, evento: "sal_numero", numero: 2 }, { nome: "Saldo", percent: 10, evento: "fine_lavori" },
      ] },
    },
    voci: [
      { capitolo_nome: "Demolizioni", descrizione: "Demolizione tramezze", quantita: 20, unita_misura: "mq", importo: 3000, costo_materiali: 0, costo_manodopera: 90, ordine: 1 },
      { capitolo_nome: "Impianti", descrizione: "Impianto elettrico", quantita: 1, unita_misura: "corpo", importo: 9000, costo_materiali: 3000, costo_manodopera: 2500, ordine: 2 },
    ],
  },
});

// ── 3. Preventivo classico con rate e righe ─────────────────────────────────
const classico = () => frammentoDaPreventivo({
  quote: {
    id: "q-cl", quote_number: "PR-0103", title: "Sostituzione finestre", description: "Quattro finestre in PVC con posa",
    tipo_lavoro: "serramenti", status: "firmato", signed_at: "2026-10-25T09:00:00Z",
    subtotal: 10000, discount_amount: 500, vat_amount: 950, total: 10450,
    client_name: "Luca Finto", client_company: "", client_email: "luca@example.test", client_address: "Via Casa 3, Como",
    indirizzo_lavori: "Via Cantiere 5, Como", sede_id: "sede-1", assigned_to: "u-resp", salesperson_id: "u-vend",
    payment_method: "Bonifico",
    payment_phases: [
      { label: "Acconto alla firma", type: "deposit", percent: 30, amount: 3135 },
      { label: "Secondo acconto", type: "deposit", percent: 20, amount: 2090 },
      { label: "Saldo", type: "balance", percent: 50, amount: 0 },
    ],
    cronoprogramma: [{ fase: "Rilievo", durata: "1 giorno" }, { fase: "Posa", durata: "3 giorni" }],
  },
  righe: [
    { item_type: "product", item_category: "prodotto", name: "Finestra PVC 120x140", quantity: 4, unit_price: 2000, prezzo_acquisto: 1200, vat_rate: 10, sort_order: 0 },
    { item_type: "service", item_category: "posa", name: "Posa in opera", quantity: 4, unit_price: 500, vat_rate: 10, sort_order: 1 },
    { item_type: "product", item_category: "prodotto", name: "Zanzariera (opzionale)", quantity: 4, unit_price: 100, is_optional: true, sort_order: 2 },
  ],
});

// ── 4. Computo nativo ───────────────────────────────────────────────────────
function bozzaComputo(): BozzaComputo {
  return bozzaComputoSchema.parse({
    versione: 1, titolo: "Ristrutturazione via Inventata", committente: "Condominio Prova", oggetto: "Rifacimento delle parti comuni",
    clienteTipo: "azienda", clienteEmail: "amministratore@example.test",
    cantiere_indirizzo: "Via Inventata 7", cantiere_cap: "20100", cantiere_citta: "Milano", cantiere_provincia: "MI",
    ivaModalita: "applicata", ivaAliquota: "10",
    cronoprogramma: { dataInizio: "09/11/2026", fasi: [{ id: "c1", nome: "Demolizioni", inizio: 1, durata: 3 }] },
    pianoPagamenti: { rate: [
      { id: "r1", descrizione: "Acconto", percentuale: "20", quando: "firma" },
      { id: "r2", descrizione: "SAL", percentuale: "50", quando: "sal", giorno: 5 },
      { id: "r3", descrizione: "Saldo", percentuale: "30", quando: "fine" },
    ] },
    voci: [
      { id: "v1", capitolo: "Demolizioni", categoria: "", sottocategoria: "", tariffa: "DEM.01", descrizione: "Demolizione pavimenti\nfino al massetto",
        unita: "mq", quantita: "100", prezzo: "15", costo: "9", sicurezza: false, detrazione: false, corpo: false, misure: [] },
      { id: "v2", capitolo: "Murature", categoria: "", sottocategoria: "", tariffa: "MUR.02", descrizione: "Tramezze in laterizio",
        unita: "mq", quantita: "50", prezzo: "60", costo: "", sicurezza: false, detrazione: false, corpo: false, misure: [] },
      { id: "v3", capitolo: "Murature", categoria: "", sottocategoria: "", tariffa: "", descrizione: "Intonaco civile",
        unita: "mq", quantita: "100", prezzo: "25", costo: "", sicurezza: false, detrazione: false, corpo: false, misure: [] },
      { id: "v4", capitolo: "Murature", categoria: "", sottocategoria: "", tariffa: "", descrizione: "Variante non scelta",
        unita: "mq", quantita: "10", prezzo: "100", costo: "", opzionale: true, sicurezza: false, detrazione: false, corpo: false, misure: [] },
    ],
  });
}
const computo = () => frammentoDaComputo({ bozza: bozzaComputo(), id: "c-1", listino: [{ codice: "MUR.02", costo: 35 }] });

describe("lettore del preventivo: bagno del preventivatore", () => {
  it("riconosce il preventivatore dalla sorgente", () => {
    expect(moduloDelPreventivo(`modulo:bagni:${PROGETTO_BAGNO}`)).toEqual({ chiave: "bagni", progettoId: PROGETTO_BAGNO });
    expect(moduloDelPreventivo("manuale")).toBeNull();
  });

  it("copia cliente, cantiere, importi e tipo di lavoro, con la fonte", () => {
    const fr = bagno();
    soloChiaviDelRegistro(fr);
    expect(fr.fonte).toMatchObject({ tipo: "preventivo", id: "q-bagno", etichetta: "preventivo PR-0101" });
    expect(val(fr, "identita.tipo_lavoro")).toBe("bagno");
    expect(val(fr, "identita.description")).toBe("Rifacimento bagno");
    expect(val(fr, "identita.origine")).toEqual({ quote_id: "q-bagno", quote_number: "PR-0101" });
    expect(val(fr, "cliente.nome")).toEqual({ client_name: "Mario Prova" });
    expect(val(fr, "cliente.contatto")).toEqual({ client_phone: "333 0000000", client_email: "mario@example.test" });
    expect(val(fr, "cantiere.indirizzo")).toEqual({ indirizzo_lavori: "Via degli Esempi 1, 20900 Monza (MB)" });
    expect(val(fr, "economia.total_amount")).toBe(9000);
    expect(val(fr, "economia.vat_rate")).toBe(10);
    expect(val(fr, "economia.has_building_bonus")).toBe(true);
    expect(voce(fr, "economia.total_amount")).toMatchObject({ fiducia: 1, stato: "fatto" });
    expect(voce(fr, "economia.total_amount")?.fonte?.dove).toBe("totale imponibile");
    expect(fr.avvisi).toEqual([]);
  });

  it("le rate del piano di pagamento, sul totale IVA inclusa, agganciate agli eventi", () => {
    expect(val<RataDelPiano[]>(bagno(), "pagamenti.rate")).toEqual([
      { label: "Acconto", type: "deposit", amount: 2970, percent: 30, trigger_evento: "firma_contratto", trigger_numero: null },
      { label: "Saldo", type: "balance", amount: 6930, percent: 70, trigger_evento: "fine_lavori", trigger_numero: null },
    ]);
  });

  it("le fasi dal cronoprogramma, con le date dall'inizio lavori e le voci del capitolo omonimo", () => {
    const fr = bagno();
    const fasi = val<FaseDelPiano[]>(fr, "fasi.order_work_phases")!;
    expect(fasi.map((f) => [f.name, f.start_date, f.end_date])).toEqual([
      ["Demolizioni", "2026-11-09", "2026-11-10"],
      ["Impianti", "2026-11-11", "2026-11-13"],
      ["Rivestimenti", "2026-11-16", "2026-11-20"],
    ]);
    expect(fasi[1].sottofasi).toEqual([{ name: "Impianto idrico completo", quantita: 1, unita: "corpo", importo: 2000, costo: 1000 }]);
    // Il capitolo «Accessori» non è una fase del cronoprogramma: non ne nasce una.
    expect(fasi).toHaveLength(3);
    expect(val(fr, "fasi.work_end_date")).toBe("2026-11-20");
    expect(voce(fr, "fasi.work_end_date")?.stato).toBe("proposta");
  });
});

describe("lettore del preventivo: ristrutturazione senza cronoprogramma", () => {
  it("non firmato: lo dice, e vale meno", () => {
    const fr = ristrutturazione();
    soloChiaviDelRegistro(fr);
    expect(fr.avvisi?.[0]).toMatch(/non risulta firmato/);
    expect(voce(fr, "economia.total_amount")?.fiducia).toBe(0.8);
    expect(val(fr, "identita.origine")).toEqual({ quote_id: "q-rst", quote_number: "PR-0102", rst_progetto_id: PROGETTO_RST });
    expect(val(fr, "identita.tipo_lavoro")).toBe("ristrutturazione");
  });

  it("senza subtotale l'importo e l'IVA vengono dal progetto", () => {
    const fr = ristrutturazione();
    expect(val(fr, "economia.total_amount")).toBe(12000);
    expect(val(fr, "economia.vat_rate")).toBe(10);
    expect(val(fr, "cantiere.indirizzo")).toEqual({ indirizzo_lavori: "Corso Finto 10, Lecco" });
    expect(val(fr, "cliente.nome")).toEqual({ client_name: "Anna Esempio" });
  });

  it("rate a SAL numerati, dal piano di pagamento del preventivatore", () => {
    expect(val<RataDelPiano[]>(ristrutturazione(), "pagamenti.rate")?.map((r) => [r.label, r.type, r.amount, r.trigger_evento, r.trigger_numero])).toEqual([
      ["Acconto", "deposit", 2640, "firma_contratto", null],
      ["SAL 1", "deposit", 5280, "sal_numero", 1],
      ["SAL 2", "deposit", 3960, "sal_numero", 2],
      ["Saldo", "balance", 1320, "fine_lavori", null],
    ]);
  });

  it("le fasi sono i capitoli, con le durate stimate dal valore e segnate come proposta", () => {
    const fr = ristrutturazione();
    const fasi = val<FaseDelPiano[]>(fr, "fasi.order_work_phases")!;
    expect(fasi.map((f) => [f.name, f.giorno_inizio, f.giorni])).toEqual([["Demolizioni", 1, 2], ["Impianti", 3, 6]]);
    expect(fasi[0].sottofasi?.[0]).toMatchObject({ name: "Demolizione tramezze", costo: 1800 });
    expect(voce(fr, "fasi.order_work_phases")).toMatchObject({ stato: "proposta", fiducia: 0.7 });
    // Senza inizio lavori, niente date inventate.
    expect(fasi[0].start_date).toBeUndefined();
    expect(val(fr, "fasi.work_end_date")).toBeUndefined();
  });
});

describe("lettore del preventivo: classico con rate", () => {
  it("righe: solo i materiali venduti; importo scontato e IVA media", () => {
    const fr = classico();
    soloChiaviDelRegistro(fr);
    expect(val(fr, "economia.total_amount")).toBe(9500);
    expect(val(fr, "economia.vat_rate")).toBe(10);
    const righe = val<Array<{ name: string; quantity: number; unit_price: number }>>(fr, "economia.order_items")!;
    expect(righe.map((r) => [r.name, r.quantity, r.unit_price])).toEqual([["Finestra PVC 120x140", 4, 2000]]);
    expect(val(fr, "identita.tipo_lavoro")).toBe("serramenti");
    expect(val(fr, "identita.work_description")).toBe("Quattro finestre in PVC con posa");
    expect(val(fr, "identita.sede_id")).toBe("sede-1");
    expect(val(fr, "cliente.client_address")).toBe("Via Casa 3, Como");
    expect(val(fr, "cantiere.indirizzo")).toEqual({ indirizzo_lavori: "Via Cantiere 5, Como" });
    expect(val(fr, "persone.assigned_to")).toBe("u-resp");
    expect(val(fr, "persone.venditori")).toEqual(["u-vend"]);
    expect(val(fr, "pagamenti.payment_type")).toBe("standard");
  });

  it("rate: importo dalla fase o dalla percentuale; acconto alla firma, saldo a fine lavori, quella di mezzo da scegliere", () => {
    const fr = classico();
    expect(val<RataDelPiano[]>(fr, "pagamenti.rate")).toEqual([
      { label: "Acconto alla firma", type: "deposit", amount: 3135, percent: 30, trigger_evento: "firma_contratto" },
      { label: "Secondo acconto", type: "deposit", amount: 2090, percent: 20, trigger_evento: null },
      { label: "Saldo", type: "balance", amount: 5225, percent: 50, trigger_evento: "fine_lavori" },
    ]);
    expect(voce(fr, "pagamenti.rate")?.nota).toMatch(/Una rata non ha/);
  });

  it("fasi dal cronoprogramma del preventivo, senza date se l'inizio non c'è", () => {
    const fasi = val<FaseDelPiano[]>(classico(), "fasi.order_work_phases")!;
    expect(fasi).toEqual([{ name: "Rilievo", giorno_inizio: 1, giorni: 1 }, { name: "Posa", giorno_inizio: 2, giorni: 3 }]);
  });

  it("senza cronoprogramma le lavorazioni diventano fasi, e lo dice", () => {
    const fr = frammentoDaPreventivo({
      quote: { id: "q-x", quote_number: "PR-0104", status: "accettato", subtotal: 1000, vat_amount: 220, total: 1220 },
      righe: [{ item_type: "service", item_category: "posa", name: "Montaggio cucina", quantity: 1, unit_price: 1000 }],
    });
    expect(val(fr, "fasi.order_work_phases")).toEqual([{ name: "Montaggio cucina" }]);
    expect(fr.avvisi?.join(" ")).toMatch(/non ha il cronoprogramma/);
  });
});

describe("lettore del computo", () => {
  it("cliente, cantiere, importo scontato e IVA", () => {
    const fr = computo();
    soloChiaviDelRegistro(fr);
    expect(fr.fonte).toMatchObject({ tipo: "computo", id: "c-1" });
    expect(val(fr, "identita.description")).toBe("Ristrutturazione via Inventata");
    expect(val(fr, "identita.work_description")).toBe("Rifacimento delle parti comuni");
    expect(val(fr, "cliente.nome")).toEqual({ client_company: "Condominio Prova" });
    expect(val(fr, "cantiere.indirizzo")).toEqual({ indirizzo_lavori: "Via Inventata 7, 20100 Milano (MI)" });
    // 100×15 + 50×60 + 100×25 = 7.000 €; la variante opzionale resta fuori.
    expect(val(fr, "economia.total_amount")).toBe(7000);
    expect(val(fr, "economia.vat_rate")).toBe(10);
  });

  it("ogni capitolo una fase, ogni voce una sottofase; i tempi dal cronoprogramma o stimati", () => {
    const fr = computo();
    const fasi = val<FaseDelPiano[]>(fr, "fasi.order_work_phases")!;
    expect(fasi.map((f) => [f.name, f.giorno_inizio, f.giorni, f.start_date, f.end_date])).toEqual([
      ["Demolizioni", 1, 3, "2026-11-09", "2026-11-11"],
      // 5.500 € di murature ≈ 4 giornate: stimate, in coda.
      ["Murature", 4, 4, "2026-11-12", "2026-11-17"],
    ]);
    expect(fasi[1].sottofasi?.map((s) => s.name)).toEqual(["Tramezze in laterizio", "Intonaco civile"]);
    expect(voce(fr, "fasi.order_work_phases")).toMatchObject({ stato: "proposta", fiducia: 0.8 });
    expect(voce(fr, "fasi.order_work_phases")?.nota).toMatch(/Murature/);
    expect(val(fr, "fasi.work_start_date")).toBe("2026-11-09");
    expect(val(fr, "fasi.work_end_date")).toBe("2026-11-17");
  });

  it("rate sul totale con l'IVA, agganciate a firma, SAL numerato e fine lavori", () => {
    expect(val<RataDelPiano[]>(computo(), "pagamenti.rate")).toEqual([
      { label: "Acconto", type: "deposit", amount: 1540, percent: 20, trigger_evento: "firma_contratto", trigger_numero: null },
      { label: "SAL", type: "deposit", amount: 3850, percent: 50, trigger_evento: "sal_numero", trigger_numero: 1 },
      { label: "Saldo", type: "balance", amount: 2310, percent: 30, trigger_evento: "fine_lavori", trigger_numero: null },
    ]);
  });

  it("costi previsti per fase: dal costo stimato e, se manca, dal listino col codice", () => {
    const fr = computo();
    expect(val(fr, "costi.previsti")).toEqual([
      { fase: "Demolizioni", importo: 900, vociSenzaCosto: 0 },
      { fase: "Murature", importo: 1750, vociSenzaCosto: 1 },
    ]);
    expect(voce(fr, "costi.previsti")?.fonte?.dove).toMatch(/1 dal listino/);
    expect(voce(fr, "costi.previsti")?.nota).toMatch(/1 voce è senza costo/);
  });

  it("IVA da definire: non la inventa, avvisa", () => {
    const fr = frammentoDaComputo({ bozza: { ...bozzaComputo(), ivaModalita: "da-definire" } });
    expect(val(fr, "economia.vat_rate")).toBeUndefined();
    expect(fr.avvisi?.join(" ")).toMatch(/da definire/);
  });
});

describe("lettore della commessa esistente", () => {
  it("quello che c'è entra come scritto da una persona; il vuoto non entra", () => {
    const fr = frammentoDaCommessa({
      order: {
        id: "o-1", order_code: "C-0007", description: "Bagno Prova", total_amount: 0, vat_rate: 10,
        client_name: "Mario Prova", client_email: null, client_phone: "333", indirizzo_lavori: "", work_start_date: "2026-11-09",
      },
      fasi: [{ id: "f2", name: "Posa", position: 1 }, { id: "f1", name: "Demolizioni", position: 0, start_date: "2026-11-09", sottofasi: [{ name: "Piastrelle", position: 0 }] }],
      rate: [],
      conteggi: { tasks: 2, scadenze: 0 },
    });
    soloChiaviDelRegistro(fr);
    expect(fr.fonte).toMatchObject({ tipo: "persona", id: "o-1", etichetta: "commessa C-0007" });
    expect(val(fr, "identita.description")).toBe("Bagno Prova");
    expect(val(fr, "cliente.contatto")).toEqual({ client_phone: "333" });
    expect(val(fr, "economia.vat_rate")).toBe(10);
    expect(val(fr, "fasi.work_start_date")).toBe("2026-11-09");
    expect(val(fr, "fasi.order_work_phases")).toEqual([
      { id: "f1", name: "Demolizioni", start_date: "2026-11-09", sottofasi: [{ name: "Piastrelle" }] },
      { id: "f2", name: "Posa" },
    ]);
    expect(val(fr, "comunicazione.tasks")).toEqual({ righe: 2 });
    // Importo a zero, indirizzo vuoto, nessuna rata, nessuna scadenza: Silvio li può proporre.
    for (const k of ["economia.total_amount", "cantiere.indirizzo", "pagamenti.rate", "sal_scadenze.scadenze"]) expect(val(fr, k), k).toBeUndefined();
  });

  it("fusa prima dei documenti, la persona vince: il preventivo aggiunge solo quello che manca", () => {
    let p = fondi(pianoVuoto("az-1", "o-1"), frammentoDaCommessa({
      order: { id: "o-1", order_code: "C-0008", description: "Titolo scritto a mano", vat_rate: 22 },
    }));
    p = fondi(p, classico());
    expect(val(p, "identita.description")).toBe("Titolo scritto a mano");
    expect(val(p, "economia.vat_rate")).toBe(22);
    expect(p.conflitti).toEqual([]);
    expect(val(p, "economia.total_amount")).toBe(9500);
  });
});

describe("dai frammenti al piano", () => {
  it("ogni lettore, fuso da solo, alza la completezza ben sopra la commessa media di oggi (32/100)", () => {
    for (const fr of [bagno(), ristrutturazione(), classico(), computo()]) {
      const p = fondi(pianoVuoto("az-1"), fr);
      expect(p.avvisi?.filter((a) => /ignorata/.test(a)), fr.fonte.etichetta).toEqual([]);
      expect(completezzaPiano(p).punteggio, fr.fonte.etichetta).toBeGreaterThanOrEqual(40);
    }
  });

  it("bagno firmato con l'inizio scelto dal titolare: più della metà, e mancano solo cose interne", () => {
    let p = fondi(pianoVuoto("az-1"), bagno());
    p = fondi(p, { fonte: { tipo: "persona", etichetta: "scelto da te" }, aree: { fasi: { "fasi.work_start_date": { valore: LUNEDI, fiducia: 1, stato: "fatto" } } } });
    const c = completezzaPiano(p);
    expect(c.punteggio).toBeGreaterThanOrEqual(55);
    expect(c.perArea.fasi.punteggio).toBe(100);
    expect(c.perArea.pagamenti.punteggio).toBe(100);
    expect(c.perArea.economia.punteggio).toBeGreaterThanOrEqual(80);
    expect(p.conflitti).toEqual([]);
  });

  it("preventivo + computo dello stesso lavoro: un piano solo, i conflitti dove i documenti non tornano", () => {
    let p = fondi(pianoVuoto("az-1"), classico());
    p = fondi(p, computo());
    // Il preventivo vale più del computo: nel piano resta il suo importo, segnato ⚠.
    expect(val(p, "economia.total_amount")).toBe(9500);
    expect(p.conflitti.map((c) => c.chiave)).toContain("economia.total_amount");
    expect(p.fonti.map((f) => f.tipo)).toEqual(["preventivo", "computo"]);
    expect(completezzaPiano(p).punteggio).toBeGreaterThanOrEqual(55);
  });
});
