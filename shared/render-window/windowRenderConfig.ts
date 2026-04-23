import {
  PROFILI_MANIGLIA_CENTRALE_COMPATIBILI,
  WIZARD_HW_COLORS,
  findWizardRal,
  findWizardWood,
  getWizardCassonettoMeta,
  getWizardHardwareMeta,
  getWizardHandleTypeMeta,
  getWizardTapparellaMeta,
  type WizardCassMat,
  type WizardHandleType,
  type WizardHw,
  type WizardProfilo,
  type WizardState,
  type WizardTapp,
  type WizardTipo,
} from "./catalog.ts";
import type {
  WindowMaterial,
  WindowOpeningType,
  WindowPhotoMeta,
  WindowRenderConfig,
  WindowSceneAnalysis,
  WindowTechnicalSpecification,
} from "./types.ts";
import { normalizeWindowSceneAnalysis, createWindowTargetSelection } from "./windowSceneAnalysis.ts";
import { buildWindowReplacementManifest } from "./windowReplacementRules.ts";

export interface WindowRenderBuildOptions {
  notes?: string;
  sceneAnalysis?: unknown;
  selectedOpeningIds?: string[] | null;
  photoMeta?: WindowPhotoMeta | null;
}

function mapTipoToApertura(tipo: WizardTipo): { apertura: WindowOpeningType; num_ante: number; desiredElement: WindowTechnicalSpecification["desiredElement"] } {
  switch (tipo) {
    case "F1A":
      return { apertura: "battente_1_anta", num_ante: 1, desiredElement: "window" };
    case "F2A":
      return { apertura: "battente_2_ante", num_ante: 2, desiredElement: "window" };
    case "F3A":
      return { apertura: "battente_3_ante", num_ante: 3, desiredElement: "window" };
    case "PF1A":
      return { apertura: "portafinestra", num_ante: 1, desiredElement: "door_window" };
    case "PF2A":
      return { apertura: "portafinestra", num_ante: 2, desiredElement: "door_window" };
    case "PF3A":
      return { apertura: "portafinestra", num_ante: 3, desiredElement: "door_window" };
    case "SCORR":
      return { apertura: "scorrevole_alzante", num_ante: 2, desiredElement: "sliding_panel" };
  }
}

function mapProfiloToMateriale(profilo: WizardProfilo): {
  materiale: Exclude<WindowMaterial, "unknown">;
  stile_telaio: string;
  profilo_dim: string;
  profilo_forma: string;
  slimness: string;
} {
  switch (profilo) {
    case "pvc":
      return {
        materiale: "pvc",
        stile_telaio: "europeo_classico",
        profilo_dim: "70mm",
        profilo_forma: "europeo",
        slimness: "balanced residential sightline",
      };
    case "alluminio":
      return {
        materiale: "alluminio",
        stile_telaio: "europeo_classico",
        profilo_dim: "70mm",
        profilo_forma: "squadrato",
        slimness: "slim architectural sightline",
      };
    case "minimal":
      return {
        materiale: "alluminio",
        stile_telaio: "minimal_squadrato",
        profilo_dim: "70mm",
        profilo_forma: "squadrato",
        slimness: "very slim minimal sightline",
      };
    case "legno":
      return {
        materiale: "legno",
        stile_telaio: "classico_arrotondato",
        profilo_dim: "82mm",
        profilo_forma: "arrotondato",
        slimness: "warmer traditional sightline",
      };
    case "legno_alluminio":
      return {
        materiale: "legno_alluminio",
        stile_telaio: "europeo_classico",
        profilo_dim: "82mm",
        profilo_forma: "europeo",
        slimness: "premium hybrid sightline",
      };
  }
}

function mapFrameFinish(colorId: string) {
  const wood = findWizardWood(colorId);
  if (wood) {
    return {
      mode: "legno" as const,
      name: wood.nome,
      ral: null,
      hex: wood.hex,
      finish: "wood-grain textured surface",
      woodEffectId: wood.id,
      promptFragment: wood.fragment,
    };
  }

  const ral = findWizardRal(colorId) ?? findWizardRal("9016");
  return {
    mode: "ral" as const,
    name: ral?.nome ?? "Bianco Traffico",
    ral: ral?.id ?? "9016",
    hex: ral?.hex ?? "#F1F0EA",
    finish: "smooth matte finish",
    woodEffectId: null,
    promptFragment: null,
  };
}

