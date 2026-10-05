// generate-pool-render/poolPrompt.ts
//
// Il prompt del render piscine come lo costruisce l'edge (Prompt Engine v1).
// Stava dentro index.ts, dove nessun test poteva arrivarci: qui e' una funzione
// pura, importabile anche da vitest (src/test/logic/piscineRenderPrompt.test.ts).
//
// Nuova piscina e sostituzione producono il testo di sempre, carattere per
// carattere, finche' i campi nuovi restano vuoti. Cosa e' cambiato (04/10/2026):
// - ambito per operazione (shared/render-piscine/piscineOperationScope.ts): con
//   «solo bordo», «solo acqua», «aggiungi accesso/accessori» e «rimuovi» gli
//   elementi che non cambiano si conservano come in foto. Prima «solo bordo»
//   chiedeva anche «Access detail: corner entry steps» (l'accesso di default) e
//   descriveva tipologia, rivestimento e prato di default come obiettivi;
// - coerenza (piscineCoerenza.ts): la tipologia vince su forma e bordo, il
//   rivestimento sul colore impossibile dell'acqua;
// - controlli che non arrivavano al prompt: quota del bordo, note tecniche;
// - coperture mostrate in parte (una copertura chiusa nasconde l'acqua richiesta);
// - campi nuovi: misure reali, biopiscina, recinzione in vetro, rivestimento
//   esterno della vasca rialzata, superficie al posto della piscina tolta.

import { cambiaElemento, type ElementoPiscina } from "../../../shared/render-piscine/piscineOperationScope.ts";
import {
  acquaIncompatibileConRivestimento,
  formaEffettiva,
  quotaBordoEffettiva,
  sistemaBordoEffettivo,
  vascaRialzata,
} from "../../../shared/render-piscine/piscineCoerenza.ts";
import {
  ACCESSORY_DESCRIPTIONS,
  COVER_DESCRIPTIONS,
  EXTERIOR_CLADDING_DESCRIPTIONS,
  KEEP_EXISTING,
  POOL_TYPE_DESCRIPTIONS,
  QUOTA_BORDO_DESCRIPTIONS,
  REMOVED_POOL,
  RESTORED_SURFACE_DESCRIPTIONS,
  describeFinishWaterConflict,
  describeRealSize,
  describeRealSizeShort,
  misureReali,
} from "../../../shared/render-piscine/promptFragments.ts";

const POOL_TYPE: Record<string, string> = {
  interrata_rettangolare:
    "in-ground rectangular residential pool with crisp straight geometry and buildable proportions",
  interrata_organica:
    "in-ground freeform organic pool integrated into the garden landscape with a natural curved perimeter",
  lap_pool:
    "long narrow lap pool, linear and proportional, clearly designed for swimming lanes",
  plunge_pool:
    "compact premium plunge pool, small but architectural, integrated into patio/garden",
  sfioro_rettangolare:
    "rectangular overflow pool with continuous premium edge and water close to upper coping level",
  infinity_pool:
    "infinity-edge pool only where view/level context supports it, with one readable vanishing overflow edge",
  semi_incassata:
    "semi-inground premium pool with visible raised edge and clean deck/landscape integration",
  fuori_terra_premium:
    "premium above-ground pool with architectural cladding/base, never inflatable or cheap-looking",
  minipiscina:
    "compact spa-like mini pool integrated into terrace/patio with precise coping and technical details",
  terrazzo_compatta:
    "compact terrace/rooftop-compatible pool only if the scene visually supports it",
  biopiscina: POOL_TYPE_DESCRIPTIONS.biopiscina,
};

const WATER_SYSTEM: Record<string, string> = {
  skimmer:
    "traditional premium skimmer system: waterline sits slightly below coping; no overflow or infinity-edge behavior",
  sfioro:
    "overflow system: water level very close to the upper edge with a continuous premium perimeter",
  infinity_edge:
    "infinity edge: one edge visually spills toward a lower/view side only if the scene supports a drop, view or terrace edge",
  sfioro_nascosto:
    "hidden overflow system: clean flush waterline with very discreet channel detail and no visible skimmer look",
};

const INTERIOR_FINISH: Record<string, string> = {
  mosaico_bianco:
    "white pool mosaic, bright base tone, high water clarity and luminous light-blue reflections",
  mosaico_azzurro:
    "classic light-blue mosaic, familiar clear-blue water tone with small tesserae visible only where close enough",
  mosaico_grigio:
    "contemporary grey mosaic, elegant muted blue-grey water, controlled reflections and premium tone",
  mosaico_antracite:
    "dark anthracite mosaic, deeper dramatic water color with more mirror-like reflections and visible depth gradient",
  gres_effetto_pietra:
    "stone-effect porcelain pool finish, natural mineral base, refined water tone, not a flat blue texture",
  gres_effetto_sabbia:
    "sand-effect porcelain pool finish, pale beach-like base, turquoise/sandy shallow water perception",
  liner_chiaro:
    "premium light liner, clean uniform base and soft clear water, no cheap plastic appearance",
  liner_scuro:
    "premium dark liner, deep blue/charcoal water with stronger reflection and depth shading",
  resina_premium:
    "premium continuous resin pool finish, seamless surface, soft reflections and no visible tile grid",
  pietra_naturale_pool_finish:
    "natural stone pool finish, subtle mineral irregularity and luxurious grounded water tone",
};

