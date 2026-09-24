/**
 * Il POS sul modello ufficiale: Allegato I del Decreto Interministeriale
 * 9 settembre 2014 (modello semplificato), che segue i contenuti minimi
 * dell'Allegato XV, punto 3.2.1, del D.Lgs 81/2008.
 *
 * Codice puro, senza Deno né browser: lo usano la funzione server (per
 * preparare il POS e per l'approvazione, che il database accetta solo da lì) e
 * l'interfaccia (editor, controllo di completezza, stampa). Una regola sola in
 * un posto solo: se il controllo cambia qui, cambia per entrambi.
 *
 * Il POS lo firma il datore di lavoro dell'impresa esecutrice, che ne risponde
 * (art. 96 e 159). Qui si prepara la bozza: i dati dell'impresa, delle figure
 * e dei lavoratori arrivano dall'app, le schede delle lavorazioni le può
 * proporre l'AI ma vanno riviste una per una prima di approvare.
 */

export const POS_VERSIONE_MODELLO = 1 as const;

export type RuoloImpresa = "affidataria" | "affidataria_esecutrice" | "esecutrice_subappalto";
export type RsppSvoltoDa = "datore" | "interno" | "esterno";
export type TipoRls = "rls" | "rlst";
export type GestioneEmergenze = "committente" | "interna" | "comune";
export type Svolgimento = "diretto" | "subappalto" | "collaborazione";
export type TipoAllegato = "scheda_sicurezza" | "valutazione_rumore" | "altro";

export interface Recapito {
  indirizzo: string;
  telefono: string;
  email: string;
}

export interface Soggetto extends Recapito {
  nominativo: string;
  codice_fiscale: string;
}

export interface FiguraPos {
  nominativo: string;
  /** Lettera b): le mansioni inerenti la sicurezza svolte in cantiere. */
  mansioni_sicurezza: string;
}

export interface DirigentePos extends FiguraPos {
  ruolo: "direttore_tecnico" | "incaricato_art97" | "altro";
}

export interface PrepostoPos extends FiguraPos {
  ruolo: "capocantiere" | "incaricato_art97" | "altro";
  ruolo_altro: string;
}

export interface AddettoEmergenze extends FiguraPos {
  antincendio: boolean;
  primo_soccorso: boolean;
}

export interface RigaLavoratori {
  qualifica: string;
  numero: number;
  note: string;
}

export interface LavoratoreAutonomo {
  nominativo: string;
  indirizzo: string;
  codice_fiscale: string;
  partita_iva: string;
  attivita: string;
  data_ingresso: string;
  data_uscita: string;
  note: string;
}

export interface RigaFormazione {
  nominativo: string;
  qualifica: string;
  base: boolean;
  rischi_specifici: boolean;
  rischi_cantiere: boolean;
  dpi_terza_categoria: boolean;
  altro: string;
  /** Attestati trovati nell'app (titolo e scadenza): per chi controlla. */
  attestati: string;
}

export interface RigaRumore {
  mansione: string;
  lavorazione: string;
  livello_sorgenti: string;
  esposizione: string;
  note: string;
}

export interface Lavorazione {
  id: string;
  titolo: string;
  descrizione: string;
  modalita: string;
  sostanze: string;
  opere_provvisionali: string;
  macchine: string;
  impianti: string;
  turni: string;
  rischi: string;
  misure: string;
  dpi: string;
  durata_giorni: number | null;
  svolgimento: Svolgimento;
  svolgimento_con: string;
  /** Proposta dall'AI o scritta a mano. */
  origine: "ai" | "utente";
  /** Una scheda proposta dall'AI vale solo dopo che qualcuno l'ha letta e confermata. */
  verificata: boolean;
}

export interface ProceduraPsc {
  procedura: string;
  indicazioni: string;
}

export interface AllegatoPos {
  tipo: TipoAllegato;
  nome: string;
  file_path: string;
}

