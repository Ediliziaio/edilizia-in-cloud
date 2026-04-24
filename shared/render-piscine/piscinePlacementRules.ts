import type {
  ConfigurazionePiscine,
  PiscinaBuildabilityEnvelope,
  PiscinaSceneAnalysis,
  PiscinaTargetAreaMap,
} from "./types.ts";

const ZONE_DESCRIPTIONS: Record<string, string> = {
  giardino_centrale: "central garden area, with the pool integrated into lawn/landscape and circulation preserved",
  laterale_casa: "side area near the house, keeping facade doors/windows and technical clearances intact",
  vicino_patio: "area adjacent to the patio/deck, with clean transition from hardscape to pool coping",
  bordo_terrazza: "terrace-edge area, respecting parapet/railing and visible level constraints",
  dietro_casa: "backyard area behind the house, preserving garden boundaries and access paths",
  vista_panoramica: "panoramic-view edge, only using infinity/overflow logic if terrain/view makes it plausible",
  plunge_compatta: "compact zone suitable for a plunge pool or mini pool without oversizing",
  rooftop_terrazza: "rooftop/terrace-compatible zone only if the photo clearly supports terrace pool plausibility",
  custom: "user-described pool insertion zone",
};

function infinityFeasibility(config: ConfigurazionePiscine, scene: PiscinaSceneAnalysis): PiscinaBuildabilityEnvelope["infinityFeasibility"] {
  const context = `${config.inserimento.zona} ${config.inserimento.posizione_descrittiva ?? ""} ${scene.topographyAndLevels}`.toLowerCase();
  if (
    context.includes("senza vista") ||
    context.includes("senza disliv") ||
    context.includes("flat enclosed") ||
    context.includes("piatto chiuso") ||
    context.includes("nessun disliv")
  ) {
    return config.piscina.sistema_bordo === "infinity_edge" ? "limited" : "not_plausible";
  }
  if (context.includes("panoram") || context.includes("vista") || context.includes("terraz") || context.includes("disliv") || context.includes("slope") || context.includes("edge")) {
    return "plausible";
  }
  return config.piscina.sistema_bordo === "infinity_edge" ? "limited" : "not_plausible";
}

function rooftopFeasibility(config: ConfigurazionePiscine, scene: PiscinaSceneAnalysis): PiscinaBuildabilityEnvelope["rooftopFeasibility"] {
  const context = `${config.inserimento.zona} ${scene.outdoorAreaType} ${scene.topographyAndLevels}`.toLowerCase();
  return context.includes("terraz") || context.includes("rooftop") || config.inserimento.zona === "rooftop_terrazza"
    ? "plausible"
    : "not_plausible";
}

export function buildPiscinaTargetAreaMap(
  config: ConfigurazionePiscine,
  scene: PiscinaSceneAnalysis,
): PiscinaTargetAreaMap {
  const zone = config.inserimento.zona;
  const targetDescription = zone === "custom" && config.inserimento.posizione_descrittiva
    ? config.inserimento.posizione_descrittiva
    : ZONE_DESCRIPTIONS[zone];

  return {
    zone,
    targetDescription,
    footprint: `${config.piscina.dimensione_apparente.replace(/_/g, " ")} ${config.piscina.forma.replace(/_/g, " ")} footprint; width ${config.inserimento.larghezza_apparente ?? "media"}, length ${config.inserimento.lunghezza_apparente ?? "media"}; scaled to visible outdoor area and never oversized`,
    orientation: "align the pool long axis and coping lines to the photographed perspective, main garden/patio geometry and visible vanishing points",
    leftRightLimits: "pool stays inside the selected usable area, leaving realistic margins to walls, trees, facade, fences, parapets and paths",
    frontBackLimits: "front/back pool edges follow the ground plane and leave walkable circulation around at least the visible sides",
    circulationMargins: [
      "keep a plausible walking strip around visible pool edges",
      "do not block doors, windows, paths, stairs, gate access or existing patio circulation",
      "do not invade mature trees, walls, fences or neighboring property",
    ],
    preservedAdjacentAreas: [
      scene.houseAndFacade,
      "non-target lawn/deck/paving remains unchanged",
      "trees, boundaries, furniture and context outside the pool/deck junction stay intact",
    ],
    noExcavationZones: [
      "through house facade or thresholds",
      "through mature tree trunks",
      "through fences, retaining walls or neighbor property",
      "over stairs or paths unless user explicitly selected replacement",
      "in terrace/rooftop scenes unless compact terrace pool is visually plausible",
    ],
    mainViewAxis: "preserve original camera axis; pool geometry must recede with the same perspective and image crop",
  };
}

export function buildPiscinaBuildabilityEnvelope(
  config: ConfigurazionePiscine,
  scene: PiscinaSceneAnalysis,
  target: PiscinaTargetAreaMap,
): PiscinaBuildabilityEnvelope {
  const isAboveGround = ["fuori_terra_premium", "semi_incassata", "terrazzo_compatta", "minipiscina"].includes(config.piscina.tipo);
  const infinity = infinityFeasibility(config, scene);
  const rooftop = rooftopFeasibility(config, scene);

  return {
    plausibleSize: `${target.footprint}; pool must fit the available visual area with realistic poolside clearance and must not dominate the entire garden unless explicitly compact/large context supports it`,
    plausibleDepth: `${config.inserimento.profondita_apparente ?? "standard"} apparent depth; show believable water depth gradient, floor visibility and wall/floor junctions`,
    copingThickness: "visible coping thickness must be plausible: neither a paper-thin outline nor an oversized artificial slab",
    deckMargins: `${config.finiture.area_perimetrale.replace(/_/g, " ")} perimeter must create clean transitions to lawn/patio/deck with crisp, buildable edges`,
    groundPlaneRelation: isAboveGround
      ? "premium above-ground/semi-inground relation: show base/cladding/support/deck integration so the pool does not look temporary or pasted on"
      : "in-ground relation: basin and coping are integrated into the ground plane with believable excavation, no floating shell",
    houseAndPathRelation: config.inserimento.rapporto_con_casa || "pool respects house access, paths, doors/windows and outdoor circulation",
    infinityFeasibility: infinity,
    rooftopFeasibility: rooftop,
    forbiddenPlacements: [
      "floating or pasted-on pool shell",
      "pool crossing house walls, doors, thresholds, fences, major trees or non-target stairs",
      "oversized pool that leaves no circulation in a compact garden",
      "infinity edge in a flat enclosed garden with no visual drop/view support",
      "rooftop/terrace pool where parapet, load or terrace context is not visually plausible",
      "water plane with no coping, depth, shadow or edge logic",
    ],
  };
}
