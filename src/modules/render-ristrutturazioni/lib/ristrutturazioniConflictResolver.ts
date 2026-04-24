import type {
  ConfigurazioneRistrutturazione,
  ConflictItem,
  ConflictResolutionResult,
  DomainSpecBuildResult,
  GlobalPreservationMap,
  GlobalSceneAnalysis,
  GlobalTargetMap,
  RenovationDomainId,
} from "./types";

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function sharesToken(a: string, b: string): boolean {
  const left = normalize(a).split(" ").filter((token) => token.length > 3);
  const right = new Set(normalize(b).split(" ").filter((token) => token.length > 3));
  return left.some((token) => right.has(token));
}

function conflict(input: ConflictItem): ConflictItem {
  return input;
}

function domainOutOfScopeConflicts(scene: GlobalSceneAnalysis, config: ConfigurazioneRistrutturazione): ConflictItem[] {
  return config.activeDomains
    .filter((domain) => scene.forbiddenDomains.includes(domain) || scene.nonVisibleDomains.includes(domain))
    .map((domain) => conflict({
      type: scene.nonVisibleDomains.includes(domain) ? "photo_scope_conflict" : "scene_class_conflict",
      severity: "blocking",
      domains: [domain],
      message: `${domain} is outside the single-photo visible scope for scene class ${scene.sceneClass}`,
      resolution: "exclude this domain from the final image or split into a separate render job with a compatible photo",
    }));
}

function removalPreserveConflicts(
  specs: DomainSpecBuildResult[],
  preservationMap: GlobalPreservationMap,
): ConflictItem[] {
  const preserve = [
    ...preservationMap.preserveExactly,
    ...preservationMap.preserveGeometry,
    ...preservationMap.preservePosition,
  ];

  return specs.flatMap((spec) => spec.removals.flatMap((removal) => {
    const match = preserve.find((item) => sharesToken(removal, item));
    if (!match) return [];
    return conflict({
      type: "removal_conflict",
      severity: "blocking",
      domains: [spec.id],
      message: `Removal "${removal}" conflicts with preservation rule "${match}"`,
      resolution: "make the removal target explicit or remove the preservation constraint for that object",
    });
  }));
}

function resolvedCoordinationRules(specs: DomainSpecBuildResult[]): ConflictItem[] {
  const active = new Set(specs.map((spec) => spec.id));
  const items: ConflictItem[] = [];

  if (active.has("facade") && (active.has("windows") || active.has("generic_openings"))) {
    items.push(conflict({
      type: "geometry_conflict",
      severity: "info",
      domains: ["facade", active.has("windows") ? "windows" : "generic_openings"],
      zone: "facade.openings",
      message: "Facade insulation/reveal-depth and window replacement both affect openings",
      resolution: "facade envelope/reveal depth is solved first; windows adapt to final reveal geometry without resizing openings",
    }));
  }

  if ((active.has("windows") || active.has("generic_openings")) && active.has("shutters")) {
    items.push(conflict({
      type: "geometry_conflict",
      severity: "info",
      domains: [active.has("windows") ? "windows" : "generic_openings", "shutters"],
      zone: "facade.shutters",
      message: "Windows/openings and shutters both depend on opening geometry",
      resolution: "windows/opening geometry is locked before shutters; shutters align to final reveal and hardware logic",
    }));
  }

  if (active.has("floor") && active.has("room")) {
    items.push(conflict({
      type: "zone_overlap",
      severity: "info",
      domains: ["floor", "room"],
      zone: "room.floor",
      message: "Room restyling and floor replacement both mention the floor zone",
      resolution: "floor domain owns material/pattern; room domain may only adapt skirting, furniture shadows and decor after floor is locked",
    }));
  }

  if (active.has("bathroom") && active.has("floor")) {
    items.push(conflict({
      type: "zone_overlap",
      severity: "info",
      domains: ["bathroom", "floor"],
      zone: "bathroom.floor",
      message: "Bathroom and floor domain both refer to bathroom floor",
      resolution: "bathroom manifest defines fixture/surface coordination; floor geometry rules control floor pattern and perspective",
    }));
  }

  if (active.has("pool") && active.has("pergola")) {
    items.push(conflict({
      type: "zone_overlap",
      severity: "info",
      domains: ["pool", "pergola"],
      zone: "outdoor.site_lock",
      message: "Pool and pergola both occupy outdoor site zones",
      resolution: "pool footprint and deck/coping are established first; pergola post positions are placed after site constraints",
    }));
  }

  return items;
}

