/**
 * Passaggio di una foto dalla pianta a una pagina di render (piscine, pergole, giardini,
 * facciate, pavimenti esterni): la scheda della pianta cattura una vista 3D, la lascia qui e
 * apre la pagina, che all'avvio la prende come foto di partenza. Vive in memoria: un
 * ricaricamento della pagina la perde, ed è giusto così (si rifà dalla pianta).
 */
export type ModuloEsterno = "piscine" | "pergole" | "giardini" | "facciata" | "pavimenti-esterni";

let inAttesa: { modulo: ModuloEsterno; file: File; nota?: string; quando: number } | null = null;

export function lasciaFotoDaPianta(modulo: ModuloEsterno, file: File, nota?: string): void {
  inAttesa = { modulo, file, nota, quando: Date.now() };
}

/** La foto lasciata per questo modulo negli ultimi 5 minuti; si prende una volta sola. */
export function prendiFotoDaPianta(modulo: ModuloEsterno): File | null {
  return prendiDaPianta(modulo)?.file ?? null;
}

/** Foto e nota (luce e stagione) lasciate dalla pianta; si prendono una volta sola. */
export function prendiDaPianta(modulo: ModuloEsterno): { file: File; nota?: string } | null {
  const a = inAttesa;
  if (!a || a.modulo !== modulo || Date.now() - a.quando > 5 * 60_000) return null;
  inAttesa = null;
  return { file: a.file, nota: a.nota };
}

/** Luce e stagione del render esterno: una frase che va nelle note del render. */
export const MOMENTI_ESTERNI: ReadonlyArray<{ id: string; nome: string; nota: string }> = [
  { id: "giorno", nome: "Giorno d'estate", nota: "" },
  { id: "tramonto", nome: "Tramonto", nota: "Luce calda del tramonto, cielo arancio e rosa, ombre lunghe." },
  { id: "sera", nome: "Sera con luci", nota: "Sera, cielo blu profondo, luci esterne e della piscina accese, finestre illuminate dall'interno." },
  { id: "inverno", nome: "Inverno", nota: "Giornata d'inverno limpida, alberi spogli, prato meno verde, luce bassa." },
  { id: "primavera", nome: "Primavera in fiore", nota: "Primavera, alberi e aiuole in fiore, prato verde brillante." },
];

export const MODULI_ESTERNI: ReadonlyArray<{ modulo: ModuloEsterno; nome: string; descrizione: string; percorso: string }> = [
  { modulo: "piscine", nome: "Piscina", descrizione: "Una piscina nel giardino, con bordo, solarium e illuminazione.", percorso: "/azienda/render/piscine/new" },
  { modulo: "pergole", nome: "Pergola", descrizione: "Pergola bioclimatica, in legno o con tenda, addossata o libera.", percorso: "/azienda/render/pergole/new" },
  { modulo: "giardini", nome: "Giardino", descrizione: "Prato, aiuole, vialetti, siepi e alberi.", percorso: "/azienda/render/giardini/new" },
  { modulo: "facciata", nome: "Facciata", descrizione: "Colori, cappotto, rivestimenti: la casa vista da fuori.", percorso: "/azienda/render/facciata/new" },
  { modulo: "pavimenti-esterni", nome: "Pavimento esterno", descrizione: "Terrazzi, cortili, bordo piscina, vialetti.", percorso: "/azienda/render/pavimenti-esterni/new" },
];
