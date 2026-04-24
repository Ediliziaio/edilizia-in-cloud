// Prompt engine v2 - surgical roof renovation render

import type {
  AnalisiTetto,
  ConfigurazioneTetto,
  FinituraMantoTetto,
  MaterialeGrondaia,
  RoofPromptValidationResult,
  RoofReplacementManifest,
  RoofSceneAnalysis,
  RoofTargetSlopesMap,
  TargetFaldeTetto,
  TettoPromptBuildResult,
  TipoInterventoTetto,
  TipoLucernario,
  TipoManto,
} from "./types";

const ROOF_COVERING_DESCRIPTIONS: Record<TipoManto, string> = {
  tegole_coppi:
    "traditional curved terracotta coppi/barrel tiles with alternating concave and convex courses, warm natural variation, realistic overlap shadows and authentic Italian roof texture",
  tegole_marsigliesi:
    "Marseille interlocking clay tiles with a raised central rib, regular 420x240 mm rhythm, interlocking head and side laps, matte ceramic surface",
  tegole_portoghesi:
    "Portuguese S-profile clay tiles with alternating convex and concave channels, strong Mediterranean shadow rhythm and realistic interlocking rows",
  tegole_piane:
    "flat interlocking clay or concrete roof tiles with low profile, clean planar surface, tight joint grid and modern controlled geometry",
  ardesia_naturale:
    "natural slate roofing with dark blue-grey stone slabs, fine laminar cleft texture, visible side-lap shadows and slight thickness variation",
  ardesia_sintetica:
    "synthetic slate fiber-cement/composite roof tiles with regular thin modules, matte dark grey embossed slate texture and precise coursing",
  lamiera_grecata:
    "trapezoidal corrugated metal sheet roofing with continuous panels running eave-to-ridge, 35-55 mm ribs, side laps and realistic screw fixings with EPDM washers",
  lamiera_aggraffata:
    "standing seam metal roofing with flat panels 400-530 mm wide, raised vertical seams, no exposed fasteners and crisp modern metal shadow lines",
  lamiera_zinco_titanio:
    "zinc-titanium standing seam or flat-lock roofing with blue-grey patina, subtle rolled grain, premium metal surface and precise folded joints",
  guaina_bituminosa:
    "bituminous membrane flat/low-slope roofing with mineral granule surface, torch-applied lap seams, metal drip edges and realistic waterproofing texture",
  guaina_tpo:
    "TPO single-ply membrane roofing with white/light-grey smooth thermoplastic surface, heat-welded lap seams and reflective modern waterproofing look",
  tegole_fotovoltaiche:
    "building-integrated solar roof tiles replacing conventional tiles, flush dark glass modules with subtle photovoltaic cell grid and hidden wiring",
};

const GUTTER_DESCRIPTIONS: Record<MaterialeGrondaia, string> = {
  alluminio:
    "pre-painted aluminum gutter and downpipe system with clean edges, powder-coated finish, realistic brackets, joints, end caps and elbows",
  rame:
    "natural copper gutter and downpipe system with warm metallic tone, soldered joints, matching brackets and credible patina/reflection behavior",
  acciaio_zincato:
    "galvanized steel gutter and downpipe system with bright silver zinc finish, sturdy brackets and industrial but realistic residential detailing",
  pvc:
    "PVC gutter and downpipe system with matte plastic finish, clipped joints, rubber seals and matching round downpipes",
  zinco_titanio:
    "zinc-titanium gutter and downpipe system with blue-grey patina, precise soldered joints and premium understated metal finish",
};

const SKYLIGHT_DESCRIPTIONS: Record<TipoLucernario, string> = {
  piatto:
    "flat Velux-style roof window, flush with the slope, low-profile frame, realistic glass reflection and integrated flashing kit",
  sporgente:
    "protruding skylight/dome with a raised curb frame, realistic waterproof flashing and plausible projection above the roof plane",
  abbaino:
    "dormer window projecting from the roof with small side cheeks, its own mini-roof, front vertical window and correctly tied-in flashing",
};

const FINISH_DESCRIPTIONS: Record<FinituraMantoTetto, string> = {
  opaco: "matte finish with no unrealistic specular glare",
  semi_lucido: "semi-gloss finish with controlled soft highlights",
  lucido: "glossier finish with visible but physically plausible sky reflections",
};

