import {
  DEFAULT_NEGATIVE_CONSTRAINTS,
  DEFAULT_QUALITY_DIRECTIVES,
  INTERVENTION_DESCRIPTIONS,
} from "./promptFragments.ts";
import { ensureBathroomRenderConfig } from "./bathroomRenderConfig.ts";
import { validateBathroomPromptConfig } from "./bathroomPromptValidation.ts";
import type { BathroomPromptBuildResult, BathroomRenderConfig, BathroomSceneAnalysis } from "./types.ts";

function bullets(lines: Array<string | null | undefined>): string {
  return lines
    .filter((line): line is string => Boolean(line && line.trim().length > 0))
    .map((line) => `- ${line}`)
    .join("\n");
}

function describeExistingShower(scene: BathroomSceneAnalysis): string {
  if (!scene.shower.present) return "No clearly visible existing shower.";
  return `Existing shower: ${scene.shower.type.replace(/_/g, " ")}, position ${scene.shower.position}, enclosure ${scene.shower.enclosureType}, glass ${scene.shower.glassType}, tray ${scene.shower.trayType}, finish ${scene.shower.frameFinish}. Notes: ${scene.shower.notes}`;
}

function describeExistingTub(scene: BathroomSceneAnalysis): string {
  if (!scene.bathtub.present) return "No clearly visible existing bathtub.";
  return `Existing bathtub: ${scene.bathtub.type.replace(/_/g, " ")}, position ${scene.bathtub.position}, faucet ${scene.bathtub.faucetType}, screen present: ${scene.bathtub.screenPresent ? "yes" : "no"}. Notes: ${scene.bathtub.notes}`;
}

function describeExistingVanity(scene: BathroomSceneAnalysis): string {
  if (!scene.vanity.present) return "No clearly visible vanity.";
  return `Existing vanity: ${scene.vanity.type.replace(/_/g, " ")}, position ${scene.vanity.position}, ${scene.vanity.basinCount === 2 ? "double basin" : "single basin"}, basin type ${scene.vanity.basinType}, mirror ${scene.vanity.mirrorPresent ? scene.vanity.mirrorType : "not clearly visible"}. Notes: ${scene.vanity.notes}`;
}

function describeExistingSanitary(scene: BathroomSceneAnalysis): string {
  return `Existing sanitary ware: toilet ${scene.sanitaryWare.wcPresent ? scene.sanitaryWare.wcType.replace(/_/g, " ") : "not clearly visible"}, bidet ${scene.sanitaryWare.bidetPresent ? scene.sanitaryWare.bidetType.replace(/_/g, " ") : "not clearly visible"}, position ${scene.sanitaryWare.position}. Notes: ${scene.sanitaryWare.notes}`;
}

function describeShowerSpec(config: BathroomRenderConfig): string {
  const spec = config.technical_specification.shower;
  if (!spec.replace) return "No new shower requested.";
  return [
    `shower type: ${spec.showerTypeLabel}`,
    `enclosure type: ${spec.enclosureType}`,
    `glass type: ${spec.glassType}`,
    `frame presence: ${spec.framePresence}`,
    `frame finish: ${spec.frameFinish}`,
    `tray type: ${spec.trayType}`,
    `tray thickness: ${spec.trayThickness}`,
    `drain type: ${spec.drainType}`,
    `shower head type: ${spec.showerHeadType}`,
    `hand shower type: ${spec.handShowerType}`,
    `mixer finish: ${spec.mixerFinish}`,
    `wall niche: ${spec.wallNiche ? "requested / plausible if spatially coherent" : "not requested"}`,
    `layout rule: ${spec.layoutRule}`,
  ].join("\n");
}

function describeBathtubSpec(config: BathroomRenderConfig): string {
  const spec = config.technical_specification.bathtub;
  if (!spec.replace) return "No new bathtub requested.";
  return [
    `bathtub type: ${spec.bathtubTypeLabel}`,
    `material/look: ${spec.materialDescription}`,
    `faucet type / position: ${spec.faucetPosition}`,
    `nominal real-world footprint: ${spec.nominalSize}`,
    `layout rule: ${spec.layoutRule}`,
    `scale rule: ${spec.scaleRule}`,
    `placement rule: ${spec.placementRule}`,
  ].join("\n");
}

