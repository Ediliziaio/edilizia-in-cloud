/**
 * Tipi del 3D delle planimetrie.
 *
 * Due famiglie:
 *  - `PiantaPer3D` è ciò che la costruzione del 3D legge: muri, aperture, locali ed
 *    elementi di UN livello, in centimetri, nelle coordinate della pianta (x verso
 *    destra, y verso il basso, come sullo schermo). La produce `adattatore.ts` dal
 *    modello della planimetria: se il modello cambia, cambia l'adattatore, non il 3D.
 *  - `Scena3D` è il risultato: mesh già triangolate, in metri, con l'asse Y verso
 *    l'alto (convenzione di glTF e di three.js). Il punto (x, y) della pianta va in
 *    (x/100, 0, y/100): guardando dall'alto con il nord in cima si rivede la pianta.
 */

export type StatoOggetto = "esistente" | "demolire" | "nuovo";

/** Cosa mostrare: lo stato di fatto, il progetto, o entrambi con i colori giallo/rosso. */
export type Vista3D = "fatto" | "progetto" | "confronto";

export interface Punto2 {
  x: number;
  y: number;
}

export interface MuroPer3D {
  id: string;
  /** Asse del muro, in cm. */
  a: Punto2;
  b: Punto2;
  spessore: number;
  altezza: number;
  stato: StatoOggetto;
}

/** `varco` = passaggio senza infisso. */
export type TipoApertura = "porta" | "finestra" | "portafinestra" | "varco";

export interface AperturaPer3D {
  id: string;
  muroId: string;
  tipo: TipoApertura;
  /** Distanza del CENTRO dell'apertura dall'estremo `a` del muro, lungo l'asse, in cm. */
  posizione: number;
  larghezza: number;
  altezza: number;
  /** Altezza del davanzale dal pavimento (0 per le porte), in cm. */
  davanzale: number;
  /**
   * esistente = c'è e resta; nuovo = da aprire in un muro (demolizione della muratura);
   * demolire = da chiudere (tamponamento, muratura nuova).
   */
  stato: StatoOggetto;
}

export interface LocalePer3D {
  id: string;
  nome: string;
  destinazione: string;
  /** Contorno interno del locale (filo muro), in cm. */
  contorno: Punto2[];
  altezza: number;
}

export interface ElementoPer3D {
  id: string;
  /** wc, bidet, lavabo, doccia, vasca, letto, divano, tavolo, sedia, cucina, frigorifero, armadio, comodino, caldaia… */
  tipo: string;
  /** Centro dell'ingombro in pianta (y verso il basso), in cm. */
  centro: Punto2;
  /** Gradi, in senso orario sulla pianta. A 0° il retro dell'elemento guarda verso l'alto della pianta. */
  rotazione: number;
  /** Ingombro in cm; se mancano si usano le misure tipiche del tipo. */
  larghezza?: number;
  profondita?: number;
  altezza?: number;
  localeId?: string;
}

export interface PiantaPer3D {
  muri: MuroPer3D[];
  aperture: AperturaPer3D[];
  locali: LocalePer3D[];
  elementi: ElementoPer3D[];
}

// ─── Risultato ──────────────────────────────────────────────────────────────

export type V3 = [number, number, number];

export type GenereMesh = "muro" | "vano" | "tamponamento" | "nodo" | "pavimento" | "soffitto" | "vetro" | "elemento";

export interface Mesh3D {
  id: string;
  /** Nome leggibile, finisce nei file esportati (Blender lo mostra nell'elenco oggetti). */
  nome: string;
  genere: GenereMesh;
  /** Chiave in `Scena3D.materiali`. */
  materiale: string;
  /** id dell'oggetto della pianta da cui viene (muro, apertura, locale, elemento). */
  riferimento: string;
  posizioni: number[];
  normali: number[];
  indici: number[];
  /** Facce piane (rettangoli e poligoni) prima della triangolazione. */
  facce: number;
}

export interface Materiale3D {
  nome: string;
  /** Colore sRGB, "#rrggbb". */
  colore: string;
  /** 1 = opaco. */
  opacita: number;
  ruvidita: number;
}

export interface Limiti3D {
  min: V3;
  max: V3;
}

export interface Scena3D {
  mesh: Mesh3D[];
  materiali: Record<string, Materiale3D>;
  limiti: Limiti3D;
  /** Cose della pianta che il 3D ha dovuto correggere o saltare, in parole semplici. */
  avvisi: string[];
}

export interface OpzioniScena {
  vista?: Vista3D;
  /** Soffitto dei locali. Predefinito: sì. */
  soffitto?: boolean;
  /** Sanitari e arredi. Predefinito: sì. */
  elementi?: boolean;
}

// ─── Telecamera ─────────────────────────────────────────────────────────────

export interface Telecamera3D {
  posizione: V3;
  guarda: V3;
  /** Direzione "su" dello schermo. Predefinito [0, 1, 0]; dall'alto [0, 0, -1] (nord in cima). */
  alto?: V3;
  /** Campo visivo verticale in gradi. */
  fov: number;
}