const WATER_LOOK: Record<string, string> = {
  cristallina_chiara:
    "crystal-clear light water with realistic transparency and visible shallow-depth gradient",
  azzurra_classica:
    "classic residential blue water, natural under sunlight, not neon or fantasy",
  turchese:
    "turquoise water influenced by light interior finish and sky reflection, realistic and premium",
  grigio_verde_naturale:
    "natural grey-green water tone, refined and landscape-integrated, not dirty",
  blu_profondo:
    "deeper blue water tone with believable depth shading and reflective highlights",
  sabbia_chiara:
    "light sandy water tone for beach-entry/shallow areas, transparent and warm",
};

const COPING: Record<string, string> = {
  pietra_chiara:
    "light natural-stone coping with visible thickness, soft bevel and continuous perimeter",
  pietra_grigia:
    "grey stone coping, contemporary tactile slabs, consistent size and clean junctions",
  gres_2cm:
    "2 cm outdoor porcelain coping, thin modern slabs, crisp rectified edges and precise joints",
  travertino:
    "travertine coping with warm beige tone, natural pores, believable thickness and premium edge profile",
  legno_wpc:
    "WPC/wood deck coping transition, warm board direction and realistic outdoor plank joints",
  cemento_spazzolato:
    "brushed concrete coping, modern matte texture, realistic formed edge and subtle variation",
  bordo_sottile_moderno:
    "thin modern coping edge, minimal profile, precise continuous line around the pool",
  bordo_massivo_classico:
    "thicker classic coping, substantial edge profile and traditional residential character",
};

const AREA: Record<string, string> = {
  mantieni_esistente:
    "preserve existing surrounding lawn/deck/paving except precise pool insertion junctions",
  deck_wpc:
    "WPC/wood-look solarium deck around the pool, boards aligned to perspective with real plank joints",
  solarium_gres:
    "outdoor porcelain solarium paving, slip-resistant slabs, realistic joints and clean perimeter",
  pietra_naturale:
    "natural-stone poolside paving with believable slabs, thickness and material variation",
  prato_raccordato:
    "lawn restored and cleanly cut around coping, no muddy AI-smudged edge",
  ghiaia_drenante:
    "draining gravel perimeter, controlled texture, realistic containment edge",
};

const ACCESS: Record<string, string> = {
  nessuno:
    "no added access feature; do not invent stairs, ladder or beach shelf",
  scala_inox:
    "stainless-steel pool ladder, properly anchored to coping with realistic metal reflections",
  gradini_angolo:
    "corner entry steps, visible below water, proportional and integrated into pool geometry",
  gradini_frontali:
    "front entry steps, clearly readable through water and aligned to the main pool axis",
  gradoni_lounge:
    "wide internal lounge steps / seating ledge, shallow zone clearly visible and integrated",
  spiaggetta:
    "baja shelf / tanning ledge, broad shallow area with thinner transparent water and clear level transition",
  beach_entry:
    "beach entry sloped shallow access, gradual water depth and natural walk-in geometry",
};

const ACCESSORY: Record<string, string> = {
  illuminazione_subacquea:
    "subtle underwater lights integrated into pool walls, realistic soft glow only if lighting conditions support visibility",
  lama_dacqua:
    "linear water blade feature, physically attached to wall/edge and flowing into pool, not decorative fantasy",
  cascata:
    "small architectural waterfall feature, scale-appropriate and connected to pool edge/wall",
  idromassaggio_integrato:
    "integrated spa/hydromassage zone, visible jets and seating only if selected, coherent with pool geometry",
  // Prima «stored/closed coherently»: chiusa o aperta non era detto, e chiusa
  // nasconde acqua, rivestimento e gradini che il resto del prompt chiede di mostrare.
  copertura_isotermica: COVER_DESCRIPTIONS.copertura_isotermica,
  copertura_rigida: COVER_DESCRIPTIONS.copertura_rigida,
  doccia_esterna:
    "outdoor shower near poolside, sparse and buildable, not a random decorative object",
  zona_prendisole:
    "minimal sunbathing area with restrained loungers only if space supports it",
  recinzione_vetro: ACCESSORY_DESCRIPTIONS.recinzione_vetro,
};

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function list(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string =>
      typeof item === "string" && item.trim().length > 0
    )
    : [];
}

function bullets(lines: Array<string | null | undefined>): string {
  return lines.filter((line): line is string => Boolean(line && line.trim()))
    .map((line) => `- ${line}`).join("\n");
}

