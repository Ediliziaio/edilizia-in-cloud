/**
 * Foto di riferimento condivise del pavimento (usate anche dal pavimento della
 * stanza, vedi roomReferences.ts).
 *
 * Una tabella per scelta del form: posa (FORMA, bianco e nero), tipo, effetto,
 * essenza, bisello, finitura e battiscopa (MATERIA, a colori). Il pavimento in
 * questo render cambia sempre; il battiscopa solo se va sostituito.
 *
 * Ordine (al massimo 3 foto, dopo il catalogo dell'azienda che ha la precedenza):
 *  10 posa       — la geometria della posa: è ciò che il modello sbaglia di più
 *                  (spina contro chevron, diagonale, modulare);
 *  20 superficie — UNA sola foto della materia: essenza se il pavimento è legno,
 *                  effetto se il materiale imita (gres, ceramica, laminato/LVT con
 *                  un aspetto diverso dal legno), altrimenti il tipo. Due foto di
 *                  legni diversi darebbero al modello due toni in conflitto;
 *  30 battiscopa — un elemento in più che cambia, piccolo ma visibile;
 *  40 bisello    — dettaglio del giunto, solo per pavimenti in legno;
 *  50 finitura   — dettaglio della luce sulla superficie, solo se la foto è della
 *                  stessa famiglia del pavimento (legno o pietra).
 *
 * Le foto di posa mostrano piastrelle di formato normale: su un pavimento a lastre
 * grandi spingerebbero una griglia fitta di quadrotte (il difetto che il controllo
 * qualità chiama wrong_module_scale), quindi lì non si allegano.
 */
import { normalizeFloorLegacyConfig } from "../render-floor/floorRenderConfig.ts";
import { buildFloorMaterialSpecification, woodEssenceApplies } from "../render-floor/floorReplacementRules.ts";
import type {
  ConfigurazionePavimento,
  FloorMaterialSpecification,
  TipoPavimento,
} from "../render-floor/types.ts";
import {
  BLACK_AND_WHITE_RULE,
  COLOUR_RULE,
  listReferencePaths,
  pickReferences,
  type PhotoEntry,
  type PhotoTable,
  type ReferenceCandidate,
} from "./referencePicker.ts";
import type { SharedReferenceImage } from "./referenceUrl.ts";
import { thumbFilename } from "./thumbs.ts";

export const FLOOR_FOLDER = "floors";

const f = (filename: string, text: string): PhotoEntry => ({ folder: FLOOR_FOLDER, filename, text });

/** Posa (`pattern_posa`) — FORMA: in bianco e nero, il testo non dice colori. */
export const FLOOR_LAYOUT_PHOTOS: PhotoTable = {
  spina_di_pesce: f("Spina-Di-Pesce-In-Grigio-Chiaro-BN.webp", "classic herringbone: rectangular modules laid at right angles in a broken zigzag, square-cut ends butting the side of the next module"),
  spina_ungherese: f("Piastrelle-Grigio-Chiaro-A-Spina-Ungherese-BN.webp", "Hungarian point (chevron): modules with ends cut at an angle, meeting in continuous straight V points along each row"),
  diagonale_45: f("Piastrelle-Grigio-Chiaro-In-Diagonale-BN.webp", "diagonal layout: square modules turned 45 degrees to the walls, joint lines crossing the room diagonally"),
  sfalsato_33: f("Piastrelle-Grigio-Chiaro-A-Posa-Sfalsata-BN.webp", "offset bond: rectangular modules in parallel rows, each row shifted by about one third of the module length"),
  rettilineo_dritto: f("Piastrelle-Grigio-Chiaro-A-Griglia-Regolare-BN.webp", "straight grid: modules aligned in rows and columns, joint lines continuous in both directions, no offset"),
  modulare: f("Piastrelle-Grigio-Chiaro-In-Posa-Modulare-BN.webp", "modular layout: a repeating set of squares and rectangles of different sizes interlocking on a regular grid"),
  opus_romanum: f("Pavimento-In-Pietra-Naturale-Grigio-Beige-BN.webp", "opus romanum: squares and rectangles of several sizes in a non-repeating mosaic, no joint line running long"),
};

