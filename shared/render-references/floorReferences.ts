/**
 * Foto di riferimento condivise per il pavimento: TESSITURA e POSA reali
 * (Poly Haven CC0 + Wikimedia Commons, crediti in CREDITS.md). Il colore
 * esatto resta nel testo; il catalogo dell'azienda ha la precedenza.
 */
import { makeReferenceImage, type SharedReferenceImage } from "./referenceUrl.ts";

export const FLOOR_FOLDER = "floors";

interface Entry { filename: string; texture: string }

/** Per posa (vince sulla tessitura quando la posa e' caratterizzante). */
export const FLOOR_PATTERN_REFERENCES: Record<string, Entry> = {
  spina_di_pesce: { filename: "Pavimento-Parquet-Spina-di-Pesce.webp", texture: "herringbone parquet: short planks laid at 90 degrees in a zigzag, natural oak tone" },
  spina_ungherese: { filename: "Pavimento-Parquet-Spina-di-Pesce.webp", texture: "chevron/herringbone parquet: planks meeting in a continuous zigzag" },
  diagonale_45: { filename: "Pavimento-Parquet-Diagonale.webp", texture: "planks laid diagonally at 45 degrees to the walls" },
};

/** Per materiale / effetto. */
export const FLOOR_MATERIAL_REFERENCES: Record<string, Entry> = {
  parquet_massello: { filename: "Pavimento-Legno-Plance.webp", texture: "solid wood planks with visible grain, matte oiled surface, staggered joints" },
  parquet_prefinito: { filename: "Pavimento-Parquet-Rettangolare.webp", texture: "engineered wood planks, regular rectangular boards, subtle bevel" },
  laminato: { filename: "Pavimento-Laminato-Posa.webp", texture: "laminate planks, wood-look print, click joints, uniform surface" },
  vinile_lvt: { filename: "Pavimento-Parquet-Rettangolare.webp", texture: "LVT planks, wood-look, very flat surface and tight joints" },
  marmo: { filename: "Pavimento-Marmo-Piastrelle.webp", texture: "polished light marble tiles with fine speckled veining, large format, thin joints" },
  gres_porcellanato: { filename: "Pavimento-Gres-Grande-Formato-Lucido.webp", texture: "large-format porcelain tiles, rectified edges, minimal grout, slight sheen" },
  ceramica: { filename: "Pavimento-Gres-Grande-Formato-Lucido.webp", texture: "ceramic tiles in a regular grid with thin grout lines" },
  cemento_resina: { filename: "Pavimento-Cemento-Vissuto.webp", texture: "seamless cement-resin floor, cloudy grey, no joints" },
  resina_continua: { filename: "Pavimento-Cemento-Vissuto.webp", texture: "seamless resin floor, continuous surface, no joints" },
  microcemento: { filename: "Pavimento-Cemento-Lisciato.webp", texture: "microcement: trowelled seamless surface with soft cloudy variations" },
  terrazzo_veneziano: { filename: "Pavimento-Terrazzo-Veneziano.webp", texture: "Venetian terrazzo: marble chips in a cement matrix, polished, seamless" },
  pietra_naturale: { filename: "Pavimento-Betonelle-Cemento.webp", texture: "natural stone slabs with slight surface variation and visible joints" },
};

/** Per effetto visivo (gres/ceramica): vince sul materiale generico. */
export const FLOOR_EFFECT_REFERENCES: Record<string, Entry> = {
  marmo: { filename: "Pavimento-Marmo-Piastrelle.webp", texture: "marble-effect tiles, light with speckled veining, polished" },
  cemento: { filename: "Pavimento-Cemento-Piastrelle.webp", texture: "concrete-effect tiles, matte grey with fine trowel texture" },
  legno: { filename: "Pavimento-Parquet-Rettangolare.webp", texture: "wood-effect planks in staggered rows" },
  terrazzo: { filename: "Pavimento-Terrazzo-Veneziano.webp", texture: "terrazzo-effect tiles, stone chips in a matrix" },
  cotto: { filename: "Pavimento-Betonelle-Cemento.webp", texture: "terracotta-look square tiles with warm variation" },
};

export interface FloorReferenceConfig { tipo?: string | null; effetto_visivo?: string | null; pattern_posa?: string | null }

/** Massimo 2: posa caratterizzante + tessitura del materiale/effetto. */
export function collectFloorReferenceImages(config: FloorReferenceConfig): SharedReferenceImage[] {
  const out: SharedReferenceImage[] = [];
  const posa = config.pattern_posa ? FLOOR_PATTERN_REFERENCES[config.pattern_posa] : undefined;
  if (posa) out.push(makeReferenceImage(FLOOR_FOLDER, posa.filename, `LAYING PATTERN TARGET — ${config.pattern_posa}: ${posa.texture}. Copy the pattern geometry; colour from the written specification`));
  let mat: Entry | undefined;
  if ((config.tipo === "gres_porcellanato" || config.tipo === "ceramica") && config.effetto_visivo && FLOOR_EFFECT_REFERENCES[config.effetto_visivo]) mat = FLOOR_EFFECT_REFERENCES[config.effetto_visivo];
  else if (config.tipo && FLOOR_MATERIAL_REFERENCES[config.tipo]) mat = FLOOR_MATERIAL_REFERENCES[config.tipo];
  if (mat && !(posa && posa.filename === mat.filename)) out.push(makeReferenceImage(FLOOR_FOLDER, mat.filename, `FLOOR MATERIAL TARGET — ${config.tipo}${config.effetto_visivo ? ` / ${config.effetto_visivo}` : ""}: ${mat.texture}. Copy surface texture, module size and joints; exact colour from the written specification`));
  return out.slice(0, 2);
}

export function listFloorReferenceFilenames(): string[] {
  return Array.from(new Set([...Object.values(FLOOR_PATTERN_REFERENCES), ...Object.values(FLOOR_MATERIAL_REFERENCES), ...Object.values(FLOOR_EFFECT_REFERENCES)].map((e) => e.filename)));
}
