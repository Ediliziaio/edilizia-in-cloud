/**
 * Commessa generale dai documenti — catalogo (lotto 0 di docs/piano-commessa-generale-da-documenti.md).
 *
 * Per ogni tipo di commessa generale: quali documenti ci si aspetta, quali campi si cercano e dove
 * finisce ognuno. È la stessa lista che l'estrazione (lotto 3) userà come schema e il grande popup
 * (lotto 4) come elenco delle sezioni. Qui non c'è AI: solo la descrizione di cosa cercare.
 *
 * Le scelte del titolare (§7 del piano, decise il 16/11/2026) stanno in `SCELTE_DECISE`;
 * i campi che ne dipendono lo dicono con `scelta`.
 */

/** Il tipo letto dai documenti: l'appalto si divide in pubblico e privato, gli altri come i modelli. */
export type TipoDaDocumenti = "appalto_pubblico" | "appalto_privato" | "sviluppo" | "compravendita";

export type TipoValore = "testo" | "importo" | "percentuale" | "permille" | "data" | "giorni" | "codice" | "si_no";

/** Dove va il dato alla conferma (§5 del piano). `nuovo:` = colonna o chiave che ancora non esiste. */
export type Destinazione =
  | `generale_contratti.${string}`
  | `generale_contratto_garanzie.${string}`
  | `dati.${string}`
  | `order_riferimenti_pa.${string}`
  | `anagrafica.${string}`
  | `orders.${string}`
  | `nuovo:${string}`
  | "solo_controllo";

export type SezioneId =
  | "generale" | "parti" | "codici" | "figure" | "importi" | "tempi" | "penali"
  | "pagamenti" | "garanzie" | "computo" | "area" | "titolo" | "immobile";

export interface CampoCatalogo {
  chiave: string;
  etichetta: string;
  tipo: TipoValore;
  sezione: SezioneId;
  destinazione: Destinazione;
  /** Dove si trova di solito: aiuta l'utente quando il campo manca. */
  doveCercare?: string;
  /** Il campo segue una delle scelte decise dal titolare (`SCELTE_DECISE`). */
  scelta?: SceltaId;
  /** Dato personale di terzi: non si estrae (piano §2.1, «Tracciabilità»). */
  escluso?: boolean;
  /**
   * Testo che è un identificativo (repertorio, numero di pratica, dati catastali) o una scelta
   * fra poche voci: due scritture diverse sono sempre un conflitto, senza confronto «a somiglianza».
   */
  rigido?: boolean;
}

export interface DocumentoAtteso {
  id: string;
  nome: string;
  /** testo = a pagine (testo nativo o OCR); strutturato = parser senza AI; archivio = solo conservato. */
  lettura: "testo" | "strutturato" | "archivio";
  obbligatorio?: boolean;
  nota?: string;
}

export interface SezioneCatalogo { id: SezioneId; titolo: string; diventa: string }

// ─── Scelte decise dal titolare il 16/11/2026 (§7 del piano) ──────────────────

export type SceltaId = "accordo_quadro" | "capitolato" | "soglia_costo" | "rti" | "penale_due_valori" | "conti_dedicati" | "fasi_subito" | "dove_si_avvia";