/** Tipo (`tipo`) — MATERIA. Gres e ceramica imitano: la loro foto viene dall'effetto. */
export const FLOOR_TYPE_PHOTOS: PhotoTable = {
  parquet_massello: f("Parquet-In-Rovere-Oliato-Listoni-Sfalsati.webp", "solid oak parquet, oiled: wide planks of random lengths with open grain, knots and natural board-to-board variation"),
  parquet_prefinito: f("Parquet-In-Rovere-Color-Miele-2.webp", "engineered prefinished parquet: crisp factory-finished oak boards with tight seams and orderly grain"),
  laminato: f("Rovere-Laminato-Con-Giunti-Click.webp", "oak-look laminate: printed grain repeating from plank to plank, regular click joints, flat even surface"),
  vinile_lvt: f("Plance-Viniliche-Effetto-Rovere-Caldo.webp", "wood-look vinyl (LVT) planks: thin flat planks with embossed grain and very tight seams"),
  moquette: f("Moquette-Grigio-Medio-A-Pelo-Corto.webp", "wall-to-wall carpet with a short dense loop pile: one continuous textile surface, no joints"),
  resina_continua: f("Pavimento-Continuo-In-Resina-Grigio-Caldo.webp", "poured resin floor: one continuous smooth surface with soft cloudy depth and a gentle sheen, no joints"),
  cemento_resina: f("Pavimento-In-Resina-Cementizia-Grigio-Nuvolato.webp", "cement-resin floor: seamless trowelled surface with mottled mineral clouds, no joints"),
  microcemento: f("Microcemento-Nuvolato-Grigio-Caldo.webp", "microcement: thin hand-trowelled coating with soft cloudy patches and faint spatula marks, no joints"),
  terrazzo_veneziano: f("Terrazzo-Veneziano-Lucidato-A-Vista.webp", "polished Venetian terrazzo: large and small marble chips densely set in a fine matrix, one continuous surface"),
  pietra_naturale: f("Pavimento-In-Pietra-Naturale-Grigio-Beige.webp", "natural stone slabs: honed limestone surface with pits, fossil marks, soft tonal variation and tumbled edges"),
  cotto: f("Piastrelle-In-Terracotta-Arancione-Caldo.webp", "handmade terracotta (cotto) tiles: fired-clay surface with uneven tone, softened edges and wide joints"),
  marmo: { folder: "bathroom", filename: "Piastrelle-In-Marmo-Chiaro-Levigato.webp", text: "natural marble tiles: honed surface with fine flowing veins that change from tile to tile" },
};

/** Effetto visivo (`effetto_visivo`) — MATERIA: l'aspetto di gres, ceramica e (se non legno) laminato/LVT. */
export const FLOOR_EFFECT_PHOTOS: PhotoTable = {
  legno: f("Gres-Effetto-Rovere-Naturale.webp", "wood-effect porcelain planks: printed oak grain on long ceramic planks with fine joints"),
  marmo: f("Gres-Porcellanato-Effetto-Marmo-Chiaro.webp", "marble-effect porcelain: large rectified tiles with soft flowing veins, fine joints"),
  pietra: f("Gres-Porcellanato-Effetto-Calcare-Grigio.webp", "stone-effect porcelain: large tiles with a limestone texture of fine pores, clouds and faint veins"),
  cemento: { folder: "bathroom", filename: "Piastrelle-Grigie-Effetto-Cemento.webp", text: "concrete-effect porcelain: large tiles with subtle trowel clouds and fine pores, thin joints" },
  resina: f("Pavimento-In-Resina-Cementizia-Grigio-Nuvolato.webp", "resin look: seamless trowelled surface with soft mottled clouds, no visible joints"),
  cotto: f("Piastrelle-In-Gres-Effetto-Terracotta.webp", "terracotta-effect porcelain: square tiles imitating fired clay, uneven tone and visible joints"),
  tessile: f("Moquette-Grigio-Medio-A-Pelo-Corto.webp", "textile look: short dense loop pile, continuous, no joints"),
  terrazzo: f("Piastrelle-In-Gres-Effetto-Terrazzo.webp", "terrazzo-effect porcelain: tiles with small scattered stone chips in a fine matrix, thin joints"),
};

/** Essenza (`essenza_legno`) — MATERIA: qui il tono È l'informazione. */
export const FLOOR_ESSENCE_PHOTOS: PhotoTable = {
  rovere_naturale: f("Parquet-In-Rovere-Naturale-Dallalto.webp", "natural oak boards: straight and cathedral grain, small knots, moderate board-to-board variation"),
  rovere_sbiancato: f("Parquet-In-Rovere-Sbiancato.webp", "bleached oak: pale washed boards with soft visible grain and very little yellow"),
  rovere_miele: f("Parquet-In-Rovere-Color-Miele.webp", "honey oak: warm golden boards with lively grain and small knots"),
  noce: f("Parquet-In-Noce-Color-Cioccolato.webp", "walnut: deep chocolate boards with darker grain streaks and refined contrast"),
  teak: f("Doghe-Di-Teak-Dorato.webp", "teak: golden strips with straight grain and darker streaks between boards"),
  wenghe: f("Parquet-Wenge-Scuro-Con-Venature-Fini.webp", "wenge: very dark, almost black boards with fine tight grain"),
  frassino_bianco: f("Parquet-In-Frassino-Bianco.webp", "white ash: creamy pale boards with clear straight grain"),
};

