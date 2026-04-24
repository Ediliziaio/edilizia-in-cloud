import type {
  ConfigurazioneRistrutturazione,
  ConflictResolutionResult,
  DependencyResolutionPlan,
  GlobalPreservationMap,
  GlobalSceneAnalysis,
  GlobalTargetMap,
  RenovationDomainId,
  RenovationPromptValidationResult,
  UnifiedReplacementManifest,
} from "./types";

function missingWhen(condition: boolean, section: string): string[] {
  return condition ? [] : [section];
}

function suggestedSplitJobs(
  scene: GlobalSceneAnalysis,
  outOfScopeDomains: RenovationDomainId[],
): RenovationPromptValidationResult["suggestedSplitJobs"] {
  if (!outOfScopeDomains.length) return [];
  return [{
    sceneClass: "unknown",
    domains: outOfScopeDomains,
    reason: `Domains ${outOfScopeDomains.join(", ")} are not visible/compatible with current ${scene.sceneClass} single-photo scene`,
  }];
}

export function validateRistrutturazionePrompt(
  config: ConfigurazioneRistrutturazione,
  scene: GlobalSceneAnalysis,
  targetMap: GlobalTargetMap,
  preservationMap: GlobalPreservationMap,
  dependencyPlan: DependencyResolutionPlan,
  manifest: UnifiedReplacementManifest,
  conflicts: ConflictResolutionResult,
  blocks: Record<string, string>,
): RenovationPromptValidationResult {
  const outOfScopeDomains = config.activeDomains.filter((domain) =>
    scene.forbiddenDomains.includes(domain) || scene.nonVisibleDomains.includes(domain)
  );

  const missingSections = [
    ...missingWhen(Boolean(scene.sceneClass), "scene class"),
    ...missingWhen(scene.allowedDomains.length > 0, "allowed domains"),
    ...missingWhen(targetMap.allZones.length > 0, "global target map"),
    ...missingWhen(preservationMap.preserveExactly.length > 0, "preservation map"),
    ...missingWhen(dependencyPlan.phases.length > 0, "dependency order"),
    ...missingWhen(manifest.activeDomains.length > 0 || outOfScopeDomains.length > 0, "replacement manifest"),
    ...missingWhen(blocks.A?.includes("MISSION") ?? false, "mission block"),
    ...missingWhen(blocks.H?.includes("CONFLICT") ?? false, "conflict resolution block"),
    ...missingWhen(blocks.J?.includes("PRESERVATION") ?? false, "preservation block"),
    ...missingWhen(blocks.M?.includes("NEGATIVE") ?? false, "negative constraints block"),
  ];

  const blockingConflicts = conflicts.conflicts.filter((conflict) => conflict.severity === "blocking");
  const warnings = [
    ...conflicts.conflicts.filter((conflict) => conflict.severity === "warning").map((conflict) => conflict.message),
    ...scene.nonVisibleDomains.map((domain) => `${domain} is not visible in this photo`),
  ];

  const canGenerateSingleImage = missingSections.length === 0 &&
    blockingConflicts.length === 0 &&
    outOfScopeDomains.length === 0;

  return {
    isValid: canGenerateSingleImage,
    canGenerateSingleImage,
    missingSections,
    blockingConflicts,
    warnings,
    outOfScopeDomains,
    suggestedSplitJobs: suggestedSplitJobs(scene, outOfScopeDomains),
  };
}
