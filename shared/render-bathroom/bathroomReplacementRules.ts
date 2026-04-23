import type {
  BathroomRemovalRule,
  BathroomRenderConfig,
  BathroomReplacementManifest,
} from "./types.ts";

function dedupePush(list: BathroomRemovalRule[], rule: BathroomRemovalRule | null) {
  if (!rule) return;
  const exists = list.some((item) => item.code === rule.code && item.summary === rule.summary);
  if (!exists) list.push(rule);
}

function buildTubRemovalRule(config: BathroomRenderConfig): BathroomRemovalRule | null {
  const { scene_analysis: scene, technical_specification: spec } = config;
  if (!scene.bathtub.present) return null;
  if (!spec.shower.replace) return null;
  if (spec.bathtub.replace) return null;

  return {
    code: "remove_existing_bathtub_for_new_shower",
    summary:
      "Remove the existing bathtub completely because the selected intervention replaces the bathtub zone with a new shower and no bathtub retention was requested.",
    repairInstruction:
      "Remove bathtub shell, apron/panels, tub-edge ledges, tub screen if present, tub-only mixer/fittings and any incompatible wall/floor build-up tied to the old bathtub. Rebuild that zone seamlessly so only the new shower installation remains visible.",
    preserveInstruction:
      "Keep all adjacent non-target walls, floor areas, window, ceiling and remaining bathroom fixtures unchanged outside the direct bathtub conversion zone.",
  };
}

function buildShowerRemovalRule(config: BathroomRenderConfig): BathroomRemovalRule | null {
  const { scene_analysis: scene, technical_specification: spec } = config;
  if (!scene.shower.present) return null;
  if (!spec.bathtub.replace) return null;
  if (spec.shower.replace) return null;

  return {
    code: "remove_existing_shower_for_new_bathtub",
    summary:
      "Remove the existing shower completely because the selected intervention replaces the shower zone with a new bathtub and no shower retention was requested.",
    repairInstruction:
      "Remove shower tray, enclosure, fixed glass, doors, shower head, hand shower, rails, channels, mixer set and all incompatible waterproof detailing that belongs only to the previous shower. Rebuild surrounding surfaces so the new bathtub looks credibly installed in the same room.",
    preserveInstruction:
      "Keep adjacent non-target elements unchanged outside the direct shower conversion zone.",
  };
}

function buildExistingShowerReplacementRule(config: BathroomRenderConfig): BathroomRemovalRule | null {
  const { scene_analysis: scene, technical_specification: spec } = config;
  if (!scene.shower.present || !spec.shower.replace) return null;

  return {
    code: "replace_existing_shower_zone",
    summary: `Replace the existing shower zone with the selected ${spec.shower.showerTypeLabel}.`,
    repairInstruction:
      "Remove incompatible old enclosure parts, tray geometry, shower fittings and seals that do not belong to the selected new shower type. Rebuild contact surfaces and waterproof transitions seamlessly.",
  };
}

function buildExistingTubReplacementRule(config: BathroomRenderConfig): BathroomRemovalRule | null {
  const { scene_analysis: scene, technical_specification: spec } = config;
  if (!scene.bathtub.present || !spec.bathtub.replace) return null;

  return {
    code: "replace_existing_bathtub_zone",
    summary: `Replace the existing bathtub with the selected ${spec.bathtub.bathtubTypeLabel}.`,
    repairInstruction:
      "Remove incompatible old tub body, apron, screen and tub fixtures that do not belong to the selected new bathtub configuration. Rebuild surfaces and align the new tub footprint realistically within the same bathroom geometry.",
  };
}

function buildBidetRemovalRule(config: BathroomRenderConfig): BathroomRemovalRule | null {
  const { technical_specification: spec, scene_analysis: scene } = config;
  if (!scene.sanitaryWare.bidetPresent) return null;
  if (!spec.sanitaryWare.replace || spec.sanitaryWare.bidetAction !== "rimuovi") return null;

  return {
    code: "remove_existing_bidet",
    summary: "Remove the existing bidet completely because the user selected bidet removal.",
    repairInstruction:
      "Remove the bidet body and all incompatible visible connections. Rebuild the surrounding wall/floor finish seamlessly while preserving spacing and other non-target sanitary elements.",
  };
}