/** Bisellatura (`bisellatura`) — MATERIA, primi piani di tavole: solo per pavimenti in legno. */
export const FLOOR_BEVEL_PHOTOS: PhotoTable = {
  microbisello: f("Giunzione-Tra-Tavole-Di-Rovere.webp", "micro-bevel: a very fine eased edge where two boards meet, leaving a hairline shadow at the joint"),
  bisello_v: f("Giunzione-A-V-Tra-Tavole-Di-Legno.webp", "V-groove bevel: both board edges chamfered into a clear V-shaped groove along the joint"),
  bordo_irregolare: f("Giunzione-Di-Assi-In-Legno-Rustico.webp", "rustic irregular edge: hand-worn, slightly wavy board edges with an uneven gap"),
};

/** Finitura (`finitura`) — MATERIA, primi piani: ogni foto è di una famiglia (legno o pietra). */
export const FLOOR_FINISH_PHOTOS: PhotoTable = {
  lucido: f("Piastrella-Effetto-Pietra-Con-Riflessi.webp", "polished finish: mirror-like gloss with sharp reflections of windows and light on the surface"),
  opaco: f("Superficie-Effetto-Pietra-Opaca.webp", "matt finish: diffuse surface with no reflections and a fine mineral texture"),
  satinato: f("Texture-Satinata-Effetto-Pietra.webp", "satin finish: soft low sheen, light spreads gently without mirror reflections"),
  spazzolato: f("Venature-Naturali-Del-Legno-Spazzolato.webp", "brushed wood: soft grain brushed out so the growth rings stand in fine relief"),
  boccardato: f("Superficie-In-Pietra-Bocciardata.webp", "bush-hammered stone: rough pitted anti-slip surface with dense small impact marks"),
  anticato: f("Patina-Naturale-Sulla-Pietra-Antica.webp", "aged stone: tumbled, softened surface with worn edges, open pores and natural patina"),
  levigato: f("Pietra-Levigata-Dalla-Luce-Setosa.webp", "honed stone: flat smooth surface with a silky low sheen, no mirror gloss"),
  cerato: f("Bagliore-Satinato-Del-Legno-Cerato.webp", "waxed wood: warm deep sheen with soft highlights, grain visible through the wax"),
};

/** Di quale materiale è il primo piano di ogni finitura: si allega solo a un pavimento della stessa famiglia. */
export const FLOOR_FINISH_FAMILY: Record<string, "legno" | "pietra"> = {
  lucido: "pietra",
  opaco: "pietra",
  satinato: "pietra",
  spazzolato: "legno",
  boccardato: "pietra",
  anticato: "pietra",
  levigato: "pietra",
  cerato: "legno",
};

/** Battiscopa (`battiscopa.tipo`) — MATERIA: la foto mostra anche pavimento e parete, si copia solo il battiscopa. */
export const FLOOR_SKIRTING_PHOTOS: PhotoTable = {
  bianco: f("Battiscopa-Bianco-In-Angolo-Pulito.webp", "painted white skirting with a small moulded bead along the top and a plain flat face, clean outside corner"),
  legno: f("Battiscopa-In-Rovere-Angolo-Pulito.webp", "solid oak skirting board with a plain square-edged profile, mitred inside corner"),
  alluminio: f("Battiscopa-In-Alluminio-Spazzolato.webp", "brushed aluminium skirting: a thin flat metal profile with a clean corner joint"),
};

/** Gres e ceramica imitano un altro materiale: la foto della superficie è quella dell'effetto. */
export const FLOOR_TYPES_VIA_EFFECT: TipoPavimento[] = ["gres_porcellanato", "ceramica"];

/**
 * Opzioni del form senza foto, col motivo («dimensione.valore» → perché). Il test verifica
 * che ogni opzione abbia una foto o stia qui.
 */
