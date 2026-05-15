// shared/render-window/windowPromptBuilder.ts — v8.3.2 (2026-05-15)
// CHANGELOG v8.3.2:
//   + 🔴 FORCE FULL REPLACEMENT, NOT RECOLOR (BLOCK A + BLOCK F)
//   + NO RESIDUAL SASH SUBDIVISIONS (4 dark rectangles ban)
//   + CASSONETTO REPLACEMENT vs RECOLOR (monoblocco continuity)
//   + Negative prompt: 18 nuovi pattern anti-recolor / residui
//   + BLOCK J: 6 verifications v8.3.2
// CHANGELOG v8:
//   ↺ describeSpecification: nuove regole esplicite per
//      - composition change (3→2 ante)
//      - central handle (una sola maniglia sul nodo)
//      - reduced node (mullion centrale sottile)
//      - hidden hinges (no visible hinges)
//      - transom (mantieni/rimuovi/aggiungi)
//      - profile thickness numerica (PVC 80mm vs ALU 55mm)
//      - thermal break visibile
//   + Nuovo block BLOCK_D2_HINGES dedicato alle cerniere
//   ↺ promptVersion → "8.0.0"

import {
  APERTURA_DESCRIPTION,
  DEFAULT_NEGATIVE_CONSTRAINTS,
  DEFAULT_QUALITY_DIRECTIVES,
  FRAME_STYLE_DESCRIPTION,
  HANDLE_FINISH_DESCRIPTION,
  HANDLE_STYLE_DESCRIPTION,
  HIDDEN_HINGE_DESCRIPTION,
  MATERIAL_PHYSICS,
} from "./promptFragments.ts";
import type {
  WindowPromptBuildResult,
  WindowRenderConfig,
  WindowSceneOpening,
  WindowTechnicalSpecification,
} from "./types.ts";
import { ensureWindowRenderConfig } from "./windowRenderConfig.ts";
import { validateWindowPromptConfig } from "./windowPromptValidation.ts";

function bullets(lines: string[]): string {
  return lines.filter((line) => line.trim().length > 0).map((line) => `- ${line}`).join("\n");
}

function describeOpening(opening: WindowSceneOpening): string {
  const parts = [
    `Opening ${opening.label} (${opening.approximatePlacement})`,
    `${APERTURA_DESCRIPTION[opening.typeCurrent] ?? opening.typeCurrent}`,
    `${opening.sashCount} sash${opening.sashCount > 1 ? "es" : ""}`,
    `${opening.materialPerceived} / ${opening.colorPerceived}`,
    opening.hasCassonetto ? `cassonetto visible (${opening.cassonettoType ?? "roller box"})` : "no visible cassonetto",
    opening.hasCassonetto ? `cassonetto geometry: ${opening.cassonettoGeometryNotes}` : "",
    opening.hasRollerShutter ? `shading system visible` : "no visible roller shutter",
    opening.hasBelt ? "manual belt visible" : "no visible manual belt",
    opening.hasBeltBox ? "manual wall winder plate/box visible" : "",
    opening.hasBelt ? `manual control placement: ${opening.beltPlacementNotes}` : "",
    opening.hasRollerShutter ? `roller curtain state: ${opening.rollerCurtainState}` : "",
    opening.hasRollerShutter ? `roller curtain placement: ${opening.rollerCurtainPositionNotes}` : "",
    opening.hasPersiane ? "persiane visible" : "",
    opening.hasScuri ? "scuri visible" : "",
    opening.hasGrates ? "grates visible" : "",
    opening.hasCurtains ? "curtains near opening" : "",
    opening.radiatorNearby ? "radiator close to opening" : "",
    opening.hasSill ? "sill visible" : "",
    // v8 — traverso
    opening.hasHorizontalTransom
      ? `horizontal transom visible at ~${opening.transomPositionPct ?? 50}% height (panel below: ${opening.transomPanelBelowType ?? "unknown"})`
      : "",
    opening.surroundingElements.length > 0 ? `surrounding elements: ${opening.surroundingElements.join(", ")}` : "",
    opening.lightNotes ? `light: ${opening.lightNotes}` : "",
    opening.reflectionNotes ? `reflections: ${opening.reflectionNotes}` : "",
    opening.shadowNotes ? `shadows: ${opening.shadowNotes}` : "",
  ];
  return parts.filter(Boolean).join("; ");
}

