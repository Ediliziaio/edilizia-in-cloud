import {
  BASIN_DESCRIPTIONS,
  BATHTUB_FAUCET_DESCRIPTIONS,
  BATHTUB_MATERIAL_DESCRIPTIONS,
  BATHTUB_TYPE_DESCRIPTIONS,
  FAUCET_FINISH_DESCRIPTIONS,
  FAUCET_STYLE_DESCRIPTIONS,
  INTERVENTION_DESCRIPTIONS,
  POSA_DESCRIPTIONS,
  SANITARY_COLOR_DESCRIPTIONS,
  SANITARY_TYPE_DESCRIPTIONS,
  SHOWER_GLASS_DESCRIPTIONS,
  SHOWER_HEAD_DESCRIPTIONS,
  SHOWER_PROFILE_DESCRIPTIONS,
  SHOWER_TRAY_DESCRIPTIONS,
  SHOWER_TYPE_DESCRIPTIONS,
  SHOWER_TYPE_LABELS,
  TILE_EFFECT_DESCRIPTIONS,
  VANITY_MIRROR_DESCRIPTIONS,
  VANITY_STYLE_DESCRIPTIONS,
  VANITY_TOP_DESCRIPTIONS,
} from "./promptFragments.ts";
import { normalizeBathroomSceneAnalysis } from "./bathroomSceneAnalysis.ts";
import { buildBathroomReplacementManifest } from "./bathroomReplacementRules.ts";
import type {
  BathroomPhotoMeta,
  BathroomRenderConfig,
  BathroomSceneAnalysis,
  ConfigurazioneBagno,
} from "./types.ts";

export interface BathroomRenderBuildOptions {
  notes?: string;
  sceneAnalysis?: unknown;
  photoMeta?: BathroomPhotoMeta | null;
}

function normalizeColorLabel(value: string): string {
  return value.trim() || "neutral finish";
}

function describeWallPaintAction(action: string, colorHex?: string | null): string {
  if (action === "lastra_decorativa") {
    return colorHex
      ? `decorative slab or micro-surface treatment in tone ${colorHex}`
      : "decorative slab or micro-surface treatment";
  }
  if (action === "tinta_unita") {
    return colorHex ? `uniform paint finish in ${colorHex}` : "uniform paint finish";
  }
  return "keep current painted walls";
}

function inferMirrorLighting(mirrorType: string): string {
  if (mirrorType === "backlit mirror") return "integrated backlighting";
  if (mirrorType.includes("storage")) return "functional frontal lighting";
  return "soft integrated mirror lighting";
}

function inferVanityStorage(style: string): string {
  return style.includes("wall-hung")
    ? "drawer-based floating storage"
    : "grounded cabinet storage";
}

function inferVanityInstallation(style: ConfigurazioneBagno["vanity"]["stile"]): "wall_hung" | "floor_standing" {
  return style.startsWith("sospeso") ? "wall_hung" : "floor_standing";
}

function inferBasinCount(config: ConfigurazioneBagno["vanity"]): 1 | 2 {
  if (config.numero_lavabi === 2) return 2;
  if (config.larghezza_cm >= 120) return 2;
  return 1;
}

function inferSanitaryInstallationRule(config: ConfigurazioneBagno["sanitari"]): string {
  const wcType = config.azione_wc === "sostituisci" ? config.tipo_wc : "mantieni";
  const bidetType = config.azione_bidet === "sostituisci" ? config.tipo_bidet ?? "sospeso" : config.azione_bidet;
  return `WC: ${wcType}; bidet: ${bidetType}; keep realistic spacing, alignment and wall/floor fixing logic.`;
}

function inferShowerFramePresence(profile: ConfigurazioneBagno["doccia"]["profilo"], type: ConfigurazioneBagno["doccia"]["tipo"]): string {
  if (profile === "senza_profilo" || type === "walk_in") {
    return "minimal visible framing, ideally near-frameless";
  }
  return "visible but proportionate enclosure profiles";
}

function inferShowerTrayThickness(tray: ConfigurazioneBagno["doccia"]["piatto"]): string {
  switch (tray) {
    case "filo_pavimento":
      return "flush-to-floor or almost flush thickness";
    case "rialzato_3cm":
      return "very slim 3 cm tray profile";
    case "rialzato_5cm":
      return "visible but still controlled 5 cm tray profile";
    case "pietra":
      return "slim stone-like tray with tactile thickness";
  }
}