export const FLOOR_SENZA_FOTO: Record<string, string> = {
  "posa.a_correre": "la posa più comune (sfalsata a metà): la mostrano già le foto di materia a listoni e il testo basta; nel set non c'è una foto di forma",
  "posa.cassero_irregolare": "nessuna foto di forma nel set: è la posa dei listoni di lunghezza libera, che la foto del parquet massello già mostra",
  "posa.doppia_fila": "nessuna foto nel set (da generare, vedi docs/render-foto-da-generare/pavimento-stanza.md)",
  "posa.esagonale": "nessuna foto nel set (da generare, vedi docs/render-foto-da-generare/pavimento-stanza.md)",
  "effetto.neutro": "nessun aspetto da imitare: bastano tipo, colore e finitura scritti",
  "finitura.naturale": "superficie senza trattamento: è quella che mostra già la foto della materia",
  "bisello.nessuna": "spigolo vivo, giunto a filo: non c'è un profilo da mostrare",
  "battiscopa.coordinato_pavimento": "stesso materiale del pavimento nuovo: basta la foto della superficie",
};

const COPY_LAYOUT = `Copy only the laying geometry: module orientation, offsets and where the joint lines run; module size comes from the written specification — ${BLACK_AND_WHITE_RULE}`;
const COPY_SURFACE = `Copy the material surface only: texture, grain or veining and natural tone variation; ignore this sample's module size, joints and layout, which come from the written specification; ${COLOUR_RULE}`;
const COPY_ESSENCE = "Copy the wood species: grain figure, knots and tone of the boards; ignore this sample's plank size and layout, which come from the written specification (if the written colour differs, the written colour wins)";
const COPY_SKIRTING = "Copy only the skirting board: profile, proportions and material; ignore the floor and the wall in this photo — the height comes from the written specification";
const COPY_BEVEL = "Copy only the edge profile where two boards meet (bevel depth and shape); ignore this close-up's wood species, colour and scale";
const COPY_FINISH = "Copy only how the surface responds to light (sheen, reflections, micro-texture); ignore this close-up's material, colour, pattern and scale";

/**
 * Il pavimento si presenta come legno? Parquet sempre; laminato, LVT, gres e ceramica solo
 * con l'effetto legno (un laminato effetto pietra non vuole la foto di un'essenza). È la
 * stessa regola con cui il prompt decide se scrivere l'essenza.
 */
function aspettoLegno(legacy: ConfigurazionePavimento, spec: FloorMaterialSpecification): boolean {
  return woodEssenceApplies(legacy.tipo, spec.visualEffect);
}

/** Stessi formati che floorReplacementRules tratta da grande formato. */
const FORMATO_GRANDE = /120x120|120x240|80x80|60x120/;

function lastreGrandi(legacy: ConfigurazionePavimento, spec: FloorMaterialSpecification): boolean {
  if (!spec.isTileLike) return false;
  return legacy.scala_pattern === "grande_formato"
    || legacy.scala_pattern === "maxi_lastre"
    || FORMATO_GRANDE.test(legacy.formato_piastrella ?? "");
}

/** La stessa foto in due versioni (B/N di forma e a colori di materia): una basta. */
function gemelle(a: PhotoEntry, b: PhotoEntry): boolean {
  return a.folder === b.folder && thumbFilename(a.filename) === thumbFilename(b.filename);
}

export interface FloorSurfacePhoto {
  role: string;
  key: string;
  entry: PhotoEntry;
  copy: string;
}

/**
 * La foto della superficie del pavimento (una sola): essenza → effetto (materiali che
 * imitano) → tipo. È anche la miniatura che il form mostra sulla scheda del materiale.
 */
export function floorSurfacePhoto(
  legacy: ConfigurazionePavimento,
  spec: FloorMaterialSpecification = buildFloorMaterialSpecification(legacy),
): FloorSurfacePhoto | null {
  const tipo = legacy.tipo;
  if (aspettoLegno(legacy, spec) && legacy.essenza_legno) {
    const entry = FLOOR_ESSENCE_PHOTOS[legacy.essenza_legno];
    if (entry) return { role: "WOOD SPECIES TARGET", key: legacy.essenza_legno, entry, copy: COPY_ESSENCE };
  }
  const effetto = spec.visualEffect;
  const viaEffetto = FLOOR_TYPES_VIA_EFFECT.includes(tipo)
    || ((tipo === "laminato" || tipo === "vinile_lvt") && effetto !== "legno");
  if (viaEffetto) {
    const entry = FLOOR_EFFECT_PHOTOS[effetto];
    if (entry) return { role: "FLOOR MATERIAL TARGET", key: `${tipo} / ${effetto}`, entry, copy: COPY_SURFACE };
    if (FLOOR_TYPES_VIA_EFFECT.includes(tipo)) return null;
  }
  const entry = FLOOR_TYPE_PHOTOS[tipo];
  return entry ? { role: "FLOOR MATERIAL TARGET", key: tipo, entry, copy: COPY_SURFACE } : null;
}

