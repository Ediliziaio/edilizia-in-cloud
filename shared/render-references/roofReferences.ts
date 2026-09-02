/**
 * Foto di riferimento per il render tetto: per ogni TipoManto una o due foto
 * reali (Wikimedia Commons, crediti in public/render-references/CREDITS.md)
 * che mostrano il manto vero: modulo, sovrapposizione, rilievo. Il colore
 * resta nel testo: la foto e' un bersaglio di TESSITURA e GEOMETRIA.
 */
import { makeReferenceImage, type SharedReferenceImage } from "./referenceUrl.ts";

export const ROOF_FOLDER = "roofs";

interface RoofReferenceEntry {
  /** Foto di dettaglio del manto (tessitura). */
  detail: string;
  /** Foto d'insieme di una falda o di una casa con quel manto (opzionale). */
  overview?: string;
  texture: string;
}

export const ROOF_COVERING_REFERENCES: Record<string, RoofReferenceEntry> = {
  tegole_coppi: {
    detail: "Tetto-Coppi-Argilla-Naturale.webp",
    overview: "Tetto-Coppi-Rosso-Falda.webp",
    texture: "Italian barrel tiles (coppi) laid as monk-and-nun channels: alternating concave and convex half-round clay tiles, strong ribbed shadow lines running down the slope",
  },
  tegole_marsigliesi: {
    detail: "Tetto-Tegole-Marsigliesi-Dettaglio.webp",
    overview: "Tetto-Tegole-Marsigliesi-Falda.webp",
    texture: "Marseille interlocking clay tiles: flat rectangular tiles with two vertical ribs and interlocking edges, regular grid pattern",
  },
  tegole_portoghesi: {
    detail: "Tetto-Tegole-Portoghesi-Falda.webp",
    texture: "Portuguese tiles: flat base with one raised barrel per tile, S-shaped profile in wide regular rows",
  },
  tegole_piane: {
    detail: "Tetto-Tegole-Piane-Coda-di-Castoro-Bordo.webp",
    overview: "Tetto-Tegole-Piane-Coda-di-Castoro-Falda.webp",
    texture: "flat plain tiles with rounded lower edge (beaver-tail), double-lapped in fine staggered rows",
  },
  ardesia_naturale: {
    detail: "Tetto-Ardesia-Naturale-Lastre.webp",
    overview: "Tetto-Ardesia-Pietra-Falde-Casa.webp",
    texture: "natural slate: thin irregular grey stone slabs with rough split surface, overlapping in staggered courses",
  },
  ardesia_sintetica: {
    detail: "Tetto-Ardesia-Naturale-Lastre-2.webp",
    texture: "slate look with more regular, uniform rectangular slabs and even colour",
  },
  lamiera_grecata: {
    detail: "Tetto-Lamiera-Grecata-Grigia.webp",
    texture: "trapezoidal corrugated metal sheet: straight parallel ribs down the slope, exposed fixings, crisp folded edges",
  },
  lamiera_aggraffata: {
    detail: "Tetto-Lamiera-Aggraffata-Grigia-Casa.webp",
    overview: "Tetto-Lamiera-Aggraffata-Bronzo-Casa.webp",
    texture: "standing-seam metal roof: wide flat pans with slim raised vertical seams at regular spacing, no visible screws",
  },
  lamiera_zinco_titanio: {
    detail: "Tetto-Lamiera-Aggraffata-Grigia-Casa.webp",
    overview: "Tetto-Lamiera-Aggraffata-Bianca-Casa.webp",
    texture: "zinc-titanium standing-seam roof: matte blue-grey patina, slim raised seams, folded eaves and ridge",
  },
  guaina_bituminosa: {
    detail: "Tetto-Piano-Guaina-Zavorra-Ghiaia.webp",
    texture: "flat roof with bituminous membrane under gravel ballast, upstands and vents",
  },
  guaina_tpo: {
    detail: "Tetto-Piano-Membrana-TPO-Bianca.webp",
    texture: "flat roof with white TPO membrane, welded seams, clean matte surface",
  },
  tegole_fotovoltaiche: {
    detail: "Tetto-Tegole-Fotovoltaiche-Integrate.webp",
    overview: "Tetto-Tegole-Fotovoltaiche-Shingle-Abbaino.webp",
    texture: "building-integrated photovoltaic tiles: dark glassy rectangular modules flush with the roof plane, in aligned rows, no raised frames",
  },
};

/**
 * Foto da allegare per una configurazione tetto: dettaglio del manto
 * scelto + (se c'e') la vista d'insieme. Solo quando il manto cambia.
 * Massimo 2.
 */
export function collectRoofReferenceImages(config: {
  tipo_manto?: string | null;
  tipo_intervento?: string | null;
}): SharedReferenceImage[] {
  const out: SharedReferenceImage[] = [];
  const interventi = new Set(["sostituzione_manto", "rifacimento_completo", "sovracopertura_coibentata"]);
  if (config.tipo_intervento && !interventi.has(config.tipo_intervento)) return out;
  const entry = config.tipo_manto ? ROOF_COVERING_REFERENCES[config.tipo_manto] : undefined;
  if (!entry) return out;
  out.push(makeReferenceImage(
    ROOF_FOLDER,
    entry.detail,
    `ROOF COVERING TARGET (close-up) — ${config.tipo_manto}: ${entry.texture}. Copy module size, overlap and relief; the colour comes from the written specification`,
  ));
  if (entry.overview) {
    out.push(makeReferenceImage(
      ROOF_FOLDER,
      entry.overview,
      `ROOF COVERING TARGET (whole slope) — how ${config.tipo_manto} reads on a real roof: ridge, eaves and edge detailing. Do NOT copy this building, its shape or its surroundings`,
    ));
  }
  return out.slice(0, 2);
}

export function listRoofReferenceFilenames(): string[] {
  const out: string[] = [];
  for (const e of Object.values(ROOF_COVERING_REFERENCES)) {
    out.push(e.detail);
    if (e.overview) out.push(e.overview);
  }
  return Array.from(new Set(out));
}
