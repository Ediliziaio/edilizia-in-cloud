import type {
  ConfigurazioneRistrutturazione,
  DomainDependency,
  DomainSpecBuildResult,
  DomainValidationResult,
  RenovationActionType,
  RenovationDomainAdapter,
  RenovationDomainId,
} from "./types";

function hasText(config: ConfigurazioneRistrutturazione, pattern: RegExp, domain?: RenovationDomainId): boolean {
  const values = [
    config.notes,
    ...(config.requestedChanges ?? [])
      .filter((change) => !domain || change.domain === domain)
      .flatMap((change) => [change.targetZone, change.object, change.specification]),
  ].filter(Boolean).join(" ");
  return pattern.test(values);
}

function domainConfig(config: ConfigurazioneRistrutturazione, domain: RenovationDomainId): Record<string, unknown> {
  return config.domainConfigs?.[domain] ?? {};
}

function boolValue(source: Record<string, unknown>, keys: string[]): boolean {
  return keys.some((key) => source[key] === true || source[key] === "true" || source[key] === "yes");
}

function stringValue(source: Record<string, unknown>, keys: string[], fallback: string): string {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return fallback;
}

function actionFromSpec(spec: DomainSpecBuildResult): RenovationActionType | "mixed" {
  const activeKinds = [
    spec.additions.length ? "add" : "",
    spec.removals.length ? "remove" : "",
    spec.replacements.length ? "replace" : "",
    spec.recolors.length ? "recolor" : "",
  ].filter(Boolean);
  return activeKinds.length === 1 ? activeKinds[0] as RenovationActionType : "mixed";
}

function validation(errors: string[] = [], warnings: string[] = []): DomainValidationResult {
  return { isValid: errors.length === 0, errors, warnings };
}

function spec(input: Omit<DomainSpecBuildResult, "active" | "actionType" | "validation"> & {
  validation?: DomainValidationResult;
}): DomainSpecBuildResult {
  const built: DomainSpecBuildResult = {
    ...input,
    active: true,
    actionType: "mixed",
    validation: input.validation ?? validation(),
  };
  return { ...built, actionType: actionFromSpec(built) };
}

function genericDeps(id: RenovationDomainId): DomainDependency[] {
  return [{
    from: id,
    to: id,
    kind: "preserves",
    reason: "domain adapter preserves non-target geometry and context by default",
  }];
}

