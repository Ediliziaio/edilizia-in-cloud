import {
  SHUTTER_TYPE_DESCRIPTIONS,
  describeOpeningState,
} from "./promptFragments.ts";
import { TIPI_CON_CASSONETTO, anteCompatibili } from "./types.ts";
import type {
  CassonettoPersiana,
  ExistingShutterType,
  PersianaRemovalRule,
  PersianaReplacementManifestTarget,
  PersianaReplacementManifest,
  PersianeRenderConfig,
  PersianeSceneOpening,
  PersianaTechnicalSpecification,
  TipoPersiana,
} from "./types.ts";

function isLouvered(type: ExistingShutterType | TipoPersiana | null): boolean {
  return type === "veneziana_classica" || type === "veneziana_esterna" || type === "gelosia" || type === "brise_soleil";
}

function isSolid(type: ExistingShutterType | TipoPersiana | null): boolean {
  return type === "scuro_pieno" || type === "scuro_cornice";
}

function maybePushRule(list: PersianaRemovalRule[], rule: PersianaRemovalRule | null) {
  if (!rule) return;
  const duplicate = list.find((item) => item.code === rule.code && item.openingIds.join(",") === rule.openingIds.join(","));
  if (!duplicate) list.push(rule);
}

function buildRemoveAllRule(opening: PersianeSceneOpening): PersianaRemovalRule {
  const parts = [
    "remove shutter leaves or curtain",
    opening.hasHinges ? "remove hinges / pintles / fixing plates" : "",
    opening.hasHoldOpenHardware ? "remove hold-open hardware / fermapersiane" : "",
    opening.hasTracks || opening.hasSideGuides ? "remove tracks and side guides" : "",
    opening.hasHeadBox ? "remove head box / cassonetto only if it belongs to the removed shutter system" : "",
  ].filter(Boolean).join(", ");

  return {
    code: `remove_shutter_system_${opening.id}`,
    openingIds: [opening.id],
    summary: `Remove the shutter system from opening ${opening.label} and eliminate all compatible support hardware without leaving hybrid remnants.`,
    repairInstruction: `For opening ${opening.label}, ${parts}; patch former anchor points and restore wall/plaster texture so the facade reads clean and buildable.`,
    preserveInstruction: `Keep window frame, glazing, sill and all non-target facade elements around opening ${opening.label} unchanged.`,
  };
}

function buildLouverToSolidRule(opening: PersianeSceneOpening, spec: PersianaTechnicalSpecification): PersianaRemovalRule | null {
  if (!isLouvered(opening.existingShutterType) || !isSolid(spec.targetType)) return null;
  return {
    code: `convert_louver_to_solid_${opening.id}`,
    openingIds: [opening.id],
    summary: `Convert opening ${opening.label} from a louvered shutter language to a solid panel shutter without leaving any visible slat geometry.`,
    repairInstruction: "Remove all visible louvers completely and replace them with coherent solid-panel construction, updating frame depth, rails and hardware to match a true solid shutter.",
  };
}

function buildSolidToLouverRule(opening: PersianeSceneOpening, spec: PersianaTechnicalSpecification): PersianaRemovalRule | null {
  if (!isSolid(opening.existingShutterType) || !isLouvered(spec.targetType)) return null;
  return {
    code: `convert_solid_to_louver_${opening.id}`,
    openingIds: [opening.id],
    summary: `Convert opening ${opening.label} from solid shutters to a louvered shutter system with believable slat logic.`,
    repairInstruction: "Remove solid-panel reading, introduce real louvers/slats with coherent spacing, frame depth and hinge construction for the selected typology.",
  };
}

function buildBiFoldConversionRule(opening: PersianeSceneOpening, spec: PersianaTechnicalSpecification): PersianaRemovalRule | null {
  // Ricolorare un «a libro» esistente non è una conversione: la regola faceva
  // fallire la validazione («recolor must not introduce geometric rules»).
  if (spec.targetType !== "a_libro" || spec.recolorOnly) return null;
  return {
    code: `convert_to_bifold_${opening.id}`,
    openingIds: [opening.id],
    summary: `Render opening ${opening.label} as a true bi-fold shutter system, not as a simple battente shutter.`,
    repairInstruction: "Introduce multiple folding panels, visible hinge articulation and compact stacking logic; remove incompatible single-leaf or double-leaf swing-shutter construction cues.",
  };
}

