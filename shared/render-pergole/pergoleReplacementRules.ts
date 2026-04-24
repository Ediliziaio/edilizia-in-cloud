import {
  COVER_DESCRIPTIONS,
  COVER_STATE_RULES,
  DEFAULT_INTEGRITY_CONSTRAINTS,
  DEFAULT_QUALITY_DIRECTIVES,
  LIGHTING_DESCRIPTIONS,
  MATERIAL_DESCRIPTIONS,
  PERGOLA_TYPE_DESCRIPTIONS,
  SIDE_CLOSURE_DESCRIPTIONS,
} from "./promptFragments.ts";
import type {
  ConfigurazionePergole,
  PergolaInstallabilityEnvelope,
  PergolaReplacementManifest,
  PergolaSceneAnalysis,
  PergolaTargetAreaMap,
  PergolaTechnicalSpecification,
} from "./types.ts";

function uniq(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}

export function isPergolaWallMounted(config: ConfigurazionePergole): boolean {
  return config.installazione.addossata_si_no || config.struttura.tipo.includes("addossata");
}

function allowsFullPergolaComposition(config: ConfigurazionePergole): boolean {
  return config.operazione === "add_new_pergola" ||
    config.operazione === "replace_existing_awning_with_pergola" ||
    config.operazione === "replace_existing_pergola";
}

export function buildPergolaTechnicalSpecification(config: ConfigurazionePergole): PergolaTechnicalSpecification {
  const wallMounted = isPergolaWallMounted(config);
  const coverState = COVER_STATE_RULES[config.copertura.stato];
  const coverDescription = COVER_DESCRIPTIONS[config.copertura.tipo];
  const materialDescription = MATERIAL_DESCRIPTIONS[config.struttura.materiale];
  const sideClosureDescription = SIDE_CLOSURE_DESCRIPTIONS[config.chiusure_laterali.tipo];
  const finish = config.struttura.finitura ? `, ${config.struttura.finitura.replace(/_/g, " ")} finish` : "";

  return {
    typology: config.struttura.tipo,
    wallMounted,
    material: config.struttura.materiale,
    materialDescription,
    colorDescription: `${config.struttura.colore_nome} (${config.struttura.colore_hex})${finish}`,
    structureLanguage: `${PERGOLA_TYPE_DESCRIPTIONS[config.struttura.tipo]}; style language ${config.struttura.stile ?? "premium_contemporaneo"}`,
    coverType: config.copertura.tipo,
    coverDescription,
    coverStateRule: coverState,
    sideClosureType: config.chiusure_laterali.tipo,
    sideClosureDescription: config.chiusure_laterali.tipo === "nessuna"
      ? sideClosureDescription
      : `${sideClosureDescription}; state ${config.chiusure_laterali.stato.replace(/_/g, " ")}; finish ${config.chiusure_laterali.colore_nome ?? "coherent with structure"} ${config.chiusure_laterali.colore_hex ?? ""}`.trim(),
    lightingDescription: LIGHTING_DESCRIPTIONS[config.illuminazione],
  };
}