const INTERVENTION_DESCRIPTIONS: Record<TipoInterventoTetto, string> = {
  sostituzione_manto:
    "replace the roof covering system while preserving the same roof geometry and all non-target accessories",
  solo_colore:
    "recolor/refinish the existing roof covering only, preserving module geometry, ridges, gutters, skylights and accessories",
  lattonerie_accessori:
    "work only on selected roof accessories such as gutters, skylights, downpipes or photovoltaic elements; preserve roof covering unless a specific accessory requires local integration",
  sovracopertura_coibentata:
    "add a realistic insulated over-roof/secondary package while preserving building proportions and adapting eaves, flashings and gutters",
  rifacimento_completo:
    "complete roof renovation: covering, accessory integration, flashings and edge details are coordinated as one buildable system",
};

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function uniq(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}

function bullets(lines: Array<string | null | undefined>): string {
  return lines
    .filter((line): line is string => Boolean(line && line.trim()))
    .map((line) => `- ${line}`)
    .join("\n");
}

function normalizeRoofSceneAnalysis(analysis?: Partial<AnalisiTetto>): RoofSceneAnalysis {
  const visibleSlopes = analysis?.falde_visibili?.length
    ? analysis.falde_visibili
    : ["main visible slope", "secondary visible slope if present"];

  return {
    buildingType: analysis?.tipo_edificio || "residential building",
    buildingStyle: analysis?.stile_edificio || "infer the architectural style from the uploaded photo",
    roofType: analysis?.tipo_tetto || "pitched roof",
    visibleSlopes,
    slopeCount: analysis?.numero_falde || visibleSlopes.length || 2,
    apparentPitch: analysis?.inclinazione_apparente || `${analysis?.pendenza_stimata ?? 30} degree apparent pitch`,
    currentCovering: analysis?.manto_attuale || "existing roof covering visible in the photo",
    currentColor: analysis?.colore_manto_nome || analysis?.colore_manto_hex || "current photographed roof color",
    conservationState: analysis?.stato_conservazione || "as photographed",
    skylights: analysis?.presenza_lucernari
      ? `${analysis.numero_lucernari || 1} existing skylight/dormer opening(s)`
      : "no clearly visible skylights",
    dormers: analysis?.presenza_abbaini ? "existing dormers visible" : "no clearly visible dormers unless seen in photo",
    chimneys: analysis?.presenza_comignoli ? "existing chimneys present" : "no clearly visible chimneys",
    photovoltaic: analysis?.presenza_fotovoltaico ? "existing photovoltaic/solar elements visible" : "no existing photovoltaic panels visible",
    antennasLifeLines: analysis?.presenza_antenne_linee_vita ? "antennas / life lines / roof devices visible" : "no clearly visible antennas or life lines",
    guttersDownpipes: analysis?.gronde_pluviali || "existing gutters and downpipes as photographed",
    eavesEdges: analysis?.bordi_sporti || "existing eaves, fascia boards and roof overhangs as photographed",
    ridgeValleysFlashings: analysis?.colmo_displuvi_converse || "existing ridge, hips, valleys and flashings follow the photographed roof geometry",
    photoPerspective: analysis?.prospettiva_foto || "preserve the photographed camera angle, lens feel, perspective and crop",
    lightAndShadows: analysis?.luce_ombre || "preserve original light direction, roof shadows and contact shadows",
    untouchableElements: analysis?.elementi_intoccabili || [
      "facade",
      "windows",
      "doors",
      "chimneys unless explicitly modified",
      "non-target roof accessories",
    ],
    contextToPreserve: analysis?.contesto_da_preservare || [
      "sky",
      "vegetation",
      "street / ground context",
      "neighboring buildings",
      "people and vehicles if present",
    ],
  };
}

function buildTargetSlopesMap(config: ConfigurazioneTetto, scene: RoofSceneAnalysis): RoofTargetSlopesMap {
  const scope = config.target?.scope || "tutto_tetto";
  const description = config.target?.descrizione_zona?.trim();
  const all = scene.visibleSlopes;
  const byScope: Record<TargetFaldeTetto, string> = {
    tutto_tetto: "all visible roof planes / the complete roof visible in the photo",
    falda_principale: "main visible roof slope only",
    falda_frontale: "front-facing roof slope only",
    falda_laterale: "side roof slope only",
    zona_specifica: description || "specific user-described roof zone",
  };
  const targetSlopes = scope === "tutto_tetto"
    ? all
    : [byScope[scope]];
  const untouchedSlopes = scope === "tutto_tetto"
    ? []
    : ["all non-target visible roof planes"];

  return {
    scope,
    targetDescription: byScope[scope],
    targetSlopes,
    untouchedSlopes,
    photovoltaicZone: config.pannelli_solari?.attivo
      ? (config.pannelli_solari.posizione || "falda_principale").replace(/_/g, " ")
      : "no photovoltaic target zone",
    accessoryZone: "gutters, downpipes, skylights, dormers, ridges, hips, valleys and flashings only where explicitly active",
  };
}

