import { describe, expect, it } from "vitest";
import { isValidElement } from "react";
import { createOrdinePDFDocument } from "@/components/orders/OrdinePDF";
import {
  asseTempo, cassaPerMese, orePerSettimana, periodoFase, righeAzienda, tempoTrascorso,
  avanzamentoSal, caricaDatiRiepilogo, fattureDiCommessa, giornateMezzi, oreDaRapportini, totaliFatture, type DatiRiepilogo,
} from "@/lib/orders/riepilogoCommessaDati";

function testo(v: unknown): string {
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (Array.isArray(v)) return v.map(testo).join(" ");
  if (isValidElement<Record<string, unknown>>(v)) {
    // Testata, piè ed etichette dello stile unico (10/11/2026) portano il testo nelle proprietà, non nei figli.
    const p = v.props;
    return [p.ragioneSociale, p.titolo, p.sotto, p.stato, p.testo, p.righe, p.riferimento, p.children].map(testo).join(" ");
  }
  return "";
}
const leggi = (doc: unknown) => testo(doc).replace(/\s+/g, " ");

type Risposta = { data: unknown; error: unknown };
// Database finto: ogni tabella risponde coi suoi dati; una tabella in `rotte` risponde con errore.
function dbFinto(tabelle: Record<string, unknown[]>, rotte: string[] = []) {
  const lette: string[] = [];
  return {
    lette,
    from: (t: string) => {
      lette.push(t);
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "is", "in", "order", "limit"]) q[m] = () => q;
      q.then = (ok: (r: Risposta) => unknown) =>
        Promise.resolve<Risposta>(rotte.includes(t) ? { data: null, error: { message: "rotta" } } : { data: tabelle[t] ?? [], error: null }).then(ok);
      return q;
    },
  };
}
const tutti = { vedeCosti: true, vedeFatture: true, vedeSubappalti: true, vedeSicurezza: true };
const nessuno = { vedeCosti: false, vedeFatture: false, vedeSubappalti: false, vedeSicurezza: false };

describe("Riepilogo commessa: i conti delle sezioni nuove", () => {
  it("la stessa fattura in due tabelle è una riga; annullate e proforma fuori dal totale; la nota di credito sottrae", () => {
    const { fatture, annullate } = fattureDiCommessa(
      [
        { tipo: "fattura", numero: "1/2026", data_emissione: "2026-01-10", stato: "pagata", totale_documento: 1000, importo_pagato: 1000 },
        { tipo: "fattura", numero: "2/2026", stato: "annullata", totale_documento: 500, importo_pagato: 0 },
        { tipo: "ddt", numero: "D1", stato: "emessa", totale_documento: 0 },
        { tipo: "proforma", numero: "P1", data_emissione: "2026-01-01", stato: "emessa", totale_documento: 300, importo_pagato: 0 },
      ],
      [
        { invoice_number: "1/2026", document_type: "invoice", status: "paid", total: 1000, paid_amount: 1000 },
        { invoice_number: "2/2026", document_type: "invoice", status: "cancelled", total: 500 },
        { invoice_number: "3/2026", document_type: "invoice", status: "issued", issue_date: "2026-02-01", total: 400, paid_amount: 100 },
        { invoice_number: "NC1", document_type: "credit_note", status: "issued", issue_date: "2026-03-01", total: 100, paid_amount: 0 },
      ],
    );
    expect(fatture.map((f) => f.numero)).toEqual(["P1", "1/2026", "3/2026", "NC1"]);
    expect(annullate).toBe(1);
    expect(totaliFatture(fatture)).toEqual({ emesso: 1300, incassato: 1100, residuo: 200 });
  });

  it("le ore vanno a chi era presente; i rapportini rifiutati non contano", () => {
    const o = oreDaRapportini([
      { data_lavoro: "2026-01-02", ore_lavorate: 16, ore_straordinario: 1, stato: "approvato", presenze: [{ nome: "Anna", ore: 8 }, { nome: "Bruno", ore: 8 }] },
      { data_lavoro: "2026-01-03", ore_lavorate: 6, stato: "inviato", presenze: [], operaio: { first_name: "Anna", last_name: "" } },
      { data_lavoro: "2026-01-04", ore_lavorate: 99, stato: "rifiutato", presenze: [{ nome: "Bruno", ore: 99 }] },
    ]);
    expect(o).toMatchObject({ rapportini: 2, giornate: 2, ore: 22, straordinari: 1, primo: "2026-01-02", ultimo: "2026-01-03" });
    expect(o.perPersona).toEqual([{ nome: "Anna", giornate: 2, ore: 14 }, { nome: "Bruno", giornate: 1, ore: 8 }]);
  });

  it("avanzamento del SAL pesato sugli importi; giornate dei mezzi senza doppioni", () => {
    expect(avanzamentoSal([{ importo_contrattuale: 300, percentuale_avanzamento: 100 }, { importo_contrattuale: 100, percentuale_avanzamento: 0 }])).toBe(75);
    expect(avanzamentoSal([])).toBeNull();
    expect(giornateMezzi([
      { giorno: "2026-01-01", usato: true, mezzo: { nome: "Gru", targa: "AB" } },
      { giorno: "2026-01-01", usato: true, mezzo: { nome: "Gru", targa: "AB" } },
      { giorno: "2026-01-02", usato: false, mezzo: { nome: "Gru", targa: "AB" } },
    ])).toEqual([{ nome: "Gru · AB", giornate: 1, primo: "2026-01-01", ultimo: "2026-01-01" }]);
  });
});