function buildWallHungWcConversionRule(config: BathroomRenderConfig): BathroomRemovalRule | null {
  const { technical_specification: spec, scene_analysis: scene } = config;
  if (!spec.sanitaryWare.replace || !scene.sanitaryWare.wcPresent) return null;

  const wantsWallHung = spec.sanitaryWare.toiletType.toLowerCase().includes("wall-hung");
  if (!wantsWallHung) return null;

  return {
    code: "convert_existing_wc_to_wall_hung",
    summary: "Convert the existing toilet zone to a true wall-hung WC installation with concealed cistern and flush plate.",
    repairInstruction:
      "Remove any old visible toilet tank, monobloc mass, exposed cistern volume, outdated backbox or incompatible floor-standing WC geometry. Rebuild the wall behind the toilet cleanly so only the compact wall-hung WC and slim flush plate remain visible.",
    preserveInstruction:
      "Keep the photographed toilet position, bathroom geometry and all non-target adjacent elements coherent while modernizing only the sanitary installation logic.",
  };
}

export function buildBathroomReplacementManifest(config: BathroomRenderConfig): BathroomReplacementManifest {
  const { scene_analysis: scene, technical_specification: spec, legacy_config: legacy } = config;
  const removals: BathroomRemovalRule[] = [];

  dedupePush(removals, buildTubRemovalRule(config));
  dedupePush(removals, buildShowerRemovalRule(config));
  dedupePush(removals, buildExistingShowerReplacementRule(config));
  dedupePush(removals, buildExistingTubReplacementRule(config));
  dedupePush(removals, buildBidetRemovalRule(config));
  dedupePush(removals, buildWallHungWcConversionRule(config));

  const replacements = [
    spec.wallTiles.replace
      ? `Replace wall tiles with ${spec.wallTiles.effectDescription}, ${spec.wallTiles.format}, ${spec.wallTiles.layingPattern}. ${spec.wallTiles.moduleScaleRule} ${spec.wallTiles.groutDensityRule}`
      : "Keep wall tiles unchanged.",
    spec.floor.replace
      ? `Replace floor with ${spec.floor.effectDescription}, ${spec.floor.format}, ${spec.floor.layingPattern}. ${spec.floor.moduleScaleRule} ${spec.floor.groutDensityRule}`
      : "Keep floor unchanged.",
    spec.shower.replace ? `Replace shower zone with ${spec.shower.showerTypeLabel}.` : "Keep existing shower state unless incompatible with another requested replacement.",
    spec.bathtub.replace ? `Replace bathtub zone with ${spec.bathtub.bathtubTypeLabel}.` : "Keep existing bathtub state unless incompatible with another requested replacement.",
    spec.vanity.replace ? `Replace vanity with a ${spec.vanity.styleLabel}.` : "Keep vanity unchanged.",
    spec.sanitaryWare.replace ? "Update sanitary ware according to the selected WC/bidet actions." : "Keep sanitary ware unchanged.",
    spec.faucets.replace ? `Update visible faucet finishes to ${spec.faucets.finish}.` : "Keep faucet finishes unchanged unless they are part of a replaced fixture.",
    spec.wallPaint.replace ? `Update non-tiled wall surfaces with ${spec.wallPaint.action}.` : "Keep non-tiled wall surfaces unchanged.",
    spec.lighting.replace ? `Update lighting with ${spec.lighting.target}.` : "Keep lighting unchanged.",
  ];

  const additions = [
    spec.shower.replace
      ? `Install ${spec.shower.showerTypeLabel} with ${spec.shower.enclosureType}, ${spec.shower.glassType}, ${spec.shower.framePresence}, ${spec.shower.trayType}, ${spec.shower.showerHeadType} and ${spec.shower.mixerFinish}.`
      : "",
    spec.bathtub.replace
      ? `Install ${spec.bathtub.bathtubTypeLabel} in ${spec.bathtub.materialDescription} with ${spec.bathtub.faucetPosition}.`
      : "",
    spec.vanity.replace
      ? `Install ${spec.vanity.styleLabel} in ${spec.vanity.colorLabel} with ${spec.vanity.topDescription}, ${spec.vanity.basinCount === 2 ? "double basin" : "single basin"} and ${spec.vanity.mirrorType}.`
      : "",
    spec.sanitaryWare.replace
      ? `Render sanitary ware with ${spec.sanitaryWare.installationRule}, ${spec.sanitaryWare.cisternRule} ${spec.sanitaryWare.flushPlateRule ?? ""} ${spec.sanitaryWare.scaleRule} Finish: ${spec.sanitaryWare.ceramicFinish}.`
      : "",
    spec.wallTiles.replace
      ? `Wall tiles must show ${spec.wallTiles.coverage} coverage with consistent grout color ${spec.wallTiles.groutColor}. ${spec.wallTiles.cutLayoutRule} ${spec.wallTiles.veinContinuityRule ?? ""}`
      : "",
    spec.floor.replace
      ? `Floor finish must preserve the photographed perspective while showing ${spec.floor.reflectivityRule}. ${spec.floor.cutLayoutRule} ${spec.floor.veinContinuityRule ?? ""}`
      : "",
  ].filter(Boolean);

  const preserveExactly = Array.from(new Set([
    ...scene.preserveRigidly,
    !legacy.sostituzione.piastrelle_parete ? "existing wall tile layout, cut lines and grout rhythm on all untouched wall surfaces" : "",
    !legacy.sostituzione.pavimento ? "existing floor geometry, perspective and floor/wall junctions" : "",
    !legacy.sostituzione.mobile_bagno && scene.vanity.present ? "existing vanity volume, mirror placement and plumbing wall context" : "",
    !legacy.sostituzione.sanitari && (scene.sanitaryWare.wcPresent || scene.sanitaryWare.bidetPresent) ? "existing sanitary ware positions and spacing" : "",
    !legacy.sostituzione.doccia && scene.shower.present ? "existing shower zone" : "",
    !legacy.sostituzione.vasca && scene.bathtub.present ? "existing bathtub zone" : "",
    scene.windowPresent ? "window and outdoor light contribution" : "",
    scene.towelWarmerPresent ? "towel warmer / radiator if not selected for replacement" : "",
  ].filter(Boolean)));

  const untouchedSurfaces = [
    !spec.wallTiles.replace ? "all wall tiles and grout joints" : "",
    !spec.floor.replace ? "the whole existing floor surface" : "",
    !spec.wallPaint.replace ? "non-tiled painted walls" : "",
    "ceiling",
    scene.windowPresent ? "window frame and glazing unless explicitly part of the edit" : "",
    scene.towelWarmerPresent ? "towel warmer / radiator if unchanged" : "",
  ].filter(Boolean);

  const integrityConstraints = Array.from(new Set([
    "Keep the exact same bathroom, same camera angle, same perspective, same room geometry and same image dimensions.",
    "Do not redesign the room beyond the requested replacements.",
    "Preserve every non-target fixture and all untouched surfaces exactly.",
    "Preserve the photographed spatial relationships between vanity, sanitary ware, window, ceiling and room edges.",
    "Whenever demolition/removal is required, rebuild adjacent surfaces seamlessly so no traces of removed fixtures remain visible.",
    ...preserveExactly.map((item) => `Preserve exactly: ${item}.`),
    ...untouchedSurfaces.map((item) => `Do not alter: ${item}.`),
  ]));

  return {
    interventionSummary: config.intervention_type,
    replacements,
    additions,
    removals,
    preserveExactly,
    untouchedSurfaces,
    integrityConstraints,
  };
}
