/**
 * Foto di riferimento condivise per le piscine: una tabella per ogni scelta del
 * form (shared/render-piscine/types.ts) che si vede in foto. Le 43 foto del set del
 * titolare e le 8 del 05/10/2026 stanno in public/render-references/pools; tre foto
 * vecchie (Wikimedia Commons, crediti in CREDITS.md) in outdoor/ restano dove non
 * c'è una foto nuova.
 *
 * Forma in bianco e nero, materia a colori (commit 7a2a49b33): gli accessi alla
 * vasca (gradini, scala, spiaggetta) sono «-BN» e l'etichetta descrive solo la
 * costruzione. Rivestimenti, bordi, aree, acqua e accessori sono a colori: lì il
 * colore e la superficie sono l'informazione. Le foto di tipologia e degli accessori
 * del set sono scene a colori (non ne esiste la versione B/N): l'etichetta dice di
 * prendere SOLO la costruzione, non i colori né la casa o il paesaggio.
 *
 * Dal 05/10/2026 anche le sei tipologie che il set non copriva (lap pool, plunge,
 * semi-incassata, fuori terra, minipiscina, compatta da terrazzo), lo sfioro
 * nascosto e la recinzione in vetro hanno una foto di FORMA «-BN». Le foto sono
 * scene piene di contesto (giardino, mare, siepi): il testo descrive solo la
 * costruzione — proporzioni, bordo, quanto la vasca sta sopra il terreno — mai il
 * paesaggio, i colori o i materiali.
 *
 * Una foto è allegata solo se l'operazione cambia quell'elemento: la tabella è in
 * shared/render-piscine/piscineOperationScope.ts, la stessa che usa il prompt.
 */
import {
  pickReferences,
  listReferencePaths,
  type PhotoEntry,
  type PhotoTable,
  type ReferenceCandidate,
} from "./referencePicker.ts";
import type { SharedReferenceImage } from "./referenceUrl.ts";
import { cambiaElemento } from "../render-piscine/piscineOperationScope.ts";
import {
  TIPI_RIALZATI,
  acquaIncompatibileConRivestimento,
  sistemaBordoEffettivo,
} from "../render-piscine/piscineCoerenza.ts";

export const POOL_FOLDER = "pools";
/** Le foto vecchie (Wikimedia) delle tipologie che il set nuovo non copre. */
export const POOL_OLD_FOLDER = "outdoor";

const p = (filename: string, text: string): PhotoEntry => ({ folder: POOL_FOLDER, filename, text });
const old = (filename: string, text: string): PhotoEntry => ({ folder: POOL_OLD_FOLDER, filename, text });

/**
 * Tipologia della vasca (piscina.tipo). Le prime cinque sono scene a colori del set: si
 * prende solo la costruzione. Le sei in fondo (05/10/2026) sono di FORMA, in bianco e
 * nero, e il testo descrive solo la vasca: proporzioni, bordo, quanto sta sopra il terreno.
 */