export const bathroomAdapter: RenovationDomainAdapter<ConfigurazioneRistrutturazione> = {
  id: "bathroom",
  canHandle: (scene) => scene.allowedDomains.includes("bathroom"),
  buildDomainSpec(scene, config) {
    const raw = domainConfig(config, "bathroom");
    const removeTub = boolValue(raw, ["removeTub", "remove_tub", "rimuovi_vasca"]) ||
      hasText(config, /remove.*bathtub|rimuov.*vasca|vasca rimossa|no vasca/i, "bathroom");
    const walkIn = boolValue(raw, ["walkInShower", "doccia_walk_in"]) ||
      hasText(config, /walk.?in|doccia walk|doccia.*aperta/i, "bathroom");
    const wallHungSanitary = boolValue(raw, ["wallHungSanitary", "sanitari_sospesi"]) ||
      hasText(config, /wall.?hung sanitary|sanitari sospesi|wc sospeso/i, "bathroom");
    const wallHungVanity = boolValue(raw, ["wallHungVanity", "mobile_sospeso"]) ||
      hasText(config, /wall.?hung vanity|mobile sospeso|vanity sospes/i, "bathroom");
    const flushPlate = stringValue(raw, ["flushPlate", "piastra_wc"], wallHungSanitary ? "slim rectangular wall flush plate" : "");
    const wallFinish = stringValue(raw, ["wallTiles", "rivestimento_pareti"], "selected bathroom wall finish");
    const floorFinish = stringValue(raw, ["floor", "pavimento"], "selected bathroom floor finish");

    return spec({
      id: "bathroom",
      intent: "coordinate bathroom renovation systems inside the same photographed bathroom",
      affectedZones: ["bathroom.shower_tub", "bathroom.tiled_walls", "bathroom.sanitary", "bathroom.vanity"],
      additions: [
        walkIn ? "true walk-in shower with open fixed glass panel, credible tray or flush-to-floor zone and visible shower fittings" : "",
        wallHungSanitary ? `wall-hung WC/bidet system with concealed in-wall cistern and ${flushPlate}` : "",
        wallHungVanity ? "wall-hung bathroom vanity with selected basin, top, mirror and lighting specification" : "",
      ].filter(Boolean),
      removals: [
        removeTub ? "remove existing bathtub completely before installing the new shower or freestanding tub system" : "",
      ].filter(Boolean),
      replacements: [
        `replace bathroom wall surfaces with ${wallFinish}`,
        `replace bathroom floor surfaces with ${floorFinish}`,
      ],
      recolors: [],
      preserveExactly: ["bathroom window/door frames unless explicitly targeted", "room geometry and camera perspective"],
      preserveGeometry: ["same bathroom shell", "same wall/floor/ceiling planes", "same visible openings"],
      conversionRules: [
        removeTub && walkIn ? "bathtub removal must happen before walk-in shower installation; no tub remnants, tub faucet or tub edge may remain" : "",
        wallHungSanitary ? "WC must not keep a bulky exposed ceramic tank; use concealed wall cistern and slim flush plate" : "",
      ].filter(Boolean),
      incompatibilityRules: [
        "do not mix removed bathtub and new shower as a hybrid state",
        "do not move windows, doors or walls",
        "large selected slabs must remain visibly large, with very few long joints and no small-tile drift",
      ],
      domainPromptBlocks: {
        summary: "Bathroom appendix: perform only the selected bathroom renovation while preserving same bathroom identity.",
        technical: [
          wallFinish,
          floorFinish,
          walkIn ? "Walk-in shower must read as walk-in, not a generic closed shower box." : "",
          wallHungSanitary ? `Sanitary ware must read as wall-hung with ${flushPlate}.` : "",
        ].filter(Boolean).join(" "),
      },
      validation: validation(scene.sceneClass === "bathroom" ? [] : ["bathroom domain is only valid in bathroom scene class"]),
    });
  },
  getDependencies: (domainSpec) => [
    ...genericDeps("bathroom"),
    ...(domainSpec.removals.length ? [{
      from: "bathroom" as const,
      to: "bathroom" as const,
      kind: "must_run_before" as const,
      reason: "bathroom demolition/removal precedes new fixtures and surfaces",
    }] : []),
  ],
  validate: (_scene, _config, builtSpec) => builtSpec.validation,
};

export const floorAdapter: RenovationDomainAdapter<ConfigurazioneRistrutturazione> = {
  id: "floor",
  canHandle: (scene) => scene.allowedDomains.includes("floor"),
  buildDomainSpec(_scene, config) {
    const raw = domainConfig(config, "floor");
    const material = stringValue(raw, ["material", "materiale"], hasText(config, /parquet/i, "floor") ? "parquet" : "selected new floor material");
    const pattern = stringValue(raw, ["pattern", "posa"], hasText(config, /spina di pesce|herringbone/i, "floor") ? "herringbone" : "selected laying pattern");
    const skirting = stringValue(raw, ["skirting", "battiscopa"], "adapt skirting according to selected configuration");
    const colorOnly = raw.operation === "recolor_only" || raw.action === "color_only";

    return spec({
      id: "floor",
      intent: colorOnly ? "refinish visible floor only without geometric replacement" : "replace visible floor with perspective-locked material geometry",
      affectedZones: ["room.floor", "bathroom.floor", "kitchen.floor", "outdoor.deck_coping"],
      additions: [],
      removals: colorOnly ? [] : ["remove all visible traces of old floor pattern where the new floor is installed"],
      replacements: colorOnly ? [] : [`replace visible floor with ${material}, ${pattern}, correct module scale, joints and perspective`],
      recolors: colorOnly ? [`change only the apparent floor color/finish to ${material}`] : [],
      preserveExactly: ["walls", "ceiling", "doors", "windows", "non-target furniture and objects"],
      preserveGeometry: ["floor perimeter geometry", "furniture/object positions", "camera perspective"],
      conversionRules: [
        "floor replacement must happen before skirting adaptation",
        "furniture remains in place; adapt only contact shadows and occlusion on the new floor",
        colorOnly ? "geometry preserved; no new floor pattern, no object movement" : "",
      ].filter(Boolean),
      incompatibilityRules: [
        "do not alter wall color, ceiling, furniture, doors or windows",
        "do not leave hybrid old/new floor patches",
      ],
      domainPromptBlocks: {
        summary: "Floor appendix: same-room surgical floor replacement/refinish.",
        technical: `New floor: ${material}; laying pattern: ${pattern}; skirting rule: ${skirting}; preserve all furniture geometry and position.`,
      },
    });
  },
  getDependencies: () => [{
    from: "floor",
    to: "room",
    kind: "must_run_before",
    reason: "floor replacement before furniture restyling and skirting adaptation",
  }],
  validate: (_scene, _config, builtSpec) => builtSpec.validation,
};

