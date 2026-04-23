import {
  PROFILI_MANIGLIA_CENTRALE_COMPATIBILI,
  WIZARD_HW_COLORS,
  findWizardRal,
  findWizardWood,
  getWizardCassonettoMeta,
  getWizardHardwareMeta,
  getWizardTapparellaMeta,
  type WizardCassMat,
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

function mapHardware(hwId: WizardHw) {
  const meta = getWizardHardwareMeta(hwId);
  return {
    handleStyle: "classica_dritta",
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
      maniglia_stile: "classica_dritta",
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

function buildTechnicalSpecifications(
  state: WizardState,
  sceneAnalysis: WindowSceneAnalysis,
  selectedOpeningIds: string[],
): { technicalSpecifications: WindowTechnicalSpecification[]; nuovoInfisso: Record<string, unknown>; aperturaDefault: WindowOpeningType } {
  const finish = mapFrameFinish(state.coloreInfisso);
  const base = mapTipoToApertura(state.tipo as WizardTipo);
  const profilo = mapProfiloToMateriale(state.profilo as WizardProfilo);
  const hardware = mapHardware(state.coloreHw);
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
    },
    shutter: {
      mode: state.tapp as WizardTapp,
      replace: tapparella.replace,
      colorMode: tapparella.colorMode,
      colorLabel: tapparella.colorLabel,
      isMotorized: tapparella.isMotorized,
    },
    compatibilityNotes: [
      opening.hasCurtains ? "Preserve existing curtains exactly." : null,
      opening.radiatorNearby ? "Preserve nearby radiator and its spacing relationship with the opening." : null,
      opening.hasGrates ? "Keep existing grates unless explicitly stated otherwise." : null,
      opening.hasPersiane ? "Keep existing external shutters unless explicitly stated otherwise." : null,
      tapparella.isMotorized && opening.hasBelt ? "Remove visible belt and winder box, then repair the wall seamlessly." : null,
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
    },
    shutter: {
      mode: "no",
      replace: booleanOrLegacy((ni.sostituzione as Record<string, unknown> | undefined)?.tapparella),
      colorMode: tapparella.colore_mode === "legno" ? "legno" : tapparella.colore_mode === "ral" ? "ral" : null,
      colorLabel: nullableString((rawConfig as Record<string, unknown>).tap_colore_label),
      isMotorized: tapparella.cinghia === "senza_cinghia",
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
    return {
      ...normalized,
      scene_analysis: sceneAnalysis,
      target_selection: targetSelection,
      photo_meta: photoMeta ?? normalized.photo_meta ?? null,
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
