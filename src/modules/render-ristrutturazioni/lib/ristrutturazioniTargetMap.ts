import type {
  ConfigurazioneRistrutturazione,
  GlobalPreservationMap,
  GlobalSceneAnalysis,
  GlobalTargetMap,
  RenovationDomainId,
  RenovationSceneClass,
  TargetZoneItem,
} from "./types";

function uniq(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function zone(
  id: string,
  label: string,
  role: TargetZoneItem["role"],
  domains: RenovationDomainId[],
  description: string,
): TargetZoneItem {
  return { id, label, role, domains, description };
}

const ZONE_LIBRARY: Record<RenovationSceneClass, TargetZoneItem[]> = {
  bathroom: [
    zone("bathroom.shower_tub", "Doccia / vasca", "primary", ["bathroom"], "wet zone where bathtub removal, walk-in shower or new bathtub must be coordinated first"),
    zone("bathroom.tiled_walls", "Rivestimenti parete", "primary", ["bathroom"], "bathroom wall tile planes, including large slab scale and grout rhythm"),
    zone("bathroom.floor", "Pavimento bagno", "primary", ["floor", "bathroom"], "visible bathroom floor with perspective-locked tile or continuous surface geometry"),
    zone("bathroom.sanitary", "Sanitari", "secondary", ["bathroom"], "WC/bidet area, flush plate, cistern logic and wall/floor support rules"),
    zone("bathroom.vanity", "Mobile e specchio", "secondary", ["bathroom"], "vanity, basin, mirror and local lighting"),
    zone("bathroom.window_door", "Infissi e porta bagno", "untouched", [], "bathroom window/door frames unless explicitly targeted by another visible domain"),
  ],
  room: [
    zone("room.floor", "Pavimento", "primary", ["floor"], "full visible floor replacement before skirting adaptation"),
    zone("room.main_wall", "Parete principale", "primary", ["room"], "main wall / accent wall / wallpaper / cladding target"),
    zone("room.secondary_walls", "Pareti secondarie", "secondary", ["room"], "secondary walls remain untouched unless paint/cladding is selected for them"),
    zone("room.ceiling", "Soffitto", "secondary", ["room"], "ceiling and lighting fixtures"),
    zone("room.furniture", "Arredi", "secondary", ["room"], "furniture groups with color-only, same-layout or replacement rules"),
    zone("room.windows_curtains", "Finestre e tende", "secondary", ["room"], "curtain zones while preserving frames and exterior view"),
  ],
  kitchen_room: [
    zone("kitchen.floor", "Pavimento cucina", "primary", ["floor"], "visible kitchen/living floor replacement before skirting adaptation"),
    zone("kitchen.block", "Blocco cucina", "primary", ["room"], "cabinets, sink, hob, hood and appliances with technical anchor preservation"),
    zone("kitchen.walls", "Pareti cucina", "secondary", ["room"], "paint, backsplash or wallpaper only on selected planes"),
    zone("kitchen.lighting", "Illuminazione", "secondary", ["room"], "selected fixture type only"),
    zone("kitchen.openings", "Porte e finestre", "untouched", [], "openings preserved unless targeted"),
  ],
  facade: [
    zone("facade.full", "Facciata", "primary", ["facade"], "facade plaster, color, insulation, cladding or architectural detail target"),
    zone("facade.openings", "Infissi", "primary", ["windows", "generic_openings"], "visible window/door openings with reveal-depth coordination"),
    zone("facade.shutters", "Persiane / oscuranti", "secondary", ["shutters"], "shutters and exterior shading systems"),
    zone("facade.roof_edge", "Tetto visibile", "secondary", ["roof"], "roof planes/eaves only if visible in the photo"),
    zone("facade.context", "Contesto esterno", "untouched", [], "sky, road, vegetation, neighboring buildings and non-target facade details"),
  ],
  mixed_exterior_envelope: [
    zone("envelope.facade_plane", "Piano facciata", "primary", ["facade"], "plaster/insulation/cladding envelope layer applied before openings"),
    zone("envelope.opening_reveals", "Imbotti e infissi", "primary", ["windows", "generic_openings"], "opening depth and window replacement adapted to facade layer"),
    zone("envelope.shutters", "Persiane", "secondary", ["shutters"], "shutters adapted to final opening/reveal geometry"),
    zone("envelope.roof", "Tetto e lattonerie", "secondary", ["roof"], "roof only if visible and explicitly in scope"),
    zone("envelope.untouched_context", "Contesto", "untouched", [], "same building identity, sky, street, vegetation and non-target elements"),
  ],
  roof: [
    zone("roof.main_slope", "Falda principale", "primary", ["roof"], "main visible roof plane"),
    zone("roof.secondary_slope", "Falde secondarie", "secondary", ["roof"], "secondary visible slopes if selected"),
    zone("roof.accessories", "Accessori tetto", "secondary", ["roof"], "gutters, skylights, chimneys, photovoltaic only if selected"),
    zone("roof.facade_context", "Facciata sottostante", "untouched", [], "facade, windows and context remain unchanged"),
  ],
  outdoor: [
    zone("outdoor.site_lock", "Area esterna", "primary", ["garden", "exterior_flooring"], "terrain, patio or deck target area lock"),
    zone("outdoor.pool", "Piscina", "primary", ["pool"], "pool footprint and excavation/integration zone"),
    zone("outdoor.deck_coping", "Deck / coping", "secondary", ["pool", "exterior_flooring"], "deck, coping and immediate pool perimeter after pool footprint"),
    zone("outdoor.pergola", "Pergola", "secondary", ["pergola"], "pergola installation after site logic and footprint constraints"),
    zone("outdoor.context", "Casa e giardino non target", "untouched", [], "house facade, non-target garden, sky, walls and neighboring context"),
  ],
  mixed_interior_room: [],
  unknown: [
    zone("unknown.primary", "Zona principale", "ambiguous", [], "ambiguous target area requires explicit scene classification before generation"),
    zone("unknown.context", "Contesto", "untouched", [], "preserve all non-target visible elements"),
  ],
};

ZONE_LIBRARY.mixed_interior_room = ZONE_LIBRARY.room;

function addUserZones(config: ConfigurazioneRistrutturazione, zones: TargetZoneItem[]): TargetZoneItem[] {
  const userZones = (config.requestedChanges ?? [])
    .filter((change) => change.targetZone)
    .map((change, index) => zone(
      `user.${index}.${change.targetZone}`,
      change.targetZone ?? "Target utente",
      "primary",
      change.domain ? [change.domain] : [],
      change.specification || `User requested ${change.action} on ${change.targetZone}`,
    ));
  return [...zones, ...userZones];
}

export function buildGlobalTargetMap(
  scene: GlobalSceneAnalysis,
  config: ConfigurazioneRistrutturazione,
): GlobalTargetMap {
  const active = new Set(config.activeDomains);
  const baseZones = addUserZones(config, ZONE_LIBRARY[scene.sceneClass] ?? ZONE_LIBRARY.unknown);
  const allZones = baseZones.map((item) => {
    if (item.role === "untouched" || item.role === "forbidden" || item.role === "ambiguous") return item;
    const hasActiveDomain = item.domains.some((domain) => active.has(domain));
    return hasActiveDomain ? item : { ...item, role: "untouched" as const };
  });

  const forbiddenZones = [
    ...allZones.filter((item) => item.role === "forbidden"),
    ...scene.nonVisibleDomains.map((domain) => zone(
      `forbidden.${domain}`,
      `Dominio non visibile: ${domain}`,
      "forbidden",
      [domain],
      `${domain} is not visible in this single-photo scene and must not be hallucinated`,
    )),
  ];

  return {
    primaryTargetZones: allZones.filter((item) => item.role === "primary"),
    secondaryTargetZones: allZones.filter((item) => item.role === "secondary"),
    supportingZones: allZones.filter((item) => item.role === "supporting"),
    untouchedZones: allZones.filter((item) => item.role === "untouched"),
    forbiddenZones,
    ambiguousZones: allZones.filter((item) => item.role === "ambiguous"),
    allZones: [...allZones, ...forbiddenZones],
  };
}

export function buildGlobalPreservationMap(
  scene: GlobalSceneAnalysis,
  config: ConfigurazioneRistrutturazione,
): GlobalPreservationMap {
  const requestedPreserve = config.preserve ?? [];
  const colorOnlyDomains = config.activeDomains.filter((domain) => {
    const domainConfig = config.domainConfigs?.[domain];
    return domainConfig?.operation === "recolor_only" ||
      domainConfig?.operazione === "solo_colore" ||
      domainConfig?.action === "color_only";
  });

  return {
    preserveExactly: uniq([
      "same photographed identity",
      "same image crop and aspect ratio",
      ...scene.untouchableElements,
      ...requestedPreserve,
    ]),
    preserveGeometry: uniq([
      "same architecture shell",
      "same openings and structural proportions",
      ...colorOnlyDomains.map((domain) => `${domain} geometry in recolor-only mode`),
    ]),
    preservePosition: uniq([
      "same camera position",
      "same position of non-target furniture and objects",
      "same position of non-target windows, doors and fixtures",
    ]),
    preserveMaterial: uniq([
      "non-target materials and finishes",
      ...colorOnlyDomains.map((domain) => `${domain} underlying material geometry and detail`),
    ]),
    preserveShape: uniq([
      "non-target object shapes",
      "non-target openings",
      "non-target furniture silhouettes",
    ]),
    preserveContext: uniq([
      ...scene.environmentContext,
      "same surrounding context",
      "no invented exterior/interior context outside the visible photo",
    ]),
    preserveImageDimensions: ["same width", "same height", "same aspect ratio", "no crop change"],
    preservePerspective: ["same vanishing points", "same lens feel", "same perspective scale"],
  };
}
