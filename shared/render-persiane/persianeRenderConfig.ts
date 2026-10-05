import {
  BLADE_MOVEMENT_DESCRIPTIONS,
  HARDWARE_FINISH_DESCRIPTIONS,
  HEAD_BOX_DESCRIPTIONS,
  INSTALLATION_DESCRIPTIONS,
  LEAF_COUNT_DESCRIPTIONS,
  LOUVER_MOVEMENT_DESCRIPTIONS,
  LOUVER_STATE_DESCRIPTIONS,
  MATERIAL_DESCRIPTIONS,
  SHUTTER_TYPE_DESCRIPTIONS,
  describeProfileColor,
  hasHingedLeaves,
} from "./promptFragments.ts";
import { buildPersianeReplacementManifest } from "./persianeReplacementRules.ts";
import { createPersianeTargetSelection, normalizePersianeSceneAnalysis } from "./persianeSceneAnalysis.ts";
import { TIPI_CON_CASSONETTO, TIPI_MOVIMENTO_LAMELLE, TIPI_PERSIANA, anteCompatibili } from "./types.ts";
import type {
  ConfigurazionePersiane,
  ExistingShutterType,
  PersianaFinishSpec,
  PersianaInstallazione,
  PersianaTechnicalSpecification,
  PersianePhotoMeta,
  PersianeRenderConfig,
  PersianeSceneAnalysis,
  TipoPersiana,
} from "./types.ts";

export interface PersianeRenderBuildOptions {
  notes?: string;
  sceneAnalysis?: unknown;
  photoMeta?: PersianePhotoMeta | null;
}

const WOOD_EFFECT_LABELS: Record<string, string> = {
  rovere_chiaro: "light oak wood effect",
  rovere_scuro: "dark oak wood effect",
  noce_nazionale: "walnut wood effect",
  castagno: "chestnut wood effect",
  douglas: "douglas fir wood effect",
};

function normalizeFinish(config: ConfigurazionePersiane): PersianaFinishSpec | null {
  if (config.operazione === "rimuovi") return null;

  if (config.colore_mode === "legno") {
    const woodEffectId = config.effetto_legno ?? "rovere_chiaro";
    const label = WOOD_EFFECT_LABELS[woodEffectId] ?? woodEffectId.replace(/_/g, " ");
    return {
      mode: "legno",
      label,
      ral: null,
      hex: null,
      woodEffectId,
      promptFragment: `${label} with the exact selected wood-effect identity, believable grain direction, realistic tonal variation and exterior weather-resistant coating; do not drift into another wood tone or generic brown timber`,
    };
  }

  const ral = config.colore_ral ?? null;
  const label = config.colore_nome
    ? `${config.colore_nome}${ral ? ` (RAL ${ral})` : ""}`
    : ral
      ? `RAL ${ral}`
      : "selected RAL finish";

  return {
    mode: "ral",
    label,
    ral,
    hex: config.colore_hex ?? null,
    woodEffectId: null,
    promptFragment: `${label} as an exact architectural coating matched to the selected RAL/finish, with no unwanted wood grain contamination and no drift into a nearby but different tone`,
  };
}

function inferInstallation(config: ConfigurazionePersiane): PersianaInstallazione {
  if (config.installazione) return config.installazione;
  if (config.tipo === "avvolgibile_esterno" || config.tipo === "veneziana_esterna") return "guide_laterali";
  if (config.tipo === "brise_soleil") return "brackets_architettonici";
  return "cardini_tradizionali";
}

function supportsLouvers(type: TipoPersiana | null): boolean {
  return type === "veneziana_classica" || type === "veneziana_esterna" || type === "gelosia" || type === "brise_soleil";
}