function describeVanitySpec(config: BathroomRenderConfig): string {
  const spec = config.technical_specification.vanity;
  if (!spec.replace) return "No new vanity requested.";
  return [
    `installation: ${spec.installation === "wall_hung" ? "wall-hung / suspended" : "floor-standing"}`,
    `style: ${spec.styleLabel}`,
    `color / finish: ${spec.colorLabel}`,
    `top finish: ${spec.topDescription}`,
    `${spec.basinCount === 2 ? "double basin" : "single basin"} with ${spec.basinType}`,
    `mirror type: ${spec.mirrorType}`,
    `mirror lighting: ${spec.mirrorLighting}`,
    `storage type: ${spec.storageType}`,
  ].join("\n");
}

function describeSanitarySpec(config: BathroomRenderConfig): string {
  const spec = config.technical_specification.sanitaryWare;
  if (!spec.replace) return "No sanitary replacement requested.";
  return [
    `toilet action: ${spec.toiletAction}`,
    `toilet type: ${spec.toiletType}`,
    `bidet action: ${spec.bidetAction}`,
    `bidet type: ${spec.bidetType ?? "remove bidet / no replacement"}`,
    `installation / spacing rule: ${spec.installationRule}`,
    `cistern rule: ${spec.cisternRule}`,
    `flush plate style: ${spec.flushPlateStyle ?? "not applicable"}`,
    `flush plate color: ${spec.flushPlateColor ?? "not applicable"}`,
    `flush plate rule: ${spec.flushPlateRule ?? "not applicable"}`,
    `scale rule: ${spec.scaleRule}`,
    `ceramic finish: ${spec.ceramicFinish}`,
  ].join("\n");
}

