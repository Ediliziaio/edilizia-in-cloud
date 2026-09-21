/**
 * Il rapporto marketing del mattino nella forma voluta dal titolare
 * (21/09/2026): priorità, schede per brand, definizioni di CAC, ROAS e tasso
 * di chiusura, colori, dati mancanti scritti col motivo.
 */
import { describe, expect, it } from "vitest";
import {
  articoloPercentuale, azioneConsigliata, coloreBrand, costruisciRapporto, esitoPrioritaIeri, euro, indicatori,
  numero, prioritaDelGiorno, sintesi,
  type AzioneRapporto, type ClienteRapporto, type DatiRapporto,
} from "../../../supabase/functions/_shared/rapportoMarketingMattino";

const base: ClienteRapporto = {
  service_client_id: "c1", cliente_nome: "BeMade S.r.l.", stato_cliente: "attivo",
  lead_grezzi_giorno: 71, lead_grezzi_7g: 453, lead_validi_7g: 446,
  spesa_giorno: 974, spesa_7g: 3154, spesa_mese: 3154,
  cpl_valido_7g: 7.07, cpl_target: 11.4, costo_appuntamento_14g: 60.66,
  lead_fermi: 0, lead_fermo_piu_vecchio_ore: 0, mediana_primo_contatto_min_7g: 120, appuntamenti_14g: 52,
  sopralluoghi_30g: 52, vendite_30g: 12,
  vendite_mese: 12, venduto_mese: 22570, provvigione_mese: 677,
  indice_esecuzione: 60, giorni_dall_ultimo_accesso: 1, spesa_disponibile: true,
  meta_stato: "connected", meta_account: true, allarme_max: null, giorni_vendite_mese: 4,
};
const cliente = (x: Partial<ClienteRapporto> = {}): ClienteRapporto => ({ ...base, ...x });

const allarme = (x: Partial<AzioneRapporto> = {}): AzioneRapporto => ({
  id: "a1", service_client_id: "c1", cliente_nome: "BeMade S.r.l.", regola: "R3", gravita: "grave",
  titolo: "57 lead fermi contemporaneamente",
  azione: "Chiamare il titolare, non il referente: si apre la conversazione sul patto operativo (script 1)",
  proprietario: "noi", scadenza: "2026-09-12T21:03:37Z", aperto_il: "2026-09-11T08:00:00Z",
  dettaglio: { lead_fermi: 57, fermo_ore: 143 }, ...x,
});

const rapporto = (x: Partial<DatiRapporto> = {}): DatiRapporto => ({
  giorno: "2026-09-21", clienti: [cliente()], azioni: [], priorita_ieri: [],
  denaro: { provvigioni_mese: 677, fatture_scadute: [] }, ...x,
});

describe("numeri come li scrive il titolare", () => {
  it("il punto delle migliaia anche sotto le cinque cifre", () => {
    expect(euro(1099)).toBe("1.099 €");
    expect(euro(16230.75, 2)).toBe("16.230,75 €");
    expect(euro(7.07, 2)).toBe("7,07 €");
    expect(numero(181551)).toBe("181.551");
  });
  it("l'articolo davanti alla percentuale", () => {
    expect(articoloPercentuale(80)).toBe("l'80%");
    expect(articoloPercentuale(11)).toBe("l'11%");
    expect(articoloPercentuale(23)).toBe("il 23%");
  });
});

