/**
 * Persone, ditte, mezzi e acquisti (fase 4, lotti 4.1–4.3): le proposte, le disponibilità vere
 * e le bozze, fino alla scrittura. Dati inventati.
 */
import { describe, it, expect } from "vitest";
import type { Frammento, PianoCommessa, Valore } from "../../../shared/silvio-commessa/piano.ts";
import { applica, fondi, pianoVuoto } from "../../../shared/silvio-commessa/fondi.ts";
import {
  contrattiDelleDitte, dataOrdine, documentiDitta, fasiDiLavoro, FONTE_RISORSE, frammentoDaOfferta, mezzoOccupato,
  personaOccupata, proposteRisorse, riassuntoRisorse,
  type ContestoRisorse, type DittaDelPiano, type MezzoDelPiano, type OdaDelPiano, type PersonaDelPiano,
} from "../../../shared/silvio-commessa/risorse.ts";
import { aggiungiGiorni, oggiInItalia, siSovrappongono } from "../../../shared/silvio-commessa/date.ts";
import { scritturaDalPiano } from "@/lib/silvio-commessa/scrittura";
import { oggiIso } from "@/lib/silvio-commessa/daCompletare";

const AZIENDA = "d2000000-0000-4000-a000-000000000002";
const id = (n: number) => `${String(n).padStart(8, "0")}-0000-4000-a000-000000000000`;
const [MARIO, LUCA, ANNA] = [id(1), id(2), id(3)];
const [IDRAULICA, IDRAULICA_BIS, ELETTRICA] = [id(11), id(12), id(13)];
const [SUB_IDR, SUB_IDR_BIS] = [id(21), id(22)];
const [ESCAVATORE, BETONIERA] = [id(31), id(32)];
const [FORNITORE] = [id(41)];
const CAPO = id(51);

const v = (valore: unknown, extra: Partial<Valore> = {}): Omit<Valore, "fonte"> => ({ valore, fiducia: 1, stato: "fatto", ...extra });

function pianoConFasi(fasi: unknown[], extra: Frammento["aree"] = {}): PianoCommessa {
  return fondi(pianoVuoto(AZIENDA), {
    fonte: { tipo: "computo", id: "c-1", etichetta: "Computo bagno" },
    aree: {
      fasi: { "fasi.order_work_phases": v(fasi), "fasi.work_start_date": v("2026-12-01") },
      cliente: { "cliente.nome": v({ client_name: "Cliente Prova" }), "cliente.contatto": v({ client_email: "cliente@example.invalid" }) },
      identita: { "identita.description": v("Bagno di prova") },
      ...extra,
    },
  });
}

const FASI = [
  { name: "Demolizioni", start_date: "2026-12-01", end_date: "2026-12-03", sottofasi: [{ name: "Demolizione pavimento", quantita: 20, unita: "mq", costo: 400 }] },
  { name: "Impianto idraulico", start_date: "2026-12-07", end_date: "2026-12-11", sottofasi: [{ name: "Tubazioni multistrato", quantita: 30, unita: "m", costo: 500 }, { name: "Manodopera impianto", quantita: 1, unita: "a corpo", costo: 900 }] },
  { name: "Impianto elettrico", start_date: "2026-12-14", end_date: "2026-12-16", sottofasi: [] },
];

