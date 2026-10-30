/**
 * Planimetrie — il modello del documento (contratto fra editor, AI, 3D, esportazioni).
 *
 * Una pianta è fatta di oggetti che sanno cosa sono (pareti, porte, locali), non di
 * linee: le linee sono un'uscita (DXF, PDF). Spiegazione completa con esempi in
 * docs/planimetrie/modello.md.
 *
 * Regole fisse:
 * - Misure in CENTIMETRI. Coordinate con x verso destra e y verso l'alto (come il
 *   DXF); chi disegna sullo schermo capovolge y.
 * - Ogni misura ha un'origine: `rilevata` (scritta o confermata da una persona),
 *   `da_documento` (letta da un disegno in scala), `stimata` (dedotta dall'AI).
 *   L'oggetto ha la sua `origine`; `origineMisure` la cambia campo per campo.
 * - Lo stato di fatto contiene solo oggetti `esistente`. Ogni proposta (A, B…) è lo
 *   stato di progetto COMPLETO: le pareti che restano (`esistente`, con lo stesso id
 *   del fatto), quelle da demolire e quelle nuove.
 * - Gli id stanno dentro le chiavi delle quantità (`fatto:locale:<id>.pavimento_mq`):
 *   solo lettere, cifre, `-` e `_`, unici dentro lo stesso stato su tutti i livelli.
 *
 * Nessuna dipendenza: lo importano sia il frontend (Vite) sia le edge function (Deno).
 * Per questo il validatore è scritto a mano e non con zod.
 */

export const VERSIONE_SCHEMA = 1 as const;

export type Origine = "rilevata" | "da_documento" | "stimata";
export const ORIGINI: readonly Origine[] = ["rilevata", "da_documento", "stimata"];

/** Stato di un oggetto rispetto ai lavori. */
export type StatoLavori = "esistente" | "da_demolire" | "nuovo";
export const STATI_LAVORI: readonly StatoLavori[] = ["esistente", "da_demolire", "nuovo"];

/** Le misure a cui si può dare un'origine diversa da quella dell'oggetto. */
export type CampoMisura =
  | "lunghezza" // muro: posizione degli estremi; quota
  | "spessore"
  | "altezza"
  | "contorno" // locale
  | "offset" // apertura: posizione lungo la parete
  | "larghezza"
  | "davanzale"
  | "posizione" // elemento
  | "profondita";

export type OrigineMisure = Partial<Record<CampoMisura, Origine>>;

export interface Punto {
  x: number;
  y: number;
}

interface ConOrigine {
  origine: Origine;
  origineMisure?: OrigineMisure;
}

export type TipoMuro = "esterno" | "portante" | "tramezzo";
export const TIPI_MURO: readonly TipoMuro[] = ["esterno", "portante", "tramezzo"];

/** Parete: segmento d'asse da p1 a p2; lo spessore è metà per parte. */
export interface Muro extends ConOrigine {
  id: string;
  p1: Punto;
  p2: Punto;
  spessore: number;
  /** Dal pavimento all'intradosso del solaio. */
  altezza: number;
  tipo: TipoMuro;
  stato: StatoLavori;
}

export type TipoApertura = "porta" | "finestra" | "portafinestra" | "varco";
export const TIPI_APERTURA: readonly TipoApertura[] = ["porta", "finestra", "portafinestra", "varco"];

export type Manovra = "battente" | "scorrevole" | "nessuna";
export const MANOVRE: readonly Manovra[] = ["battente", "scorrevole", "nessuna"];

/**
 * Verso di un'anta a battente.
 * - `cardine`: l'estremo della parete (verso p1 o verso p2) dove stanno le cerniere.
 * - `lato`: dove si apre l'anta, guardando da p1 verso p2 (sinistra o destra dell'asse).
 */
export interface Verso {
  cardine: "p1" | "p2";
  lato: "sinistra" | "destra";
}

/** Apertura in una parete. Il vano va da `offset` a `offset + larghezza`, misurati sull'asse da p1. */
export interface Apertura extends ConOrigine {
  id: string;
  muroId: string;
  tipo: TipoApertura;
  offset: number;
  larghezza: number;
  /** Altezza del vano (dal davanzale all'architrave). */
  altezza: number;
  /** 0 per porte, portefinestre e varchi. */
  davanzale: number;
  manovra: Manovra;
  verso?: Verso | null;
  stato: StatoLavori;
}

