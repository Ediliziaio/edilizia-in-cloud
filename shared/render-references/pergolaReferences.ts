/**
 * Foto di riferimento per il render pergole: una foto per ogni elemento che il
 * render cambia — tipo di struttura, copertura, chiusure laterali, materiale,
 * illuminazione, ancoraggio a terra — scelta dalla configurazione e allegata solo
 * se quell'elemento cambia nell'operazione scelta (vedi referencePicker.ts per
 * tetto e regola B/N).
 *
 * Le foto del set del 04/10/2026 (cartella «pergolas») sostituiscono le tre di
 * Wikimedia Commons in «outdoor»: ogni tipo ha ora la sua foto, le vecchie
 * restano su disco ma non sono più allegate. Il 05/10/2026 sono arrivate quelle
 * del piede del montante (plinto nel prato, deck).
 */
import {
  listReferencePaths,
  pickReferences,
  BLACK_AND_WHITE_RULE,
  type PhotoEntry,
  type PhotoTable,
  type ReferenceCandidate,
} from "./referencePicker.ts";
import type { SharedReferenceImage } from "./referenceUrl.ts";
import { tonoCompatibile } from "./shutterReferences.ts";
import { ancoraggioDallaZona, coperturaEffettiva, materialeCoerente } from "../render-pergole/pergolaCoerenza.ts";
import type { MaterialeStrutturaPergola } from "../render-pergole/types.ts";

export const PERGOLA_FOLDER = "pergolas";

const foto = (filename: string, text: string): PhotoEntry => ({ folder: PERGOLA_FOLDER, filename, text });

/** TIPO di struttura (FORMA, bianco e nero). */
export const PERGOLA_TYPE_PHOTOS: PhotoTable = {
  bioclimatica_addossata: foto(
    "Pergola-Bioclimatica-Sulla-Terrazza-BN.webp",
    "wall-mounted bioclimatic pergola: rear beam fixed to the facade, two front posts, roof of parallel orientable louvers in a frame",
  ),
  bioclimatica_autoportante: foto(
    "Pergola-Bioclimatica-Con-Lamelle-Orientabili-BN.webp",
    "freestanding bioclimatic pergola on four corner posts: square perimeter frame filled with parallel orientable roof louvers",
  ),
  telo_addossata: foto(
    "Pergola-A-Parete-Con-Copertura-Retrattile-BN.webp",
    "wall-mounted pergola with a retractable fabric roof: rear beam on the facade, two front posts, canopy in soft waves on side tracks",
  ),
  telo_autoportante: foto(
    "Pergola-Autoportante-Con-Tetto-Retraibile-BN.webp",
    "freestanding pergola on four corner posts with a retractable fabric roof running in side tracks, canopy in soft waves",
  ),
  vetro_addossata: foto(
    "Pergola-A-Parete-Con-Tetto-In-Vetro-BN.webp",
    "wall-mounted pergola with a glass roof: rear beam on the facade, two front posts, glass panes between slim parallel rafters",
  ),
  vetro_autoportante: foto(
    "Pergola-Autoportante-Con-Tetto-In-Vetro-BN.webp",
    "freestanding pergola on four posts with a glass roof: flat glass panes laid between slim parallel rafters",
  ),
  legno_addossata: foto(
    "Pergola-In-Legno-Su-Terrazza-BN.webp",
    "wall-mounted post-and-beam pergola: beams resting on a ledger on the facade, square posts at the front, open rafters on top",
  ),
  legno_autoportante: foto(
    "Pergola-In-Legno-Sulla-Terrazza-BN.webp",
    "freestanding post-and-beam pergola on square posts: double beams with projecting ends and open rafters across the top",
  ),
  addossata: foto(
    "Pergola-In-Alluminio-Dal-Tetto-Piano-BN.webp",
    "wall-mounted pergola with a flat closed roof: slim rear beam on the facade, two front posts, thin square profiles",
  ),
  autoportante: foto(
    "Pergola-In-Alluminio-Su-Terrazza-BN.webp",
    "freestanding pergola on four slim square posts with a flat closed roof and a thin perimeter beam",
  ),
};

/** Il tetto che si vede nella foto di ogni tipo: se la copertura scelta è un'altra, dalla foto si copia solo il telaio. */
const TETTO_NELLA_FOTO: Record<string, string> = {
  bioclimatica_addossata: "lamelle_orientabili",
  bioclimatica_autoportante: "lamelle_orientabili",
  telo_addossata: "telo_retraibile",
  telo_autoportante: "telo_retraibile",
  vetro_addossata: "vetro",
  vetro_autoportante: "vetro",
  legno_addossata: "listelli_legno",
  legno_autoportante: "listelli_legno",
  addossata: "copertura_opaca_tecnica",
  autoportante: "copertura_opaca_tecnica",
};

