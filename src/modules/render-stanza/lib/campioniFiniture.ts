import type { ConfigurazioneStanza, ConfigPavimentoStanza } from "./types";

/** Preset con le stesse chiavi che il motore del render stanza già legge. */
export const CONFIG_CAMPIONI_PAVIMENTO: Readonly<Record<string, Partial<ConfigPavimentoStanza>>> = {
  rovere: { tipo: "parquet_legno", effetto_visivo: "legno", essenza_legno: "rovere_naturale", colore_hex: "#c49a63", formato_piastrella: "20x120", larghezza_listello_mm: 200, lunghezza_listello_mm: 1200 },
  noce: { tipo: "parquet_legno", effetto_visivo: "legno", essenza_legno: "noce", colore_hex: "#6d442b", formato_piastrella: "20x120", larghezza_listello_mm: 200, lunghezza_listello_mm: 1200 },
  gres_legno: { tipo: "gres_porcellanato", effetto_visivo: "legno", essenza_legno: "rovere_naturale", colore_hex: "#c49a63", formato_piastrella: "20x120", fuga_larghezza_mm: 2 },
  marmo: { tipo: "marmo", effetto_visivo: "marmo", colore_hex: "#f2f0eb", finitura: "levigato", formato_piastrella: "120x120" },
  cemento: { tipo: "gres_porcellanato", effetto_visivo: "cemento", colore_hex: "#c5c6c3", formato_piastrella: "60x60" },
  pietra: { tipo: "pietra_naturale", effetto_visivo: "pietra", colore_hex: "#d9cdb9", formato_piastrella: "60x120" },
  piastrelle: { tipo: "gres_porcellanato", effetto_visivo: "pietra", colore_hex: "#e8dfce", formato_piastrella: "60x60" },
  cotto: { tipo: "cotto", effetto_visivo: "cotto", colore_hex: "#b96f4c", formato_piastrella: "30x30" },
};

export function applicaCampionePavimento(c: ConfigurazioneStanza, id: string): ConfigurazioneStanza {
  const campione = CONFIG_CAMPIONI_PAVIMENTO[id];
  if (!campione) return c;
  return { ...c, pavimento: { ...c.pavimento, attivo: true, finitura: "opaco", pattern: "dritto", colore_nome: undefined, essenza_legno: undefined, larghezza_listello_mm: undefined, lunghezza_listello_mm: undefined, ...campione } };
}

export function campionePavimentoAttivo(c: ConfigurazioneStanza): string | undefined {
  if (!c.pavimento.attivo) return undefined;
  return Object.entries(CONFIG_CAMPIONI_PAVIMENTO).find(([, p]) => Object.entries(p).every(([k, v]) => c.pavimento[k as keyof ConfigPavimentoStanza] === v))?.[0];
}