function mapHardware(hwId: WizardHw, handleTypeId: WizardHandleType, openingType: WindowOpeningType) {
  const meta = getWizardHardwareMeta(hwId);
  const handleMeta = getWizardHandleTypeMeta(handleTypeId);
  const resolvedHandleStyle = openingType.includes("scorrevole")
    ? "alzante"
    : handleTypeId === "alzante"
      ? "classica_dritta"
      : handleMeta.id;
  return {
    handleStyle: resolvedHandleStyle,
    handleFinish: meta.finish,
    handleColorId: meta.id,
    hingeFinish:
      hwId === "nero_opaco"
        ? "matte black"
        : hwId === "bronzo"
          ? "antique bronze"
          : hwId === "oro"
            ? "polished gold"
            : hwId === "inox"
              ? "brushed stainless steel"
              : hwId === "titanio"
                ? "titanium anodized"
                : "polished chrome",
    hardwarePayload: {
      maniglia_stile: resolvedHandleStyle,
      colore_hardware_id: meta.hw_id,
      colore_hardware_finish: meta.finish,
    },
    cerniereColor: hwId === "nero_opaco"
      ? "nero_opaco"
      : hwId === "bronzo"
        ? "bronzo"
        : hwId === "oro"
          ? "oro"
          : hwId === "inox"
            ? "inox"
            : "argento",
  };
}

function mapCassonetto(
  state: WizardState,
  finish: ReturnType<typeof mapFrameFinish>,
) {
  if (!state.cass) {
    return {
      replace: false,
      payload: { azione: "mantieni" as const },
      materialLabel: "Keep existing cassonetto",
      colorMode: null,
      colorLabel: null,
    };
  }

  const meta = getWizardCassonettoMeta(state.cassMat);
  let material = "pvc_tradizionale";
  if (state.cassMat === "alluminio") material = "alluminio_coibentato";

  let colorMode: "ral" | "legno" = finish.mode;
  let colorLabel: string | null = null;

  if (state.cassMat === "pvc_bianco") {
    colorMode = "ral";
    colorLabel = "Bianco Traffico (RAL 9016)";
  } else if (state.cassMat === "colore_custom") {
    const custom = findWizardRal(state.cassCol);
    colorMode = "ral";
    colorLabel = custom ? `${custom.nome} (RAL ${custom.id})` : null;
  } else {
    colorLabel = finish.mode === "legno"
      ? `${finish.name} wood-effect`
      : `${finish.name}${finish.ral ? ` (RAL ${finish.ral})` : ""}`;
  }

  return {
    replace: true,
    payload: {
      azione: "sostituisci" as const,
      materiale: material,
      colore_mode: colorMode,
    },
    materialLabel: meta.label,
    colorMode,
    colorLabel,
  };
}

function mapTapparella(
  state: WizardState,
  finish: ReturnType<typeof mapFrameFinish>,
) {
  if (state.tapp === "no") {
    return {
      replace: false,
      isMotorized: false,
      payload: { azione: "mantieni" as const },
      colorMode: null,
      colorLabel: null,
    };
  }

  const meta = getWizardTapparellaMeta(state.tapp);
  const custom = state.tappCol !== "stesso" ? findWizardRal(state.tappCol) : null;
  const colorMode: "ral" | "legno" = custom ? "ral" : finish.mode;
  const colorLabel = custom
    ? `${custom.nome} (RAL ${custom.id})`
    : finish.mode === "legno"
      ? `${finish.name} wood-effect`
      : `${finish.name}${finish.ral ? ` (RAL ${finish.ral})` : ""}`;

  return {
    replace: true,
    isMotorized: state.tapp === "motorizzate",
    payload: {
      azione: "sostituisci" as const,
      materiale: "pvc_avvolgibile",
      cinghia: state.tapp === "motorizzate" ? "senza_cinghia" : "con_cinghia",
      colore_mode: colorMode,
    },
    label: meta.label,
    colorMode,
    colorLabel,
  };
}