export const POOL_TYPE_REFERENCES: PhotoTable = {
  interrata_rettangolare: p("Piscina-Rettangolare-Immersa-Nel-Prato.webp", "in-ground rectangular pool set flush into a lawn: straight sides, square corners, slim coping band level with the grass, waterline just below the coping"),
  sfioro_rettangolare: p("Piscina-A-Sfioro-Dallarchitettura-Moderna.webp", "rectangular overflow pool: water brimming level with the edge and spilling on every side into a grated perimeter channel set in the deck"),
  // Vecchia foto «Sfioro-Villa»: è un infinity vero (bordo che sparisce nel mare), non uno sfioro perimetrale né una lap pool.
  infinity_pool: old("Piscina-Sfioro-Villa.webp", "infinity pool: the far edge is a thin straight weir with no visible coping, so the water surface seems to merge with the view beyond"),
  // Vecchia foto «Interrata-Rettangolare-Giardino»: mostra una vasca a fagiolo, quindi è la forma libera (la vecchia tabella la dava alla rettangolare).
  interrata_organica: old("Piscina-Interrata-Rettangolare-Giardino.webp", "in-ground free-form kidney-shaped pool set into a lawn, continuous curved coping following the outline, waterline just below the coping"),
  // La foto del set nata per «acqua grigio-verde» è una biopiscina vera: fa da tipologia.
  biopiscina: p("Acqua-Naturale-In-Biopiscina-Elegante.webp", "natural swimming pool: open swimming water edged by flat stone slabs on one side and a planted margin of reeds, grasses and boulders along the far bank"),
  lap_pool: p("Piscina-Lap-Pool-Lunga-E-Stretta-BN.webp", "long narrow in-ground lap pool, many times longer than wide: straight parallel sides, square ends, slim coping band level with the ground, water just below it"),
  plunge_pool: p("Piscina-Plunge-Compatta-Da-Patio-BN.webp", "small rectangular plunge pool set into a patio: straight sides, slim coping band flush with the patio floor, waterline just below the coping"),
  semi_incassata: p("Piscina-Semi-Interrata-Con-Muretto-BN.webp", "partly sunk rectangular pool: a straight wall about 60 cm high shows above the ground on the exposed sides, topped by a coping band with a slight overhang"),
  fuori_terra_premium: p("Piscina-Fuori-Terra-Premium-Rivestita-BN.webp", "above-ground rectangular pool with straight clad walls over a metre high, slim coping band, exterior steps up to a landing with a two-rail ladder"),
  minipiscina: p("Minipiscina-Su-Terrazzo-BN.webp", "compact square spa-style mini pool on a terrace: straight rim around the water, moulded seats with headrests and jets inside, boxed sides roughly hip high"),
  terrazzo_compatta: p("Piscina-Compatta-Su-Tetto-Terrazza-BN.webp", "compact rectangular tub resting directly on the terrace floor beside the parapet: straight rim, boxed sides roughly hip high, nothing sunk into the slab"),
};

/**
 * Su quale sistema di bordo è costruita la vasca della foto di tipologia. Se il
 * sistema scelto è un altro (una rettangolare «a sfioro»), la foto della
 * tipologia spingerebbe il bordo sbagliato: si usa la foto del sistema, se c'è.
 */
export const POOL_TYPE_PHOTO_EDGE_SYSTEMS: Record<string, readonly string[]> = {
  interrata_rettangolare: ["skimmer"],
  sfioro_rettangolare: ["sfioro"],
  infinity_pool: ["infinity_edge"],
  interrata_organica: ["skimmer"],
  // Bordo naturale in pietra: va con lo skimmer e con lo sfioro, non con l'infinity.
  biopiscina: ["skimmer", "sfioro", "sfioro_nascosto"],
  // Le sei di FORMA (05/10/2026): acqua un poco sotto il bordo, nessuna griglia di sfioro in vista.
  lap_pool: ["skimmer"],
  plunge_pool: ["skimmer"],
  semi_incassata: ["skimmer"],
  fuori_terra_premium: ["skimmer"],
  minipiscina: ["skimmer"],
  terrazzo_compatta: ["skimmer"],
};

/** Sistema di bordo (piscina.sistema_bordo), quando la foto di tipologia non va bene. */
export const POOL_EDGE_SYSTEM_REFERENCES: PhotoTable = {
  sfioro: p("Piscina-A-Sfioro-Dallarchitettura-Moderna.webp", "overflow edge: the water brims level with the edge and spills into a grated perimeter channel set in the deck"),
  infinity_edge: old("Piscina-Sfioro-Villa.webp", "vanishing edge: one side ends in a thin weir with no visible coping, so the water surface seems to merge with the view beyond"),
  // FORMA, B/N (05/10/2026): il contrario dello sfioro a griglia — l'acqua a filo del bordo e solo una fessura sottile.
  sfioro_nascosto: p("Bordo-A-Sfioro-Con-Canale-Nascosto-BN.webp", "hidden overflow edge: the water brims level with the coping and only a hairline slot separates them, no grating, no skimmer, no visible gutter"),
};

