/**
 * Foto di riferimento condivise per il bagno: TIPO di doccia, vasca, sanitari
 * e EFFETTO delle piastrelle (Wikimedia Commons / Poly Haven, crediti in
 * public/render-references/CREDITS.md). Sono bersagli di forma e tessitura,
 * generici: il prodotto specifico dell'azienda arriva dal catalogo render
 * (renderCatalogReferences) e ha la precedenza.
 */
import { makeReferenceImage, type SharedReferenceImage } from "./referenceUrl.ts";

export const BATHROOM_FOLDER = "bathroom";

interface Entry { filename: string; shape: string }

export const SHOWER_TYPE_REFERENCES: Record<string, Entry> = {
  walk_in: { filename: "Doccia-Walk-In-Vetro-Profilo-Nero.webp", shape: "walk-in shower: one fixed clear glass panel with a slim black frame, no door, flush tray" },
  nicchia_box: { filename: "Doccia-Box-Angolare-Vetro.webp", shape: "alcove shower enclosure between walls, framed glass door" },
  frontale_box: { filename: "Doccia-Box-Angolare-Vetro.webp", shape: "frontal glass shower enclosure with framed hinged door" },
  angolare: { filename: "Doccia-Box-Angolare-Vetro.webp", shape: "corner shower enclosure, two glass sides meeting at 90 degrees, framed door" },
  semicircolare: { filename: "Doccia-Box-Angolare-Vetro.webp", shape: "corner shower enclosure (curved front glass in the round version)" },
};

export const BATHTUB_TYPE_REFERENCES: Record<string, Entry> = {
  freestanding_ovale: { filename: "Vasca-Freestanding-Ovale.webp", shape: "freestanding oval bathtub standing on the floor, smooth continuous outer shell, floor-standing filler" },
  freestanding_rettangolare: { filename: "Vasca-Freestanding-Ovale.webp", shape: "freestanding bathtub standing on the floor, continuous outer shell (rectangular version)" },
  back_to_wall: { filename: "Vasca-Incassata-Piastrellata.webp", shape: "bathtub set against the wall, panelled/tiled front apron" },
  incassata: { filename: "Vasca-Incassata-Piastrellata.webp", shape: "built-in bathtub with a tiled front apron and tiled surround" },
  angolare: { filename: "Vasca-Incassata-Piastrellata.webp", shape: "built-in corner bathtub with tiled apron" },
};

export const SANITARY_REFERENCES: Record<string, Entry> = {
  bidet_sospeso: { filename: "Bidet-Sospeso-Bianco.webp", shape: "wall-hung ceramic bidet, floating with no pedestal, single-lever mixer" },
};

export const TILE_EFFECT_REFERENCES: Record<string, Entry> = {
  terrazzo: { filename: "Piastrelle-Terrazzo-Texture.webp", shape: "terrazzo: fine multicolour stone chips in a smooth cement matrix" },
  zellige: { filename: "Piastrelle-Zellige-Smaltate.webp", shape: "zellige: small hand-cut glazed tiles with irregular edges and glossy uneven surface" },
  marmo_carrara: { filename: "Piastrelle-Marmo-Bianco-Venato.webp", shape: "light cream marble tiles with fine speckled veining, large format, thin grout" },
  marmo_calacatta: { filename: "Piastrelle-Marmo-Bianco-Venato.webp", shape: "light marble tiles with speckled veining, large format, thin grout (bolder veins in the Calacatta version)" },
  cemento_grigio: { filename: "Piastrelle-Cemento-Grigio.webp", shape: "concrete-effect tiles, matte grey, subtle trowel texture" },
  cemento: { filename: "Piastrelle-Cemento-Grigio.webp", shape: "concrete-effect tiles, matte grey, subtle trowel texture" },
};

export interface BathroomReferenceConfig {
  tipo_intervento?: string | null;
  sostituzione?: Record<string, unknown> | null;
  doccia?: { attivo?: boolean; tipo?: string } | null;
  vasca?: { attivo?: boolean; tipo?: string } | null;
  sanitari?: { attivo?: boolean; azione_bidet?: string; tipo_bidet?: string } | null;
  piastrelle_parete?: { attivo?: boolean; effetto?: string } | null;
  pavimento?: { attivo?: boolean; effetto?: string } | null;
}

/**
 * Massimo 2 foto: la piu' strutturale (doccia o vasca) e l'effetto delle
 * piastrelle a parete. Il catalogo dell'azienda, se presente, viene prima.
 */
export function collectBathroomReferenceImages(config: BathroomReferenceConfig): SharedReferenceImage[] {
  const out: SharedReferenceImage[] = [];
  const s = (config.sostituzione ?? {}) as Record<string, unknown>;
  if ((s.doccia === true || config.doccia?.attivo) && config.doccia?.tipo && SHOWER_TYPE_REFERENCES[config.doccia.tipo]) {
    const e = SHOWER_TYPE_REFERENCES[config.doccia.tipo];
    out.push(makeReferenceImage(BATHROOM_FOLDER, e.filename, `SHOWER TYPE TARGET — ${config.doccia.tipo}: ${e.shape}. Copy the construction and glass layout; finishes come from the written specification`));
  } else if ((s.vasca === true || config.vasca?.attivo) && config.vasca?.tipo && BATHTUB_TYPE_REFERENCES[config.vasca.tipo]) {
    const e = BATHTUB_TYPE_REFERENCES[config.vasca.tipo];
    out.push(makeReferenceImage(BATHROOM_FOLDER, e.filename, `BATHTUB TYPE TARGET — ${config.vasca.tipo}: ${e.shape}. Copy the construction; colour and material come from the written specification`));
  } else if ((s.sanitari === true || config.sanitari?.attivo) && (config.sanitari?.azione_bidet === "sostituisci" || config.sanitari?.azione_bidet === "aggiungi") && config.sanitari?.tipo_bidet === "sospeso") {
    const e = SANITARY_REFERENCES.bidet_sospeso;
    out.push(makeReferenceImage(BATHROOM_FOLDER, e.filename, `BIDET TYPE TARGET — sospeso: ${e.shape}`));
  }
  const effetto = (s.piastrelle_parete === true || config.piastrelle_parete?.attivo) ? config.piastrelle_parete?.effetto : undefined;
  if (effetto && TILE_EFFECT_REFERENCES[effetto]) {
    const e = TILE_EFFECT_REFERENCES[effetto];
    out.push(makeReferenceImage(BATHROOM_FOLDER, e.filename, `WALL TILE EFFECT TARGET — ${effetto}: ${e.shape}. Copy the pattern scale and surface; exact colour from the written specification`));
  }
  return out.slice(0, 2);
}

export function listBathroomReferenceFilenames(): string[] {
  return Array.from(new Set([
    ...Object.values(SHOWER_TYPE_REFERENCES), ...Object.values(BATHTUB_TYPE_REFERENCES),
    ...Object.values(SANITARY_REFERENCES), ...Object.values(TILE_EFFECT_REFERENCES),
  ].map((e) => e.filename)));
}
