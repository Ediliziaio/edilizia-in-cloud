// ═══════════════════════════════════════════════════════════════════
// PROMPT BUILDER — Facciata Render AI
// Block-based prompt construction for facade renovation rendering
// Versione: 1.0.0 — Edilizia in Cloud
// ═══════════════════════════════════════════════════════════════════

import type {
  ConfigurazioneFacciata,
  AnalisiFacciata,
} from "./types";

// ── FINISH_PHYSICS — descrizioni fisiche delle finiture intonaco ──
const FINISH_PHYSICS: Record<string, string> = {
  liscio:
    "smooth troweled plaster — perfectly flat surface with subtle steel-trowel marks barely visible under raking light, uniform matte reflectance, no grain or texture pattern, clean contemporary appearance",
  graffiato_fine:
    "fine scratched plaster (graffiato fine) — light parallel grooves 0.5-1mm deep at random angles created by fine aggregate dragging, delicate linear texture visible at close range, soft matte surface with gentle shadow play",
  graffiato_medio:
    "medium scratched plaster (graffiato medio) — clearly visible parallel grooves 1-2mm deep at random angles, aggregate channels approximately 2-3mm apart, pronounced linear texture creating strong shadow lines under side lighting",
  rasato:
    "skim-coat smooth plaster (rasato) — ultra-smooth surface applied with flexible blade, almost glass-like flatness with only the faintest trowel swirl marks, very slight sheen under direct light, premium modern finish",
  bucciato:
    "orange-peel textured plaster (bucciato) — evenly distributed rounded bumps 2-4mm diameter resembling orange skin, created by roller application, consistent stippled texture across entire surface, soft diffuse light scattering",
  strutturato_grosso:
    "heavy structured plaster (strutturato grosso) — bold aggregate texture with visible stone particles 3-6mm embedded in surface, rough rustic appearance with deep shadows between granules, strong tactile quality, Mediterranean character",
  rustico:
    "rustic rough-cast plaster (rustico) — thrown-coat finish with irregular surface topology, random bumps and depressions 3-8mm, exposed aggregate visible, traditional countryside building aesthetic, strong shadow patterns",
  veneziana:
    "Venetian polished plaster (veneziana/stucco lustro) — multi-layered burnished surface with characteristic depth and translucency, subtle color variation between layers, high-gloss areas alternating with matte patches creating marble-like veining effect, luxurious reflective surface",
  bugnato:
    "rusticated ashlar plaster (bugnato) — geometric pattern of raised rectangular blocks 30-50cm with recessed 10-15mm deep channeled joints between them, each block face slightly convex or rough-hewn, classical Renaissance architectural treatment, strong geometric shadow grid",
};

// ── CLADDING_PHYSICS — descrizioni fisiche dei rivestimenti ───────
const CLADDING_PHYSICS: Record<string, string> = {
  pietra_serena:
    "Pietra Serena sandstone cladding — fine-grained blue-grey sandstone, smooth honed surface with subtle sedimentary layering visible, matte finish with cool grey tones, traditional Tuscan architectural stone, slabs typically 40-60cm with thin mortar joints",
  travertino:
    "Travertine cladding — warm beige-cream limestone with characteristic pitted surface holes and linear veining, cross-cut or vein-cut patterns, honed or filled finish, natural color variation from ivory to light brown, classic Roman building stone",
  arenaria_beige:
    "beige sandstone cladding (arenaria) — warm golden-beige fine-grained sandstone, visible stratification lines running horizontally, slight surface roughness with sandy texture, warm Mediterranean tones, typically saw-cut or bush-hammered finish",
  luserna:
    "Luserna gneiss cladding — dark grey-green metamorphic stone with characteristic silver-grey mica flecks, naturally split rough surface with irregular cleavage planes, strong directional texture, traditional Piedmontese building stone",
  splitface_grigio:
    "split-face grey stone cladding — machine-split rough surface with natural rock fracture texture, protruding 10-20mm from wall plane, strong shadow relief, stacked horizontal courses 5-10cm high, contemporary rustic aesthetic with grey tones",
  pietra_rustica:
    "rustic fieldstone cladding — irregular natural stone pieces of varying sizes (10-40cm), mixed warm earth tones (ochre, brown, grey), dry-stack or minimal mortar appearance, organic random pattern, traditional rural Italian building character",
  cotto_rosso:
    "red terracotta brick cladding (cotto rosso) — traditional Italian clay bricks with warm red-orange tones, visible kiln variation creating subtle color differences between bricks, slightly rough surface texture, standard running bond pattern with 10mm mortar joints",
  clinker_rosso:
    "red clinker brick facing — high-fired ceramic brick with deep red-burgundy color, smooth dense surface with slight metallic sheen, very uniform color, precise geometric edges, modern clean brickwork with thin 3-5mm joints",
  clinker_grigio:
    "grey clinker brick facing — high-fired ceramic brick in cool anthracite grey, smooth dense surface with subtle tonal variation, precise edges, contemporary industrial aesthetic, thin mortar joints creating clean geometric pattern",
  clinker_beige:
    "beige clinker brick facing — high-fired ceramic brick in warm sand-beige tone, smooth surface with gentle warm tonal variation, precise edges, elegant modern brickwork with thin 3-5mm joints, Scandinavian-influenced contemporary aesthetic",
};