/** Le otto scelte, confermate dal titolare il 16/11/2026: la domanda e la regola che vale. */
export const SCELTE_DECISE: Record<SceltaId, { domanda: string; regola: string }> = {
  accordo_quadro: {
    domanda: "Accordo quadro: una commessa generale per l'accordo o una per contratto applicativo?",
    regola: "La generale è l'accordo quadro, con il suo importo massimo; ogni contratto applicativo è una figlia, col proprio CIG derivato, e ne scala l'importo.",
  },
  capitolato: {
    domanda: "Il capitolato speciale si chiede sempre?",
    regola: "È facoltativo: si legge solo se lo carichi, dopo la stima del costo. I campi che stanno lì restano «non trovati», col motivo.",
  },
  soglia_costo: {
    domanda: "Prima di leggere si mostra la stima, o si parte da soli sotto una soglia?",
    regola: "Prima si vede sempre la stima del costo, poi si parte con «Leggi».",
  },
  rti: {
    domanda: "In un raggruppamento, la commessa vale per la nostra quota o per tutto?",
    regola: "La commessa vale per la quota dell'impresa; il totale dell'appalto resta nel contratto.",
  },
  penale_due_valori: {
    domanda: "Se due documenti danno valori diversi, chi vince?",
    regola: "Si sceglie sempre a mano, guardando le due pagine.",
  },
  conti_dedicati: {
    domanda: "Conti dedicati e delegati della tracciabilità si salvano?",
    regola: "Non si leggono: IBAN e codici fiscali di persone si coprono, le pagine con documenti d'identità si escludono.",
  },
  fasi_subito: {
    domanda: "Elenco prezzi e fasi dal computo si creano subito?",
    regola: "Si propongono con le spunte accese e si scrivono alla conferma; si possono togliere.",
  },
  dove_si_avvia: {
    domanda: "Da dove si parte?",
    regola: "Da «Nuova commessa generale» → «Crea dai documenti»; un contratto applicativo si aggiunge a un accordo quadro esistente.",
  },
};

// ─── Sezioni ───────────────────────────────────────────────────────────────────

export const SEZIONI: Record<SezioneId, SezioneCatalogo> = {
  generale: { id: "generale", titolo: "Commessa generale", diventa: "La commessa generale" },
  parti: { id: "parti", titolo: "Committente ed esecutore", diventa: "Anagrafica e scheda Dati" },
  codici: { id: "codici", titolo: "Codici e riferimenti PA", diventa: "Dati appalto e fatturazione PA" },
  figure: { id: "figure", titolo: "Figure", diventa: "Scheda Dati" },
  importi: { id: "importi", titolo: "Importi", diventa: "Contratto" },
  tempi: { id: "tempi", titolo: "Tempi", diventa: "Contratto e date della commessa" },
  penali: { id: "penali", titolo: "Penali", diventa: "Contratto" },
  pagamenti: { id: "pagamenti", titolo: "Anticipazione, SAL e ritenute", diventa: "Contratto e SAL" },
  garanzie: { id: "garanzie", titolo: "Garanzie e polizze", diventa: "Garanzie del contratto" },
  computo: { id: "computo", titolo: "Computo ed elenco prezzi", diventa: "Elenco prezzi e fasi" },
  area: { id: "area", titolo: "Area e titolo edilizio", diventa: "Scheda Dati" },
  titolo: { id: "titolo", titolo: "Titolo edilizio", diventa: "Scheda Dati" },
  immobile: { id: "immobile", titolo: "Immobile", diventa: "Scheda Dati e piano" },
};

// ─── Campi ─────────────────────────────────────────────────────────────────────

const c = (chiave: string, etichetta: string, tipo: TipoValore, sezione: SezioneId, destinazione: Destinazione, extra: Partial<CampoCatalogo> = {}): CampoCatalogo =>
  ({ chiave, etichetta, tipo, sezione, destinazione, ...extra });