export interface PosContenuto {
  versione_modello: typeof POS_VERSIONE_MODELLO;
  opera: {
    committente: Soggetto;
    /** Solo se nominato. */
    responsabile_lavori: Soggetto | null;
    cantiere: { via: string; localita: string; provincia: string };
    /** Lettera c): descrizione dell'attività di cantiere. */
    descrizione_attivita: string;
    /** Lettera c): modalità organizzative. */
    modalita_organizzative: string;
    /** Lettera c): turni di lavoro. */
    turni_lavoro: string;
    data_inizio: string;
    data_fine: string;
  };
  impresa: {
    ruolo: RuoloImpresa;
    subappalto_a: string;
    durata_oltre_200_giorni: boolean;
    ragione_sociale: string;
    partita_iva: string;
    datore_lavoro: string;
    sede_legale: Recapito;
    sede_operativa: Recapito;
    uffici_cantiere: Recapito;
  };
  dirigenti: DirigentePos[];
  preposti: PrepostoPos[];
  rspp: FiguraPos & { svolto_da: RsppSvoltoDa };
  medico_competente: FiguraPos & { previsto: boolean };
  rls: FiguraPos & { tipo: TipoRls };
  emergenze: {
    gestione: GestioneEmergenze;
    imprese_gestione_comune: string;
    addetti: AddettoEmergenze[];
  };
  lavoratori: RigaLavoratori[];
  autonomi: LavoratoreAutonomo[];
  formazione: RigaFormazione[];
  rumore: { esito: string; righe: RigaRumore[] };
  lavorazioni: Lavorazione[];
  procedure_psc: { psc_presente: boolean; richieste: boolean; voci: ProceduraPsc[] };
  allegati: AllegatoPos[];
}

// ── Costruttori ──────────────────────────────────────────────────────────────

const recapitoVuoto = (): Recapito => ({ indirizzo: "", telefono: "", email: "" });
export const soggettoVuoto = (): Soggetto => ({ nominativo: "", codice_fiscale: "", ...recapitoVuoto() });

export function posVuoto(): PosContenuto {
  return {
    versione_modello: POS_VERSIONE_MODELLO,
    opera: {
      committente: soggettoVuoto(),
      responsabile_lavori: null,
      cantiere: { via: "", localita: "", provincia: "" },
      descrizione_attivita: "",
      modalita_organizzative: "",
      turni_lavoro: "",
      data_inizio: "",
      data_fine: "",
    },
    impresa: {
      ruolo: "affidataria_esecutrice",
      subappalto_a: "",
      durata_oltre_200_giorni: false,
      ragione_sociale: "",
      partita_iva: "",
      datore_lavoro: "",
      sede_legale: recapitoVuoto(),
      sede_operativa: recapitoVuoto(),
      uffici_cantiere: recapitoVuoto(),
    },
    dirigenti: [],
    preposti: [],
    rspp: { svolto_da: "esterno", nominativo: "", mansioni_sicurezza: "" },
    // In edilizia la sorveglianza sanitaria c'è quasi sempre: si parte da «previsto».
    medico_competente: { previsto: true, nominativo: "", mansioni_sicurezza: "" },
    rls: { tipo: "rls", nominativo: "", mansioni_sicurezza: "" },
    emergenze: { gestione: "interna", imprese_gestione_comune: "", addetti: [] },
    lavoratori: [],
    autonomi: [],
    formazione: [],
    rumore: { esito: "", righe: [] },
    lavorazioni: [],
    procedure_psc: { psc_presente: false, richieste: false, voci: [] },
    allegati: [],
  };
}

export function lavorazioneVuota(id: string): Lavorazione {
  return {
    id, titolo: "", descrizione: "", modalita: "", sostanze: "", opere_provvisionali: "", macchine: "",
    impianti: "", turni: "", rischi: "", misure: "", dpi: "", durata_giorni: null,
    svolgimento: "diretto", svolgimento_con: "", origine: "utente", verificata: true,
  };
}

// ── Lettura sicura (JSON dal database o dall'AI) ─────────────────────────────

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");
const bool = (v: unknown, d = false): boolean => (typeof v === "boolean" ? v : d);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const uno = <T extends string>(v: unknown, ammessi: readonly T[], d: T): T =>
  (typeof v === "string" && (ammessi as readonly string[]).includes(v) ? (v as T) : d);
