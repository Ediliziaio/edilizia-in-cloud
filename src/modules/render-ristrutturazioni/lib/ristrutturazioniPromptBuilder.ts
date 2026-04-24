import { renovationDomainAdapters } from "./domainAdapters";
import { resolveRistrutturazioneConflicts } from "./ristrutturazioniConflictResolver";
import { buildDependencyPlan } from "./ristrutturazioniDependencies";
import { buildUnifiedReplacementManifest } from "./ristrutturazioniManifest";
import { analyzeRistrutturazioneScene } from "./ristrutturazioniSceneAnalysis";
import { buildGlobalPreservationMap, buildGlobalTargetMap } from "./ristrutturazioniTargetMap";
import { validateRistrutturazionePrompt } from "./ristrutturazioniValidation";
import type {
  ConfigurazioneRistrutturazione,
  DomainSpecBuildResult,
  GlobalSceneAnalysis,
  RistrutturazionePromptBuildResult,
} from "./types";
import {
  bullets,
  compactList,
  formatConflicts,
  formatDomainAppendices,
  formatManifest,
  formatPreservationMap,
  formatScene,
  formatTargetMap,
  numbered,
  RENOVATION_NEGATIVE_CONSTRAINTS,
} from "./promptFragments";

const PROMPT_VERSION = "renovation-orchestrator-v2.0.0";

function uniq<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function normalizeConfig(config: ConfigurazioneRistrutturazione): ConfigurazioneRistrutturazione {
  return {
    mode: config.mode ?? "mixed_upgrade",
    strictSinglePhoto: config.strictSinglePhoto ?? true,
    sceneHint: config.sceneHint,
    activeDomains: uniq(config.activeDomains ?? []),
    domainConfigs: config.domainConfigs ?? {},
    requestedChanges: config.requestedChanges ?? [],
    preserve: config.preserve ?? [],
    notes: config.notes ?? "",
  };
}

function buildDomainSpecs(
  scene: GlobalSceneAnalysis,
  config: ConfigurazioneRistrutturazione,
): DomainSpecBuildResult[] {
  const specs: DomainSpecBuildResult[] = [];

  config.activeDomains.forEach((domain) => {
    const adapter = renovationDomainAdapters.find((item) => item.id === domain);
    if (!adapter || !adapter.canHandle(scene, config)) return;
    const built = adapter.buildDomainSpec(scene, config);
    if (!specs.some((spec) => spec.id === built.id)) specs.push(built);
  });

  return specs;
}

function buildAdapterDependencies(specs: DomainSpecBuildResult[], config: ConfigurazioneRistrutturazione) {
  return specs.flatMap((spec) => {
    const adapter = renovationDomainAdapters.find((item) => item.id === spec.id || (spec.id === "windows" && item.id === "generic_openings"));
    return adapter?.getDependencies(spec) ?? [];
  }).filter((dependency) => config.activeDomains.includes(dependency.from) || config.activeDomains.includes(dependency.to));
}

function blockA(): string {
  return `[BLOCK A - MISSION]
You are a SURGICAL PHOTOREALISTIC RENOVATION ORCHESTRATOR for the same photographed property/room.
Coordinate all validated renovation systems as one single coherent final scene.
Mandatory: same property or same room, same camera angle, same perspective, same architecture shell, same openings, same image dimensions, same surrounding context, no artistic reinterpretation, no different-property generation and no separate conflicting redesign passes.`;
}