export type Destinazione =
  | "soggiorno"
  | "cucina"
  | "camera"
  | "bagno"
  | "ingresso"
  | "disimpegno"
  | "corridoio"
  | "ripostiglio"
  | "studio"
  | "lavanderia"
  | "balcone"
  | "terrazzo"
  | "garage"
  | "cantina"
  | "altro";
export const DESTINAZIONI: readonly Destinazione[] = [
  "soggiorno", "cucina", "camera", "bagno", "ingresso", "disimpegno", "corridoio", "ripostiglio",
  "studio", "lavanderia", "balcone", "terrazzo", "garage", "cantina", "altro",
];

export interface Finiture {
  pavimento?: string;
  pareti?: string;
  soffitto?: string;
  /** Rivestimento a parete (piastrelle di bagno e cucina) fino all'altezza indicata. */
  rivestimento?: { materiale?: string; altezza: number } | null;
}

/** Locale: contorno al filo interno delle pareti (poligono semplice, in qualunque verso). */
export interface Locale extends ConOrigine {
  id: string;
  nome: string;
  destinazione: Destinazione;
  contorno: Punto[];
  altezza: number;
  finiture?: Finiture;
}

/** Simboli e arredi. `tipo` è libero (catalogo dei simboli: fase editor). */
export interface Elemento extends ConOrigine {
  id: string;
  tipo: string;
  /** Centro dell'ingombro. */
  posizione: Punto;
  /** Gradi, antiorari. */
  rotazione: number;
  larghezza: number;
  profondita: number;
  altezza?: number;
  localeId?: string | null;
  etichetta?: string;
  stato?: StatoLavori;
}

/** Quota da disegnare: il valore è sempre la distanza fra p1 e p2, non si scrive a mano. */
export interface Quota {
  id: string;
  p1: Punto;
  p2: Punto;
  /** Distanza della linea di quota dal segmento, in cm (positiva a sinistra di p1→p2). */
  scostamento: number;
}

export interface Testo {
  id: string;
  posizione: Punto;
  testo: string;
  rotazione?: number;
}

/** Il contenuto di uno stato (fatto o una proposta) su un livello. */
export interface StatoPianta {
  muri: Muro[];
  aperture: Apertura[];
  locali: Locale[];
  elementi: Elemento[];
  quote: Quota[];
  testi: Testo[];
}

export interface Proposta extends StatoPianta {
  /** Breve, entra nelle chiavi: «A», «B». */
  id: string;
  nome: string;
}

export interface Livello {
  id: string;
  nome: string;
  /** Quota del pavimento rispetto al piano terra, in cm. */
  quota: number;
  fatto: StatoPianta;
  proposte: Proposta[];
}

export interface Riferimenti {
  catastale?: string;
  indirizzo?: string;
  note?: string;
}

export interface Planimetria {
  schema: typeof VERSIONE_SCHEMA;
  unita: "cm";
  titolo?: string;
  /** Denominatore della scala di stampa preferita (50 = 1:50). */
  scala?: number;
  /** Direzione del nord in gradi, antioraria dall'asse y. */
  nord?: number;
  riferimenti?: Riferimenti;
  livelli: Livello[];
}

/** Uno stato su cui si calcola: «fatto» o «progetto:<id proposta>». */
export interface Ambito {
  chiave: string;
  nome: string;
  propostaId: string | null;
}

// ─── Costruzione ────────────────────────────────────────────────────────────

export function statoVuoto(): StatoPianta {
  return { muri: [], aperture: [], locali: [], elementi: [], quote: [], testi: [] };
}

export function nuovaPlanimetria(titolo?: string): Planimetria {
  const p: Planimetria = {
    schema: VERSIONE_SCHEMA,
    unita: "cm",
    scala: 100,
    livelli: [{ id: "pt", nome: "Piano terra", quota: 0, fatto: statoVuoto(), proposte: [] }],
  };
  if (titolo) p.titolo = titolo;
  return p;
}

/** Lo stato di un livello per un ambito, o null se quel livello non ha la proposta. */
export function statoDelLivello(livello: Livello, ambito: Ambito): StatoPianta | null {
  if (ambito.propostaId === null) return livello.fatto;
  return livello.proposte.find(pr => pr.id === ambito.propostaId) ?? null;
}