const CAMPI_APPALTO_COMUNI: CampoCatalogo[] = [
  c("oggetto", "Oggetto dei lavori", "testo", "generale", "orders.title"),
  c("luogo", "Luogo dei lavori", "testo", "generale", "dati.indirizzo"),
  c("committente", "Committente", "testo", "parti", "anagrafica.cliente"),
  c("committente_piva", "P.IVA o CF del committente", "codice", "parti", "anagrafica.cliente"),
  c("esecutore_forma", "Esecutore (singola, RTI, consorzio)", "testo", "parti", "nuovo:dati.appalto.esecutore", { scelta: "rti" }),
  c("contratto_numero", "Numero o repertorio del contratto", "testo", "codici", "generale_contratti.riferimento", { rigido: true }),
  c("contratto_data", "Data di stipula", "data", "codici", "generale_contratti.data_firma"),
  c("direttore_lavori", "Direttore lavori", "testo", "figure", "dati.appalto.direttore_lavori"),
  c("cse", "Coordinatore sicurezza (CSE)", "testo", "figure", "dati.appalto.cse"),
  c("importo_base", "Importo a base d'asta (soggetto a ribasso)", "importo", "importi", "generale_contratti.importo_base", { doveCercare: "verbale di gara o di consegna, quadro economico" }),
  c("ribasso_pct", "Ribasso", "percentuale", "importi", "generale_contratti.ribasso_pct", { doveCercare: "offerta economica, verbale di aggiudicazione o di consegna" }),
  c("oneri_sicurezza", "Oneri della sicurezza non soggetti a ribasso", "importo", "importi", "generale_contratti.oneri_sicurezza"),
  c("costo_manodopera", "Costo della manodopera", "importo", "importi", "nuovo:generale_contratti.costo_manodopera"),
  c("importo_contrattuale", "Importo contrattuale", "importo", "importi", "solo_controllo"),
  c("corpo_misura", "A corpo o a misura", "testo", "importi", "nuovo:generale_contratti.a_corpo_misura", { rigido: true }),
  c("categorie_soa", "Categorie SOA e importi", "testo", "importi", "nuovo:dati.appalto.categorie_soa"),
  c("durata_giorni", "Durata", "giorni", "tempi", "nuovo:generale_contratti.durata_giorni"),
  c("data_consegna", "Consegna lavori", "data", "tempi", "generale_contratti.data_consegna_lavori", { doveCercare: "verbale di consegna" }),
  c("data_fine_prevista", "Fine lavori prevista", "data", "tempi", "generale_contratti.data_fine_prevista"),
  c("penale_permille", "Penale giornaliera (per mille)", "permille", "penali", "generale_contratti.penale_giornaliera", { scelta: "penale_due_valori" }),
  c("penale_massima_pct", "Penale massima", "percentuale", "penali", "generale_contratti.penale_massima_pct"),
  c("anticipazione_pct", "Anticipazione", "percentuale", "pagamenti", "generale_contratti.anticipazione_pct", { doveCercare: "capitolato speciale", scelta: "capitolato" }),
  c("sal_soglia", "SAL: importo minimo", "importo", "pagamenti", "nuovo:generale_contratti.sal_soglia_importo"),
  c("sal_cadenza_giorni", "SAL: ogni quanti giorni", "giorni", "pagamenti", "nuovo:generale_contratti.sal_cadenza_giorni"),
  c("ritenuta_pct", "Ritenuta di garanzia", "percentuale", "pagamenti", "generale_contratti.ritenuta_pct", { doveCercare: "capitolato speciale", scelta: "capitolato" }),
  c("termini_pagamento_giorni", "Termini di pagamento", "giorni", "pagamenti", "nuovo:generale_contratti.termini_pagamento_giorni", { doveCercare: "capitolato speciale", scelta: "capitolato" }),
  c("cauzione_definitiva", "Cauzione definitiva", "importo", "garanzie", "generale_contratto_garanzie.importo"),
  c("car_somma_lavori", "Polizza CAR: somma assicurata (lavori)", "importo", "garanzie", "generale_contratto_garanzie.importo"),
  c("rct_massimale", "Massimale RCT", "importo", "garanzie", "nuovo:generale_contratto_garanzie.massimale"),
  c("rct_massimale_contratto", "Massimale RCT richiesto dal contratto", "importo", "garanzie", "solo_controllo"),
  c("totale_computo", "Totale del computo dei lavori", "importo", "computo", "solo_controllo"),
  c("totale_sicurezza", "Totale della stima della sicurezza", "importo", "computo", "solo_controllo"),
  c("subappalto", "Subappalto (limiti, pagamento diretto)", "testo", "pagamenti", "generale_contratti.note", { doveCercare: "capitolato speciale", scelta: "capitolato" }),
  c("revisione_prezzi", "Revisione prezzi", "testo", "pagamenti", "nuovo:generale_contratti.revisione_prezzi"),
  c("conti_dedicati", "Conti dedicati e delegati", "testo", "pagamenti", "solo_controllo", { escluso: true, scelta: "conti_dedicati" }),
];