function ensureSentence(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function describeManualControlPlacement(
  opening: WindowSceneAnalysis["openings"][number],
): string {
  switch (opening.beltPlacement) {
    case "right_wall":
      return "on the right wall beside the opening";
    case "left_wall":
      return "on the left wall beside the opening";
    case "right_reveal":
      return "on the right reveal beside the opening";
    case "left_reveal":
      return "on the left reveal beside the opening";
    case "center":
      return "near the centerline of the opening";
    default:
      return "near the opening side wall/reveal";
  }
}

function buildManualControlCleanupRule(
  opening: WindowSceneAnalysis["openings"][number],
  isMotorized: boolean,
): string | null {
  if (!isMotorized || (!opening.hasBelt && !opening.hasBeltBox)) return null;
  const placement = describeManualControlPlacement(opening);
  const note = ensureSentence(opening.beltPlacementNotes || `manual control is visible ${placement}`);
  return `Because the new shutter is motorized, remove the entire legacy manual shutter-control assembly ${placement}: belt/strap/cord, wall winder box or cover plate, belt exit slot and any remaining vertical guide/trim linked to the manual control. ${note} Rebuild the surrounding wall/tile surface seamlessly so ZERO manual-control traces remain visible.`;
}

function buildCassonettoDimensionRule(opening: WindowSceneAnalysis["openings"][number], replaceCassonetto: boolean): string {
  if (!replaceCassonetto) {
    return "Keep the existing cassonetto dimensions, depth, visible height and lower reveal line exactly as photographed.";
  }

  if (opening.hasCassonetto) {
    return `${ensureSentence(opening.cassonettoGeometryNotes || "Keep the existing cassonetto envelope close to the source photo.")} Update finish/material only unless a different architecture is explicitly requested.`;
  }

  return "If a new cassonetto must appear, size it credibly around the existing opening with realistic installation depth and no oversized box.";
}

function buildShutterVisibilityRule(
  opening: WindowSceneAnalysis["openings"][number],
  replaceShutter: boolean,
): { visibilityState: WindowTechnicalSpecification["shutter"]["visibilityState"]; placementRule: string } {
  if (!replaceShutter) {
    return {
      visibilityState: "match_existing",
      placementRule: "Keep the existing shading system visibility state exactly as photographed.",
    };
  }

  if (opening.rollerCurtainState === "partially_lowered" || opening.rollerCurtainState === "fully_lowered") {
    return {
      visibilityState: opening.rollerCurtainState,
      placementRule: "Keep the shutter curtain recessed within the side guides and behind the frame/glass plane, matching a real installed roller shutter.",
    };
  }

  if (opening.rollerCurtainState === "top_recessed_band") {
    return {
      visibilityState: "top_recessed_band",
      placementRule: "Only a very small recessed top shutter band may be visible, tucked behind the frame/glass plane and aligned within the guides. Never place a colored band in front of the wall or cassonetto.",
    };
  }

  return {
    visibilityState: "fully_raised_hidden",
    placementRule: "Keep the shutter fully raised/open by default. Slats must stay hidden inside the cassonetto, with no visible colored band floating above the glass. If any shutter detail is visible, it must be recessed inside the guides behind the glass plane as in real life.",
  };
}

function buildTechnicalSpecifications(
  state: WizardState,
  sceneAnalysis: WindowSceneAnalysis,
  selectedOpeningIds: string[],
): { technicalSpecifications: WindowTechnicalSpecification[]; nuovoInfisso: Record<string, unknown>; aperturaDefault: WindowOpeningType } {
  const finish = mapFrameFinish(state.coloreInfisso);
  const base = mapTipoToApertura(state.tipo as WizardTipo);
  const profilo = mapProfiloToMateriale(state.profilo as WizardProfilo);
  const hardware = mapHardware(state.coloreHw, state.tipoManiglia, base.apertura);
  const cassonetto = mapCassonetto(state, finish);
  const tapparella = mapTapparella(state, finish);

  const stileTelaio =
    state.manigliaCentrale && PROFILI_MANIGLIA_CENTRALE_COMPATIBILI.includes(state.profilo as WizardProfilo)
      ? "nodo_ridotto_maniglia_centrale"
      : profilo.stile_telaio;

  const targetOpenings = sceneAnalysis.openings.filter((opening) => selectedOpeningIds.includes(opening.id));
  const technicalSpecifications = targetOpenings.map((opening) => ({
    openingId: opening.id,
    openingLabel: opening.label,
    desiredTypeId: state.tipo as WizardTipo,
    desiredOpeningType: base.apertura,
    desiredSashCount: base.num_ante,
    desiredElement: base.desiredElement,
    material: profilo.materiale,
    profileId: state.profilo as WizardProfilo,
    frameStyle: stileTelaio,
    frameDepthLabel: profilo.profilo_dim,
    frameShape: profilo.profilo_forma,
    slimnessLabel: profilo.slimness,
    finish,
    handleStyle: hardware.handleStyle,
    handleColorId: hardware.handleColorId as WizardHw,
    handleFinish: hardware.handleFinish,
    hingeFinish: hardware.hingeFinish,
    hingeStyle: base.apertura.includes("scorrevole")
      ? "no visible side hinges because the system is sliding"
      : "compact european residential hinges aligned on the outer stiles with realistic proportions",
    hingeConsistencyRule: base.apertura.includes("scorrevole")
      ? "Do not render any side hinges or battente hinge geometry on a sliding system."
      : `All visible hinges on opening ${opening.label} must have the exact same ${hardware.handleFinish} finish as the handle, with identical top/bottom geometry and no mixed black/dark hinge parts.`,
    manualControlCleanupRule: buildManualControlCleanupRule(opening, tapparella.isMotorized),
    reducedNode: stileTelaio.includes("nodo_ridotto") || state.profilo === "minimal",
    centralHandle: state.manigliaCentrale,
    hingeCountVisible: base.apertura === "battente_2_ante" || (base.apertura === "portafinestra" && base.num_ante === 2) ? 2 : Math.max(2, base.num_ante * 2),
    glassSpec: "double glazed clear low-iron glass with realistic gasket lines",
    cassonetto: {
      replace: cassonetto.replace,
      materialId: cassonetto.replace ? (state.cassMat as WizardCassMat) : null,
      materialLabel: cassonetto.materialLabel,
      colorMode: cassonetto.colorMode,
      colorLabel: cassonetto.colorLabel,
      dimensionRule: buildCassonettoDimensionRule(opening, cassonetto.replace),
    },
    shutter: {
      mode: state.tapp as WizardTapp,
      replace: tapparella.replace,
      colorMode: tapparella.colorMode,
      colorLabel: tapparella.colorLabel,
      isMotorized: tapparella.isMotorized,
      ...buildShutterVisibilityRule(opening, tapparella.replace),
    },
    compatibilityNotes: [
      opening.hasCurtains ? "Preserve existing curtains exactly." : null,
      opening.radiatorNearby ? "Preserve nearby radiator and its spacing relationship with the opening." : null,
      opening.hasGrates ? "Keep existing grates unless explicitly stated otherwise." : null,
      opening.hasPersiane ? "Keep existing external shutters unless explicitly stated otherwise." : null,
      buildManualControlCleanupRule(opening, tapparella.isMotorized),
      tapparella.replace && opening.rollerCurtainState !== "partially_lowered" && opening.rollerCurtainState !== "fully_lowered"
        ? "If the source photo does not show a lowered shutter curtain, keep the new shutter fully open with slats hidden in the cassonetto; do not invent a colored strip above the glazing."
        : null,
      tapparella.replace
        ? "Any visible shutter curtain must stay recessed within the guides behind the frame/glass plane, never floating on the wall surface."
        : null,
      cassonetto.replace && opening.hasCassonetto
        ? "Keep the cassonetto very close to the original visible size, depth and lower edge line; do not oversize it."
        : null,
      base.apertura.includes("scorrevole") ? "Use sliding geometry only; do not invent battente hinges." : null,
      state.profilo === "minimal" ? "Use slimmer sightlines and a wider perceived glazed area." : null,
    ].filter((item): item is string => Boolean(item)),
  }));

  const nuovoInfisso = {
    materiale: profilo.materiale,
    stile_telaio: stileTelaio,
    num_ante: base.num_ante,
    colore: {
      nome: finish.name,
      ral: finish.ral ?? undefined,
      hex: finish.hex ?? undefined,
      finitura: finish.finish,
    },
    colore_mode: finish.mode,
    colore_wood_effect: finish.woodEffectId
      ? {
          id: finish.woodEffectId,
          name: finish.name,
          prompt_fragment: finish.promptFragment,
        }
      : null,
    profilo: { dimensione: profilo.profilo_dim, forma: profilo.profilo_forma },
    vetro: { tipo: "trasparente", prompt_fragment: "double glazed clear glass" },
    ferramenta: hardware.hardwarePayload,
    cerniere: {
      tipo: "europea",
      colore: hardware.cerniereColor,
      num_per_anta: base.apertura === "battente_2_ante" || (base.apertura === "portafinestra" && base.num_ante === 2) ? 1 : 2,
    },
    sostituzione: {
      infissi: true,
      cassonetto: cassonetto.replace,
      tapparella: tapparella.replace,
    },
    cassonetto: cassonetto.payload,
    tapparella: tapparella.payload,
    cass_colore_mode: cassonetto.colorMode,
    cass_colore: cassonetto.colorLabel ? { name: cassonetto.colorLabel } : null,
    tap_colore_mode: tapparella.colorMode,
    tap_colore: tapparella.colorLabel ? { name: tapparella.colorLabel } : null,
    scope_mode: selectedOpeningIds.length === sceneAnalysis.openings.length ? "all_visible" : selectedOpeningIds.length === 1 ? "single_target" : "multi_target",
    target_opening_ids: selectedOpeningIds,
  };

  return {
    technicalSpecifications,
    nuovoInfisso,
    aperturaDefault: base.apertura,
  };
}

function normalizeLegacyWindowConfig(
  rawConfig: Record<string, unknown>,
  sceneAnalysis: WindowSceneAnalysis,
  photoMeta?: WindowPhotoMeta | null,
): WindowRenderConfig {
  const ni = (rawConfig.nuovo_infisso as Record<string, unknown> | undefined) ?? {};
  const selectedOpeningIds = sceneAnalysis.openings.map((opening) => opening.id);
  const targetSelection = createWindowTargetSelection(sceneAnalysis, selectedOpeningIds);
  const material = (typeof ni.materiale === "string" ? ni.materiale : "pvc") as Exclude<WindowMaterial, "unknown">;
  const finishMode = ni.colore_mode === "legno" ? "legno" : "ral";
  const color = (ni.colore as Record<string, unknown> | undefined) ?? {};
  const wood = (ni.colore_wood_effect as Record<string, unknown> | undefined) ?? {};
  const hardware = (ni.ferramenta as Record<string, unknown> | undefined) ?? {};
  const cerniere = (ni.cerniere as Record<string, unknown> | undefined) ?? {};
  const tapparella = (ni.tapparella as Record<string, unknown> | undefined) ?? {};
  const cassonetto = (ni.cassonetto as Record<string, unknown> | undefined) ?? {};

  const technical_specification: WindowTechnicalSpecification[] = targetSelection.selectedOpeningIds.map((openingId) => ({
    openingId,
    openingLabel: openingId,
    desiredTypeId: "F2A",
    desiredOpeningType: (rawConfig.apertura_default as WindowOpeningType) ?? sceneAnalysis.legacy.tipo_apertura,
    desiredSashCount: Number(ni.num_ante ?? sceneAnalysis.legacy.num_ante_attuale ?? 2),
    desiredElement: (String(rawConfig.apertura_default ?? sceneAnalysis.legacy.tipo_apertura).includes("portafinestra")
      ? "door_window"
      : String(rawConfig.apertura_default ?? sceneAnalysis.legacy.tipo_apertura).includes("scorrevole")
        ? "sliding_panel"
        : "window"),
    material,
    profileId: "pvc",
    frameStyle: typeof ni.stile_telaio === "string" ? ni.stile_telaio : "europeo_classico",
    frameDepthLabel: stringOrFallback((ni.profilo as Record<string, unknown> | undefined)?.dimensione, "70mm"),
    frameShape: stringOrFallback((ni.profilo as Record<string, unknown> | undefined)?.forma, "europeo"),
    slimnessLabel: "balanced residential sightline",
    finish: {
      mode: finishMode,
      name: finishMode === "legno" ? stringOrFallback(wood.name, "wood-effect") : stringOrFallback(color.nome, "Bianco Traffico"),
      ral: finishMode === "ral" ? nullableString(color.ral) : null,
      hex: nullableString(color.hex),
      finish: stringOrFallback(color.finitura, finishMode === "legno" ? "wood-grain textured surface" : "smooth matte finish"),
      woodEffectId: finishMode === "legno" ? nullableString(wood.id) : null,
      promptFragment: finishMode === "legno" ? nullableString(wood.prompt_fragment) : null,
    },
    handleStyle: stringOrFallback(hardware.maniglia_stile, "classica_dritta"),
    handleColorId: findWizardHardwareId(stringOrFallback(hardware.colore_hardware_id, "cromo_lucido")),
    handleFinish: stringOrFallback(hardware.colore_hardware_finish, "polished chrome"),
    hingeFinish: stringOrFallback(cerniere.colore, "argento"),
    hingeStyle: "compact european residential hinges aligned on the outer stiles with realistic proportions",
    hingeConsistencyRule: "All visible hinges must match the selected handle finish exactly, with no mixed-color hinge parts.",
    reducedNode: String(ni.stile_telaio).includes("nodo_ridotto"),
    centralHandle: String(ni.stile_telaio) === "nodo_ridotto_maniglia_centrale",
    hingeCountVisible: Number(ni.num_ante ?? 2) === 2 ? 2 : Math.max(2, Number(ni.num_ante ?? 2) * Number(cerniere.num_per_anta ?? 2)),
    glassSpec: stringOrFallback((ni.vetro as Record<string, unknown> | undefined)?.prompt_fragment, "double glazed clear glass"),
    cassonetto: {
      replace: booleanOrLegacy((ni.sostituzione as Record<string, unknown> | undefined)?.cassonetto),
      materialId: null,
      materialLabel: typeof cassonetto.materiale === "string" ? cassonetto.materiale : "existing cassonetto",
      colorMode: cassonetto.colore_mode === "legno" ? "legno" : cassonetto.colore_mode === "ral" ? "ral" : null,
      colorLabel: nullableString((rawConfig as Record<string, unknown>).cass_colore_label),
      dimensionRule: "Keep the new cassonetto within the same visible envelope, height, depth and lower reveal line as the source photo whenever an original cassonetto exists.",
    },
    shutter: {
      mode: "no",
      replace: booleanOrLegacy((ni.sostituzione as Record<string, unknown> | undefined)?.tapparella),
      colorMode: tapparella.colore_mode === "legno" ? "legno" : tapparella.colore_mode === "ral" ? "ral" : null,
      colorLabel: nullableString((rawConfig as Record<string, unknown>).tap_colore_label),
      isMotorized: tapparella.cinghia === "senza_cinghia",
      visibilityState: "match_existing",
      placementRule: "Keep the shutter curtain recessed within the guides and behind the frame/glass plane, or hidden in the box if not visibly lowered in the source photo.",
    },
    compatibilityNotes: [],
  }));

  const provisional = {
    schema_version: "window_render_v2" as const,
    notes: typeof rawConfig.notes === "string" ? rawConfig.notes : typeof rawConfig.note_libere === "string" ? rawConfig.note_libere : "",
    apertura_default: ((rawConfig.apertura_default as WindowOpeningType) ?? sceneAnalysis.legacy.tipo_apertura) as WindowOpeningType,
    photo_meta: photoMeta ?? null,
    scene_analysis: sceneAnalysis,
    target_selection: targetSelection,
    technical_specification,
    replacement_manifest: {} as WindowRenderConfig["replacement_manifest"],
    removal_rules: [],
    integrity_constraints: [],
    quality_directives: [],
    nuovo_infisso: ni,
  };

  const replacement_manifest = buildWindowReplacementManifest(provisional);
  return {
    ...provisional,
    replacement_manifest,
    removal_rules: replacement_manifest.removals.map((rule) => rule.summary),
    integrity_constraints: replacement_manifest.integrityConstraints,
    quality_directives: [
      "Professional architectural photorealistic replacement render quality bar.",
      "Preserve the same environment and photo geometry exactly.",
    ],
  };
}

function stringOrFallback(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function booleanOrLegacy(value: unknown): boolean {
  return typeof value === "boolean" ? value : false;
}

function findWizardHardwareId(rawId: string): WizardHw {
  const match = WIZARD_HW_COLORS.find((item) => item.hw_id === rawId || item.id === rawId);
  return (match?.id ?? "cromo") as WizardHw;
}

export function buildWindowRenderConfig(state: WizardState, options: WindowRenderBuildOptions = {}): WindowRenderConfig {
  const sceneAnalysis = normalizeWindowSceneAnalysis(options.sceneAnalysis, options.photoMeta);
  const targetSelection = createWindowTargetSelection(sceneAnalysis, options.selectedOpeningIds);
  const { technicalSpecifications, nuovoInfisso, aperturaDefault } = buildTechnicalSpecifications(
    state,
    sceneAnalysis,
    targetSelection.selectedOpeningIds,
  );

  const provisional: WindowRenderConfig = {
    schema_version: "window_render_v2",
    notes: options.notes?.trim() ?? "",
    apertura_default: aperturaDefault,
    photo_meta: options.photoMeta ?? null,
    scene_analysis: sceneAnalysis,
    target_selection: targetSelection,
    technical_specification: technicalSpecifications,
    replacement_manifest: {} as WindowRenderConfig["replacement_manifest"],
    removal_rules: [],
    integrity_constraints: [],
    quality_directives: [
      "Professional architectural photorealistic replacement render quality bar.",
      "Same room, same camera angle, same geometry, same lighting direction, same furniture, same environment.",
      "Surgical infisso replacement only. No generic AI redesign.",
      "Exact same image format and orientation as the source photo.",
    ],
    nuovo_infisso: nuovoInfisso,
  };

  const replacement_manifest = buildWindowReplacementManifest(provisional);

  return {
    ...provisional,
    replacement_manifest,
    removal_rules: replacement_manifest.removals.map((rule) => rule.summary),
    integrity_constraints: replacement_manifest.integrityConstraints,
  };
}

export function ensureWindowRenderConfig(
  rawConfig: Record<string, unknown>,
  rawAnalysis?: unknown,
  photoMeta?: WindowPhotoMeta | null,
): WindowRenderConfig {
  if (
    rawConfig?.schema_version === "window_render_v2" &&
    Array.isArray(rawConfig.technical_specification) &&
    rawConfig.scene_analysis
  ) {
    const sceneAnalysis = normalizeWindowSceneAnalysis(rawConfig.scene_analysis, photoMeta);
    const targetSelection = createWindowTargetSelection(
      sceneAnalysis,
      (rawConfig.target_selection as { selectedOpeningIds?: string[] } | undefined)?.selectedOpeningIds,
    );
    const normalized = rawConfig as WindowRenderConfig;
    const technicalSpecification = normalized.technical_specification.map((spec) => {
      const opening = sceneAnalysis.openings.find((item) => item.id === spec.openingId);
      const replaceCassonetto = Boolean(spec.cassonetto?.replace);
      const replaceShutter = Boolean(spec.shutter?.replace);
      const shutterRules = buildShutterVisibilityRule(
        opening ?? sceneAnalysis.openings[0],
        replaceShutter,
      );

      return {
        ...spec,
        hingeStyle: spec.hingeStyle ?? (
          spec.desiredOpeningType.includes("scorrevole")
            ? "no visible side hinges because the system is sliding"
            : "compact european residential hinges aligned on the outer stiles with realistic proportions"
        ),
        hingeConsistencyRule: spec.hingeConsistencyRule ?? (
          spec.desiredOpeningType.includes("scorrevole")
            ? "Do not render any side hinges or battente hinge geometry on a sliding system."
            : `All visible hinges on opening ${spec.openingLabel} must have the exact same ${spec.handleFinish} finish as the handle, with identical top/bottom geometry and no mixed black/dark hinge parts.`
        ),
        manualControlCleanupRule: spec.manualControlCleanupRule ?? buildManualControlCleanupRule(
          opening ?? sceneAnalysis.openings[0],
          Boolean(spec.shutter?.isMotorized),
        ),
        cassonetto: {
          ...spec.cassonetto,
          dimensionRule: spec.cassonetto?.dimensionRule ?? buildCassonettoDimensionRule(
            opening ?? sceneAnalysis.openings[0],
            replaceCassonetto,
          ),
        },
        shutter: {
          ...spec.shutter,
          visibilityState: spec.shutter?.visibilityState ?? shutterRules.visibilityState,
          placementRule: spec.shutter?.placementRule ?? shutterRules.placementRule,
        },
      };
    });

    return {
      ...normalized,
      scene_analysis: sceneAnalysis,
      target_selection: targetSelection,
      photo_meta: photoMeta ?? normalized.photo_meta ?? null,
      technical_specification: technicalSpecification,
      removal_rules: Array.isArray(normalized.removal_rules) ? normalized.removal_rules : [],
      integrity_constraints: Array.isArray(normalized.integrity_constraints)
        ? normalized.integrity_constraints
        : normalized.replacement_manifest?.integrityConstraints ?? [],
      quality_directives: Array.isArray(normalized.quality_directives) ? normalized.quality_directives : [],
    };
  }

  const sceneAnalysis = normalizeWindowSceneAnalysis(rawConfig.scene_analysis ?? rawAnalysis, photoMeta);
  return normalizeLegacyWindowConfig(rawConfig, sceneAnalysis, photoMeta);
}