function describeSpecification(
  spec: WindowTechnicalSpecification,
  scene: WindowRenderConfig["scene_analysis"],
): string {
  const opening = scene.openings.find((o) => o.id === spec.openingId);
  const compositionChange = spec.compositionChange;

  const finishDescription = spec.finish.mode === "legno"
    ? `${spec.finish.name} wood-effect finish with visible grain${spec.finish.promptFragment ? `, specifically: ${spec.finish.promptFragment}` : ""}`
    : `${spec.finish.name}${spec.finish.ral ? ` (RAL ${spec.finish.ral})` : ""}, ${spec.finish.finish}`;

  // ── v8 — Composition change line (PRIMA di tutto, è critica) ───────────
  const headerLine = compositionChange
    ? `[CRITICAL ARCHITECTURAL CHANGE FOR OPENING ${spec.openingLabel}] ` +
      `The source photo shows ${compositionChange.fromSashCount} sashes but the NEW window MUST have ` +
      `EXACTLY ${compositionChange.toSashCount} sashes. ${compositionChange.instruction}`
    : `Target opening ${spec.openingLabel}: ${APERTURA_DESCRIPTION[spec.desiredOpeningType] ?? spec.desiredOpeningType}`;

  const lines = [
    headerLine,
    `Opening family: ${spec.desiredTypeId}, desired sash count: ${spec.desiredSashCount}`,
    `Material: ${MATERIAL_PHYSICS[spec.material] ?? spec.material}`,
    `Profile visible thickness: ${spec.profileVisibleThickness}`,
    spec.thermalBreakVisible
      ? "Thermal break MUST be visible as a thin (1-2mm) dark horizontal line at mid-depth of the frame and central mullion."
      : "",
    `Profile family: ${spec.profileId}, frame style: ${FRAME_STYLE_DESCRIPTION[spec.frameStyle] ?? spec.frameStyle}`,
    `Frame visual depth: ${spec.frameDepthLabel}, shape: ${spec.frameShape}, slimness: ${spec.slimnessLabel}`,
    // ── v8 — Reduced node EXPLICIT
    spec.reducedNode
      ? "REDUCED-NODE RULE: the central vertical mullion between sashes MUST be visibly thinner than the outer frame perimeter. Glass surface area MUST clearly increase compared to a standard PVC residential window. The visual difference must be obvious."
      : "",
    // ── v8 — Central handle EXPLICIT
    spec.centralHandle
      ? `CENTRAL-HANDLE RULE for opening ${spec.openingLabel}: render EXACTLY ONE handle on the entire window, mounted at the geometric vertical center of the meeting stiles between the two sashes. The handle is on the central vertical mullion itself, NOT on either sash. The central mullion is dramatically reduced (~30mm) to accommodate this single handle. Each sash has its own internal locking but NO secondary visible handle. DO NOT render a second handle.`
      : "",
    `Finish: ${finishDescription}`,
    `Handle: ${HANDLE_STYLE_DESCRIPTION[spec.handleStyle] ?? spec.handleStyle} in ${HANDLE_FINISH_DESCRIPTION[spec.handleColorId] ?? spec.handleFinish}`,
    // ── v8.2 — REGOLA CRITICA numero maniglie (Italian residential standard)
    `MANDATORY HANDLE COUNT for opening ${spec.openingLabel}: render EXACTLY ${spec.handleCountVisible} handle${spec.handleCountVisible === 1 ? "" : "s"} total on this opening — NO MORE, NO LESS.`,
    `Handle placement rule: ${spec.handlePlacementRule}`,
    // ── v8 — Hinge mode EXPLICIT
    spec.hingeMode === "hidden"
      ? `HIDDEN-HINGE RULE for opening ${spec.openingLabel}: ${HIDDEN_HINGE_DESCRIPTION}`
      : spec.hingeMode === "none"
        ? `NO-HINGES RULE for opening ${spec.openingLabel}: this is a sliding or fixed system. NO visible side hinges anywhere.`
        : `Visible hinge rule: ${spec.hingePlacementRule}`,
    spec.hingeMode === "visible" ? `Hinge style: ${spec.hingeStyle}` : "",
    spec.hingeMode === "visible" ? `Hinge consistency: ${spec.hingeConsistencyRule}` : "",
    // ── v8 — Transom rule (solo per portafinestre)
    spec.transomRule ? `Horizontal transom: ${spec.transomRule}` : "",
    spec.manualControlCleanupRule ? `Manual shutter-control cleanup: ${spec.manualControlCleanupRule}` : "",
    `Glass: ${spec.glassSpec}`,
    spec.cassonetto.replace
      ? `Cassonetto: replace with ${spec.cassonetto.materialLabel}${spec.cassonetto.colorLabel ? ` in ${spec.cassonetto.colorLabel}` : ""}. Dimension rule: ${spec.cassonetto.dimensionRule}`
      : "Cassonetto: keep existing if present",
    spec.shutter.replace
      ? `Shading system: replace with ${spec.shutter.mode === "motorizzate" ? "motorized roller shutter" : "new shutter system"}${spec.shutter.colorLabel ? ` in ${spec.shutter.colorLabel}` : ""}. Visibility state: ${spec.shutter.visibilityState}. Placement rule: ${spec.shutter.placementRule}`
      : "Shading system: keep existing if present",
    // ── v8 — Electric button rule (quando motorizzata + cinghia rimossa)
    spec.shutter.electricButton?.install
      ? `ELECTRIC SHUTTER SWITCH for opening ${spec.openingLabel}: ${spec.shutter.electricButton.description}`
      : "",
    spec.compatibilityNotes.length > 0 ? `Compatibility rules: ${spec.compatibilityNotes.join(" | ")}` : "",
  ];

  return lines.filter(Boolean).join("\n");
}