/** Il numero di ante scelto è diverso da quello in foto: dirlo, o il modello tiene le ante che vede. */
function buildLeafCountRule(
  opening: PersianeSceneOpening,
  spec: PersianaTechnicalSpecification,
  numeroAnte: number | undefined,
): PersianaRemovalRule | null {
  if (spec.recolorOnly || !spec.targetType || !anteCompatibili(spec.targetType, numeroAnte)) return null;
  if (!opening.hasExistingShutter || opening.leafCount <= 0 || opening.leafCount === numeroAnte) return null;
  return {
    code: `leaf_count_${opening.id}`,
    openingIds: [opening.id],
    summary: `Opening ${opening.label} changes from ${opening.leafCount} to ${numeroAnte} ${numeroAnte === 1 ? "leaf" : "leaves/panels"}.`,
    repairInstruction: "Size every new leaf to the opening; remove hinges and hold-open hardware of leaves that no longer exist and patch their fixing points.",
  };
}

/** Il cassonetto scelto non è quello in foto: toglierlo e ripristinare il muro, o aggiungerlo sopra l'apertura. */
function buildHeadBoxRule(
  opening: PersianeSceneOpening,
  spec: PersianaTechnicalSpecification,
  cassonetto: CassonettoPersiana | undefined,
): PersianaRemovalRule | null {
  if (spec.recolorOnly || !cassonetto || !spec.targetType || !TIPI_CON_CASSONETTO.has(spec.targetType)) return null;
  if (cassonetto === "a_scomparsa" && opening.hasHeadBox) {
    return {
      code: `head_box_hidden_${opening.id}`,
      openingIds: [opening.id],
      summary: `Opening ${opening.label}: the visible head box goes away; the new box is concealed in the lintel.`,
      repairInstruction: "Remove the external box above the opening and restore the wall and lintel cleanly, with no fixing marks; the curtain emerges from a slot under the lintel.",
    };
  }
  if (cassonetto === "esterno_a_vista" && !opening.hasHeadBox) {
    return {
      code: `head_box_visible_${opening.id}`,
      openingIds: [opening.id],
      summary: `Opening ${opening.label}: add a visible external head box right above the opening.`,
      repairInstruction: "Mount the box on the facade above the opening without covering the window frame, the lintel moulding or the sill.",
    };
  }
  return null;
}

function buildRecolorOnlyRule(opening: PersianeSceneOpening, spec: PersianaTechnicalSpecification): PersianaRemovalRule | null {
  if (!spec.recolorOnly) return null;
  return {
    code: `recolor_only_${opening.id}`,
    openingIds: [opening.id],
    summary: `For opening ${opening.label}, change only the shutter finish without altering typology, opening geometry, proportions or hardware placement.`,
    preserveInstruction: "Keep exactly the same shutter geometry, hinge logic, panel/slat construction and accessory layout.",
  };
}

function buildTypeSwitchCleanupRule(opening: PersianeSceneOpening, spec: PersianaTechnicalSpecification): PersianaRemovalRule | null {
  if (spec.recolorOnly || spec.operation === "rimuovi" || !spec.targetType) return null;
  if (opening.existingShutterType === "nessuna") return null;
  if (opening.existingShutterType === spec.targetType) return null;

  return {
    code: `type_switch_cleanup_${opening.id}`,
    openingIds: [opening.id],
    summary: `Eliminate incompatible construction details of the previous shutter system on opening ${opening.label} before rendering the new selected typology.`,
    repairInstruction: "Do not leave hybrid details from the old system: no leftover louvers on solid shutters, no swing-shutter hinges on roller shutters, no missing guides on technical systems, no old hold-open hardware if incompatible with the new state.",
  };
}