const numero = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v.replace(",", ".")) : NaN;
  return Number.isFinite(n) ? n : null;
};

function recapito(v: unknown): Recapito {
  const o = isObj(v) ? v : {};
  return { indirizzo: str(o.indirizzo), telefono: str(o.telefono), email: str(o.email) };
}
function soggetto(v: unknown): Soggetto {
  const o = isObj(v) ? v : {};
  return { nominativo: str(o.nominativo), codice_fiscale: str(o.codice_fiscale), ...recapito(o) };
}
function figura(v: unknown): FiguraPos {
  const o = isObj(v) ? v : {};
  return { nominativo: str(o.nominativo), mansioni_sicurezza: str(o.mansioni_sicurezza) };
}

export function normalizzaLavorazione(v: unknown, id: string): Lavorazione {
  const o = isObj(v) ? v : {};
  const origine = uno(o.origine, ["ai", "utente"] as const, "utente");
  return {
    id: str(o.id) || id,
    titolo: str(o.titolo),
    descrizione: str(o.descrizione),
    modalita: str(o.modalita),
    sostanze: str(o.sostanze),
    opere_provvisionali: str(o.opere_provvisionali),
    macchine: str(o.macchine),
    impianti: str(o.impianti),
    turni: str(o.turni),
    rischi: str(o.rischi),
    misure: str(o.misure),
    dpi: str(o.dpi),
    durata_giorni: numero(o.durata_giorni),
    svolgimento: uno(o.svolgimento, ["diretto", "subappalto", "collaborazione"] as const, "diretto"),
    svolgimento_con: str(o.svolgimento_con),
    origine,
    verificata: bool(o.verificata, origine === "utente"),
  };
}

/**
 * Qualunque cosa arrivi (null, un POS del vecchio generatore, un JSON a metà),
 * restituisce un POS con tutte le chiavi: l'editor e il controllo non devono
 * mai trovare un campo che manca.
 */
