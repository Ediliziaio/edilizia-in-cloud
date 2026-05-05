import { ZONE_LABELS } from "./promptFragments.ts";
import type {
  FacciataManifestLine,
  FacciataRenderConfig,
  FacciataReplacementManifest,
} from "./types.ts";

function pushLine(list: FacciataManifestLine[], line: FacciataManifestLine | null) {
  if (!line) return;
  const duplicate = list.find((item) => item.code === line.code);
  if (!duplicate) list.push(line);
}

function line(
  code: string,
  action: FacciataManifestLine["action"],
  summary: string,
  options: Partial<FacciataManifestLine> = {},
): FacciataManifestLine {
  return {
    code,
    action,
    summary,
    zoneId: options.zoneId,
    technicalNote: options.technicalNote,
    patchRule: options.patchRule,
    preserveRule: options.preserveRule,
  };
}

function buildTransitionRules(config: Pick<FacciataRenderConfig, "technical_specification">): string[] {
  const rules = new Set<string>();
  const plaster = config.technical_specification.plaster;
  const cladding = config.technical_specification.cladding;
  const baseCourse = config.technical_specification.elements.baseCourse;

  if (cladding.active && cladding.zone === "piano_terra") {
    rules.add("clean transition between ground-floor cladding and untouched upper facade with an architecturally crisp horizontal line");
  }
  if (plaster.active && plaster.zone === "piani_superiori") {
    rules.add("upper-floor plaster intervention must stop cleanly above the lower untouched or cladded zones");
  }
  if (baseCourse.action === "add") {
    rules.add("base course upper edge must be straight, level and free from fuzzy AI blending");
  }
  if (cladding.active && baseCourse.action === "add") {
    rules.add("junction between base course and cladding/plaster must be sharp, buildable and free from smudged transitions");
  }
  if (config.technical_specification.insulation.active) {
    rules.add("all insulation terminations around openings, eaves and lower plinth must be resolved with crisp architectural edges");
  }

  return Array.from(rules);
}

