import type {
  WindowRemovalRule,
  WindowReplacementManifest,
  WindowRenderConfig,
  WindowSceneOpening,
  WindowTechnicalSpecification,
} from "./types.ts";

function describeSpec(spec: WindowTechnicalSpecification): string {
  const typeLabel = spec.desiredOpeningType.replace(/_/g, " ");
  const finishLabel = spec.finish.mode === "legno"
    ? `${spec.finish.name} wood-effect finish`
    : `${spec.finish.name}${spec.finish.ral ? ` (RAL ${spec.finish.ral})` : ""}`;
  return `${typeLabel}, ${spec.material}, ${finishLabel}, ${spec.desiredSashCount} sash${spec.desiredSashCount > 1 ? "es" : ""}`;
}

function maybePushRule(list: WindowRemovalRule[], rule: WindowRemovalRule | null) {
  if (!rule) return;
  const duplicate = list.find((item) => item.code === rule.code && item.openingIds.join(",") === rule.openingIds.join(","));
  if (!duplicate) list.push(rule);
}

function buildMotorizationRemovalRule(opening: WindowSceneOpening, spec: WindowTechnicalSpecification): WindowRemovalRule | null {
  if (!spec.shutter.isMotorized || (!opening.hasBelt && !opening.hasBeltBox)) return null;
  return {
    code: "remove_manual_belt_system",
    openingIds: [opening.id],
    summary: `Remove every visible manual roller-shutter belt component around opening ${opening.label}: belt, wall winder plate/box and belt exit slot.`,
    repairInstruction: "Repair the surrounding wall seamlessly with identical plaster/paint texture so no trace of the previous manual system remains.",
    preserveInstruction: "Keep all other wall surfaces around the opening pixel-identical.",
  };
}

function buildSlidingCleanupRule(opening: WindowSceneOpening, spec: WindowTechnicalSpecification): WindowRemovalRule | null {
  if (!spec.desiredOpeningType.includes("scorrevole")) return null;
  return {
    code: "remove_swing_hardware_for_sliding",
    openingIds: [opening.id],
    summary: `For opening ${opening.label}, remove any visual hint of traditional swing hardware or battente geometry if incompatible with the new sliding system.`,
    repairInstruction: "Keep the original wall opening dimensions unchanged while showing correct sliding tracks and panel overlaps.",
  };
}

function buildCassonettoReplacementRule(opening: WindowSceneOpening, spec: WindowTechnicalSpecification): WindowRemovalRule | null {
  if (!spec.cassonetto.replace) return null;
  return {
    code: "replace_cassonetto",
    openingIds: [opening.id],
    summary: `Replace the roller box/cassonetto above opening ${opening.label} with the newly specified cassonetto finish while keeping the original envelope and proportions very close to the source photo.`,
    repairInstruction: `Preserve the surrounding wall exactly, modifying only the roller-box element itself and its direct contact lines. ${spec.cassonetto.dimensionRule}`,
  };
}

function buildFrameCleanupRule(opening: WindowSceneOpening, spec: WindowTechnicalSpecification): WindowRemovalRule {
  const base = `Replace the existing frame of opening ${opening.label} with ${describeSpec(spec)} while preserving the same wall opening, sill, reveal depth, lighting and surrounding geometry.`;
  return {
    code: `replace_frame_${opening.id}`,
    openingIds: [opening.id],
    summary: base,
    preserveInstruction: "Do not alter any non-target opening or any surrounding object outside the edited frame/accessory area.",
  };
}