function buildBlocks(
  config: ConfigurazioneRistrutturazione,
  scene: GlobalSceneAnalysis,
  targetMap: ReturnType<typeof buildGlobalTargetMap>,
  preservationMap: ReturnType<typeof buildGlobalPreservationMap>,
  specs: DomainSpecBuildResult[],
  dependencyPlan: ReturnType<typeof buildDependencyPlan>,
  conflicts: ReturnType<typeof resolveRistrutturazioneConflicts>,
  manifest: ReturnType<typeof buildUnifiedReplacementManifest>,
): Record<string, string> {
  const activeAppendices = formatDomainAppendices(specs);
  const allowed = compactList(scene.allowedDomains);
  const forbidden = compactList(scene.forbiddenDomains);
  const nonVisible = compactList(scene.nonVisibleDomains);

  return {
    A: blockA(),
    B: `[BLOCK B - SCENE CLASS AND VISIBILITY SCOPE]
Scene class: ${scene.sceneClass}
Visible domains: ${compactList(scene.visibleSystems)}
Allowed domains for this single photo: ${allowed}
Forbidden / non-compatible domains: ${forbidden}
Non-visible requested domains: ${nonVisible}
Single-photo scope limitation: if a requested system is not visible or compatible with the source photo, exclude it from the final image and do not hallucinate it.`,
    C: `[BLOCK C - GLOBAL SCENE INVENTORY]
${formatScene(scene)}
Structural constraints:
${bullets(scene.structuralConstraints)}
Environment/context:
${bullets(scene.environmentContext)}
Untouchable elements:
${bullets(scene.untouchableElements)}`,
    D: `[BLOCK D - GLOBAL TARGET ZONES MAP]
${formatTargetMap(targetMap)}`,
    E: `[BLOCK E - ACTIVE SYSTEMS LEDGER]
${specs.length ? specs.map((spec) => `- ${spec.id}: ${spec.intent}; zones: ${spec.affectedZones.join(", ")}; action: ${spec.actionType}`).join("\n") : "- no active render domain can be safely represented"}
Requested mode: ${config.mode}`,
    F: `[BLOCK F - DEPENDENCY ORDER]
Execution priority:
${numbered(dependencyPlan.executionPriority)}
Phases:
${dependencyPlan.phases.map((phase) => [
      `${phase.label} (${phase.id})`,
      `Domains: ${compactList(phase.domains)}`,
      bullets(phase.rules),
    ].join("\n")).join("\n\n")}
Cross-domain dependencies:
${bullets(dependencyPlan.dependencies.map((dependency) => `${dependency.from} ${dependency.kind} ${dependency.to}: ${dependency.reason}`))}`,
    G: `[BLOCK G - UNIFIED REPLACEMENT MANIFEST]
${formatManifest(manifest)}`,
    H: `[BLOCK H - CROSS-SYSTEM CONFLICT RESOLUTION RULES]
Conflict summary: ${conflicts.summary}
Resolved coordination rules:
${formatConflicts(conflicts.resolved)}
Unresolved conflicts:
${formatConflicts(conflicts.unresolved)}
General conflict rules:
${bullets([
      "facade insulation modifies reveal depth first, then windows/shutters adapt to the new reveal logic",
      "bathroom tub removal must happen before shower installation",
      "floor replacement must occur before skirting adaptation",
      "furniture color-only mode preserves geometry and position",
      "roof recolor does not alter skylight, chimney or gutter geometry",
      "if a requested system is not visible in the source photo, exclude it instead of hallucinating it",
    ])}`,
    I: `[BLOCK I - DOMAIN APPENDICES]
Only active, validated domains are included below. Inactive systems must not appear.

${activeAppendices}`,
    J: `[BLOCK J - PRESERVATION MAP]
${formatPreservationMap(preservationMap)}`,
    K: `[BLOCK K - REMOVAL AND RESTORATION RULES]
${bullets([
      "every removed object must disappear completely",
      "restore surrounding surfaces cleanly after removals",
      "no hybrid old/new states",
      "no partial remnants or ghost geometry",
      "no mixed incompatible construction systems",
      ...manifest.removals.map((item) => item.description),
    ])}`,
    L: `[BLOCK L - PHOTOREALISM RULES]
${bullets([
      "realistic materials, scale, shadows, contact occlusion and reflections",
      "physically plausible joins between new and existing elements",
      "no warped geometry, no floating elements, no fake showroom CGI look",
      "strict same-scene realism with original camera perspective and lighting",
      "premium renovation sales visualization quality",
    ])}`,
    M: `[BLOCK M - NEGATIVE CONSTRAINTS]
${bullets(RENOVATION_NEGATIVE_CONSTRAINTS)}`,
    N: `[BLOCK N - QUALITY BAR]
${bullets([
      "professional renovation sales visualization",
      "same-scene realism",
      "coordinated multi-system credibility",
      "high-trust output suitable for commercial use",
      "exact respect of selected renovation scope",
    ])}`,
  };
}

