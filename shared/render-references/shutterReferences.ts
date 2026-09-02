/**
 * Foto di riferimento per il render persiane: per ogni TipoPersiana una foto
 * reale (Wikimedia Commons, crediti in public/render-references/CREDITS.md)
 * che mostra al modello COME e' fatto quel tipo di persiana. Il colore e il
 * materiale restano nel testo (e nel campione esadecimale): la foto e' un
 * bersaglio di FORMA, non di colore.
 */
import { makeReferenceImage, type SharedReferenceImage } from "./referenceUrl.ts";

export const SHUTTER_FOLDER = "shutters";

/** Voce del catalogo: file + descrizione inglese della forma da copiare. */
interface ShutterReferenceEntry {
  filename: string;
  /** Cosa il modello deve prendere dalla foto. */
  shape: string;
}

export const SHUTTER_TYPE_REFERENCES: Record<string, ShutterReferenceEntry> = {
  veneziana_classica: {
    filename: "Persiana-Veneziana-Legno-Verde-Chiusa.webp",
    shape: "classic Italian louvered shutter (persiana alla veneziana): fixed angled slats inside a stile-and-rail frame, hinged at the sides of the window reveal",
  },
  veneziana_esterna: {
    filename: "Persiana-Veneziana-Verde-Anta-Aperta.webp",
    shape: "exterior louvered shutter leaf on wall hinges, opening outward flat against the facade, angled slats in a frame",
  },
  scuro_pieno: {
    filename: "Scuro-Pieno-Legno-Doghe-Verticali.webp",
    shape: "solid board shutter (scuro pieno): flat closed leaf made of vertical planks, no slats, with visible strap hinges",
  },
  scuro_cornice: {
    filename: "Scuri-Interni-Legno-Bianco-Pieni.webp",
    shape: "framed panel shutter (scuro a cornice): solid leaf with a raised or recessed panel inside a frame, no slats",
  },
  gelosia: {
    filename: "Persiana-Veneziana-Legno-Chiaro-Lamelle.webp",
    shape: "gelosia shutter: dense fixed slats set in a slim frame, letting air through while screening the view",
  },
  avvolgibile_esterno: {
    filename: "Scuro-Pieno-Ferro-Grigio.webp",
    shape: "exterior roll-up shutter: flat horizontal slats sliding in side guides, box above the window",
  },
  a_libro: {
    filename: "Persiana-Veneziana-Bianca-Aperta.webp",
    shape: "folding (bi-fold) louvered shutter: leaves hinged to each other that fold back against the reveal",
  },
  griglia_sicurezza: {
    filename: "Griglia-Sicurezza-Ferro-Battuto-Decorata.webp",
    shape: "wrought-iron security grille fixed inside the window opening: scrolled iron bars, no leaf, glass visible behind",
  },
};

/** Riferimento aggiuntivo per materiale, quando cambia la lettura della foto. */
export const SHUTTER_MATERIAL_REFERENCES: Record<string, ShutterReferenceEntry> = {
  legno_naturale: {
    filename: "Scuro-Pieno-Legno-Rustico.webp",
    shape: "natural solid wood with visible grain and knots, oiled finish",
  },
  acciaio: {
    filename: "Griglia-Sicurezza-Ferro-Bombata.webp",
    shape: "steel / wrought iron bars with a matte dark finish",
  },
};

/**
 * Sceglie le foto da allegare per una configurazione persiane: sempre la
 * foto del TIPO; la foto del materiale solo per legno naturale e acciaio,
 * dove il materiale cambia davvero la forma percepita. Massimo 2.
 */
export function collectShutterReferenceImages(config: {
  tipo?: string | null;
  materiale?: string | null;
  operazione?: string | null;
}): SharedReferenceImage[] {
  const out: SharedReferenceImage[] = [];
  if (config.operazione === "rimuovi") return out;
  const tipo = config.tipo ? SHUTTER_TYPE_REFERENCES[config.tipo] : undefined;
  if (tipo) {
    out.push(makeReferenceImage(
      SHUTTER_FOLDER,
      tipo.filename,
      `SHUTTER MODEL TARGET — ${config.tipo}: ${tipo.shape}. Copy the SHAPE and construction only; colour and material come from the written specification`,
    ));
  }
  const mat = config.materiale ? SHUTTER_MATERIAL_REFERENCES[config.materiale] : undefined;
  if (mat && config.operazione !== "cambia_colore") {
    out.push(makeReferenceImage(
      SHUTTER_FOLDER,
      mat.filename,
      `SHUTTER MATERIAL TARGET — ${config.materiale}: ${mat.shape}`,
    ));
  }
  return out.slice(0, 2);
}

export function listShutterReferenceFilenames(): string[] {
  return [
    ...Object.values(SHUTTER_TYPE_REFERENCES).map((e) => e.filename),
    ...Object.values(SHUTTER_MATERIAL_REFERENCES).map((e) => e.filename),
  ];
}