export function buildWindowReplacementManifest(config: Pick<
  WindowRenderConfig,
  "scene_analysis" | "target_selection" | "technical_specification"
>): WindowReplacementManifest {
  const rules: WindowRemovalRule[] = [];
  const targetOpenings = config.technical_specification.map((spec) => {
    const opening = config.scene_analysis.openings.find((item) => item.id === spec.openingId);
    if (!opening) {
      return {
        openingId: spec.openingId,
        openingLabel: spec.openingLabel,
        currentType: spec.desiredOpeningType,
        targetType: spec.desiredOpeningType,
        action: "replace" as const,
        summary: `Replace opening ${spec.openingLabel} with ${describeSpec(spec)}.`,
      };
    }

    maybePushRule(rules, buildFrameCleanupRule(opening, spec));
    maybePushRule(rules, buildMotorizationRemovalRule(opening, spec));
    maybePushRule(rules, buildSlidingCleanupRule(opening, spec));
    maybePushRule(rules, buildCassonettoReplacementRule(opening, spec));

    return {
      openingId: opening.id,
      openingLabel: opening.label,
      currentType: opening.typeCurrent,
      targetType: spec.desiredOpeningType,
      action: "replace" as const,
      summary: `Opening ${opening.label}: replace existing ${opening.typeCurrent.replace(/_/g, " ")} with ${describeSpec(spec)}.`,
    };
  });

  const untouchedOpenings = config.scene_analysis.openings
    .filter((opening) => config.target_selection.preservedOpeningIds.includes(opening.id))
    .map((opening) => ({
      openingId: opening.id,
      openingLabel: opening.label,
      currentType: opening.typeCurrent,
      action: "preserve" as const,
      summary: `Opening ${opening.label} remains completely untouched, including frame, glazing, shutter accessories and surrounding wall.`,
    }));

  const additions = config.technical_specification.flatMap((spec) => {
    const lines = [
      `Install ${describeSpec(spec)} on opening ${spec.openingLabel}.`,
      `Use ${spec.handleStyle} hardware in ${spec.handleFinish} on opening ${spec.openingLabel}.`,
    ];
    if (spec.cassonetto.replace && spec.cassonetto.colorLabel) {
      lines.push(`Render the cassonetto of opening ${spec.openingLabel} in ${spec.cassonetto.colorLabel}.`);
      lines.push(spec.cassonetto.dimensionRule);
    }
    if (spec.shutter.replace && spec.shutter.colorLabel) {
      lines.push(`Render the shading system of opening ${spec.openingLabel} in ${spec.shutter.colorLabel}.`);
    }
    if (spec.shutter.replace) {
      lines.push(spec.shutter.placementRule);
    }
    if (spec.reducedNode) {
      lines.push(`Use reduced-node sightlines on opening ${spec.openingLabel} to maximize visible glass.`);
    }
    return lines;
  });

  const keepExactly = Array.from(
    new Set([
      ...config.scene_analysis.untouchedElements,
      ...untouchedOpenings.map((opening) => `opening ${opening.openingLabel} and all of its accessories`),
      ...config.scene_analysis.openings
        .filter((opening) => config.target_selection.selectedOpeningIds.includes(opening.id))
        .flatMap((opening) => [
          opening.hasCurtains ? `curtains around opening ${opening.label}` : null,
          opening.radiatorNearby ? `radiator near opening ${opening.label}` : null,
          opening.hasSill ? `sill of opening ${opening.label}` : null,
          opening.hasGrates ? `grates/bars on opening ${opening.label} unless explicitly part of replacement` : null,
          opening.hasPersiane ? `external shutters on opening ${opening.label} unless explicitly part of replacement` : null,
        ])
        .filter((item): item is string => Boolean(item)),
    ]),
  );

  const integrityConstraints = Array.from(
    new Set([
      "Keep the same room, same camera angle, same lens feel, same crop and same image proportions.",
      "Preserve floor, walls, curtains, radiators, furniture, skirting boards, sockets, pictures, plants and outdoor scenery.",
      "Do not alter non-target openings.",
      "Do not change the architecture of the opening unless the selected new typology explicitly requires compatible sash geometry.",
      "Preserve all untouched surfaces exactly, except for seamless repairs required by explicit removal rules.",
      ...keepExactly.map((item) => `Preserve exactly: ${item}.`),
    ]),
  );

  return {
    targetOpenings,
    untouchedOpenings,
    additions,
    removals: rules,
    keepExactly,
    integrityConstraints,
  };
}
