import {
  DEFAULT_NEGATIVE_CONSTRAINTS,
  DEFAULT_QUALITY_DIRECTIVES,
  OPENING_STATE_DESCRIPTIONS,
} from "./promptFragments.ts";
import { ensurePersianeRenderConfig } from "./persianeRenderConfig.ts";
import { validatePersianePromptConfig } from "./persianePromptValidation.ts";
import type { PersianePromptBuildResult, PersianeRenderConfig, PersianeSceneOpening } from "./types.ts";

function bullets(lines: Array<string | null | undefined>): string {
  return lines
    .filter((line): line is string => Boolean(line && line.trim().length > 0))
    .map((line) => `- ${line}`)
    .join("\n");
}

function describeOpening(opening: PersianeSceneOpening): string {
  return [
    `Opening ${opening.label}: position ${opening.position}, kind ${opening.openingKind}, apparent size ${opening.apparentSize}.`,
    `Current shutter state: ${opening.hasExistingShutter ? opening.existingShutterType.replace(/_/g, " ") : "no shutter currently visible"}.`,
    `Current material/color: ${opening.materialPerceived} / ${opening.colorPerceived}.`,
    `Current opening state: ${opening.openingStatePerceived.replace(/_/g, " ")}.`,
    `Current details: ${opening.hasLouvers ? "louvers visible" : "no visible louvers"}, ${opening.hasHinges ? "hinges visible" : "no visible hinges"}, ${opening.hasHoldOpenHardware ? "hold-open hardware visible" : "no visible hold-open hardware"}, ${opening.hasTracks || opening.hasSideGuides ? "tracks or guides visible" : "no tracks/guides visible"}, ${opening.hasHeadBox ? "head box/cassonetto visible" : "no head box visible"}.`,
    `Geometry and preservation: ${opening.geometryNotes}. ${opening.preserveNotes}`,
  ].join(" ");
}

function describeTarget(spec: PersianeRenderConfig["technical_specification"][number]): string {
  if (spec.operation === "rimuovi") {
    return `Opening ${spec.openingLabel}: remove shutters completely and restore facade cleanly.`;
  }
  if (spec.recolorOnly) {
    return `Opening ${spec.openingLabel}: recolor only in ${spec.finish?.label ?? "the selected finish"} while preserving identical shutter geometry and hardware placement.`;
  }

  return [
    `Opening ${spec.openingLabel}: target shutter typology ${spec.targetType?.replace(/_/g, " ") ?? "selected type"}.`,
    `Construction language: ${spec.typeDescription}.`,
    spec.materialDescription ? `Material: ${spec.materialDescription}.` : "",
    spec.finish ? `Finish: ${spec.finish.promptFragment}.` : "",
    `Selected typology must remain unmistakable and must not drift toward a different shutter family.`,
    `Leaf/panel logic: ${spec.leafConfiguration}.`,
    spec.profileContrastColor ? `Outer frame/profile contrast color: ${spec.profileContrastColor}.` : "",
  ].filter(Boolean).join(" ");
}