function contesto(over: Partial<ContestoRisorse> = {}): ContestoRisorse {
  return {
    oggi: "2026-11-02",
    dipendenti: [{ id: MARIO, nome: "Mario Prova", attivo: true }, { id: LUCA, nome: "Luca Prova", attivo: true }, { id: ANNA, nome: "Anna Prova", attivo: false }],
    storicoDipendenti: [
      { employee_id: MARIO, fase: "DEMOLIZIONI" }, { employee_id: MARIO, fase: "Demolizione" }, { employee_id: LUCA, fase: "Demolizioni bagno" },
      { employee_id: ANNA, fase: "Demolizioni" },
    ],
    impegniDipendenti: [],
    assenze: [],
    staff: [{ id: CAPO, nome: "Carlo Capo" }],
    capomastri: [CAPO, CAPO, id(99)],
    ditte: [
      { id: IDRAULICA, nome: "Idraulica Prova", subappaltatore_id: SUB_IDR },
      { id: IDRAULICA_BIS, nome: "Idraulica Bis", subappaltatore_id: SUB_IDR_BIS },
      { id: ELETTRICA, nome: "Elettrica Prova", subappaltatore_id: null },
    ],
    storicoDitte: [
      { external_team_id: IDRAULICA, fase: "IMPIANTO IDRAULICO" }, { external_team_id: IDRAULICA, fase: "Impianti idraulici" },
      { external_team_id: IDRAULICA_BIS, fase: "Impianto idraulico" },
      { external_team_id: ELETTRICA, fase: "Impianto elettrico" },
    ],
    documentiDitte: [
      { subappaltatore_id: SUB_IDR, tipo: "durc", scadenza: "2027-01-31" },
      { subappaltatore_id: SUB_IDR_BIS, tipo: "durc", scadenza: "2027-03-31" },
    ],
    mezzi: [
      { id: ESCAVATORE, nome: "Miniescavatore", stato: "in_servizio", gestione: "singola", quantita_totale: null },
      { id: BETONIERA, nome: "Betoniera", stato: "in_servizio", gestione: "singola", quantita_totale: null },
    ],
    storicoMezzi: [{ mezzo_id: ESCAVATORE, fase: "Demolizioni" }, { mezzo_id: BETONIERA, fase: "Demolizioni" }],
    impegniMezzi: [],
    fornitori: [{ id: FORNITORE, nome: "Termoidraulica Prova", lead_time_days: 10 }],
    storicoAcquisti: [{ supplier_id: FORNITORE, descrizione: "Tubazioni multistrato 16 mm" }],
    ...over,
  };
}

const elenco = <T,>(fr: Frammento | null, area: keyof Frammento["aree"], chiave: string) =>
  (fr?.aree[area]?.[chiave]?.valore ?? []) as T[];

describe("Le date sono in ora italiana", () => {
  it("dopo mezzanotte a Roma è già domani, anche se in UTC è ancora ieri", () => {
    expect(oggiInItalia(new Date("2026-11-01T23:30:00Z"))).toBe("2026-11-02");
    expect(oggiInItalia(new Date("2026-07-15T22:10:00Z"))).toBe("2026-07-16");
    expect(oggiIso(new Date("2026-11-01T23:30:00Z"))).toBe("2026-11-02");
  });
  it("conti fra date di calendario", () => {
    expect(aggiungiGiorni("2026-03-01", -1)).toBe("2026-02-28");
    expect(siSovrappongono({ dal: "2026-12-01", al: "2026-12-03" }, { dal: "2026-12-03", al: "2026-12-05" })).toBe(true);
    expect(siSovrappongono({ dal: "2026-12-01", al: "2026-12-02" }, { dal: "2026-12-03", al: null })).toBe(false);
    expect(siSovrappongono({ dal: null, al: null }, { dal: "2026-12-03", al: null })).toBe(false);
  });
});

