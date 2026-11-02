import type { Materiale3D } from "./tipi";

/** Colori dei materiali (sRGB). Giallo e rosso seguono la convenzione italiana: demolizioni e nuove costruzioni. */
export const MATERIALI: Record<string, Materiale3D> = {
  // linee degli impianti (stesse tinte del disegno 2D)
  impianto_elettrica: { nome: "Impianto elettrico", colore: "#dc2626", opacita: 1, ruvidita: 0.5 },
  impianto_acqua: { nome: "Acqua", colore: "#2563eb", opacita: 1, ruvidita: 0.4 },
  impianto_scarico: { nome: "Scarichi", colore: "#92400e", opacita: 1, ruvidita: 0.6 },
  impianto_frigorifera: { nome: "Linea frigorifera (rame)", colore: "#0891b2", opacita: 1, ruvidita: 0.35 },
  impianto_condensa: { nome: "Scarico condensa", colore: "#65a30d", opacita: 1, ruvidita: 0.5 },
  impianto_riscaldamento: { nome: "Riscaldamento", colore: "#ea580c", opacita: 1, ruvidita: 0.4 },
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
  prato: { nome: "Prato", colore: "#7da55a", opacita: 1, ruvidita: 1 },
  acqua: { nome: "Acqua", colore: "#3fa7d6", opacita: 0.85, ruvidita: 0.05 },
  fogliame: { nome: "Fogliame", colore: "#4f7f3a", opacita: 1, ruvidita: 1 },
  pietra: { nome: "Pietra", colore: "#d9d2c3", opacita: 1, ruvidita: 0.8 },
  tegole: { nome: "Tegole", colore: "#a5523a", opacita: 1, ruvidita: 0.8 },
  terra_rossa: { nome: "Terra rossa", colore: "#c1643b", opacita: 1, ruvidita: 1 },
  terra_rossa_scura: { nome: "Terra rossa (fuori campo)", colore: "#a95431", opacita: 1, ruvidita: 1 },
  resina_blu: { nome: "Resina blu", colore: "#2d6cb5", opacita: 1, ruvidita: 0.6 },
  resina_blu_scura: { nome: "Resina blu (fuori campo)", colore: "#24589a", opacita: 1, ruvidita: 0.6 },
  resina_arancio: { nome: "Resina arancio", colore: "#e08a3c", opacita: 1, ruvidita: 0.6 },
  resina_verde: { nome: "Resina verde", colore: "#2e7d5b", opacita: 1, ruvidita: 0.6 },
  erba_sintetica: { nome: "Erba sintetica", colore: "#4e9a3e", opacita: 1, ruvidita: 1 },
  erba_sintetica_scura: { nome: "Erba sintetica (fuori campo)", colore: "#3f8532", opacita: 1, ruvidita: 1 },
  sabbia: { nome: "Sabbia", colore: "#e8d3a0", opacita: 1, ruvidita: 1 },
  linee: { nome: "Linee", colore: "#ffffff", opacita: 1, ruvidita: 0.5 },
  linee_blu: { nome: "Fettucce", colore: "#2d6cb5", opacita: 1, ruvidita: 0.5 },
  rete: { nome: "Rete", colore: "#1f2937", opacita: 0.55, ruvidita: 0.8 },
  arancio: { nome: "Ferro del canestro", colore: "#f97316", opacita: 1, ruvidita: 0.4 },
  pannello_fv: { nome: "Pannelli fotovoltaici", colore: "#1d2b45", opacita: 1, ruvidita: 0.2 },
  massa: { nome: "Edificio (piani sotto)", colore: "#dedad3", opacita: 1, ruvidita: 0.9 },
  ghiaia: { nome: "Ghiaia", colore: "#c8c3b7", opacita: 1, ruvidita: 1 },
  asfalto: { nome: "Asfalto", colore: "#6f7072", opacita: 1, ruvidita: 0.95 },
  terra: { nome: "Terra", colore: "#7d5f42", opacita: 1, ruvidita: 1 },
  recinzione: { nome: "Recinzione", colore: "#3d5a40", opacita: 0.55, ruvidita: 0.6 },
  ceramica: { nome: "Ceramica", colore: "#fbfbfa", opacita: 1, ruvidita: 0.15 },
  legno: { nome: "Legno", colore: "#8a6a4b", opacita: 1, ruvidita: 0.6 },
  tessuto: { nome: "Tessuto", colore: "#7d8a9a", opacita: 1, ruvidita: 1 },
  lenzuola: { nome: "Lenzuola", colore: "#eef0f2", opacita: 1, ruvidita: 1 },
  laccato: { nome: "Mobile laccato", colore: "#e3e0da", opacita: 1, ruvidita: 0.4 },
  piano_cucina: { nome: "Piano cucina", colore: "#5f5f5f", opacita: 1, ruvidita: 0.3 },
  calcestruzzo: { nome: "Calcestruzzo", colore: "#9a9a96", opacita: 1, ruvidita: 0.95 },
  metallo: { nome: "Metallo", colore: "#b4b8bc", opacita: 1, ruvidita: 0.3 },
};

/** Materiale di un'area esterna. */
export const MATERIALE_AREA: Record<string, string> = {
  prato: "prato", aiuola: "fogliame", pavimentato: "pietra", vialetto: "pietra", ghiaia: "ghiaia", parcheggio: "asfalto", orto: "terra",
};

/** Materiale del pavimento secondo la destinazione del locale. */
export function materialePavimento(destinazione: string): string {
  const d = destinazione.toLowerCase();
  if (/bagno|wc|lavanderia|servizi/.test(d)) return "pavimento_piastrelle";
  if (/cucin|angolo cottura/.test(d)) return "pavimento_gres";
  if (/giardino|prato/.test(d)) return "prato";
  if (/balcon|terrazz|loggia|cortile|esterno/.test(d)) return "pavimento_esterno";
  if (/soggiorno|salotto|camera|letto|studio|pranzo|living/.test(d)) return "pavimento_legno";
  return "pavimento";
}

export function materialeMuro(stato: "esistente" | "demolire" | "nuovo", colori: boolean): string {
  if (!colori || stato === "esistente") return "muro";
  return stato === "demolire" ? "muro_demolire" : "muro_nuovo";
}
