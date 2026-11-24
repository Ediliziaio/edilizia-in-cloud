import { materialiProgettoValidi, type MaterialiProgetto } from "./materialiProgetto.ts";
import { modelloArredo } from "./modelliArredo.ts";
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
 * Nessuna dipendenza esterna (solo i file qui accanto): lo importano sia il frontend (Vite) sia le edge function (Deno).
 * Per questo il validatore è scritto a mano e non con zod.
 */

import { rilievoValido, type Rilievo } from "./rilievo.ts";
import { verificheLetturaValide, type LetturaDocumento } from "./letturaTipi.ts";
import { letturaAssistitaValida, type LetturaAssistita } from "./letturaAssistita.ts";
import { controlloDwgValido, type RiscontroDwg } from "./controlloDwg.ts";
import { tavolaDwgValida, type TavolaDwg } from "./tavolaDwg.ts";
import { urbanisticaValida, type DatiUrbanistici } from "./urbanistica.ts";
import { costruzioneValida, type Costruzione } from "./costruzione.ts";

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
  /** Il tipo grafico del muro richiede ancora un riscontro. */
  funzioneDaVerificare?: boolean;
  /** Dichiarata intoccabile dall'utente: non si sposta, non si demolisce. */
  bloccato?: boolean;
}

export function funzionePareteDaVerificare(muro: Pick<Muro, "id" | "funzioneDaVerificare">) {
  // Anche le ricostruzioni CAD salvate prima di questo campo avevano un tipo grafico inferito.
  return muro.funzioneDaVerificare ?? /^cad-\d+-m\d+$/.test(muro.id);
}

export type TipoApertura = "porta" | "finestra" | "portafinestra" | "varco";
export const TIPI_APERTURA: readonly TipoApertura[] = ["porta", "finestra", "portafinestra", "varco"];

export type Manovra = "battente" | "scorrevole" | "nessuna";
export const MANOVRE: readonly Manovra[] = ["battente", "scorrevole", "nessuna"];

/**
 * Il sistema del serramento, più preciso della manovra (che resta battente / scorrevole / nessuna):
 * - `battente`: anta o ante su cerniere; `anta_ribalta` e `vasistas`: finestre con ribalta;
 * - `scorrevole`: anta che scorre davanti al muro su binario; `scorrevole_scomparsa`: porta «scrigno» che scorre dentro il muro
 *   (serve il controtelaio speciale e un tratto di muro libero accanto); `alzante_scorrevole`: portafinestra a grande luce;
 * - `libro`: ante che si ripiegano; `fisso`: vetro senza ante apribili.
 */
export type SistemaApertura = "battente" | "anta_ribalta" | "vasistas" | "scorrevole" | "scorrevole_scomparsa" | "alzante_scorrevole" | "libro" | "fisso";
export const SISTEMI_APERTURA: readonly SistemaApertura[] = ["battente", "anta_ribalta", "vasistas", "scorrevole", "scorrevole_scomparsa", "alzante_scorrevole", "libro", "fisso"];

/**
 * Oscurante della finestra: `tapparella` (telo avvolgibile) e `veneziana` (frangisole a lamelle orientabili) stanno
 * arrotolate in un cassonetto sopra il vano; `persiana` (ante esterne) e `scuro` (ante interne) si aprono a battente.
 */
export type TipoOscurante = "tapparella" | "veneziana" | "persiana" | "scuro";
export const TIPI_OSCURANTE: readonly TipoOscurante[] = ["tapparella", "veneziana", "persiana", "scuro"];

/**
 * Dove sta il cassonetto di una tapparella o veneziana:
 * - `monoblocco`: dentro il vano, integrato nel controtelaio (la luce vetrata si accorcia);
 * - `a_filo`: murato sopra il vano, sotto l'architrave, a filo dell'intonaco;
 * - `esterno`: a vista sul prospetto, sopra il vano (si usa quando il muro non basta, spesso in ristrutturazione).
 */
export type TipoCassonetto = "monoblocco" | "a_filo" | "esterno";
export const TIPI_CASSONETTO: readonly TipoCassonetto[] = ["monoblocco", "a_filo", "esterno"];

/**
 * Zanzariera: `laterale` (anta che scorre di lato su binario), `verticale` (a rullo, in una cassetta sopra),
 * `plisse` (a pieghe, si apre di lato), `battente` (anta su cerniere, di solito per portefinestre),
 * `incastro` (telaio fisso a pressione, si toglie).
 */
export type TipoZanzariera = "laterale" | "verticale" | "plisse" | "battente" | "incastro";
export const TIPI_ZANZARIERA: readonly TipoZanzariera[] = ["laterale", "verticale", "plisse", "battente", "incastro"];

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
  /** Misure effettive rilevate sul serramento, distinte dalle dimensioni del vano. */
  luceNettaCm?: number;
  superficieApribileMq?: number;
  superficieIlluminanteMq?: number;
  manovra: Manovra;
  /** Ante (1-6): assente = una per le porte e le finestre fino a 1,4 m, due oltre. */
  ante?: number;
  /** Sistema del serramento: assente = quello che dice la manovra (battente o scorrevole semplice). */
  sistema?: SistemaApertura;
  /** Oscurante (tapparella, persiana…): assente = nessuno. Solo per finestre e portefinestre. */
  oscurante?: TipoOscurante;
  /** Cassonetto di tapparella o veneziana: assente = monoblocco. */
  cassonetto?: TipoCassonetto;
  /** Altezza del cassonetto in cm: assente = quella consigliata per l'altezza del vano. */
  altezzaCassonetto?: number;
  /** Tapparella o veneziana motorizzata. */
  motore?: boolean;
  /** Zanzariera: assente = nessuna. Solo per finestre e portefinestre. */
  zanzariera?: TipoZanzariera;
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
  | "giardino"
  | "altro";