export function buildPersianePrompt(
  rawConfig: Record<string, unknown>,
  rawAnalysis?: unknown,
  photoMeta?: PersianeRenderConfig["photo_meta"],
): PersianePromptBuildResult {
  const normalizedConfig = ensurePersianeRenderConfig(rawConfig, rawAnalysis, photoMeta ?? null);
  const validation = validatePersianePromptConfig(normalizedConfig);
  const blocks: Record<string, string> = {};

  blocks.A = `[BLOCK A - MISSION]
You are a SURGICAL PHOTOREALISTIC IMAGE EDITOR specialized in architectural shutter and external shading replacement.
Modify exactly the requested shutters / oscuranti and leave everything else unchanged.

MANDATORY CORE CONSTRAINTS:
- same facade
- same building
- same camera angle
- same windows
- same wall texture
- same geometry
- same lighting conditions
- no artistic reinterpretation
- no redesign of the facade`;

  blocks.B = `[BLOCK B - EXISTING FACADE INVENTORY]
Facade type: ${normalizedConfig.scene_analysis.facadeType}
Building style: ${normalizedConfig.scene_analysis.buildingStyle}
Openings visible: ${normalizedConfig.scene_analysis.openingsVisible}
Camera angle: ${normalizedConfig.scene_analysis.cameraAngle}
Lighting condition: ${normalizedConfig.scene_analysis.lightingCondition}
Wall texture/color: ${normalizedConfig.scene_analysis.wallTexture} / ${normalizedConfig.scene_analysis.wallColor}
Preserve anchors: ${normalizedConfig.scene_analysis.preserveRigidly.join(", ")}

${bullets(normalizedConfig.scene_analysis.openings.map(describeOpening))}`;

  blocks.C = `[BLOCK C - OPERATION MANIFEST]
Operation: ${normalizedConfig.legacy_config.operazione}
Scope mode: ${normalizedConfig.target_selection.mode}
Target openings: ${normalizedConfig.target_selection.targetLabels.join(", ") || "none"}
Untouched openings: ${normalizedConfig.replacement_manifest.untouchedOpenings.map((item) => item.openingLabel).join(", ") || "none"}

${bullets(normalizedConfig.replacement_manifest.targetOpenings.map((item) => item.summary))}`;

  blocks.D = `[BLOCK D - TARGET OPENINGS MAP]
${bullets(normalizedConfig.technical_specification.map(describeTarget))}

Untouched openings map:
${bullets(normalizedConfig.replacement_manifest.untouchedOpenings.map((item) => item.summary))}`;

  blocks.E = `[BLOCK E - NEW SHUTTER SPECIFICATION]
${bullets(
    normalizedConfig.technical_specification.map((spec) => {
      if (spec.operation === "rimuovi") {
        return `Opening ${spec.openingLabel}: no new shutter should remain after removal.`;
      }
      return [
        `Opening ${spec.openingLabel}: ${spec.targetType?.replace(/_/g, " ") ?? "existing typology"} in ${spec.finish?.label ?? "existing finish"}.`,
        `Opening mechanism / state: ${spec.openingState ? OPENING_STATE_DESCRIPTIONS[spec.openingState] : "remove shutter system completely"}.`,
        spec.finish?.mode === "legno"
          ? `Exact finish identity: keep the precise ${spec.finish.label} look, with believable grain and no drift into another wood species or generic brown wood.`
          : `Exact finish identity: keep the precise ${spec.finish?.label ?? "selected finish"} with no drift into another RAL or approximate adjacent color.`,
        `Installation: ${spec.installationStyle}.`,
      ].join(" ");
    }),
  )}`;

  blocks.F = `[BLOCK F - OPENING / ANGLE / POSITION RULES]
${bullets(
    normalizedConfig.technical_specification.map((spec) => {
      if (!spec.openingState) return `Opening ${spec.openingLabel}: no opening angle because the shutter system is removed.`;
      return `Opening ${spec.openingLabel}: ${OPENING_STATE_DESCRIPTIONS[spec.openingState]}. ${spec.hardwareRules.join(" ")}`;
    }),
  )}`;

  blocks.G = `[BLOCK G - SLATS / LOUVERS RULES]
${bullets(
    normalizedConfig.technical_specification.map((spec) =>
      spec.louverRule
        ? `Opening ${spec.openingLabel}: ${spec.louverRule}.`
        : `Opening ${spec.openingLabel}: no louvers must appear unless they belong to the selected shutter typology.`,
    ),
  )}`;

  blocks.H = `[BLOCK H - HARDWARE / MOUNTING RULES]
${bullets(
    normalizedConfig.technical_specification.flatMap((spec) =>
      spec.hardwareRules.map((rule) => `Opening ${spec.openingLabel}: ${rule}`),
    ),
  )}`;

  blocks.I = `[BLOCK I - REMOVAL / CONVERSION RULES]
${bullets(
    normalizedConfig.replacement_manifest.removals.flatMap((rule) => [
      rule.summary,
      rule.repairInstruction ? `Repair rule: ${rule.repairInstruction}` : "",
      rule.preserveInstruction ? `Preserve rule: ${rule.preserveInstruction}` : "",
    ]),
  )}`;

  blocks.J = `[BLOCK J - FACADE INTEGRITY]
${bullets(normalizedConfig.integrity_constraints)}`;

  blocks.K = `[BLOCK K - PHOTOREALISM RULES]
- realistic materials
- correct light response
- believable shadow casting
- correct contact shadows
- proper perspective
- no floating elements
- no geometry warping
- no fake showroom look
- installation details must look buildable in reality
- premium architectural visualization quality
- selected shutter type, opening angle, louver behavior and finish must be visually exact, not just approximately similar
- wood effects must match the chosen species/finish and RAL finishes must match the selected tone without chromatic drift`;

  blocks.L = `[BLOCK L - NEGATIVE CONSTRAINTS]
${bullets(DEFAULT_NEGATIVE_CONSTRAINTS)}`;

  blocks.M = `[BLOCK M - QUALITY BAR]
${bullets([
    ...DEFAULT_QUALITY_DIRECTIVES,
    ...normalizedConfig.quality_directives,
    validation.isValid
      ? "validation passed: target openings, conversion rules, untouched openings and typology details are explicit"
      : `validation warnings: missing sections ${validation.missingSections.join(", ") || "none"}; missing business rules ${validation.missingBusinessRules.join(", ") || "none"}`,
  ])}`;

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
    normalizedConfig.notes ? `[ADDITIONAL USER NOTES]\n${normalizedConfig.notes}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  return {
    systemPrompt: blocks.A,
    userPrompt,
    negativePrompt:
      "facade redesign, changed wall color, different building, altered window geometry, extra openings, stylized image, hybrid shutter system, leftover louvers on solid shutters, leftover hinges after removal, floating shutters, wrong perspective, fake CGI look, generic shutter type, wrong opening angle, wrong louver state, wrong wood effect, wrong RAL tone",
    promptVersion: "2.0.0",
    blocks,
    validation,
    normalizedConfig,
  };
}
