import { DEFAULT_EXTERIOR_FLOOR_INTEGRITY_CONSTRAINTS } from "./promptFragments.ts";
import { normalizeExteriorFloorSceneAnalysis } from "./exteriorFloorSceneAnalysis.ts";
import {
  buildExteriorFloorBuildabilityEnvelope,
  buildExteriorFloorTargetSurfaceMap,
} from "./exteriorFloorPlacementRules.ts";
import {
  buildExteriorFloorQualityDirectives,
  buildExteriorFloorRealismRules,
  buildExteriorFloorReplacementManifest,
  buildExteriorFloorTechnicalSpecification,
} from "./exteriorFloorReplacementRules.ts";
import type {
  ConfigurazionePavimentoEsterno,
  ExteriorFloorPhotoMeta,
  ExteriorFloorRenderConfig,
} from "./types.ts";

function asExteriorFloorConfig(raw: Record<string, unknown>): ConfigurazionePavimentoEsterno {
  return raw as unknown as ConfigurazionePavimentoEsterno;
}

export function buildExteriorFloorRenderConfig(
  config: ConfigurazionePavimentoEsterno,
  rawAnalysis?: unknown,
  photoMeta?: ExteriorFloorPhotoMeta | null,
): ExteriorFloorRenderConfig {
  const scene = normalizeExteriorFloorSceneAnalysis(config, rawAnalysis, photoMeta);
  const target = buildExteriorFloorTargetSurfaceMap(config, scene);
  const envelope = buildExteriorFloorBuildabilityEnvelope(config, scene, target);
  const technical = buildExteriorFloorTechnicalSpecification(config);
  const manifest = buildExteriorFloorReplacementManifest(config, scene, target, envelope, technical);
  const integrity = Array.from(new Set([
    ...DEFAULT_EXTERIOR_FLOOR_INTEGRITY_CONSTRAINTS,
    ...manifest.preserveExactly,
  ]));

  return {
    legacy_config: config,
    photo_meta: photoMeta ?? null,
    scene_analysis: scene,
    target_surface_map: target,
    buildability_envelope: envelope,
    technical_specification: technical,
    replacement_manifest: manifest,
    outdoor_realism_rules: buildExteriorFloorRealismRules(config, technical),
    integrity_constraints: integrity,
    quality_directives: buildExteriorFloorQualityDirectives(),
    notes: config.note_libere?.trim() ?? "",
  };
}

export function ensureExteriorFloorRenderConfig(
  rawConfig: Record<string, unknown>,
  rawAnalysis?: unknown,
  photoMeta?: ExteriorFloorPhotoMeta | null,
): ExteriorFloorRenderConfig {
  return buildExteriorFloorRenderConfig(asExteriorFloorConfig(rawConfig), rawAnalysis, photoMeta);
}