export function buildWindowPrompt(
  rawConfig: Record<string, unknown>,
  rawAnalysis?: unknown,
): WindowPromptBuildResult {
  const normalizedConfig: WindowRenderConfig = ensureWindowRenderConfig(
    rawConfig,
    rawAnalysis,
    (rawConfig.photo_meta as WindowRenderConfig["photo_meta"] | undefined) ?? null,
  );

  const validation = validateWindowPromptConfig(normalizedConfig);

  const untouchedOpenings = normalizedConfig.scene_analysis.openings.filter((opening) =>
    normalizedConfig.target_selection.preservedOpeningIds.includes(opening.id),
  );
  const manualControlZeroToleranceRules = normalizedConfig.technical_specification
    .map((spec) => spec.manualControlCleanupRule)
    .filter((item): item is string => Boolean(item));

  const blocks: Record<string, string> = {};

  blocks.A = `[BLOCK A – MISSION & IDENTITY]
You are a SURGICAL PHOTOREALISTIC IMAGE EDITOR with 20+ years of experience in premium window and door replacement renders for the Italian residential market.
You think like an "esperto serramentista italiano": you know that Italian windows have specific structural standards (numero maniglie, palettone, cerniere a scomparsa, cassonetto monoblocco, tapparelle, scuri/persiane, traverso, etc.) and you respect them.
Your task is NOT to redesign the room. Your task is to keep the exact same photographed environment and replace ONLY the requested target openings and explicitly requested accessories.

🔴 ABSOLUTE TIER (hard ban — failing this = unusable render):
- DO NOT change the room, walls, ceiling, floor, furniture, outdoor view (beyond minimal optical reflections), lighting, camera position, image dimensions or orientation.
- DO NOT add, modify or remove any object that is not explicitly part of the replacement scope.
- DO NOT invent decorative elements, lights, sensors, stickers, devices, sockets, switches that were not visible in the original photo (UNLESS specifically requested by the replacement spec, e.g. new electric shutter switch).
- DO NOT leave any artefact from the OLD window in the new render: no leftover cord, no leftover rod, no leftover wiring, no old paint outline, no demolition residue, no hole.
- 🔴 DO NOT recolor the existing window. ERASE the old window entirely and DRAW a brand-new window with the new specified geometry, new handles, new hinges, new mullion. The output must be a NEW PHYSICAL OBJECT, not the old window with a color filter. ALL parts must be replaced including LATERAL stiles (left + right vertical frame edges) — they MUST take the new color, NEVER remain in the original old color.
- 🔴 DO NOT keep residual dark sub-rectangles, leftover muntins or georgian-bar segments in the upper portion of the new sashes. The new sashes are single uninterrupted glass panels (unless georgian bars / transom are explicitly configured).
- 🔴 DO NOT recolor the existing cassonetto when replacement is specified — ERASE the old cassonetto and draw a NEW modern flat slim unit with seamless monoblocco continuity (zero gap) to the top of the new window frame.

🟡 MANDATORY TIER (italian residential standard — must match config):
- Numero maniglie: F2A = 1 maniglia (mai 2), F3A = 2 maniglie (mai 3), F4A = 2 maniglie (mai 4).
- Nodo: simmetrico (~110mm), asimmetrico/palettone+palettino (~70mm), maniglia centrale (~30mm slim).
- Cerniere: visibili (2 per anta, 3 se >2.4m portafinestra) o a scomparsa (0 visibili).
- Traverso: keep/remove/add esplicito sulla portafinestra.
- Cassonetto: ≤30cm altezza, flush al muro, mai oltre i lati del frame.
- Bottone elettrico (se tapparella motorizzata): placca Vimar/Bticino 80x80mm a ~110cm dal pavimento.

🟢 QUALITY TIER (nice to have for premium look):
- Riflessi vetro coerenti con l'illuminazione e l'ambiente.
- Gasket lines fra telaio e anta sottili e realistiche.
- Ambient occlusion locale agli spigoli del frame e delle cerniere.
- Finitura uniforme su tutte le ferramenta (maniglie+cerniere same color+finish).
- Vetri double-glazed con leggero edge spacer visibile sui bordi.`;

  blocks.B = `[BLOCK B – EXISTING SCENE INVENTORY]
Environment: ${normalizedConfig.scene_analysis.environmentType}
View mode: ${normalizedConfig.scene_analysis.viewMode}
Environment summary: ${normalizedConfig.scene_analysis.environmentSummary}
Camera angle: ${normalizedConfig.scene_analysis.cameraAngle}
Lighting direction: ${normalizedConfig.scene_analysis.lightingDirection}
Lighting quality: ${normalizedConfig.scene_analysis.lightingQuality}
Wall: ${normalizedConfig.scene_analysis.wallMaterial} / ${normalizedConfig.scene_analysis.wallColor}
Outdoor view: ${normalizedConfig.scene_analysis.outdoorViewSummary}
Untouched context anchors: ${normalizedConfig.scene_analysis.untouchedElements.join(", ")}

Visible openings inventory:
${bullets(normalizedConfig.scene_analysis.openings.map(describeOpening).filter(Boolean))}`;

  const replacementLines = [
    `Target openings to modify: ${normalizedConfig.target_selection.targetLabels.join(", ") || "none"}`,
    ...normalizedConfig.replacement_manifest.targetOpenings.map((item) => item.summary),
    ...untouchedOpenings.map((opening) => `Opening ${opening.label} must remain untouched in every visible detail.`),
    ...normalizedConfig.replacement_manifest.additions,
  ];

  blocks.C = `[BLOCK C – REPLACEMENT MANIFEST]
${bullets(replacementLines)}

Critical keep/preserve directives:
${bullets(normalizedConfig.replacement_manifest.keepExactly)}`;

  blocks.D = `[BLOCK D – NEW WINDOW SPECIFICATION]
${normalizedConfig.technical_specification.map((spec) => describeSpecification(spec, normalizedConfig.scene_analysis)).join("\n\n")}`;

  blocks.E = `[BLOCK E – REMOVAL RULES]
${bullets(
    normalizedConfig.replacement_manifest.removals.length > 0
      ? normalizedConfig.replacement_manifest.removals.flatMap((rule) => [
          `${rule.summary}`,
          rule.repairInstruction ? `Repair rule: ${rule.repairInstruction}` : "",
          rule.preserveInstruction ? `Preserve rule: ${rule.preserveInstruction}` : "",
        ])
      : ["No destructive removals beyond the direct replacement scope. Keep every existing compatible accessory unchanged."],
  )}`;

  blocks.F = `[BLOCK F – PHOTOREALISTIC INSTALLATION RULES]
- accurate join between frame and wall reveal
- believable installation depth, gasket lines and frame-to-sash contact
- realistic glazing reflections, consistent with the photographed room and outdoor light
- correct shadow casting and local ambient occlusion around frame edges, handles, hinges and cassonetto
- physically plausible materials and finishes
- no warped geometry, no floating elements, no fake showroom look
- if the source photo is a lived-in home, keep it lived-in; do not sanitize or restage the space
- for slim/minimal profiles, widen glass area only within physically plausible frame geometry
- for sliding systems, use coherent sliding overlaps and tracks with no battente hardware
- for two-sash compositions, keep the hinge logic coherent and do not invent extra hinges or mixed hinge colors
- all visible hinges must match the selected hardware finish exactly, with realistic compact top/bottom geometry
- if a new cassonetto is specified over an existing one, keep its visible width, height, depth and bottom edge very close to the source photo unless explicitly redesigned
- if the shutter is fully open, keep the curtain hidden inside the cassonetto and do not invent a colored strip above the glazing
- any visible shutter curtain must stay recessed within its guides behind the frame/glass plane, never floating on the wall or in front of the cassonetto

[v8.3 — MANDATORY SOURCE-PHOTO CLEANUP — NEGATIVE OBSERVATIONS]
The source photograph almost always contains legacy artefacts that MUST be removed in the new render:
- Any vertical metal rod, copper pipe, brass rod or cable running alongside the OLD window (typically the manual shutter pull-rod) — REMOVE it entirely. The new window has no such control.
- Any pull cord, chain, rope or strap hanging from the OLD cassonetto or wall — REMOVE entirely.
- Any old manual shutter winder plate (rectangular vertical box on the wall) — REMOVE and patch the wall flush.
- Any holes in the wall, screw heads, anchors, residual silicone, old paint outlines around the previous window frame — REMOVE and repaint seamlessly.
- The new window is a clean modern installation: NO trace of the old manual-control system, NO trace of the demolition, NO trace of the old frame footprint.

[v8.3 — HARD BAN: PASTED-ON OBJECTS ON THE WINDOW]
The new window MUST contain ONLY: frame, sashes, glass, mullion, handle(s), hinges (if visible mode), gaskets.
ABSOLUTELY FORBIDDEN to add on top of the sashes or glass:
- round white LED disks, spotlights, ceiling lights ("plafoniere") pasted on the glass
- circular sensors, smoke detectors, alarm devices
- citofono/intercom modules
- any decorative element, sticker, logo, marker that is NOT part of the window assembly
If a ceiling light or device appears reflected in the source photo, render its REFLECTION on the glass (subtle), do NOT add the device itself as a solid object.

[v8.3 — CASSONETTO PROPORTIONS]
If a cassonetto is rendered:
- Its height MUST be proportional to the window: typically 20-30cm for residential windows (1.2-1.6m wide), max 35cm.
- It must NOT exceed the lateral width of the window frame on either side.
- It must be flush against the wall above the frame, NOT floating or projecting forward.
- Its color/material matches the new window frame OR the explicit user choice.

[v8.3.2 — 🔴 FORCE FULL REPLACEMENT, NOT RECOLOR — HIGHEST PRIORITY]
This is THE most common failure mode of the AI: producing a "recolored old window" instead of a brand-new window. ABSOLUTELY FORBIDDEN behaviors:
- DO NOT take the existing window from the source photo and simply repaint/recolor it. The OLD window must be ERASED and a COMPLETELY NEW window must be drawn in its place from scratch.
- The new window is a DIFFERENT PHYSICAL OBJECT with different geometry, different hardware, different proportions — not the old window with a color filter applied.
- Replace ALL parts of the window: outer frame perimeter (top header, bottom sill, LEFT lateral stile, RIGHT lateral stile), central mullion, every sash, every glass pane, every gasket, every visible hinge, every handle.
- The LATERAL stiles (left + right vertical frame edges) MUST take the new specified color/finish. It is FORBIDDEN to leave them in the ORIGINAL old color (typically white) while only the front face is recolored. The lateral stiles are NOT a separate object — they are part of the new frame.
- The HANDLE is a BRAND NEW model: different shape, different size, different finish than the original handle visible in the source photo. NEVER keep the old handle. NEVER just recolor the old handle.
- If the source photo has a sub-divided sash pattern (e.g. 4 small rectangular black/dark panels at the top of each sash from old leaded glass, georgian bars, or fanlights), those subdivisions MUST be REMOVED. The new sashes are full-height clear glazed panels unless georgian bars are explicitly specified in the configuration. NO residual black rectangles, NO dark trapped sub-panels, NO leftover muntins on the upper portion of the sashes.

[v8.3.2 — 🔴 NO RESIDUAL SASH SUBDIVISIONS]
A frequent failure: the AI keeps the 4 dark sub-rectangles in the upper portion of the old window sashes (residuals of old muntins/transoms/georgian bars) and just paints them the new color. THIS IS FORBIDDEN.
- The new sashes are SINGLE clear glazed panels (or whatever sash count is explicitly specified). No phantom horizontal mid-bars. No phantom upper "panel zones". No phantom dark rectangles in the upper third of the sash.
- If the configuration does NOT explicitly request a transom (mantieni traverso) or georgian bars, the sash MUST be a single uninterrupted glass panel from top of sash to bottom of sash.

[v8.3.2 — 🔴 CASSONETTO REPLACEMENT vs RECOLOR]
When the configuration says "replace cassonetto":
- DO NOT just repaint the existing cassonetto. ERASE the old cassonetto and draw a NEW cassonetto with a NEW design.
- The new cassonetto must look like a MODERN clean monoblock unit: smooth surface, integrated inspection cover (no visible old screws, no old wood texture, no old plaster patches).
- MONOBLOCCO CONTINUITY: the bottom edge of the new cassonetto MUST align PERFECTLY with the top edge of the new window frame, creating a SEAMLESS CONTINUOUS LINE. There must be NO gap, NO offset, NO shadow line, NO dark seam between cassonetto bottom and window top. They look like a single integrated unit (Italian "monoblocco" standard).
- The cassonetto color/finish exactly matches the new window frame (or the explicit cassetonetto color choice if different).
- If the OLD cassonetto in the source photo had a different design (rustic wood, old plaster, sloped, projecting forward), the NEW cassonetto replaces it COMPLETELY with a modern flat slim PVC or aluminium unit.`;

  if (manualControlZeroToleranceRules.length > 0) {
    blocks.F += `
- ZERO tolerance for leftover manual shutter controls on motorized targets: no belt, no cord, no strap, no wall winder, no wall plate, no belt slot and no residual vertical manual-control trim
- remove the old manual-control assembly from the exact photographed side/location AND install a new electric switch plate at the same location
- the new electric switch must look professionally installed: flush with wall, centered vertically at ~110cm from floor, aligned with other room switches if present`;
  }

  blocks.G = `[BLOCK G – SURROUNDINGS INTEGRITY]
${bullets(normalizedConfig.integrity_constraints)}

Image preservation:
- keep the same orientation: ${normalizedConfig.photo_meta?.orientation ?? normalizedConfig.scene_analysis.imageOrientation}
- keep the same framing and crop
- keep the same image dimensions
- do not shrink, pad or recompose the shot`;

  blocks.H = `[BLOCK H – NEGATIVE CONSTRAINTS]
${bullets(DEFAULT_NEGATIVE_CONSTRAINTS)}`;

  blocks.I = `[BLOCK I – QUALITY BAR]
${bullets(
    [
      ...DEFAULT_QUALITY_DIRECTIVES,
      ...manualControlZeroToleranceRules.map((rule) => `Non-negotiable cleanup rule: ${rule}`),
      ...normalizedConfig.quality_directives,
      validation.isValid
        ? "Prompt validation passed: target openings, replacement manifest, removal rules and integrity constraints are all present."
        : `Prompt validation warnings: missing sections = ${validation.missingSections.join(", ") || "none"}; missing business rules = ${validation.missingBusinessRules.join(", ") || "none"}.`,
    ],
  )}`;

  blocks.J = `[BLOCK J – EXECUTION CHECKLIST]
Before final output, verify all of these:
${bullets([
    `Only target openings ${normalizedConfig.target_selection.targetLabels.join(", ")} are edited.`,
    untouchedOpenings.length > 0
      ? `Openings ${untouchedOpenings.map((opening) => opening.label).join(", ")} remain untouched.`
      : "There are no preserved openings outside the target scope.",
    "The room, furniture, walls, floor, curtains, radiators and outdoor view remain identical.",
    "No accessory incompatible with the new configuration is left behind.",
    "The output still looks like the same source photograph after a real installation.",
    // ── v8 verifications ──
    "Central handle composition (if specified): exactly ONE handle on the central mullion, NOT two.",
    "Hidden hinges (if specified): the hinged stile is clean, NO visible hinge knuckles anywhere.",
    "Reduced node (if specified): the central mullion is visibly thinner than the outer frame perimeter.",
    "Composition change (if specified): the new sash count matches the specification, with mullions added/removed accordingly within the SAME opening width.",
    "Electric switch (if motorized + cinghia removal): a flush rectangular switch plate is visibly installed where the old winder was, at ~110cm from floor.",
    "Transom remove (if specified): each sash is a SINGLE full-height glazed panel.",
    // ── v8.2 verification ──
    `Total handle count: render EXACTLY the count specified per opening. For 2-sash windows this means ONE handle (not two). For 3-sash windows this means TWO handles (not three, not one). Italian residential standard.`,
    // ── v8.3 verifications ──
    "v8.3 — Source-photo cleanup: ZERO vertical rods, copper pipes, brass rods or cables left along the window. ZERO manual cord/chain/rope visible. ZERO old screw holes, old paint outlines, old silicone residue on the wall around the new frame.",
    "v8.3 — Zero pasted-on objects: NO round disks, NO LED lights, NO sensors, NO decorative elements stuck onto the sashes or glass. Reflections in the glazing are allowed (subtle), solid objects on top of the glass are NOT.",
    "v8.3 — Cassonetto scale: height ≤ 30cm proportional to window, never extends past the frame laterally, flush against the wall.",
    "v8.3 — Wall around new frame: seamless plaster + paint. No halo, no patch, no shade difference, no old paint outline from the previous installation.",
    // ── v8.3.2 verifications (anti-recolor) ──
    "v8.3.2 — Full replacement check: the new window is a COMPLETELY NEW object, NOT the old window recolored. ALL parts replaced including LATERAL stiles, top header, bottom sill, central mullion, sashes, glass, handle, hinges, gaskets.",
    "v8.3.2 — Lateral stiles take the new color: the left and right vertical frame edges MUST be in the new specified color/finish, never left in the old original color (e.g. white).",
    "v8.3.2 — Handle replaced: the handle is a BRAND NEW model with different shape/size/finish than the source-photo handle. NEVER reuse the old handle silhouette.",
    "v8.3.2 — No residual sash sub-rectangles: NO 4 dark rectangles in the upper portion of the sashes (leftover muntins/georgian bars). Sashes are single uninterrupted glass panels unless transom/georgian bars are explicitly specified.",
    "v8.3.2 — Cassonetto replacement: if replacement is specified, the new cassonetto is a NEW unit (modern flat slim design), NOT the old cassonetto recolored. NO rustic wood texture, NO old plaster, NO sloped projecting front.",
    "v8.3.2 — Monoblocco continuity: the bottom edge of the new cassonetto aligns PERFECTLY with the top edge of the new window frame, creating a seamless continuous line — NO gap, NO offset, NO shadow seam between them.",
  ])}`;

  // v8.3 — Few-shot positive examples: descrizioni testuali di "good output"
  // che aiutano la AI ad ancorarsi al risultato atteso, oltre alle regole negative.
  blocks.K = `[BLOCK K – POSITIVE EXAMPLES OF EXPECTED OUTPUT]
The following are textual descriptions of WHAT A GOOD RENDER LOOKS LIKE for typical cases. Use them as anchors.

Example 1 — Finestra F2A nuovo PVC bianco con maniglia laterale:
"A clean two-sash casement window installed inside the same wall opening. The frame is bright matte white PVC (RAL 9010), perfectly squared. The central mullion is ~100mm wide. ONE handle on the right-hand operative sash at ~110cm from the floor, polished chrome finish. TWO compact European hinges per sash on the left/right vertical stile, same chrome finish. The glass is double-glazed clear with subtle gasket lines. The wall around the new frame is uniformly painted, no halo, no old paint outline. No leftover rods, cords, or accessories from the previous window. The room, the furniture, the outdoor view are IDENTICAL to the source photo."

Example 2 — Finestra F2A maniglia centrale (palettone slim):
"A two-sash casement window with a SLIM central mullion (~30mm) — the "palettone slim" Italian style. ONE single handle mounted AT THE CENTER on the slim mullion, NOT on the lateral stiles. Two thin compact hinges per sash on the lateral stiles. The mullion is significantly thinner than the outer frame perimeter, almost invisible. Glass dominates the visual field. Clean modern Italian look."

Example 3 — Portafinestra PF2A con cerniere a scomparsa:
"A door-window with two large sashes. NO visible hinges anywhere on the lateral stiles — the hinge mechanism is completely hidden inside the frame channel. The stiles look perfectly clean and uninterrupted. ONE single handle at ~95cm from the floor on the right sash. The glass extends full-height as a single panel per sash (transom removed). The frame is contemporary slim aluminium, anthracite RAL 7016."

Example 4 — Tapparella motorizzata + bottone elettrico:
"A motorized roller shutter housed cleanly inside the cassonetto above the window. NO manual belt, NO cord, NO wall winder, NO vertical rod or pipe ANYWHERE near the window. Instead, a SMALL square electric switch plate (80x80mm, Vimar-style, matte white RAL 9010) is installed flush on the wall to the right of the window, centered at ~110cm from floor. The plate has TWO vertical rocker buttons (up triangle ▲, down triangle ▽). The wall around the new switch is uniformly painted, no halo from where the old larger belt winder plate used to be."

These examples are GUIDANCE, not commands. Follow the SPECIFIC configuration sent in this prompt's earlier blocks. The examples show what "good" looks like at the macro level.`;

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
    normalizedConfig.notes ? `[ADDITIONAL USER NOTES]\n${normalizedConfig.notes}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  return {
    systemPrompt: blocks.A,
    userPrompt,
    negativePrompt:
      // ─── Stile / qualità generale ───────────────────────────────────────
      "cartoon, illustration, painterly, staged showroom, room redesign, changed perspective, " +
      "changed crop, changed wall color, changed furniture, extra windows, distorted geometry, " +
      "fake CGI, glossy fake plastic, warped lines, floating frame, wrong shadows, mixed hinge colors, " +
      "oversized cassonetto, " +
      // ─── Manual control residui (corda, asta, cinghia) ──────────────────
      "visible manual belt on motorized shutter, visible manual cord on motorized shutter, " +
      "visible wall winder on motorized shutter, visible belt slot on motorized shutter, " +
      "leftover vertical manual-control trim, floating shutter band above the glass, " +
      "shutter rendered in front of the wall, " +
      // v8.3 — Asta/corda/catena tapparella manuale orfana (problema render reale)
      "vertical copper rod beside the window, vertical brass pipe beside the window, " +
      "vertical metallic rod beside the window frame, leftover manual shutter cord, " +
      "leftover manual shutter chain, dangling shutter pull cord, " +
      "any vertical metal rod attached to the window frame, " +
      "old shutter pulley mechanism still visible, " +
      // ─── Maniglie ───────────────────────────────────────────────────────
      "two handles on central-handle composition, " +
      "two handles on a 2-sash window (Italian residential standard mandates ONE handle on the primary sash only), " +
      "three handles on a 3-sash window (mandate two handles total: one on the 2-sash group + one on the single sash), " +
      "one handle per sash on multi-sash compositions (each group of 2 sashes shares ONE handle on the primary operative sash only), " +
      // ─── Cerniere ───────────────────────────────────────────────────────
      "visible hinges when hidden-hinges mode is selected, " +
      // ─── Nodo / mullion / transom ───────────────────────────────────────
      "central mullion as thick as outer frame on reduced-node profile, " +
      "horizontal transom present when transom-remove mode is selected, " +
      // ─── Bottone elettrico ──────────────────────────────────────────────
      "wall left blank where old manual belt winder was previously visible " +
      "(when motorization is selected the new electric switch plate must replace it), " +
      // ─── v8.3 — Allucinazioni "oggetti pasted-on" sul vetro/anta ────────
      // Problema reale: il modello a volte incolla luci LED, sensori, dischi
      // bianchi rotondi sulle ante della finestra. NIENTE deve apparire sui
      // pannelli vetrati o sul telaio se non i dettagli del serramento stesso.
      "round white LED disk on the window sash, " +
      "circular ceiling light pasted on the window glazing, " +
      "white round sensor on the window frame, " +
      "smoke detector or alarm device on the window pane, " +
      "any electronic device drawn on top of the glazing, " +
      "spotlight or recessed light inside the window panel, " +
      "decorative sticker or logo on the glass, " +
      "any object that is NOT part of the standard window assembly stuck onto the sashes, " +
      // ─── v8.3 — Cassonetto fuori scala ──────────────────────────────────
      "cassonetto taller than 30cm relative to window height, " +
      "cassonetto extending past the lateral edges of the window frame, " +
      "cassonetto floating away from the wall, " +
      // ─── v8.3 — Misc oggetti accessory NON richiesti ────────────────────
      "tape or sticker residue around the new window, " +
      "old paint outline where the previous frame ended, " +
      "any wiring, conduit, copper pipe, brass rod or cable running on the wall around the window unless explicitly present in the source photo and explicitly NOT marked for removal, " +
      "phantom shadows of the previous installation, " +
      // ─── v8.3.2 — Anti-recolor / replacement vs repaint ─────────────────
      "old window simply recolored instead of replaced, " +
      "old window repainted with new color while keeping original geometry, " +
      "old handle kept and only repainted, " +
      "original handle silhouette preserved from source photo, " +
      "lateral frame stiles still in original old color (typically white) while front face is new color, " +
      "left vertical stile in white while front frame is colored, " +
      "right vertical stile in white while front frame is colored, " +
      "asymmetric color application where only one face of the frame is the new color, " +
      "4 black rectangles on upper portion of window sashes (residual muntins from old window), " +
      "dark rectangular sub-panels in upper third of new sashes, " +
      "leftover georgian bars or transom segments in upper sash area, " +
      "phantom horizontal mid-bar inside the sash glazing, " +
      "old window subdivisions visible through the new color paint, " +
      "old cassonetto kept and only recolored, " +
      "rustic wood-textured cassonetto when modern PVC cassonetto is specified, " +
      "old plaster cassonetto with new color paint applied, " +
      "visible gap between cassonetto bottom edge and window top edge, " +
      "horizontal shadow seam separating cassonetto from window frame, " +
      "offset or misalignment between cassonetto and window — they must be a seamless monoblocco unit, " +
      "discontinuous line between cassonetto and frame, " +
      "old window frame visible underneath the new color coat",
    promptVersion: "8.3.2",
    blocks,
    validation,
    normalizedConfig,
  };
}