export function normalizzaPos(v: unknown): PosContenuto {
  const base = posVuoto();
  if (!isObj(v) || v.versione_modello !== POS_VERSIONE_MODELLO) return base;
  const opera = isObj(v.opera) ? v.opera : {};
  const cantiere = isObj(opera.cantiere) ? opera.cantiere : {};
  const impresa = isObj(v.impresa) ? v.impresa : {};
  const rspp = isObj(v.rspp) ? v.rspp : {};
  const medico = isObj(v.medico_competente) ? v.medico_competente : {};
  const rls = isObj(v.rls) ? v.rls : {};
  const emergenze = isObj(v.emergenze) ? v.emergenze : {};
  const rumore = isObj(v.rumore) ? v.rumore : {};
  const psc = isObj(v.procedure_psc) ? v.procedure_psc : {};
  return {
    versione_modello: POS_VERSIONE_MODELLO,
    opera: {
      committente: soggetto(opera.committente),
      responsabile_lavori: isObj(opera.responsabile_lavori) ? soggetto(opera.responsabile_lavori) : null,
      cantiere: { via: str(cantiere.via), localita: str(cantiere.localita), provincia: str(cantiere.provincia) },
      descrizione_attivita: str(opera.descrizione_attivita),
      modalita_organizzative: str(opera.modalita_organizzative),
      turni_lavoro: str(opera.turni_lavoro),
      data_inizio: str(opera.data_inizio),
      data_fine: str(opera.data_fine),
    },
    impresa: {
      ruolo: uno(impresa.ruolo, ["affidataria", "affidataria_esecutrice", "esecutrice_subappalto"] as const, base.impresa.ruolo),
      subappalto_a: str(impresa.subappalto_a),
      durata_oltre_200_giorni: bool(impresa.durata_oltre_200_giorni),
      ragione_sociale: str(impresa.ragione_sociale),
      partita_iva: str(impresa.partita_iva),
      datore_lavoro: str(impresa.datore_lavoro),
      sede_legale: recapito(impresa.sede_legale),
      sede_operativa: recapito(impresa.sede_operativa),
      uffici_cantiere: recapito(impresa.uffici_cantiere),
    },
    dirigenti: arr(v.dirigenti).map((d) => ({
      ...figura(d),
      ruolo: uno(isObj(d) ? d.ruolo : null, ["direttore_tecnico", "incaricato_art97", "altro"] as const, "direttore_tecnico"),
    })),
    preposti: arr(v.preposti).map((p) => ({
      ...figura(p),
      ruolo: uno(isObj(p) ? p.ruolo : null, ["capocantiere", "incaricato_art97", "altro"] as const, "capocantiere"),
      ruolo_altro: str(isObj(p) ? p.ruolo_altro : ""),
    })),
    rspp: { ...figura(rspp), svolto_da: uno(rspp.svolto_da, ["datore", "interno", "esterno"] as const, "esterno") },
    medico_competente: { ...figura(medico), previsto: bool(medico.previsto, true) },
    rls: { ...figura(rls), tipo: uno(rls.tipo, ["rls", "rlst"] as const, "rls") },
    emergenze: {
      gestione: uno(emergenze.gestione, ["committente", "interna", "comune"] as const, "interna"),
      imprese_gestione_comune: str(emergenze.imprese_gestione_comune),
      addetti: arr(emergenze.addetti).map((a) => ({
        ...figura(a),
        antincendio: bool(isObj(a) ? a.antincendio : false),
        primo_soccorso: bool(isObj(a) ? a.primo_soccorso : false),
      })),
    },
    lavoratori: arr(v.lavoratori).map((r) => {
      const o = isObj(r) ? r : {};
      return { qualifica: str(o.qualifica), numero: Math.max(0, Math.round(numero(o.numero) ?? 0)), note: str(o.note) };
    }),
    autonomi: arr(v.autonomi).map((r) => {
      const o = isObj(r) ? r : {};
      return {
        nominativo: str(o.nominativo), indirizzo: str(o.indirizzo), codice_fiscale: str(o.codice_fiscale),
        partita_iva: str(o.partita_iva), attivita: str(o.attivita), data_ingresso: str(o.data_ingresso),
        data_uscita: str(o.data_uscita), note: str(o.note),
      };
    }),
    formazione: arr(v.formazione).map((r) => {
      const o = isObj(r) ? r : {};
      return {
        nominativo: str(o.nominativo), qualifica: str(o.qualifica), base: bool(o.base),
        rischi_specifici: bool(o.rischi_specifici), rischi_cantiere: bool(o.rischi_cantiere),
        dpi_terza_categoria: bool(o.dpi_terza_categoria), altro: str(o.altro), attestati: str(o.attestati),
      };
    }),
    rumore: {
      esito: str(rumore.esito),
      righe: arr(rumore.righe).map((r) => {
        const o = isObj(r) ? r : {};
        return {
          mansione: str(o.mansione), lavorazione: str(o.lavorazione), livello_sorgenti: str(o.livello_sorgenti),
          esposizione: str(o.esposizione), note: str(o.note),
        };
      }),
    },
    lavorazioni: arr(v.lavorazioni).map((l, i) => normalizzaLavorazione(l, `l${i + 1}`)),
    procedure_psc: {
      psc_presente: bool(psc.psc_presente),
      richieste: bool(psc.richieste),
      voci: arr(psc.voci).map((p) => {
        const o = isObj(p) ? p : {};
        return { procedura: str(o.procedura), indicazioni: str(o.indicazioni) };
      }),
    },
    allegati: arr(v.allegati).map((a) => {
      const o = isObj(a) ? a : {};
      return {
        tipo: uno(o.tipo, ["scheda_sicurezza", "valutazione_rumore", "altro"] as const, "altro"),
        nome: str(o.nome),
        file_path: str(o.file_path),
      };
    }),
  };
}

// ── Controllo di completezza (Allegato XV, punto 3.2.1) ──────────────────────