describe("4.1 Proposte gialle", () => {
  it("propone chi ha fatto fasi simili, il capomastro dallo staff, ditte, mezzi e ordini", () => {
    const fr = proposteRisorse(pianoConFasi(FASI), contesto())!;
    expect(fr.fonte).toEqual(FONTE_RISORSE);
    const persone = elenco<PersonaDelPiano>(fr, "persone", "persone.squadra");
    expect(persone.map((p) => [p.nome, p.fase])).toEqual([["Mario Prova", "Demolizioni"], ["Luca Prova", "Demolizioni"]]);
    // Anna non è attiva: non si propone.
    expect(persone.some((p) => p.employee_id === ANNA)).toBe(false);
    expect(fr.aree.persone?.["persone.capomastro"]?.valore).toBe(CAPO);

    const ditte = elenco<DittaDelPiano>(fr, "ditte", "ditte.assegnate");
    const idraulico = ditte.find((d) => d.fase === "Impianto idraulico")!;
    expect(idraulico).toMatchObject({ external_team_id: IDRAULICA, stato: "proposta", costo_previsto: 900 });

    const mezzi = elenco<MezzoDelPiano>(fr, "mezzi", "mezzi.allocazioni");
    expect(mezzi).toEqual([expect.objectContaining({ mezzo_id: ESCAVATORE, dal: "2026-12-01", al: "2026-12-03", stato: "proposta" })]);

    const oda = elenco<OdaDelPiano>(fr, "materiali", "materiali.acquisti");
    expect(oda).toEqual([expect.objectContaining({
      supplier_id: FORNITORE, fase: "Impianto idraulico", data_consegna: "2026-12-07", data_ordine: "2026-11-27", giorni_consegna: 10,
    })]);
    expect(oda[0].righe).toEqual([{ descrizione: "Tubazioni multistrato", quantita: 30, unita: "m", prezzo: null }]);
    // Tutte proposte da confermare, mai «fatto».
    for (const area of Object.values(fr.aree)) for (const x of Object.values(area ?? {})) expect(x.stato).toBe("proposta");
    expect(riassuntoRisorse(fr)).toMatch(/Ti propongo 2 persone, 1 ditta, 1 mezzo, 1 ordine in bozza.*⚠ Uno non è disponibile/);
  });

  it("il capomastro si sceglie solo fra lo staff: un id che non è staff (un cliente) non si propone", () => {
    const fr = proposteRisorse(pianoConFasi(FASI), contesto({ staff: [], capomastri: [CAPO, CAPO] }))!;
    expect(fr.aree.persone?.["persone.capomastro"]).toBeUndefined();
  });

  it("quello che la persona ha scritto o accettato non si ripropone; rifare le proposte non crea conflitti", () => {
    let piano = pianoConFasi(FASI);
    const fr = proposteRisorse(piano, contesto())!;
    piano = fondi(piano, fr);
    expect(proposteRisorse(piano, contesto())!.aree).toEqual(fr.aree);
    expect(fondi(piano, proposteRisorse(piano, contesto())!).conflitti).toEqual([]);

    // «Va bene» sulla squadra: diventa della persona, e Silvio non la tocca più.
    const accettata = applica(piano, { tipo: "cambia_valore", area: "persone", chiave: "persone.squadra", valore: piano.aree.persone!["persone.squadra"].valore }).piano;
    const dopo = proposteRisorse(accettata, contesto({ storicoDipendenti: [{ employee_id: LUCA, fase: "Demolizioni" }] }))!;
    expect(dopo.aree.persone?.["persone.squadra"]).toBeUndefined();
  });

  it("senza fasi non si propone niente; senza date si propone ma lo si dice", () => {
    expect(proposteRisorse(pianoVuoto(AZIENDA), contesto())).toBeNull();
    // Senza l'inizio lavori: con l'inizio, `fondi` dà le date alle fasi che hanno la durata.
    const senzaInizio = fondi(pianoVuoto(AZIENDA), {
      fonte: { tipo: "computo", id: "c-1", etichetta: "Computo bagno" },
      aree: { fasi: { "fasi.order_work_phases": v([{ name: "Demolizioni", giorni: 3, giorno_inizio: 1 }]) } },
    });
    const fr = proposteRisorse(senzaInizio, contesto())!;
    const [p] = elenco<PersonaDelPiano>(fr, "persone", "persone.squadra");
    expect(p).toMatchObject({ stato: "proposta", dal: null, avviso: expect.stringMatching(/non hanno ancora le date/) });
  });

  it("in «completa» le date proposte alle fasi della commessa valgono per le disponibilità", () => {
    const ordine = id(70);
    let piano = fondi(pianoVuoto(AZIENDA, ordine), {
      fonte: { tipo: "persona", id: ordine, etichetta: "commessa O-0001" },
      aree: { fasi: { "fasi.order_work_phases": v([{ id: id(71), name: "Demolizioni" }]) } },
    });
    piano = fondi(piano, {
      fonte: { tipo: "modello", etichetta: "modello bagno" },
      aree: { fasi: { "fasi.order_work_phases": v([{ name: "Demolizioni", start_date: "2026-12-01", end_date: "2026-12-03" }]) } },
    });
    expect(fasiDiLavoro(piano)).toEqual([{ nome: "Demolizioni", dal: "2026-12-01", al: "2026-12-03", sottofasi: [] }]);
  });
});