/** Famiglia della superficie per le foto di finitura: null se nessuna foto di finitura le somiglia. */
function famigliaSuperficie(legacy: ConfigurazionePavimento, spec: FloorMaterialSpecification): "legno" | "pietra" | null {
  if (spec.isSeamless) return null;
  if (aspettoLegno(legacy, spec)) return "legno";
  if (legacy.tipo === "marmo" || legacy.tipo === "pietra_naturale") return "pietra";
  const imita = FLOOR_TYPES_VIA_EFFECT.includes(legacy.tipo) || legacy.tipo === "laminato" || legacy.tipo === "vinile_lvt";
  if (imita && (spec.visualEffect === "marmo" || spec.visualEffect === "pietra")) return "pietra";
  return null;
}

export interface FloorCandidateOptions {
  /** Bisello e finitura (primi piani di dettaglio). La stanza li lascia fuori: alla sua scala non si vedono. */
  dettagli?: boolean;
}

/**
 * Le candidate del pavimento, già normalizzato (vedi normalizeFloorLegacyConfig): le stesse
 * scelte che il prompt descrive, con le stesse regole di default.
 */
export function floorReferenceCandidates(
  legacy: ConfigurazionePavimento,
  options: FloorCandidateOptions = {},
): ReferenceCandidate[] {
  const spec = buildFloorMaterialSpecification(legacy);
  const out: ReferenceCandidate[] = [];
  const superficie = floorSurfacePhoto(legacy, spec);

  if (!spec.isSeamless && !lastreGrandi(legacy, spec)) {
    const posa = FLOOR_LAYOUT_PHOTOS[legacy.pattern_posa];
    if (posa && !(superficie && gemelle(posa, superficie.entry))) {
      out.push({ priority: 10, role: "LAYING PATTERN TARGET", key: legacy.pattern_posa, entry: posa, copy: COPY_LAYOUT });
    }
  }

  if (superficie) out.push({ priority: 20, ...superficie });

  const battiscopa = legacy.battiscopa;
  if (battiscopa?.azione === "sostituisci" && battiscopa.tipo) {
    const entry = FLOOR_SKIRTING_PHOTOS[battiscopa.tipo];
    if (entry) out.push({ priority: 30, role: "SKIRTING BOARD TARGET", key: battiscopa.tipo, entry, copy: COPY_SKIRTING });
  }

  if (options.dettagli !== false) {
    const famiglia = famigliaSuperficie(legacy, spec);
    if (famiglia === "legno" && legacy.bisellatura) {
      const entry = FLOOR_BEVEL_PHOTOS[legacy.bisellatura];
      if (entry) out.push({ priority: 40, role: "EDGE BEVEL TARGET", key: legacy.bisellatura, entry, copy: COPY_BEVEL });
    }
    const finitura = FLOOR_FINISH_PHOTOS[legacy.finitura];
    if (finitura && famiglia && FLOOR_FINISH_FAMILY[legacy.finitura] === famiglia) {
      out.push({ priority: 50, role: "SURFACE FINISH TARGET", key: legacy.finitura, entry: finitura, copy: COPY_FINISH });
    }
  }

  return out;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

/** Configurazione del wizard (piatta) o schema v2 con `legacy_config`: si legge il livello giusto. */
export type FloorReferenceConfig = Partial<ConfigurazionePavimento> | Record<string, unknown>;

/**
 * Foto condivise per un render pavimento (massimo 3, in ordine di importanza). Il pavimento
 * cambia sempre in questo render; tutto il resto segue le scelte del form.
 */
export function collectFloorReferenceImages(config: FloorReferenceConfig): SharedReferenceImage[] {
  const source = asRecord(config);
  const legacy = normalizeFloorLegacyConfig(source.legacy_config ? asRecord(source.legacy_config) : source);
  return pickReferences(floorReferenceCandidates(legacy));
}

/** Tutti i percorsi «cartella/file» delle tabelle: per i test sull'esistenza dei file. */
export function listFloorReferencePaths(): string[] {
  return listReferencePaths(
    FLOOR_LAYOUT_PHOTOS,
    FLOOR_TYPE_PHOTOS,
    FLOOR_EFFECT_PHOTOS,
    FLOOR_ESSENCE_PHOTOS,
    FLOOR_BEVEL_PHOTOS,
    FLOOR_FINISH_PHOTOS,
    FLOOR_SKIRTING_PHOTOS,
  );
}