function inferInfinityFeasibility(
  zone: string,
  insertion: Record<string, unknown>,
  piscina: Record<string, unknown>,
): "plausible" | "limited" | "not_plausible" {
  const context = `${zone} ${text(insertion.posizione_descrittiva)} ${
    text(insertion.rapporto_con_casa)
  } ${text(insertion.interferenze_note)}`.toLowerCase();
  if (
    context.includes("senza vista") || context.includes("senza disliv") ||
    context.includes("flat enclosed") || context.includes("piatto chiuso") ||
    context.includes("nessun disliv")
  ) {
    return text(piscina.sistema_bordo) === "infinity_edge"
      ? "limited"
      : "not_plausible";
  }
  if (
    context.includes("panoram") || context.includes("vista") ||
    context.includes("terraz") || context.includes("disliv") ||
    context.includes("slope") || context.includes("edge") ||
    zone === "vista_panoramica" || zone === "bordo_terrazza"
  ) {
    return "plausible";
  }
  return text(piscina.sistema_bordo) === "infinity_edge"
    ? "limited"
    : "not_plausible";
}

/** Descrizione di una chiave dei campi nuovi, o "" (solo chiavi proprie: niente prototipo). */
function voce(tabella: Readonly<Record<string, string>>, chiave: string): string {
  return chiave && Object.prototype.hasOwnProperty.call(tabella, chiave) ? tabella[chiave] : "";
}