describe("Riepilogo commessa: cronoprogramma e grafici", () => {
  it("l'asse copre mesi interi e posiziona le date", () => {
    const a = asseTempo(["2026-03-16", null, "2026-01-10"])!;
    expect(a.mesi.map((m) => m.etichetta)).toEqual(["gen 26", "feb 26", "mar 26"]);
    expect(a.pos("2026-01-01")).toBe(0);
    expect(a.pos("2026-04-30")).toBe(100);
    expect(a.pos("2026-02-15")).toBeGreaterThan(40);
    expect(asseTempo([null, undefined])).toBeNull();
  });

  it("una fase senza date prende quelle delle sottofasi", () => {
    expect(periodoFase({ sottofasi: [{ data_inizio: "2026-02-01", data_fine: "2026-02-05" }, { data_inizio: "2026-01-20" }] })).toEqual({ inizio: "2026-01-20", fine: "2026-02-05" });
    expect(periodoFase({ start_date: "2026-01-01", end_date: "2026-01-09", sottofasi: [] })).toEqual({ inizio: "2026-01-01", fine: "2026-01-09" });
    expect(periodoFase({})).toEqual({ inizio: null, fine: null });
  });

  it("tempo trascorso sul periodo dei lavori", () => {
    expect(tempoTrascorso("2026-01-01", "2026-01-11", "2026-01-06")).toBe(50);
    expect(tempoTrascorso("2026-01-01", "2026-01-11", "2027-01-01")).toBe(100);
    expect(tempoTrascorso(null, "2026-01-11", "2026-01-06")).toBeNull();
  });

  it("cassa per mese: incassato e pagato alla loro data, il resto alla scadenza, ordini senza fattura fuori", () => {
    const { mesi, senzaData } = cassaPerMese({
      rate: [{ amount: 100, is_paid: true, paid_date: "2026-01-15", expected_date: "2026-01-01" }, { amount: 50, is_paid: false, expected_date: "2026-03-01" }, { amount: 5, is_paid: false, expected_date: null }],
      uscite: [
        { stato: "parziale", pagato: 30, pagato_il: "2026-01-20", residuo: 40, scadenza: "2026-02-10" },
        { stato: "fattura_da_arrivare", pagato: 0, residuo: 999, scadenza: "2026-02-10" },
      ],
    });
    expect(mesi).toEqual([
      { mese: "2026-01", etichetta: "gen 26", entrate: 100, uscite: 30, saldo: 70 },
      { mese: "2026-02", etichetta: "feb 26", entrate: 0, uscite: 40, saldo: 30 },
      { mese: "2026-03", etichetta: "mar 26", entrate: 50, uscite: 0, saldo: 80 },
    ]);
    expect(senzaData).toBe(5);
  });

  it("settimane dal lunedì: ore delle presenze, lavori senza doppioni, rifiutati fuori", () => {
    const s = orePerSettimana([
      { data_lavoro: "2026-11-02", ore_lavorate: 16, stato: "approvato", descrizione_lavori: "Getto", presenze: [{ nome: "A", ore: 8 }, { nome: "B", ore: 8 }] },
      { data_lavoro: "2026-11-08", ore_lavorate: 4, stato: "inviato", descrizione_lavori: "Getto" },
      { data_lavoro: "2026-11-09", ore_lavorate: 2, stato: "inviato", descrizione_lavori: "Pulizia" },
      { data_lavoro: "2026-11-09", ore_lavorate: 99, stato: "rifiutato" },
    ]);
    expect(s).toEqual([
      { lunedi: "2026-11-02", giornate: 2, ore: 20, lavori: ["Getto"] },
      { lunedi: "2026-11-09", giornate: 1, ore: 2, lavori: ["Pulizia"] },
    ]);
  });

  it("intestazione dell'azienda solo con i dati presenti", () => {
    expect(righeAzienda({ legal_address: "Via Po 1", legal_city: "Torino", legal_province: "TO", vat_number: "123", pec: null })).toEqual(["Via Po 1, Torino (TO)", "P.IVA 123"]);
    expect(righeAzienda(null)).toEqual([]);
  });
});