export const DESTINAZIONI: readonly Destinazione[] = [
  "soggiorno", "cucina", "camera", "bagno", "ingresso", "disimpegno", "corridoio", "ripostiglio",
  "studio", "lavanderia", "balcone", "terrazzo", "garage", "cantina", "giardino", "altro",
];

export type PosaPavimento = "dritta" | "traversa" | "diagonale";

export interface Finiture {
  pavimento?: string;
  /** Il locale usa una finitura esplicita nella propria variante. */
  pavimentoSpecifico?: boolean;
  /** Verso della posa rispetto al lato più lungo della stanza. Senza: dritta (doghe lungo il lato lungo). */
  posaPavimento?: PosaPavimento;
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
  /** Superficie riportata nella tavola CAD, distinta dal calcolo sul contorno. */
  superficieDichiarataMq?: number;
  /** Zona di pavimento con un confine di misura che non è una parete. */
  aperto?: boolean;
  finiture?: Finiture;
  /** Appartamento o unità immobiliare (condominio, bifamiliare): «A», «Int. 3», «Parti comuni». */
  unita?: string;
}

/** Le zone aperte possono essere interne, per esempio la cucina di un open space. */
export function eAmbienteInterno({ destinazione, aperto }: { destinazione: string; aperto?: boolean }): boolean {
  return !["balcone", "terrazzo", "giardino"].includes(destinazione) && (!aperto || destinazione !== "altro");
}

/** I due estremi sono relativi al centro, in frazioni di larghezza e profondità. */
export type AlzataCad = [Punto, Punto];

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
  /** Colore della superficie principale dell'arredo, in sRGB. */
  colore?: string;
  modello?: string;
  stato?: StatoLavori;
  /** Linee delle alzate, ordinate nella direzione di salita. */
  alzateCad?: AlzataCad[];
}

export type RiferimentoQuota =
  | { tipo: "estremo"; muroId: string; estremo: "p1" | "p2" }
  | { tipo: "medio"; muroId: string }
  | { tipo: "intersezione"; muroId: string; altroMuroId: string };

/** Quota da disegnare: il valore è sempre la distanza fra p1 e p2, non si scrive a mano. */
export interface Quota {
  id: string;
  p1: Punto;
  p2: Punto;
  /** Distanza della linea di quota dal segmento, in cm (positiva a sinistra di p1→p2). */
  scostamento: number;
  origine?: Origine;
  /** Etichetta esplicita dell'entità DIMENSION nel CAD, conservata come riferimento. */
  testoOriginale?: string;
  riferimenti?: Partial<Record<"p1" | "p2", RiferimentoQuota>>;
}

export interface Testo {
  id: string;
  posizione: Punto;
  testo: string;
  rotazione?: number;
}

/**
 * Aree esterne: il lotto (il confine del terreno) e le superfici di giardino e cortile.
 * Non hanno pareti: sono pavimenti a cielo aperto, si contano in mq (e il lotto in metri di
 * recinzione) e nel 3D sono prato, lastre, ghiaia, asfalto.
 */
export type TipoArea = "lotto" | "prato" | "pavimentato" | "vialetto" | "ghiaia" | "parcheggio" | "aiuola" | "orto";
export const TIPI_AREA: readonly TipoArea[] = ["lotto", "prato", "pavimentato", "vialetto", "ghiaia", "parcheggio", "aiuola", "orto"];
export const NOMI_AREA: Record<TipoArea, string> = {
  lotto: "Lotto (confine)", prato: "Prato", pavimentato: "Pavimentazione esterna", vialetto: "Vialetto", ghiaia: "Ghiaia",
  parcheggio: "Parcheggio / passo carraio", aiuola: "Aiuola", orto: "Orto",
};

export interface AreaEsterna {
  id: string;
  tipo: TipoArea;
  nome?: string;
  /** Contorno, almeno tre punti, in senso qualunque. */
  contorno: Punto[];
  /** Solo per il lotto: il confine è recintato (si conta e si vede nel 3D). Predefinito: sì. */
  recinzione?: boolean;
  /** Quota della superficie rispetto al piano terra, in cm (terrazzamenti, rialzi, rampe). Predefinito: 0. */
  quota?: number;
  stato?: StatoLavori;
}

export const LINEE_IMPIANTO = ["elettrica", "acqua", "scarico", "frigorifera", "condensa", "riscaldamento"] as const;
export type LineaImpianto = typeof LINEE_IMPIANTO[number];

export interface TracciatoImpianto {
  linea: LineaImpianto;
  daId: string;
  aId: string;
  /** Vertici intermedi in cm. Gli estremi sono le posizioni dei simboli. */
  vertici: Punto[];
}

export const PASSO_RADIANTE_CM = { min: 5, max: 40, iniziale: 15 } as const;