/** Rivestimento interno (finiture.rivestimento_interno): foto sott'acqua, a colori. */
export const POOL_INTERIOR_FINISH_REFERENCES: PhotoTable = {
  mosaico_bianco: p("Mosaico-Bianco-Lucido-Sotto-Lacqua.webp", "glossy white glass mosaic of square tesserae about 5 cm with thin light grout, seen under shallow water with caustics"),
  mosaico_azzurro: p("Mosaico-Azzurro-Sommerso-Dacqua.webp", "glass mosaic of square tesserae about 5 cm in mixed light and deep blue shades, seen under clear water with caustics"),
  mosaico_grigio: p("Mosaico-In-Vetro-Grigio-Sotto-Lacqua.webp", "glass mosaic of square tesserae about 5 cm in mixed light and dark grey shades with a fine sparkle, under clear water"),
  mosaico_antracite: p("Mosaico-In-Vetro-Antracite-Sotto-Lacqua.webp", "anthracite glass mosaic of square tesserae about 5 cm with marbled veining and light grout, under water with mirror-like highlights"),
  // Nel set la foto è di pietra vera a lastre irregolari: si prende solo la tessitura, il formato è quello del gres.
  gres_effetto_pietra: p("Pietra-Naturale-Sommersa-In-Piscina.webp", "stone-look pool lining under water: mineral surface texture and soft natural stone tones"),
  gres_effetto_sabbia: p("Piastrelle-Color-Sabbia-Sottacqua.webp", "sand-coloured porcelain tiles in a regular rectangular format with thin joints under shallow water, deeper water turning turquoise"),
  liner_chiaro: p("Rivestimento-Piscina-In-PVC-Sottacqua.webp", "light blue reinforced PVC liner seen under water: smooth membrane with a fine embossed texture and a thin welded seam at the wall-floor corner"),
  liner_scuro: p("Rivestimento-Piscina-In-PVC-Grigio-Scuro.webp", "dark grey reinforced PVC liner seen under water: smooth membrane with a fine textile texture and a thin welded seam along the corner"),
  resina_premium: p("Rivestimento-In-Resina-Turchese-Sott-Acqua.webp", "seamless resin pool finish with a fine speckled quartz texture and no tile grid, one continuous surface over walls, floor and steps"),
  pietra_naturale_pool_finish: p("Pietra-Naturale-Sommersa-In-Piscina.webp", "natural stone pool lining under water: irregular flat slabs with soft mineral tones and fine joints, light caustics on the surface"),
};

/** Bordo / coping (finiture.coping): a colori. Si prende solo la fascia sul filo dell'acqua. */
export const POOL_COPING_REFERENCES: PhotoTable = {
  pietra_chiara: p("Bordo-Piscina-In-Pietra-Beige.webp", "light natural-stone coping slabs on the water's edge: rectangular format, tight joints and a squared nosing"),
  pietra_grigia: p("Bordo-Piscina-Moderno-In-Pietra-Grigia.webp", "grey stone coping slabs on the water's edge: large rectangular format, tight joints and a slightly textured matte surface"),
  gres_2cm: p("Pavimentazione-Piscina-Moderna-In-Gres-Effetto-Pietra.webp", "thin 2 cm stone-effect porcelain slabs forming the pool edge: large format, rectified edges and tight joints"),
  travertino: p("Bordo-Piscina-In-Travertino-Beige.webp", "travertine coping on the water's edge: warm beige slabs with natural pores, rectangular format and a softly eased nosing"),
  legno_wpc: p("Decking-WPC-Marrone-A-Bordo-Piscina.webp", "WPC boards running right up to the pool edge: parallel grooved planks finished by a neat edge board along the water"),
  cemento_spazzolato: p("Bordo-Piscina-In-Cemento-Spazzolato.webp", "brushed concrete pool edge: large cast panels with a fine broom texture, saw-cut joints and a crisp square arris"),
  bordo_sottile_moderno: p("Bordo-Piscina-Moderno-In-Pietra.webp", "thin modern coping: one slim slab with a crisp square edge projecting a few centimetres over the water, minimal profile"),
  bordo_massivo_classico: p("Bordo-Piscina-Arrotondato-In-Pietra-Chiara.webp", "thick classic coping with a fully rounded bullnose edge projecting over the water and a deep slab face below the nosing"),
};

/** Accesso alla vasca (comfort.accesso): FORMA, in bianco e nero. Nessun colore nel testo. */
export const POOL_ACCESS_REFERENCES: PhotoTable = {
  scala_inox: p("Scala-Inox-A-Doppio-Corrimano-BN.webp", "pool ladder with two curved grab rails anchored in the deck and open treads descending along the pool wall into the water"),
  gradini_angolo: p("Gradini-Chiari-Nellangolo-Della-Piscina-BN.webp", "built-in entry steps in a pool corner: three straight treads stepping down along one wall, visible through the water"),
  gradini_frontali: p("Gradini-Moderni-Per-Ingresso-In-Piscina-BN.webp", "full-width entry steps across the end of the pool: straight treads running wall to wall, visible through the water"),
  gradoni_lounge: p("Piscina-Contemporanea-Con-Gradoni-Lounge-BN.webp", "wide shallow lounge steps: broad deep treads to sit on, spanning the end of the pool and stepping down into the water"),
  spiaggetta: p("Spiaggetta-Sommersa-In-Piscina-Cristallina-BN.webp", "submerged sun shelf: a broad shallow ledge just under the waterline with a curved outline stepping down to the deep water"),
  beach_entry: p("Spiaggetta-Sommersa-In-Piscina-Cristallina-BN.webp", "shallow walk-in zone under a thin layer of water with a curved shoreline, the floor sloping gradually into the deep water, no steps"),
};

