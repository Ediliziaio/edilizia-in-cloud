/**
 * Foto di riferimento condivise per la facciata: finitura dell'intonaco e
 * tipo di rivestimento (Poly Haven CC0 + Wikimedia Commons, crediti in
 * CREDITS.md). Tessitura e modulo reali; il colore resta nel testo.
 */
import { makeReferenceImage, type SharedReferenceImage } from "./referenceUrl.ts";

export const FACADE_FOLDER = "facades";

interface Entry { filename: string; texture: string }

export const PLASTER_FINISH_REFERENCES: Record<string, Entry> = {
  liscio: { filename: "Facciata-Intonaco-Liscio-Dipinto.webp", texture: "smooth painted plaster, flat matte surface with only faint trowel marks" },
  rasato: { filename: "Facciata-Intonaco-Liscio-Dipinto.webp", texture: "skim-coated plaster, very smooth and even" },
  graffiato_fine: { filename: "Facciata-Intonaco-Strutturato.webp", texture: "fine scratched render: small even rough grain, matte grey-beige" },
  graffiato_medio: { filename: "Facciata-Intonaco-Strutturato.webp", texture: "medium scratched render: visible grain, matte" },
  bucciato: { filename: "Facciata-Intonaco-Strutturato.webp", texture: "orange-peel textured render, soft relief" },
  strutturato_grosso: { filename: "Facciata-Intonaco-Strutturato.webp", texture: "coarse structured render with pronounced relief" },
  rustico: { filename: "Facciata-Intonaco-Strutturato.webp", texture: "rustic irregular trowelled render" },
};

export const CLADDING_TYPE_REFERENCES: Record<string, Entry> = {
  clinker_rosso: { filename: "Facciata-Clinker-Rosso-Scuro.webp", texture: "dark red clinker brick cladding in running bond with recessed dark joints" },
  cotto_rosso: { filename: "Facciata-Mattoni-Rossi-Casa.webp", texture: "red terracotta brick facing, warm tone, regular courses" },
  pietra_rustica: { filename: "Facciata-Pietra-Rustica-Casa.webp", texture: "rustic natural stone cladding on a house: irregular warm stones, recessed mortar joints" },
  splitface_grigio: { filename: "Facciata-Splitface-Grigio-Moderna.webp", texture: "split-face grey stone cladding on a modern house: rough faces, dry-stack look" },
  travertino: { filename: "Facciata-Travertino-Lastre.webp", texture: "travertine slabs: beige stone with pitted surface and soft banding, tight joints" },
  arenaria_beige: { filename: "Facciata-Travertino-Muro-Rockface.webp", texture: "beige rock-face sandstone/travertine cladding with split faces in courses" },
  marmo_bianco: { filename: "Facciata-Marmo-Bianco-Lastre.webp", texture: "light marble slabs with fine speckled veining, thin joints" },
};

export interface FacadeReferenceConfig {
  tipo_intervento?: string | null;
  intonaco?: { attivo?: boolean; finitura?: string } | null;
  rivestimento?: { attivo?: boolean; tipo?: string } | null;
}

/** Massimo 2: rivestimento (piu' caratterizzante) e finitura intonaco. */
export function collectFacadeReferenceImages(config: FacadeReferenceConfig): SharedReferenceImage[] {
  const out: SharedReferenceImage[] = [];
  const riv = config.rivestimento?.attivo && config.rivestimento.tipo ? CLADDING_TYPE_REFERENCES[config.rivestimento.tipo] : undefined;
  if (riv) out.push(makeReferenceImage(FACADE_FOLDER, riv.filename, `CLADDING TARGET — ${config.rivestimento?.tipo}: ${riv.texture}. Copy module, joints and relief; apply only to the zones named in the specification`));
  const fin = config.intonaco?.attivo && config.intonaco.finitura ? PLASTER_FINISH_REFERENCES[config.intonaco.finitura] : undefined;
  if (fin) out.push(makeReferenceImage(FACADE_FOLDER, fin.filename, `PLASTER FINISH TARGET — ${config.intonaco?.finitura}: ${fin.texture}. Copy the surface grain only; the colour comes from the written specification`));
  return out.slice(0, 2);
}

export function listFacadeReferenceFilenames(): string[] {
  return Array.from(new Set([...Object.values(PLASTER_FINISH_REFERENCES), ...Object.values(CLADDING_TYPE_REFERENCES)].map((e) => e.filename)));
}
