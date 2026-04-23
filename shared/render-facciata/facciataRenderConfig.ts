import {
  CLADDING_DESCRIPTIONS,
  CLADDING_PATTERN_DESCRIPTIONS,
  FINISH_DESCRIPTIONS,
  INSULATION_SYSTEM_DESCRIPTIONS,
  INTERVENTION_DESCRIPTIONS,
  ZONE_LABELS,
} from "./promptFragments.ts";
import { buildFacciataReplacementManifest } from "./facciataReplacementRules.ts";
import { createFacciataZoneTargeting, normalizeFacciataSceneAnalysis } from "./facciataSceneAnalysis.ts";
import type {
  ConfigurazioneFacciata,
  FacciataCladdingSpec,
  FacciataElementSpec,
  FacciataInsulationSpec,
  FacciataPhotoMeta,
  FacciataPlasterSpec,
  FacciataRenderConfig,
} from "./types.ts";

export interface FacciataRenderBuildOptions {
  notes?: string;
  sceneAnalysis?: unknown;
  photoMeta?: FacciataPhotoMeta | null;
}

function colorLabel(hex?: string | null, name?: string | null, ral?: string | null): string | null {
  if (!hex && !name && !ral) return null;
  if (name && ral) return `${name} (RAL ${ral})`;
  if (name) return name;
  if (ral) return `RAL ${ral}`;
  return hex ?? null;
}

function buildPlasterSpec(config: ConfigurazioneFacciata): FacciataPlasterSpec {
  if (!config.intonaco.attivo) {
    return {
      active: false,
      zone: null,
      colorLabel: null,
      colorHex: null,
      finishId: null,
      finishDescription: null,
      surfaceBehavior: null,
      textureVisibility: null,
    };
  }

  return {
    active: true,
    zone: config.intonaco.zona,
    colorLabel: colorLabel(config.intonaco.colore_hex, config.intonaco.colore_nome ?? null, config.intonaco.colore_ral ?? null),
    colorHex: config.intonaco.colore_hex,
    finishId: config.intonaco.finitura,
    finishDescription: FINISH_DESCRIPTIONS[config.intonaco.finitura],
    surfaceBehavior:
      config.tipo_intervento === "tinteggiatura"
        ? "repaint only, keep the same wall geometry and same plaster relief"
        : "fresh professionally applied facade finish with coherent mineral behavior",
    textureVisibility:
      config.intonaco.finitura === "liscio" || config.intonaco.finitura === "rasato"
        ? "very low relief and crisp planar reading"
        : config.intonaco.finitura === "bugnato"
          ? "high relief with explicit geometric articulation"
          : "clearly visible but believable facade texture",
  };
}

function buildCladdingSpec(config: ConfigurazioneFacciata): FacciataCladdingSpec {
  if (!config.rivestimento.attivo) {
    return {
      active: false,
      zone: null,
      materialId: null,
      materialDescription: null,
      coursingPattern: null,
      jointLogic: null,
      thicknessVisibility: null,
      transitionEdges: null,
    };
  }

  return {
    active: true,
    zone: config.rivestimento.zona,
    materialId: config.rivestimento.tipo,
    materialDescription: CLADDING_DESCRIPTIONS[config.rivestimento.tipo],
    coursingPattern: CLADDING_PATTERN_DESCRIPTIONS[config.rivestimento.posa ?? "corsi_regolari"],
    jointLogic: config.rivestimento.fuga_colore
      ? `joint / fughe color must read as ${config.rivestimento.fuga_colore}`
      : "joint rhythm and fughe must remain crisp and coherent with the selected cladding typology",
    thicknessVisibility: "visible real cladding depth at edges, corners and material terminations",
    transitionEdges: `clean architectural transition between ${ZONE_LABELS[config.rivestimento.zona]} and adjacent untouched facade zones`,
  };
}