/** La sezione dell'editor a cui porta la voce mancante. */
export type SezionePos =
  | "opera" | "impresa" | "figure" | "emergenze" | "lavoratori" | "formazione"
  | "rumore" | "lavorazioni" | "psc" | "allegati";

export interface VoceMancante {
  /** Riferimento dell'Allegato XV (es. «3.2.1 a) 1»). */
  riferimento: string;
  sezione: SezionePos;
  testo: string;
}

const vuoto = (s: string | null | undefined) => !s || !s.trim();
/** «Nessuna» o «nessun» contano come risposta: la voce è stata considerata. */
const nessuno = (s: string) => /^\s*(nessun[oa]?|non (previst|utilizzat)[aeio]|-)\s*\.?\s*$/i.test(s);

/**
 * Le voci che mancano perché il POS abbia i contenuti minimi dell'Allegato XV.
 * Un POS a cui manca anche una sola voce è sanzionabile (art. 159): finché
 * l'elenco non è vuoto, l'approvazione è bloccata, anche sul server.
 */
export function vociMancanti(pos: PosContenuto): VoceMancante[] {
  const m: VoceMancante[] = [];
  const add = (riferimento: string, sezione: SezionePos, testo: string) => m.push({ riferimento, sezione, testo });
  const { opera, impresa } = pos;

  // Opera e committente
  if (vuoto(opera.committente.nominativo)) add("3.2.1", "opera", "Committente: nome e cognome o ragione sociale");
  if (vuoto(opera.committente.indirizzo)) add("3.2.1", "opera", "Committente: indirizzo");
  if (vuoto(opera.cantiere.via) || vuoto(opera.cantiere.localita)) add("3.2.1", "opera", "Indirizzo del cantiere: via e località");
  if (vuoto(opera.descrizione_attivita)) add("3.2.1 c)", "opera", "Descrizione dell'attività di cantiere");
  if (vuoto(opera.modalita_organizzative)) add("3.2.1 c)", "opera", "Modalità organizzative del cantiere");
  if (vuoto(opera.turni_lavoro)) add("3.2.1 c)", "opera", "Turni di lavoro");

  // Impresa
  if (vuoto(impresa.ragione_sociale)) add("3.2.1 a) 1", "impresa", "Ragione sociale dell'impresa");
  if (vuoto(impresa.datore_lavoro)) add("3.2.1 a) 1", "impresa", "Nominativo del datore di lavoro");
  if (vuoto(impresa.sede_legale.indirizzo) || vuoto(impresa.sede_legale.telefono)) {
    add("3.2.1 a) 1", "impresa", "Sede legale: indirizzo e telefono");
  }
  if (impresa.ruolo === "esecutrice_subappalto" && vuoto(impresa.subappalto_a)) {
    add("3.2.1 a) 1", "impresa", "Impresa affidataria per cui si lavora in subappalto");
  }

  // Figure (lettere a e b)
  const direttore = pos.dirigenti.find((d) => d.ruolo === "direttore_tecnico" && !vuoto(d.nominativo));
  const capocantiere = pos.preposti.find((p) => p.ruolo === "capocantiere" && !vuoto(p.nominativo));
  if (!direttore) add("3.2.1 a) 6", "figure", "Nominativo del direttore tecnico di cantiere");
  if (!capocantiere) add("3.2.1 a) 6", "figure", "Nominativo del capocantiere");
  if (vuoto(pos.rspp.nominativo)) add("3.2.1 a) 5", "figure", "Nominativo del responsabile del servizio di prevenzione e protezione (RSPP)");
  if (pos.medico_competente.previsto && vuoto(pos.medico_competente.nominativo)) {
    add("3.2.1 a) 4", "figure", "Nominativo del medico competente");
  }
  if (vuoto(pos.rls.nominativo)) add("3.2.1 a) 3", "figure", "Nominativo del rappresentante dei lavoratori per la sicurezza (RLS o RLST)");
  const figureConNome: FiguraPos[] = [
    ...pos.dirigenti, ...pos.preposti, pos.rspp, pos.rls,
    ...(pos.medico_competente.previsto ? [pos.medico_competente] : []),
    ...pos.emergenze.addetti,
  ].filter((f) => !vuoto(f.nominativo));
  const senzaMansioni = figureConNome.filter((f) => vuoto(f.mansioni_sicurezza)).map((f) => f.nominativo.trim());
  if (senzaMansioni.length) {
    add("3.2.1 b)", "figure", `Mansioni di sicurezza svolte in cantiere da: ${[...new Set(senzaMansioni)].join(", ")}`);
  }

  // Emergenze
  if (pos.emergenze.gestione === "interna") {
    const conNome = pos.emergenze.addetti.filter((a) => !vuoto(a.nominativo));
    if (!conNome.some((a) => a.antincendio)) add("3.2.1 a) 3", "emergenze", "Addetto antincendio ed evacuazione");
    if (!conNome.some((a) => a.primo_soccorso)) add("3.2.1 a) 3", "emergenze", "Addetto al primo soccorso");
  } else if (pos.emergenze.gestione === "comune" && vuoto(pos.emergenze.imprese_gestione_comune)) {
    add("3.2.1 a) 3", "emergenze", "Imprese che gestiscono insieme le emergenze");
  }

  // Lavoratori e formazione
  if (!pos.lavoratori.some((r) => !vuoto(r.qualifica) && r.numero > 0)) {
    add("3.2.1 a) 7", "lavoratori", "Numero e qualifica dei lavoratori in cantiere");
  }
  pos.autonomi.forEach((a, i) => {
    if (vuoto(a.nominativo) || vuoto(a.attivita)) add("3.2.1 a) 7", "lavoratori", `Lavoratore autonomo n. ${i + 1}: nominativo e attività`);
  });
  if (!pos.formazione.length) {
    add("3.2.1 l)", "formazione", "Informazione e formazione dei lavoratori impegnati in cantiere");
  } else {
    const senza = pos.formazione
      .filter((f) => !f.base && !f.rischi_specifici && !f.rischi_cantiere && !f.dpi_terza_categoria && vuoto(f.altro))
      .map((f) => f.nominativo.trim() || "lavoratore senza nome");
    if (senza.length) add("3.2.1 l)", "formazione", `Formazione ricevuta da: ${senza.join(", ")}`);
  }

  // Rumore
  if (vuoto(pos.rumore.esito) && !pos.rumore.righe.some((r) => !vuoto(r.esposizione))) {
    add("3.2.1 f)", "rumore", "Esito del rapporto di valutazione del rumore");
  }

  // Lavorazioni (lettere a2, c, d, e, g, i)
  if (!pos.lavorazioni.length) {
    add("3.2.1 a) 2", "lavorazioni", "Lavorazioni svolte in cantiere");
  }
  pos.lavorazioni.forEach((l, i) => {
    const nome = l.titolo.trim() || `n. ${i + 1}`;
    const manca: string[] = [];
    if (vuoto(l.descrizione)) manca.push("descrizione");
    if (vuoto(l.rischi)) manca.push("rischi");
    if (vuoto(l.misure)) manca.push("misure preventive e protettive");
    if (vuoto(l.dpi)) manca.push("DPI");
    if (vuoto(l.macchine) && vuoto(l.opere_provvisionali) && vuoto(l.impianti)) manca.push("macchine, opere provvisionali e impianti (anche «nessuna»)");
    if (vuoto(l.sostanze)) manca.push("sostanze pericolose (anche «nessuna»)");
    if (l.svolgimento !== "diretto" && vuoto(l.svolgimento_con)) manca.push("impresa con cui si svolge");
    if (manca.length) add("3.2.1 d) e) g) i)", "lavorazioni", `Lavorazione «${nome}»: ${manca.join(", ")}`);
    if (l.origine === "ai" && !l.verificata) add("3.2.1 g)", "lavorazioni", `Lavorazione «${nome}»: proposta dall'AI, da rileggere e confermare`);
  });

  // Sostanze: servono le schede di sicurezza allegate
  const conSostanze = pos.lavorazioni.some((l) => !vuoto(l.sostanze) && !nessuno(l.sostanze));
  if (conSostanze && !pos.allegati.some((a) => a.tipo === "scheda_sicurezza" && !vuoto(a.file_path))) {
    add("3.2.1 e)", "allegati", "Schede di sicurezza delle sostanze pericolose usate");
  }

  // Procedure richieste dal PSC
  if (pos.procedure_psc.psc_presente && pos.procedure_psc.richieste && !pos.procedure_psc.voci.some((v) => !vuoto(v.procedura))) {
    add("3.2.1 h)", "psc", "Procedure complementari o di dettaglio richieste dal PSC");
  }

  return m;
}