export interface ZonaRadiante {
  localeId: string;
  passoCm: number;
  superficieEsclusaMq: number;
}

export const QUOTA_COLLETTORE_RADIANTE_CM = { min: 15, max: 250, iniziale: 55 } as const;
export const LIMITE_CIRCUITO_RADIANTE_M = { min: 20, max: 250, iniziale: 90 } as const;

/** Posizione sul piano e ipotesi usate per la stima del radiante. Quota della mandata in cm. */
export interface CollettoreRadiante {
  posizione: Punto;
  quotaCm: number;
  limiteCircuitoM: number;
}

/** Il contenuto di uno stato (fatto o una proposta) su un livello. */
export interface StatoPianta {
  muri: Muro[];
  aperture: Apertura[];
  locali: Locale[];
  elementi: Elemento[];
  quote: Quota[];
  testi: Testo[];
  /** Lotto e aree esterne (assenti nelle piante fatte prima). */
  aree?: AreaEsterna[];
  tracciatiImpianti?: TracciatoImpianto[];
  pavimentoRadiante?: ZonaRadiante[];
  collettoreRadiante?: CollettoreRadiante;
}

export const SANITARI_BAGNO = ["wc", "lavabo", "doccia", "bidet", "vasca"] as const;
export type TipoSanitarioBagno = typeof SANITARI_BAGNO[number];

export interface SpostamentoLocale {
  id: string;
  origineId: string;
  destinazioneId: string;
}

export interface SpostamentoBagno extends SpostamentoLocale {
  sanitari: TipoSanitarioBagno[];
}

export interface PrezzoVocePlanimetria {
  importo: number;
  unita: "m²" | "m" | "cad" | "a corpo";
  fonte: string;
  tariffa: string;
  /** Il giorno in cui il prezzo è stato preso (AAAA-MM-GG): dice quando va riguardato. Assente nelle varianti salvate prima del 24/11/2026. */
  data?: string;
}

export interface Proposta extends StatoPianta {
  /** Breve, entra nelle chiavi: «A», «B». */
  id: string;
  nome: string;
  /** Distribuzione dell’intero perimetro. I locali della variante sono modificabili anche se hanno nuovi ID. */
  distribuzioneBilocali?: true;
  frazionamenti?: Array<{
    localeId: string;
    parti: string[];
    pareti: string[];
    richiesta?: string;
    motivazione?: string;
  }>;
  spostamentiBagno?: SpostamentoBagno[];
  spostamentiCucina?: SpostamentoLocale[];
  prezziLavorazioni?: Record<string, PrezzoVocePlanimetria>;
  alternativaDi?: string;
}

export type RiscontroScalaModello =
  | { stato: "da_verificare" }
  | { stato: "confermata"; muroId: string; distanzaCm: number; verificataIl: string };

export interface Livello {
  id: string;
  nome: string;
  /** Quota del pavimento rispetto al piano terra, in cm. */
  quota: number;
  fatto: StatoPianta;
  proposte: Proposta[];
  /** L'immagine da ricalcare sotto il disegno di questo piano (mappa, foto aerea, rilievo). */
  ricalco?: Ricalco;
  riscontroScala?: RiscontroScalaModello;
  /** Proposte da esaminare sulla tavola archiviata del singolo piano. */
  letturaAssistita?: LetturaAssistita;
  controlloDwg?: RiscontroDwg[];
  tavolaDwg?: TavolaDwg;
  /** Il tetto sopra questo piano (di solito l'ultimo): nel 3D e nei render. */
  tetto?: Tetto;
}

export function scalaModelloDaVerificare(livello: Livello): boolean {
  if (livello.ricalco?.calibrata === false || livello.riscontroScala?.stato === "da_verificare") return true;
  const riscontro = livello.riscontroScala;
  if (!riscontro) return false;
  const muro = livello.fatto.muri.find(m => m.id === riscontro.muroId);
  return !muro || Math.abs(Math.hypot(muro.p2.x - muro.p1.x, muro.p2.y - muro.p1.y) - riscontro.distanzaCm) > 1;
}

export type TipoTetto = "piano" | "una_falda" | "due_falde" | "padiglione" | "shed";
export const TIPI_TETTO: readonly TipoTetto[] = ["piano", "una_falda", "due_falde", "padiglione", "shed"];
/**
 * Cosa copre il tetto: `tegole` (laterizio o cemento), `verde` (tetto verde estensivo: sedum, substrato sottile,
 * poca manutenzione), `verde_intensivo` (giardino pensile: substrato profondo, arbusti), `ghiaia` (zavorra,
 * solo tetto piano), `lamiera` (zinco, rame o alluminio a doppia aggraffatura), `guaina` (membrana bituminosa o sintetica).
 * Assente: tegole per i tetti a falde, guaina per il tetto piano.
 */
export type FinituraTetto = "tegole" | "verde" | "verde_intensivo" | "ghiaia" | "lamiera" | "guaina";
export const FINITURE_TETTO: readonly FinituraTetto[] = ["tegole", "verde", "verde_intensivo", "ghiaia", "lamiera", "guaina"];
export const NOMI_FINITURA_TETTO: Record<FinituraTetto, string> = {
  tegole: "Tegole",
  verde: "Tetto verde (sedum)",
  verde_intensivo: "Giardino pensile",
  ghiaia: "Ghiaia",
  lamiera: "Lamiera (zinco, rame)",
  guaina: "Guaina",
};

