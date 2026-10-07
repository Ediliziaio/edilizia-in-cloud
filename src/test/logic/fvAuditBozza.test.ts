/**
 * Bozza locale del wizard Fotovoltaico: quello che il browser salva ogni ~800 ms deve tornare
 * uguale alla riapertura. La bozza è l'unico posto dove stanno le righe non ancora confermate con
 * «Avanti» (manodopera, servizi, prodotti extra): se la rilettura ne butta via una parte, chi
 * ricarica la pagina (o il telefono scarta la scheda) ritrova la Fase 5 vuota senza nessun avviso.
 */
import { isDeepStrictEqual } from "node:util";
import { beforeEach, describe, expect, it } from "vitest";
import { loadPersistedDraft, savePersistedDraft, validatePersistedDraft } from "@/pages/azienda/fotovoltaico/FotovoltaicoWizard/helpers";
import { INITIAL } from "@/pages/azienda/fotovoltaico/FotovoltaicoWizard/constants";
import type { WizardData } from "@/pages/azienda/fotovoltaico/FotovoltaicoWizard/types";

/** Un progetto compilato fino in fondo: ogni campo ha un valore diverso da quello iniziale. */
const COMPILATO: WizardData = {
  cliente_nome: "Ada", cliente_cognome: "Verdi", cliente_telefono: "333 1234567", cliente_email: "ada@example.com", cliente_id: "c-1",
  archetipo: "privato_seconda",
  indirizzo: "Via Roma 1", comune: "Napoli", provincia: "NA", cap: "80100", regione: "Campania", popolazione_comune: 900000,
  latitudine: 40.85, longitudine: 14.26, tipologia_immobile: "villa", superficie_immobile_mq: 120, prima_casa: false,
  consumo_annuo_kwh: 4200, costo_kwh_attuale: 0.27, tariffa_tipo: "bioraria", profilo_consumo: "sera", isee: 18000, numero_figli: 2, reddito_annuo_dichiarato: 35000,
  fonte_dati_tetto: "manuale", ore_sole_annue: 1550, superficie_tetto_disponibile_mq: 60, numero_pannelli_max: 24, potenza_max_kwp: 12,
  qualita_dati_tetto: "alta", imagery_date: "2025-05-01", tetto_mock: true,
  layout_tetto: [{ centro_lat: 40.85, centro_lng: 14.26, orientamento: "PORTRAIT", segment_index: 1 }, { centro_lat: 40.851, centro_lng: 14.261 }],
  azimut_tetto: "SE 152°", inclinazione_tetto: 30, perdita_ombreggiamento_pct: 0.1,
  numero_pannelli_scelti: 20, potenza_kwp: 10.8, con_accumulo: true, capacita_accumulo_kwh: 10, con_wallbox: true, con_ottimizzatori: true,
  pannello_id: "p-1", inverter_id: "i-1", accumulo_id: "a-1", kit_bundle_id: "k-1", kit_nome: "Kit 6 kW", kit_prezzo: 9900,
  prezzo_vendita_manuale: 11000, iva_aliquota: 0.22, layout_overlay: { x: 5, y: -3, rot: 12, cols: 4 }, tariffa_installazione_id: "t-1",
  prodotti_extra: [
    { uid: "u-1", listino_id: "l-1", descrizione: "Wallbox 7 kW", quantita: 1, prezzo_vendita: 900, prezzo_acquisto: 600 },
    { uid: "u-2", listino_id: null, descrizione: "Staffe speciali", quantita: 4, prezzo_vendita: 35, prezzo_acquisto: null },
  ],
  manodopera_righe: [{ tariffa_id: "t-1", descrizione: "Posa pannelli", ore: 16, tariffa_oraria_netta: 25, tariffa_oraria_vendita: 40 }],
  servizi_righe: [{ tipo: "pratiche", descrizione: "Pratica GSE", quantita: 1, prezzo_netto: 200, prezzo_vendita: 350, note_operative: "entro marzo" }],
  finanziamento_modalita: "zero", sconto_tipo: "importo", sconto_valore: 500, tabella_finanziamento_id: "f-1", durata_mesi_scelta: 60,
  modalita_pagamento: { tranche: [{ label: "Acconto", pct: 50 }, { label: "Saldo", pct: 50 }], note: "bonifico", anticipo_pct: 20 },
};

const salvaERilegge = (data: WizardData, step = 5): WizardData | undefined => {
  savePersistedDraft("p1", { step, data, completedSteps: [1, 2, 3, 4] });
  return loadPersistedDraft("p1")?.data;
};

beforeEach(() => window.localStorage.clear());

