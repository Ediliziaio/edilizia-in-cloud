import type {
  ConflictResolutionResult,
  DependencyResolutionPlan,
  DomainSpecBuildResult,
  GlobalPreservationMap,
  GlobalTargetMap,
  RenovationActionType,
  RenovationDomainId,
  UnifiedManifestItem,
  UnifiedReplacementManifest,
} from "./types";

function uniq(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function item(
  domain: RenovationDomainId,
  targetZone: string,
  actionType: RenovationActionType,
  description: string,
  rationale: string,
  compatibilityNotes: string[] = [],
): UnifiedManifestItem {
  return {
    domain,
    targetZone,
    actionType,
    description,
    rationale,
    compatibilityNotes,
  };
}

function firstZone(spec: DomainSpecBuildResult): string {
  return spec.affectedZones[0] ?? "visible target zone";
}

function mapItems(
  spec: DomainSpecBuildResult,
  actionType: RenovationActionType,
  descriptions: string[],
): UnifiedManifestItem[] {
  return descriptions.map((description) => item(
    spec.id,
    firstZone(spec),
    actionType,
    description,
    spec.intent,
    [...spec.conversionRules, ...spec.incompatibilityRules],
  ));
}

export function buildUnifiedReplacementManifest(
  specs: DomainSpecBuildResult[],
  targetMap: GlobalTargetMap,
  preservationMap: GlobalPreservationMap,
  dependencyPlan: DependencyResolutionPlan,
  conflictResolution: ConflictResolutionResult,
): UnifiedReplacementManifest {
  const activeDomains = uniq(specs.map((spec) => spec.id)) as RenovationDomainId[];

  return {
    activeDomains,
    additions: specs.flatMap((spec) => mapItems(spec, "add", spec.additions)),
    removals: specs.flatMap((spec) => mapItems(spec, "remove", spec.removals)),
    replacements: specs.flatMap((spec) => mapItems(spec, "replace", spec.replacements)),
    recolors: specs.flatMap((spec) => mapItems(spec, "recolor", spec.recolors)),
    preserveExactly: specs.flatMap((spec) => mapItems(spec, "preserve", spec.preserveExactly)),
    preserveGeometry: specs.flatMap((spec) => mapItems(spec, "preserve", spec.preserveGeometry)),
    preserveContext: uniq([
      ...preservationMap.preserveContext,
      ...preservationMap.preservePerspective,
      ...preservationMap.preserveImageDimensions,
    ]),
    conversionRules: specs.flatMap((spec) => mapItems(spec, "convert", spec.conversionRules)),
    conflictResolutionsApplied: uniq(conflictResolution.resolved.map((conflict) => conflict.resolution ?? conflict.message)),
    executionPriority: dependencyPlan.executionPriority,
    untouchedZones: uniq(targetMap.untouchedZones.map((zone) => `${zone.id}: ${zone.description}`)),
    forbiddenChanges: uniq([
      ...targetMap.forbiddenZones.map((zone) => `${zone.id}: ${zone.description}`),
      ...preservationMap.preserveExactly.map((value) => `do not alter ${value}`),
    ]),
  };
}