function buildLouverRule(config: ConfigurazionePersiane, targetType: TipoPersiana | null): string | null {
  if (!targetType || !supportsLouvers(targetType) || !config.lamelle) return null;
  const movimento = config.lamelle.movimento && TIPI_MOVIMENTO_LAMELLE.has(targetType)
    ? (targetType === "brise_soleil" ? BLADE_MOVEMENT_DESCRIPTIONS : LOUVER_MOVEMENT_DESCRIPTIONS)[config.lamelle.movimento]
    : null;
  return [
    `render consistent louvers/slats from top to bottom`,
    `slat width about ${config.lamelle.larghezza_mm}mm`,
    LOUVER_STATE_DESCRIPTIONS[config.lamelle.apertura],
    // fisse/orientabili solo se scelto: senza scelta la regola resta quella di prima
    ...(movimento ? [movimento] : []),
  ].join("; ");
}

function buildLeafConfiguration(
  targetType: TipoPersiana | null,
  scene: PersianeSceneAnalysis["openings"][number],
  numeroAnte?: number,
): string {
  if (!targetType) return "remove the existing shutter assembly";
  // Il numero di ante scelto vince sulla foto; un numero che il tipo non può avere si ignora.
  if (anteCompatibili(targetType, numeroAnte)) return LEAF_COUNT_DESCRIPTIONS[numeroAnte];
  // La veneziana esterna scorre su guide come la tapparella: «double-leaf» era sbagliato.
  if (targetType === "veneziana_esterna") return "single external venetian blind running in two side guides";
  if (targetType === "a_libro") {
    return scene.openingKind === "door_window" || scene.apparentSize.toLowerCase().includes("wide")
      ? "bi-fold layout with 6 folding panels total"
      : "bi-fold layout with 4 folding panels total";
  }
  if (targetType === "avvolgibile_esterno") return "single rolling curtain with side guides";
  if (targetType === "brise_soleil") return "architectural sun-screen blades mounted as a single coordinated shading assembly";
  return scene.leafCount > 0 ? `${scene.leafCount} leaf configuration matched to the opening` : "double-leaf configuration unless the photographed opening clearly implies otherwise";
}

function buildHardwareRules(
  config: ConfigurazionePersiane,
  targetType: TipoPersiana | null,
  installation: PersianaInstallazione,
): string[] {
  const rules = [`hardware finish: ${HARDWARE_FINISH_DESCRIPTIONS[config.ferramenta_finitura ?? "verniciata_tinta"]}`];
  if (targetType === "avvolgibile_esterno") {
    rules.push("show realistic side guides and head box logic coherent with an external roller shutter");
  } else if (targetType === "veneziana_esterna") {
    rules.push("show guide rails, top technical housing and contemporary mounting details coherent with an external venetian system");
  } else if (targetType === "brise_soleil") {
    rules.push("show support brackets and blade mounting that look buildable on a real facade");
  } else if (targetType === "a_libro") {
    rules.push("show multiple hinge points and realistic folding joints for the bi-fold panels");
  } else if (targetType === "griglia_sicurezza") {
    rules.push("show robust metallic fixing logic, lock bars or bars-members coherent with a real security system");
  } else if (targetType) {
    rules.push("show hinges/pintles and hold-open hardware coherent with traditional side-mounted shutters");
  }

  // Il fermo a muro dei 90° vale per le ante: tapparelle e frangisole non ruotano.
  if (config.stato_apertura === "aperto_90" && hasHingedLeaves(targetType)) {
    rules.push("if opened at 90 degrees, show believable hold-open hardware or visual contact with the wall plane");
  }
  if (config.fermapersiana_visibile && targetType && targetType !== "avvolgibile_esterno" && targetType !== "brise_soleil") {
    rules.push("show realistic fermapersiane / hold-open hardware where physically plausible");
  }
  if (config.cassonetto && targetType && TIPI_CON_CASSONETTO.has(targetType)) {
    rules.push(`head box: ${HEAD_BOX_DESCRIPTIONS[config.cassonetto]}`);
  }
  rules.push(`installation style: ${INSTALLATION_DESCRIPTIONS[installation]}`);
  return rules;
}

