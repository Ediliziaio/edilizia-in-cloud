import type {
  ConflictItem,
  DomainSpecBuildResult,
  GlobalPreservationMap,
  GlobalSceneAnalysis,
  GlobalTargetMap,
  TargetZoneItem,
  UnifiedManifestItem,
  UnifiedReplacementManifest,
} from "./types";

export function bullets(lines: Array<string | null | undefined>): string {
  return lines
    .filter((line): line is string => Boolean(line && line.trim()))
    .map((line) => `- ${line}`)
    .join("\n");
}

export function numbered(lines: Array<string | null | undefined>): string {
  return lines
    .filter((line): line is string => Boolean(line && line.trim()))
    .map((line, index) => `${index + 1}. ${line}`)
    .join("\n");
}

export function compactList(values: string[]): string {
  return values.length ? values.join(", ") : "none";
}

export function formatZones(zones: TargetZoneItem[]): string {
  if (!zones.length) return "- none";
  return bullets(zones.map((zone) => `${zone.label} (${zone.id}): ${zone.description}`));
}

export function formatManifestItems(items: UnifiedManifestItem[]): string {
  if (!items.length) return "- none";
  return bullets(items.map((item) =>
    `[${item.domain}] ${item.actionType.toUpperCase()} ${item.targetZone}: ${item.description}`
  ));
}

export function formatConflicts(conflicts: ConflictItem[]): string {
  if (!conflicts.length) return "- no unresolved conflicts";
  return bullets(conflicts.map((conflict) =>
    `[${conflict.severity}] ${conflict.type}: ${conflict.message}${conflict.resolution ? ` Resolution: ${conflict.resolution}` : ""}`
  ));
}

export function formatScene(scene: GlobalSceneAnalysis): string {
  return [
    `Scene class: ${scene.sceneClass}`,
    `Property / room type: ${scene.propertyOrRoomType}`,
    `Architecture shell: ${scene.architectureShell}`,
    `Camera perspective: ${scene.cameraPerspective}`,
    `Visible surfaces: ${compactList(scene.visibleSurfaces)}`,
    `Visible openings: ${compactList(scene.visibleOpenings)}`,
    `Fixed functional anchors: ${compactList(scene.fixedFunctionalAnchors)}`,
    `Movable objects: ${compactList(scene.movableObjects)}`,
    `Lighting and shadows: ${scene.lightingAndShadows}`,
    `Visible systems: ${compactList(scene.visibleSystems)}`,
  ].join("\n");
}

export function formatTargetMap(targetMap: GlobalTargetMap): string {
  return [
    `Primary target zones:\n${formatZones(targetMap.primaryTargetZones)}`,
    `Secondary target zones:\n${formatZones(targetMap.secondaryTargetZones)}`,
    `Untouched zones:\n${formatZones(targetMap.untouchedZones)}`,
    `Forbidden zones:\n${formatZones(targetMap.forbiddenZones)}`,
    `Ambiguous zones:\n${formatZones(targetMap.ambiguousZones)}`,
  ].join("\n");
}

export function formatPreservationMap(map: GlobalPreservationMap): string {
  return [
    `Preserve exactly:\n${bullets(map.preserveExactly)}`,
    `Preserve geometry:\n${bullets(map.preserveGeometry)}`,
    `Preserve position:\n${bullets(map.preservePosition)}`,
    `Preserve material:\n${bullets(map.preserveMaterial)}`,
    `Preserve shape:\n${bullets(map.preserveShape)}`,
    `Preserve context:\n${bullets(map.preserveContext)}`,
    `Preserve image dimensions:\n${bullets(map.preserveImageDimensions)}`,
    `Preserve perspective:\n${bullets(map.preservePerspective)}`,
  ].join("\n");
}

export function formatManifest(manifest: UnifiedReplacementManifest): string {
  return [
    `Active domains: ${compactList(manifest.activeDomains)}`,
    `Execution priority: ${compactList(manifest.executionPriority)}`,
    `Additions:\n${formatManifestItems(manifest.additions)}`,
    `Removals:\n${formatManifestItems(manifest.removals)}`,
    `Replacements:\n${formatManifestItems(manifest.replacements)}`,
    `Recolors:\n${formatManifestItems(manifest.recolors)}`,
    `Preserve exactly:\n${formatManifestItems(manifest.preserveExactly)}`,
    `Preserve geometry:\n${formatManifestItems(manifest.preserveGeometry)}`,
    `Conversion rules:\n${formatManifestItems(manifest.conversionRules)}`,
    `Conflict resolutions applied:\n${bullets(manifest.conflictResolutionsApplied.length ? manifest.conflictResolutionsApplied : ["none"])}`,
    `Untouched zones:\n${bullets(manifest.untouchedZones)}`,
    `Forbidden changes:\n${bullets(manifest.forbiddenChanges)}`,
  ].join("\n");
}

export function formatDomainAppendices(specs: DomainSpecBuildResult[]): string {
  if (!specs.length) return "- no active domain appendices";
  return specs.map((spec) => [
    `[${spec.id.toUpperCase()} APPENDIX]`,
    `Intent: ${spec.intent}`,
    `Affected zones: ${compactList(spec.affectedZones)}`,
    `Summary: ${spec.domainPromptBlocks.summary ?? "n/a"}`,
    `Technical rules: ${spec.domainPromptBlocks.technical ?? "n/a"}`,
    `Preserve exactly: ${compactList(spec.preserveExactly)}`,
    `Conversion rules: ${compactList(spec.conversionRules)}`,
    `Incompatibility cleanup: ${compactList(spec.incompatibilityRules)}`,
  ].join("\n")).join("\n\n");
}

export const RENOVATION_NEGATIVE_CONSTRAINTS = [
  "do not generate a different property or a different room",
  "do not redesign non-target architecture",
  "do not move windows, doors, structural walls, roof planes or fixed openings unless explicitly visible and selected",
  "do not alter non-target zones",
  "do not invent elements outside the visible scene",
  "do not merge incompatible domains into one image",
  "do not leave old/new hybrid artifacts",
  "do not stylize, cartoonize or make a generic AI showroom",
  "do not change image crop, aspect ratio, camera angle or perspective",
  "do not beautify by changing unrelated parts of the photo",
];