/** COPERTURA (FORMA, bianco e nero), vista dal basso. */
export const PERGOLA_COVER_PHOTOS: PhotoTable = {
  lamelle_orientabili: foto(
    "Lamelle-Orientabili-Della-Pergola-BN.webp",
    "orientable roof louvers seen from below: parallel blades on end pivots inside a perimeter frame, tilted open",
  ),
  telo_retraibile: foto(
    "Copertura-Ecru-Retrattile-Della-Pergola-BN.webp",
    "retractable fabric roof seen from below: canopy hanging in regular soft waves between runners in two side tracks",
  ),
  vetro: foto(
    "Pergolato-In-Vetro-Sotto-Il-Cielo-Azzurro-BN.webp",
    "glass roof seen from below: flat panes laid between slim parallel rafters, edge profiles and seals, sky visible through",
  ),
  policarbonato: foto(
    "Dettaglio-Dal-Basso-Di-Tettoia-Opalina-BN.webp",
    "translucent multiwall panels between slim rafters seen from below: diffused light, fine internal ribs, sealed edges",
  ),
  listelli_legno: foto(
    "Luce-A-Strisce-Sotto-La-Pergola-BN.webp",
    "slatted roof of closely spaced parallel battens on cross beams, casting striped shade, gaps open to the sky",
  ),
  copertura_opaca_tecnica: foto(
    "Pannello-Isolante-Per-Pergola-Antracite-BN.webp",
    "closed flat roof of insulated sandwich panels seen from below, panel joints in parallel lines, slim edge beam",
  ),
};

/** CHIUSURE laterali (FORMA, bianco e nero). */
export const PERGOLA_SIDE_PHOTOS: PhotoTable = {
  vetrata_slide: foto(
    "Pergola-Con-Vetrate-Scorrevoli-Aperte-BN.webp",
    "frameless sliding glass panels along one side of the pergola, running in a floor track and a top track between posts",
  ),
  screen_zip: foto(
    "Tenda-A-Rullo-Zip-Per-Pergola-BN.webp",
    "vertical ZIP screen fully lowered between two posts: taut screen fabric held in side guides under a top cassette",
  ),
  tenda_tecnica: foto(
    "Tenda-Tecnica-Ecru-Parzialmente-Chiusa-Sulla-Pergola-BN.webp",
    "fabric drop blind partly lowered on one side of the pergola, hanging from the beam with a weighted bottom bar",
  ),
  frangivento: foto(
    "Pergola-Con-Pannelli-Frangivento-Trasparenti-BN.webp",
    "fixed framed glass windbreak panels between the posts on one side, full height, see-through",
  ),
  pannelli_fissi: foto(
    "Pergola-Con-Pannelli-Frangivista-In-Alluminio-BN.webp",
    "fixed privacy panel of closely spaced horizontal slats filling one side between two posts, from floor to beam",
  ),
  brise_soleil: foto(
    "Pergola-Moderna-Con-Frangisole-In-Alluminio-BN.webp",
    "side screen of spaced horizontal blades tilted open between two posts, a vertical brise-soleil",
  ),
};

/** MATERIALE della struttura (MATERIA, a colori). */
export const PERGOLA_MATERIAL_PHOTOS: PhotoTable = {
  alluminio: foto(
    "Angolo-Di-Profilo-In-Alluminio-Antracite.webp",
    "powder-coated aluminium profile corner: fine textured coating, crisp mitred joint, flat extruded faces",
  ),
  alluminio_effetto_legno: foto(
    "Profilo-In-Alluminio-Effetto-Rovere.webp",
    "aluminium profile with a wood-effect coating: oak grain printed along the faces, crisp mitred corner",
  ),
  legno_lamellare: foto(
    "Dettaglio-Di-Abete-Lamellare.webp",
    "glued laminated spruce beam end: stacked lamellas, straight grain, small knots, planed faces",
  ),
  acciaio: foto(
    "Profilo-Di-Pergola-In-Acciaio-Saldato.webp",
    "welded steel pergola corner: square tube post and beams with a smooth painted coating and tight welded joints",
  ),
  misto: foto(
    "Dettaglio-Del-Giunto-Alluminio-Legno.webp",
    "mixed structure: aluminium post meeting a laminated timber beam through a metal bracket with visible fasteners",
  ),
};

/**
 * Tono misurato di ogni foto di materiale (media del centro; per il misto la
 * parte in metallo, che è quella a cui si riferisce il colore della struttura).
 */
export const PERGOLA_MATERIAL_TONES: Record<string, string> = {
  alluminio: "#4E5054",
  alluminio_effetto_legno: "#A8845F",
  legno_lamellare: "#CCA983",
  acciaio: "#42474F",
  misto: "#A0A4AA",
};