describe("Riepilogo commessa: lettura", () => {
  it("una lettura fallita è dichiarata, le altre arrivano lo stesso", async () => {
    const db = dbFinto({ order_work_phases: [{ id: "f1", name: "Scavi" }] }, ["tasks"]);
    const d = await caricaDatiRiepilogo(db, "o", tutti);
    expect(d.fasi).toHaveLength(1);
    expect(d.nonLette).toEqual(["Attività"]);
  });

  it("senza permesso la tabella non viene nemmeno letta", async () => {
    const db = dbFinto({});
    await caricaDatiRiepilogo(db, "o", nessuno);
    for (const t of ["documenti_fiscali", "invoices", "contratti_subappalto", "sal_subappaltatori", "pos_documents", "order_errors"]) expect(db.lette).not.toContain(t);
  });

  it("per il cliente si leggono solo azienda, fasi, fatture e foto", async () => {
    const db = dbFinto({ order_work_phases: [{ id: "f1" }], order_work_subphases: [{ phase_id: "f1", name: "Sotto" }] });
    const d = await caricaDatiRiepilogo(db, "o", tutti, { perCliente: true, companyId: "c" });
    expect([...new Set(db.lette)].sort()).toEqual(["companies", "documenti_fiscali", "foto_cantiere", "invoices", "order_work_phases", "order_work_subphases"]);
    expect(d.fasi[0].sottofasi).toHaveLength(1);
  });
});

const dati: DatiRiepilogo = {
  permessi: tutti,
  azienda: { nome: "Impresa Verdi", righe: ["P.IVA 123"], logo: null },
  fornitoriArticoli: { i1: "Ceramiche Rossi" },
  fasi: [{ id: "f1", name: "Scavi", status: "in_corso", percentuale: 40, start_date: "2026-01-01", end_date: "2026-02-01", notes: "NOTA-FASE-INTERNA" }],
  fatture: [{ numero: "FT-77", tipo: "fattura", data: "2026-01-10", scadenza: null, totale: 1220, pagato: 0, pagataIl: null, stato: "emessa" }],
  fattureAnnullate: 0,
  contratti: [{ numero_contratto: "SUB-1", importo_contrattuale: 900, subappaltatore: { ragione_sociale: "Ditta Sub Srl" } }],
  salSub: [],
  ddt: [{ numero_ddt: "DDT-5", data_ricezione: "2026-01-05", stato: "ricevuto", supplier: { name: "Forniture Spa" } }],
  usciteMagazzino: [],
  attivita: [{ title: "Chiamare il geometra", status: "da_fare" }],
  appuntamenti: [],
  sopralluoghi: [],
  ticket: [],
  rapportini: [{ data_lavoro: "2026-01-02", ore_lavorate: 8, descrizione_lavori: "Getto platea", stato: "approvato" }],
  ore: { rapportini: 1, giornate: 1, ore: 8, straordinari: 0, primo: "2026-01-02", ultimo: "2026-01-02", perPersona: [{ nome: "Mario Operaio", giornate: 1, ore: 8 }] },
  mezzi: [],
  foto: [],
  fotoTotali: 0,
  allegati: [{ file_name: "contratto-riservato.pdf", file_size: 2048 }],
  sicurezzaPos: [],
  sicurezzaDuvri: [],
  sicurezzaVerbali: [{ tipo: "ispezione", data: "2026-01-03", esito: "conforme" }],
  firme: [],
  storicoStati: [],
  segnalazioni: [],
  errori: [{ error_type: "rottura", description: "ERRORE-INTERNO", amount: 50 }],
  noteCantiere: [{ testo: "NOTA-CANTIERE-INTERNA" }],
  nonLette: ["Mezzi"],
};
const base = {
  order: { id: "o", order_code: "C-1", total_amount: 1000, vat_rate: 22, client_name: "Rossi Mario", client_email: "r@x.it", indirizzo_lavori: "Via Roma 1", tipo_lavoro: "rifacimento_tetto", internal_notes: "NOTA-INTERNA" },
  items: [{ id: "i1", name: "Piastrelle", quantity: 1, unit_price: 100, purchase_price: 70, natura_riga: "materiale", status: "ordinato" }, { id: "i2", name: "Posa", quantity: 1, unit_price: 50, natura_riga: "lavorazione" }],
  salList: [{ numero_sal: 1, stato: "firmato", importo_totale: 500, data_emissione: "2026-01-20", sal_voci: [{ descrizione: "Voce di SAL", importo_contrattuale: 1000, percentuale_avanzamento: 50, importo_sal: 500 }] }],
  purchaseOrders: [{ oda_number: "ODA-9", status: "ricevuto", total: 70, suppliers: { name: "Forniture Spa" } }],
  salespeople: [{ commission_type: "percentage_sold", commission_value: 10, commission_amount: 80, deduction_amount: 5, salesperson: { first_name: "Vera", last_name: "Vendita" } }],
  giornaleLavori: [
    { data_lavori: "2026-01-02", lavorazioni_eseguite: "Lavori pubblici", materiali_utilizzati: "Cemento", visibile_cliente: true, note: "NOTA-GIORNALE" },
    { data_lavori: "2026-01-03", lavorazioni_eseguite: "GIORNALE-NASCOSTO", visibile_cliente: false },
  ],
  varianti: [{ titolo: "Variante buona", status: "approvato", importo: 100 }, { titolo: "VARIANTE-RIFIUTATA", status: "rifiutato", importo: 1 }],
  diaryMessages: [{ channel: "email", subject: "MESSAGGIO-INTERNO", created_at: "2026-01-01" }],
  campoAssignments: [{ user: { first_name: "Otto", last_name: "Operaio" }, role_type: "employee", is_capocantiere: false }],
  dati,
};