describe("colore del brand", () => {
  it("rosso con un allarme grave, o con Meta mancante o scaduto", () => {
    expect(coloreBrand(cliente({ allarme_max: "grave" }))).toBe("rosso");
    expect(coloreBrand(cliente({ meta_stato: null }))).toBe("rosso");
    expect(coloreBrand(cliente({ meta_stato: "token_expired" }))).toBe("rosso");
  });
  it("arancione con allarmi rossi o gialli, CPL sopra il target, spesa illeggibile o zero contratti", () => {
    expect(coloreBrand(cliente({ allarme_max: "rosso" }))).toBe("arancione");
    expect(coloreBrand(cliente({ cpl_valido_7g: 23.3 }))).toBe("arancione");
    expect(coloreBrand(cliente({ spesa_disponibile: false }))).toBe("arancione");
    expect(coloreBrand(cliente({ vendite_mese: 0, venduto_mese: 0 }))).toBe("arancione");
  });
  it("verde quando va tutto bene, pausa fuori dal conto", () => {
    expect(coloreBrand(cliente())).toBe("verde");
    expect(coloreBrand(cliente({ stato_cliente: "pausa", allarme_max: "grave" }))).toBe("pausa");
  });
});

describe("definizioni concordate", () => {
  it("CAC, ROAS e tasso di chiusura", () => {
    const i = indicatori(cliente({ spesa_mese: 3000, vendite_mese: 12, venduto_mese: 24000, vendite_30g: 12, sopralluoghi_30g: 48 }));
    expect(i.cac).toBe(250);
    expect(i.roas).toBe(8);
    expect(i.tassoChiusura).toBe(25);
  });
  it("con la spesa separata CAC e ROAS usano solo quella lead generation", () => {
    const i = indicatori(cliente({ spesa_mese: 3000, spesa_lead_mese: 2400, obiettivi_noti: true, vendite_mese: 12, venduto_mese: 24000 }));
    expect(i.cac).toBe(200);
    expect(i.roas).toBe(10);
  });
  it("niente CAC né ROAS senza spesa o senza contratti", () => {
    expect(indicatori(cliente({ spesa_disponibile: false })).cac).toBeNull();
    expect(indicatori(cliente({ vendite_mese: 0, venduto_mese: 0 })).roas).toBeNull();
  });
});

describe("sintesi e azione consigliata", () => {
  it("CPL buono e lead fermi: la lavorazione commerciale è insufficiente", () => {
    const c = cliente({ lead_fermi: 57, lead_fermo_piu_vecchio_ore: 141 });
    expect(sintesi(c)).toContain("lavorazione commerciale è insufficiente");
    expect(azioneConsigliata(c)).toBe("Recuperare oggi i 57 lead fermi e assegnare un responsabile con un tempo massimo di prima risposta.");
  });
  it("lead fermi da oltre dieci giorni: si chiama il titolare con un piano a 48 ore", () => {
    expect(azioneConsigliata(cliente({ lead_fermi: 36, lead_fermo_piu_vecchio_ore: 377 })))
      .toBe("Chiamare il titolare e definire un piano operativo per lavorare tutti i lead entro 48 ore.");
  });
  it("Meta scaduto, nessun lead e nessun accesso: tutto in una frase", () => {
    const c = cliente({ meta_stato: "token_expired", giorni_senza_lead: 91, giorni_dall_ultimo_accesso: 14 });
    expect(sintesi(c)).toBe("Collegamento Meta scaduto, nessun lead da 91 giorni e nessun accesso da 14 giorni: le performance pubblicitarie non si possono valutare.");
    expect(azioneConsigliata(c)).toContain("Ripristinare il collegamento Meta");
  });
  it("CPL alto ma contratti: prima di toccare le campagne si verificano CAC e ROAS", () => {
    const c = cliente({ cpl_valido_7g: 23.3, mediana_primo_contatto_min_7g: 60 });
    expect(sintesi(c)).toContain("verificare CAC e ROAS");
    expect(azioneConsigliata(c)).toContain("Verificare attribuzione e sincronizzazione");
  });
  it("prima risposta oltre le 24 ore: viene prima di tutto il resto", () => {
    expect(azioneConsigliata(cliente({ mediana_primo_contatto_min_7g: 2323, cpl_valido_7g: 23.3 })))
      .toBe("Ridurre il tempo di prima risposta: oggi la metà dei lead aspetta più di 39 ore. Poi verificare attribuzione e sincronizzazione prima di modificare le campagne.");
  });
  it("spesa illeggibile per l'account sbagliato, e presenza bassa agli appuntamenti", () => {
    const c = cliente({ spesa_disponibile: false, tasso_presenza_30g: 0.19, motivo_spesa: { breve: "nessuna spesa sull'account scelto", cosaFare: "" } });
    expect(azioneConsigliata(c)).toBe("Verificare l'account pubblicitario selezionato: Meta non vi registra spesa, poi analizzare il basso tasso di presenza agli appuntamenti (19%).");
  });
});