/** Il fatto e poi le proposte, nell'ordine in cui compaiono la prima volta. */
export function ambitiDi(p: Planimetria): Ambito[] {
  const out: Ambito[] = [{ chiave: "fatto", nome: "Stato di fatto", propostaId: null }];
  for (const livello of p.livelli) {
    for (const pr of livello.proposte) {
      if (!out.some(a => a.propostaId === pr.id)) out.push({ chiave: `progetto:${pr.id}`, nome: pr.nome, propostaId: pr.id });
    }
  }
  return out;
}

// ─── Origine ────────────────────────────────────────────────────────────────

const GRAVITA_ORIGINE: Record<Origine, number> = { rilevata: 0, da_documento: 1, stimata: 2 };

export function origineMisura(oggetto: ConOrigine, campo: CampoMisura): Origine {
  return oggetto.origineMisure?.[campo] ?? oggetto.origine;
}

/** La meno affidabile fra quelle date; senza misure, `rilevata`. */
export function originePeggiore(...origini: Origine[]): Origine {
  let peggiore: Origine = "rilevata";
  for (const o of origini) if (GRAVITA_ORIGINE[o] > GRAVITA_ORIGINE[peggiore]) peggiore = o;
  return peggiore;
}

// ─── Validazione ────────────────────────────────────────────────────────────

export type EsitoValidazione =
  | { ok: true; planimetria: Planimetria }
  | { ok: false; errori: string[] };

const ID_VALIDO = /^[A-Za-z0-9_-]{1,64}$/;
const ID_PROPOSTA = /^[A-Za-z0-9_-]{1,20}$/;

type Oggetto = Record<string, unknown>;
const eOggetto = (v: unknown): v is Oggetto => typeof v === "object" && v !== null && !Array.isArray(v);
const eNumero = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/**
 * Controlla la FORMA del documento (campi, tipi, misure positive, id unici). La
 * geometria (pareti che si toccano, porte dentro la parete…) la controlla
 * `controllaPlanimetria` in controllo.ts. Restituisce lo stesso oggetto ricevuto.
 */
export function validaPlanimetria(dato: unknown): EsitoValidazione {
  const errori: string[] = [];
  if (!eOggetto(dato)) return { ok: false, errori: ["Il file non è una pianta: manca il contenuto."] };

  if (eNumero(dato.schema) && dato.schema > VERSIONE_SCHEMA) {
    return { ok: false, errori: ["La pianta è stata salvata con una versione più nuova del programma: ricarica la pagina."] };
  }
  if (dato.schema !== VERSIONE_SCHEMA) errori.push("La pianta: la versione dello schema manca o non è valida.");
  if (dato.unita !== "cm") errori.push("La pianta: le misure devono essere in centimetri.");
  if (dato.titolo !== undefined && typeof dato.titolo !== "string") errori.push("La pianta: il titolo deve essere un testo.");
  if (dato.scala !== undefined && !(eNumero(dato.scala) && dato.scala > 0)) errori.push("La pianta: la scala deve essere un numero maggiore di zero.");
  if (dato.nord !== undefined && !eNumero(dato.nord)) errori.push("La pianta: il nord deve essere un numero di gradi.");
  if (dato.riferimenti !== undefined && !eOggetto(dato.riferimenti)) errori.push("La pianta: i riferimenti non sono validi.");

  if (!Array.isArray(dato.livelli) || dato.livelli.length === 0) {
    errori.push("La pianta: serve almeno un piano.");
    return { ok: false, errori };
  }

  const idLivelli = new Set<string>();
  // id già usati per ambito, su tutti i livelli
  const idPerAmbito = new Map<string, Set<string>>();

  dato.livelli.forEach((liv: unknown, i: number) => {
    if (!eOggetto(liv)) { errori.push(`Piano ${i + 1}: non è valido.`); return; }
    const nomeLiv = typeof liv.nome === "string" && liv.nome.trim() ? liv.nome : `Piano ${i + 1}`;
    if (typeof liv.id !== "string" || !ID_VALIDO.test(liv.id)) errori.push(`${nomeLiv}: l'identificativo non è valido.`);
    else if (idLivelli.has(liv.id)) errori.push(`${nomeLiv}: l'identificativo «${liv.id}» è usato da due piani.`);
    else idLivelli.add(liv.id);
    if (typeof liv.nome !== "string" || !liv.nome.trim()) errori.push(`${nomeLiv}: manca il nome.`);
    if (!eNumero(liv.quota)) errori.push(`${nomeLiv}: la quota del pavimento deve essere un numero.`);

    validaStato(liv.fatto, `${nomeLiv}, stato di fatto`, "fatto", true, errori, idPerAmbito);

    if (!Array.isArray(liv.proposte)) { errori.push(`${nomeLiv}: l'elenco delle proposte manca.`); return; }
    const idProposte = new Set<string>();
    liv.proposte.forEach((pr: unknown, j: number) => {
      if (!eOggetto(pr)) { errori.push(`${nomeLiv}, proposta ${j + 1}: non è valida.`); return; }
      const idOk = typeof pr.id === "string" && ID_PROPOSTA.test(pr.id);
      const etichetta = `${nomeLiv}, proposta ${idOk ? pr.id : j + 1}`;
      if (!idOk) { errori.push(`${etichetta}: il nome breve (A, B…) non è valido.`); return; }
      if (idProposte.has(pr.id as string)) errori.push(`${etichetta}: c'è due volte.`);
      idProposte.add(pr.id as string);
      if (typeof pr.nome !== "string" || !pr.nome.trim()) errori.push(`${etichetta}: manca il nome.`);
      validaStato(pr, etichetta, `progetto:${pr.id}`, false, errori, idPerAmbito);
    });
  });

  return errori.length ? { ok: false, errori } : { ok: true, planimetria: dato as unknown as Planimetria };
}