function invalidUserPrompt(blocks: Record<string, string>, validationMessage: string): string {
  return [
    "[VALIDATION FAILED - DO NOT GENERATE IMAGE]",
    validationMessage,
    "The request must be corrected or split into compatible render jobs before calling the image generation model.",
    blocks.B,
    blocks.H,
    blocks.J,
    blocks.M,
  ].join("\n\n");
}

export function buildRistrutturazionePrompt(
  rawConfig: ConfigurazioneRistrutturazione,
  rawAnalysis: Partial<GlobalSceneAnalysis> = {},
): RistrutturazionePromptBuildResult {
  const config = normalizeConfig(rawConfig);
  const sceneAnalysis = analyzeRistrutturazioneScene(config, rawAnalysis);
  const targetMap = buildGlobalTargetMap(sceneAnalysis, config);
  const preservationMap = buildGlobalPreservationMap(sceneAnalysis, config);
  const domainSpecs = buildDomainSpecs(sceneAnalysis, config);
  const adapterDependencies = buildAdapterDependencies(domainSpecs, config);
  const dependencyPlan = buildDependencyPlan(sceneAnalysis.sceneClass, domainSpecs, adapterDependencies);
  const conflicts = resolveRistrutturazioneConflicts(sceneAnalysis, config, targetMap, preservationMap, domainSpecs);
  const replacementManifest = buildUnifiedReplacementManifest(domainSpecs, targetMap, preservationMap, dependencyPlan, conflicts);
  const blocks = buildBlocks(config, sceneAnalysis, targetMap, preservationMap, domainSpecs, dependencyPlan, conflicts, replacementManifest);
  const validation = validateRistrutturazionePrompt(
    config,
    sceneAnalysis,
    targetMap,
    preservationMap,
    dependencyPlan,
    replacementManifest,
    conflicts,
    blocks,
  );

  const validPrompt = [
    blocks.B,
    blocks.C,
    blocks.D,
    blocks.E,
    blocks.F,
    blocks.G,
    blocks.H,
    blocks.I,
    blocks.J,
    blocks.K,
    blocks.L,
    blocks.M,
    blocks.N,
    config.notes ? `[ADDITIONAL USER NOTES]\n${config.notes}` : "",
  ].filter(Boolean).join("\n\n");

  const validationMessage = [
    `Scene class ${sceneAnalysis.sceneClass} cannot safely render requested out-of-scope domains: ${validation.outOfScopeDomains.join(", ") || "none"}.`,
    `Blocking conflicts: ${validation.blockingConflicts.map((item) => item.message).join(" | ") || "none"}.`,
    validation.suggestedSplitJobs.length
      ? `Suggested split: ${validation.suggestedSplitJobs.map((job) => `${job.domains.join(", ")} -> separate compatible photo`).join("; ")}.`
      : "",
  ].filter(Boolean).join("\n");

  return {
    systemPrompt: blocks.A,
    userPrompt: validation.isValid ? validPrompt : invalidUserPrompt(blocks, validationMessage),
    negativePrompt: RENOVATION_NEGATIVE_CONSTRAINTS.join(", "),
    promptVersion: PROMPT_VERSION,
    blocks,
    sceneClass: sceneAnalysis.sceneClass,
    sceneAnalysis,
    targetMap,
    preservationMap,
    activeDomains: replacementManifest.activeDomains,
    domainSpecs,
    dependencyPlan,
    replacementManifest,
    conflicts,
    validation,
  };
}

export const buildRenovationPrompt = buildRistrutturazionePrompt;
