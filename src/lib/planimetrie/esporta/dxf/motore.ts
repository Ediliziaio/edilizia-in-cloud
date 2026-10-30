/**
 * Il motore che scrive il file DXF.
 *
 * Le esportazioni parlano solo con questa interfaccia: oggi c'è un motore in
 * TypeScript (`r12.ts`), domani può esserci quello dei crate di cadcraft in
 * WebAssembly se la fase 0 lo consiglia. Coordinate già nel sistema del DXF
 * (y verso l'alto) e nell'unità scelta; angoli in gradi, antiorari.
 */

export interface PuntoDxf {
  x: number;
  y: number;
}

export interface DefinizioneLayer {
  nome: string;
  /** Colore AutoCAD (ACI): 1 rosso, 2 giallo, 3 verde, 4 ciano, 7 bianco/nero, 8 grigio. */
  colore: number;
  tipoLinea?: "CONTINUOUS" | "TRATTEGGIATA";
}

export interface OpzioniTestoDxf {
  rotazione?: number;
  orizzontale?: "sinistra" | "centro" | "destra";
  verticale?: "basso" | "centro" | "alto";
}

export interface MotoreDxf {
  readonly nome: string;
  layer(def: DefinizioneLayer): void;
  linea(layer: string, a: PuntoDxf, b: PuntoDxf): void;
  polilinea(layer: string, punti: PuntoDxf[], chiusa: boolean): void;
  arco(layer: string, centro: PuntoDxf, raggio: number, inizioGradi: number, fineGradi: number): void;
  cerchio(layer: string, centro: PuntoDxf, raggio: number): void;
  testo(layer: string, posizione: PuntoDxf, testo: string, altezza: number, opzioni?: OpzioniTestoDxf): void;
  /** Un triangolo o un quadrilatero pieno (i muri campiti). */
  pieno(layer: string, punti: PuntoDxf[]): void;
  /** Il file finito. */
  chiudi(): Uint8Array;
  /** Quante entità per layer: serve ai test e al riepilogo dell'esportazione. */
  conteggio(): Record<string, number>;
}