export function buildPergolaReplacementManifest(
  config: ConfigurazionePergole,
  scene: PergolaSceneAnalysis,
  target: PergolaTargetAreaMap,
  envelope: PergolaInstallabilityEnvelope,
  technical: PergolaTechnicalSpecification,
): PergolaReplacementManifest {
  const additions: string[] = [];
  const replacements: string[] = [];
  const recolors: string[] = [];
  const removals: string[] = [];
  const conversions: string[] = [
    "All new pergola elements must respect the target installation map and installability envelope.",
    envelope.drainageLogic,
  ];

  const structureSummary = `${technical.structureLanguage}; material ${technical.materialDescription}; color ${technical.colorDescription}; cover ${technical.coverDescription}; state ${technical.coverStateRule}`;

  switch (config.operazione) {
    case "add_new_pergola":
      additions.push(`Install a new ${config.struttura.tipo.replace(/_/g, " ")} in ${target.targetDescription}: ${structureSummary}.`);
      conversions.push("Do not remove existing architectural elements; adapt only contact shadows and realistic installation junctions.");
      break;
    case "replace_existing_awning_with_pergola":
      removals.push("Remove existing awning / tenda da sole / cassette / articulated arms / brackets / fabric tracks completely if visible.");
      removals.push("Patch the facade and contact points cleanly where old awning brackets or cassettes were removed.");
      replacements.push(`Replace the old shading system with the selected pergola: ${structureSummary}.`);
      conversions.push("No hybrid state: no old awning arms, old fabric, old cassette or old support brackets may remain attached to the new pergola.");
      break;
    case "replace_existing_pergola":
      removals.push("Remove the existing pergola/canopy/tettoia completely, including incompatible posts, beams, roof panels, brackets and floor anchors.");
      removals.push("Restore wall and ground contact areas cleanly before installing the new pergola.");
      replacements.push(`Install only the newly selected pergola system: ${structureSummary}.`);
      conversions.push("Old and new pergola structures must not be mixed on the same target area.");
      break;
    case "recolor_only":
      recolors.push(`Change only the surface finish/color of the existing pergola structure to ${technical.colorDescription}.`);
      conversions.push("Recolor-only: preserve exact footprint, post positions, beam geometry, cover type, side closures and all structural proportions.");
      conversions.push("Strict scope: do not add lighting, side closures, furniture, new cover geometry, new posts or new wall attachment details.");
      break;
    case "change_cover_only":
      replacements.push(`Keep the existing pergola structure and replace only the roof/cover system with ${technical.coverDescription}; state ${technical.coverStateRule}.`);
      conversions.push("Cover-only change: no movement of posts or beams, no new footprint, only cover, edge trims and drainage details may adapt.");
      conversions.push("Strict scope: preserve side closures, furniture, post anchors, wall attachment line and structural color unless explicitly selected in another operation.");
      break;
    case "add_side_closures":
      additions.push(`Add only side closures: ${technical.sideClosureDescription}.`);
      conversions.push("Side-closure addition must not change pergola structure, roof cover or footprint except required tracks/guides on posts/beams.");
      break;
    case "remove_side_closures":
      removals.push("Remove side closures, screens, curtains, panels and their visible tracks/guides where incompatible with an open pergola perimeter.");
      conversions.push("After removing side closures, restore an open perimeter with clean post/beam edges and no dangling rails or fabric.");
      break;
    case "change_open_state":
      replacements.push(`Change only the cover/opening state: ${technical.coverStateRule}.`);
      conversions.push("Open-state change: preserve structure, footprint, material, side closures and mounting; only louver angle / fabric extension / screen state changes.");
      conversions.push("Strict scope: do not add side closures, lighting, furniture, posts, beams or new cover material.");
      break;
  }

  if ((allowsFullPergolaComposition(config) || config.operazione === "add_side_closures") && config.chiusure_laterali.tipo !== "nessuna") {
    additions.push(`Include side closure system only where selected: ${technical.sideClosureDescription}; avoid generic decorative curtains.`);
  }

  if (allowsFullPergolaComposition(config) && config.illuminazione !== "nessuna") {
    additions.push(`Add integrated lighting: ${technical.lightingDescription}; keep it sparse, buildable and consistent with the pergola profiles.`);
  }

  if (allowsFullPergolaComposition(config) && config.arredo.gestisci_arredo === "aggiungi_minimo") {
    additions.push(`Add only sparse coherent outdoor furniture for ${config.arredo.uso_area.replace(/_/g, " ")} use below the pergola, keeping existing spatial logic and avoiding showroom staging.`);
  } else if (allowsFullPergolaComposition(config) && config.arredo.gestisci_arredo === "rimuovi_superfluo") {
    removals.push("Declutter only small non-essential outdoor objects; do not remove primary functional furniture unless explicitly listed.");
  } else {
    conversions.push("Preserve existing outdoor furniture in place; adapt only pergola shadows and light interaction over it unless the operation explicitly targets furniture.");
  }

  for (const item of config.elementi_da_rimuovere ?? []) {
    removals.push(`Remove user-listed incompatible element: ${item}.`);
  }

  const preserveExactly = uniq([
    ...DEFAULT_INTEGRITY_CONSTRAINTS,
    ...scene.untouchableElements,
    ...scene.contextToPreserve,
    ...(config.elementi_da_preservare ?? []),
  ]);

  return {
    operation: config.operazione,
    additions: uniq(additions),
    replacements: uniq(replacements),
    recolors: uniq(recolors),
    removals: uniq(removals),
    conversions: uniq(conversions),
    preserveExactly,
  };
}

export function buildPergolaQualityDirectives(config: ConfigurazionePergole): string[] {
  const coverSpecific = config.copertura.tipo === "lamelle_orientabili"
    ? "bioclimatic louvers must be visibly repeated, aligned and in the selected angle/state"
    : config.copertura.tipo === "telo_retraibile"
      ? "fabric cover must read as technical textile, with tension/collection logic and not as glass or metal"
      : config.copertura.tipo === "vetro"
        ? "glass cover must show believable transparency, reflections, seals and structural rafters"
        : "cover system must be visually exact and not drift into a generic canopy";

  return uniq([
    ...DEFAULT_QUALITY_DIRECTIVES,
    coverSpecific,
    "installation must look buildable: posts grounded, beams proportional, wall attachments and contact shadows credible",
  ]);
}