const CAMPI_SOLO_PUBBLICO: CampoCatalogo[] = [
  c("stazione_appaltante", "Stazione appaltante", "testo", "parti", "dati.appalto.stazione_appaltante"),
  c("codice_ipa", "Codice IPA", "codice", "codici", "anagrafica.codice_ipa"),
  c("codice_univoco", "Codice univoco dell'ufficio", "codice", "codici", "order_riferimenti_pa.codice_univoco_ufficio"),
  c("cig", "CIG", "codice", "codici", "generale_contratti.cig"),
  c("cig_accordo", "CIG dell'accordo quadro", "codice", "codici", "nuovo:dati.appalto.cig_accordo", { scelta: "accordo_quadro" }),
  // Accordo quadro: l'importo massimo è il valore della generale; gli applicativi lo scalano.
  c("tetto_accordo", "Importo massimo dell'accordo quadro", "importo", "importi", "generale_contratti.tetto_accordo", { doveCercare: "accordo quadro", scelta: "accordo_quadro" }),
  c("cup", "CUP", "codice", "codici", "generale_contratti.cup"),
  c("rup", "RUP", "testo", "figure", "dati.appalto.rup"),
  c("split_payment", "Scissione dei pagamenti", "si_no", "pagamenti", "generale_contratti.split_payment"),
];

const CAMPI_SOLO_PRIVATO: CampoCatalogo[] = [
  c("acconto", "Acconto alla firma", "importo", "pagamenti", "solo_controllo"),
  c("totale_rate", "Somma delle rate", "importo", "pagamenti", "solo_controllo"),
];

const CAMPI_SVILUPPO: CampoCatalogo[] = [
  c("catasto", "Dati catastali dell'area", "testo", "area", "dati.area.catasto", { rigido: true }),
  c("superficie", "Superficie", "testo", "area", "dati.area.superficie", { rigido: true }),
  c("titolo_tipo", "Titolo edilizio", "testo", "titolo", "dati.titolo.tipo", { rigido: true }),
  c("titolo_numero", "Numero del titolo", "testo", "titolo", "dati.titolo.numero", { rigido: true }),
  c("titolo_data", "Rilasciato il", "data", "titolo", "dati.titolo.data"),
  c("titolo_scadenza", "Fine lavori entro", "data", "titolo", "dati.titolo.scadenza"),
  c("prezzo_area", "Prezzo d'acquisto dell'area", "importo", "area", "solo_controllo"),
];

const CAMPI_COMPRAVENDITA: CampoCatalogo[] = [
  c("immobile_indirizzo", "Indirizzo dell'immobile", "testo", "immobile", "dati.immobile.indirizzo"),
  c("immobile_catasto", "Dati catastali", "testo", "immobile", "dati.immobile.catasto", { rigido: true }),
  c("prezzo_compromesso", "Prezzo nel compromesso", "importo", "immobile", "solo_controllo"),
  c("prezzo_atto", "Prezzo nell'atto", "importo", "immobile", "dati.immobile.prezzo"),
  c("data_compromesso", "Compromesso", "data", "immobile", "dati.immobile.data_compromesso"),
  c("data_rogito", "Rogito", "data", "immobile", "dati.immobile.data_rogito"),
];

// ─── Documenti attesi ──────────────────────────────────────────────────────────

const DOC_COMPUTO: DocumentoAtteso = { id: "computo", nome: "Computo metrico estimativo", lettura: "strutturato", nota: "XPWE, Excel o PDF di PriMus senza AI; una scansione con l'AI." };
const DOC_ELENCO: DocumentoAtteso = { id: "elenco_prezzi", nome: "Elenco prezzi", lettura: "strutturato" };
const DOC_CRONO: DocumentoAtteso = { id: "cronoprogramma", nome: "Cronoprogramma", lettura: "testo" };
const DOC_POLIZZE: DocumentoAtteso = { id: "polizze", nome: "Polizze (CAR/RCT, cauzione)", lettura: "testo" };
const DOC_CAPITOLATO: DocumentoAtteso = { id: "capitolato", nome: "Capitolato speciale", lettura: "testo", nota: "Si leggono solo le clausole economiche." };