function isMetalOrMembrane(type: TipoManto): boolean {
  return type.startsWith("lamiera") || type.startsWith("guaina");
}

function currentLooksTraditional(scene: RoofSceneAnalysis): boolean {
  return /coppi|tegole|tile|terracotta|clay/i.test(scene.currentCovering);
}

function coveringIsActive(config: ConfigurazioneTetto): boolean {
  const intervention = config.tipo_intervento || "sostituzione_manto";
  return intervention === "sostituzione_manto" ||
    intervention === "sovracopertura_coibentata" ||
    intervention === "rifacimento_completo";
}

function buildInsulationRule(config: ConfigurazioneTetto): string | null {
  if (!config.isolamento?.attivo && config.tipo_intervento !== "sovracopertura_coibentata") return null;
  const type = (config.isolamento?.tipo || "sarking_legno").replace(/_/g, " ");
  const thickness = config.isolamento?.spessore_cm ?? 10;
  return `Add a realistic insulated over-roof package (${type}, about ${thickness} cm): increase roof build-up thickness only at roof edges, deepen eaves/edge line plausibly, adapt fascia, drip edges, flashings and gutter relationship without deforming the building.`;
}

function buildPhotovoltaicRule(config: ConfigurazioneTetto): string | null {
  const pv = config.pannelli_solari;
  if (!pv?.attivo) return null;
  const typeMap: Record<string, string> = {
    fotovoltaico_nero: "black monocrystalline photovoltaic panels with dark anti-reflective glass, slim aluminum frames and subtle cell grid",
    fotovoltaico_blu: "blue polycrystalline photovoltaic panels with blue shimmer, silver bus bars and aluminum frames",
    tegola_solare_integrata: "building-integrated photovoltaic solar tiles, flush with the roof plane and replacing the local covering modules",
  };
  const qtyMap: Record<string, string> = {
    pochi: "small cluster of about 4-6 modules",
    medi: "medium array of about 8-14 modules",
    tanti: "large array of about 16-24 modules",
  };
  const pos = (pv.posizione || "falda_principale").replace(/_/g, " ");
  const mounting = pv.tipo === "tegola_solare_integrata"
    ? "must be flush integrated into the covering, without raised rails"
    : "must be mounted on realistic rails/standoffs aligned to the roof slope";
  return `Add photovoltaic on ${pos}: ${typeMap[pv.tipo || "fotovoltaico_nero"]}; ${qtyMap[pv.quantita || "medi"]}; ${mounting}; modules must align perfectly with the roof plane, rows, perspective and shadows.`;
}