function duplicateZoneWarnings(specs: DomainSpecBuildResult[], targetMap: GlobalTargetMap): ConflictItem[] {
  const seen = new Map<string, RenovationDomainId[]>();
  specs.forEach((spec) => {
    spec.affectedZones.forEach((zone) => {
      seen.set(zone, [...(seen.get(zone) ?? []), spec.id]);
    });
  });

  const protectedZones = new Set(targetMap.forbiddenZones.map((zone) => zone.id));

  return Array.from(seen.entries()).flatMap(([zone, domains]) => {
    const unique = Array.from(new Set(domains));
    if (unique.length < 2 || protectedZones.has(zone)) return [];
    const alreadyResolved = resolvedCoordinationRules(specs).some((item) => item.zone === zone);
    if (alreadyResolved) return [];
    return conflict({
      type: "zone_overlap",
      severity: "warning",
      domains: unique,
      zone,
      message: `Multiple domains target ${zone}`,
      resolution: "domain priorities and manifest rules must assign one owner for material/geometry and keep the other as adaptation-only",
    });
  });
}

function splitSuggestion(scene: GlobalSceneAnalysis, config: ConfigurazioneRistrutturazione): ConflictItem[] {
  if (!config.strictSinglePhoto && config.strictSinglePhoto !== undefined) return [];
  const outOfScope = config.activeDomains.filter((domain) => scene.nonVisibleDomains.includes(domain) || scene.forbiddenDomains.includes(domain));
  if (!outOfScope.length) return [];
  return [conflict({
    type: "photo_scope_conflict",
    severity: "blocking",
    domains: outOfScope,
    message: `Single-photo scope cannot represent ${outOfScope.join(", ")} together with ${scene.sceneClass}`,
    resolution: "split the request into separate render jobs with compatible photos instead of hallucinating invisible domains",
  })];
}

export function resolveRistrutturazioneConflicts(
  scene: GlobalSceneAnalysis,
  config: ConfigurazioneRistrutturazione,
  targetMap: GlobalTargetMap,
  preservationMap: GlobalPreservationMap,
  specs: DomainSpecBuildResult[],
): ConflictResolutionResult {
  const blocking = [
    ...domainOutOfScopeConflicts(scene, config),
    ...splitSuggestion(scene, config),
    ...removalPreserveConflicts(specs, preservationMap),
    ...specs.flatMap((spec) => spec.validation.errors.map((message) => conflict({
      type: "photo_scope_conflict",
      severity: "blocking" as const,
      domains: [spec.id],
      message,
      resolution: "fix domain visibility/configuration before generation",
    }))),
  ];
  const resolved = resolvedCoordinationRules(specs);
  const warnings = duplicateZoneWarnings(specs, targetMap);
  const conflicts = [...blocking, ...warnings, ...resolved];
  const unresolved = conflicts.filter((item) => item.severity === "blocking" || (item.severity === "warning" && !item.resolution));

  return {
    conflicts,
    resolved,
    unresolved,
    summary: unresolved.length
      ? `${unresolved.length} unresolved blocking/warning conflict(s); generation must not proceed.`
      : resolved.length
        ? `${resolved.length} cross-system coordination rule(s) resolved.`
        : "No cross-system conflicts detected.",
  };
}