function validaStato(
  stato: unknown, dove: string, ambito: string, soloEsistente: boolean,
  errori: string[], idPerAmbito: Map<string, Set<string>>,
) {
  if (!eOggetto(stato)) { errori.push(`${dove}: manca.`); return; }
  let usati = idPerAmbito.get(ambito);
  if (!usati) { usati = new Set(); idPerAmbito.set(ambito, usati); }
  const visti = usati;

  const elenco = (campo: string, nome: string, valida: (o: Oggetto, etichetta: string) => void, etichettaDi: (o: Oggetto) => string) => {
    const lista = stato[campo];
    if (!Array.isArray(lista)) { errori.push(`${dove}: l'elenco ${nome} manca.`); return; }
    lista.forEach((o: unknown, k: number) => {
      if (!eOggetto(o)) { errori.push(`${dove}: l'elemento ${k + 1} dell'elenco ${nome} non è valido.`); return; }
      const etichetta = `${dove}, ${etichettaDi(o)}`;
      if (typeof o.id !== "string" || !ID_VALIDO.test(o.id)) errori.push(`${etichetta}: l'identificativo non è valido (lettere, cifre, - e _).`);
      else if (visti.has(o.id)) errori.push(`${dove}: l'identificativo «${o.id}» è usato due volte.`);
      else visti.add(o.id);
      valida(o, etichetta);
    });
  };
  const nomeDi = (prefisso: string) => (o: Oggetto) => `${prefisso} ${typeof o.id === "string" ? o.id : "senza identificativo"}`;

  const positivo = (o: Oggetto, campo: string, etichetta: string, nome: string) => {
    if (!(eNumero(o[campo]) && (o[campo] as number) > 0)) errori.push(`${etichetta}: ${nome} deve essere un numero maggiore di zero.`);
  };
  const nonNegativo = (o: Oggetto, campo: string, etichetta: string, nome: string) => {
    if (!(eNumero(o[campo]) && (o[campo] as number) >= 0)) errori.push(`${etichetta}: ${nome} deve essere un numero, zero o più.`);
  };
  const punto = (v: unknown, etichetta: string, nome: string) => {
    if (!eOggetto(v) || !eNumero(v.x) || !eNumero(v.y)) errori.push(`${etichetta}: ${nome} non è un punto valido.`);
  };
  const scelta = <T extends string>(v: unknown, valori: readonly T[], etichetta: string, nome: string) => {
    if (!valori.includes(v as T)) errori.push(`${etichetta}: ${nome} «${String(v)}» non è tra quelli previsti (${valori.join(", ")}).`);
  };
  const origini = (o: Oggetto, etichetta: string) => {
    scelta(o.origine, ORIGINI, etichetta, "l'origine");
    if (o.origineMisure === undefined) return;
    if (!eOggetto(o.origineMisure)) { errori.push(`${etichetta}: le origini delle misure non sono valide.`); return; }
    for (const [campo, v] of Object.entries(o.origineMisure)) scelta(v, ORIGINI, etichetta, `l'origine di ${campo}`);
  };
  const statoLavori = (o: Oggetto, etichetta: string, obbligatorio: boolean) => {
    if (o.stato === undefined && !obbligatorio) return;
    scelta(o.stato, STATI_LAVORI, etichetta, "lo stato");
    if (soloEsistente && o.stato !== undefined && o.stato !== "esistente") {
      errori.push(`${etichetta}: nello stato di fatto tutto è esistente; demolizioni e opere nuove vanno in una proposta.`);
    }
  };

  elenco("muri", "delle pareti", (o, e) => {
    punto(o.p1, e, "l'inizio");
    punto(o.p2, e, "la fine");
    positivo(o, "spessore", e, "lo spessore");
    positivo(o, "altezza", e, "l'altezza");
    scelta(o.tipo, TIPI_MURO, e, "il tipo");
    statoLavori(o, e, true);
    origini(o, e);
  }, nomeDi("parete"));

  elenco("aperture", "delle aperture", (o, e) => {
    if (typeof o.muroId !== "string") errori.push(`${e}: non dice in quale parete si trova.`);
    scelta(o.tipo, TIPI_APERTURA, e, "il tipo");
    nonNegativo(o, "offset", e, "la distanza dall'inizio della parete");
    positivo(o, "larghezza", e, "la larghezza");
    positivo(o, "altezza", e, "l'altezza");
    nonNegativo(o, "davanzale", e, "l'altezza del davanzale");
    scelta(o.manovra, MANOVRE, e, "il modo di apertura");
    if (o.verso !== undefined && o.verso !== null) {
      const v = o.verso;
      if (!eOggetto(v) || !["p1", "p2"].includes(v.cardine as string) || !["sinistra", "destra"].includes(v.lato as string)) {
        errori.push(`${e}: il verso di apertura non è valido.`);
      }
    }
    statoLavori(o, e, true);
    origini(o, e);
  }, nomeDi("apertura"));

  elenco("locali", "dei locali", (o, e) => {
    if (typeof o.nome !== "string" || !o.nome.trim()) errori.push(`${e}: manca il nome.`);
    scelta(o.destinazione, DESTINAZIONI, e, "la destinazione");
    if (!Array.isArray(o.contorno) || o.contorno.length < 3) errori.push(`${e}: il contorno deve avere almeno tre punti.`);
    else o.contorno.forEach((pt: unknown, k: number) => punto(pt, e, `il punto ${k + 1} del contorno`));
    positivo(o, "altezza", e, "l'altezza");
    if (o.finiture !== undefined) {
      if (!eOggetto(o.finiture)) errori.push(`${e}: le finiture non sono valide.`);
      else if (o.finiture.rivestimento !== undefined && o.finiture.rivestimento !== null) {
        const r = o.finiture.rivestimento;
        if (!eOggetto(r) || !(eNumero(r.altezza) && r.altezza > 0)) errori.push(`${e}: l'altezza del rivestimento deve essere un numero maggiore di zero.`);
      }
    }
    origini(o, e);
  }, o => typeof o.nome === "string" && o.nome.trim() ? `locale «${o.nome}»` : nomeDi("locale")(o));

  elenco("elementi", "degli elementi", (o, e) => {
    if (typeof o.tipo !== "string" || !o.tipo.trim()) errori.push(`${e}: manca il tipo.`);
    punto(o.posizione, e, "la posizione");
    if (!eNumero(o.rotazione)) errori.push(`${e}: la rotazione deve essere un numero di gradi.`);
    positivo(o, "larghezza", e, "la larghezza");
    positivo(o, "profondita", e, "la profondità");
    if (o.altezza !== undefined) positivo(o, "altezza", e, "l'altezza");
    if (o.localeId !== undefined && o.localeId !== null && typeof o.localeId !== "string") errori.push(`${e}: il locale non è valido.`);
    statoLavori(o, e, false);
    origini(o, e);
  }, nomeDi("elemento"));

  elenco("quote", "delle quote", (o, e) => {
    punto(o.p1, e, "l'inizio");
    punto(o.p2, e, "la fine");
    if (!eNumero(o.scostamento)) errori.push(`${e}: la distanza dalla parete deve essere un numero.`);
  }, nomeDi("quota"));

  elenco("testi", "dei testi", (o, e) => {
    punto(o.posizione, e, "la posizione");
    if (typeof o.testo !== "string") errori.push(`${e}: manca il testo.`);
    if (o.rotazione !== undefined && !eNumero(o.rotazione)) errori.push(`${e}: la rotazione deve essere un numero di gradi.`);
  }, nomeDi("testo"));
}