/**
 * Accessori (comfort.accessori): scene a colori, si prende solo l'oggetto e come è fissato.
 * La recinzione in vetro (05/10/2026) è di FORMA, in bianco e nero.
 */
export const POOL_FEATURE_REFERENCES: PhotoTable = {
  illuminazione_subacquea: p("Piscina-Crepuscolare-Con-Luci-LED-Subacquee.webp", "underwater LED lights recessed in the pool walls, evenly spaced just below the waterline and lighting the water from inside"),
  lama_dacqua: p("Piscina-Elegante-Con-Lama-Dacqua-In-Acciaio.webp", "water blade: a slim steel spout set into a stone wall at the pool edge, pouring a flat sheet of water into the pool"),
  cascata: p("Piscina-Elegante-Con-Cascata-In-Pietra.webp", "waterfall: a sheet of water falling from the top of a dry-stone wall straight into the pool at its edge"),
  idromassaggio_integrato: p("Piscina-Contemporanea-Con-Idromassaggio-E-Bollicine.webp", "spa zone built into the pool: a raised basin with bubbling jets and a seat, divided from the main pool by a low wall"),
  copertura_isotermica: p("Piscina-Coperta-Da-Telo-Isotermico-Blu.webp", "floating thermal bubble cover lying flat on the water, cut to the pool outline"),
  copertura_rigida: p("Piscina-Moderna-Con-Copertura-Retrattile.webp", "automatic slatted cover partly closed over the pool, the slats rolling out from a bench-like housing at the pool end"),
  doccia_esterna: p("Colonna-Doccia-Moderna-A-Bordo-Piscina.webp", "freestanding outdoor shower column with a curved arm and a round head, fixed on the deck at the pool side"),
  zona_prendisole: p("Lettini-Bianchi-A-Bordo-Piscina.webp", "pair of sun loungers on the deck at the pool edge, set parallel to the water with space around them"),
  recinzione_vetro: p("Recinzione-Di-Sicurezza-In-Vetro-Per-Piscina-BN.webp", "pool safety fence of frameless glass panels about 120 cm high on slim floor spigots, a metre back from the water all round, with a glass gate on two posts"),
};

/** Cosa copiare dalle foto degli accessori (scene a colori: l'oggetto, non la scena). */
const FEATURE_COPY: Record<string, string> = {
  illuminazione_subacquea:
    "Copy only the light fixtures and where they sit in the walls; keep the time of day and the exposure of the source photo — this photo was taken at dusk only to make the lights visible",
  copertura_isotermica:
    "Copy only the cover material and how it lies on the water; how much of the pool it covers comes from the written specification",
  // Foto B/N con una vasca, un solarium e un giardino interi: dell'immagine conta solo la recinzione.
  recinzione_vetro:
    "Copy only the fence — how the frameless glass panels stand on their floor spigots, their height, the gate and the set-back from the pool edge; the photo is deliberately black-and-white and its pool, paving and garden are not part of the brief",
};
const FEATURE_COPY_DEFAULT =
  "Copy only this feature, its construction and how it is fixed to the pool; colours, materials and the rest of the scene come from the written specification and the source photo";

/** Area intorno alla vasca (finiture.area_perimetrale): a colori. */
export const POOL_SURROUND_REFERENCES: PhotoTable = {
  deck_wpc: p("Decking-WPC-Effetto-Legno-Intorno-Alla-Piscina.webp", "WPC wood-look decking around the pool: long grooved boards parallel to the pool edge with tight gaps, flush with the coping"),
  solarium_gres: p("Solarium-Piscina-In-Gres-Effetto-Pietra.webp", "porcelain stone-look solarium paving around the pool: large rectangular slabs, thin joints and a matte non-slip surface"),
  pietra_naturale: p("Pietra-Naturale-Intorno-Alla-Piscina.webp", "natural stone paving around the pool: irregular flagstones with fine joints following the curved pool edge"),
  prato_raccordato: p("Prato-Verde-E-Bordo-Piscina.webp", "lawn meeting the pool coping in a clean straight cut: grass trimmed tight to the edge with no soil showing"),
  ghiaia_drenante: p("Ghiaia-Drenante-Grigio-Chiaro.webp", "draining gravel: rounded pebbles about 1-2 cm in a loose, even layer"),
};