describe("4.2 Disponibilità vere", () => {
  it("una persona già su un'altra commessa nelle stesse date non si propone: si prende la prossima", () => {
    const ctx = contesto({ impegniDipendenti: [{ employee_id: MARIO, commessa: "O-0099", dal: "2026-12-02", al: "2026-12-10" }] });
    expect(personaOccupata(ctx, MARIO, "2026-12-01", "2026-12-03")).toBe("è già sulla commessa O-0099 dal 02/12 al 10/12");
    const persone = elenco<PersonaDelPiano>(proposteRisorse(pianoConFasi(FASI), ctx), "persone", "persone.squadra");
    expect(persone.map((p) => p.nome)).toEqual(["Luca Prova"]);
  });

  it("se sono tutti impegnati o assenti resta il migliore, segnato ⚠, e la scrittura lo lascia fuori", () => {
    const ctx = contesto({
      impegniDipendenti: [{ employee_id: MARIO, commessa: "O-0099", dal: "2026-11-30", al: "2026-12-05" }],
      assenze: [{ employee_id: LUCA, dal: "2026-12-01", al: "2026-12-01", tipo: "ferie" }],
    });
    const fr = proposteRisorse(pianoConFasi(FASI), ctx)!;
    const persone = elenco<PersonaDelPiano>(fr, "persone", "persone.squadra");
    expect(persone).toEqual([expect.objectContaining({ employee_id: MARIO, stato: "attenzione", avviso: expect.stringMatching(/Mario Prova è già sulla commessa O-0099/) })]);
    expect(fr.aree.persone?.["persone.squadra"]?.nota).toMatch(/⚠ Uno non è disponibile/);
    expect(personaOccupata(ctx, LUCA, "2026-12-01", "2026-12-03")).toBe("è assente (ferie) dal 01/12");

    const accettato = applica(fondi(pianoConFasi(FASI), fr), {
      tipo: "cambia_valore", area: "persone", chiave: "persone.squadra", valore: persone,
    }).piano;
    const s = scritturaDalPiano(accettato);
    expect(s.squadra).toEqual([]);
    expect(s.escluse).toContainEqual(expect.objectContaining({ chiave: "persone.squadra", motivo: expect.stringMatching(/^Mario Prova: Mario Prova è già/) }));
  });

  it("nessuna proposta mette la stessa persona in due cantieri lo stesso giorno", () => {
    const impegni = [
      { employee_id: MARIO, commessa: "O-0001", dal: "2026-12-01", al: "2026-12-01" },
      { employee_id: LUCA, commessa: "O-0002", dal: "2026-12-03", al: "2026-12-20" },
    ];
    const ctx = contesto({ impegniDipendenti: impegni, storicoDipendenti: [
      ...contesto().storicoDipendenti, { employee_id: LUCA, fase: "Impianto elettrico" }, { employee_id: MARIO, fase: "Impianto elettrico" },
    ] });
    const persone = elenco<PersonaDelPiano>(proposteRisorse(pianoConFasi(FASI), ctx), "persone", "persone.squadra");
    for (const p of persone.filter((x) => x.stato === "proposta")) {
      for (const i of impegni.filter((x) => x.employee_id === p.employee_id)) {
        expect(siSovrappongono({ dal: p.dal ?? null, al: p.al ?? null }, i)).toBe(false);
      }
    }
    expect(persone.some((p) => p.stato === "proposta")).toBe(true);
  });

  it("un mezzo prenotato, in officina o fuori servizio è ⚠; le fasi con lo stesso mezzo diventano una prenotazione sola", () => {
    const ctx = contesto({
      impegniMezzi: [{ mezzo_id: ESCAVATORE, commessa: "O-0007", dal: "2026-12-02", al: null, quantita: 1 }],
      mezzi: [
        { id: ESCAVATORE, nome: "Miniescavatore", stato: "in_servizio", gestione: "singola", quantita_totale: null },
        { id: BETONIERA, nome: "Betoniera", stato: "in_officina", gestione: "singola", quantita_totale: null },
      ],
    });
    expect(mezzoOccupato(ctx, ESCAVATORE, "2026-12-01", "2026-12-03")).toBe("è già prenotato per la commessa O-0007 dal 02/12");
    expect(mezzoOccupato(ctx, BETONIERA, "2026-12-01", "2026-12-03")).toBe("è in officina");
    const [m] = elenco<MezzoDelPiano>(proposteRisorse(pianoConFasi(FASI), ctx), "mezzi", "mezzi.allocazioni");
    expect(m).toMatchObject({ mezzo_id: ESCAVATORE, stato: "attenzione", avviso: expect.stringMatching(/O-0007/) });

    const unite = proposteRisorse(pianoConFasi(FASI), contesto({ storicoMezzi: [
      { mezzo_id: ESCAVATORE, fase: "Demolizioni" }, { mezzo_id: ESCAVATORE, fase: "Impianto idraulico" },
    ] }));
    expect(elenco<MezzoDelPiano>(unite, "mezzi", "mezzi.allocazioni")).toEqual([
      expect.objectContaining({ mezzo_id: ESCAVATORE, fasi: ["Demolizioni", "Impianto idraulico"], dal: "2026-12-01", al: "2026-12-11" }),
    ]);
  });

  it("un mezzo a quantità è libero finché ne restano", () => {
    const ctx = contesto({
      mezzi: [{ id: BETONIERA, nome: "Ponteggio", stato: "in_servizio", gestione: "quantita", quantita_totale: 3 }],
      impegniMezzi: [{ mezzo_id: BETONIERA, commessa: "O-0003", dal: "2026-12-01", al: "2026-12-31", quantita: 2 }],
    });
    expect(mezzoOccupato(ctx, BETONIERA, "2026-12-05", "2026-12-06")).toBeNull();
    expect(mezzoOccupato(ctx, BETONIERA, "2026-12-05", "2026-12-06", 2)).toBe("ne restano 1 su 3 in quei giorni");
  });

  it("una ditta senza DURC valido per tutta la fase, o con documenti scaduti, non si propone: si cerca un'altra", () => {
    const ditta = (n: number) => contesto().ditte[n];
    const scaduto = contesto({ documentiDitte: [{ subappaltatore_id: SUB_IDR, tipo: "durc", scadenza: "2026-12-08" }] });
    expect(documentiDitta(scaduto, ditta(0), "2026-12-11")).toBe("il DURC scade il 08/12, prima della fine della fase");
    expect(documentiDitta(contesto({ documentiDitte: [{ subappaltatore_id: SUB_IDR, tipo: "durc", scadenza: "2026-10-01" }] }), ditta(0), null))
      .toBe("il DURC è scaduto il 01/10");
    expect(documentiDitta(contesto({ documentiDitte: [{ subappaltatore_id: SUB_IDR, tipo: "durc", scadenza: "2027-01-01", esito: "irregolare" }] }), ditta(0), null))
      .toBe("il DURC risulta irregolare");
    expect(documentiDitta(contesto({ documentiDitte: [
      { subappaltatore_id: SUB_IDR, tipo: "durc", scadenza: "2027-01-31" }, { subappaltatore_id: SUB_IDR, tipo: "visura", scadenza: "2026-09-30" },
    ] }), ditta(0), null)).toBe("ha documenti scaduti: visura camerale");
    expect(documentiDitta(contesto(), ditta(2), null)).toBe("non è collegata a un subappaltatore: non ha un DURC da controllare");

    const ditte = elenco<DittaDelPiano>(proposteRisorse(pianoConFasi(FASI), contesto({ documentiDitte: [
      { subappaltatore_id: SUB_IDR, tipo: "durc", scadenza: "2026-12-08" }, { subappaltatore_id: SUB_IDR_BIS, tipo: "durc", scadenza: "2027-03-31" },
    ] })), "ditte", "ditte.assegnate");
    expect(ditte.find((d) => d.fase === "Impianto idraulico")).toMatchObject({
      external_team_id: IDRAULICA_BIS, stato: "proposta", motivo: expect.stringMatching(/Idraulica Prova, che la fa più spesso, il DURC scade il 08\/12/),
    });
    // L'elettricista non ha un subappaltatore: nessun'altra ditta, resta ⚠.
    expect(ditte.find((d) => d.fase === "Impianto elettrico")).toMatchObject({ external_team_id: ELETTRICA, stato: "attenzione" });
  });
});

