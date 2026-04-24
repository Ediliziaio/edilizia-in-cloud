import type {
  DependencyResolutionPlan,
  DomainDependency,
  DomainSpecBuildResult,
  RenovationDomainId,
  RenovationSceneClass,
} from "./types";

const ORDER_BY_SCENE: Record<RenovationSceneClass, RenovationDomainId[]> = {
  bathroom: ["floor", "bathroom"],
  room: ["floor", "room"],
  kitchen_room: ["floor", "room"],
  mixed_interior_room: ["floor", "room"],
  facade: ["facade", "windows", "shutters", "roof", "generic_openings"],
  mixed_exterior_envelope: ["facade", "windows", "generic_openings", "shutters", "roof"],
  roof: ["roof"],
  outdoor: ["garden", "pool", "exterior_flooring", "pergola"],
  unknown: ["facade", "windows", "shutters", "roof", "floor", "bathroom", "room", "pool", "exterior_flooring", "pergola", "garden", "generic_openings"],
};

function uniqueDomains(domains: RenovationDomainId[]): RenovationDomainId[] {
  return Array.from(new Set(domains));
}

function orderedActive(sceneClass: RenovationSceneClass, specs: DomainSpecBuildResult[]): RenovationDomainId[] {
  const active = new Set(specs.map((spec) => spec.id));
  const preferred = ORDER_BY_SCENE[sceneClass].filter((domain) => active.has(domain));
  const rest = specs.map((spec) => spec.id).filter((domain) => !preferred.includes(domain));
  return uniqueDomains([...preferred, ...rest]);
}

function phase(
  id: string,
  label: string,
  domains: RenovationDomainId[],
  rules: string[],
) {
  return { id, label, domains: uniqueDomains(domains), rules };
}

function phasesFor(sceneClass: RenovationSceneClass, specs: DomainSpecBuildResult[]) {
  const active = new Set(specs.map((spec) => spec.id));

  if (sceneClass === "bathroom") {
    return [
      phase("bathroom-demolition", "Demolition and removals first", ["bathroom"], [
        "remove bathtub, obsolete fixtures and incompatible old states before installing new shower/tub",
        "no removed fixture may remain partially visible",
      ]),
      phase("bathroom-surfaces", "Floor and wall surfaces", ["floor", "bathroom"].filter((domain) => active.has(domain as RenovationDomainId)) as RenovationDomainId[], [
        "floor and wall surfaces lock perspective, slab scale, grout rhythm and material direction before fixtures",
      ]),
      phase("bathroom-fixtures", "Shower, tub, sanitary ware and vanity", ["bathroom"], [
        "walk-in shower, bathtub, wall-hung sanitary ware, flush plate, vanity and mirror follow final surfaces",
      ]),
      phase("bathroom-details", "Metals, lighting and final details", ["bathroom"], [
        "metals, faucets, lighting and accessories are last and must match selected finishes",
      ]),
    ];
  }

  if (sceneClass === "room" || sceneClass === "mixed_interior_room" || sceneClass === "kitchen_room") {
    return [
      phase("room-shell", "Shell preservation", ["room"], [
        "preserve same room shell, openings, camera angle and functional anchors",
      ]),
      phase("room-floor", "Floor before skirting and furniture", ["floor"].filter((domain) => active.has(domain as RenovationDomainId)) as RenovationDomainId[], [
        "floor replacement before skirting adaptation and before furniture/material refresh",
      ]),
      phase("room-walls-ceiling", "Walls, wallpaper, cladding and ceiling", ["room"], [
        "selected wall/ceiling systems apply only to target planes with no spillover",
      ]),
      phase("room-furniture-lighting", "Furniture, lighting, curtains and decor", ["room"], [
        "furniture color-only preserves geometry and position; lighting uses exact selected fixture type",
      ]),
    ];
  }

  if (sceneClass === "facade" || sceneClass === "mixed_exterior_envelope") {
    return [
      phase("envelope-plane", "Facade envelope and plaster first", ["facade"].filter((domain) => active.has(domain as RenovationDomainId)) as RenovationDomainId[], [
        "facade insulation/plaster/cladding establishes final plane, reveal depth and transition lines",
      ]),
      phase("envelope-openings", "Openings adapt to envelope", ["windows", "generic_openings"].filter((domain) => active.has(domain as RenovationDomainId)) as RenovationDomainId[], [
        "windows/doors preserve opening geometry while adapting to final reveal depth",
      ]),
      phase("envelope-shutters", "Shutters and exterior shading", ["shutters"].filter((domain) => active.has(domain as RenovationDomainId)) as RenovationDomainId[], [
        "shutters align to final opening/window/reveal geometry and remove incompatible old hardware",
      ]),
      phase("envelope-roof", "Visible roof, gutters and edge details", ["roof"].filter((domain) => active.has(domain as RenovationDomainId)) as RenovationDomainId[], [
        "roof is applied only if visible; roof recolor preserves roof geometry and accessories unless targeted",
      ]),
    ];
  }

  if (sceneClass === "outdoor") {
    return [
      phase("outdoor-site", "Outdoor site and terrain lock", ["garden", "exterior_flooring"].filter((domain) => active.has(domain as RenovationDomainId)) as RenovationDomainId[], [
        "lock ground plane, paths, property context and no-occupy zones first",
      ]),
      phase("outdoor-pool", "Pool footprint first", ["pool"].filter((domain) => active.has(domain as RenovationDomainId)) as RenovationDomainId[], [
        "pool footprint, excavation and water-system logic are established before deck/coping",
      ]),
      phase("outdoor-deck", "Deck, coping and exterior paving second", ["exterior_flooring", "pool"].filter((domain) => active.has(domain as RenovationDomainId)) as RenovationDomainId[], [
        "deck/coping/exterior paving adapt to pool footprint and preserve non-target garden",
      ]),
      phase("outdoor-pergola", "Pergola after site logic", ["pergola"].filter((domain) => active.has(domain as RenovationDomainId)) as RenovationDomainId[], [
        "pergola posts, anchoring and clearances come after pool/deck/site constraints to avoid collisions",
      ]),
    ];
  }

  return [
    phase("single-domain", "Single-domain execution", orderedActive(sceneClass, specs), [
      "execute only visible and validated domains; reject invisible domains in single-photo mode",
    ]),
  ];
}

