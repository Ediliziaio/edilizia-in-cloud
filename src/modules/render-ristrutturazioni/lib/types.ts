export const RENOVATION_DOMAIN_IDS = [
  "bathroom",
  "room",
  "floor",
  "facade",
  "windows",
  "shutters",
  "roof",
  "pool",
  "pergola",
  "exterior_flooring",
  "garden",
  "generic_openings",
] as const;

export type RenovationDomainId = typeof RENOVATION_DOMAIN_IDS[number];

export type RenovationSceneClass =
  | "bathroom"
  | "room"
  | "kitchen_room"
  | "facade"
  | "roof"
  | "outdoor"
  | "mixed_exterior_envelope"
  | "mixed_interior_room"
  | "unknown";

export type RenovationMode =
  | "selective"
  | "partial"
  | "full"
  | "energy_retrofit"
  | "premium_restyle"
  | "mixed_upgrade";

export type RenovationActionType =
  | "add"
  | "remove"
  | "replace"
  | "recolor"
  | "refinish"
  | "preserve"
  | "convert"
  | "restore";

export type DomainDependencyKind =
  | "must_run_before"
  | "must_run_after"
  | "preserves"
  | "adapts_to"
  | "blocks_if_not_visible";

export type ConflictType =
  | "zone_overlap"
  | "geometry_conflict"
  | "material_conflict"
  | "removal_conflict"
  | "scene_class_conflict"
  | "photo_scope_conflict"
  | "style_conflict"
  | "preservation_conflict";

export type ConflictSeverity = "info" | "warning" | "blocking";

export interface RenovationRequestedChange {
  domain?: RenovationDomainId;
  targetZone?: string;
  action: RenovationActionType;
  object?: string;
  specification?: string;
  preserve?: string[];
  priority?: "low" | "normal" | "high" | "critical";
}

export interface ConfigurazioneRistrutturazione {
  mode: RenovationMode;
  sceneHint?: RenovationSceneClass;
  strictSinglePhoto?: boolean;
  activeDomains: RenovationDomainId[];
  domainConfigs?: Partial<Record<RenovationDomainId, Record<string, unknown>>>;
  requestedChanges?: RenovationRequestedChange[];
  preserve?: string[];
  notes?: string;
}

export interface GlobalSceneAnalysis {
  version: "1.0";
  sceneClass: RenovationSceneClass;
  sceneConfidence: "low" | "medium" | "high";
  propertyOrRoomType: string;
  architectureShell: string;
  cameraPerspective: string;
  visibleSurfaces: string[];
  visibleOpenings: string[];
  fixedFunctionalAnchors: string[];
  movableObjects: string[];
  structuralConstraints: string[];
  environmentContext: string[];
  lightingAndShadows: string;
  visibleSystems: RenovationDomainId[];
  allowedDomains: RenovationDomainId[];
  forbiddenDomains: RenovationDomainId[];
  nonVisibleDomains: RenovationDomainId[];
  candidateTargetZones: string[];
  untouchableElements: string[];
  sourceSignals: string[];
}

export interface TargetZoneItem {
  id: string;
  label: string;
  role: "primary" | "secondary" | "supporting" | "untouched" | "forbidden" | "ambiguous";
  domains: RenovationDomainId[];
  description: string;
}

export interface GlobalTargetMap {
  primaryTargetZones: TargetZoneItem[];
  secondaryTargetZones: TargetZoneItem[];
  supportingZones: TargetZoneItem[];
  untouchedZones: TargetZoneItem[];
  forbiddenZones: TargetZoneItem[];
  ambiguousZones: TargetZoneItem[];
  allZones: TargetZoneItem[];
}

export interface GlobalPreservationMap {
  preserveExactly: string[];
  preserveGeometry: string[];
  preservePosition: string[];
  preserveMaterial: string[];
  preserveShape: string[];
  preserveContext: string[];
  preserveImageDimensions: string[];
  preservePerspective: string[];
}