export const roomAdapter: RenovationDomainAdapter<ConfigurazioneRistrutturazione> = {
  id: "room",
  canHandle: (scene) => scene.allowedDomains.includes("room"),
  buildDomainSpec(_scene, config) {
    const raw = domainConfig(config, "room");
    const style = stringValue(raw, ["style", "stile"], "selected target interior style");
    const furnitureMode = stringValue(raw, ["furnitureMode", "arredo"], hasText(config, /color.only|solo colore|solo finitura/i, "room") ? "color-only" : "same-layout style refresh");
    const lighting = stringValue(raw, ["lighting", "illuminazione"], "selected lighting fixture type");
    const accentWall = stringValue(raw, ["accentWall", "parete_accento"], "selected wall planes only");

    return spec({
      id: "room",
      intent: "same-room interior restyling without changing architecture",
      affectedZones: ["room.main_wall", "room.secondary_walls", "room.ceiling", "room.furniture", "room.windows_curtains"],
      additions: [`install/adjust lighting only as selected: ${lighting}`],
      removals: hasText(config, /remove curtains|rimuovi tende/i, "room") ? ["remove selected curtains and curtain hardware while preserving windows and exterior view"] : [],
      replacements: furnitureMode.includes("full")
        ? [`replace selected furniture groups in ${style} style while preserving room function and circulation`]
        : [`restyle room toward ${style} while preserving the same photographed room identity`],
      recolors: furnitureMode.includes("color") ? ["refinish existing furniture color/material appearance only"] : [],
      preserveExactly: ["windows and doors", "room proportions", "non-target decor", "exterior view"],
      preserveGeometry: furnitureMode.includes("color")
        ? ["furniture geometry and position", "same furniture footprint", "same circulation"]
        : ["same room shell", "same openings", "same perspective"],
      conversionRules: [
        `wall/color/wallpaper changes apply only to ${accentWall}`,
        furnitureMode.includes("color") ? "furniture color-only mode preserves geometry and position; change only finish/material appearance" : "style refresh keeps main furniture footprints and functional anchors",
        "lighting fixtures must match selected fixture type; no unrelated chandelier invention",
      ],
      incompatibilityRules: [
        "do not generate a different room",
        "do not move windows, doors, walls or ceiling",
        "do not change non-target furniture",
      ],
      domainPromptBlocks: {
        summary: "Room appendix: same-room redesign, never different-room generation.",
        technical: `Target style: ${style}. Furniture mode: ${furnitureMode}. Lighting: ${lighting}.`,
      },
    });
  },
  getDependencies: () => [{
    from: "room",
    to: "floor",
    kind: "must_run_after",
    reason: "room restyling respects floor and skirting result when floor is active",
  }],
  validate: (_scene, _config, builtSpec) => builtSpec.validation,
};