function buildReplacementManifest(
  config: ConfigurazioneTetto,
  scene: RoofSceneAnalysis,
  target: RoofTargetSlopesMap,
): RoofReplacementManifest {
  const interventionType = config.tipo_intervento || "sostituzione_manto";
  const replacements: string[] = [];
  const recolors: string[] = [];
  const additions: string[] = [];
  const removals: string[] = [];
  const conversionRules: string[] = [];
  const mantoDesc = ROOF_COVERING_DESCRIPTIONS[config.manto.tipo];
  const mantoColor = config.manto.colore_nome || config.manto.colore_hex;

  if (coveringIsActive(config)) {
    replacements.push(`Replace roof covering on ${target.targetDescription} with ${mantoDesc}, color ${mantoColor}, ${FINISH_DESCRIPTIONS[config.manto.finitura]}.`);
    conversionRules.push("Preserve the exact roof pitch, ridges, hips, valleys, eaves, openings and camera perspective while changing only the covering system on target slopes.");
    if (currentLooksTraditional(scene) && isMetalOrMembrane(config.manto.tipo)) {
      conversionRules.push("Convert traditional tile/coppi roof to the selected metal/membrane system: remove all visible coppi/tiles, tile overlaps, tile rows and old ridge tile logic; introduce coherent panels/seams/laps, metal cappings, drip edges, flashings and edge trims with no hybrid tile remnants.");
    } else {
      conversionRules.push("Remove incompatible details from the previous roof system and replace them with coherent ridge caps, flashing, valley and eave details for the selected new covering.");
    }
  } else if (interventionType === "solo_colore") {
    recolors.push(`Recolor/refinish the existing roof covering on ${target.targetDescription} to ${mantoColor}, ${FINISH_DESCRIPTIONS[config.manto.finitura]}, without changing tile/panel geometry or roof accessories.`);
    conversionRules.push("Color-only means preserve current modules, tile rows, panel seams, ridge geometry, gutters, skylights, chimneys and all construction details; only surface color/finish changes.");
  } else {
    replacements.push("Keep existing roof covering unchanged unless local accessory integration requires small physically necessary flashing adjustments.");
  }

  const insulation = buildInsulationRule(config);
  if (insulation) additions.push(insulation);

  if (config.grondaie.attivo) {
    replacements.push(`Replace gutters and downpipes only with ${GUTTER_DESCRIPTIONS[config.grondaie.materiale]}, gutter color ${config.grondaie.colore_hex}${config.grondaie.colore_pluviale_hex ? `, downpipe color ${config.grondaie.colore_pluviale_hex}` : ""}.`);
    conversionRules.push("Gutter replacement must not change roof covering, facade, eave geometry or downpipe path except for material/color/detail of gutters, brackets, elbows and joints.");
  }

  if (config.lucernari.attivo) {
    if (config.lucernari.azione === "rimuovi") {
      removals.push("Remove existing skylights/dormers completely and rebuild continuous roof covering at their former positions, with no ghost outline, frame, curb, flashing or color scar.");
    } else if (config.lucernari.azione === "aggiungi") {
      const type = config.lucernari.tipo || "piatto";
      additions.push(`Add ${config.lucernari.quantita || 1} ${SKYLIGHT_DESCRIPTIONS[type]} at ${(config.lucernari.posizione || "centrale").replace(/_/g, " ")} on the target slope, with frame color ${config.lucernari.colore_telaio_hex || "#3c3c3c"}.`);
      conversionRules.push("Skylights must be integrated into the roof plane with correct opening cut, waterproof flashing kit, material returns, shadows and scale.");
    } else {
      conversionRules.push("Keep existing skylights/dormers in place and adapt only their flashing if the surrounding covering changes.");
    }
  }

  const photovoltaic = buildPhotovoltaicRule(config);
  if (photovoltaic) additions.push(photovoltaic);

  return {
    interventionType,
    replacements: uniq(replacements),
    recolors: uniq(recolors),
    additions: uniq(additions),
    removals: uniq(removals),
    conversionRules: uniq(conversionRules),
    preserveExactly: uniq([
      ...scene.untouchableElements,
      ...scene.contextToPreserve,
      "facade walls and facade finish",
      "windows and doors",
      "building proportions",
      "roof planes outside the target scope",
      "sky, vegetation and neighboring buildings",
      "image dimensions, crop and orientation",
    ]),
  };
}

function validateRoofPromptConfig(
  config: ConfigurazioneTetto,
  scene: RoofSceneAnalysis,
  target: RoofTargetSlopesMap,
  manifest: RoofReplacementManifest,
): RoofPromptValidationResult {
  const missingSections: string[] = [];
  const missingBusinessRules: string[] = [];
  const manifestText = JSON.stringify(manifest).toLowerCase();

  if (!scene.roofType) missingSections.push("scene_analysis.roofType");
  if (target.targetSlopes.length === 0) missingSections.push("target_slopes_map.targetSlopes");
  if (manifest.replacements.length + manifest.recolors.length + manifest.additions.length + manifest.removals.length === 0) {
    missingSections.push("replacement_manifest");
  }

  if (config.tipo_intervento === "solo_colore" && !manifestText.includes("only surface color")) {
    missingBusinessRules.push("recolor-only must not change roof geometry or covering modules");
  }
  if (currentLooksTraditional(scene) && isMetalOrMembrane(config.manto.tipo) && coveringIsActive(config) && !manifestText.includes("remove all visible coppi/tiles")) {
    missingBusinessRules.push("tile/coppi to metal/membrane conversion must remove old tile system");
  }
  if (config.lucernari.attivo && config.lucernari.azione === "aggiungi" && !manifestText.includes("waterproof flashing")) {
    missingBusinessRules.push("new skylight must include waterproof flashing integration");
  }
  if (config.lucernari.attivo && config.lucernari.azione === "rimuovi" && !manifestText.includes("no ghost outline")) {
    missingBusinessRules.push("removed skylight must restore continuous covering with no ghost trace");
  }
  if (config.grondaie.attivo && !manifestText.includes("gutter replacement must not change roof covering")) {
    missingBusinessRules.push("gutter-only replacement must protect roof/facade geometry");
  }
  if (config.pannelli_solari?.attivo && !manifestText.includes("align perfectly")) {
    missingBusinessRules.push("photovoltaic panels must align to the selected roof slope");
  }
  if (config.isolamento?.attivo && !manifestText.includes("increase roof build-up thickness")) {
    missingBusinessRules.push("insulation must include realistic thickness/eave adaptation");
  }

  return {
    isValid: missingSections.length === 0 && missingBusinessRules.length === 0,
    missingSections,
    missingBusinessRules,
  };
}

