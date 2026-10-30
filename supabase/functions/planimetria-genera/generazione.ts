// Ciò che la generazione sa e il documento della pianta non tiene: come è
// stata fissata la scala, cosa controllare, lo sfondo DXF da ricalcare. Esce
// accanto alla pianta (modello della fase 1, shared/planimetrie/modello.ts).

import type { Planimetria, Punto } from "../../../shared/planimetrie/modello.ts";

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
   *  in_metri: il modello ha lavorato direttamente in metri (schizzo, descrizione, sopralluogo). */
  metodo: "quota_letta" | "superficie_letta" | "porte" | "misura_utente" | "in_metri";
  /** Centimetri per pixel dell'immagine; 1 con in_metri. */
  cm_per_unita: number;
  /** Vero finché una persona non ha confermato almeno una misura. */
  da_confermare: boolean;
}

export interface SfondoDxf {
  path: string;
  unita: "mm" | "cm" | "m" | "sconosciuta";
  /** Fattore per portare le coordinate del DXF in cm. */
  cm_per_unita: number;
  estensione: { min: Punto; max: Punto } | null;
}

export interface InfoGenerazione {
  ingresso: IngressoGenerazione;
  scala: ScalaPianta | null;
  /** Frasi semplici per l'utente: cosa controllare. */
  avvisi: string[];
  sorgente_path: string | null;
  sfondo_dxf: SfondoDxf | null;
  /** Superficie scritta sul documento per locale (id → mq), per il confronto. */
  superfici_scritte: Record<string, number>;
}

export interface PiantaGenerata {
  planimetria: Planimetria;
  generazione: InfoGenerazione;
}

/** Origine della versione salvata (planimetrie_versioni.origine). */
export function origineVersione(ingresso: IngressoGenerazione, mime: string | null): string {
  if (ingresso === "documento") return mime === "application/pdf" ? "ai_pdf" : "ai_foto";
  if (ingresso === "schizzo") return "ai_schizzo";
  if (ingresso === "descrizione") return "ai_testo";
  if (ingresso === "sopralluogo") return "sopralluogo";
  return "importazione";
}