export const facadeAdapter: RenovationDomainAdapter<ConfigurazioneRistrutturazione> = {
  id: "facade",
  canHandle: (scene) => scene.allowedDomains.includes("facade"),
  buildDomainSpec(_scene, config) {
    const raw = domainConfig(config, "facade");
    const insulation = boolValue(raw, ["insulation", "cappotto"]) || hasText(config, /cappotto|thermal insulation|insulation/i, "facade");
    const finish = stringValue(raw, ["finish", "intonaco"], "selected facade plaster/finish");
    const color = stringValue(raw, ["color", "colore"], "selected facade color");
    const base = stringValue(raw, ["baseCourse", "zoccolatura"], "selected base course if active");

    return spec({
      id: "facade",
      intent: insulation ? "renovate facade envelope with insulation and coordinated reveals" : "renovate only selected facade surfaces/details",
      affectedZones: ["facade.full", "envelope.facade_plane", "facade.openings"],
      additions: insulation ? ["thermal insulation package with deeper reveals, extended sills, edge profiles and coherent drain/flashing details"] : [],
      removals: raw.removeCornices ? ["remove existing window cornices and restore wall seamlessly"] : [],
      replacements: [`apply ${finish} and ${color} only to selected facade zones`, base !== "selected base course if active" ? `apply base course / zoccolatura: ${base}` : ""].filter(Boolean),
      recolors: raw.operation === "recolor_only" ? [`facade repaint only: ${color}`] : [],
      preserveExactly: ["window sizes", "door positions", "roof silhouette unless roof domain is active", "sky and context"],
      preserveGeometry: insulation ? ["building proportions", "opening positions; reveal depth may adapt to insulation"] : ["facade geometry and opening depths"],
      conversionRules: [
        insulation ? "facade insulation modifies reveal depth first; windows and shutters must adapt to the new reveal logic" : "no new depth or cladding if only repaint is selected",
        "if only railings are repainted, preserve railing design and balcony geometry",
      ],
      incompatibilityRules: [
        "do not invent new balconies, openings or decorative elements",
        "do not change windows unless windows domain is active",
      ],
      domainPromptBlocks: {
        summary: "Facade appendix: same-building facade renovation.",
        technical: `Facade finish: ${finish}. Color: ${color}. Insulation active: ${insulation ? "yes with reveal-depth logic" : "no unless selected"}.`,
      },
    });
  },
  getDependencies: () => [{
    from: "facade",
    to: "windows",
    kind: "must_run_before",
    reason: "facade envelope/reveal logic must be established before windows and shutters are rendered",
  }],
  validate: (_scene, _config, builtSpec) => builtSpec.validation,
};

export const windowsAdapter: RenovationDomainAdapter<ConfigurazioneRistrutturazione> = {
  id: "windows",
  canHandle: (scene) => scene.allowedDomains.includes("windows") || scene.allowedDomains.includes("generic_openings"),
  buildDomainSpec(_scene, config) {
    const raw = domainConfig(config, "windows");
    const material = stringValue(raw, ["material", "materiale"], "selected window material");
    const color = stringValue(raw, ["color", "colore"], "selected frame color/finish");
    const opening = stringValue(raw, ["typology", "tipologia"], "selected window typology");

    return spec({
      id: "windows",
      intent: "replace/refinish visible windows while preserving building openings and facade identity",
      affectedZones: ["facade.openings", "envelope.opening_reveals"],
      additions: [],
      removals: raw.motorizedShutter ? ["remove manual shutter belts, wall belt boxes and obsolete manual accessories where incompatible"] : [],
      replacements: [`install ${opening} windows in ${material}, ${color}, adapted to final reveal depth`],
      recolors: raw.operation === "recolor_only" ? [`recolor/refinish frames only to ${color}`] : [],
      preserveExactly: ["opening sizes", "sills unless targeted", "non-target facade"],
      preserveGeometry: ["same window openings", "same camera perspective", "same exterior/interior view unless glass realism requires minor reflection treatment"],
      conversionRules: [
        "window replacement must not resize or move openings",
        "if facade insulation is active, window/reveal edges follow the new depth logic",
        raw.motorizedShutter ? "motorized shutter means no visible manual belt or wall belt box remains" : "",
      ].filter(Boolean),
      incompatibilityRules: ["do not alter non-target openings", "do not redesign the room or facade around the windows"],
      domainPromptBlocks: {
        summary: "Openings appendix: surgical window/door replacement.",
        technical: `Window specification: ${opening}, ${material}, ${color}; preserve exact opening geometry and adapt to facade reveal logic.`,
      },
    });
  },
  getDependencies: () => [{
    from: "windows",
    to: "facade",
    kind: "must_run_after",
    reason: "window appearance adapts to facade reveal/depth when facade domain is active",
  }],
  validate: (_scene, _config, builtSpec) => builtSpec.validation,
};