/**
 * ILLUMINAZIONE (MATERIA, a colori: il colore della luce è l'informazione).
 * Il manifest dava «Luce-Radente» ai downlight lineari e le due foto «Al-Tramonto»
 * agli spot: guardandole, la «-2» ha barre lineari nelle travi (downlight lineari)
 * e la «Radente» una luce fissata al piede del montante (applique coordinate).
 */
export const PERGOLA_LIGHTING_PHOTOS: PhotoTable = {
  strip_led_perimetrale: foto(
    "Pergola-In-Alluminio-Con-Luce-Calda.webp",
    "warm LED strip running along the inner perimeter profile of the roof frame, one continuous line of light",
  ),
  spot_integrati: foto(
    "Pergola-In-Alluminio-Illuminata-Al-Tramonto.webp",
    "small round recessed spotlights set at regular spacing in the roof beams, warm light pools below",
  ),
  downlight_lineari: foto(
    "Pergola-In-Alluminio-Illuminata-Al-Tramonto-2.webp",
    "linear light bars built into the roof beams and louver frame: parallel lines of warm light",
  ),
  applique_coordinate: foto(
    "Pergola-In-Alluminio-Con-Luce-Radente.webp",
    "compact light fixed at the foot of a post, washing warm light up the post and onto the paving",
  ),
};

/**
 * ANCORAGGIO a terra (FORMA, bianco e nero): come il piede del montante tocca il
 * suolo. Chiavi = valori veri di `installazione.ancoraggio_a_terra`. Pavimento,
 * bordo piscina e terrazzo non hanno foto (vedi SENZA_FOTO_PERGOLE). Il piede è un
 * dettaglio piccolo: la foto dice come è fissato, non com'è fatto il montante.
 */
export const PERGOLA_ANCHOR_PHOTOS: PhotoTable = {
  prato_con_plinti: foto(
    "Piede-Di-Montante-Su-Plinto-Nel-Prato-BN.webp",
    "foot of a square post on a flat base plate with a bolt and nut at each corner, set on a square footing that sits flush with the lawn",
  ),
  deck: foto(
    "Piede-Di-Montante-Su-Deck-BN.webp",
    "foot of a square post on a flat base plate with a visible screw at each corner, resting on outdoor decking boards laid in parallel with thin gaps",
  ),
};

/** Opzioni vere senza foto, col motivo. */
export const SENZA_FOTO_PERGOLE: Record<string, string> = {
  "chiusure_laterali.nessuna": "niente da mostrare: perimetro aperto",
  "illuminazione.nessuna": "niente da mostrare",
  "ancoraggio_a_terra.pavimento": "nessuna foto nel set: bastano le parole",
  "ancoraggio_a_terra.bordo_piscina": "nessuna foto nel set: bastano le parole",
  "ancoraggio_a_terra.terrazzo": "nessuna foto nel set: bastano le parole",
};

/** Operazioni che costruiscono la pergola intera (tipo, copertura, chiusure, materiale, luci, piede dei montanti). */
const OPERAZIONI_COMPLETE = new Set(["add_new_pergola", "replace_existing_awning_with_pergola", "replace_existing_pergola"]);

export interface PergolaReferenceInput {
  /** Forma vecchia della chiamata (solo il tipo di struttura): resta valida. */
  tipo_struttura?: string | null;
  operazione?: string | null;
  /** Dove sta la pergola: la zona e, se scelto, l'ancoraggio a terra (altrimenti lo dà la zona). */
  installazione?: { zona?: string | null; ancoraggio_a_terra?: string | null } | null;
  struttura?: { tipo?: string | null; materiale?: string | null; colore_hex?: string | null } | null;
  copertura?: { tipo?: string | null } | null;
  chiusure_laterali?: { tipo?: string | null } | null;
  illuminazione?: string | null;
}

/**
 * Le foto da allegare per una configurazione pergola (massimo 3).
 *
 * Priorità — prima la sagoma, poi le superfici grandi, poi i dettagli:
 *  1. tipo di struttura (montanti, travi, attacco a parete);
 *  2. copertura, se la foto del tipo non la mostra già (bioclimatica = lamelle…)
 *     o se è l'unica cosa che cambia (solo copertura);
 *  3. chiusure laterali, se ci sono e l'operazione le installa;
 *  4. materiale, se il tono della foto è vicino al colore scelto;
 *  5. illuminazione (dettaglio, e foto al tramonto);
 *  6. ancoraggio a terra, il piede del montante: il dettaglio più piccolo, ultimo
 *     (entra solo se avanza uno slot; senza scelta lo dà la zona, giardino → plinti).
 *
 * Gating per operazione: aggiungi/sostituisci → tutto; solo copertura → la
 * copertura; aggiungi chiusure → le chiusure; solo colore, stato apertura,
 * rimuovi chiusure → niente (non cambia nessuna forma né materiale, i montanti
 * restano dove sono).
 */
