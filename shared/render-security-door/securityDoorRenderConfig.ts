import { normalizeSecurityDoorSceneAnalysis } from "./securityDoorSceneAnalysis.ts";
import {
  buildSecurityDoorBuildabilityEnvelope,
  buildSecurityDoorTargetOpeningMap,
} from "./securityDoorOpeningRules.ts";
import {
  buildSecurityDoorQualityDirectives,
  buildSecurityDoorRealismRules,
  buildSecurityDoorReplacementManifest,
  buildSecurityDoorTechnicalSpecification,
} from "./securityDoorReplacementRules.ts";
import { DEFAULT_SECURITY_DOOR_INTEGRITY_CONSTRAINTS } from "./promptFragments.ts";
import type {
  ConfigurazionePortaBlindata,
  SecurityDoorPhotoMeta,
  SecurityDoorRenderConfig,
} from "./types.ts";

function asSecurityDoorConfig(raw: Record<string, unknown>): ConfigurazionePortaBlindata {
  return raw as unknown as ConfigurazionePortaBlindata;
}

function uniq(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}

export function buildSecurityDoorRenderConfig(
  config: ConfigurazionePortaBlindata,
  rawAnalysis?: unknown,
  photoMeta?: SecurityDoorPhotoMeta | null,
): SecurityDoorRenderConfig {
  const scene = normalizeSecurityDoorSceneAnalysis(config, rawAnalysis, photoMeta);
  const target = buildSecurityDoorTargetOpeningMap(config, scene);
  const envelope = buildSecurityDoorBuildabilityEnvelope(config, scene, target);
  const technical = buildSecurityDoorTechnicalSpecification(config);
  const manifest = buildSecurityDoorReplacementManifest(config, scene, target, envelope);

  return {
    legacy_config: config,
    photo_meta: photoMeta ?? null,
    scene_analysis: scene,
    target_opening_map: target,
    buildability_envelope: envelope,
    technical_specification: technical,
    replacement_manifest: manifest,
    realism_rules: buildSecurityDoorRealismRules(config),
    integrity_constraints: uniq([
      ...DEFAULT_SECURITY_DOOR_INTEGRITY_CONSTRAINTS,
      ...manifest.preserveExactly,
    ]),
    quality_directives: buildSecurityDoorQualityDirectives(),
    notes: config.note_libere?.trim() ?? "",
  };
}

export function ensureSecurityDoorRenderConfig(
  rawConfig: Record<string, unknown>,
  rawAnalysis?: unknown,
  photoMeta?: SecurityDoorPhotoMeta | null,
): SecurityDoorRenderConfig {
  return buildSecurityDoorRenderConfig(asSecurityDoorConfig(rawConfig), rawAnalysis, photoMeta);
}