/** Colore dell'acqua (piscina.colore_acqua): a colori. Qui il tono È l'informazione. */
export const POOL_WATER_COLOUR_REFERENCES: PhotoTable = {
  cristallina_chiara: p("Acqua-Cristallina-Su-Piastrelle-Bianche.webp", "crystal-clear, almost colourless water over a light tiled floor with sharp caustic light patterns"),
  azzurra_classica: p("Acqua-Azzurra-Con-Riflessi-Naturali.webp", "classic bright blue pool water with natural ripples and caustic light patterns"),
  turchese: p("Acqua-Turchese-Nella-Villa-Italiana.webp", "vivid turquoise pool water in full sun, clear and luminous"),
  grigio_verde_naturale: p("Acqua-Naturale-In-Biopiscina-Elegante.webp", "natural grey-green water, clear but tinted like a lake, reflecting the planting around it"),
  blu_profondo: p("Piscina-Elegante-Dai-Riflessi-Profondi.webp", "deep dark blue water over a dark lining, with mirror-like reflections and a strong sense of depth"),
  sabbia_chiara: p("Riflessi-Beige-Verdi-Nell-Acqua-Della-Piscina.webp", "light sandy water tone over a beige stone floor: shallow, transparent, with soft green-gold reflections"),
};
const WATER_COLOUR_COPY =
  "Use this photo only as the reference for the water tone and clarity; ignore the pool shape, the finishes, the house and the landscape";

/**
 * Superficie al posto della piscina tolta (finiture.superficie_ripristino, solo
 * rimozione). Solo la ghiaia: le altre foto dell'area mostrano una piscina, e in
 * una rimozione spingerebbero il modello a lasciarla (vedi SENZA_FOTO).
 */
export const POOL_RESTORED_SURFACE_REFERENCES: PhotoTable = {
  ghiaia_drenante: POOL_SURROUND_REFERENCES.ghiaia_drenante,
};

/**
 * Opzioni del form senza foto, col motivo. Il test verifica che ogni opzione
 * abbia una foto o stia qui.
 */
export const SENZA_FOTO: Record<string, Record<string, string>> = {
  // Il 05/10/2026 sono entrate le foto delle sei tipologie (lap, plunge, semi-incassata, fuori terra,
  // minipiscina, compatta da terrazzo), dello sfioro nascosto e della recinzione in vetro.
  sistema_bordo: {
    skimmer: "è la vasca normale: le foto di tipologia «interrata» la mostrano già, e il testo basta",
  },
  accesso: { nessuno: "non si aggiunge niente" },
  area_perimetrale: { mantieni_esistente: "si conserva l'area della foto: nessun bersaglio" },
  superficie_ripristino: {
    prato_raccordato: "la foto del prato mostra il bordo e l'acqua di una piscina: in una rimozione spingerebbe a lasciarla",
    deck_wpc: "la foto del deck mostra una piscina accanto",
    solarium_gres: "la foto del solarium mostra una piscina accanto",
    pietra_naturale: "la foto della pietra mostra una piscina accanto",
  },
  rivestimento_esterno: {
    doghe_legno_wpc: "nessuna foto di pareti rivestite nel set (da generare)",
    pietra_naturale: "nessuna foto di pareti rivestite nel set (da generare)",
    gres_effetto_pietra: "nessuna foto di pareti rivestite nel set (da generare)",
    intonaco_liscio: "nessuna foto di pareti rivestite nel set (da generare)",
  },
};

const TYPE_COPY_BIOPISCINA =
  "Copy only the layout: open swimming water, the planted regeneration margin and the natural stone edges; ignore the house, the furniture and the landscape beyond";
const TYPE_COPY_DEFAULT =
  "Copy only the basin construction — outline, edge and water level; ignore its colours, finishes, house and landscape, which come from the written specification and the source photo";