export function buildBathroomPrompt(
  rawConfig: Record<string, unknown>,
  rawAnalysis?: unknown,
  photoMeta?: BathroomRenderConfig["photo_meta"],
): BathroomPromptBuildResult {
  const normalizedConfig = ensureBathroomRenderConfig(rawConfig, rawAnalysis, photoMeta ?? null);
  const validation = validateBathroomPromptConfig(normalizedConfig);
  const { scene_analysis: scene, technical_specification: spec } = normalizedConfig;

  const blocks: Record<string, string> = {};

  blocks.A = `[BLOCK A – MISSION]
You are a SURGICAL PHOTOREALISTIC IMAGE EDITOR specialized in bathroom renovation visualization.
Modify EXACTLY the requested bathroom elements and leave the rest of the photographed bathroom unchanged.

MANDATORY CORE CONSTRAINTS:
- same bathroom
- same room geometry
- same camera angle
- same perspective
- same lighting direction
- same image dimensions
- same surrounding elements
- no artistic reinterpretation
- no redesign beyond requested changes
- the output must still look like the same real bathroom after a believable renovation`;

  blocks.B = `[BLOCK B – EXISTING BATHROOM INVENTORY]
Room type: ${scene.roomType}
Estimated size: ${scene.estimatedSize}
Estimated ceiling height: ${scene.estimatedCeilingHeight}
Layout: ${scene.layoutType}
Camera perspective: ${scene.cameraPerspective}
Camera angle: ${scene.cameraAngle}
Dominant colors: ${scene.dominantColors.join(", ") || "not clearly identified"}
Overall condition: ${scene.overallCondition}
Current wall tiles: ${scene.wallTiles.description}
Current floor: ${scene.floor.description}
${describeExistingShower(scene)}
${describeExistingTub(scene)}
${describeExistingVanity(scene)}
${describeExistingSanitary(scene)}
Lighting: ${scene.lighting.type}, direction ${scene.lighting.direction}, notes ${scene.lighting.notes}
Mirror present: ${scene.mirrorPresent ? "yes" : "no"}
Towel warmer present: ${scene.towelWarmerPresent ? `yes (${scene.towelWarmerType})` : "no"}
Window present: ${scene.windowPresent ? `yes (${scene.windowPosition})` : "no"}
Niches present: ${scene.nichePresent ? "yes" : "no"}
Partitions / half walls present: ${scene.partitionPresent ? "yes" : "no"}
Preserve anchors: ${scene.preserveRigidly.join(", ")}`;

  blocks.C = `[BLOCK C – INTERVENTION TYPE]
${INTERVENTION_DESCRIPTIONS[normalizedConfig.intervention_type]}

The intervention must remain compatible with the existing photographed layout and geometry unless explicit demolition/removal rules say otherwise.`;

  blocks.D = `[BLOCK D – REPLACEMENT MANIFEST]
${bullets([
    ...normalizedConfig.replacement_manifest.replacements,
    ...normalizedConfig.replacement_manifest.additions,
  ])}

Elements to preserve exactly:
${bullets(normalizedConfig.replacement_manifest.preserveExactly)}

Untouched surfaces:
${bullets(normalizedConfig.replacement_manifest.untouchedSurfaces)}`;

  blocks.E = `[BLOCK E – SHOWER / BATHTUB SPECIFICATION]
Shower:
${describeShowerSpec(normalizedConfig)}

Bathtub:
${describeBathtubSpec(normalizedConfig)}`;

  blocks.F = `[BLOCK F – VANITY / BASIN / MIRROR SPECIFICATION]
${describeVanitySpec(normalizedConfig)}`;

  blocks.G = `[BLOCK G – SANITARY WARE SPECIFICATION]
${describeSanitarySpec(normalizedConfig)}

Wall-hung WC lock, when selected:
- replace the photographed existing WC in its original sanitary zone; do not add a second toilet anywhere else in the room
- the WC bowl must visibly float off the floor with a clean shadow gap underneath
- no floor-standing pedestal, no monobloc base, no exposed ceramic tank, no old rectangular cistern behind the WC
- the in-wall cistern must be hidden behind the finished wall
- the selected wall flush plate is mandatory and must be visible on the same wall plane above/behind that WC at realistic height, in the selected style and color
- the final image must contain exactly one WC unless the source already has multiple WCs and the user explicitly requested keeping them
- align the WC and bidet as a coherent suspended sanitary set when bidet replacement is selected`;

  blocks.H = `[BLOCK H – WALL TILES SPECIFICATION]
${spec.wallTiles.replace
    ? [
        `effect / material: ${spec.wallTiles.effectDescription}`,
        `format: ${spec.wallTiles.format}`,
        `format family: ${spec.wallTiles.formatCategory}`,
        `laying pattern: ${spec.wallTiles.layingPattern}`,
        `grout color: ${spec.wallTiles.groutColor}`,
        `coverage height: ${spec.wallTiles.coverage}`,
        `real-world module size: ${spec.wallTiles.nominalWidthCm ?? "unknown"}x${spec.wallTiles.nominalHeightCm ?? "unknown"} cm`,
        `module scale rule: ${spec.wallTiles.moduleScaleRule}`,
        `grout density rule: ${spec.wallTiles.groutDensityRule}`,
        `cut layout rule: ${spec.wallTiles.cutLayoutRule}`,
        `real scale lock: ${spec.wallTiles.realScaleLockRule}`,
        spec.wallTiles.veinContinuityRule ? `vein continuity rule: ${spec.wallTiles.veinContinuityRule}` : "",
        "wet-area wall tile treatment must stay coherent around shower or bathtub zones",
      ].join("\n")
    : "Wall tile replacement not requested. Keep all existing wall tiles unchanged."}`;

  blocks.I = `[BLOCK I – FLOOR SPECIFICATION]
${spec.floor.replace
    ? [
        `material / effect: ${spec.floor.effectDescription}`,
        `format: ${spec.floor.format}`,
        `format family: ${spec.floor.formatCategory}`,
        `real-world module size: ${spec.floor.nominalWidthCm ?? "unknown"}x${spec.floor.nominalHeightCm ?? "unknown"} cm`,
        `laying pattern: ${spec.floor.layingPattern}`,
        `grout color: ${spec.floor.groutColor}`,
        `reflectivity: ${spec.floor.reflectivityRule}`,
        `module scale rule: ${spec.floor.moduleScaleRule}`,
        `grout density rule: ${spec.floor.groutDensityRule}`,
        `cut layout rule: ${spec.floor.cutLayoutRule}`,
        `real scale lock: ${spec.floor.realScaleLockRule}`,
        spec.floor.veinContinuityRule ? `vein continuity rule: ${spec.floor.veinContinuityRule}` : "",
        "floor perspective, vanishing lines and junctions must remain coherent with the source photo",
      ].join("\n")
    : "Floor replacement not requested. Keep the existing floor unchanged."}`;

  blocks.J = `[BLOCK J – FAUCETS / METALS / ACCESSORIES]
Faucet replacement requested: ${spec.faucets.replace ? "yes" : "no"}
Primary finish: ${spec.faucets.finish}
Primary style: ${spec.faucets.style}
Reflectivity rule: ${spec.faucets.reflectivityRule}
Only add accessories if explicitly requested or necessary for physical plausibility of the selected fixture type.`;

  blocks.K = `[BLOCK K – DEMOLITION / REMOVAL RULES]
${bullets(
    normalizedConfig.replacement_manifest.removals.length > 0
      ? normalizedConfig.replacement_manifest.removals.flatMap((rule) => [
          rule.summary,
          rule.repairInstruction ? `Repair rule: ${rule.repairInstruction}` : "",
          rule.preserveInstruction ? `Preserve rule: ${rule.preserveInstruction}` : "",
        ])
      : ["No destructive demolition beyond the direct requested replacement scope."],
  )}`;

  blocks.L = `[BLOCK L – SURROUNDINGS INTEGRITY]
${bullets(normalizedConfig.integrity_constraints)}

Image lock:
- keep the same crop
- keep the same visible room coverage
- keep the same image dimensions
- keep the same orientation: ${normalizedConfig.photo_meta?.orientation ?? "same as source"}`;

  blocks.M = `[BLOCK M – PHOTOREALISM RULES]
- physically plausible materials
- accurate shadows
- ambient occlusion
- realistic reflections
- correct perspective
- correct scale
- believable installation details
- no floating fixtures
- no distorted geometry
- no showroom-like fake perfection if the source is a real lived-in bathroom
- high-end interior renovation visualization quality
- preserve the lived-in realism of the source room instead of turning it into a generic luxury set
- if the selected wall or floor format is 120x240 or any slab / large-format choice, the surface must read as a few very large modules with sparse joints, never as a dense small-tile grid
- 120x240 means a real 120 cm by 240 cm slab: do not downscale it into 60x60, 30x60, medium square modules, or a decorative grid; one 240 cm side should visually approach floor-to-ceiling height on bathroom walls where feasible
- bathtub replacements must keep full adult product scale: never render a tiny freestanding tub, basin-like tub, miniature bowl, or undersized prop
- if a wall-hung WC is selected, render a concealed in-wall cistern with the selected visible compact wall flush plate and never an exposed old-style bulky tank
- if a flush plate style/color is selected, it must be visible as a real wall-mounted plate directly tied to the replacement WC, not omitted, not detached on another wall and not replaced by a cistern volume
- sanitary replacement is a one-for-one replacement in the photographed sanitary position; never duplicate the toilet or place a new WC in a random back-wall position`;

  blocks.N = `[BLOCK N – NEGATIVE CONSTRAINTS]
${bullets(DEFAULT_NEGATIVE_CONSTRAINTS)}`;

  blocks.O = `[BLOCK O – QUALITY BAR]
${bullets([
    ...DEFAULT_QUALITY_DIRECTIVES,
    ...normalizedConfig.quality_directives,
    validation.isValid
      ? "Prompt validation passed: replacements, removals, preserved elements and intervention logic are all explicit."
      : `Prompt validation warnings: missing sections = ${validation.missingSections.join(", ") || "none"}; missing business rules = ${validation.missingBusinessRules.join(", ") || "none"}.`,
  ])}`;

  // ── v2.1.0 — FIXTURE COUNT CONTRACT (audit 16/07) ─────────────────────────
  // I modelli image ignorano le regole anti-duplicazione sepolte nei blocchi
  // G/M/N (lezione identica al modulo infissi, changelog v8.6.9): quando
  // sbagliano, sbagliano PROPRIO sui conteggi — due water, la vasca rimasta
  // dopo la conversione in doccia, un secondo mobile. Il contratto dei
  // conteggi va detto PRIMA di tutto, breve e assoluto.
  const wcCount = scene.sanitaryWare.wcPresent || spec.sanitaryWare.replace ? 1 : 0;
  const bidetRemoved = spec.sanitaryWare.replace && spec.sanitaryWare.bidetAction === "rimuovi";
  const bidetCount = bidetRemoved
    ? 0
    : (scene.sanitaryWare.bidetPresent ||
        (spec.sanitaryWare.replace && spec.sanitaryWare.bidetAction === "sostituisci"))
    ? 1
    : 0;
  const showerRequested = spec.shower.replace;
  const bathtubRequested = spec.bathtub.replace;
  let showerCount: number;
  let bathtubCount: number;
  let conversionLine = "";
  if (showerRequested && !bathtubRequested) {
    showerCount = 1;
    bathtubCount = 0;
    if (scene.bathtub.present) {
      conversionLine =
        "CONVERSION: the photographed bathtub is REMOVED and the new shower takes ITS place. ZERO bathtubs may remain anywhere in the final image.";
    }
  } else if (bathtubRequested && !showerRequested) {
    bathtubCount = 1;
    showerCount = 0;
    if (scene.shower.present) {
      conversionLine =
        "CONVERSION: the photographed shower is REMOVED and the new bathtub takes ITS place. ZERO showers may remain anywhere in the final image.";
    }
  } else if (showerRequested && bathtubRequested) {
    showerCount = 1;
    bathtubCount = 1;
  } else {
    showerCount = scene.shower.present ? 1 : 0;
    bathtubCount = scene.bathtub.present ? 1 : 0;
  }
  const basinCount = spec.vanity.replace
    ? spec.vanity.basinCount
    : scene.vanity.present
    ? scene.vanity.basinCount
    : 1;

  blocks.CONTRACT = `[🚨 FIXTURE COUNT CONTRACT — ABSOLUTE PRIORITY, READ FIRST 🚨]
This is ONE real Italian bathroom with real plumbing: each sanitary fixture exists ONCE. The final image MUST contain EXACTLY:
- ${wcCount} toilet (WC)${wcCount === 1 ? " — the single replacement WC in the original sanitary position. NEVER render two toilets, never add an extra WC anywhere else in the room." : " — no toilet is visible in the source and none was requested: do not invent one."}
- ${bidetCount} bidet${bidetRemoved ? " — the existing bidet is REMOVED: repair wall and floor seamlessly where it stood, no bidet anywhere in the final image." : bidetCount === 1 ? " — next to the WC, matching set." : " — do not invent a bidet."}
- ${showerCount} shower and ${bathtubCount} bathtub${conversionLine ? ` — ${conversionLine}` : ""}
- ${basinCount} washbasin${basinCount > 1 ? "s" : ""} on ONE single vanity unit — never a second vanity or extra basin.
A count violation (a second toilet, a leftover bathtub after conversion, both tub and shower when only one is requested, a duplicated vanity) makes the render UNUSABLE for the customer regardless of any other quality. These counts override every other instruction below.`;

  const userPrompt = [
    blocks.CONTRACT,
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
    normalizedConfig.notes ? `[ADDITIONAL USER NOTES]\n${normalizedConfig.notes}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  return {
    systemPrompt: blocks.A,
    userPrompt,
    negativePrompt:
      "generic luxury bathroom, fantasy redesign, wrong room geometry, changed perspective, changed crop, different lighting, floating vanity, bathtub still visible after shower-only request, shower still visible after bathtub-only request, generic closed shower box instead of walk-in, non-target surfaces replaced, distorted tiles, dense small-tile grid despite selected large slabs, wrong tile scale, exposed bulky toilet tank when wall-hung WC is selected, external toilet cistern when wall-hung WC is selected, missing wall flush plate, omitted flush plate, detached flush plate away from WC, duplicated WC, second toilet, extra toilet, floor-standing WC when wall-hung WC is selected, monobloc toilet, toilet pedestal under wall-hung WC, tiny bathtub, miniature freestanding tub, basin-like bathtub, bathtub scaled smaller than a real adult product, 60x60 grid when 120x240 slabs are selected, too many grout joints on slab surfaces, CGI look, illustration, stylized render",
    promptVersion: "2.1.0",
    blocks,
    validation,
    normalizedConfig,
  };
}