describe("4.3 Bozze rosse, mai inviate", () => {
  it("la data d'ordine viene dai tempi di consegna; un ordine in ritardo ha l'avviso ma resta proponibile", () => {
    expect(dataOrdine("2026-12-07", 10)).toBe("2026-11-27");
    expect(dataOrdine("2026-12-07", null)).toBe("2026-12-07");
    expect(dataOrdine(null, 10)).toBeNull();
    const [o] = elenco<OdaDelPiano>(proposteRisorse(pianoConFasi(FASI), contesto({ oggi: "2026-11-30" })), "materiali", "materiali.acquisti");
    expect(o).toMatchObject({ stato: "proposta", avviso: "da ordinare subito, andava ordinato entro il 27 nov: chiedi al fornitore se ce la fa" });
  });

  it("il contratto c'è per ogni ditta proponibile, con l'elenco dei lavori; la ditta senza subappaltatore è ⚠", () => {
    const fasi = fasiDiLavoro(pianoConFasi(FASI));
    const contratti = contrattiDelleDitte([
      { external_team_id: IDRAULICA, nome: "Idraulica Prova", fase: "Impianto idraulico", costo_previsto: 900, subappaltatore_id: SUB_IDR, motivo: "", stato: "proposta" },
      { external_team_id: ELETTRICA, nome: "Elettrica Prova", fase: "Impianto elettrico", costo_previsto: 300, subappaltatore_id: null, motivo: "", stato: "proposta" },
      { external_team_id: IDRAULICA_BIS, nome: "Idraulica Bis", fase: "Demolizioni", costo_previsto: 0, subappaltatore_id: SUB_IDR_BIS, motivo: "", stato: "attenzione" },
    ], fasi);
    expect(contratti).toHaveLength(2);
    expect(contratti[0]).toMatchObject({
      external_team_id: IDRAULICA, importo: 1400, dal: "2026-12-07", al: "2026-12-11", stato: "proposta",
      elenco: [
        { fase: "Impianto idraulico", descrizione: "Tubazioni multistrato", unita: "m", quantita: 30, prezzo: 16.67, importo: 500, codice: null },
        { fase: "Impianto idraulico", descrizione: "Manodopera impianto", unita: "a corpo", quantita: 1, prezzo: 900, importo: 900, codice: null },
      ],
    });
    // Fase senza voci: entra a corpo col suo costo previsto.
    expect(contratti[1]).toMatchObject({ stato: "attenzione", importo: 300, elenco: [expect.objectContaining({ unita: "a corpo", importo: 300 })] });
  });

  it("promemoria di POS e DUVRI prima dell'inizio, e il messaggio d'avvio al cliente solo come testo", () => {
    const fr = proposteRisorse(pianoConFasi(FASI), contesto())!;
    const pos = fr.aree.sicurezza?.["sicurezza.pos_duvri"]?.valore as { tipo: string; scadenza: string }[];
    expect(pos.map((p) => [p.tipo, p.scadenza])).toEqual([["pos", "2026-11-24"], ["duvri", "2026-11-24"]]);
    const avvio = fr.aree.comunicazione?.["comunicazione.avvio_cliente"]?.valore as { testo: string; canale: string; destinatario: string; scadenza: string };
    expect(avvio).toMatchObject({ canale: "email", destinatario: "cliente@example.invalid", scadenza: "2026-11-27" });
    expect(avvio.testo).toMatch(/^Buongiorno Cliente Prova,\nle confermiamo l'inizio dei lavori di «Bagno di prova» dal 01\/12\./);
    expect(fr.aree.comunicazione?.["comunicazione.avvio_cliente"]?.nota).toMatch(/Silvio non lo invia/);
  });

  it("un'offerta collegata alla sua richiesta diventa l'ordine in bozza, coi suoi prezzi e i suoi tempi", () => {
    let piano = fondi(pianoConFasi(FASI), proposteRisorse(pianoConFasi(FASI), contesto())!);
    const altro = id(42);
    // Un altro ordine proposto da Silvio resta anche tenendo l'offerta.
    piano = { ...piano, aree: { ...piano.aree, materiali: { "materiali.acquisti": {
      ...piano.aree.materiali!["materiali.acquisti"],
      valore: [...(piano.aree.materiali!["materiali.acquisti"].valore as OdaDelPiano[]), { supplier_id: altro, fornitore: "Altro", fase: null, righe: [], data_consegna: null, data_ordine: null, giorni_consegna: null, motivo: "", stato: "proposta" }],
    } } } };
    const fr = frammentoDaOfferta(
      { righe: [
        { voce_richiesta: "Tubazioni multistrato", prezzo_unitario: 10, sconto_percentuale: 10, aliquota_iva: 22 },
        { voce_richiesta: "Raccordi", prezzo_unitario: 2, disponibile: false },
      ], giorni_consegna: 5 },
      { id: id(61), rfq_number: "RDO-2026-0001", titolo: "Impianto idraulico bagno", supplier_id: FORNITORE, fornitore: "Termoidraulica Prova" },
      piano, { "Tubazioni multistrato": 30 }, "2026-11-02",
    );
    expect(fr.fonte).toMatchObject({ tipo: "offerta", id: id(61), etichetta: "offerta Termoidraulica Prova (RDO-2026-0001)" });
    const oda = fr.aree.materiali!["materiali.acquisti"].valore as OdaDelPiano[];
    expect(oda[0]).toMatchObject({
      supplier_id: FORNITORE, fase: "Impianto idraulico", data_consegna: "2026-12-07", data_ordine: "2026-12-02", giorni_consegna: 5,
      righe: [{ descrizione: "Tubazioni multistrato", quantita: 30, prezzo: 9, iva: 22 }], offerta_id: id(61), avviso: null,
    });
    expect(oda.map((o) => o.supplier_id)).toEqual([FORNITORE, altro]);
    // L'offerta vince sulla proposta di Silvio senza chiedere (revisione 2/11, G12), e l'altro ordine resta.
    const dopo = fondi(piano, fr);
    expect(dopo.conflitti).toEqual([]);
    expect((dopo.aree.materiali!["materiali.acquisti"].valore as OdaDelPiano[]).map((o) => o.supplier_id)).toEqual([FORNITORE, altro]);
  });
});

describe("Dalla bozza alla scrittura", () => {
  const ctx = contesto();
  const base = () => fondi(pianoConFasi(FASI), proposteRisorse(pianoConFasi(FASI), ctx)!);
  const accetta = (p: PianoCommessa, area: keyof PianoCommessa["aree"], chiave: string) =>
    applica(p, { tipo: "cambia_valore", area, chiave, valore: p.aree[area]![chiave].valore }).piano;

  it("le proposte non accettate restano fuori, come «proposta da confermare»", () => {
    const s = scritturaDalPiano(base());
    expect([s.squadra, s.ditte, s.mezzi, s.oda, s.contratti, s.promemoria]).toEqual([[], [], [], [], [], []]);
    expect(s.ordine.capomastro_user_id).toBeUndefined();
    const fuori = s.escluse.filter((e) => e.motivo === "proposta da confermare").map((e) => e.chiave);
    expect(fuori).toEqual(expect.arrayContaining([
      "persone.capomastro", "persone.squadra", "ditte.assegnate", "ditte.contratti", "mezzi.allocazioni", "materiali.acquisti",
      "sicurezza.pos_duvri", "comunicazione.avvio_cliente",
    ]));
  });

  it("accettate entrano, coi ⚠ fuori; il contratto solo per la ditta che entra", () => {
    let p = base();
    for (const [area, chiave] of [
      ["persone", "persone.capomastro"], ["persone", "persone.squadra"], ["ditte", "ditte.contratti"], ["mezzi", "mezzi.allocazioni"],
      ["materiali", "materiali.acquisti"], ["sicurezza", "sicurezza.pos_duvri"], ["comunicazione", "comunicazione.avvio_cliente"],
    ] as const) p = accetta(p, area, chiave);
    // Le ditte NON accettate: il contratto resta fuori.
    let s = scritturaDalPiano(p);
    expect(s.ordine.capomastro_user_id).toBe(CAPO);
    expect(s.squadra).toEqual([{ employee_id: MARIO, fase: "Demolizioni" }, { employee_id: LUCA, fase: "Demolizioni" }]);
    expect(s.mezzi).toEqual([{ mezzo_id: ESCAVATORE, fasi: ["Demolizioni"], dal: "2026-12-01", al: "2026-12-03", quantita: 1 }]);
    expect(s.oda).toEqual([expect.objectContaining({
      supplier_id: FORNITORE, data_ordine: "2026-11-27", data_consegna: "2026-12-07",
      note: "Per la fase «Impianto idraulico». Da ordinare entro il 27/11/2026, per la consegna del 07/12/2026 (tempi del fornitore: 10 giorni). Prezzi da chiedere al fornitore. Preparato da Silvio: va controllato e mandato da qui.",
    })]);
    expect(s.contratti).toEqual([]);
    expect(s.escluse).toContainEqual({ chiave: "ditte.contratti", etichetta: "Contratti delle ditte", motivo: "Idraulica Prova: la ditta non è tra quelle confermate" });
    expect(s.promemoria.map((x) => x.tipo)).toEqual(["pos", "duvri", "avvio_cliente"]);
    expect(s.promemoria[2].testo).toMatch(/^Da mandare per email a cliente@example\.invalid\.\n\nBuongiorno Cliente Prova/);

    p = accetta(p, "ditte", "ditte.assegnate");
    s = scritturaDalPiano(p);
    expect(s.ditte).toEqual([{ external_team_id: IDRAULICA, fase: "Impianto idraulico", costo_previsto: 900 }]);
    // L'elettricista ⚠ (senza DURC) resta fuori col suo motivo.
    expect(s.escluse).toContainEqual(expect.objectContaining({ chiave: "ditte.assegnate", motivo: expect.stringMatching(/^Elettrica Prova \(Impianto elettrico\): Elettrica Prova non è collegata/) }));
    expect(s.contratti).toEqual([expect.objectContaining({ external_team_id: IDRAULICA, importo: 900, descrizione: "Lavorazioni delle fasi: Impianto idraulico." })]);
  });
});