export interface Tetto {
  tipo: TipoTetto;
  /** Copertura: vedi FinituraTetto. */
  finitura?: FinituraTetto;
  /** Pendenza delle falde, in percento (30 = 30%). */
  pendenza: number;
  /** Sporto della gronda oltre i muri, in cm. */
  sporto: number;
  /** Pannelli fotovoltaici sulle falde migliori (sud; altrimenti est e ovest; sul piano a file). */
  fotovoltaico?: { potenzaPannelloW?: number; pannelliMax?: number };
  /** Mansarda: stanze sotto le falde; imposta = altezza del soffitto sui muri di gronda (cm). */
  mansarda?: { imposta: number };
}

/** Immagine da ricalcare: nel bucket «planimetrie»; (x, y) è l'angolo in alto a sinistra, in cm, y in su. */
export interface Ricalco {
  percorso: string;
  x: number;
  y: number;
  larghezzaCm: number;
  /** Altezza / larghezza dell'immagine. */
  proporzione: number;
  opacita: number;
  /** Conferma della scala del sottofondo tramite una misura nota o un CAD in unità reali. */
  calibrata?: boolean;
  /** Protegge posizione, scala e file del riferimento sul piano. */
  bloccata?: boolean;
}

export interface Riferimenti {
  catastale?: string;
  indirizzo?: string;
  note?: string;
}

export interface Planimetria {
  /** Fonti e valutazioni conservate insieme alla versione verificata. */
  urbanistica?: DatiUrbanistici;
  /** Dichiarato dall'utente, mai dedotto dal numero di stanze. */
  ambitoDocumento?: "ambiente" | "alloggio";
  /** Segnalazioni della lettura iniziale: restano con il disegno anche dopo salvataggi e modifiche. */
  letturaDocumento?: LetturaDocumento;
  /** Materiali comuni, distinti per stato/proposta e salvati con la versione. */
  materialiProgetto?: Record<string, MaterialiProgetto>;
  schema: typeof VERSIONE_SCHEMA;
  unita: "cm";
  titolo?: string;
  /** Denominatore della scala di stampa preferita (50 = 1:50). */
  scala?: number;
  /** Direzione del nord in gradi, antioraria dall'asse y. */
  nord?: number;
  riferimenti?: Riferimenti;
  livelli: Livello[];
  /** Listino delle unità (condomini, bifamiliari in vendita), per sigla dell'unità. */
  vendite?: Record<string, VenditaUnita>;
  /** Rilievo del topografo (punti con la quota): il terreno sotto e intorno alla casa. */
  rilievo?: Rilievo;
  /** Avanzamento: per ogni proposta, le chiavi dei lavori già fatti (vedi chiaveLavoro). */
  lavoriFatti?: Record<string, string[]>;
  /** Nuova costruzione: l'edificio si fa da zero e il computo comprende scavi, strutture e impianti (costruzione.ts). */
  costruzione?: Costruzione;
}

export type StatoVendita = "libera" | "prenotata" | "venduta";
export const STATI_VENDITA: readonly StatoVendita[] = ["libera", "prenotata", "venduta"];
export interface VenditaUnita {
  /** € al mq di superficie commerciale. */
  prezzoMq?: number;
  stato?: StatoVendita;
  note?: string;
  /** La trattativa, quando l'unità è prenotata o venduta. */
  acquirente?: string;
  /** Prezzo concordato, se diverso da prezzo al mq × superficie. */
  prezzoPattuito?: number;
  /** Caparra versata al preliminare. */
  caparra?: number;
  /** Totale incassato finora (caparra compresa). */
  incassato?: number;
  /** Date ISO (AAAA-MM-GG). */
  dataPreliminare?: string;
  dataRogito?: string;
}