export function collectPergolaReferenceImages(config: PergolaReferenceInput): SharedReferenceImage[] {
  const operazione = config.operazione ?? "add_new_pergola";
  const tipo = config.struttura?.tipo ?? config.tipo_struttura ?? "";
  const copertura = coperturaEffettiva(operazione, tipo, config.copertura?.tipo);
  const completa = OPERAZIONI_COMPLETE.has(operazione);
  const candidates: ReferenceCandidate[] = [];

  const tipoFoto = completa ? PERGOLA_TYPE_PHOTOS[tipo] : undefined;
  const tettoDiverso = Boolean(copertura && TETTO_NELLA_FOTO[tipo] && TETTO_NELLA_FOTO[tipo] !== copertura);
  if (tipoFoto) {
    candidates.push({
      priority: 1,
      role: "PERGOLA TYPE TARGET",
      key: tipo,
      entry: tipoFoto,
      copy: tettoDiverso
        ? `Copy only the frame — posts, beams and their joints; the roof covering in the photo is NOT the requested one — ${BLACK_AND_WHITE_RULE}; do NOT copy the building, furniture or surroundings`
        : `Copy the structure only — ${BLACK_AND_WHITE_RULE}; do NOT copy the building, furniture or surroundings`,
    });
  }

  // La copertura ha la sua foto quando la foto del tipo non la mostra già
  // (generiche e legno con un'altra copertura) e quando è l'unica cosa che cambia.
  const coperturaFoto = copertura ? PERGOLA_COVER_PHOTOS[copertura] : undefined;
  const serveCopertura = operazione === "change_cover_only" || (completa && (!tipoFoto || tettoDiverso));
  if (coperturaFoto && serveCopertura) {
    candidates.push({ priority: 2, role: "PERGOLA COVER TARGET", key: copertura as string, entry: coperturaFoto });
  }

  const chiusura = config.chiusure_laterali?.tipo ?? "nessuna";
  const chiusuraFoto = (completa || operazione === "add_side_closures") ? PERGOLA_SIDE_PHOTOS[chiusura] : undefined;
  if (chiusuraFoto) candidates.push({ priority: 3, role: "SIDE CLOSURE TARGET", key: chiusura, entry: chiusuraFoto });

  const materiale = config.struttura?.materiale
    ? materialeCoerente(tipo, config.struttura.materiale as MaterialeStrutturaPergola)
    : "";
  const materialeFoto = completa ? PERGOLA_MATERIAL_PHOTOS[materiale] : undefined;
  if (materialeFoto && tonoCompatibile(config.struttura?.colore_hex, PERGOLA_MATERIAL_TONES[materiale])) {
    candidates.push({ priority: 4, role: "STRUCTURE MATERIAL TARGET", key: materiale, entry: materialeFoto });
  }

  const luce = config.illuminazione ?? "nessuna";
  const luceFoto = completa ? PERGOLA_LIGHTING_PHOTOS[luce] : undefined;
  if (luceFoto) {
    candidates.push({
      priority: 5,
      role: "LIGHTING TARGET",
      key: luce,
      entry: luceFoto,
      copy: "Copy only the fixture type and where it sits on the structure; keep the source photo's time of day, sky and daylight — never turn the scene into dusk or night",
    });
  }

  // Il piede del montante: l'ancoraggio scelto, o quello che la zona porta (giardino → plinti nel
  // prato), lo stesso che legge il prompt (pergolaEdgePrompt.ts): la foto segue il testo.
  const ancoraggio = config.installazione?.ancoraggio_a_terra || ancoraggioDallaZona(config.installazione?.zona);
  const ancoraggioFoto = completa ? PERGOLA_ANCHOR_PHOTOS[ancoraggio] : undefined;
  if (ancoraggioFoto) {
    candidates.push({
      priority: 6,
      role: "POST FOOT TARGET",
      key: ancoraggio,
      entry: ancoraggioFoto,
      copy: `Copy only how the post foot is fixed to the ground — base plate, fasteners and what it sits on; the post itself (section, height, material) follows the structure photo and the written specification — ${BLACK_AND_WHITE_RULE}; do NOT copy the rest of the scene`,
    });
  }

  return pickReferences(candidates);
}

/** Tutti i file dichiarati («pergolas/…»): per il test sull'esistenza. */
export function listPergolaReferencePaths(): string[] {
  return listReferencePaths(
    PERGOLA_TYPE_PHOTOS,
    PERGOLA_COVER_PHOTOS,
    PERGOLA_SIDE_PHOTOS,
    PERGOLA_MATERIAL_PHOTOS,
    PERGOLA_LIGHTING_PHOTOS,
    PERGOLA_ANCHOR_PHOTOS,
  );
}
