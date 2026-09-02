/**
 * Foto di riferimento condivise per piscine e pergole (Wikimedia Commons,
 * crediti in CREDITS.md): TIPO di piscina e di struttura. Bersagli di forma;
 * finiture e colori restano nel testo. Mai copiare la casa o il giardino
 * della foto.
 */
import { makeReferenceImage, type SharedReferenceImage } from "./referenceUrl.ts";

export const OUTDOOR_FOLDER = "outdoor";

interface Entry { filename: string; shape: string }

export const POOL_TYPE_REFERENCES: Record<string, Entry> = {
  interrata_rettangolare: { filename: "Piscina-Interrata-Rettangolare-Giardino.webp", shape: "in-ground rectangular pool with a stone coping flush with the lawn, skimmer edge" },
  interrata_organica: { filename: "Piscina-Interrata-Organica.webp", shape: "in-ground free-form pool with curved edges and paved surround" },
  lap_pool: { filename: "Piscina-Sfioro-Villa.webp", shape: "long narrow lap pool with a clean straight edge" },
  plunge_pool: { filename: "Piscina-Interrata-Organica.webp", shape: "small compact plunge pool with coping" },
  sfioro_rettangolare: { filename: "Piscina-Sfioro-Villa.webp", shape: "rectangular overflow pool: water level flush with the deck, perimeter overflow channel" },
  infinity_pool: { filename: "Piscina-Infinity-Bordo-Vista.webp", shape: "infinity pool: one edge vanishes into the view, water spills over a hidden weir" },
  semi_incassata: { filename: "Piscina-Interrata-Rettangolare-Giardino.webp", shape: "partly raised pool with a visible low wall and coping" },
};

export const PERGOLA_TYPE_REFERENCES: Record<string, Entry> = {
  bioclimatica_addossata: { filename: "Pergola-Bioclimatica-Lamelle.webp", shape: "bioclimatic pergola: slim aluminium frame with orientable roof louvers" },
  bioclimatica_autoportante: { filename: "Pergola-Bioclimatica-Lamelle.webp", shape: "freestanding bioclimatic pergola: aluminium posts and orientable roof louvers" },
  addossata: { filename: "Pergola-Alluminio-Terrazza.webp", shape: "wall-mounted aluminium pergola with flat roof over a terrace" },
  autoportante: { filename: "Pergola-Alluminio-Terrazza.webp", shape: "freestanding aluminium pergola with slim posts and flat roof" },
  telo_addossata: { filename: "Pergola-Alluminio-Terrazza.webp", shape: "aluminium pergola frame (fabric canopy version)" },
  telo_autoportante: { filename: "Pergola-Alluminio-Terrazza.webp", shape: "freestanding aluminium pergola frame (fabric canopy version)" },
  vetro_addossata: { filename: "Pergola-Alluminio-Terrazza.webp", shape: "aluminium pergola frame (glass roof version)" },
  vetro_autoportante: { filename: "Pergola-Alluminio-Terrazza.webp", shape: "freestanding aluminium pergola frame (glass roof version)" },
  legno_addossata: { filename: "Pergola-Legno-Giardino.webp", shape: "timber pergola with wooden posts and beams" },
  legno_autoportante: { filename: "Pergola-Legno-Giardino.webp", shape: "freestanding timber pergola with posts and open beams" },
};

export function collectPoolReferenceImages(config: { operazione?: string | null; tipo?: string | null }): SharedReferenceImage[] {
  if (config.operazione && !["add_new_pool", "replace_existing_pool"].includes(config.operazione)) return [];
  const e = config.tipo ? POOL_TYPE_REFERENCES[config.tipo] : undefined;
  if (!e) return [];
  return [makeReferenceImage(OUTDOOR_FOLDER, e.filename, `POOL TYPE TARGET — ${config.tipo}: ${e.shape}. Copy the edge construction and water level only; do NOT copy the house, garden or landscape of this photo`)];
}

export function collectPergolaReferenceImages(config: { tipo_struttura?: string | null }): SharedReferenceImage[] {
  const e = config.tipo_struttura ? PERGOLA_TYPE_REFERENCES[config.tipo_struttura] : undefined;
  if (!e) return [];
  return [makeReferenceImage(OUTDOOR_FOLDER, e.filename, `PERGOLA TYPE TARGET — ${config.tipo_struttura}: ${e.shape}. Copy the structure only — the photo is deliberately black-and-white: colour and finish come from the written specification; do NOT copy the building, furniture or surroundings`)];
}

export function listOutdoorReferenceFilenames(): string[] {
  return Array.from(new Set([...Object.values(POOL_TYPE_REFERENCES), ...Object.values(PERGOLA_TYPE_REFERENCES)].map((e) => e.filename)));
}