export const shuttersAdapter: RenovationDomainAdapter<ConfigurazioneRistrutturazione> = {
  id: "shutters",
  canHandle: (scene) => scene.allowedDomains.includes("shutters"),
  buildDomainSpec(_scene, config) {
    const raw = domainConfig(config, "shutters");
    const type = stringValue(raw, ["type", "tipologia"], "selected shutter type");
    const operation = stringValue(raw, ["operation", "operazione"], "replace");
    const color = stringValue(raw, ["color", "colore"], "selected shutter finish");

    return spec({
      id: "shutters",
      intent: operation === "recolor_only" ? "recolor existing shutters only" : "replace or add selected exterior shutters/solar shading",
      affectedZones: ["facade.shutters", "envelope.shutters"],
      additions: operation === "add" ? [`add ${type} shutters with realistic hinges, mounting and opening state`] : [],
      removals: operation === "remove" ? ["remove shutters, hinges, tracks, hold-open hardware and patch former anchor points"] : [],
      replacements: operation !== "recolor_only" && operation !== "remove" ? [`replace existing shutters with ${type}, ${color}, physically plausible hardware`] : [],
      recolors: operation === "recolor_only" ? [`change only shutter finish to ${color}; preserve geometry, hardware and opening state`] : [],
      preserveExactly: ["window glass and frames unless windows domain is active", "non-target openings", "wall texture outside anchor patches"],
      preserveGeometry: operation === "recolor_only" ? ["exact shutter geometry and hardware"] : ["same openings and facade plane"],
      conversionRules: [
        "remove incompatible old shutter construction details before showing the new system",
        "if recolor-only, do not alter shutter geometry, type, opening angle or hardware",
      ],
      incompatibilityRules: ["do not leave mixed old/new shutter systems on the same opening", "do not alter untouched windows"],
      domainPromptBlocks: {
        summary: "Shutters appendix: exterior shutter conversion with same facade identity.",
        technical: `Operation: ${operation}; type: ${type}; finish: ${color}; hardware and opening state must match the selected system.`,
      },
    });
  },
  getDependencies: () => [{
    from: "shutters",
    to: "windows",
    kind: "must_run_after",
    reason: "shutters align to final opening/window/reveal geometry",
  }],
  validate: (_scene, _config, builtSpec) => builtSpec.validation,
};

export const roofAdapter: RenovationDomainAdapter<ConfigurazioneRistrutturazione> = {
  id: "roof",
  canHandle: (scene) => scene.allowedDomains.includes("roof") && !scene.nonVisibleDomains.includes("roof"),
  buildDomainSpec(scene, config) {
    const raw = domainConfig(config, "roof");
    const covering = stringValue(raw, ["covering", "manto"], "selected roof covering");
    const operation = stringValue(raw, ["operation", "intervento"], "replace roof covering only");
    const errors = scene.nonVisibleDomains.includes("roof") ? ["roof is not visible in this source photo"] : [];

    return spec({
      id: "roof",
      intent: "roof renovation only on visible roof planes",
      affectedZones: ["facade.roof_edge", "envelope.roof", "roof.main_slope"],
      additions: raw.photovoltaic ? ["add photovoltaic only on selected visible roof slope with realistic mounting"] : [],
      removals: raw.removeSkylight ? ["remove selected skylight and restore continuous roof covering"] : [],
      replacements: operation === "recolor_only" ? [] : [`apply ${covering} to selected visible roof slopes only`],
      recolors: operation === "recolor_only" ? [`recolor roof covering only to ${covering}; preserve roof geometry and accessories`] : [],
      preserveExactly: ["facade", "windows", "non-target roof accessories", "sky and context"],
      preserveGeometry: ["same roof shape", "same ridge/eaves/slope geometry", "same building proportions"],
      conversionRules: [
        "roof domain is valid only if roof planes are visible in the photo",
        "roof recolor does not alter skylight, chimney or gutter geometry",
      ],
      incompatibilityRules: ["do not invent a roof in an interior photo", "do not alter facade unless facade domain is active"],
      domainPromptBlocks: {
        summary: "Roof appendix: visible-slope roof renovation only.",
        technical: `Roof operation: ${operation}; covering/finish: ${covering}; preserve roof geometry and non-target accessories.`,
      },
      validation: validation(errors),
    });
  },
  getDependencies: () => genericDeps("roof"),
  validate: (_scene, _config, builtSpec) => builtSpec.validation,
};

