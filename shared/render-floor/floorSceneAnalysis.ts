import type { AnalisiPavimento, FloorCoverageMap, FloorSceneAnalysis } from "./types.ts";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function booleanOr(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function stringArrayOr(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  const items = value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  return items.length > 0 ? items : fallback;
}

export function normalizeFloorSceneAnalysis(raw?: unknown): FloorSceneAnalysis {
  const source = asRecord(raw);
  const currentFloor = asRecord(source.current_floor);
  const skirting = asRecord(source.skirting);
  const lighting = asRecord(source.lighting);

  const legacy = source as Partial<AnalisiPavimento>;

  const obstacles = stringArrayOr(
    source.obstacles ?? source.objects ?? legacy.obstacles,
    ["visible furniture and objects resting on the existing floor"],
  );

  const preserved = stringArrayOr(
    source.untouched_elements ?? source.preserved_elements ?? legacy.preserved_elements,
    ["walls", "ceiling", "furniture", "doors", "windows", "radiators", "switches and outlets"],
  );

  return {
    roomType: stringOr(source.room_type ?? legacy.tipo_stanza, "generic interior room"),
    estimatedSize: stringOr(source.estimated_size ?? legacy.dimensione_stimata, "not clearly estimated"),
    cameraPerspective: stringOr(
      source.camera_perspective ?? source.perspective ?? legacy.note,
      "photographed room perspective with visible floor plane and vanishing points",
    ),
    visibleFloorArea: stringOr(source.visible_floor_area ?? legacy.visible_floor_area, "main visible floor area in the photograph"),
    roomOrientation: stringOr(source.room_orientation ?? legacy.room_orientation, "not explicitly identified"),
    visibleWalls: numberOr(source.visible_walls ?? legacy.walls_visible, 2),
    currentFloor: {
      material: stringOr(currentFloor.material ?? source.current_floor_material ?? legacy.pavimento_attuale, "unknown existing floor"),
      color: stringOr(currentFloor.color ?? source.current_floor_color ?? legacy.colore_attuale, "unknown current color"),
      format: stringOr(currentFloor.format ?? source.current_floor_format ?? legacy.current_floor_format, "unknown format"),
      hasVisibleJoints: booleanOr(
        currentFloor.has_visible_joints ?? source.has_visible_joints ?? legacy.has_visible_joints,
        true,
      ),
      condition: stringOr(currentFloor.condition ?? source.condition ?? legacy.stato_conservazione, "not clearly identified"),
    },
    skirting: {
      present: booleanOr(skirting.present ?? source.baseboard_present ?? legacy.battiscopa_presente, false),
      material: stringOr(skirting.material ?? source.baseboard_material, "not identified"),
      color: stringOr(skirting.color ?? source.baseboard_color, "not identified"),
      height: stringOr(skirting.height ?? source.baseboard_height, "not identified"),
    },
    obstacles,
    rugsPresent: booleanOr(source.rugs_present ?? legacy.rugs_present, false),
    doorsAndThresholds: stringOr(
      source.doors_and_thresholds ?? source.thresholds ?? (legacy.thresholds_visible ? "visible thresholds" : undefined),
      "preserve existing visible door thresholds unless configured otherwise",
    ),
    stepsOrRaisedAreas: stringOr(
      source.steps_or_raised_areas ?? (legacy.steps_visible ? "visible steps or raised zones" : undefined),
      "no clear steps or raised areas identified",
    ),
    lighting: {
      quality: stringOr(lighting.quality ?? source.light_quality ?? legacy.light_quality, "existing room light"),
      direction: stringOr(lighting.direction ?? source.light_direction, "same direction as source photo"),
      reflections: stringOr(
        lighting.reflections ?? (legacy.reflections_present ? "visible reflections on existing floor" : undefined),
        "match any photographed reflection behavior",
      ),
    },
    floorPerimeterGeometry: stringOr(
      source.floor_perimeter_geometry ?? legacy.floor_perimeter_geometry,
      "floor edges meet visible walls, door frames and furniture bases",
    ),
    untouchedElements: preserved,
    analysisNotes: stringOr(source.analysis_notes ?? legacy.note, "preserve the same room identity"),
  };
}

export function buildFloorCoverageMap(scene: FloorSceneAnalysis): FloorCoverageMap {
  const thresholds = scene.doorsAndThresholds.toLowerCase().includes("no clear")
    ? []
    : [scene.doorsAndThresholds];

  const raisedAreas = scene.stepsOrRaisedAreas.toLowerCase().includes("no clear")
    ? []
    : [scene.stepsOrRaisedAreas];

  return {
    mainVisibleArea: scene.visibleFloorArea,
    perimeterBoundaries: [
      scene.floorPerimeterGeometry,
      "visible wall-floor junctions",
      "door-frame and threshold contact lines",
    ],
    thresholds,
    raisedAreas,
    coveredOrOccludedZones: [
      scene.rugsPresent ? "areas under existing rugs must stay occluded by the same rugs" : "",
      "floor portions hidden under furniture remain logically continuous but not visibly invented",
    ].filter(Boolean),
    furnitureContactZones: scene.obstacles,
    crispEdges: [
      "floor perimeter against walls",
      "floor contact under furniture legs and plinths",
      "visible threshold transitions",
      "all cuts near corners and door frames",
    ],
  };
}