/** Vasche che stanno sopra il terreno (muretto, pareti, cassa): la foto mostra anche quanto, e quello va copiato. */
const TYPE_COPY_RAISED =
  "Copy only the basin construction — outline, how its walls stand above the ground, the rim or coping on top and the water level; ignore its colours, wall finishes, house and landscape, which come from the written specification and the source photo";

/** Cosa copiare dalla foto di tipologia (anche quelle di forma in B/N: il colore arriva dal testo). */
function copiaTipologia(tipo: string): string {
  if (tipo === "biopiscina") return TYPE_COPY_BIOPISCINA;
  return TIPI_RIALZATI.includes(tipo) ? TYPE_COPY_RAISED : TYPE_COPY_DEFAULT;
}

const EDGE_SYSTEM_COPY_DEFAULT =
  "Copy only how the edge holds the water (water level, overflow, vanishing edge); the pool outline, colours and finishes come from the written specification";
const EDGE_SYSTEM_COPY: Record<string, string> = {
  // La foto è di sfioro nascosto, non di infinity: «vanishing edge» qui spingerebbe il bordo a sparire nel panorama.
  sfioro_nascosto:
    "Copy only how the edge holds the water — flush with the coping on every side, no grating, skimmer or gutter in view; the pool outline, colours and finishes come from the written specification",
};

/** Cosa copiare dalla foto del sistema di bordo. */
function copiaSistemaBordo(sistema: string): string {
  return Object.prototype.hasOwnProperty.call(EDGE_SYSTEM_COPY, sistema) ? EDGE_SYSTEM_COPY[sistema] : EDGE_SYSTEM_COPY_DEFAULT;
}

/** Cosa del config legge il collector: è il config piatto del wizard (render_piscine_sessions.config). */
export type PoolReferenceConfig = {
  operazione?: string | null;
  /** Firma vecchia del collector: la tipologia al livello alto. */
  tipo?: string | null;
  piscina?: { tipo?: string | null; sistema_bordo?: string | null; colore_acqua?: string | null } | null;
  finiture?: {
    rivestimento_interno?: string | null;
    coping?: string | null;
    area_perimetrale?: string | null;
    superficie_ripristino?: string | null;
  } | null;
  comfort?: { accesso?: string | null; accessori?: unknown; illuminazione?: string | null } | null;
};

/**
 * Priorità (più basso = più importante; tetto MAX_SHARED_REFERENCES = 3):
 *  10 VASCA — tipologia o sistema di bordo: decide la sagoma e dove sta l'acqua (a filo,
 *     a sfioro, che sparisce nel panorama). Sbagliarla rifà tutto il render.
 *  20 ACCESSO — gradini, spiaggetta, scala: struttura dentro la vasca; «gradoni lounge»,
 *     «spiaggetta» e «beach entry» sono le parole più ambigue del form.
 *  30 RIVESTIMENTO — la superficie più grande (fondo e pareti visti attraverso l'acqua);
 *     la sua foto mostra già anche il tono dell'acqua su quel fondo.
 *  40 COPING — il bordo, la cornice della vasca.
 *  50 AREA PERIMETRALE — la superficie intorno (in una rimozione: la superficie che prende il posto della vasca).
 *  60 COLORE ACQUA — tono: di solito già nella foto del rivestimento, quindi viene dopo.
 *  70+ ACCESSORI — dettagli, nell'ordine in cui l'utente li ha scelti; 90 le luci subacquee
 *     scelte da «Illuminazione» (stessa foto dell'accessorio: vale una volta sola).
 * Nuova piscina col form di default: tipologia + gradini + rivestimento.
 */
