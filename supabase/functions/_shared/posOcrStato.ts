export interface RiepilogoOcrPsc {
  id: string;
  stato: "in_coda" | "in_lettura" | "pronta" | "parziale" | "errore";
  totale: number | null;
  esaminate: number;
  letto: number;
  bianche: number;
  illeggibili: number[];
  errore: string | null;
}
