/**
 * Passaggio di una foto dalla pianta a una pagina di render (piscine, pergole, giardini,
 * facciate, pavimenti esterni): la scheda della pianta cattura una vista 3D, la lascia qui e
 * apre la pagina, che all'avvio la prende come foto di partenza. Vive in memoria: un
 * ricaricamento della pagina la perde, ed è giusto così (si rifà dalla pianta).
 */
export type ModuloEsterno = "piscine" | "pergole" | "giardini" | "facciata" | "pavimenti-esterni";

let inAttesa: { modulo: ModuloEsterno; file: File; quando: number } | null = null;

export function lasciaFotoDaPianta(modulo: ModuloEsterno, file: File): void {
  inAttesa = { modulo, file, quando: Date.now() };
}

/** La foto lasciata per questo modulo negli ultimi 5 minuti; si prende una volta sola. */
export function prendiFotoDaPianta(modulo: ModuloEsterno): File | null {
  const a = inAttesa;
  if (!a || a.modulo !== modulo || Date.now() - a.quando > 5 * 60_000) return null;
  inAttesa = null;
  return a.file;
}

export const MODULI_ESTERNI: ReadonlyArray<{ modulo: ModuloEsterno; nome: string; descrizione: string; percorso: string }> = [
  { modulo: "piscine", nome: "Piscina", descrizione: "Una piscina nel giardino, con bordo, solarium e illuminazione.", percorso: "/azienda/render/piscine/new" },
  { modulo: "pergole", nome: "Pergola", descrizione: "Pergola bioclimatica, in legno o con tenda, addossata o libera.", percorso: "/azienda/render/pergole/new" },
  { modulo: "giardini", nome: "Giardino", descrizione: "Prato, aiuole, vialetti, siepi e alberi.", percorso: "/azienda/render/giardini/new" },
  { modulo: "facciata", nome: "Facciata", descrizione: "Colori, cappotto, rivestimenti: la casa vista da fuori.", percorso: "/azienda/render/facciata/new" },
  { modulo: "pavimenti-esterni", nome: "Pavimento esterno", descrizione: "Terrazzi, cortili, bordo piscina, vialetti.", percorso: "/azienda/render/pavimenti-esterni/new" },
];
