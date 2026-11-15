/**
 * Commessa generale dai documenti — catalogo (lotto 0 di docs/piano-commessa-generale-da-documenti.md).
 *
 * Per ogni tipo di commessa generale: quali documenti ci si aspetta, quali campi si cercano e dove
 * finisce ognuno. È la stessa lista che l'estrazione (lotto 3) userà come schema e il grande popup
 * (lotto 4) come elenco delle sezioni. Qui non c'è AI: solo la descrizione di cosa cercare.
 *
 * Le scelte che dipendono dal titolare (§7 del piano) NON si fissano qui: stanno in
 * `PUNTI_APERTI` e i campi che ne dipendono lo dicono con `puntoAperto`.
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
  /** Il campo dipende da una domanda ancora aperta per il titolare. */
  puntoAperto?: PuntoApertoId;
  /** Dato personale di terzi: non si estrae (piano §2.1, «Tracciabilità»). */
  escluso?: boolean;
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

// ─── Punti aperti (domande del §7) ─────────────────────────────────────────────

export type PuntoApertoId = "accordo_quadro" | "capitolato" | "soglia_costo" | "rti" | "penale_due_valori" | "conti_dedicati" | "fasi_subito" | "dove_si_avvia";

export const PUNTI_APERTI: Record<PuntoApertoId, { domanda: string; finoAllaRisposta: string }> = {
  accordo_quadro: {
    domanda: "Accordo quadro: la generale è l'accordo e ogni contratto applicativo una figlia, o ogni applicativo è una generale a sé?",
    finoAllaRisposta: "I due CIG si leggono separati; non si crea nessuna figlia.",
  },
  capitolato: {
    domanda: "Il capitolato speciale si chiede sempre quando le regole di pagamento stanno lì?",
    finoAllaRisposta: "I campi rimandati al capitolato restano «non trovati», con il motivo.",
  },
  soglia_costo: {
    domanda: "Prima di leggere si mostra la stima e si chiede «Leggi», o si parte da soli sotto una soglia?",
    finoAllaRisposta: "Si mostra sempre la stima.",
  },
  rti: {
    domanda: "In un RTI di cui siamo mandanti, la commessa vale per la nostra quota o per tutto?",
    finoAllaRisposta: "Si leggono mandataria, mandanti e quote; l'importo della commessa non si tocca.",
  },
  penale_due_valori: {
    domanda: "Se contratto e verbale danno due penali diverse, vince il contratto o si fa scegliere?",
    finoAllaRisposta: "Si fa scegliere: è un conflitto come gli altri.",
  },
  conti_dedicati: {
    domanda: "I conti dedicati e i delegati della tracciabilità si salvano?",
    finoAllaRisposta: "Non si estraggono.",
  },
  fasi_subito: {
    domanda: "Fasi e figlie dal computo si creano subito o dopo, dalla pagina?",
    finoAllaRisposta: "Non riguarda la lettura.",
  },
  dove_si_avvia: {
    domanda: "Si avvia solo dalla nuova commessa generale o anche da una già esistente?",
    finoAllaRisposta: "Solo dalla nuova commessa generale.",
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
  c("esecutore_forma", "Esecutore (singola, RTI, consorzio)", "testo", "parti", "nuovo:dati.appalto.esecutore", { puntoAperto: "rti" }),
  c("contratto_numero", "Numero o repertorio del contratto", "testo", "codici", "generale_contratti.riferimento"),
  c("contratto_data", "Data di stipula", "data", "codici", "generale_contratti.data_firma"),
  c("direttore_lavori", "Direttore lavori", "testo", "figure", "dati.appalto.direttore_lavori"),
  c("cse", "Coordinatore sicurezza (CSE)", "testo", "figure", "dati.appalto.cse"),
  c("importo_base", "Importo a base d'asta (soggetto a ribasso)", "importo", "importi", "generale_contratti.importo_base", { doveCercare: "verbale di gara o di consegna, quadro economico" }),
  c("ribasso_pct", "Ribasso", "percentuale", "importi", "generale_contratti.ribasso_pct", { doveCercare: "offerta economica, verbale di aggiudicazione o di consegna" }),
  c("oneri_sicurezza", "Oneri della sicurezza non soggetti a ribasso", "importo", "importi", "generale_contratti.oneri_sicurezza"),
  c("costo_manodopera", "Costo della manodopera", "importo", "importi", "nuovo:generale_contratti.costo_manodopera"),
  c("importo_contrattuale", "Importo contrattuale", "importo", "importi", "solo_controllo"),
  c("corpo_misura", "A corpo o a misura", "testo", "importi", "nuovo:generale_contratti.a_corpo_misura"),
  c("categorie_soa", "Categorie SOA e importi", "testo", "importi", "nuovo:dati.appalto.categorie_soa"),
  c("durata_giorni", "Durata", "giorni", "tempi", "nuovo:generale_contratti.durata_giorni"),
  c("data_consegna", "Consegna lavori", "data", "tempi", "generale_contratti.data_consegna_lavori", { doveCercare: "verbale di consegna" }),
  c("data_fine_prevista", "Fine lavori prevista", "data", "tempi", "generale_contratti.data_fine_prevista"),
  c("penale_permille", "Penale giornaliera (per mille)", "permille", "penali", "generale_contratti.penale_giornaliera", { puntoAperto: "penale_due_valori" }),
  c("penale_massima_pct", "Penale massima", "percentuale", "penali", "generale_contratti.penale_massima_pct"),
  c("anticipazione_pct", "Anticipazione", "percentuale", "pagamenti", "generale_contratti.anticipazione_pct", { doveCercare: "capitolato speciale", puntoAperto: "capitolato" }),
  c("sal_soglia", "SAL: importo minimo", "importo", "pagamenti", "nuovo:generale_contratti.sal_soglia_importo"),
  c("sal_cadenza_giorni", "SAL: ogni quanti giorni", "giorni", "pagamenti", "nuovo:generale_contratti.sal_cadenza_giorni"),
  c("ritenuta_pct", "Ritenuta di garanzia", "percentuale", "pagamenti", "generale_contratti.ritenuta_pct", { doveCercare: "capitolato speciale", puntoAperto: "capitolato" }),
  c("termini_pagamento_giorni", "Termini di pagamento", "giorni", "pagamenti", "nuovo:generale_contratti.termini_pagamento_giorni", { doveCercare: "capitolato speciale", puntoAperto: "capitolato" }),
  c("cauzione_definitiva", "Cauzione definitiva", "importo", "garanzie", "generale_contratto_garanzie.importo"),
  c("car_somma_lavori", "Polizza CAR: somma assicurata (lavori)", "importo", "garanzie", "generale_contratto_garanzie.importo"),
  c("rct_massimale", "Massimale RCT", "importo", "garanzie", "nuovo:generale_contratto_garanzie.massimale"),
  c("rct_massimale_contratto", "Massimale RCT richiesto dal contratto", "importo", "garanzie", "solo_controllo"),
  c("totale_computo", "Totale del computo dei lavori", "importo", "computo", "solo_controllo"),
  c("totale_sicurezza", "Totale della stima della sicurezza", "importo", "computo", "solo_controllo"),
  c("subappalto", "Subappalto (limiti, pagamento diretto)", "testo", "pagamenti", "generale_contratti.note", { doveCercare: "capitolato speciale", puntoAperto: "capitolato" }),
  c("revisione_prezzi", "Revisione prezzi", "testo", "pagamenti", "nuovo:generale_contratti.revisione_prezzi"),
  c("conti_dedicati", "Conti dedicati e delegati", "testo", "pagamenti", "solo_controllo", { escluso: true, puntoAperto: "conti_dedicati" }),
];

const CAMPI_SOLO_PUBBLICO: CampoCatalogo[] = [
  c("stazione_appaltante", "Stazione appaltante", "testo", "parti", "dati.appalto.stazione_appaltante"),
  c("codice_ipa", "Codice IPA", "codice", "codici", "anagrafica.codice_ipa"),
  c("codice_univoco", "Codice univoco dell'ufficio", "codice", "codici", "order_riferimenti_pa.codice_univoco_ufficio"),
  c("cig", "CIG", "codice", "codici", "generale_contratti.cig"),
  c("cig_accordo", "CIG dell'accordo quadro", "codice", "codici", "nuovo:dati.appalto.cig_accordo", { puntoAperto: "accordo_quadro" }),
  // Accordo quadro: l'importo massimo è il valore della generale; gli applicativi lo scalano.
  c("tetto_accordo", "Importo massimo dell'accordo quadro", "importo", "importi", "generale_contratti.tetto_accordo", { doveCercare: "accordo quadro", puntoAperto: "accordo_quadro" }),
  c("cup", "CUP", "codice", "codici", "generale_contratti.cup"),
  c("rup", "RUP", "testo", "figure", "dati.appalto.rup"),
  c("split_payment", "Scissione dei pagamenti", "si_no", "pagamenti", "generale_contratti.split_payment"),
];

const CAMPI_SOLO_PRIVATO: CampoCatalogo[] = [
  c("acconto", "Acconto alla firma", "importo", "pagamenti", "solo_controllo"),
  c("totale_rate", "Somma delle rate", "importo", "pagamenti", "solo_controllo"),
];

const CAMPI_SVILUPPO: CampoCatalogo[] = [
  c("catasto", "Dati catastali dell'area", "testo", "area", "dati.area.catasto"),
  c("superficie", "Superficie", "testo", "area", "dati.area.superficie"),
  c("titolo_tipo", "Titolo edilizio", "testo", "titolo", "dati.titolo.tipo"),
  c("titolo_numero", "Numero del titolo", "testo", "titolo", "dati.titolo.numero"),
  c("titolo_data", "Rilasciato il", "data", "titolo", "dati.titolo.data"),
  c("titolo_scadenza", "Fine lavori entro", "data", "titolo", "dati.titolo.scadenza"),
  c("prezzo_area", "Prezzo d'acquisto dell'area", "importo", "area", "solo_controllo"),
];

const CAMPI_COMPRAVENDITA: CampoCatalogo[] = [
  c("immobile_indirizzo", "Indirizzo dell'immobile", "testo", "immobile", "dati.immobile.indirizzo"),
  c("immobile_catasto", "Dati catastali", "testo", "immobile", "dati.immobile.catasto"),
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

export function campoDelCatalogo(tipo: TipoDaDocumenti, chiave: string): CampoCatalogo | undefined {
  return CAMPI[tipo].find((x) => x.chiave === chiave);
}
