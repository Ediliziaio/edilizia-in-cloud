// src/components/orders/generali/tipiScheda.ts
// Il contratto tra la pagina della generale e i suoi moduli.
import type { ComponentType } from "react";
import type { RiepilogoGenerale, TotaliGenerale } from "@/lib/orders/commesseGenerali";

export interface PropsScheda {
  riepilogo: RiepilogoGenerale;
  totali: TotaliGenerale;
  /** Chi guarda può modificare (permesso commesse e non da telefono). */
  puoModificare: boolean;
}

export interface ModuloScheda {
  /** false = in costruzione: la scheda non compare. */
  pronto: boolean;
  /** Etichetta della scheda; può dipendere dal modello (es. «Unità» / «Ordini di lavoro»). */
  titolo: string;
  /** La scheda compare anche da telefono (in sola lettura, salvo azioni dichiarate dal modulo). */
  telefono: boolean;
  Scheda: ComponentType<PropsScheda>;
  /** Facoltativo: un riquadro in Panoramica, sotto i quattro numeri (es. unità vendute, capitale impegnato). */
  Riquadro?: ComponentType<PropsScheda>;
}