/** Percentuale indicativa di completezza, per la lista dei POS. */
export function completezzaPercento(pos: PosContenuto): number {
  // Le voci «fisse» controllate da vociMancanti quando il POS è vuoto.
  const totale = vociMancanti(posVuoto()).length;
  const mancanti = vociMancanti(pos).length;
  return Math.max(0, Math.min(100, Math.round(((totale - Math.min(mancanti, totale)) / totale) * 100)));
}

// ── Aggiornamento dai dati dell'app ──────────────────────────────────────────

/**
 * Le parti del POS che arrivano dall'app (commessa, impresa, figure,
 * lavoratori e formazione) si possono rileggere quando i dati cambiano. Quello
 * che l'utente scrive a mano (lavorazioni, rumore, procedure del PSC,
 * allegati, turni e modalità organizzative) non si tocca.
 */
export function aggiornaDaDatiApp(attuale: PosContenuto, daApp: PosContenuto): PosContenuto {
  const tieni = (a: string, b: string) => (vuoto(b) ? a : b);
  return {
    ...attuale,
    opera: {
      ...attuale.opera,
      committente: daApp.opera.committente.nominativo ? daApp.opera.committente : attuale.opera.committente,
      cantiere: daApp.opera.cantiere.via ? daApp.opera.cantiere : attuale.opera.cantiere,
      descrizione_attivita: tieni(attuale.opera.descrizione_attivita, daApp.opera.descrizione_attivita),
      data_inizio: tieni(attuale.opera.data_inizio, daApp.opera.data_inizio),
      data_fine: tieni(attuale.opera.data_fine, daApp.opera.data_fine),
    },
    impresa: {
      ...daApp.impresa,
      // Ruolo, subappalto e uffici di cantiere li decide chi scrive il POS.
      ruolo: attuale.impresa.ruolo,
      subappalto_a: attuale.impresa.subappalto_a,
      durata_oltre_200_giorni: attuale.impresa.durata_oltre_200_giorni,
      uffici_cantiere: vuoto(attuale.impresa.uffici_cantiere.indirizzo) ? daApp.impresa.uffici_cantiere : attuale.impresa.uffici_cantiere,
    },
    dirigenti: daApp.dirigenti.length ? daApp.dirigenti : attuale.dirigenti,
    preposti: daApp.preposti.length ? daApp.preposti : attuale.preposti,
    rspp: vuoto(daApp.rspp.nominativo) ? attuale.rspp : daApp.rspp,
    medico_competente: vuoto(daApp.medico_competente.nominativo) ? attuale.medico_competente : daApp.medico_competente,
    rls: vuoto(daApp.rls.nominativo) ? attuale.rls : daApp.rls,
    emergenze: daApp.emergenze.addetti.length
      ? { ...attuale.emergenze, addetti: daApp.emergenze.addetti }
      : attuale.emergenze,
    lavoratori: daApp.lavoratori.length ? daApp.lavoratori : attuale.lavoratori,
    formazione: daApp.formazione.length ? daApp.formazione : attuale.formazione,
  };
}

