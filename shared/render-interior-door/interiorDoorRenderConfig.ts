import { DEFAULT_INTERIOR_DOOR_INTEGRITY_CONSTRAINTS } from "./promptFragments.ts";
import { normalizeInteriorDoorSceneAnalysis } from "./interiorDoorSceneAnalysis.ts";
import {
  buildInteriorDoorCompatibilityEnvelope,
  buildInteriorDoorTargetOpeningMap,
} from "./interiorDoorOpeningRules.ts";
import {
  buildInteriorDoorQualityDirectives,
  buildInteriorDoorRealismRules,
  buildInteriorDoorReplacementManifest,
  buildInteriorDoorTechnicalSpecification,
} from "./interiorDoorReplacementRules.ts";
import type {
  ConfigurazionePortaInterna,
  InteriorDoorPhotoMeta,
  InteriorDoorRenderConfig,
} from "./types.ts";

function asInteriorDoorConfig(raw: Record<string, unknown>): ConfigurazionePortaInterna {
  return raw as unknown as ConfigurazionePortaInterna;
}

function uniq(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}

export function buildInteriorDoorRenderConfig(
  config: ConfigurazionePortaInterna,
  rawAnalysis?: unknown,
  photoMeta?: InteriorDoorPhotoMeta | null,
): InteriorDoorRenderConfig {
  const scene = normalizeInteriorDoorSceneAnalysis(config, rawAnalysis, photoMeta);
  const target = buildInteriorDoorTargetOpeningMap(config, scene);
  const envelope = buildInteriorDoorCompatibilityEnvelope(config, scene, target);
  const technical = buildInteriorDoorTechnicalSpecification(config);
  const manifest = buildInteriorDoorReplacementManifest(config, scene, target, envelope);

  return {
    legacy_config: config,
    photo_meta: photoMeta ?? null,
    scene_analysis: scene,
    target_opening_map: target,
    compatibility_envelope: envelope,
    technical_specification: technical,
    replacement_manifest: manifest,
    realism_rules: buildInteriorDoorRealismRules(config),
    integrity_constraints: uniq([
      ...DEFAULT_INTERIOR_DOOR_INTEGRITY_CONSTRAINTS,
      ...manifest.preserveExactly,
    ]),
    quality_directives: buildInteriorDoorQualityDirectives(),
    notes: config.note_libere?.trim() ?? "",
  };
}

export function ensureInteriorDoorRenderConfig(
  rawConfig: Record<string, unknown>,
  rawAnalysis?: unknown,
  photoMeta?: InteriorDoorPhotoMeta | null,
): InteriorDoorRenderConfig {
  return buildInteriorDoorRenderConfig(asInteriorDoorConfig(rawConfig), rawAnalysis, photoMeta);
}