const eData = (v: unknown) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const eImporto = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v >= 0;
/** Il listino di un'unità ha la forma giusta? */
export function venditaValida(v: unknown): boolean {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const x = v as Record<string, unknown>;
  return (x.prezzoMq === undefined || eImporto(x.prezzoMq))
    && (x.stato === undefined || (STATI_VENDITA as readonly unknown[]).includes(x.stato))
    && (x.note === undefined || typeof x.note === "string")
    && (x.acquirente === undefined || typeof x.acquirente === "string")
    && [x.prezzoPattuito, x.caparra, x.incassato].every((n) => n === undefined || eImporto(n))
    && [x.dataPreliminare, x.dataRogito].every((d) => d === undefined || eData(d));
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
const idValido = (v: unknown) => typeof v === "string" && ID_VALIDO.test(v);

function riferimentoQuotaValido(r: unknown): boolean {
  if (!eOggetto(r) || !idValido(r.muroId)) return false;
  if (r.tipo === "estremo") return r.estremo === "p1" || r.estremo === "p2";
  if (r.tipo === "intersezione") return idValido(r.altroMuroId) && r.altroMuroId !== r.muroId;
  return r.tipo === "medio";
}

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
  if (dato.ambitoDocumento !== undefined && !["ambiente", "alloggio"].includes(dato.ambitoDocumento as string)) errori.push("La pianta: specifica singolo ambiente o alloggio completo.");
  if (dato.letturaDocumento !== undefined && !(eOggetto(dato.letturaDocumento)
    && Array.isArray(dato.letturaDocumento.avvisiIniziali) && dato.letturaDocumento.avvisiIniziali.length <= 100
    && dato.letturaDocumento.avvisiIniziali.every((v) => typeof v === "string" && v.length <= 4000)
    && eOggetto(dato.letturaDocumento.superficiScritteMq)
    && Object.entries(dato.letturaDocumento.superficiScritteMq).every(([id, v]) => ID_VALIDO.test(id) && eNumero(v) && v > 0)
    && (dato.letturaDocumento.verifiche === undefined || verificheLetturaValide(dato.letturaDocumento.verifiche))
    && (dato.letturaDocumento.protocolloVerifica === undefined || dato.letturaDocumento.protocolloVerifica === 1)
    && (dato.letturaDocumento.sorgente === undefined || (eOggetto(dato.letturaDocumento.sorgente)
      && typeof dato.letturaDocumento.sorgente.percorso === "string" && /^[a-zA-Z0-9_-]+\/ricalco\/[a-zA-Z0-9._-]+$/.test(dato.letturaDocumento.sorgente.percorso)
      && typeof dato.letturaDocumento.sorgente.nome === "string" && dato.letturaDocumento.sorgente.nome.length <= 250)))) errori.push("La pianta: i controlli del documento originale non sono validi.");
  if (dato.materialiProgetto !== undefined && !materialiProgettoValidi(dato.materialiProgetto)) errori.push("La pianta: i materiali comuni non sono validi.");
  if (dato.urbanistica !== undefined && !urbanisticaValida(dato.urbanistica)) errori.push("La pianta: i riferimenti urbanistici non sono validi.");
  if (dato.scala !== undefined && !(eNumero(dato.scala) && dato.scala > 0)) errori.push("La pianta: la scala deve essere un numero maggiore di zero.");
  if (dato.nord !== undefined && !eNumero(dato.nord)) errori.push("La pianta: il nord deve essere un numero di gradi.");
  if (dato.lavoriFatti !== undefined && (!eOggetto(dato.lavoriFatti) || !Object.values(dato.lavoriFatti).every((v) => Array.isArray(v) && v.every((x) => typeof x === "string")))) {
    errori.push("La pianta: l'avanzamento dei lavori non è valido.");
  }
  if (dato.rilievo !== undefined && !rilievoValido(dato.rilievo)) errori.push("La pianta: il rilievo del terreno non è valido.");
  if (dato.costruzione !== undefined && !costruzioneValida(dato.costruzione)) errori.push("La pianta: le scelte della nuova costruzione non sono valide.");
  if (dato.vendite !== undefined) {
    if (!eOggetto(dato.vendite)) errori.push("La pianta: il listino delle unità non è valido.");
    else for (const [sigla, v] of Object.entries(dato.vendite)) {
      if (!venditaValida(v)) {
        errori.push(`La pianta: il listino dell'unità «${sigla}» non è valido.`);
      }
    }
  }
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
    if (liv.tetto !== undefined) {
      const t = liv.tetto;
      if (!eOggetto(t) || !(TIPI_TETTO as readonly unknown[]).includes(t.tipo) || !eNumero(t.pendenza) || !eNumero(t.sporto) || (t.pendenza as number) < 0 || (t.pendenza as number) > 150) {
        errori.push(`${nomeLiv}: il tetto non è valido.`);
      } else if (t.finitura !== undefined && !(FINITURE_TETTO as readonly unknown[]).includes(t.finitura)) {
        errori.push(`${nomeLiv}: la copertura del tetto non è valida.`);
      } else if (t.mansarda !== undefined && !(eOggetto(t.mansarda) && eNumero(t.mansarda.imposta) && t.mansarda.imposta >= 0 && t.mansarda.imposta <= 500)) {
        errori.push(`${nomeLiv}: l'altezza d'imposta della mansarda non è valida.`);
      } else if (t.fotovoltaico !== undefined) {
        const f = t.fotovoltaico;
        if (!eOggetto(f) || (f.potenzaPannelloW !== undefined && !(eNumero(f.potenzaPannelloW) && f.potenzaPannelloW > 0)) || (f.pannelliMax !== undefined && !(eNumero(f.pannelliMax) && f.pannelliMax >= 0))) {
          errori.push(`${nomeLiv}: il fotovoltaico del tetto non è valido.`);
        }
      }
    }
    if (liv.ricalco !== undefined) {
      const r = liv.ricalco;
      if (!eOggetto(r) || typeof r.percorso !== "string" || !r.percorso || ![r.x, r.y, r.larghezzaCm, r.proporzione, r.opacita].every(eNumero) || !((r.larghezzaCm as number) > 0)
        || (r.calibrata !== undefined && typeof r.calibrata !== "boolean") || (r.bloccata !== undefined && typeof r.bloccata !== "boolean")) {
        errori.push(`${nomeLiv}: l'immagine da ricalcare non è valida.`);
      }
    }
    if (liv.riscontroScala !== undefined) {
      const r = liv.riscontroScala;
      if (!eOggetto(r) || (r.stato !== "da_verificare" && (r.stato !== "confermata"
        || typeof r.muroId !== "string" || !ID_VALIDO.test(r.muroId)
        || !eNumero(r.distanzaCm) || r.distanzaCm <= 0
        || typeof r.verificataIl !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(r.verificataIl)))) {
        errori.push(`${nomeLiv}: il riscontro della scala del modello non è valido.`);
      }
    }
    if (liv.letturaAssistita !== undefined && !letturaAssistitaValida(liv.letturaAssistita)) {
      errori.push(`${nomeLiv}: le proposte sulla tavola non sono valide.`);
    }
    if (liv.controlloDwg !== undefined && !controlloDwgValido(liv.controlloDwg)) {
      errori.push(`${nomeLiv}: i riscontri del DWG non sono validi.`);
    }
    if (liv.tavolaDwg !== undefined && !tavolaDwgValida(liv.tavolaDwg)) {
      errori.push(`${nomeLiv}: i layer della tavola DWG non sono validi.`);
    }

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
      if (pr.alternativaDi !== undefined && (typeof pr.alternativaDi !== "string" || pr.alternativaDi === pr.id || !ID_PROPOSTA.test(pr.alternativaDi))) {
        errori.push(`${etichetta}: la variante di partenza non è valida.`);
      }
      if (pr.distribuzioneBilocali !== undefined && pr.distribuzioneBilocali !== true) errori.push(etichetta + ": la distribuzione in bilocali non è valida.");
      const f = pr.frazionamenti;
      if (f !== undefined && (!Array.isArray(f) || f.length > 100 || f.some((r) => !eOggetto(r) ||
        typeof r.localeId !== "string" || !ID_VALIDO.test(r.localeId) ||
        !Array.isArray(r.parti) || r.parti.length < 2 || r.parti.length > 3 || r.parti.some(id => typeof id !== "string" || !ID_VALIDO.test(id)) ||
        !Array.isArray(r.pareti) || r.pareti.length !== r.parti.length - 1 || r.pareti.some(id => typeof id !== "string" || !ID_VALIDO.test(id)) ||
        (r.richiesta !== undefined && (typeof r.richiesta !== "string" || r.richiesta.length > 1000)) ||
        (r.motivazione !== undefined && (typeof r.motivazione !== "string" || r.motivazione.length > 500))))) {
        errori.push(`${etichetta}: il frazionamento non è valido.`);
      }
      if (pr.spostamentiBagno !== undefined && !spostamentiLocaliValidi(pr.spostamentiBagno, r =>
        Array.isArray(r.sanitari) && r.sanitari.length > 0 && r.sanitari.length <= SANITARI_BAGNO.length &&
        new Set(r.sanitari).size === r.sanitari.length && r.sanitari.every(s => (SANITARI_BAGNO as readonly unknown[]).includes(s)))) {
        errori.push(`${etichetta}: gli spostamenti dei bagni non sono validi.`);
      }
      if (pr.spostamentiCucina !== undefined && !spostamentiLocaliValidi(pr.spostamentiCucina)) {
        errori.push(`${etichetta}: gli spostamenti delle cucine non sono validi.`);
      }
      if (pr.prezziLavorazioni !== undefined && (!eOggetto(pr.prezziLavorazioni) || Object.entries(pr.prezziLavorazioni).length > 5000 ||
        Object.entries(pr.prezziLavorazioni).some(([id, p]) => !/^[-\w:.]{1,220}$/.test(id) || !eOggetto(p)
          || !eNumero(p.importo) || (p.importo as number) < 0 || !["m²", "m", "cad", "a corpo"].includes(p.unita as string)
          || typeof p.fonte !== "string" || !p.fonte.trim() || p.fonte.length > 300 || typeof p.tariffa !== "string" || p.tariffa.length > 120
          || (p.data !== undefined && (typeof p.data !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(p.data)))))) {
        errori.push(`${etichetta}: i prezzi delle lavorazioni non sono validi.`);
      }
      validaStato(pr, etichetta, `progetto:${pr.id}`, false, errori, idPerAmbito);
    });
  });

  return errori.length ? { ok: false, errori } : { ok: true, planimetria: dato as unknown as Planimetria };
}