/** Il tipo esistente, se è uno dei tipi veri (non «unknown», «nessuna», «battente_generica»). */
function knownShutterType(type: ExistingShutterType): TipoPersiana | null {
  return (TIPI_PERSIANA as string[]).includes(type) ? (type as TipoPersiana) : null;
}

const RECOLOR_KEEP_MOUNTING = "keep the existing mounting, hinges, guides and fixing points exactly as photographed";
const RECOLOR_KEEP_LEAVES = "keep the existing leaf and panel layout exactly as photographed";
const RECOLOR_KEEP_LOUVERS = "keep the existing louvers exactly as photographed: same slat count, width, angle and rhythm";
const RECOLOR_UNKNOWN_TYPE = "the existing shutter system exactly as photographed";

/**
 * «Cambia colore» cambia solo la finitura. Tipo, materiale e lamelle nel form
 * sono nascosti e restano i default (veneziana classica, legno naturale): prima
 * finivano nel prompt — la ricolorazione di tapparelle in PVC diceva «Material:
 * solid natural wood with authentic grain», «traditional side-hinged mounting» e,
 * se l'analisi non riconosceva la tapparella, «veneziana classica» con lamelle,
 * cardini e fermapersiane. Ora si descrive l'esistente, com'è in foto.
 */
function buildRecolorSpecification(
  config: ConfigurazionePersiane,
  opening: PersianeSceneAnalysis["openings"][number],
  finish: PersianaFinishSpec | null,
): PersianaTechnicalSpecification {
  const existing = knownShutterType(opening.existingShutterType);
  const hardwareFinish = HARDWARE_FINISH_DESCRIPTIONS[config.ferramenta_finitura ?? "verniciata_tinta"];
  const hardwareRules = [
    `hardware finish: ${hardwareFinish}`,
    "keep every hinge, guide, bracket and hold-open device exactly where it is in the photo",
    ...(config.stato_apertura === "aperto_90" && hasHingedLeaves(existing)
      ? ["if opened at 90 degrees, show believable hold-open hardware or visual contact with the wall plane"]
      : []),
    `installation style: ${RECOLOR_KEEP_MOUNTING}`,
  ];
  return {
    openingId: opening.id,
    openingLabel: opening.label,
    operation: config.operazione,
    targetType: existing,
    currentType: opening.existingShutterType,
    material: null,
    finish,
    profileContrastColor: config.colore_profilo_diverso ? describeProfileColor(config.colore_profilo_hex) : null,
    openingState: config.stato_apertura,
    supportsLouvers: supportsLouvers(existing),
    louverRule: supportsLouvers(existing) ? RECOLOR_KEEP_LOUVERS : null,
    leafConfiguration: RECOLOR_KEEP_LEAVES,
    installationStyle: RECOLOR_KEEP_MOUNTING,
    typeDescription: existing ? SHUTTER_TYPE_DESCRIPTIONS[existing] : RECOLOR_UNKNOWN_TYPE,
    materialDescription: null,
    hardwareFinish,
    hardwareRules,
    recolorOnly: true,
    keepGeometryExactly: true,
  };
}

function buildTechnicalSpecification(
  config: ConfigurazionePersiane,
  sceneAnalysis: PersianeSceneAnalysis,
): PersianaTechnicalSpecification[] {
  const targetSelection = createPersianeTargetSelection(config, sceneAnalysis);
  const finish = normalizeFinish(config);
  const installation = inferInstallation(config);

  return sceneAnalysis.openings
    .filter((opening) => targetSelection.selectedOpeningIds.includes(opening.id))
    .map((opening) => {
      const recolorOnly = config.operazione === "cambia_colore";
      if (recolorOnly) return buildRecolorSpecification(config, opening, finish);
      const targetType = config.operazione === "rimuovi" ? null : config.tipo;

      return {
        openingId: opening.id,
        openingLabel: opening.label,
        operation: config.operazione,
        targetType,
        currentType: opening.existingShutterType,
        material: config.operazione === "rimuovi" ? null : config.materiale,
        finish,
        profileContrastColor: config.colore_profilo_diverso ? describeProfileColor(config.colore_profilo_hex) : null,
        openingState: config.operazione === "rimuovi" ? null : config.stato_apertura,
        supportsLouvers: supportsLouvers(targetType),
        louverRule: buildLouverRule(config, targetType),
        leafConfiguration: buildLeafConfiguration(targetType, opening, config.numero_ante),
        installationStyle: INSTALLATION_DESCRIPTIONS[installation],
        typeDescription: targetType ? SHUTTER_TYPE_DESCRIPTIONS[targetType] : "no shutter system should remain visible",
        materialDescription: config.operazione === "rimuovi" ? null : MATERIAL_DESCRIPTIONS[config.materiale],
        hardwareFinish: HARDWARE_FINISH_DESCRIPTIONS[config.ferramenta_finitura ?? "verniciata_tinta"],
        hardwareRules: buildHardwareRules(config, targetType, installation),
        recolorOnly,
        keepGeometryExactly: recolorOnly,
      };
    });
}

