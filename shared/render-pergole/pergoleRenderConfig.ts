import { normalizePergolaSceneAnalysis } from "./pergoleSceneAnalysis.ts";
import {
  buildPergolaInstallabilityEnvelope,
  buildPergolaTargetAreaMap,
} from "./pergolePlacementRules.ts";
import {
  buildPergolaQualityDirectives,
  buildPergolaReplacementManifest,
  buildPergolaTechnicalSpecification,
} from "./pergoleReplacementRules.ts";
import { DEFAULT_INTEGRITY_CONSTRAINTS } from "./promptFragments.ts";
import { normalizzaConfigPergola } from "./pergolaCoerenza.ts";
import type {
  ConfigurazionePergole,
  PergolaPhotoMeta,
  PergolaRenderConfig,
} from "./types.ts";

function asPergolaConfig(raw: ConfigurazionePergole | Record<string, unknown>): ConfigurazionePergole {
  return raw as unknown as ConfigurazionePergole;
}

export function buildPergoleRenderConfig(
  configScelta: ConfigurazionePergole,
  rawAnalysis?: unknown,
  photoMeta?: PergolaPhotoMeta | null,
): PergolaRenderConfig {
  // Tipologia, interruttore «addossata», copertura, stato, montanti e materiale resi
  // coerenti (pergolaCoerenza.ts, la stessa regola del prompt della edge).
  const config = normalizzaConfigPergola(configScelta);
  const scene = normalizePergolaSceneAnalysis(config, rawAnalysis, photoMeta);
  const target = buildPergolaTargetAreaMap(config, scene);
  const envelope = buildPergolaInstallabilityEnvelope(config, scene, target);
  const technical = buildPergolaTechnicalSpecification(config);
  const manifest = buildPergolaReplacementManifest(config, scene, target, envelope, technical);
  const integrity = Array.from(new Set([
    ...DEFAULT_INTEGRITY_CONSTRAINTS,
    ...manifest.preserveExactly,
  ]));

  return {
    legacy_config: config,
    photo_meta: photoMeta ?? null,
    scene_analysis: scene,
    target_installation_map: target,
    installability_envelope: envelope,
    technical_specification: technical,
    replacement_manifest: manifest,
    integrity_constraints: integrity,
    quality_directives: buildPergolaQualityDirectives(config),
    notes: config.note_libere?.trim() ?? "",
  };
}

export function ensurePergoleRenderConfig(
  rawConfig: ConfigurazionePergole | Record<string, unknown>,
  rawAnalysis?: unknown,
  photoMeta?: PergolaPhotoMeta | null,
): PergolaRenderConfig {
  return buildPergoleRenderConfig(asPergolaConfig(rawConfig), rawAnalysis, photoMeta);
}
