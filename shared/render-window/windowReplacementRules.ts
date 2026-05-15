// shared/render-window/windowReplacementRules.ts — v8 (2026-05-14)
// CHANGELOG v8:
//   + install_electric_shutter_switch: nuova rule che AGGIUNGE il bottone elettrico
//     al posto della cinghia rimossa
//   + remove_horizontal_transom: nuova rule per rimozione traverso
//   + recompose_sash_count: nuova rule per cambio numero ante
//   + hidden_hinges_directive: nuova rule per cerniere a scomparsa
//   ↺ buildMotorizationRemovalRule rinominato in buildMotorizationConversionRules
//     (ora ritorna ARRAY di 2 rule: rimuovi + installa)

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
  const duplicate = list.find(
    (item) => item.code === rule.code && item.openingIds.join(",") === rule.openingIds.join(","),
  );
  if (!duplicate) list.push(rule);
}

function describeBeltPlacement(opening: WindowSceneOpening): string {
  switch (opening.beltPlacement) {
    case "right_wall": return "on the right wall beside the opening";
    case "left_wall": return "on the left wall beside the opening";
    case "right_reveal": return "on the right reveal beside the opening";
    case "left_reveal": return "on the left reveal beside the opening";
    case "center": return "near the centerline of the opening";
    default: return "near the opening side wall/reveal";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// v8 — Motorization: rimuovi cinghia E installa bottone elettrico (2 rule)
// ─────────────────────────────────────────────────────────────────────────────

function buildMotorizationConversionRules(
  opening: WindowSceneOpening,
  spec: WindowTechnicalSpecification,
): WindowRemovalRule[] {
  if (!spec.shutter.isMotorized || (!opening.hasBelt && !opening.hasBeltBox)) return [];

  const placement = describeBeltPlacement(opening);
  const rules: WindowRemovalRule[] = [];

  // Rule 1: rimuovi cinghia + winder (placca grande)
  rules.push({
    code: "remove_manual_belt_system",
    openingIds: [opening.id],
    summary:
      `Remove every visible manual roller-shutter control component ${placement} around ` +
      `opening ${opening.label}: belt/strap/cord, wall winder plate/box (which is typically ` +
      `a tall vertical box ~80x140mm or larger), belt exit slot and any residual vertical ` +
      `trim belonging to the old manual system. Note the ORIGINAL FOOTPRINT of the old plate ` +
      `on the wall — you will need to repair the area that the new smaller electric switch ` +
      `will NOT cover.`,
    repairInstruction:
      `Prepare the wall surface where the old winder was. The new electric switch is SMALLER ` +
      `than the old plate, so a portion of the previously-covered wall will be exposed. ` +
      `That exposed area MUST be seamlessly plastered/stuccoed flush, then repainted with ` +
      `the EXACT same paint color and finish as the surrounding wall. NO halo, NO patch, ` +
      `NO shade difference must remain visible.`,
  });

  // Rule 2: installa bottone elettrico (placca piccola) + wall repair esplicita
  if (spec.shutter.electricButton?.install) {
    rules.push({
      code: "install_electric_shutter_switch",
      openingIds: [opening.id],
      summary:
        `Install a new electric roller-shutter switch plate at opening ${opening.label}: ` +
        `${spec.shutter.electricButton.description} ` +
        `The new switch is centered at approximately ${spec.shutter.electricButton.heightFromFloor} ` +
        `from the floor, ${placement}, occupying the upper-middle area of where the old ` +
        `winder used to be (since the new plate is smaller, ~80x80mm).`,
      preserveInstruction:
        `Match the brand-look of any other wall switches visible in the room for visual consistency. ` +
        `The new switch must look professionally installed, flush with the wall. ` +
        `Verify that the wall AROUND the new switch (where the old larger plate used to extend) ` +
        `is completely repaired and repainted with NO visible trace of the previous installation: ` +
        `no shadow, no halo, no different paint shade, no edge line.`,
    });
  }

  return rules;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sliding / cassonetto / frame cleanup — invariato dalla v7
// ─────────────────────────────────────────────────────────────────────────────

function buildSlidingCleanupRule(
  opening: WindowSceneOpening,
  spec: WindowTechnicalSpecification,
): WindowRemovalRule | null {
  if (!spec.desiredOpeningType.includes("scorrevole")) return null;
  return {
    code: "remove_swing_hardware_for_sliding",
    openingIds: [opening.id],
    summary:
      `For opening ${opening.label}, remove any visual hint of traditional swing hardware or ` +
      `battente geometry if incompatible with the new sliding system.`,
    repairInstruction:
      "Keep the original wall opening dimensions unchanged while showing correct sliding tracks and panel overlaps.",
  };
}

function buildCassonettoReplacementRule(
  opening: WindowSceneOpening,
  spec: WindowTechnicalSpecification,
): WindowRemovalRule | null {
  if (!spec.cassonetto.replace) return null;
  return {
    code: "replace_cassonetto",
    openingIds: [opening.id],
    summary:
      `Replace the roller box/cassonetto above opening ${opening.label} with the newly specified ` +
      `cassonetto finish while keeping the original envelope and proportions very close to the source photo.`,
    repairInstruction:
      `Preserve the surrounding wall exactly, modifying only the roller-box element itself and its ` +
      `direct contact lines. ${spec.cassonetto.dimensionRule}`,
  };
}

function buildFrameCleanupRule(
  opening: WindowSceneOpening,
  spec: WindowTechnicalSpecification,
): WindowRemovalRule {
  const base =
    `Replace the existing frame of opening ${opening.label} with ${describeSpec(spec)} ` +
    `while preserving the same wall opening, sill, reveal depth, lighting and surrounding geometry.`;
  return {
    code: `replace_frame_${opening.id}`,
    openingIds: [opening.id],
    summary: base,
    preserveInstruction:
      "Do not alter any non-target opening or any surrounding object outside the edited frame/accessory area.",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// v8 — Nuove rule: cambio numero ante / traverso rimuovi / cerniere a scomparsa
// ─────────────────────────────────────────────────────────────────────────────

function buildCompositionChangeRule(
  opening: WindowSceneOpening,
  spec: WindowTechnicalSpecification,
): WindowRemovalRule | null {
  if (!spec.compositionChange) return null;
  const { fromSashCount, toSashCount, instruction } = spec.compositionChange;
  return {
    code: "recompose_sash_count",
    openingIds: [opening.id],
    summary:
      `Change sash composition for opening ${opening.label}: from ${fromSashCount} sashes ` +
      `(source photo) to ${toSashCount} sashes (new window). ${instruction}`,
    preserveInstruction:
      "Keep the SAME outer wall opening width and height. Modify only the internal subdivision of glazing.",
  };
}

function buildTransomRemovalRule(
  opening: WindowSceneOpening,
  spec: WindowTechnicalSpecification,
): WindowRemovalRule | null {
  if (!spec.transomRule) return null;
  // La rule è "removal" solo quando rimuoviamo effettivamente il traverso
  const isRemoval = spec.transomRule.toLowerCase().includes("remove the horizontal transom");
  if (!isRemoval) return null;
  return {
    code: "remove_horizontal_transom",
    openingIds: [opening.id],
    summary:
      `Remove the horizontal transom from opening ${opening.label}. ` +
      `Each sash must become a SINGLE full-height glazed panel with NO horizontal divider.`,
    repairInstruction:
      "Replace the area below the former transom with continuous clear glass. Do not leave a remnant horizontal frame element.",
  };
}

function buildHiddenHingesDirective(
  opening: WindowSceneOpening,
  spec: WindowTechnicalSpecification,
): WindowRemovalRule | null {
  if (spec.hingeMode !== "hidden") return null;
  return {
    code: "apply_hidden_hinges",
    openingIds: [opening.id],
    summary:
      `Apply HIDDEN HINGES to opening ${opening.label}: NO visible hinge knuckles, caps or ` +
      `cylinders on the hinged side stile. The sash side stile must appear clean and continuous.`,
    preserveInstruction:
      "The hinge mechanism is fully concealed inside the frame profile when the window is closed. " +
      "Do not render any traditional European hinge knuckle.",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Manifest builder (v8)
// ─────────────────────────────────────────────────────────────────────────────

export function buildWindowReplacementManifest(
  config: Pick<WindowRenderConfig, "scene_analysis" | "target_selection" | "technical_specification">,
): WindowReplacementManifest {
  const rules: WindowRemovalRule[] = [];

  const targetOpenings = config.technical_specification.map((spec) => {
    const opening = config.scene_analysis.openings.find((o) => o.id === spec.openingId);
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

    // Rules base
    maybePushRule(rules, buildFrameCleanupRule(opening, spec));
    buildMotorizationConversionRules(opening, spec).forEach((r) => maybePushRule(rules, r));
    maybePushRule(rules, buildSlidingCleanupRule(opening, spec));
    maybePushRule(rules, buildCassonettoReplacementRule(opening, spec));

    // v8 rules
    maybePushRule(rules, buildCompositionChangeRule(opening, spec));
    maybePushRule(rules, buildTransomRemovalRule(opening, spec));
    maybePushRule(rules, buildHiddenHingesDirective(opening, spec));

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
      // ── v8 — Central handle addition (esplicita)
      spec.centralHandle
        ? `Opening ${spec.openingLabel}: install ONE single ${spec.handleStyle} handle in ${spec.handleFinish}, mounted EXACTLY at the geometric center of the meeting stiles between the two sashes. Do NOT add a second handle on the other sash.`
        : `Use ${spec.handleStyle} hardware in ${spec.handleFinish} on opening ${spec.openingLabel}.`,
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
    // v8 — Electric switch plate
    if (spec.shutter.electricButton?.install) {
      lines.push(
        `Install an electric roller-shutter switch plate at opening ${spec.openingLabel}: ${spec.shutter.electricButton.description}`,
      );
    }
    // v8 — Reduced node
    if (spec.reducedNode) {
      lines.push(
        `Use reduced-node sightlines on opening ${spec.openingLabel}: central mullion visibly thinner than outer frame perimeter.`,
      );
    }
    // v8 — Hidden hinges
    if (spec.hingeMode === "hidden") {
      lines.push(
        `Apply hidden-hinges configuration to opening ${spec.openingLabel}: NO visible hinge hardware anywhere on the hinged side stile.`,
      );
    }
    // v8 — Composition change
    if (spec.compositionChange) {
      lines.push(
        `Composition change for opening ${spec.openingLabel}: ${spec.compositionChange.instruction}`,
      );
    }
    // v8 — Transom rule
    if (spec.transomRule) {
      lines.push(`Transom directive for opening ${spec.openingLabel}: ${spec.transomRule}`);
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
      "Do not change the architecture of the opening unless the selected new typology or composition change explicitly requires compatible sash geometry.",
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