export function buildPersianeReplacementManifest(config: Pick<
  PersianeRenderConfig,
  "scene_analysis" | "target_selection" | "technical_specification" | "legacy_config"
>): PersianaReplacementManifest {
  const removals: PersianaRemovalRule[] = [];

  const targetOpenings: PersianaReplacementManifestTarget[] = config.technical_specification.map((spec) => {
    const opening = config.scene_analysis.openings.find((item) => item.id === spec.openingId);
    const currentType = opening?.existingShutterType ?? "unknown";
    const action =
      spec.operation === "cambia_colore"
        ? "recolor"
        : spec.operation === "rimuovi"
          ? "remove"
          : spec.operation === "aggiungi" && !opening?.hasExistingShutter
            ? "add"
            : "replace";

    if (opening) {
      maybePushRule(removals, buildRemoveAllRule(opening));
      maybePushRule(removals, buildLouverToSolidRule(opening, spec));
      maybePushRule(removals, buildSolidToLouverRule(opening, spec));
      maybePushRule(removals, buildBiFoldConversionRule(opening, spec));
      maybePushRule(removals, buildRecolorOnlyRule(opening, spec));
      maybePushRule(removals, buildTypeSwitchCleanupRule(opening, spec));
      maybePushRule(removals, buildLeafCountRule(opening, spec, config.legacy_config.numero_ante));
      maybePushRule(removals, buildHeadBoxRule(opening, spec, config.legacy_config.cassonetto));
    }

    if (spec.operation === "rimuovi") {
      return {
        openingId: spec.openingId,
        openingLabel: spec.openingLabel,
        currentType,
        targetType: "remove" as const,
        action,
        summary: `Opening ${spec.openingLabel}: remove the shutter system entirely and restore the facade cleanly.`,
      };
    }

    if (spec.recolorOnly) {
      return {
        openingId: spec.openingId,
        openingLabel: spec.openingLabel,
        currentType,
        targetType: "recolor_only" as const,
        action,
        summary: `Opening ${spec.openingLabel}: keep the existing shutter typology and geometry, only refinish it in ${spec.finish?.label ?? "the selected finish"}.`,
      };
    }

    return {
      openingId: spec.openingId,
      openingLabel: spec.openingLabel,
      currentType,
      targetType: spec.targetType ?? "recolor_only",
      action,
      summary: `Opening ${spec.openingLabel}: ${action === "add" ? "add" : "replace with"} ${spec.targetType ? SHUTTER_TYPE_DESCRIPTIONS[spec.targetType] : "the selected shutter system"}.`,
    };
  });

  const filteredRemovals = removals.filter((rule) => {
    if (!rule.code.startsWith("remove_shutter_system_")) return true;
    const openingId = rule.openingIds[0];
    const spec = config.technical_specification.find((item) => item.openingId === openingId);
    return spec?.operation === "rimuovi";
  });

  const untouchedOpenings = config.scene_analysis.openings
    .filter((opening) => config.target_selection.preservedOpeningIds.includes(opening.id))
    .map((opening) => ({
      openingId: opening.id,
      openingLabel: opening.label,
      currentType: opening.existingShutterType,
      action: "preserve" as const,
      summary: `Opening ${opening.label} remains untouched, including current shutter state, window frame, sill and surrounding wall.`,
    }));

  const additions = config.technical_specification.flatMap((spec) => {
    if (spec.operation === "rimuovi") return [];
    const lines = [
      spec.recolorOnly
        ? `Refinish opening ${spec.openingLabel} only in ${spec.finish?.label ?? "the selected finish"} while preserving the existing shutter geometry exactly.`
        : `Render opening ${spec.openingLabel} as ${spec.typeDescription}.`,
      spec.materialDescription ? `Material for opening ${spec.openingLabel}: ${spec.materialDescription}.` : "",
      spec.finish ? `Finish for opening ${spec.openingLabel}: ${spec.finish.promptFragment}.` : "",
      `Opening state for opening ${spec.openingLabel}: ${spec.openingState ? describeOpeningState(spec.targetType, spec.openingState) : "match the selected state precisely"}.`,
      spec.louverRule ? `Louver rule for opening ${spec.openingLabel}: ${spec.louverRule}` : "",
      `Installation logic for opening ${spec.openingLabel}: ${spec.installationStyle}.`,
      ...spec.hardwareRules.map((item) => `Hardware for opening ${spec.openingLabel}: ${item}`),
    ];
    return lines.filter(Boolean);
  });

  const keepExactly = Array.from(
    new Set([
      ...config.scene_analysis.untouchedElements,
      ...config.scene_analysis.preserveRigidly,
      ...untouchedOpenings.map((opening) => `opening ${opening.openingLabel} and all of its current shutter details`),
      "wall finish",
      "plaster texture",
      "window glass",
      "window frames",
      "sills",
      "facade proportions",
    ]),
  );

  const integrityConstraints = Array.from(
    new Set([
      "Keep the same facade, same building, same camera angle, same perspective, same wall texture and same image dimensions.",
      "Do not redesign the facade or alter non-target openings.",
      "Preserve all non-target architectural details exactly.",
      "Any removal or conversion must leave no hybrid old/new shutter artifacts.",
      ...keepExactly.map((item) => `Preserve exactly: ${item}.`),
    ]),
  );

  return {
    operationSummary: config.legacy_config.operazione,
    targetOpenings,
    untouchedOpenings,
    additions,
    removals: filteredRemovals,
    keepExactly,
    integrityConstraints,
  };
}