describe("Riepilogo commessa: il documento", () => {
  it("interno: tutte le sezioni, i dati corretti e i difetti di prima non ci sono più", () => {
    const t = leggi(createOrdinePDFDocument({ ...base, showCosts: true, showMargins: true }));
    for (const atteso of [
      "Rossi Mario", "Via Roma 1", "Rifacimento tetto", "Ceramiche Rossi", "Fasi di lavorazione", "Scavi", "FT-77", "Fatture al cliente", "Ditta Sub Srl",
      "Mario Operaio", "DDT-5", "Chiamare il geometra", "contratto-riservato.pdf", "Ispezione", "Voce di SAL", "Firmato", "50%", "Ricevuto", "Cemento", "IN QUESTO DOCUMENTO",
      "NOTA-INTERNA", "Non è stato possibile leggere: Mezzi", "Senza dati registrati a oggi",
    ]) expect(t).toContain(atteso);
    expect(t).toContain("75,00"); // provvigione: registrata 80 meno 5, non il 10% ricalcolato
  });

  it("per il cliente non esce niente di interno, anche se il chiamante glielo passa", () => {
    const t = leggi(createOrdinePDFDocument({ ...base, perCliente: true, showCosts: true, showMargins: true }));
    for (const interno of [
      "NOTA-INTERNA", "NOTA-FASE-INTERNA", "NOTA-GIORNALE", "NOTA-CANTIERE-INTERNA", "ERRORE-INTERNO", "GIORNALE-NASCOSTO", "VARIANTE-RIFIUTATA", "MESSAGGIO-INTERNO",
      "Costo Acq.", "Margine", "Fornitore", "Ceramiche Rossi", "Ditta Sub Srl", "Forniture Spa", "ODA-9", "Vera", "Provvigioni", "Otto", "Personale Cantiere", "Mario Operaio",
      "Chiamare il geometra", "contratto-riservato.pdf", "Ispezione", "DDT-5", "Non è stato possibile",
    ]) expect(t).not.toContain(interno);
    for (const visibile of ["Rossi Mario", "Via Roma 1", "Piastrelle", "Fasi di lavorazione", "Scavi", "FT-77", "Voce di SAL", "Lavori pubblici", "Variante buona"]) expect(t).toContain(visibile);
  });

  it("cronoprogramma nel documento; se nessuna fase ha date non esce", () => {
    const conDate = leggi(createOrdinePDFDocument({ ...base, perCliente: true }));
    expect(conDate).toContain("Cronoprogramma");
    expect(conDate).toContain("Impresa Verdi");
    const senza = leggi(createOrdinePDFDocument({ ...base, perCliente: true, dati: { ...dati, fasi: [{ id: "f1", name: "Scavi" }] } }));
    expect(senza).not.toContain("Cronoprogramma");
  });

  it("le parti tolte non escono, anche dall'indice", () => {
    const t = leggi(createOrdinePDFDocument({ ...base, showCosts: true, showMargins: true, gruppi: ["programma", "sal"] }));
    for (const v of ["Scavi", "Voce di SAL"]) expect(t).toContain(v);
    for (const v of ["Piastrelle", "FT-77", "Mario Operaio", "Chiamare il geometra", "NOTA-INTERNA", "Lavori pubblici", "Allegati 1", "Rapportini"]) expect(t).not.toContain(v);
  });

  it("chi non vede costi e margini non li trova neppure nel documento interno", () => {
    const t = leggi(createOrdinePDFDocument({ ...base, showCosts: false, showMargins: false }));
    for (const v of ["Costo Acq.", "Margine", "ODA-9", "Provvigioni"]) expect(t).not.toContain(v);
  });
});