describe("le priorità di oggi", () => {
  it("scritte per chi legge, con responsabile e scadenza in ritardo", () => {
    const [p] = prioritaDelGiorno(rapporto({ azioni: [allarme()] }));
    expect(p.titolo).toBe("57 lead non lavorati");
    expect(p.impatto).toBe("lead già pagati rischiano di non essere convertiti.");
    expect(p.azione).toBe("contattare il titolare e attivare oggi un piano di recupero.");
    expect(p.responsabile).toBe("Flo");
    expect(p.scadenza).toBe("oggi (era prevista per il 12 set)");
    expect(p.aperta_da_giorni).toBe(10);
  });
  it("il lead più vecchio fermo da settimane cambia impatto e azione", () => {
    const c = cliente({ service_client_id: "c2", cliente_nome: "Renova", opp_mese: 54, opp_senza_esito_mese: 43 });
    const [p] = prioritaDelGiorno(rapporto({
      clienti: [c], azioni: [allarme({ service_client_id: "c2", cliente_nome: "Renova", dettaglio: { lead_fermi: 36, fermo_ore: 377 } })],
    }));
    expect(p.impatto).toBe("il lead più vecchio è fermo da 377 ore e l'80% dei lead del mese non ha un esito.");
    expect(p.azione).toBe("chiamare il titolare e ridefinire tempi e responsabilità commerciali.");
  });
  it("una per brand, al massimo tre", () => {
    const clienti = ["c1", "c2", "c3", "c4"].map((id) => cliente({ service_client_id: id, cliente_nome: id }));
    const azioni = [
      allarme({ id: "a1", service_client_id: "c1" }), allarme({ id: "a2", service_client_id: "c1", regola: "R25" }),
      allarme({ id: "a3", service_client_id: "c2" }), allarme({ id: "a4", service_client_id: "c3" }), allarme({ id: "a5", service_client_id: "c4" }),
    ];
    const p = prioritaDelGiorno(rapporto({ clienti, azioni }));
    expect(p.map((x) => x.chiave)).toEqual(["a1", "a3", "a4"]);
  });
  it("un brand rosso col contratto in scadenza passa davanti a tutti", () => {
    const c = cliente({ service_client_id: "c9", cliente_nome: "Ser Style", meta_stato: null, data_fine_contratto: "2026-10-05", giorni_alla_fine_contratto: 14 });
    const p = prioritaDelGiorno(rapporto({ clienti: [cliente(), c], azioni: [allarme()] }));
    expect(p[0].chiave).toBe("rinnovo:c9");
    expect(p[0].titolo).toBe("contratto in scadenza il 5 ott");
    expect(p[1].chiave).toBe("a1");
  });
  it("i brand in pausa non entrano", () => {
    expect(prioritaDelGiorno(rapporto({ clienti: [cliente({ stato_cliente: "pausa" })], azioni: [allarme()] }))).toEqual([]);
  });
});