function inferShowerDrainType(tray: ConfigurazioneBagno["doccia"]["piatto"], type: ConfigurazioneBagno["doccia"]["tipo"]): string {
  if (tray === "filo_pavimento" || type === "walk_in") return "linear drain or discreet premium drain solution";
  return "credible standard shower waste aligned with the selected tray";
}

function inferShowerLayoutRule(type: ConfigurazioneBagno["doccia"]["tipo"]): string {
  switch (type) {
    case "walk_in":
      return "The shower must read clearly as a walk-in: open access, fixed glass panel, no generic closed box, no unnecessary frames.";
    case "nicchia_box":
      return "The shower must read as a niche enclosure between walls, not as a freestanding generic box.";
    case "frontale_box":
      return "The shower must read as a frontal enclosure with front access, not as a corner box.";
    case "angolare":
      return "The shower must read as a corner enclosure with coherent 90-degree geometry.";
    case "semicircolare":
      return "The shower must read as a semicircular corner box with credible curved glass and tray geometry.";
  }
}

function inferTubLayoutRule(type: ConfigurazioneBagno["vasca"]["tipo"]): string {
  switch (type) {
    case "freestanding_ovale":
    case "freestanding_rettangolare":
      return "The bathtub must look clearly freestanding, detached from walls with believable floor contact and plumbing logic.";
    case "back_to_wall":
      return "The bathtub must read clearly as back-to-wall: clean contact to the wall, but still recognizably a bathtub and not a built-in masonry tub.";
    case "incassata":
      return "The bathtub must integrate into the existing bathroom geometry with credible apron/ledge treatment.";
    case "angolare":
      return "The bathtub must fit coherently into the corner geometry without distorting room proportions.";
  }
}