/** Mansioni di sicurezza tipiche per ruolo, se la figura non le ha scritte. */
export const MANSIONI_PREDEFINITE: Record<string, string> = {
  datore_lavoro: "Redige e firma il POS, organizza il cantiere, fornisce i DPI e garantisce formazione e sorveglianza sanitaria dei lavoratori.",
  direttore_tecnico: "Dirige tecnicamente il cantiere, pianifica le lavorazioni in sicurezza e verifica l'attuazione del POS e del PSC.",
  dirigente: "Attua le direttive del datore di lavoro organizzando le lavorazioni e vigilando sul rispetto delle misure di sicurezza.",
  capocantiere: "Sovrintende alle lavorazioni in cantiere, verifica l'applicazione delle misure del POS e l'uso dei DPI, segnala le situazioni di pericolo.",
  preposto: "Sovrintende all'attività dei lavoratori, verifica l'applicazione delle misure e l'uso dei DPI, interrompe le attività in caso di pericolo grave.",
  rspp: "Collabora alla valutazione dei rischi e alla redazione del POS, individua le misure di prevenzione e i programmi di formazione.",
  medico_competente: "Effettua la sorveglianza sanitaria dei lavoratori ed esprime i giudizi di idoneità alla mansione.",
  rls: "Viene consultato sul POS, riceve le informazioni sui rischi e segnala al datore di lavoro i rischi individuati.",
  rlst: "Rappresentante territoriale: viene consultato sul POS, riceve le informazioni sui rischi e segnala i rischi individuati.",
  addetto_antincendio: "Interviene in caso di incendio con i mezzi di estinzione e coordina l'evacuazione dei lavoratori dal cantiere.",
  addetto_primo_soccorso: "Presta il primo soccorso agli infortunati, chiama i soccorsi (112/118) e controlla la cassetta di pronto soccorso.",
};