const DOCUMENTI: Record<TipoDaDocumenti, DocumentoAtteso[]> = {
  appalto_pubblico: [
    { id: "contratto", nome: "Contratto o contratto applicativo", lettura: "testo", obbligatorio: true },
    { id: "accordo_quadro", nome: "Accordo quadro", lettura: "testo" },
    DOC_CAPITOLATO, DOC_COMPUTO, DOC_ELENCO,
    { id: "sicurezza", nome: "Stima degli oneri della sicurezza", lettura: "strutturato" },
    DOC_CRONO,
    { id: "quadro_economico", nome: "Quadro economico o relazione", lettura: "testo" },
    { id: "verbale_consegna", nome: "Verbale di consegna", lettura: "testo" },
    { id: "offerta", nome: "Offerta economica o verbale di aggiudicazione", lettura: "testo" },
    DOC_POLIZZE,
    { id: "sicurezza_piani", nome: "PSC, POS, DUVRI", lettura: "archivio" },
  ],
  appalto_privato: [
    { id: "contratto", nome: "Contratto d'appalto o scrittura", lettura: "testo", obbligatorio: true },
    DOC_CAPITOLATO, DOC_COMPUTO, DOC_CRONO, DOC_POLIZZE,
  ],
  sviluppo: [
    { id: "atto_area", nome: "Atto d'acquisto dell'area o preliminare", lettura: "testo" },
    { id: "titolo", nome: "Titolo edilizio (PdC, SCIA)", lettura: "testo" },
    { id: "business_plan", nome: "Business plan in Excel", lettura: "strutturato" },
    DOC_COMPUTO,
    { id: "capitolato_vendita", nome: "Capitolato di vendita", lettura: "testo" },
  ],
  compravendita: [
    { id: "atto", nome: "Atto o compromesso", lettura: "testo", obbligatorio: true },
    { id: "visura", nome: "Visura catastale", lettura: "testo" },
    { id: "perizia", nome: "Perizia", lettura: "testo" },
    { id: "preventivi", nome: "Preventivi di ristrutturazione", lettura: "testo" },
  ],
};

const CAMPI: Record<TipoDaDocumenti, CampoCatalogo[]> = {
  appalto_pubblico: [...CAMPI_APPALTO_COMUNI, ...CAMPI_SOLO_PUBBLICO],
  appalto_privato: [...CAMPI_APPALTO_COMUNI, ...CAMPI_SOLO_PRIVATO],
  sviluppo: CAMPI_SVILUPPO,
  compravendita: CAMPI_COMPRAVENDITA,
};

export interface Catalogo {
  tipo: TipoDaDocumenti;
  documenti: DocumentoAtteso[];
  campi: CampoCatalogo[];
}

export function catalogoPer(tipo: TipoDaDocumenti): Catalogo {
  return { tipo, documenti: DOCUMENTI[tipo], campi: CAMPI[tipo] };
}

/** Dal modello della generale e dal tipo d'appalto scelto nel popup. Un appalto senza tipo è trattato da privato. */
export function tipoDaDocumenti(modello: "appalto" | "sviluppo" | "compravendita", tipoAppalto?: string | null): TipoDaDocumenti {
  if (modello === "appalto") return tipoAppalto === "Pubblico" ? "appalto_pubblico" : "appalto_privato";
  return modello;
}

/** Il nome di un tipo di documento (per l'interfaccia), da qualunque tipo di commessa. */
export function nomeDocumento(id: string): string {
  for (const docs of Object.values(DOCUMENTI)) {
    const d = docs.find((x) => x.id === id);
    if (d) return d.nome;
  }
  return id;
}

export function campoDelCatalogo(tipo: TipoDaDocumenti, chiave: string): CampoCatalogo | undefined {
  return CAMPI[tipo].find((x) => x.chiave === chiave);
}