export function buildBathroomRenderConfig(
  legacyConfig: ConfigurazioneBagno,
  options: BathroomRenderBuildOptions = {},
): BathroomRenderConfig {
  const sceneAnalysis = normalizeBathroomSceneAnalysis(options.sceneAnalysis, options.photoMeta);

  const faucetsFinish =
    legacyConfig.sostituzione.rubinetteria && legacyConfig.rubinetteria.attivo
      ? FAUCET_FINISH_DESCRIPTIONS[legacyConfig.rubinetteria.finitura]
      : sceneAnalysis.legacy.rubinetteria_attuale || "existing faucet finish";

  const wallTiles = {
    replace: legacyConfig.sostituzione.piastrelle_parete && legacyConfig.piastrelle_parete.attivo,
    effectId: legacyConfig.piastrelle_parete.effetto,
    effectDescription: TILE_EFFECT_DESCRIPTIONS[legacyConfig.piastrelle_parete.effetto] || legacyConfig.piastrelle_parete.effetto,
    format: legacyConfig.piastrelle_parete.formato,
    layingPattern: POSA_DESCRIPTIONS[legacyConfig.piastrelle_parete.posa] || legacyConfig.piastrelle_parete.posa,
    groutColor: legacyConfig.piastrelle_parete.fuga_colore,
    coverage: legacyConfig.piastrelle_parete.altezza_rivestimento || "full height",
  };

  const floor = {
    replace: legacyConfig.sostituzione.pavimento && legacyConfig.pavimento.attivo,
    effectId: legacyConfig.pavimento.effetto,
    effectDescription: TILE_EFFECT_DESCRIPTIONS[legacyConfig.pavimento.effetto] || legacyConfig.pavimento.effetto,
    format: legacyConfig.pavimento.formato,
    layingPattern: POSA_DESCRIPTIONS[legacyConfig.pavimento.posa] || legacyConfig.pavimento.posa,
    groutColor: legacyConfig.pavimento.fuga_colore,
    reflectivityRule: legacyConfig.pavimento.effetto.startsWith("marmo")
      ? "subtle polished reflections consistent with the photographed light"
      : legacyConfig.pavimento.effetto.startsWith("cemento") || legacyConfig.pavimento.effetto === "resina_spatolata"
        ? "soft matte reflection with realistic diffuse light response"
        : "material reflectivity coherent with the selected floor surface",
  };

  const shower = {
    replace: legacyConfig.sostituzione.doccia && legacyConfig.doccia.attivo,
    type: legacyConfig.doccia.tipo,
    showerTypeLabel: SHOWER_TYPE_LABELS[legacyConfig.doccia.tipo],
    enclosureType: SHOWER_TYPE_DESCRIPTIONS[legacyConfig.doccia.tipo],
    glassType: SHOWER_GLASS_DESCRIPTIONS[legacyConfig.doccia.box_vetro],
    framePresence: inferShowerFramePresence(legacyConfig.doccia.profilo, legacyConfig.doccia.tipo),
    frameFinish: SHOWER_PROFILE_DESCRIPTIONS[legacyConfig.doccia.profilo],
    trayType: SHOWER_TRAY_DESCRIPTIONS[legacyConfig.doccia.piatto],
    trayThickness: inferShowerTrayThickness(legacyConfig.doccia.piatto),
    drainType: inferShowerDrainType(legacyConfig.doccia.piatto, legacyConfig.doccia.tipo),
    showerHeadType: SHOWER_HEAD_DESCRIPTIONS[legacyConfig.doccia.soffione],
    handShowerType: legacyConfig.doccia.soffione === "pioggia_soffitto" ? "matching hand shower where plausibly visible" : "hand shower coherent with the selected system",
    mixerFinish: faucetsFinish,
    wallNiche: legacyConfig.doccia.tipo === "walk_in" || legacyConfig.doccia.tipo === "nicchia_box",
    layoutRule: inferShowerLayoutRule(legacyConfig.doccia.tipo),
  };

  const bathtub = {
    replace: legacyConfig.sostituzione.vasca && legacyConfig.vasca.attivo,
    type: legacyConfig.vasca.tipo,
    bathtubTypeLabel: BATHTUB_TYPE_DESCRIPTIONS[legacyConfig.vasca.tipo],
    materialDescription: BATHTUB_MATERIAL_DESCRIPTIONS[legacyConfig.vasca.materiale],
    faucetPosition: BATHTUB_FAUCET_DESCRIPTIONS[legacyConfig.vasca.rubinetteria_vasca],
    layoutRule: inferTubLayoutRule(legacyConfig.vasca.tipo),
  };

  const mirrorType = VANITY_MIRROR_DESCRIPTIONS[legacyConfig.vanity.specchio || "retroilluminato"];
  const vanity = {
    replace: legacyConfig.sostituzione.mobile_bagno && legacyConfig.vanity.attivo,
    installation: inferVanityInstallation(legacyConfig.vanity.stile),
    styleLabel: VANITY_STYLE_DESCRIPTIONS[legacyConfig.vanity.stile],
    colorLabel: normalizeColorLabel(legacyConfig.vanity.colore),
    topDescription: VANITY_TOP_DESCRIPTIONS[legacyConfig.vanity.piano],
    basinType: BASIN_DESCRIPTIONS[legacyConfig.vanity.lavabo],
    basinCount: inferBasinCount(legacyConfig.vanity),
    mirrorType,
    mirrorLighting: inferMirrorLighting(mirrorType),
    storageType: inferVanityStorage(VANITY_STYLE_DESCRIPTIONS[legacyConfig.vanity.stile]),
  };

  const sanitaryWare = {
    replace: legacyConfig.sostituzione.sanitari && legacyConfig.sanitari.attivo,
    toiletAction: legacyConfig.sanitari.azione_wc,
    toiletType: legacyConfig.sanitari.azione_wc === "sostituisci"
      ? SANITARY_TYPE_DESCRIPTIONS[legacyConfig.sanitari.tipo_wc]
      : "keep existing toilet",
    bidetAction: legacyConfig.sanitari.azione_bidet,
    bidetType: legacyConfig.sanitari.azione_bidet === "sostituisci"
      ? SANITARY_TYPE_DESCRIPTIONS[legacyConfig.sanitari.tipo_bidet || "sospeso"]
      : legacyConfig.sanitari.azione_bidet === "rimuovi"
        ? null
        : "keep existing bidet",
    installationRule: inferSanitaryInstallationRule(legacyConfig.sanitari),
    ceramicFinish: SANITARY_COLOR_DESCRIPTIONS[legacyConfig.sanitari.colore],
  };

  const faucets = {
    replace: legacyConfig.sostituzione.rubinetteria && legacyConfig.rubinetteria.attivo,
    finish: FAUCET_FINISH_DESCRIPTIONS[legacyConfig.rubinetteria.finitura],
    style: FAUCET_STYLE_DESCRIPTIONS[legacyConfig.rubinetteria.stile],
    reflectivityRule: "All visible faucets, shower trims and tub fittings must share the same finish family and react coherently to the bathroom lighting.",
  };

  const wallPaint = {
    replace: legacyConfig.sostituzione.parete_colore && legacyConfig.parete.attivo && legacyConfig.parete.azione !== "mantieni",
    action: describeWallPaintAction(legacyConfig.parete.azione, legacyConfig.parete.colore_hex || null),
    colorHex: legacyConfig.parete.colore_hex || null,
  };

  const lighting = {
    replace: legacyConfig.sostituzione.illuminazione && Boolean(legacyConfig.illuminazione_tipo?.trim()),
    target: legacyConfig.illuminazione_tipo?.trim() || "coherent upgraded bathroom lighting",
  };

  const provisional: BathroomRenderConfig = {
    schema_version: "bathroom_render_v2",
    notes: options.notes?.trim() ?? legacyConfig.note_libere?.trim() ?? "",
    photo_meta: options.photoMeta ?? null,
    intervention_type: legacyConfig.tipo_intervento,
    scene_analysis: sceneAnalysis,
    technical_specification: {
      wallTiles,
      floor,
      shower,
      bathtub,
      vanity,
      sanitaryWare,
      faucets,
      wallPaint,
      lighting,
    },
    replacement_manifest: {} as BathroomRenderConfig["replacement_manifest"],
    removal_rules: [],
    integrity_constraints: [],
    quality_directives: [
      INTERVENTION_DESCRIPTIONS[legacyConfig.tipo_intervento],
      "Surgical bathroom replacement only: same room, same perspective, same geometry.",
      "No generic fantasy spa redesign; preserve the source bathroom identity.",
      "Photorealistic renovation output with exact selected fixture types.",
    ],
    legacy_config: legacyConfig,
  };

  const replacementManifest = buildBathroomReplacementManifest(provisional);

  return {
    ...provisional,
    replacement_manifest: replacementManifest,
    removal_rules: replacementManifest.removals.map((rule) => rule.summary),
    integrity_constraints: replacementManifest.integrityConstraints,
  };
}