export function buildPersianeRenderConfig(
  legacyConfig: ConfigurazionePersiane,
  options: PersianeRenderBuildOptions = {},
): PersianeRenderConfig {
  const sceneAnalysis = normalizePersianeSceneAnalysis(options.sceneAnalysis, options.photoMeta);
  const targetSelection = createPersianeTargetSelection(legacyConfig, sceneAnalysis);
  const technicalSpecification = buildTechnicalSpecification(legacyConfig, sceneAnalysis);

  const provisional: PersianeRenderConfig = {
    schema_version: "persiane_render_v2",
    notes: options.notes?.trim() ?? legacyConfig.note_libere?.trim() ?? "",
    photo_meta: options.photoMeta ?? null,
    scene_analysis: sceneAnalysis,
    target_selection: targetSelection,
    technical_specification: technicalSpecification,
    replacement_manifest: {} as PersianeRenderConfig["replacement_manifest"],
    removal_rules: [],
    integrity_constraints: [],
    quality_directives: [
      "surgical photorealistic architectural replacement only",
      "same facade, same building identity, same windows and same wall texture",
      "selected shutter typology must be visually unmistakable",
    ],
    legacy_config: legacyConfig,
  };

  const replacementManifest = buildPersianeReplacementManifest(provisional);
  return {
    ...provisional,
    replacement_manifest: replacementManifest,
    removal_rules: replacementManifest.removals.map((item) => item.summary),
    integrity_constraints: replacementManifest.integrityConstraints,
  };
}

export function ensurePersianeRenderConfig(
  rawConfig: Record<string, unknown>,
  rawAnalysis?: unknown,
  photoMeta?: PersianePhotoMeta | null,
): PersianeRenderConfig {
  if (
    rawConfig?.schema_version === "persiane_render_v2" &&
    rawConfig.scene_analysis &&
    rawConfig.target_selection &&
    rawConfig.technical_specification
  ) {
    const normalizedScene = normalizePersianeSceneAnalysis(
      rawConfig.scene_analysis,
      (rawConfig.photo_meta as PersianePhotoMeta | null | undefined) ?? photoMeta ?? null,
    );
    const legacyConfig = (rawConfig.legacy_config as ConfigurazionePersiane | undefined) ?? (rawConfig as unknown as ConfigurazionePersiane);
    const provisional: PersianeRenderConfig = {
      ...(rawConfig as unknown as PersianeRenderConfig),
      photo_meta: (rawConfig.photo_meta as PersianePhotoMeta | null | undefined) ?? photoMeta ?? null,
      scene_analysis: normalizedScene,
      legacy_config: legacyConfig,
    };
    const replacementManifest = buildPersianeReplacementManifest(provisional);
    return {
      ...provisional,
      replacement_manifest: replacementManifest,
      removal_rules: replacementManifest.removals.map((item) => item.summary),
      integrity_constraints: replacementManifest.integrityConstraints,
    };
  }

  return buildPersianeRenderConfig(rawConfig as unknown as ConfigurazionePersiane, {
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