describe("com'è andata con le priorità di ieri", () => {
  it("risolta, ancora aperta, o scesa sotto le prime tre", () => {
    const oggi = prioritaDelGiorno(rapporto({ azioni: [allarme()] }));
    const esiti = esitoPrioritaIeri([
      { posizione: 1, cliente: "BeMade", titolo: "57 lead non lavorati", chiave: "a1", allarme_chiuso: false, esito: null, giorni_aperta: 10 },
      { posizione: 2, cliente: "Renova", titolo: "36 lead non lavorati", chiave: "a9", allarme_chiuso: true, esito: null, giorni_aperta: 9 },
      { posizione: 3, cliente: "Suntech", titolo: "un lead non lavorato", chiave: "a8", allarme_chiuso: false, esito: null, giorni_aperta: 1 },
    ], oggi);
    expect(esiti.map((e) => e.stato)).toEqual([
      "ancora aperta — aperta da 10 giorni",
      "risolta",
      "ancora aperta, non più tra le prime tre — aperta da 1 giorno",
    ]);
  });
});

describe("l'email", () => {
  it("ha le sezioni del modello, nell'ordine", () => {
    const { html, subject } = costruisciRapporto(rapporto({ clienti: [cliente({ allarme_max: "grave", lead_fermi: 57 })], azioni: [allarme()] }), "https://app.example/console");
    const ordine = ["Riepilogo generale", "PRIORITÀ DI OGGI", "BEMADE S.R.L.", "Campagne Lead Generation", "Awareness e interazione",
      "Gestione commerciale", "Risultati commerciali", "Azione consigliata", "Riepilogo economico", "Apri la console completa"];
    const posizioni = ordine.map((t) => html.indexOf(t));
    expect(posizioni.every((p) => p >= 0)).toBe(true);
    expect([...posizioni].sort((a, b) => a - b)).toEqual(posizioni);
    expect(subject).toBe("Report marketing — 21 set · 1 priorità · 1 brand critico");
  });
  it("finché gli obiettivi Meta non ci sono, l'awareness non si finge zero", () => {
    const { html } = costruisciRapporto(rapporto({ clienti: [cliente({ allarme_max: "rosso" })] }), "u");
    expect(html).toContain("Non ancora separata dalla spesa lead");
    expect(html).toContain("Spesa (tutto l'account) ieri");
  });
  it("con gli obiettivi noti, awareness a parte e fuori dal CPL", () => {
    const c = cliente({
      allarme_max: "rosso", obiettivi_noti: true, spesa_lead_giorno: 900, spesa_aw_giorno: 74, spesa_aw_7g: 291,
      campagne_aw: [{ nome: "TOFU | Video | IG |", obiettivo: "OUTCOME_AWARENESS", spesa: 80 }, { nome: "20 SETTEMBRE", obiettivo: "OUTCOME_ENGAGEMENT", spesa: 211 }],
    });
    const { html } = costruisciRapporto(rapporto({ clienti: [c] }), "u");
    expect(html).toContain("Spesa Lead Generation ieri: <strong>900 €</strong>");
    expect(html).toContain("Campagne attive: <strong>Notorietà, Interazione</strong>");
    expect(html).toContain("Questa spesa non è inclusa nel CPL.");
  });
  it("contratti registrati tutti lo stesso giorno: avvisa su CAC e ROAS", () => {
    const { html } = costruisciRapporto(rapporto({ clienti: [cliente({ allarme_max: "rosso", giorni_vendite_mese: 1 })] }), "u");
    expect(html).toContain("I 12 contratti del mese sono stati registrati tutti lo stesso giorno");
  });
  it("un tasso di chiusura oltre il 100% non si stampa come numero", () => {
    const { html } = costruisciRapporto(rapporto({ clienti: [cliente({ allarme_max: "rosso", vendite_30g: 4, sopralluoghi_30g: 2 })] }), "u");
    expect(html).toContain("non affidabile (4 contratti su 2 sopralluoghi registrati");
  });
  it("i brand verdi stanno in tre righe", () => {
    const { html } = costruisciRapporto(rapporto(), "u");
    expect(html).toContain("🟢 BEMADE S.R.L.");
    expect(html).not.toContain("Gestione commerciale");
  });
});