function buildInsulationSpec(config: ConfigurazioneFacciata): FacciataInsulationSpec {
  if (!config.cappotto.attivo) {
    return {
      active: false,
      zone: null,
      systemId: null,
      systemDescription: null,
      thicknessCm: null,
      finishColorHex: null,
      newFacadePlaneRule: null,
      revealDepthRule: null,
      sillAdaptationRule: null,
      edgeProfileRule: null,
      flashingRule: null,
    };
  }

  const thickness = config.cappotto.spessore_cm;
  return {
    active: true,
    zone: config.cappotto.zona ?? "tutta",
    systemId: config.cappotto.sistema,
    systemDescription: INSULATION_SYSTEM_DESCRIPTIONS[config.cappotto.sistema],
    thicknessCm: thickness,
    finishColorHex: config.cappotto.colore_finitura_hex,
    newFacadePlaneRule: `the insulated facade plane advances outward by about ${thickness}cm with clean, controlled construction logic`,
    revealDepthRule: `window and door reveals must look deeper and more wrapped because of the added ${thickness}cm insulation package`,
    sillAdaptationRule: "sills, drip edges and lower reveal conditions must be adapted to the new facade thickness without moving the windows artificially",
    edgeProfileRule: "show crisp insulation edge beads / profiles at corners and terminations with believable installation precision",
    flashingRule: "gutters, flashing, drip edges and visible metal terminations must remain coherent with the new insulation package",
  };
}

function colorText(hex?: string | null): string | null {
  return hex?.trim() ? hex.trim() : null;
}

function buildElementSpec(
  action: FacciataElementSpec["action"],
  description: string,
  colorHex?: string | null,
  profileRule?: string | null,
): FacciataElementSpec {
  return {
    action,
    colorHex: colorText(colorHex),
    description,
    profileRule: profileRule ?? null,
  };
}

function buildElementsSpec(config: ConfigurazioneFacciata): FacciataRenderConfig["technical_specification"]["elements"] {
  const cornici = config.elementi.cornici_finestre;
  const marcapiani = config.elementi.marcapiani;
  const davanzali = config.elementi.davanzali;
  const zoccolatura = config.elementi.zoccolatura;
  const gronde = config.elementi.gronde;
  const railings = config.elementi.balconi_ringhiere;

  return {
    windowCornices: buildElementSpec(
      cornici.azione === "mantieni" ? "keep" : cornici.azione === "aggiungi" ? "add" : "remove",
      cornici.azione === "aggiungi"
        ? "add proportionate window cornices around existing openings without altering the opening size"
        : cornici.azione === "rimuovi"
          ? "remove all visible window cornices and restore the wall flush and clean"
          : "keep existing window cornices exactly",
      cornici.colore_hex,
      cornici.azione === "aggiungi"
        ? "cornices must be proportionate, architecturally credible and consistent with the building style"
        : cornici.azione === "rimuovi"
          ? "no residual shadows, ghost lines or edge fragments may remain after removing the cornices"
          : null,
    ),
    stringCourses: buildElementSpec(
      marcapiani.azione === "mantieni" ? "keep" : marcapiani.azione === "aggiungi" ? "add" : "remove",
      marcapiani.azione === "aggiungi"
        ? "add horizontal string courses aligned across the facade"
        : marcapiani.azione === "rimuovi"
          ? "remove existing string courses completely and restore a continuous facade plane"
          : "keep existing string courses exactly",
      marcapiani.colore_hex,
      marcapiani.azione === "aggiungi"
        ? `string courses should have ${marcapiani.spessore ?? "controlled architectural"} projection with perfectly aligned horizontal reading`
        : marcapiani.azione === "rimuovi"
          ? "remove old band shadows and restore clean planar continuity"
          : null,
    ),
    sills: buildElementSpec(
      davanzali.azione === "sostituisci" ? "replace" : "keep",
      davanzali.azione === "sostituisci"
        ? `replace sills with ${davanzali.materiale ?? "stone"} sills showing a credible nose, drip edge and masonry junction`
        : "keep existing sills exactly",
      davanzali.colore_hex,
      davanzali.azione === "sostituisci"
        ? "new sill profile must be visible without altering the windows or opening geometry"
        : null,
    ),
    baseCourse: buildElementSpec(
      zoccolatura.azione === "mantieni" ? "keep" : zoccolatura.azione === "aggiungi" ? "add" : "remove",
      zoccolatura.azione === "aggiungi"
        ? `add a ${zoccolatura.tipo ?? "base course"} plinth with height about ${zoccolatura.altezza_cm ?? 40}cm`
        : zoccolatura.azione === "rimuovi"
          ? "remove the existing base course and restore the wall with a clean lower transition"
          : "keep existing base course exactly",
      zoccolatura.colore_hex,
      zoccolatura.azione === "aggiungi"
        ? "top line of the base course must be sharp, level and architecturally crisp"
        : zoccolatura.azione === "rimuovi"
          ? "after removal, the lower facade must look seamless with no ghost line"
          : null,
    ),
    gutters: buildElementSpec(
      gronde.azione === "sostituisci" ? "replace" : "keep",
      gronde.azione === "sostituisci"
        ? `replace gutters/eaves accessories with ${gronde.materiale ?? "alluminio"} in a coherent architectural finish`
        : "keep existing gutters and eaves exactly",
      gronde.colore_hex,
      gronde.azione === "sostituisci"
        ? "brackets, drops and visible gutter profiles must remain physically plausible and coordinated with the facade package"
        : null,
    ),
    railings: buildElementSpec(
      railings.azione === "vernicia" ? "repaint" : "keep",
      railings.azione === "vernicia"
        ? "repaint balcony railings only, keeping the exact geometry, rhythm and metal design"
        : "keep balcony railings exactly",
      railings.colore_hex,
      railings.azione === "vernicia"
        ? "change only the finish/coating of the railing metalwork, never the railing design or balcony structure"
        : null,
    ),
  };
}