export function buildFacciataReplacementManifest(config: Pick<
  FacciataRenderConfig,
  "scene_analysis" | "zone_targeting" | "technical_specification" | "legacy_config"
>): FacciataReplacementManifest {
  const removals: FacciataManifestLine[] = [];
  const replacements: string[] = [];
  const repaintActions: string[] = [];

  const plaster = config.technical_specification.plaster;
  const cladding = config.technical_specification.cladding;
  const insulation = config.technical_specification.insulation;
  const elements = config.technical_specification.elements;

  if (plaster.active) {
    replacements.push(
      config.legacy_config.tipo_intervento === "tinteggiatura"
        ? `Repaint only ${ZONE_LABELS[plaster.zone ?? "tutta"]} in ${plaster.colorLabel ?? "the selected tone"} while keeping the existing facade relief and geometry unchanged.`
        : `Apply the selected plaster finish to ${ZONE_LABELS[plaster.zone ?? "tutta"]} with ${plaster.finishDescription}.`,
    );
  }

  if (cladding.active) {
    replacements.push(
      `Apply ${cladding.materialDescription} to ${ZONE_LABELS[cladding.zone ?? "tutta"]} with ${cladding.coursingPattern}.`,
    );
  }

  if (insulation.active) {
    replacements.push(
      `Apply ${insulation.systemDescription} on ${ZONE_LABELS[insulation.zone ?? "tutta"]}, advancing the facade plane by about ${insulation.thicknessCm}cm and updating reveals, sills and edges coherently.`,
    );
  }

  if (elements.windowCornices.action === "add") {
    replacements.push("Add new proportional window cornices without changing the size or geometry of the openings.");
  }
  if (elements.windowCornices.action === "remove") {
    pushLine(
      removals,
      line(
        "remove_window_cornices",
        "remove",
        "Remove all existing window cornices completely and restore the wall seamlessly around the openings.",
        {
          zoneId: "cornici_finestre",
          patchRule: "patch and re-finish the wall so no cornice shadow line or ghost edge remains",
          preserveRule: "keep windows, frames, glazing and opening proportions unchanged",
        },
      ),
    );
  }

  if (elements.stringCourses.action === "add") {
    replacements.push("Add string courses / marcapiani with controlled projection and perfectly aligned horizontal reading.");
  }
  if (elements.stringCourses.action === "remove") {
    pushLine(
      removals,
      line(
        "remove_string_courses",
        "remove",
        "Remove the existing string courses and restore a continuous facade plane.",
        {
          zoneId: "marcapiano",
          patchRule: "remove relief, shadows and reveal traces from the previous string course geometry",
        },
      ),
    );
  }

  if (elements.sills.action === "replace") {
    replacements.push("Replace existing sills with the selected material and profile, keeping windows and reveals otherwise unchanged.");
  }

  if (elements.baseCourse.action === "add") {
    replacements.push("Add the new base course / zoccolatura with a clean top edge and a believable lower facade material transition.");
  }
  if (elements.baseCourse.action === "remove") {
    pushLine(
      removals,
      line(
        "remove_base_course",
        "remove",
        "Remove the existing base course entirely and rebuild a clean, continuous lower wall surface.",
        {
          zoneId: "zoccolatura",
          patchRule: "erase the former top demarcation line and all relief or shadow traces from the previous base course",
        },
      ),
    );
  }

  if (elements.gutters.action === "replace") {
    replacements.push("Replace gutters and visible eaves accessories with the selected material and finish while preserving roof silhouette and alignment.");
  }

  if (elements.railings.action === "repaint") {
    repaintActions.push("Repaint balcony railings only; preserve the exact railing drawing, spacing, bars and balcony geometry.");
  }

  if (config.legacy_config.tipo_intervento === "tinteggiatura" && !cladding.active && !insulation.active) {
    pushLine(
      removals,
      line(
        "paint_only_geometry_lock",
        "preserve",
        "Color-only intervention: do not create new facade thickness, new reliefs, new cladding or new architectural additions.",
        {
          preserveRule: "keep existing plaster geometry, reveals, cornices, string courses and facade depth unchanged unless explicitly requested",
        },
      ),
    );
  }

  if (cladding.active && cladding.zone === "piano_terra") {
    pushLine(
      removals,
      line(
        "upper_floors_untouched_for_ground_floor_cladding",
        "preserve",
        "If cladding is applied only to the ground floor, upper floors must remain untouched and visually unchanged.",
        {
          zoneId: "piani_superiori",
        },
      ),
    );
  }

  if (insulation.active) {
    pushLine(
      removals,
      line(
        "insulation_reveal_depth_rules",
        "apply",
        "When thermal insulation is active, adapt reveal depth, sill relationship, drip edges and edge profiles coherently without distorting building proportions.",
        {
          technicalNote: [
            insulation.newFacadePlaneRule,
            insulation.revealDepthRule,
            insulation.sillAdaptationRule,
            insulation.edgeProfileRule,
            insulation.flashingRule,
          ].filter(Boolean).join(" "),
        },
      ),
    );
  }

  const keepExactly = Array.from(new Set([
    ...config.scene_analysis.preservedContext,
    ...config.scene_analysis.preserveRigidly,
    "building proportions",
    "openings",
    "window frames",
    "glazing",
    "roof silhouette",
  ]));

  const transitionRules = buildTransitionRules(config);

  const integrityConstraints = Array.from(new Set([
    "Keep the same building, same facade, same camera angle, same perspective and same image dimensions.",
    "Preserve sky, road, pavement, vegetation, neighboring buildings, vehicles and people exactly.",
    "Do not alter openings, windows or shutters unless explicitly in scope.",
    "Any removed architectural detail must be patched seamlessly with no ghost lines or hybrid states.",
    ...transitionRules.map((rule) => `Transition rule: ${rule}.`),
    ...keepExactly.map((item) => `Preserve exactly: ${item}.`),
  ]));

  return {
    interventionSummary: config.legacy_config.tipo_intervento,
    activeSystems: config.zone_targeting.activeSystems,
    inactiveSystems: config.zone_targeting.inactiveSystems,
    targetedZones: config.zone_targeting.affectedZones.map((item) => item.label),
    untouchedZones: config.zone_targeting.untouchedZones.map((item) => item.label),
    replacements,
    removals,
    repaintActions,
    keepExactly,
    transitionRules,
    integrityConstraints,
  };
}
