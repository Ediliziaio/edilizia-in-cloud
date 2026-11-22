import type { Coordinate } from "../../../../shared/mappa-operativa/calcoli";

const coloriTratte = ["#1d4ed8", "#0f766e", "#b45309", "#6d28d9", "#0369a1"];

export function aspettoTratta(indice: number, rientro: boolean) {
  return {
    colore: rientro ? "#be185d" : coloriTratte[indice % coloriTratte.length],
    etichetta: rientro ? "Rientro" : `Tratta ${indice + 1}`,
    rientro,
  };
}

export type LineaPercorso = {
  indice?: number;
  punti: Coordinate[];
  titolo: string;
  colore: string;
  rientro?: boolean;
  indicativa?: boolean;
};