export interface ContestoPos {
  /** Mezzi e attrezzature sulla commessa, per le schede delle lavorazioni. */
  mezzi: Array<{ nome: string; tipo: string; targa: string | null }>;
  /** Subappaltatori della commessa (con scadenza DURC). */
  subappaltatori: Array<{ ragione_sociale: string; tipo_lavori: string; durc_scadenza: string | null }>;
  /** Cosa non si è trovato e va scritto a mano. */
  avvisi: string[];
}

// ── Etichette ────────────────────────────────────────────────────────────────

export const RUOLO_IMPRESA_LABEL: Record<RuoloImpresa, string> = {
  affidataria: "Impresa affidataria",
  affidataria_esecutrice: "Impresa affidataria ed esecutrice",
  esecutrice_subappalto: "Impresa esecutrice in subappalto",
};

export const RSPP_LABEL: Record<RsppSvoltoDa, string> = {
  datore: "Il datore di lavoro",
  interno: "Altra persona interna all'impresa",
  esterno: "Altra persona esterna (consulente)",
};

export const GESTIONE_EMERGENZE_LABEL: Record<GestioneEmergenze, string> = {
  committente: "A cura del committente",
  interna: "Gestione interna all'impresa",
  comune: "Gestione comune tra le imprese",
};

export const SVOLGIMENTO_LABEL: Record<Svolgimento, string> = {
  diretto: "Svolgimento diretto",
  subappalto: "In subappalto a",
  collaborazione: "In collaborazione con",
};

export const ALLEGATO_LABEL: Record<TipoAllegato, string> = {
  scheda_sicurezza: "Scheda di sicurezza",
  valutazione_rumore: "Valutazione del rumore",
  altro: "Altro allegato",
};

/** Nel POS: «3.2.1 lettera a) punto 1» come nel modello del decreto. */
export const RIFERIMENTI_SEZIONE: Record<SezionePos, string> = {
  opera: "3.2.1 lettera c)",
  impresa: "3.2.1 lettera a) punto 1",
  figure: "3.2.1 lettere a) e b)",
  emergenze: "3.2.1 lettera a) punto 3",
  lavoratori: "3.2.1 lettera a) punto 7",
  formazione: "3.2.1 lettera l)",
  rumore: "3.2.1 lettera f)",
  lavorazioni: "3.2.1 lettere a) punto 2, c), d), e), g), h), i)",
  psc: "3.2.1 lettera h)",
  allegati: "3.2.1 lettera e)",
};