export interface DomainValidationResult {
  isValid: boolean;
  warnings: string[];
  errors: string[];
}

export interface DomainSpecBuildResult {
  id: RenovationDomainId;
  active: boolean;
  actionType: RenovationActionType | "mixed";
  intent: string;
  affectedZones: string[];
  additions: string[];
  removals: string[];
  replacements: string[];
  recolors: string[];
  preserveExactly: string[];
  preserveGeometry: string[];
  conversionRules: string[];
  incompatibilityRules: string[];
  domainPromptBlocks: Record<string, string>;
  validation: DomainValidationResult;
}

export interface DomainDependency {
  from: RenovationDomainId;
  to: RenovationDomainId;
  kind: DomainDependencyKind;
  reason: string;
}

export interface DependencyResolutionPlan {
  sceneClass: RenovationSceneClass;
  executionPriority: RenovationDomainId[];
  phases: Array<{
    id: string;
    label: string;
    domains: RenovationDomainId[];
    rules: string[];
  }>;
  dependencies: DomainDependency[];
}

export interface ConflictItem {
  type: ConflictType;
  severity: ConflictSeverity;
  domains: RenovationDomainId[];
  zone?: string;
  message: string;
  resolution?: string;
}

export interface ConflictResolutionResult {
  conflicts: ConflictItem[];
  resolved: ConflictItem[];
  unresolved: ConflictItem[];
  summary: string;
}

export interface UnifiedManifestItem {
  domain: RenovationDomainId;
  targetZone: string;
  actionType: RenovationActionType;
  description: string;
  rationale: string;
  compatibilityNotes: string[];
}

export interface UnifiedReplacementManifest {
  activeDomains: RenovationDomainId[];
  additions: UnifiedManifestItem[];
  removals: UnifiedManifestItem[];
  replacements: UnifiedManifestItem[];
  recolors: UnifiedManifestItem[];
  preserveExactly: UnifiedManifestItem[];
  preserveGeometry: UnifiedManifestItem[];
  preserveContext: string[];
  conversionRules: UnifiedManifestItem[];
  conflictResolutionsApplied: string[];
  executionPriority: RenovationDomainId[];
  untouchedZones: string[];
  forbiddenChanges: string[];
}

export interface RenovationPromptValidationResult {
  isValid: boolean;
  canGenerateSingleImage: boolean;
  missingSections: string[];
  blockingConflicts: ConflictItem[];
  warnings: string[];
  outOfScopeDomains: RenovationDomainId[];
  suggestedSplitJobs: Array<{
    sceneClass: RenovationSceneClass;
    domains: RenovationDomainId[];
    reason: string;
  }>;
}

export interface RistrutturazionePromptBuildResult {
  systemPrompt: string;
  userPrompt: string;
  negativePrompt: string;
  promptVersion: string;
  blocks: Record<string, string>;
  sceneClass: RenovationSceneClass;
  sceneAnalysis: GlobalSceneAnalysis;
  targetMap: GlobalTargetMap;
  preservationMap: GlobalPreservationMap;
  activeDomains: RenovationDomainId[];
  domainSpecs: DomainSpecBuildResult[];
  dependencyPlan: DependencyResolutionPlan;
  replacementManifest: UnifiedReplacementManifest;
  conflicts: ConflictResolutionResult;
  validation: RenovationPromptValidationResult;
}

export interface RenovationDomainAdapter<TConfig = Record<string, unknown>> {
  id: RenovationDomainId;
  canHandle(scene: GlobalSceneAnalysis, config: TConfig): boolean;
  buildDomainSpec(scene: GlobalSceneAnalysis, config: TConfig): DomainSpecBuildResult;
  getDependencies(spec: DomainSpecBuildResult): DomainDependency[];
  validate(scene: GlobalSceneAnalysis, config: TConfig, spec: DomainSpecBuildResult): DomainValidationResult;
}