export const poolAdapter: RenovationDomainAdapter<ConfigurazioneRistrutturazione> = {
  id: "pool",
  canHandle: (scene) => scene.allowedDomains.includes("pool"),
  buildDomainSpec(_scene, config) {
    const raw = domainConfig(config, "pool");
    const type = stringValue(raw, ["type", "tipo"], "selected pool system");
    const coping = stringValue(raw, ["coping", "bordo"], "selected coping/deck transition");
    return spec({
      id: "pool",
      intent: "insert or replace a buildable pool in the same outdoor photo",
      affectedZones: ["outdoor.pool", "outdoor.deck_coping"],
      additions: [`add ${type} with integrated basin, water system, coping and realistic landscape junctions`],
      removals: raw.replaceExisting ? ["remove old pool basin, water plane, coping and incompatible deck scars"] : [],
      replacements: [`coordinate pool footprint first, then coping/deck second: ${coping}`],
      recolors: raw.operation === "recolor_only" ? ["change water/interior finish only; preserve exact pool geometry"] : [],
      preserveExactly: ["house facade", "non-target garden", "trees", "walls/fences", "sky and neighboring context"],
      preserveGeometry: ["outdoor perspective", "non-target hardscape", "main circulation paths"],
      conversionRules: [
        "pool footprint/site logic must be locked before deck/coping adaptation",
        "water must be physically plausible, not a flat blue overlay",
      ],
      incompatibilityRules: ["do not float pool above ground", "do not invent resort landscaping outside selected scope"],
      domainPromptBlocks: {
        summary: "Pool appendix: buildable same-property pool insertion.",
        technical: `Pool type: ${type}; coping/deck: ${coping}; water realism and ground integration are mandatory.`,
      },
    });
  },
  getDependencies: () => [{
    from: "pool",
    to: "exterior_flooring",
    kind: "must_run_before",
    reason: "pool footprint first, deck/coping/exterior floor transitions second",
  }],
  validate: (_scene, _config, builtSpec) => builtSpec.validation,
};

export const pergolaAdapter: RenovationDomainAdapter<ConfigurazioneRistrutturazione> = {
  id: "pergola",
  canHandle: (scene) => scene.allowedDomains.includes("pergola"),
  buildDomainSpec(_scene, config) {
    const raw = domainConfig(config, "pergola");
    const type = stringValue(raw, ["type", "tipo"], "selected pergola system");
    const cover = stringValue(raw, ["cover", "copertura"], "selected cover system");
    return spec({
      id: "pergola",
      intent: "install a technically plausible pergola after outdoor site constraints are established",
      affectedZones: ["outdoor.pergola"],
      additions: [`add ${type} pergola with ${cover}, credible posts, beams, anchoring, drainage and shadows`],
      removals: raw.replaceAwning ? ["remove old awning, brackets, arms, cassette and patch facade before pergola installation"] : [],
      replacements: [],
      recolors: raw.operation === "recolor_only" ? ["recolor pergola structure only; preserve footprint, posts and cover geometry"] : [],
      preserveExactly: ["house facade outside mounting line", "doors/windows operation", "paving outside footprint", "pool edge if present"],
      preserveGeometry: ["post positions if recolor-only", "same patio/garden perspective"],
      conversionRules: [
        "pergola installs after site/pool/deck logic so posts do not collide with pool, doors, parapets or circulation paths",
        "wall-mounted pergola requires explicit facade attachment; freestanding pergola requires independent post anchoring",
      ],
      incompatibilityRules: ["no floating posts", "no collision with shutters/windows", "no unrelated outdoor staging"],
      domainPromptBlocks: {
        summary: "Pergola appendix: buildable outdoor structure insertion.",
        technical: `Pergola type: ${type}; cover: ${cover}; installation must show credible anchoring, drainage and clearance.`,
      },
    });
  },
  getDependencies: () => [{
    from: "pergola",
    to: "pool",
    kind: "must_run_after",
    reason: "pergola after terrain/pool/deck constraints to avoid collisions",
  }],
  validate: (_scene, _config, builtSpec) => builtSpec.validation,
};

