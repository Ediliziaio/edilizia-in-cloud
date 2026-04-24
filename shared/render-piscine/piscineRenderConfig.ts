import { normalizePiscinaSceneAnalysis } from "./piscineSceneAnalysis.ts";
import {
  buildPiscinaBuildabilityEnvelope,
  buildPiscinaTargetAreaMap,
} from "./piscinePlacementRules.ts";
import {
  buildPiscinaQualityDirectives,
  buildPiscinaReplacementManifest,
  buildPiscinaTechnicalSpecification,
  buildPiscinaWaterRealismRules,
} from "./piscineReplacementRules.ts";
import { DEFAULT_INTEGRITY_CONSTRAINTS } from "./promptFragments.ts";
import type {
  ConfigurazionePiscine,
  PiscinaPhotoMeta,
  PiscinaRenderConfig,
} from "./types.ts";

function asPiscinaConfig(raw: Record<string, unknown>): ConfigurazionePiscine {
  return raw as unknown as ConfigurazionePiscine;
}

export function buildPiscineRenderConfig(
  config: ConfigurazionePiscine,
  rawAnalysis?: unknown,
  photoMeta?: PiscinaPhotoMeta | null,
): PiscinaRenderConfig {
  const scene = normalizePiscinaSceneAnalysis(config, rawAnalysis, photoMeta);
  const target = buildPiscinaTargetAreaMap(config, scene);
  const envelope = buildPiscinaBuildabilityEnvelope(config, scene, target);
  const technical = buildPiscinaTechnicalSpecification(config);
  const manifest = buildPiscinaReplacementManifest(config, scene, target, envelope, technical);
  const waterRules = buildPiscinaWaterRealismRules(config);
  const integrity = Array.from(new Set([
    ...DEFAULT_INTEGRITY_CONSTRAINTS,
    ...manifest.preserveExactly,
  ]));

  return {
    legacy_config: config,
    photo_meta: photoMeta ?? null,
    scene_analysis: scene,
    target_pool_insertion_map: target,
    buildability_envelope: envelope,
    technical_specification: technical,
    replacement_manifest: manifest,
    water_realism_rules: waterRules,
    integrity_constraints: integrity,
    quality_directives: buildPiscinaQualityDirectives(config),
    notes: config.note_libere?.trim() ?? "",
  };
}

export function ensurePiscineRenderConfig(
  rawConfig: Record<string, unknown>,
  rawAnalysis?: unknown,
  photoMeta?: PiscinaPhotoMeta | null,
): PiscinaRenderConfig {
  return buildPiscineRenderConfig(asPiscinaConfig(rawConfig), rawAnalysis, photoMeta);
}