// ── Helper: hex → english color name ─────────────────────────────
function hexToColorName(hex: string): string {
  const colors: Record<string, string> = {
    "#FFFFFF": "pure white", "#F5F5DC": "beige", "#FAF0E6": "linen white",
    "#FFFDD0": "cream", "#FFE4C4": "bisque", "#FAEBD7": "antique white",
    "#D2B48C": "tan", "#C4A882": "warm sand", "#A0522D": "sienna brown",
    "#8B4513": "saddle brown", "#CD853F": "peru", "#DEB887": "burlywood",
    "#808080": "medium grey", "#A9A9A9": "dark grey", "#D3D3D3": "light grey",
    "#696969": "dim grey", "#B0C4DE": "light steel blue", "#F0E68C": "khaki",
    "#FFF8DC": "cornsilk", "#FFFFF0": "ivory",
  };
  const upper = hex.toUpperCase();
  return colors[upper] || `color ${hex}`;
}

// ── buildFacciataPrompt ──────────────────────────────────────────
export function buildFacciataPrompt(
  config: ConfigurazioneFacciata,
  analisi?: AnalisiFacciata | null,
): {
  systemPrompt: string;
  userPrompt: string;
  promptVersion: string;
  blocks: Record<string, string>;
} {
  const blocks: Record<string, string> = {};

  // ── System prompt ────────────────────────────────────────────────
  const systemPrompt = `You are an expert PHOTOREALISTIC FACADE RENOVATION RENDERER for Italian architectural visualization. Your ONLY task: apply the specified facade renovation treatments to the building photograph while keeping EVERYTHING ELSE 100% pixel-perfect identical.

CRITICAL RENDERING RULES:
1. Plaster finish textures must be physically accurate — each finish type has specific surface characteristics that must be faithfully reproduced.
2. Cladding materials must show correct stone/brick texture, joint patterns, and natural color variation.
3. If thermal insulation (cappotto) is applied, window reveals and edges must show 10-15cm additional depth where the insulation wraps around openings.
4. Zone transitions (e.g., ground floor cladding meeting upper floor plaster) must have clean architectural demarcation lines.
5. All shadows must be recalculated to account for new surface depths and textures.
6. Sky, road, vegetation, neighboring buildings, vehicles, people — ALL must remain 100% unchanged.
7. Window frames, glass, and openings must remain identical unless explicitly part of the renovation scope.
8. Maintain exact camera perspective, focal length, and lighting conditions.
9. Output image dimensions must match input image dimensions exactly.
10. The result must look like a real photograph, not a CGI render or illustration.`;

  // ── [CONTESTO] ───────────────────────────────────────────────────
  const a = analisi ?? {
    tipo_edificio: "residenziale",
    numero_piani: 3,
    numero_finestre: 6,
    intonaco_attuale: "intonaco tradizionale",
    colore_attuale_hex: "#D3D3D3",
    stato_conservazione: "usura media",
    elementi_presenti: [],
    note: "",
  };

  blocks.CONTESTO = `[CONTESTO — ANALISI EDIFICIO ESISTENTE]
Tipo edificio: ${a.tipo_edificio}
Piani: ${a.numero_piani}
Finestre visibili: ${a.numero_finestre}
Intonaco attuale: ${a.intonaco_attuale}
Colore attuale: ${hexToColorName(a.colore_attuale_hex)} (${a.colore_attuale_hex})
Stato conservazione: ${a.stato_conservazione}
Elementi architettonici presenti: ${a.elementi_presenti.length > 0 ? a.elementi_presenti.join(", ") : "nessuno identificato"}
${a.note ? `Note: ${a.note}` : ""}
Tipo intervento richiesto: ${config.tipo_intervento.replace(/_/g, " ")}`;

  // ── [INTONACO] ───────────────────────────────────────────────────
  if (config.intonaco.attivo) {
    const finish = FINISH_PHYSICS[config.intonaco.finitura] || config.intonaco.finitura;
    const colorName = config.intonaco.colore_nome || hexToColorName(config.intonaco.colore_hex);
    const ralPart = config.intonaco.colore_ral ? ` (RAL ${config.intonaco.colore_ral})` : "";
    const zonaPart = config.intonaco.zona === "tutta"
      ? "Apply to ENTIRE facade surface"
      : `Apply ONLY to: ${config.intonaco.zona.replace(/_/g, " ")}`;

    blocks.INTONACO = `[INTONACO — PLASTER FINISH]
ACTIVE: YES
Color: ${colorName}${ralPart} — hex ${config.intonaco.colore_hex}
Finish texture: ${finish}
Application zone: ${zonaPart}

RENDERING RULES:
- The plaster color must be uniform and match the specified hex value exactly.
- Finish texture must be clearly visible and physically accurate.
- Natural weathering should NOT be added — this is a fresh renovation.
- Paint application must look professional with no drips, runs, or uneven coverage.`;
  } else {
    blocks.INTONACO = `[INTONACO — PLASTER FINISH]
ACTIVE: NO — Keep existing plaster/surface exactly as in original photo.`;
  }

  // ── [RIVESTIMENTO] ───────────────────────────────────────────────
  if (config.rivestimento.attivo) {
    const cladding = CLADDING_PHYSICS[config.rivestimento.tipo] || config.rivestimento.tipo;
    const zonaPart = config.rivestimento.zona === "tutta"
      ? "Apply to ENTIRE facade surface"
      : `Apply ONLY to: ${config.rivestimento.zona.replace(/_/g, " ")}`;

    blocks.RIVESTIMENTO = `[RIVESTIMENTO — CLADDING MATERIAL]
ACTIVE: YES
Material: ${cladding}
Application zone: ${zonaPart}

RENDERING RULES:
- Cladding must show natural material texture, color variation, and joint patterns.
- Joints/mortar lines must follow correct coursing patterns for the material type.
- Cladding depth (15-30mm) must be visible at edges, corners, and around window reveals.
- If applied to a zone (e.g., ground floor only), the transition to adjacent surface must have a clean architectural detail line.`;
  } else {
    blocks.RIVESTIMENTO = `[RIVESTIMENTO — CLADDING MATERIAL]
ACTIVE: NO — No cladding applied.`;
  }

  // ── [CAPPOTTO] ───────────────────────────────────────────────────
  if (config.cappotto.attivo) {
    const sistemaDesc: Record<string, string> = {
      eps: "EPS (expanded polystyrene) external thermal insulation system — ETICS with reinforced render finish",
      lana_roccia: "mineral wool (rock wool) external thermal insulation system — ETICS with reinforced render finish, fire-resistant",
      fibra_legno: "wood fiber external thermal insulation system — ETICS with reinforced render finish, sustainable/ecological",
    };
    const colorName = hexToColorName(config.cappotto.colore_finitura_hex);

    blocks.CAPPOTTO = `[CAPPOTTO TERMICO — EXTERNAL INSULATION]
ACTIVE: YES
System: ${sistemaDesc[config.cappotto.sistema] || config.cappotto.sistema}
Thickness: ${config.cappotto.spessore_cm}cm
Finish color: ${colorName} (${config.cappotto.colore_finitura_hex})

CRITICAL RENDERING RULES:
- The insulation adds ${config.cappotto.spessore_cm}cm (${Math.round(config.cappotto.spessore_cm * 10)}mm) of depth to the facade surface.
- Window reveals MUST show 10-15cm deep insets where the cappotto wraps around window openings.
- Window sills may need to extend or be replaced to cover the additional insulation depth.
- Drip edges and flashings must be visible at horizontal transitions.
- The finish surface should appear as fresh smooth render in the specified color.
- Corner details must show clean aluminum or PVC edge profiles.`;
  } else {
    blocks.CAPPOTTO = `[CAPPOTTO TERMICO — EXTERNAL INSULATION]
ACTIVE: NO — No thermal insulation applied. Facade depth remains unchanged.`;
  }

  // ── [ELEMENTI] ───────────────────────────────────────────────────
  const elemLines: string[] = ["[ELEMENTI ARCHITETTONICI — ARCHITECTURAL DETAILS]"];

  const { cornici_finestre, marcapiani, davanzali, zoccolatura, gronde, balconi_ringhiere } = config.elementi;

  // Cornici finestre
  if (cornici_finestre.azione === "aggiungi") {
    elemLines.push(`\nWINDOW FRAMES/CORNICES: ADD new decorative cornices around all windows in ${hexToColorName(cornici_finestre.colore_hex || "#FFFFFF")} (${cornici_finestre.colore_hex || "#FFFFFF"}). Width 8-12cm, classical molded profile.`);
  } else if (cornici_finestre.azione === "rimuovi") {
    elemLines.push(`\nWINDOW FRAMES/CORNICES: REMOVE all existing cornices — show flush wall surface around windows.`);
  } else {
    elemLines.push(`\nWINDOW FRAMES/CORNICES: KEEP exactly as in original photo.`);
  }

  // Marcapiani
  if (marcapiani.azione === "aggiungi") {
    elemLines.push(`\nSTRING COURSES (MARCAPIANI): ADD horizontal bands between floors in ${hexToColorName(marcapiani.colore_hex || "#FFFFFF")} (${marcapiani.colore_hex || "#FFFFFF"})${marcapiani.spessore ? `, thickness: ${marcapiani.spessore}` : ", thickness: 15-20cm"}. Classical profile with slight projection from wall plane.`);
  } else {
    elemLines.push(`\nSTRING COURSES (MARCAPIANI): KEEP existing as-is.`);
  }

  // Davanzali
  if (davanzali.azione === "sostituisci") {
    elemLines.push(`\nWINDOW SILLS: REPLACE with ${davanzali.materiale || "stone"} sills in ${hexToColorName(davanzali.colore_hex || "#FFFFFF")} (${davanzali.colore_hex || "#FFFFFF"}). Clean modern profile with 3cm nose projection.`);
  } else {
    elemLines.push(`\nWINDOW SILLS: KEEP existing sills exactly as-is.`);
  }

  // Zoccolatura
  if (zoccolatura.azione === "aggiungi") {
    elemLines.push(`\nBASE COURSE (ZOCCOLATURA): ADD ${zoccolatura.tipo || "intonaco"} base course, height: ${zoccolatura.altezza_cm || 40}cm from ground level, color: ${hexToColorName(zoccolatura.colore_hex || "#808080")} (${zoccolatura.colore_hex || "#808080"}). Sharp horizontal demarcation line at top edge.`);
  } else {
    elemLines.push(`\nBASE COURSE (ZOCCOLATURA): KEEP existing as-is.`);
  }

  // Gronde
  if (gronde.azione === "sostituisci") {
    elemLines.push(`\nGUTTERS/EAVES (GRONDE): REPLACE with ${gronde.materiale || "alluminio"} gutters in ${hexToColorName(gronde.colore_hex || "#808080")} (${gronde.colore_hex || "#808080"}). Clean profile, proper brackets visible.`);
  } else {
    elemLines.push(`\nGUTTERS/EAVES (GRONDE): KEEP existing as-is.`);
  }

  // Balconi/ringhiere
  if (balconi_ringhiere.azione === "vernicia") {
    elemLines.push(`\nBALCONY RAILINGS: REPAINT in ${hexToColorName(balconi_ringhiere.colore_hex || "#000000")} (${balconi_ringhiere.colore_hex || "#000000"}). Fresh uniform paint finish on all metal elements.`);
  } else {
    elemLines.push(`\nBALCONY RAILINGS: KEEP existing finish and color as-is.`);
  }

  blocks.ELEMENTI = elemLines.join("\n");

  // ── [NOTE] ───────────────────────────────────────────────────────
  if (config.note_libere) {
    blocks.NOTE = `[NOTE AGGIUNTIVE]\n${config.note_libere}`;
  }

  // ── [VINCOLI] ────────────────────────────────────────────────────
  blocks.VINCOLI = `[VINCOLI — ABSOLUTE PRESERVATION CONSTRAINTS]
The following MUST remain 100% unchanged:
- Sky, clouds, weather conditions
- Road, pavement, ground surface
- Vegetation, trees, plants, gardens
- Neighboring buildings and structures
- Vehicles, people, street furniture
- Window glass, frames, and openings (unless part of renovation scope)
- Camera perspective and focal length
- Overall lighting direction and intensity
- Image dimensions (output MUST match input exactly)

NEVER:
- Change sky color or add/remove clouds
- Alter road or ground surfaces
- Add or remove vegetation
- Change neighboring buildings
- Produce cartoon, CGI, or illustration artifacts
- Add text, watermarks, or labels
- Distort building proportions or perspective
- Add elements not present in original (people, vehicles, etc.)`;

  // ── Assemble user prompt ─────────────────────────────────────────
  const userParts = [
    blocks.CONTESTO,
    blocks.INTONACO,
    blocks.RIVESTIMENTO,
    blocks.CAPPOTTO,
    blocks.ELEMENTI,
  ];
  if (blocks.NOTE) userParts.push(blocks.NOTE);
  userParts.push(blocks.VINCOLI);

  const userPrompt = userParts.join("\n\n");

  return {
    systemPrompt,
    userPrompt,
    promptVersion: "1.0.0",
    blocks,
  };
}