export const exteriorFlooringAdapter: RenovationDomainAdapter<ConfigurazioneRistrutturazione> = {
  id: "exterior_flooring",
  canHandle: (scene) => scene.allowedDomains.includes("exterior_flooring"),
  buildDomainSpec(_scene, config) {
    const raw = domainConfig(config, "exterior_flooring");
    const material = stringValue(raw, ["material", "materiale"], "selected exterior deck/paving");
    const pattern = stringValue(raw, ["pattern", "posa"], "selected exterior laying pattern");
    const drainage = stringValue(raw, ["drainage", "drenaggio"], "subtle buildable outdoor slope/drainage logic");
    const usage = stringValue(raw, ["usage", "uso"], "selected pedestrian/vehicular/poolside usage class");
    const operation = stringValue(raw, ["operation", "operazione"], "replace_existing_surface");
    return spec({
      id: "exterior_flooring",
      intent: "coordinate exterior paving/deck transitions with outdoor systems",
      affectedZones: ["outdoor.site_lock", "outdoor.deck_coping"],
      additions: [],
      removals: operation === "recolor_or_refinish_only" ? [] : ["remove old exterior paving pattern, grout grid, deck/garden edge ghosts and incompatible previous surface traces"],
      replacements: operation === "recolor_or_refinish_only" ? [] : [`replace or adapt exterior paving/deck with ${material}, ${pattern}, ${usage}, only in selected outdoor zones`],
      recolors: operation === "recolor_or_refinish_only" ? [`recolor/refinish exterior hardscape only to ${material}; preserve exact layout, pattern, geometry, joints and border logic`] : [],
      preserveExactly: ["non-target lawn", "house facade", "pool/pergola unless active"],
      preserveGeometry: ["paths and property boundaries", "non-target garden levels"],
      conversionRules: [
        "exterior floor/deck follows pool coping and pergola post footprints when those systems are active",
        `buildability and drainage: ${drainage}`,
        "thresholds, steps, coping, border bands and adjacent material transitions must remain crisp and buildable",
      ],
      incompatibilityRules: ["do not smear deck into non-target garden", "do not alter house or pool water", "do not leave old grout ghosts under new exterior paving"],
      domainPromptBlocks: {
        summary: "Exterior flooring appendix: clean deck/paving/hardscape integration.",
        technical: `Exterior material: ${material}; pattern: ${pattern}; use: ${usage}; drainage: ${drainage}; crisp transitions and no random expansion.`,
      },
    });
  },
  getDependencies: () => [{
    from: "exterior_flooring",
    to: "pool",
    kind: "must_run_after",
    reason: "deck/exterior paving adapts to final pool footprint and coping",
  }],
  validate: (_scene, _config, builtSpec) => builtSpec.validation,
};

export const genericOpeningsAdapter: RenovationDomainAdapter<ConfigurazioneRistrutturazione> = {
  id: "generic_openings",
  canHandle: (scene) => scene.allowedDomains.includes("generic_openings"),
  buildDomainSpec(scene, config) {
    return windowsAdapter.buildDomainSpec(scene, config);
  },
  getDependencies: windowsAdapter.getDependencies,
  validate: windowsAdapter.validate,
};

export const renovationDomainAdapters: RenovationDomainAdapter<ConfigurazioneRistrutturazione>[] = [
  bathroomAdapter,
  floorAdapter,
  roomAdapter,
  facadeAdapter,
  windowsAdapter,
  shuttersAdapter,
  roofAdapter,
  poolAdapter,
  pergolaAdapter,
  exteriorFlooringAdapter,
  genericOpeningsAdapter,
];