function spostamentiLocaliValidi(valore: unknown, datiValidi = (_riga: Oggetto) => true): boolean {
  if (!Array.isArray(valore) || valore.length > 100) return false;
  const id = new Set<string>(), locali = new Set<string>();
  return valore.every(r => {
    if (!eOggetto(r) || typeof r.id !== "string" || !ID_VALIDO.test(r.id) ||
      typeof r.origineId !== "string" || !ID_VALIDO.test(r.origineId) ||
      typeof r.destinazioneId !== "string" || !ID_VALIDO.test(r.destinazioneId) ||
      r.origineId === r.destinazioneId || id.has(r.id) || locali.has(r.origineId) || locali.has(r.destinazioneId) ||
      !datiValidi(r)) return false;
    id.add(r.id);
    locali.add(r.origineId);
    locali.add(r.destinazioneId);
    return true;
  });
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
    if (o.funzioneDaVerificare !== undefined && typeof o.funzioneDaVerificare !== "boolean") {
      errori.push(`${e}: il riscontro della funzione non è valido.`);
    }
    if (o.bloccato !== undefined && typeof o.bloccato !== "boolean") errori.push(`${e}: il blocco della parete non è valido.`);
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
    if (o.luceNettaCm !== undefined && (o.tipo !== "porta" || !eNumero(o.luceNettaCm) || o.luceNettaCm <= 0 || o.luceNettaCm > Number(o.larghezza))) {
      errori.push(`${e}: la luce netta deve rientrare nella larghezza del vano della porta.`);
    }
    for (const [valore,nome] of [[o.superficieApribileMq,"apribile"],[o.superficieIlluminanteMq,"illuminante"]] as const) {
      if (valore !== undefined && ((o.tipo !== "finestra" && o.tipo !== "portafinestra") || !eNumero(valore)
        || valore < 0 || valore > Number(o.larghezza) * Number(o.altezza) / 10_000)) {
        errori.push(`${e}: la superficie ${nome} deve rientrare nella superficie del vano finestrato.`);
      }
    }
    scelta(o.manovra, MANOVRE, e, "il modo di apertura");
    if (o.ante !== undefined && !(Number.isInteger(o.ante) && (o.ante as number) >= 1 && (o.ante as number) <= 6)) errori.push(`${e}: le ante devono essere da 1 a 6.`);
    if (o.sistema !== undefined) scelta(o.sistema, SISTEMI_APERTURA, e, "il sistema del serramento");
    if (o.oscurante !== undefined) scelta(o.oscurante, TIPI_OSCURANTE, e, "l'oscurante");
    if (o.cassonetto !== undefined) scelta(o.cassonetto, TIPI_CASSONETTO, e, "il cassonetto");
    if (o.altezzaCassonetto !== undefined) positivo(o, "altezzaCassonetto", e, "l'altezza del cassonetto");
    if (o.zanzariera !== undefined) scelta(o.zanzariera, TIPI_ZANZARIERA, e, "la zanzariera");
    if (o.motore !== undefined && typeof o.motore !== "boolean") errori.push(`${e}: il motore dev'essere sì o no.`);
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
    if (o.superficieDichiarataMq !== undefined) positivo(o, "superficieDichiarataMq", e, "la superficie indicata sulla tavola");
    if (o.aperto !== undefined && typeof o.aperto !== "boolean") errori.push(`${e}: l'indicazione di zona aperta non è valida.`);
    if (o.unita !== undefined && (typeof o.unita !== "string" || o.unita.length > 40)) errori.push(`${e}: l'unità immobiliare deve essere un testo breve.`);
    if (o.finiture !== undefined) {
      if (!eOggetto(o.finiture)) errori.push(`${e}: le finiture non sono valide.`);
      else {
        if (o.finiture.pavimentoSpecifico !== undefined && typeof o.finiture.pavimentoSpecifico !== "boolean") errori.push(`${e}: la finitura specifica del pavimento non è valida.`);
        if (o.finiture.posaPavimento !== undefined && !["dritta", "traversa", "diagonale"].includes(o.finiture.posaPavimento as string)) errori.push(`${e}: la posa del pavimento non è valida.`);
        if (o.finiture.rivestimento !== undefined && o.finiture.rivestimento !== null) {
          const r = o.finiture.rivestimento;
          if (!eOggetto(r) || !(eNumero(r.altezza) && r.altezza > 0)) errori.push(`${e}: l'altezza del rivestimento deve essere un numero maggiore di zero.`);
        }
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
    const alzate = o.alzateCad;
    if (alzate !== undefined && (
      o.tipo !== "scala" || !Array.isArray(alzate) || alzate.length < 2 || alzate.length > 41 ||
      alzate.some((a) => !Array.isArray(a) || a.length !== 2 || a.some((p) => !eOggetto(p) ||
        !eNumero(p.x) || !eNumero(p.y) || Math.abs(p.x) > 0.5 || Math.abs(p.y) > 0.5))
    )) errori.push(`${e}: le alzate della scala CAD non sono valide.`);
    if (o.colore !== undefined && (typeof o.colore !== "string" || !/^#[0-9a-f]{6}$/i.test(o.colore))) errori.push(`${e}: il colore dell'arredo non è valido.`);
    if (o.modello !== undefined && (typeof o.tipo !== "string" || typeof o.modello !== "string" || !modelloArredo(o.tipo, o.modello))) {
      errori.push(`${e}: il modello non appartiene a questa categoria di arredo.`);
    }
    statoLavori(o, e, false);
    origini(o, e);
  }, nomeDi("elemento"));

  if (stato.tracciatiImpianti !== undefined) {
    const tracciati = stato.tracciatiImpianti;
    if (!Array.isArray(tracciati)) errori.push(`${dove}: l’elenco dei tracciati impiantistici non è valido.`);
    else {
      const elementi = new Set<string>();
      if (Array.isArray(stato.elementi)) for (const e of stato.elementi) {
        if (eOggetto(e) && typeof e.id === "string") elementi.add(e.id);
      }
      const chiavi = new Set<string>();
      tracciati.forEach((t: unknown, i: number) => {
        const e = `${dove}, tracciato ${i + 1}`;
        if (!eOggetto(t)) { errori.push(`${e}: tracciato non valido.`); return; }
        scelta(t.linea, LINEE_IMPIANTO, e, "la linea");
        if (typeof t.daId !== "string" || typeof t.aId !== "string" || t.daId === t.aId ||
          !elementi.has(t.daId) || !elementi.has(t.aId)) errori.push(`${e}: i due simboli devono appartenere a questo disegno.`);
        const chiave = JSON.stringify([t.linea, t.daId, t.aId]);
        if (chiavi.has(chiave)) errori.push(`${e}: il collegamento è già disegnato.`);
        chiavi.add(chiave);
        if (!Array.isArray(t.vertici)) errori.push(`${e}: manca l’elenco dei vertici.`);
        else t.vertici.forEach((p: unknown, k: number) => punto(p, e, `il vertice ${k + 1}`));
      });
    }
  }

  if (stato.pavimentoRadiante !== undefined) {
    const zone = stato.pavimentoRadiante;
    if (!Array.isArray(zone)) errori.push(`${dove}: l’elenco delle zone radianti non è valido.`);
    else {
      const locali = new Set<string>();
      if (Array.isArray(stato.locali)) for (const l of stato.locali) {
        if (eOggetto(l) && typeof l.id === "string" && typeof l.destinazione === "string" &&
          eAmbienteInterno({ destinazione: l.destinazione, aperto: l.aperto === true })) locali.add(l.id);
      }
      const usati = new Set<string>();
      zone.forEach((z: unknown, i: number) => {
        const e = `${dove}, zona radiante ${i + 1}`;
        if (!eOggetto(z) || typeof z.localeId !== "string" || !locali.has(z.localeId)) {
          errori.push(`${e}: seleziona un locale interno di questo disegno.`);
          return;
        }
        if (usati.has(z.localeId)) errori.push(`${e}: il locale ha già una zona radiante.`);
        usati.add(z.localeId);
        if (!eNumero(z.passoCm) || z.passoCm < PASSO_RADIANTE_CM.min || z.passoCm > PASSO_RADIANTE_CM.max) {
          errori.push(`${e}: il passo deve essere tra ${PASSO_RADIANTE_CM.min} e ${PASSO_RADIANTE_CM.max} cm.`);
        }
        if (!eNumero(z.superficieEsclusaMq) || z.superficieEsclusaMq < 0) errori.push(`${e}: la superficie esclusa non è valida.`);
      });
    }
  }

  if (stato.collettoreRadiante !== undefined) {
    const c = stato.collettoreRadiante;
    if (!eOggetto(c)) errori.push(`${dove}: il collettore radiante non è valido.`);
    else {
      punto(c.posizione, dove, "la posizione del collettore radiante");
      if (!eNumero(c.quotaCm) || c.quotaCm < QUOTA_COLLETTORE_RADIANTE_CM.min || c.quotaCm > QUOTA_COLLETTORE_RADIANTE_CM.max) {
        errori.push(`${dove}: la quota del collettore radiante non è valida.`);
      }
      if (!eNumero(c.limiteCircuitoM) || c.limiteCircuitoM < LIMITE_CIRCUITO_RADIANTE_M.min || c.limiteCircuitoM > LIMITE_CIRCUITO_RADIANTE_M.max) {
        errori.push(`${dove}: la lunghezza obiettivo del circuito radiante non è valida.`);
      }
    }
  }

  elenco("quote", "delle quote", (o, e) => {
    punto(o.p1, e, "l'inizio");
    punto(o.p2, e, "la fine");
    if (!eNumero(o.scostamento)) errori.push(`${e}: la distanza dalla parete deve essere un numero.`);
    if (o.origine !== undefined) scelta(o.origine, ORIGINI, e, "l'origine della misura");
    if (o.testoOriginale !== undefined && (typeof o.testoOriginale !== "string" || o.testoOriginale.length > 100)) {
      errori.push(`${e}: l'etichetta originale non è valida.`);
    }
    if (o.riferimenti !== undefined && (!eOggetto(o.riferimenti) || !Object.entries(o.riferimenti).every(([k, r]) =>
      (k === "p1" || k === "p2") && riferimentoQuotaValido(r)))) {
      errori.push(`${e}: gli agganci della quota non sono validi.`);
    }
  }, nomeDi("quota"));

  if (stato.aree !== undefined) elenco("aree", "delle aree esterne", (o, e) => {
    scelta(o.tipo, TIPI_AREA, e, "il tipo");
    if (!Array.isArray(o.contorno) || o.contorno.length < 3) errori.push(`${e}: il contorno deve avere almeno tre punti.`);
    else o.contorno.forEach((pt: unknown, k: number) => punto(pt, e, `il punto ${k + 1} del contorno`));
    if (o.nome !== undefined && (typeof o.nome !== "string" || o.nome.length > 80)) errori.push(`${e}: il nome deve essere un testo breve.`);
    if (o.recinzione !== undefined && typeof o.recinzione !== "boolean") errori.push(`${e}: «recinzione» deve essere sì o no.`);
    if (o.quota !== undefined && !eNumero(o.quota)) errori.push(`${e}: la quota deve essere un numero.`);
    statoLavori(o, e, false);
  }, nomeDi("area"));

  elenco("testi", "dei testi", (o, e) => {
    punto(o.posizione, e, "la posizione");
    if (typeof o.testo !== "string") errori.push(`${e}: manca il testo.`);
    if (o.rotazione !== undefined && !eNumero(o.rotazione)) errori.push(`${e}: la rotazione deve essere un numero di gradi.`);
  }, nomeDi("testo"));
}