function crossDomainDependencies(specs: DomainSpecBuildResult[]): DomainDependency[] {
  const active = new Set(specs.map((spec) => spec.id));
  const deps: DomainDependency[] = [];

  if (active.has("facade") && (active.has("windows") || active.has("generic_openings"))) {
    deps.push({
      from: "facade",
      to: active.has("windows") ? "windows" : "generic_openings",
      kind: "must_run_before",
      reason: "facade insulation/plaster reveal-depth logic must be resolved before openings",
    });
  }

  if ((active.has("windows") || active.has("generic_openings")) && active.has("shutters")) {
    deps.push({
      from: active.has("windows") ? "windows" : "generic_openings",
      to: "shutters",
      kind: "must_run_before",
      reason: "shutters align to final window/reveal geometry",
    });
  }

  if (active.has("floor") && active.has("room")) {
    deps.push({
      from: "floor",
      to: "room",
      kind: "must_run_before",
      reason: "floor replacement before skirting adaptation, furniture shadows and decor",
    });
  }

  if (active.has("pool") && active.has("exterior_flooring")) {
    deps.push({
      from: "pool",
      to: "exterior_flooring",
      kind: "must_run_before",
      reason: "pool footprint first, deck/coping second",
    });
  }

  if ((active.has("pool") || active.has("exterior_flooring")) && active.has("pergola")) {
    deps.push({
      from: active.has("pool") ? "pool" : "exterior_flooring",
      to: "pergola",
      kind: "must_run_before",
      reason: "pergola after site logic so posts avoid pool, deck edges and circulation",
    });
  }

  return deps;
}

export function buildDependencyPlan(
  sceneClass: RenovationSceneClass,
  specs: DomainSpecBuildResult[],
  adapterDependencies: DomainDependency[] = [],
): DependencyResolutionPlan {
  const executionPriority = orderedActive(sceneClass, specs);
  const dependencies = [
    ...adapterDependencies,
    ...crossDomainDependencies(specs),
  ];

  return {
    sceneClass,
    executionPriority,
    phases: phasesFor(sceneClass, specs),
    dependencies,
  };
}
