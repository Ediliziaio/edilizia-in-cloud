// Schema PROVVISORIO della planimetria, usato finché la fase 1 non pubblica il
// modello vero in shared/planimetrie/ (con docs/planimetrie/modello.md).
// Segue la «Scelta 1» del piano (docs/superpowers/specs/2026-10-30-planimetrie-design.md):
// oggetti che sanno cosa sono (muri, aperture, locali), misure in centimetri,
// e per ogni misura la sua origine. Quando arriva il modello della fase 1 questo
// file sparisce e adattaModello.ts traduce da qui a lì (o lo sostituisce).

/** Da dove viene una misura. Le «stimate» si vedono diverse e il computo avvisa. */
export type Origine = "rilevata" | "da_documento" | "stimata";

/** Una misura in centimetri con la sua origine. */
export interface Misura {
  valore: number;
  origine: Origine;
}

/** Punto in centimetri. Asse y verso il basso, come nell'immagine di partenza. */
export interface Punto {
  x: number;
  y: number;
}

export type StatoElemento = "esistente" | "da_demolire" | "nuovo";
export type TipoMuro = "portante" | "tramezzo" | "non_noto";
export type TipoApertura = "porta" | "finestra" | "portafinestra";

export const DESTINAZIONI = [
  "soggiorno", "cucina", "camera", "bagno", "disimpegno", "ingresso",
  "ripostiglio", "studio", "lavanderia", "balcone", "terrazzo", "garage",
  "cantina", "altro",
] as const;
export type Destinazione = typeof DESTINAZIONI[number];

export interface Muro {
  id: string;
  /** Asse del muro. */
  p1: Punto;
  p2: Punto;
  spessore: Misura;
  altezza: Misura;
  /** Lunghezza dell'asse: tenuta a parte per conservarne l'origine. */
  lunghezza: Misura;
  tipo: TipoMuro;
  stato: StatoElemento;
}

export interface Apertura {
  id: string;
  muro_id: string;
  tipo: TipoApertura;
  /** Distanza del centro dell'apertura da p1 del muro, in cm. */
  posizione: number;
  larghezza: Misura;
  altezza: Misura;
  davanzale: Misura | null;
  stato: StatoElemento;
}

export interface Locale {
  id: string;
  nome: string;
  destinazione: Destinazione;
  /** Contorno netto (filo interno dei muri), in senso qualsiasi, senza ripetere il primo punto. */
  contorno: Punto[];
  /** Origine della forma (posizione e lati del contorno). */
  origine_forma: Origine;
  altezza: Misura;
  /** Superficie scritta sul documento, in mq, se c'era: serve al confronto. */
  superficie_scritta_mq: number | null;
}

export interface Livello {
  id: string;
  nome: string;
  muri: Muro[];
  aperture: Apertura[];
  locali: Locale[];
}

export type IngressoGenerazione =
  | "documento"      // PDF/immagine di una pianta (catastale, geometra)
  | "schizzo"        // foto di uno schizzo a mano con misure
  | "descrizione"    // descrizione a parole
  | "sopralluogo"    // elenco stanze del sopralluogo
  | "dxf";           // DXF come sfondo da ricalcare

/** Come è stata fissata la scala del disegno. */
export interface ScalaPianta {
  /** quota_letta: da una quota scritta sul documento; superficie_letta: dai mq scritti;
   *  porte: provvisoria, dalle porte larghe 80 cm; misura_utente: confermata da una persona;
   *  in_metri: il modello ha già lavorato in metri (schizzo, descrizione, sopralluogo). */
  metodo: "quota_letta" | "superficie_letta" | "porte" | "misura_utente" | "in_metri";
  /** Centimetri per unità dell'immagine (pixel); 1 se metodo = in_metri. */
  cm_per_unita: number;
  /** True finché una persona non ha confermato almeno una misura. */
  da_confermare: boolean;
}

export interface SfondoDxf {
  path: string;
  unita: "mm" | "cm" | "m" | "sconosciuta";
  /** Fattore per portare le coordinate del DXF in cm. */
  cm_per_unita: number;
  estensione: { min: Punto; max: Punto } | null;
}

export interface Planimetria {
  versione_schema: "provvisoria-1";
  unita: "cm";
  livelli: Livello[];
  scala: ScalaPianta | null;
  riferimenti: {
    ingresso: IngressoGenerazione;
    sorgente_path: string | null;
    sfondo_dxf: SfondoDxf | null;
  };
  /** Frasi semplici per l'utente: cosa controllare. */
  avvisi: string[];
}