export function buildPoolPrompt(
  session: Record<string, unknown>,
  photoMeta: { width?: number; height?: number } = {},
) {
  const config = asRecord(session.config);
  const insertion = asRecord(config.inserimento);
  const piscina = asRecord(config.piscina);
  const finiture = asRecord(config.finiture);
  const comfort = asRecord(config.comfort);

  const operation = text(config.operazione, "add_new_pool");
  // Cosa cambia questa operazione: tutto il resto si conserva com'e' in foto.
  const cambia = (elemento: ElementoPiscina) => cambiaElemento(operation, elemento);
  const vasca = cambia("vasca");
  const removePool = operation === "remove_existing_pool";
  const zone = text(insertion.zona, "giardino_centrale");
  const poolType = text(piscina.tipo, "interrata_rettangolare");
  // La tipologia vince su forma e bordo quando li contraddice: una «Interrata a
  // sfioro» lasciata su «Skimmer» e' uno sfioro, una «Forma libera» resta organica.
  const shape = formaEffettiva(poolType, text(piscina.forma, "rettangolare"));
  const size = text(
    piscina.dimensione_apparente,
    text(insertion.footprint_apparente, "media"),
  );
  const waterSystem = sistemaBordoEffettivo(poolType, text(piscina.sistema_bordo, "skimmer"));
  const interiorFinish = text(finiture.rivestimento_interno, "mosaico_grigio");
  const waterLook = text(piscina.colore_acqua, "cristallina_chiara");
  const coping = text(finiture.coping, "travertino");
  const deck = text(finiture.area_perimetrale, "prato_raccordato");
  const access = text(comfort.accesso, "gradini_angolo");
  const accessories = list(comfort.accessori);
  const lighting = text(comfort.illuminazione, "nessuna");
  const furniture = text(comfort.arredo, "mantieni");
  const notes = text(config.note_libere);
  const preserveUser = list(config.elementi_da_preservare);
  const removeUser = list(config.elementi_da_rimuovere);
  // Campi che prima non arrivavano al prompt (quota, note tecniche) e campi nuovi:
  // vuoti o al valore di default, il prompt resta quello di sempre.
  const realSize = misureReali(piscina.lunghezza_m, piscina.larghezza_m);
  const edgeHeight = quotaBordoEffettiva(poolType, text(insertion.quota_bordo));
  const claddingKey = text(finiture.rivestimento_esterno);
  const cladding = vascaRialzata(poolType, text(insertion.quota_bordo))
    ? voce(EXTERIOR_CLADDING_DESCRIPTIONS, claddingKey)
    : "";
  const restoredSurface = voce(RESTORED_SURFACE_DESCRIPTIONS, text(finiture.superficie_ripristino));
  const installerNotes = text(insertion.interferenze_note);
  const finishWaterConflict = acquaIncompatibileConRivestimento(interiorFinish, waterLook);

  const infinityFeasibility = inferInfinityFeasibility(
    zone,
    insertion,
    piscina,
  );
  const isAboveGround = [
    "fuori_terra_premium",
    "semi_incassata",
    "terrazzo_compatta",
    "minipiscina",
  ].includes(poolType);
  const orientation = photoMeta.width && photoMeta.height
    ? photoMeta.width > photoMeta.height
      ? "landscape"
      : photoMeta.width < photoMeta.height
      ? "portrait"
      : "square"
    : "unknown";

  const newFootprint = `${size.replace(/_/g, " ")} ${
    shape.replace(/_/g, " ")
  } footprint, width ${
    text(insertion.larghezza_apparente, "media")
  }, length ${
    text(insertion.lunghezza_apparente, "media")
  }, scaled to visible outdoor area and never oversized`;
  const targetMap = {
    zone: vasca ? zone : "existing_pool",
    targetDescription: text(insertion.posizione_descrittiva) ||
      (vasca
        ? zone.replace(/_/g, " ")
        : removePool
        ? "the existing pool to remove, as photographed"
        : "the existing pool, as photographed"),
    footprint: vasca
      ? `${newFootprint}${realSize ? `; ${describeRealSize(realSize)}` : ""}`
      : removePool
      ? REMOVED_POOL.footprint
      : KEEP_EXISTING.footprint,
    orientation:
      "align pool long axis, coping lines, deck joints and water plane to the photographed ground perspective and visible vanishing points",
    limits:
      "keep realistic margins from house, doors, paths, walls, fences, trees, parapets and neighboring property",
    circulation: [
      "keep a plausible walking strip around visible pool edges",
      "do not block doors, windows, paths, stairs, gate access or existing patio circulation",
      "do not invade mature trees, walls, fences, parapets or neighboring property",
    ],
    // «Note tecniche» del form («non toccare l'ulivo a sinistra»): prima finivano
    // solo nel calcolo dell'infinity, mai nel prompt come vincolo.
    ...(installerNotes ? { installerNotes } : {}),
  };

  const envelope = {
    plausibleSize: vasca
      ? `${targetMap.footprint}; pool must fit the visible space and must not dominate the garden unless the photo supports a large pool`
      : removePool
      ? REMOVED_POOL.size
      : KEEP_EXISTING.size,
    plausibleDepth: vasca
      ? `${
        text(insertion.profondita_apparente, "standard")
      } apparent depth; show believable depth gradient, floor visibility and wall/floor junctions`
      : removePool
      ? REMOVED_POOL.depth
      : KEEP_EXISTING.depth,
    copingThickness: removePool
      ? "not applicable: no coping remains"
      : "visible coping thickness must be plausible: neither paper-thin nor oversized",
    deckMargins: cambia("area_perimetrale")
      ? `${
        deck.replace(/_/g, " ")
      } perimeter must create clean transitions to lawn/patio/deck with crisp, buildable edges`
      : operation === "change_coping_only"
      ? KEEP_EXISTING.surroundingsCopingJunction
      : removePool
      ? "the restored area must meet the surrounding lawn/patio/deck with crisp, buildable edges"
      : KEEP_EXISTING.surroundings,
    groundPlaneRelation: !vasca
      ? (removePool ? REMOVED_POOL.groundPlane : KEEP_EXISTING.groundPlane)
      : isAboveGround
      ? "premium above-ground/semi-inground relation: show architectural base, cladding, support and deck integration; never cheap/inflatable"
      : "in-ground relation: basin and coping are integrated into the ground plane with believable excavation; no floating shell",
    houseAndPathRelation: text(
      insertion.rapporto_con_casa,
      "pool respects house access, doors/windows, paths and outdoor circulation",
    ),
    infinityFeasibility: vasca
      ? infinityFeasibility
      : removePool
      ? REMOVED_POOL.infinity
      : KEEP_EXISTING.infinity,
    // «Quota bordo» del form: prima non arrivava al prompt. «A filo terreno» (default) tace.
    ...(vasca && edgeHeight
      ? { edgeHeight: QUOTA_BORDO_DESCRIPTIONS[edgeHeight as keyof typeof QUOTA_BORDO_DESCRIPTIONS] }
      : {}),
  };

  const newPoolGeometry = `${POOL_TYPE[poolType] || poolType}; shape ${
    shape.replace(/_/g, " ")
  }; apparent size ${size.replace(/_/g, " ")}${
    realSize ? `; ${describeRealSizeShort(realSize)}` : ""
  }${
    edgeHeight
      ? `; edge height: ${QUOTA_BORDO_DESCRIPTIONS[edgeHeight as keyof typeof QUOTA_BORDO_DESCRIPTIONS]}`
      : ""
  }${cladding ? `; exterior cladding: ${cladding}` : ""}`;
  // Elementi fuori ambito: si conservano (o, in una rimozione, spariscono) invece
  // di comparire col valore di default del form come se andassero costruiti.
  const keepOr = (keep: string, removed: string) => removePool ? removed : keep;
  const technical = {
    poolGeometry: vasca ? newPoolGeometry : keepOr(KEEP_EXISTING.geometry, REMOVED_POOL.geometry),
    waterSystem: vasca
      ? WATER_SYSTEM[waterSystem] || waterSystem
      : keepOr(KEEP_EXISTING.waterSystemRules, REMOVED_POOL.waterSystemRules),
    interiorFinish: cambia("rivestimento")
      ? INTERIOR_FINISH[interiorFinish] || interiorFinish
      : keepOr(KEEP_EXISTING.interiorFinishRules, REMOVED_POOL.interiorFinishRules),
    // Colore impossibile su quel rivestimento (liner scuro + turchese): vince il rivestimento.
    waterLook: !cambia("colore_acqua")
      ? keepOr(KEEP_EXISTING.waterLook, REMOVED_POOL.waterLook)
      : finishWaterConflict
      ? `${INTERIOR_FINISH[interiorFinish] || interiorFinish}; ${
        describeFinishWaterConflict(interiorFinish, waterLook)
      }`
      : `${WATER_LOOK[waterLook] || waterLook}; consistent with ${
        INTERIOR_FINISH[interiorFinish] || interiorFinish
      }`,
    access: cambia("accesso")
      ? ACCESS[access] || access
      : keepOr(KEEP_EXISTING.access, REMOVED_POOL.access),
    coping: cambia("coping")
      ? COPING[coping] || coping
      : keepOr(KEEP_EXISTING.coping, REMOVED_POOL.coping),
    deck: cambia("area_perimetrale")
      ? AREA[deck] || deck
      : operation === "change_coping_only"
      ? KEEP_EXISTING.surroundingsCopingJunction
      : removePool
      ? restoredSurface ||
        "restore the ground as coherent lawn, patio, deck or hardscape matching the photographed context"
      : KEEP_EXISTING.surroundings,
    lighting: !cambia("illuminazione")
      ? keepOr(KEEP_EXISTING.lighting, "remove the pool lights with the pool")
      : lighting === "nessuna"
      ? "no added pool lighting"
      : `${
        lighting.replace(/_/g, " ")
      } lighting, subtle, realistic, no fantasy glow`,
    accessories: cambia("accessori")
      ? accessories.map((item) => ACCESSORY[item] || item)
      : [],
  };

  const additions: string[] = [];
  const replacements: string[] = [];
  const recolors: string[] = [];
  const removals: string[] = [];
  const conversions: string[] = [
    "Respect the target pool insertion map and buildability envelope.",
    envelope.groundPlaneRelation,
    "Pool edges, coping, water level and surrounding deck/lawn transitions must be clean, buildable and perspective-correct.",
  ];

  const poolSummary =
    `${technical.poolGeometry}; ${technical.waterSystem}; ${technical.interiorFinish}; ${technical.waterLook}; coping ${technical.coping}; surrounding ${technical.deck}.`;

  switch (operation) {
    case "replace_existing_pool":
      removals.push(
        "Remove the existing pool completely: old basin/water plane, coping, incompatible deck edges, skimmers, ladders, pool lights and outdated visible pool details.",
      );
      replacements.push(
        `Replace it with only the newly selected pool system: ${poolSummary}`,
      );
      conversions.push(
        "No hybrid state: no old pool perimeter, old coping, old waterline or old deck scars may remain.",
      );
      break;
    case "remove_existing_pool":
      removals.push(
        "Remove the existing pool completely: water, basin, coping, ladder, skimmer/overflow details, pool lights and incompatible deck edges.",
      );
      // «Al posto della piscina» (campo nuovo): senza scelta, il ripristino di sempre.
      replacements.push(
        restoredSurface
          ? `Restore the target area as ${restoredSurface}.`
          : "Restore the target area as coherent lawn, patio, deck or hardscape matching the photographed context.",
      );
      conversions.push(
        "No residual basin ghost, blue water patch, coping outline or excavation scar may remain.",
      );
      break;
    case "recolor_waterlook_or_liner_only":
      recolors.push(
        `Change only the perceived interior finish/water look to ${technical.interiorFinish} and ${technical.waterLook}.`,
      );
      conversions.push(
        "Waterlook/liner-only: preserve exact pool shape, footprint, coping, surrounding deck and visible pool geometry.",
      );
      conversions.push(
        "Strict scope: do not add or modify steps, beach shelf, lighting, furniture, water features, coping, deck or pool footprint.",
      );
      break;
    case "change_coping_only":
      replacements.push(
        `Preserve basin geometry and water; replace only coping/immediate pool edge with ${technical.coping}.`,
      );
      conversions.push(
        "Coping-only: no footprint change, no water-system change, no basin shape change.",
      );
      conversions.push(
        "Strict scope: do not add or modify access steps, beach shelf, ladders, water color, liner, pool lighting, furniture or surrounding deck beyond the immediate coping junction.",
      );
      break;
    case "add_access_system":
      additions.push(`Add selected pool access feature: ${technical.access}.`);
      conversions.push(
        "Access system must be integrated into the basin shape, visible through water when underwater, and not randomly placed.",
      );
      break;
    case "add_pool_features":
      additions.push(...technical.accessories);
      conversions.push(
        "Pool features must appear only if selected, attached to real pool edges/walls/deck and scaled plausibly.",
      );
      break;
    default:
      additions.push(
        `Insert a new pool in ${targetMap.targetDescription}: ${poolSummary}`,
      );
      conversions.push(
        "Integrate the basin into existing ground/patio/deck; do not leave a pasted-on blue rectangle.",
      );
  }

  // Accesso, luci e arredo solo se l'operazione li cambia. Prima bastava non essere
  // una rimozione: «solo bordo» e «solo acqua» aggiungevano i gradini d'angolo di default.
  if (access !== "nessuno" && cambia("accesso")) {
    additions.push(`Access detail: ${technical.access}.`);
  }
  if (lighting !== "nessuna" && cambia("illuminazione")) {
    additions.push(`Lighting detail: ${technical.lighting}.`);
  }
  if (furniture === "aggiungi_minimo" && cambia("arredo")) {
    additions.push(
      "Add only sparse coherent poolside furniture / sun loungers if there is enough visible space; avoid resort staging.",
    );
  }
  if (furniture === "rimuovi_superfluo" && cambia("arredo")) {
    removals.push(
      "Declutter only small non-essential outdoor objects; do not remove fixed landscape or main furniture unless explicitly listed.",
    );
  }
  if (furniture === "mantieni" || !cambia("arredo")) {
    conversions.push(
      removePool
        ? "Preserve existing outdoor furniture in place; adapt only the shadows around it."
        : "Preserve existing outdoor furniture in place; adapt only water/deck reflections and shadows around it.",
    );
  }
  for (const item of removeUser) {
    removals.push(`Remove user-listed incompatible element: ${item}.`);
  }

  const waterRealism = removePool ? [...REMOVED_POOL.waterRealism] : [
    "water must show realistic specular reflections, not flat painted blue",
    "water transparency must depend on depth, interior finish and scene lighting",
    "depth gradient and shadow inside the basin must be physically plausible",
    "subtle caustics are allowed only when natural and restrained",
    "reflections of sky, facade and vegetation must follow the original camera angle",
    "avoid neon-blue fantasy water and fake resort CGI look",
    !vasca
      ? KEEP_EXISTING.waterRealismSystem
      : waterSystem === "skimmer"
      ? "skimmer pool: waterline must sit slightly below coping; do not render overflow or infinity-edge behavior"
      : waterSystem === "infinity_edge"
      ? "infinity pool: use one plausible edge only if visual drop/view supports it; if context is flat/enclosed, render a safer premium flush overflow edge instead"
      : "overflow pool: water level nearly flush with edge, continuous premium perimeter, no skimmer ambiguity",
    !cambia("accesso")
      ? KEEP_EXISTING.waterRealismAccess
      : access === "spiaggetta" || access === "beach_entry"
      ? "shallow zone must be clearly readable with thinner transparent water and a smooth depth transition"
      : access.includes("grad")
      ? "steps must be visible, proportional, aligned to pool geometry and readable through the water"
      : "do not invent access features beyond selected configuration",
  ];

  const preserve = [
    "same house, facade, windows, doors and outdoor architecture",
    "non-target lawn, paving, deck, patio and garden areas",
    "trees, important vegetation, fences, walls, boundaries and neighboring buildings",
    "existing outdoor furniture unless explicitly changed or decluttered",
    "sky, weather, camera angle, perspective, crop, image dimensions and orientation",
    ...preserveUser,
  ];

  const negative = [
    "do not redesign the house",
    "do not move windows, doors, fences, walls or fixed outdoor structures",
    "do not alter non-target garden, lawn, paving, deck, patio or neighboring property",
    "do not invent random resort furniture, palm trees, fountains or luxury styling not requested",
    "do not create impossible infinity-edge conditions",
    "do not create a floating, pasted-on or badly merged pool",
    "do not leave traces of removed pools, coping, deck edges or old water features",
    "do not generate a different property or generic outdoor catalog scene",
  ];

  // L'avviso sull'infinity riguarda solo una vasca da costruire, non il bordo di una che c'e' gia'.
  const infinityLimited = vasca && waterSystem === "infinity_edge" && infinityFeasibility === "limited";
  const validation = {
    is_valid: !infinityLimited,
    warnings:
      infinityLimited
        ? [
          "Infinity edge selected in a limited context: constrain the output to a plausible premium flush overflow if no drop/view is visible.",
        ]
        : [],
    required_sections: [
      "target pool insertion map",
      "buildability envelope",
      "replacement manifest",
      "pool geometry specification",
      "water system specification",
      "interior finish and water look",
      "coping and deck rules",
      "water realism rules",
      "property integrity constraints",
    ],
  };

  const blocks: Record<string, string> = {
    A: `[BLOCK A - MISSION]\nYou are a SURGICAL PHOTOREALISTIC POOL INSERTION / REPLACEMENT IMAGE EDITOR. Add, replace, remove or refine exactly the requested swimming pool system on the same photographed property. Mandatory: same house, same garden/patio/outdoor space, same camera angle, same perspective, same surrounding structures, same openings, same context, same image dimensions, no artistic reinterpretation and no different-property generation.`,
    B: `[BLOCK B - EXISTING OUTDOOR SCENE INVENTORY]\nInfer the photographed outdoor scene precisely: property type, visible house/facade, existing lawn/patio/deck/hardscape, current topography/levels, existing pool or water if any, furniture, walls/fences/boundaries, vegetation, paths/circulation, light and shadow direction. Photo orientation: ${orientation}. Preserve all non-target context.`,
    C: `[BLOCK C - TARGET POOL INSERTION MAP]\nZone: ${targetMap.zone}\nTarget description: ${targetMap.targetDescription}\nFootprint: ${targetMap.footprint}\nOrientation: ${targetMap.orientation}\nLimits: ${targetMap.limits}\nCirculation:\n${
      bullets(targetMap.circulation)
    }${installerNotes ? `\nInstaller notes (must be respected): ${installerNotes}` : ""}`,
    D: `[BLOCK D - BUILDABILITY ENVELOPE]\nPlausible size: ${envelope.plausibleSize}\nPlausible depth: ${envelope.plausibleDepth}\nCoping thickness: ${envelope.copingThickness}\nDeck/perimeter margins: ${envelope.deckMargins}\nGround-plane relation: ${envelope.groundPlaneRelation}${
      envelope.edgeHeight ? `\nEdge height: ${envelope.edgeHeight}` : ""
    }\nHouse/path relation: ${envelope.houseAndPathRelation}\nInfinity feasibility: ${envelope.infinityFeasibility}\nForbidden placements:\n${
      bullets([
        "floating or pasted-on pool shell",
        "pool crossing house walls, doors, thresholds, fences, major trees or non-target stairs",
        "oversized pool leaving no circulation in a compact garden",
        "infinity edge in a flat enclosed garden with no visual drop/view support",
        "water plane with no coping, depth, shadow or edge logic",
      ])
    }`,
    E: `[BLOCK E - REPLACEMENT MANIFEST]\nOperation: ${operation}\nAdditions:\n${
      bullets(
        additions.length
          ? additions
          : ["no additions unless explicitly selected"],
      )
    }\nReplacements:\n${
      bullets(
        replacements.length
          ? replacements
          : ["no replacement unless explicitly selected"],
      )
    }\nRecolors:\n${
      bullets(
        recolors.length ? recolors : ["no recolor unless explicitly selected"],
      )
    }\nRemovals:\n${
      bullets(
        removals.length ? removals : [
          "remove only incompatible elements if required by selected operation",
        ],
      )
    }\nConversion rules:\n${bullets(conversions)}\nPreserve exactly:\n${
      bullets(preserve)
    }`,
    F: `[BLOCK F - POOL GEOMETRY SPECIFICATION]\nPool typology: ${
      vasca ? poolType : keepOr(KEEP_EXISTING.typology, REMOVED_POOL.typology)
    }\nGeometry: ${technical.poolGeometry}\nInstallation type: ${
      !vasca
        ? keepOr(KEEP_EXISTING.installation, REMOVED_POOL.installation)
        : isAboveGround
        ? "premium above-ground / semi-inground / compact system with visible base and edge integration"
        : "in-ground pool inserted into terrain with believable excavation and coping"
    }\nScale rule: ${
      removePool
        ? REMOVED_POOL.scale
        : "pool must look proportionate to the photographed outdoor space, with readable basin walls/floor and no pasted-on footprint."
    }`,
    G: `[BLOCK G - WATER SYSTEM SPECIFICATION]\nWater system: ${
      vasca ? waterSystem : keepOr(KEEP_EXISTING.waterSystem, REMOVED_POOL.waterSystem)
    }\nRules: ${technical.waterSystem}${
      removePool
        ? ""
        : "\nNo hybrid ambiguity: skimmer, overflow and infinity-edge behavior must not be mixed unless explicitly selected."
    }`,
    H: `[BLOCK H - INTERIOR FINISH AND WATER LOOK]\nInterior finish: ${
      cambia("rivestimento")
        ? interiorFinish
        : keepOr(KEEP_EXISTING.interiorFinish, REMOVED_POOL.interiorFinish)
    }\nFinish behavior: ${technical.interiorFinish}\nWater look: ${technical.waterLook}\n${
      removePool
        ? REMOVED_POOL.waterNote
        : "Water must not be a flat blue fill; it must respond to finish, depth, sky, facade, vegetation, shadows and camera angle."
    }`,
    I: `[BLOCK I - ACCESS AND COMFORT FEATURES]\nAccess system: ${technical.access}\nAccessories:\n${
      bullets(
        !cambia("accessori")
          ? [KEEP_EXISTING.accessories]
          : technical.accessories.length
          ? technical.accessories
          : [
            "no extra water features, spa, shower or cover unless explicitly selected",
          ],
      )
    }\nLighting: ${technical.lighting}\nIf not selected, do not invent ladders, stairs, beach entry, jets, waterfalls, covers or resort furniture.`,
    J: `[BLOCK J - COPING AND SURROUNDING DECK RULES]\nCoping: ${technical.coping}\nSurrounding area: ${technical.deck}\nRules:\n${
      bullets(removePool ? [...REMOVED_POOL.copingRules] : [
        "coping must be visible with plausible thickness and clean continuous perimeter",
        "deck/lawn/patio transitions must have crisp material junctions, not AI-smudged edges",
        "cut lines, joints, slab/plank direction and grass cuts must follow perspective",
        "surrounding deck/paving must not randomly expand into non-target garden areas",
      ])
    }`,
    K: `[BLOCK K - WATER REALISM RULES]\n${bullets(waterRealism)}`,
    L: `[BLOCK L - INSTALLATION AND LANDSCAPE INTEGRATION RULES]\n${
      bullets([
        envelope.groundPlaneRelation,
        envelope.houseAndPathRelation,
        "no floating shell, no impossible excavation lines, no pool crossing non-target structures",
        "preserve trees and non-target landscape; adapt only pool footprint and immediate junctions",
        "poolside shadows, contact occlusion and water reflections must match original sun direction",
        installerNotes ? `installer notes (must be respected): ${installerNotes}` : null,
      ])
    }`,
    M: `[BLOCK M - REMOVAL / CONVERSION RULES]\n${
      bullets([
        ...removals,
        ...conversions,
        "if replacing an existing pool, remove old water plane, coping, deck scars, ladders, skimmers and incompatible details completely",
        "if recolor-only, do not alter pool geometry, footprint, coping or surrounding deck",
        "if changing coping only, do not alter basin geometry or water-system behavior",
        "do not leave hybrid old/new pool states",
      ])
    }`,
    N: `[BLOCK N - PROPERTY INTEGRITY]\n${bullets(preserve)}`,
    O: `[BLOCK O - PHOTOREALISM RULES]\n${
      bullets([
        "realistic pool materials, coping, deck, lawn and hardscape junctions",
        "realistic water behavior, reflections, transparency, depth gradient and shadowing",
        "realistic scale relative to house, paths, furniture and vegetation",
        "no warped geometry, no fake CGI resort look, premium residential architectural outdoor visualization quality",
      ])
    }`,
    P: `[BLOCK P - NEGATIVE CONSTRAINTS]\n${bullets(negative)}`,
    Q: `[BLOCK Q - QUALITY BAR]\n${
      bullets([
        "professional pool sales visualization",
        "same-property realism",
        "technically plausible pool insertion",
        "clearly recognizable selected pool system",
        "water, coping, deck transitions, shadows and contact occlusion must look photographic",
      ])
    }\nValidation: ${
      validation.is_valid ? "passed" : validation.warnings.join(" ")
    }`,
  };

  const userPrompt = [
    blocks.B,
    blocks.C,
    blocks.D,
    blocks.E,
    blocks.F,
    blocks.G,
    blocks.H,
    blocks.I,
    blocks.J,
    blocks.K,
    blocks.L,
    blocks.M,
    blocks.N,
    blocks.O,
    blocks.P,
    blocks.Q,
    notes ? `[ADDITIONAL USER NOTES]\n${notes}` : "",
  ].filter(Boolean).join("\n\n");

  return {
    systemPrompt: blocks.A,
    userPrompt,
    // 1.1: ambito per operazione, coerenza, quota e note tecniche, campi nuovi.
    // Nuova piscina e sostituzione coi campi nuovi vuoti: stesso testo della 1.0.
    promptVersion: "pool-v1.1.0",
    promptPayload: {
      scene_analysis: { inferred_from_photo: true, orientation },
      target_pool_insertion_map: targetMap,
      buildability_envelope: envelope,
      replacement_manifest: {
        operation,
        additions,
        replacements,
        recolors,
        removals,
        conversions,
        preserve,
      },
      pool_geometry_specification: {
        poolType,
        shape,
        size,
        install: isAboveGround ? "above_or_semi_inground" : "inground",
        ...(realSize ? { realSize } : {}),
        ...(edgeHeight ? { edgeHeight } : {}),
        ...(cladding ? { cladding: claddingKey } : {}),
      },
      water_system_specification: {
        waterSystem,
        description: technical.waterSystem,
      },
      interior_finish_specification: {
        interiorFinish,
        waterLook,
        description: technical.waterLook,
      },
      access_features_specification: { access, lighting, accessories },
      coping_deck_rules: {
        coping,
        deck,
        copingDescription: technical.coping,
        deckDescription: technical.deck,
      },
      water_realism_rules: waterRealism,
      property_integrity_constraints: preserve,
      validation,
    },
  };
}
