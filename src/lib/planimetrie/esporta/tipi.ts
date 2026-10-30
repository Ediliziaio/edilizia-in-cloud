/**
 * Ciò che le esportazioni sanno della pianta.
 *
 * Le esportazioni non leggono il modello della fase 1 direttamente: leggono una
 * **vista**, cioè la pianta di un livello già risolta in muri, aperture, locali,
 * arredi, quote e scritte, ognuno con il suo stato (esistente, da demolire,
 * nuovo). Dal modello alla vista passa solo `adattatore.ts`: quando il modello
 * cambia si tocca quello, non i disegnatori.
 *
 * Unità: centimetri. Asse y verso il basso, come sullo schermo (il nord in alto
 * è y negativo): il PDF e il DXF lo girano loro.
 */

export interface Punto {
  x: number;
  y: number;
}

/** Da dove viene una misura: le stimate si vedono diverse (regola del piano). */
export type OrigineMisura = "rilevata" | "da_documento" | "stimata";

/** Stato di fatto o di progetto: giallo = demolizioni, rosso = nuovo. */
export type StatoCostruttivo = "esistente" | "da_demolire" | "nuovo";

export interface MuroVista {
  id: string;
  /** Asse del muro. */
  p1: Punto;
  p2: Punto;
  spessore: number;
  altezza?: number;
  tipo?: "esterno" | "portante" | "tramezzo";
  stato: StatoCostruttivo;
  origine?: OrigineMisura;
}

export type TipoApertura = "porta" | "finestra" | "portafinestra" | "varco";

export interface AperturaVista {
  id: string;
  muroId: string;
  tipo: TipoApertura;
  /** Distanza del bordo dell'apertura più vicino a `p1` dall'inizio del muro. */
  distanza: number;
  larghezza: number;
  altezza?: number;
  davanzale?: number;
  /** Di serie a battente; «nessuna» è un vano senza anta. */
  manovra?: "battente" | "scorrevole" | "nessuna";
  /**
   * Da che parte sta la cerniera guardando da p1 verso p2 («inizio» = vicino a
   * p1) e su quale lato del muro si apre l'anta («sinistra» = a sinistra di chi
   * cammina da p1 a p2). Le finestre ne usano solo il numero di ante.
   */
  cerniera?: "inizio" | "fine";
  lato?: "sinistra" | "destra";
  ante?: 1 | 2;
  stato: StatoCostruttivo;
}

/** Le finiture di pavimento che la pianta da presentazione sa disegnare. */
export type Pavimento = "parquet" | "gres" | "piastrelle" | "cotto" | "resina" | "marmo";

export interface LocaleVista {
  id: string;
  nome: string;
  destinazione?: string;
  /** Contorno calpestabile (filo interno dei muri), in senso qualunque. */
  contorno: Punto[];
  altezza?: number;
  /** Superficie in mq se il modello la dà già calcolata; altrimenti dal contorno. */
  superficieMq?: number;
  perimetroM?: number;
  pavimento?: Pavimento;
  origine?: OrigineMisura;
}

export type TipoElemento =
  | "wc" | "bidet" | "lavabo" | "doccia" | "vasca"
  | "cucina" | "frigorifero" | "lavatrice" | "caldaia"
  | "letto_matrimoniale" | "letto_singolo" | "divano" | "tavolo" | "sedia"
  | "armadio" | "comodino" | "scrivania"
  /** Un oggetto che non ha un simbolo suo: riquadro con la diagonale. */
  | "generico";

export interface ElementoVista {
  id: string;
  tipo: TipoElemento;
  /** Centro del simbolo. */
  posizione: Punto;
  /** Ingombro lungo x e y prima della rotazione. */
  larghezza: number;
  profondita: number;
  /** Gradi, in senso orario sullo schermo. 0 = schienale/attacco in alto. */
  rotazione?: number;
  stato?: StatoCostruttivo;
}

export interface QuotaVista {
  p1: Punto;
  p2: Punto;
  /** Distanza della linea di quota dall'allineamento p1–p2, a sinistra di p1→p2 se positiva. */
  scostamento: number;
  testo?: string;
  origine?: OrigineMisura;
}

export interface TestoVista {
  posizione: Punto;
  testo: string;
  /** Altezza del carattere sul foglio, in mm. */
  altezzaMm?: number;
  rotazione?: number;
}

export interface VistaPianta {
  titolo: string;
  /** «Piano terra», «Stato di progetto — proposta A»… */
  livello?: string;
  muri: MuroVista[];
  aperture: AperturaVista[];
  locali: LocaleVista[];
  elementi: ElementoVista[];
  quote: QuotaVista[];
  testi: TestoVista[];
  /** Gradi del nord rispetto all'alto del foglio, se noto. */
  nord?: number;
}

/** I dati del riquadro in basso: chi l'ha fatta, per chi, quando. */
export interface DatiCartiglio {
  azienda: {
    nome: string;
    indirizzo?: string;
    partitaIva?: string;
    telefono?: string;
    email?: string;
    /** Colore dell'azienda (company_branding.primary_color). */
    colore?: string | null;
    logo?: LogoCartiglio | null;
  };
  cliente?: string;
  indirizzoCantiere?: string;
  /** «Pianta stato di progetto», «Rilievo stato di fatto»… */
  oggetto?: string;
  data?: Date | string;
  versione?: string;
  tavola?: string;
  redattore?: string;
}

export interface LogoCartiglio {
  dati: Uint8Array;
  tipo: "png" | "jpg";
}

/** Tecnico: bianco e nero come lo vuole il geometra. Presentazione: colori e pavimenti. */
export type StileDisegno = "tecnico" | "presentazione";