describe("bozza del wizard Fotovoltaico: salvare e rileggere non perde niente", () => {
  it("la prova copre ogni campo del wizard: un campo nuovo in INITIAL va aggiunto qui, col suo valore", () => {
    expect(Object.keys(COMPILATO).sort()).toEqual(Object.keys(INITIAL).sort());
    // e nessun valore di prova è rimasto uguale a quello iniziale (altrimenti non proverebbe niente)
    const uguali = (Object.keys(INITIAL) as Array<keyof WizardData>).filter((k) => JSON.stringify(COMPILATO[k]) === JSON.stringify(INITIAL[k]));
    expect(uguali).toEqual([]);
  });

  it("un progetto compilato fino in fondo torna identico, campo per campo", () => {
    const riletto = salvaERilegge(COMPILATO);
    expect(riletto).toBeDefined();
    const persi = (Object.keys(COMPILATO) as Array<keyof WizardData>).filter((k) => !isDeepStrictEqual(riletto?.[k], COMPILATO[k]));
    expect(persi).toEqual([]);
    expect(riletto).toEqual(COMPILATO);
  });

  it("le righe di manodopera, servizi e prodotti extra, non ancora confermate con «Avanti», sopravvivono alla ricarica", () => {
    const riletto = salvaERilegge({ ...INITIAL, manodopera_righe: COMPILATO.manodopera_righe, servizi_righe: COMPILATO.servizi_righe, prodotti_extra: COMPILATO.prodotti_extra });
    expect(riletto?.manodopera_righe).toEqual(COMPILATO.manodopera_righe);
    expect(riletto?.servizi_righe).toEqual(COMPILATO.servizi_righe);
    expect(riletto?.prodotti_extra).toEqual(COMPILATO.prodotti_extra);
  });

  it("una bozza senza righe resta senza righe (l'elenco vuoto è un valore, non un campo mancante)", () => {
    const riletto = salvaERilegge({ ...COMPILATO, manodopera_righe: [], servizi_righe: [], prodotti_extra: [] });
    expect(riletto?.manodopera_righe).toEqual([]);
    expect(riletto?.servizi_righe).toEqual([]);
    expect(riletto?.prodotti_extra).toEqual([]);
  });

  it("lo schema di pagamento e l'anticipo scelti nella Fase 6 si rileggono, comprese le tranche", () => {
    const riletto = salvaERilegge({ ...INITIAL, modalita_pagamento: { tranche: [{ label: "Alla firma", pct: 100 }], note: null, anticipo_pct: 30 } }, 6);
    expect(riletto?.modalita_pagamento).toEqual({ tranche: [{ label: "Alla firma", pct: 100 }], note: null, anticipo_pct: 30 });
  });
});

describe("bozza del wizard Fotovoltaico: un file rovinato non fa danni e non inventa righe", () => {
  const conCampo = (campo: string, valore: unknown) => validatePersistedDraft({ step: 5, completedSteps: [], savedAt: Date.now(), data: { ...INITIAL, [campo]: valore } });

  it("un elenco che non è un elenco, o con elementi che non sono righe, si scarta: restano i valori iniziali o le righe valide", () => {
    expect(conCampo("manodopera_righe", "ciao")?.data.manodopera_righe).toEqual([]);
    expect(conCampo("servizi_righe", { a: 1 })?.data.servizi_righe).toEqual([]);
    expect(conCampo("prodotti_extra", [null, 3, "x"])?.data.prodotti_extra).toEqual([]);
    const miste = conCampo("manodopera_righe", [null, COMPILATO.manodopera_righe[0], "x"])?.data.manodopera_righe;
    expect(miste).toEqual(COMPILATO.manodopera_righe);
  });

  it("un numero rovinato in una riga diventa 0 (mai NaN, mai una stringa; una quantità, come dal database, diventa 1), un testo mancante diventa vuoto", () => {
    const righe = conCampo("manodopera_righe", [{ descrizione: 5, ore: "otto", tariffa_oraria_netta: null, tariffa_oraria_vendita: Infinity }])?.data.manodopera_righe;
    expect(righe).toEqual([{ tariffa_id: null, descrizione: "", ore: 0, tariffa_oraria_netta: 0, tariffa_oraria_vendita: 0 }]);
    const extra = conCampo("prodotti_extra", [{ descrizione: "x", quantita: "2", prezzo_vendita: 10 }])?.data.prodotti_extra;
    expect(extra).toEqual([{ listino_id: null, descrizione: "x", quantita: 1, prezzo_vendita: 10, prezzo_acquisto: null }]);
  });

  it("lo schema di pagamento senza tranche valide, o fatto di altro, torna quello di serie", () => {
    expect(conCampo("modalita_pagamento", "50/50")?.data.modalita_pagamento).toEqual(INITIAL.modalita_pagamento);
    expect(conCampo("modalita_pagamento", { tranche: [], note: null })?.data.modalita_pagamento).toEqual(INITIAL.modalita_pagamento);
    expect(conCampo("modalita_pagamento", { note: "x" })?.data.modalita_pagamento).toEqual(INITIAL.modalita_pagamento);
    expect(conCampo("modalita_pagamento", null)?.data.modalita_pagamento).toEqual(INITIAL.modalita_pagamento);
  });

  it("layout dei pannelli e sovrapposizione fatti male si scartano", () => {
    expect(conCampo("layout_tetto", [{ centro_lat: "x", centro_lng: 1 }])?.data.layout_tetto).toBeNull();
    expect(conCampo("layout_tetto", "x")?.data.layout_tetto).toBeNull();
    expect(conCampo("layout_overlay", { x: 1, y: 2 })?.data.layout_overlay).toBeNull();
    expect(conCampo("layout_overlay", "x")?.data.layout_overlay).toBeNull();
  });

  it("sconto e prezzo a corpo che non sono numeri non diventano un prezzo", () => {
    expect(conCampo("sconto_valore", "10")?.data.sconto_valore).toBeNull();
    expect(conCampo("prezzo_vendita_manuale", "11000")?.data.prezzo_vendita_manuale).toBeNull();
    expect(conCampo("kit_prezzo", Number.NaN)?.data.kit_prezzo).toBeNull();
    expect(conCampo("kit_bundle_id", 5)?.data.kit_bundle_id).toBeNull();
  });
});