export function buildTettoPrompt(
  config: ConfigurazioneTetto,
  analisi?: Partial<AnalisiTetto>,
): TettoPromptBuildResult {
  const scene = normalizeRoofSceneAnalysis(analisi);
  const target = buildTargetSlopesMap(config, scene);
  const manifest = buildReplacementManifest(config, scene, target);
  const validation = validateRoofPromptConfig(config, scene, target, manifest);
  const mantoDesc = ROOF_COVERING_DESCRIPTIONS[config.manto.tipo];
  const mantoColor = config.manto.colore_nome || config.manto.colore_hex;
  const blocks: Record<string, string> = {};

  blocks.A = `[BLOCK A - MISSION]
You are a SURGICAL PHOTOREALISTIC ROOF RENOVATION IMAGE EDITOR.
Apply exactly the selected roof intervention while preserving the same photographed building.
Mandatory: same building, same roof geometry, same camera angle, same facade, same context, same lighting direction, same image dimensions, no artistic reinterpretation and no different-building generation.`;

  blocks.B = `[BLOCK B - EXISTING ROOF INVENTORY]
Building: ${scene.buildingType}
Style: ${scene.buildingStyle}
Roof type: ${scene.roofType}
Visible slopes: ${scene.visibleSlopes.join(", ")}
Slope count: ${scene.slopeCount}
Apparent pitch: ${scene.apparentPitch}
Current covering: ${scene.currentCovering}
Current color: ${scene.currentColor}
Condition: ${scene.conservationState}
Skylights: ${scene.skylights}
Dormers: ${scene.dormers}
Chimneys: ${scene.chimneys}
Photovoltaic: ${scene.photovoltaic}
Antennas / life lines: ${scene.antennasLifeLines}
Gutters / downpipes: ${scene.guttersDownpipes}
Eaves / edges: ${scene.eavesEdges}
Ridge / hips / valleys / flashings: ${scene.ridgeValleysFlashings}
Perspective: ${scene.photoPerspective}
Light and shadows: ${scene.lightAndShadows}`;

  blocks.C = `[BLOCK C - TARGET SLOPES MAP]
Scope: ${target.scope}
Target: ${target.targetDescription}
Target slopes: ${target.targetSlopes.join(", ")}
Untouched slopes: ${target.untouchedSlopes.length ? target.untouchedSlopes.join(", ") : "none; entire visible roof is in scope"}
Photovoltaic zone: ${target.photovoltaicZone}
Accessory zone: ${target.accessoryZone}`;

  blocks.D = `[BLOCK D - REPLACEMENT MANIFEST]
Intervention: ${INTERVENTION_DESCRIPTIONS[manifest.interventionType]}
Replacements:
${bullets(manifest.replacements.length ? manifest.replacements : ["no covering replacement unless explicitly listed"])}
Recolors:
${bullets(manifest.recolors.length ? manifest.recolors : ["no recolor-only operation unless explicitly listed"])}
Additions:
${bullets(manifest.additions.length ? manifest.additions : ["no roof additions unless explicitly listed"])}
Removals:
${bullets(manifest.removals.length ? manifest.removals : ["remove only construction details made incompatible by selected interventions"])}
Preserve exactly:
${bullets(manifest.preserveExactly)}`;

  blocks.E = `[BLOCK E - NEW ROOF SPECIFICATION]
Covering active: ${coveringIsActive(config) ? "yes" : config.tipo_intervento === "solo_colore" ? "recolor only" : "no"}
Covering type: ${config.manto.tipo}
Material / construction: ${mantoDesc}
Color / finish: ${mantoColor} (${config.manto.colore_hex}), ${FINISH_DESCRIPTIONS[config.manto.finitura]}
Ridge logic: ridges and hips must use coherent ridge caps, metal cappings or membrane cappings for the selected system.
Edge logic: eaves, fascia, drip edges and roof borders must stay aligned to the original geometry.
Flashing logic: chimney, skylight, valley and wall flashings must be plausible for the selected covering.
Profile/module geometry: preserve scale and perspective; tiles, seams, ribs, panels or membrane laps must follow the real roof plane.`;

  blocks.F = `[BLOCK F - ACCESSORY RULES]
Gutters/downpipes: ${config.grondaie.attivo ? GUTTER_DESCRIPTIONS[config.grondaie.materiale] : "keep existing gutters and downpipes unchanged"}
Skylights/dormers: ${config.lucernari.attivo ? config.lucernari.azione : "unchanged"}
Photovoltaic: ${config.pannelli_solari?.attivo ? "active; see replacement manifest" : "do not add photovoltaic panels"}
Insulation / over-roof: ${config.isolamento?.attivo || config.tipo_intervento === "sovracopertura_coibentata" ? "active; adapt thickness, eaves, flashings and gutters realistically" : "not active"}
Chimneys / antennas / life lines: preserve unless explicitly listed, but update only necessary local flashings around them when covering changes.`;

  blocks.G = `[BLOCK G - REMOVAL / CONVERSION RULES]
${bullets(manifest.conversionRules)}
${manifest.removals.length ? bullets(manifest.removals) : "- Do not leave hybrid old/new roof states, ghost outlines, incompatible old rows, wrong flashings or random patches."}`;

  blocks.H = `[BLOCK H - BUILDING INTEGRITY]
${bullets([
    "preserve facade, wall color, windows, doors, balconies and architectural proportions",
    "preserve roof shape, pitch, ridge line, hip/valley geometry and eave overhang unless insulation requires only realistic edge thickness",
    "preserve sky, vegetation, street, neighboring buildings, vehicles and people",
    "preserve exact camera perspective, crop, image dimensions and orientation",
    "do not alter non-target roof planes or non-target roof accessories",
  ])}`;

  blocks.I = `[BLOCK I - PHOTOREALISM RULES]
${bullets([
    "material response must be physically plausible: clay, slate, metal, membrane, glass and photovoltaic surfaces must look different",
    "shadows, contact shadows, roof-plane perspective and overlap depths must match the original lighting",
    "all added elements must look installed and buildable, with correct mounting, flashing, trim, edge and waterproofing details",
    "no floating panels, no warped seams, no random tile scales, no fake CGI showroom look",
  ])}`;

  blocks.J = `[BLOCK J - NEGATIVE CONSTRAINTS]
${bullets([
    "do not redesign the building",
    "do not change facade color, windows, doors or wall geometry",
    "do not change non-target roof planes",
    "do not invent balconies, dormers, skylights, chimneys, photovoltaic panels or antennas unless selected",
    "do not leave traces of removed skylights or old covering systems",
    "do not mix tile rows with metal/membrane systems on the same target slope unless explicitly selected",
    "do not change sky, vegetation, neighboring buildings, street or context",
    "do not stylize, illustrate, over-beautify or create a different house",
  ])}`;

  blocks.K = `[BLOCK K - QUALITY BAR]
${bullets([
    "professional architectural roof renovation visualization",
    "same-building realism suitable for sales/preventivi",
    "precise interpretation of selected roof system, target slopes and accessories",
    validation.isValid
      ? "Prompt validation passed: scene analysis, target slopes map, replacement manifest, conversion/removal rules and integrity constraints are explicit."
      : `Prompt validation warnings: missing sections = ${validation.missingSections.join(", ") || "none"}; missing rules = ${validation.missingBusinessRules.join(", ") || "none"}.`,
  ])}`;

  const notes = config.note_libere?.trim()
    ? `[ADDITIONAL USER NOTES]\n${config.note_libere.trim()}`
    : "";

  const userPrompt = [
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
    notes,
  ].filter(Boolean).join("\n\n");

  return {
    systemPrompt: blocks.A,
    userPrompt,
    negativePrompt:
      "different building, changed facade, changed roof geometry, moved windows, changed camera angle, changed sky, extra dormers, invented skylights, invented chimneys, hybrid old/new covering, old tile remnants on metal roof, ghost skylight outline, floating solar panels, misaligned photovoltaic modules, warped roof seams, CGI, illustration, stylized render",
    promptVersion: "roof-v2.0.0",
    blocks,
    sceneAnalysis: scene,
    targetSlopesMap: target,
    replacementManifest: manifest,
    validation,
  };
}