export function collectPoolReferenceImages(config: PoolReferenceConfig): SharedReferenceImage[] {
  const op = config.operazione;
  const piscina = config.piscina ?? {};
  const finiture = config.finiture ?? {};
  const comfort = config.comfort ?? {};
  const out: ReferenceCandidate[] = [];
  const add = (priority: number, role: string, key: string | null | undefined, table: PhotoTable, copy?: string) => {
    if (!key || !Object.prototype.hasOwnProperty.call(table, key)) return;
    out.push({ priority, role, key, entry: table[key], ...(copy ? { copy } : {}) });
  };

  if (cambiaElemento(op, "vasca")) {
    const tipo = piscina.tipo ?? config.tipo ?? null;
    const sistema = sistemaBordoEffettivo(tipo, piscina.sistema_bordo);
    const tipoOk = !!tipo && Object.prototype.hasOwnProperty.call(POOL_TYPE_REFERENCES, tipo)
      && (POOL_TYPE_PHOTO_EDGE_SYSTEMS[tipo] ?? []).includes(sistema);
    if (tipoOk) {
      add(10, "POOL TYPE TARGET", tipo, POOL_TYPE_REFERENCES, copiaTipologia(tipo));
    } else {
      add(10, "POOL EDGE SYSTEM TARGET", sistema, POOL_EDGE_SYSTEM_REFERENCES, copiaSistemaBordo(sistema));
    }
  }
  if (cambiaElemento(op, "accesso") && comfort.accesso !== "nessuno") {
    add(20, "POOL ACCESS TARGET", comfort.accesso, POOL_ACCESS_REFERENCES);
  }
  if (cambiaElemento(op, "rivestimento")) {
    add(30, "INTERIOR FINISH TARGET", finiture.rivestimento_interno, POOL_INTERIOR_FINISH_REFERENCES,
      finiture.rivestimento_interno === "gres_effetto_pietra"
        ? "Copy only the stone texture and tone; lay it as regular rectangular porcelain tiles with thin straight joints, not as the irregular slabs of the photo"
        : undefined);
  }
  if (cambiaElemento(op, "coping")) {
    const profilo = finiture.coping === "bordo_sottile_moderno" || finiture.coping === "bordo_massivo_classico";
    add(40, "COPING TARGET", finiture.coping, POOL_COPING_REFERENCES,
      profilo
        ? "Copy the edge profile and the slab thickness; the coping material and colour come from the written specification"
        : "Copy the coping material, its format and joints only along the water's edge — not the surrounding paving or the furniture; the exact colour tone comes from the written specification");
  }
  if (cambiaElemento(op, "ripristino")) {
    add(50, "RESTORED SURFACE TARGET", finiture.superficie_ripristino, POOL_RESTORED_SURFACE_REFERENCES,
      "Copy the surface texture and scale for the ground that replaces the removed pool; the exact colour tone comes from the written specification");
  }
  if (cambiaElemento(op, "area_perimetrale") && finiture.area_perimetrale !== "mantieni_esistente") {
    add(50, "POOL SURROUND TARGET", finiture.area_perimetrale, POOL_SURROUND_REFERENCES,
      finiture.area_perimetrale === "prato_raccordato"
        ? "Copy only the clean junction between lawn and coping; the coping material comes from the written specification"
        : undefined);
  }
  // Colore impossibile su quel rivestimento: il prompt fa vincere il rivestimento, e la sua foto basta.
  const acquaInConflitto = acquaIncompatibileConRivestimento(finiture.rivestimento_interno, piscina.colore_acqua);
  if (cambiaElemento(op, "colore_acqua") && !acquaInConflitto) {
    add(60, "WATER COLOUR TARGET", piscina.colore_acqua, POOL_WATER_COLOUR_REFERENCES, WATER_COLOUR_COPY);
  }
  if (cambiaElemento(op, "accessori") && Array.isArray(comfort.accessori)) {
    comfort.accessori.forEach((item, i) => {
      if (typeof item !== "string") return;
      add(70 + i, "POOL FEATURE TARGET", item, POOL_FEATURE_REFERENCES, FEATURE_COPY[item] ?? FEATURE_COPY_DEFAULT);
    });
  }
  if (cambiaElemento(op, "illuminazione") && (comfort.illuminazione === "subacquea_soft" || comfort.illuminazione === "subacquea_e_perimetrale")) {
    add(90, "POOL FEATURE TARGET", "illuminazione_subacquea", POOL_FEATURE_REFERENCES, FEATURE_COPY.illuminazione_subacquea);
  }
  return pickReferences(out);
}

/** Tutti i percorsi «cartella/file» delle tabelle (per i test sull'esistenza dei file e delle miniature). */
export function listPoolReferencePaths(): string[] {
  return listReferencePaths(
    POOL_TYPE_REFERENCES,
    POOL_EDGE_SYSTEM_REFERENCES,
    POOL_INTERIOR_FINISH_REFERENCES,
    POOL_COPING_REFERENCES,
    POOL_ACCESS_REFERENCES,
    POOL_FEATURE_REFERENCES,
    POOL_SURROUND_REFERENCES,
    POOL_WATER_COLOUR_REFERENCES,
    POOL_RESTORED_SURFACE_REFERENCES,
  );
}
