import type { Materiale3D } from "./tipi";

/** Colori dei materiali (sRGB). Giallo e rosso seguono la convenzione italiana: demolizioni e nuove costruzioni. */
export const MATERIALI: Record<string, Materiale3D> = {
  muro: { nome: "Muro", colore: "#ece7df", opacita: 1, ruvidita: 0.9 },
  muro_demolire: { nome: "Muro da demolire", colore: "#f2c200", opacita: 1, ruvidita: 0.8 },
  muro_nuovo: { nome: "Muro nuovo", colore: "#d42a2a", opacita: 1, ruvidita: 0.8 },
  soffitto: { nome: "Soffitto", colore: "#f6f4ef", opacita: 1, ruvidita: 0.95 },
  vetro: { nome: "Vetro", colore: "#a9d2ee", opacita: 0.3, ruvidita: 0.05 },
  pavimento_legno: { nome: "Pavimento in legno", colore: "#b98a5c", opacita: 1, ruvidita: 0.6 },
  pavimento_piastrelle: { nome: "Pavimento in piastrelle", colore: "#cdd3d6", opacita: 1, ruvidita: 0.4 },
  pavimento_gres: { nome: "Pavimento in gres", colore: "#d6c7b0", opacita: 1, ruvidita: 0.5 },
  pavimento_esterno: { nome: "Pavimento esterno", colore: "#a7a299", opacita: 1, ruvidita: 0.85 },
  pavimento: { nome: "Pavimento", colore: "#c9b79c", opacita: 1, ruvidita: 0.6 },
  ceramica: { nome: "Ceramica", colore: "#fbfbfa", opacita: 1, ruvidita: 0.15 },
  legno: { nome: "Legno", colore: "#8a6a4b", opacita: 1, ruvidita: 0.6 },
  tessuto: { nome: "Tessuto", colore: "#7d8a9a", opacita: 1, ruvidita: 1 },
  lenzuola: { nome: "Lenzuola", colore: "#eef0f2", opacita: 1, ruvidita: 1 },
  laccato: { nome: "Mobile laccato", colore: "#e3e0da", opacita: 1, ruvidita: 0.4 },
  piano_cucina: { nome: "Piano cucina", colore: "#5f5f5f", opacita: 1, ruvidita: 0.3 },
  metallo: { nome: "Metallo", colore: "#b4b8bc", opacita: 1, ruvidita: 0.3 },
};

/** Materiale del pavimento secondo la destinazione del locale. */
export function materialePavimento(destinazione: string): string {
  const d = destinazione.toLowerCase();
  if (/bagno|wc|lavanderia|servizi/.test(d)) return "pavimento_piastrelle";
  if (/cucin|angolo cottura/.test(d)) return "pavimento_gres";
  if (/balcon|terrazz|loggia|cortile|giardino|esterno/.test(d)) return "pavimento_esterno";
  if (/soggiorno|salotto|camera|letto|studio|pranzo|living/.test(d)) return "pavimento_legno";
  return "pavimento";
}

export function materialeMuro(stato: "esistente" | "demolire" | "nuovo", colori: boolean): string {
  if (!colori || stato === "esistente") return "muro";
  return stato === "demolire" ? "muro_demolire" : "muro_nuovo";
}