export function buildFacciataRenderConfig(
  legacyConfig: ConfigurazioneFacciata,
  options: FacciataRenderBuildOptions = {},
): FacciataRenderConfig {
  const sceneAnalysis = normalizeFacciataSceneAnalysis(options.sceneAnalysis, options.photoMeta);
  const zoneTargeting = createFacciataZoneTargeting(legacyConfig, sceneAnalysis);

  const provisional: FacciataRenderConfig = {
    schema_version: "facciata_render_v2",
    notes: options.notes?.trim() ?? legacyConfig.note_libere?.trim() ?? "",
    photo_meta: options.photoMeta ?? null,
    scene_analysis: sceneAnalysis,
    zone_targeting: zoneTargeting,
    technical_specification: {
      plaster: buildPlasterSpec(legacyConfig),
      cladding: buildCladdingSpec(legacyConfig),
      insulation: buildInsulationSpec(legacyConfig),
      elements: buildElementsSpec(legacyConfig),
    },
    replacement_manifest: {} as FacciataRenderConfig["replacement_manifest"],
    removal_rules: [],
    integrity_constraints: [],
    quality_directives: [
      INTERVENTION_DESCRIPTIONS[legacyConfig.tipo_intervento],
      "same building, same facade, same camera angle, same geometry and same preserved context",
      "surgical facade renovation only; no generic AI beautification",
      "material transitions and construction depth must look buildable in reality",
    ],
    legacy_config: legacyConfig,
  };

  const replacementManifest = buildFacciataReplacementManifest(provisional);
  return {
    ...provisional,
    replacement_manifest: replacementManifest,
    removal_rules: replacementManifest.removals.map((item) => item.summary),
    integrity_constraints: replacementManifest.integrityConstraints,
  };
}

export function ensureFacciataRenderConfig(
  rawConfig: Record<string, unknown>,
  rawAnalysis?: unknown,
  photoMeta?: FacciataPhotoMeta | null,
): FacciataRenderConfig {
  if (
    rawConfig?.schema_version === "facciata_render_v2" &&
    rawConfig.scene_analysis &&
    rawConfig.zone_targeting &&
    rawConfig.technical_specification
  ) {
    const normalizedScene = normalizeFacciataSceneAnalysis(
      rawConfig.scene_analysis,
      (rawConfig.photo_meta as FacciataPhotoMeta | null | undefined) ?? photoMeta ?? null,
    );
    const legacyConfig = (rawConfig.legacy_config as ConfigurazioneFacciata | undefined) ?? (rawConfig as unknown as ConfigurazioneFacciata);
    const provisional: FacciataRenderConfig = {
      ...(rawConfig as FacciataRenderConfig),
      photo_meta: (rawConfig.photo_meta as FacciataPhotoMeta | null | undefined) ?? photoMeta ?? null,
      scene_analysis: normalizedScene,
      legacy_config: legacyConfig,
    };
    const replacementManifest = buildFacciataReplacementManifest(provisional);
    return {
      ...provisional,
      replacement_manifest: replacementManifest,
      removal_rules: replacementManifest.removals.map((item) => item.summary),
      integrity_constraints: replacementManifest.integrityConstraints,
    };
  }

  return buildFacciataRenderConfig(rawConfig as unknown as ConfigurazioneFacciata, {
    sceneAnalysis: rawAnalysis ?? rawConfig.scene_analysis,
    photoMeta,
    notes:
      typeof rawConfig.note_libere === "string"
        ? rawConfig.note_libere
        : typeof rawConfig.notes === "string"
          ? rawConfig.notes
          : "",
  });
}