export function ensureBathroomRenderConfig(
  rawConfig: Record<string, unknown>,
  rawAnalysis?: unknown,
  photoMeta?: BathroomPhotoMeta | null,
): BathroomRenderConfig {
  if (
    rawConfig?.schema_version === "bathroom_render_v2" &&
    rawConfig.scene_analysis &&
    rawConfig.technical_specification
  ) {
    const normalizedSceneAnalysis = normalizeBathroomSceneAnalysis(
      rawConfig.scene_analysis,
      (rawConfig.photo_meta as BathroomPhotoMeta | null | undefined) ?? photoMeta ?? null,
    );

    const normalizedLegacy = (rawConfig.legacy_config as ConfigurazioneBagno | undefined) ?? (rawConfig as unknown as ConfigurazioneBagno);
    const provisional: BathroomRenderConfig = {
      ...(rawConfig as BathroomRenderConfig),
      photo_meta: (rawConfig.photo_meta as BathroomPhotoMeta | null | undefined) ?? photoMeta ?? null,
      scene_analysis: normalizedSceneAnalysis,
      legacy_config: normalizedLegacy,
    };

    const replacementManifest = buildBathroomReplacementManifest(provisional);
    return {
      ...provisional,
      replacement_manifest: replacementManifest,
      removal_rules: replacementManifest.removals.map((rule) => rule.summary),
      integrity_constraints: replacementManifest.integrityConstraints,
    };
  }

  return buildBathroomRenderConfig(rawConfig as unknown as ConfigurazioneBagno, {
    sceneAnalysis: rawAnalysis,
    photoMeta,
    notes:
      typeof rawConfig.note_libere === "string"
        ? rawConfig.note_libere
        : typeof rawConfig.notes === "string"
          ? rawConfig.notes
          : "",
  });
}
