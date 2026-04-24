import { normalizeGardenSceneAnalysis } from "./gardenSceneAnalysis.ts";
import {
  buildGardenTargetZonesMap,
  buildPlantingEnvelope,
} from "./gardenZoningRules.ts";
import {
  buildGardenQualityDirectives,
  buildGardenRealismRules,
  buildGardenReplacementManifest,
  buildGardenStyleSpecification,
} from "./gardenReplacementRules.ts";
import { DEFAULT_GARDEN_INTEGRITY_CONSTRAINTS } from "./promptFragments.ts";
import type {
  ConfigurazioneGiardino,
  GardenPhotoMeta,
  GardenRenderConfig,
} from "./types.ts";

function asGardenConfig(raw: Record<string, unknown>): ConfigurazioneGiardino {
  return raw as unknown as ConfigurazioneGiardino;
}

function uniq(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}

export function buildGardenRenderConfig(
  config: ConfigurazioneGiardino,
  rawAnalysis?: unknown,
  photoMeta?: GardenPhotoMeta | null,
): GardenRenderConfig {
  const scene = normalizeGardenSceneAnalysis(config, rawAnalysis, photoMeta);
  const target = buildGardenTargetZonesMap(config, scene);
  const envelope = buildPlantingEnvelope(config, scene, target);
  const style = buildGardenStyleSpecification(config);
  const manifest = buildGardenReplacementManifest(config, scene, target, envelope);

  return {
    legacy_config: config,
    photo_meta: photoMeta ?? null,
    scene_analysis: scene,
    target_zones_map: target,
    planting_envelope: envelope,
    style_specification: style,
    replacement_manifest: manifest,
    realism_rules: buildGardenRealismRules(config),
    integrity_constraints: uniq([
      ...DEFAULT_GARDEN_INTEGRITY_CONSTRAINTS,
      ...manifest.preserveExactly,
    ]),
    quality_directives: buildGardenQualityDirectives(config),
    notes: config.note_libere?.trim() ?? "",
  };
}

export function ensureGardenRenderConfig(
  rawConfig: Record<string, unknown>,
  rawAnalysis?: unknown,
  photoMeta?: GardenPhotoMeta | null,
): GardenRenderConfig {
  return buildGardenRenderConfig(asGardenConfig(rawConfig), rawAnalysis, photoMeta);
}
