// shared/render-window/windowPromptBuilder.ts — v8.3.8 (2026-05-15)
// CHANGELOG v8.3.8 (cliente feedback iterativo):
//   + UI cerniere scomparsa: ora selezionabile su TUTTI i profili
//     (non più disabled su PVC/legno). computeHingeSpec forza hidden anche
//     se profilo non-standard, aggiungendo nota architectural upsell.
//   + image.ts editImage: ordine provider configurabile via env
//     RENDER_PROVIDER_FIRST = "gemini" (default) | "openai".
//     Permette A/B test qualità senza redeploy.
//   ↺ promptVersion → "8.3.8"
// CHANGELOG v8.3.7 (GAP A/B/C/D fix tutti chiusi):
//   + GAP A: UI cassonetto custom ora usa palette WIZARD_RAL family-grouped
//     (allineato all'UI tapparella, con label colore selezionato + RAL code)
//   + GAP B: 8 test unitari v8.3.x aggiunti
//     (BLOCK A, BLOCK F, BLOCK 0.5 CARDINAL, LEGEND, regression tappCol, regression cassCol, promptVersion)
//   + GAP C: QA Vision MULTI-CRITERION
//     - Sostituito buildMotorizedQaPrompt single-check (cinghia) con
//       buildMultiCriterionQaPrompt 9 categorie:
//       recolor, old_handle_kept, lateral_stiles_old_color,
//       manual_shutter_control_visible, residual_sash_subdivisions,
//       cassonetto_recolored_not_replaced, objects_invented,
//       swatch_pasted_in_scene, cassonetto_window_discontinuity
//     - QA ora SEMPRE attiva (non solo se motorized + cinghia)
//     - buildRetryPrompt produce istruzioni correttive PER OGNI categoria
//       di issue trovata (non solo cinghia)
//     - visionQa.ts parser accetta sia stringhe legacy che oggetti
//       strutturati {category, detail}
//   + GAP D: salva in render_sessions.meta:
//     qa_vision_model, qa_issue_categories, qa_issues_count, qa_retried
//   ↺ promptVersion → "8.3.7"
// CHANGELOG v8.3.6 (bug fix pipeline color tapparella + RAL label + observability):
//   🐛 windowRenderConfig.mapShutter: ora riconosce WIZARD_TAPP_COLORS (i 19
//     colori dedicati tapparella inclusi verde/rosso/blu erano cosmetici —
//     findWizardRal non li trovava → tapparella usciva col colore frame)
//   🐛 windowRenderConfig: mapCassonetto + mapShutter usavano custom.id come
//     codice RAL (es. "1009_grigio_ardesia") invece di custom.code ("1009")
//     → il prompt riceveva "(RAL 1009_grigio_ardesia)" che è nonsense.
//     Adesso usano custom.code con fallback a stringa vuota se assente.
//   + generate-render: salva meta.reference_images_requested/fetched/labels
//     in render_sessions per osservabilità multi-image pipeline (audit GAP D)
//   ↺ promptVersion → "8.3.6"
// CHANGELOG v8.3.5 (allinea al masterprompt v8.3.1 + cleanup):
//   ↺ BLOCK A riscritto in stile "PHOTOREALISTIC WINDOW INSTALLATION SIMULATOR"
//     con sezioni esplicite "YOU ARE NOT DOING / YOU ARE DOING / PRESERVE /
//     REPLACE / demolish and rebuild" — fraseggio del masterprompt v8.3.1
//   + BLOCK F: nuova sezione "PHYSICAL REPLACEMENT (CRITICAL)" all'inizio
//   + BLOCK F: nuova sezione "WHAT THE VIEWER SHOULD THINK" come closure
//   + promptFragments.ts: 9 nuovi negative constraints v8.3.1
//     (do not recolor, do not preserve old mullion, Photoshop color-overlay,
//     blend old/new, ecc.) ora in DEFAULT_NEGATIVE_CONSTRAINTS
//   ↺ promptVersion → "8.3.5"
// CHANGELOG v8.3.4:
//   + BLOCK 0.5 CARDINAL FAILURE MODES — recap brutale dei 7 fallimenti
//     osservati in produzione, posizionato IMMEDIATAMENTE dopo la legend
//     così il modello non può saltarlo
//   + BLOCK F: regole "V-perfect welded corners" (saldatura PVC mitred)
//   + BLOCK F: regole "Cassonetto monoblocco standard" (PVC smooth flat)
//   + Reference legend rafforzata: "swatch != scene element", "do NOT paste",
//     "handle MUST replicate reference, not old silhouette"
//   + Negative prompt: 16 nuovi pattern (curtains invented, swatch pasted,
//     vertical cord on motorized, screwed butt-joint corners, etc.)
//   ↺ promptVersion → "8.3.4"
// CHANGELOG v8.3.3:
//   + MULTI-IMAGE INPUT: ora il builder costruisce ANCHE la lista delle foto
//     reference (colore frame, maniglia, nodo, cassonetto, cerniere) che vanno
//     passate al modello image-edit INSIEME alla sorgente.
//   + BLOCK LEGEND in cima al user prompt: enumera ogni immagine e spiega cosa
//     rappresenta. Vincola l'AI a usare le reference come autorità per colore /
//     modello, non la finestra vecchia visibile in Image 1.
//   ↺ promptVersion → "8.3.3"
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
  FRAME_CORNER_CONSTRUCTION,
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
import {
  buildReferenceImageLegend,
  collectReferenceImages,
  type RenderReferenceImage,
} from "./windowReferenceImages.ts";

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
): string {
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
    // v8.6.1 — Corner construction CONDIZIONALE al materiale: PVC = saldatura
    // V-perfect mitred 45°, Legno = mortise & tenon L-joint, Alu = butt joint 90°.
    // Eliminates the bug "PVC con effetto legno con angoli a L stile carpenteria".
    FRAME_CORNER_CONSTRUCTION[spec.material]
      ? `🔨 ${FRAME_CORNER_CONSTRUCTION[spec.material]}`
      : "",
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
  const referenceImages: RenderReferenceImage[] = collectReferenceImages(
    normalizedConfig,
  );
  const referenceLegend = buildReferenceImageLegend(referenceImages);

  const untouchedOpenings = normalizedConfig.scene_analysis.openings.filter((opening) =>
    normalizedConfig.target_selection.preservedOpeningIds.includes(opening.id),
  );
  const manualControlZeroToleranceRules = normalizedConfig.technical_specification
    .map((spec) => spec.manualControlCleanupRule)
    .filter((item): item is string => Boolean(item));

  const blocks: Record<string, string> = {};

  // v8.6 — System prompt LEAN: una regola, una volta, chiara.
  // Tutto cio' che e' "regola universale" sta qui. Nessuna ripetizione
  // negli altri blocchi: BLOCK F si occupa solo di realismo install, BLOCK H
  // di stile output, BLOCK J di checklist finale (non re-spiega le regole).
  blocks.A = `[BLOCK A – MISSION & IDENTITY]
You are a PHOTOREALISTIC WINDOW INSTALLATION SIMULATOR with 20+ years of experience in Italian residential window replacement. You think like an "esperto serramentista italiano".

═══ THE JOB ═══
A real installer team uninstalled the old window completely (frame + sashes + glass + hinges + handle + cassonetto + shutter + manual belt) and installed a BRAND NEW different window according to the spec. You render the result of that installation.

This is "demolish and rebuild" at the window level. NOT a color filter, NOT a paint job, NOT a restyling, NOT a recolor of the existing window.

═══ PRESERVE EXACTLY (everything outside the target opening) ═══
- The room: walls, floor, ceiling, paint color, furniture, decorations, untouched non-target windows/doors.
- The lighting: direction, intensity, color temperature, shadows, EXACT brightness of the source.
- The camera: angle, perspective, crop, orientation, image dimensions.
- The outdoor view through the glass: trees, sky, buildings, neighbors.
- 🔆 OUTDOOR VIEW LUMINOSITY: the brightness, color temperature, atmosphere and time-of-day of the outdoor scene visible through the new glass MUST match Image 1 EXACTLY. If Image 1 shows bright daylight with green leaves and clear visibility, the new render must show the SAME bright daylight — DO NOT darken, dim, mute, desaturate or apply a cool/teal cinematic filter. The new glass is just clean transparent double-glazing, not a tinted glass. The view through it must read at the SAME luminosity as the source.
- The wall opening dimensions (the hole in the masonry).
- Accessories the spec says to keep (e.g. existing curtains, radiator, sill).

═══ REPLACE COMPLETELY (the target window assembly) ═══
The NEW window is a COMPLETELY DIFFERENT PHYSICAL OBJECT from the old one. Replace EVERY part:
- Frame perimeter (top header, bottom sill, LEFT lateral stile, RIGHT lateral stile) — all in the NEW color from the FRAME COLOR REFERENCE image.
- Central mullion — at the specified thickness.
- All sashes, glass panes, gaskets.
- The handle — REPLICATE the HANDLE REFERENCE image (shape, finish, mounting). NEVER reuse the old handle silhouette.
- Hinges as per spec (visible 2 per sash + matching handle finish, OR hidden = clean stiles).
- Cassonetto (if replacement requested) — NEW modern flat PVC monoblock. NOT the old cassonetto recolored. Bottom edge seamless to window top (zero gap, zero shadow seam).
- Shutter mechanism (if motorized) — manual belt/cord/winder/rod/wall-plate ERASED, wall repainted seamlessly, new Vimar-style electric switch 80x80mm at ~110cm from floor.

═══ ITALIAN RESIDENTIAL STANDARD (numerical compliance) ═══
- Handles per opening: F1A/F2A = 1, F3A/PF3A = 2 (group 2+1), F4A = 2.
- Nodo: simmetrico ~110mm | asimmetrico ~70mm | maniglia centrale ~30mm.
- Visible hinges: 2 per sash residential, 3 per sash if portafinestra >2.4m.
- Cassonetto: ≤30cm tall, flush against wall, never wider than frame.
- Frame corner construction: depends on material — PVC=mitred 45° V-perfect welded, Legno=L-shaped mortise & tenon carpentry joint, Alluminio=90° butt with hidden corner cleat (specified per-opening in BLOCK D).

═══ MULTI-IMAGE INPUT ═══
- Image 1 = SOURCE SCENE PHOTO. The room you must preserve. The OLD window inside is the target to REPLACE, not the goal.
- Image 2..N = SWATCH / PRODUCT REFERENCES. Invisible inputs: extract their color/shape/finish and APPLY to the new window. NEVER paste them as visible elements in the output.
- When in doubt about color/material/handle shape: read from references (2..N), NOT from the old window in Image 1.

═══ ABSOLUTE BANS (hard ban — failing any = unusable render) ═══
- Recoloring the existing window instead of replacing it physically.
- Preserving the old handle silhouette.
- Leaving lateral stiles in the old color while only repainting the front face.
- Residual dark rectangles / muntins / georgian bars in upper sashes (unless explicitly specified).
- Manual shutter control (cord, belt, winder, rod, wall-plate) visible when motorization is selected.
- Cassonetto recolored instead of replaced when replacement is requested.
- Discontinuity (gap / shadow seam / offset) between cassonetto bottom and window top.
- Inventing objects not in Image 1: curtains, lamps, sensors, plants, pictures, switches.
- Pasting reference swatch images as visible scene objects.
- Pasted-on objects on the window (LED disks, sensors, smoke detectors, decals, logos).
- ❌ Keeping the source-photo sash count when a SASH COUNT CHANGE is specified (e.g. spec says 2→1 ante: the new window MUST have ONE single full-width glazed panel filling the entire wall opening, NOT two sashes with a central mullion). The wall opening width stays the same; only the internal subdivision changes.`;

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
${normalizedConfig.technical_specification.map((spec) => describeSpecification(spec)).join("\n\n")}`;

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

  // v8.6 — BLOCK F LEAN: solo realismo dell'installazione.
  // Le regole "what" (replace not recolor / handle / cassonetto / stiles / cinghia)
  // sono gia' in BLOCK A. Qui solo regole "how" (come deve apparire la nuova
  // installazione una volta fatta).
  blocks.F = `[BLOCK F – INSTALLATION REALISM]
The new window must look like a real photo of a real installation, not CGI:
- Accurate join between frame and wall reveal; believable installation depth.
- Realistic gasket lines and frame-to-sash contact (1-2mm hairline shadow).
- Glazing reflections coherent with the photographed room lighting and the outdoor view.
- Correct shadow casting + local ambient occlusion around frame edges, handle, hinges, cassonetto.
- Physically plausible materials: PVC has subtle micro-texture, aluminium has thermal-break line, wood has visible grain.
- Frame corner construction follows the per-material rule specified in BLOCK D (PVC welded mitre, Legno mortise & tenon, Alu butt-joint). Do NOT apply PVC welding to a Legno frame, do NOT apply carpentry joinery to a PVC frame.
- For 2-sash compositions: 2 hinges per sash (top + bottom on the hinged stile), matching the handle finish exactly.
- If shutter is fully raised: keep curtain hidden inside cassonetto, no colored band floating above the glazing.
- Lived-in home stays lived-in: do not sanitize or restage the space.

After rendering, the viewer should think:
"Same room, same angle — but the window is clearly a new model: different style, different mullion, different handle, different finish. Real renovation, not a Photoshop color filter."`;

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

  // v8.6 — BLOCK J LEAN: 8 checks essenziali, uno per failure mode.
  // Niente ripetizioni delle regole BLOCK A — qui solo "verifica visivamente
  // questi 8 punti prima di emettere l'output".
  blocks.J = `[BLOCK J – PRE-OUTPUT CHECKLIST]
Before emitting the render, verify each of these visually on your output:
${bullets([
    `1. Scope: only target openings ${normalizedConfig.target_selection.targetLabels.join(", ")} are edited. Room and untouched openings are pixel-identical to Image 1.`,
    "2. Replacement (not recolor): the new window has visibly different geometry from the old one — different mullion thickness, different handle silhouette, different proportions.",
    "3. Lateral stiles: left + right vertical frame edges show the NEW color (matching the FRAME COLOR REFERENCE). NOT the original old color (typically white).",
    "4. Handle: matches the HANDLE REFERENCE image shape/mounting/finish, NOT the old handle silhouette from Image 1. Count: as specified per opening (F2A=1, F3A=2).",
    "5. Sashes: single uninterrupted glass panels (no residual 4 dark rectangles from old muntins, unless transom/georgian-bars explicitly configured).",
    "6. Cassonetto: NEW modern flat PVC monoblock (if replacement specified), bottom edge seamless against window top — zero gap, zero shadow seam.",
    "7. Motorized cleanup: NO vertical cord / belt / winder / wall-plate / rod visible. Wall behind seamlessly repainted. New 80x80mm Vimar switch installed at ~110cm.",
    "8. Scene integrity: no objects invented (curtains/lamps/plants/switches that weren't in Image 1). No reference swatches pasted as scene elements.",
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

  if (referenceLegend) {
    blocks.LEGEND = referenceLegend;
  }

  // v8.6.9 — PRIORITY OVERRIDE per Sash Count Change.
  // Quando l'utente chiede una trasformazione strutturale (es. 2 ante → 1 anta),
  // OpenAI gpt-image-1 e Gemini tendono a preservare la geometria della source
  // e ignorare le 32KB di prompt sottostanti. Soluzione: promuovere LA
  // TRASFORMAZIONE come PRIMARY TASK in cima ASSOLUTA al prompt, prima di
  // qualsiasi altra istruzione, con linguaggio ultra-diretto stile ChatGPT
  // base ("transform 2 sashes into 1 single panel"). Brevità = priorità.
  const compositionChangeSpecs = normalizedConfig.technical_specification
    .filter((s) => s.compositionChange)
    .map((s) => s.compositionChange!);
  const primarySpec = normalizedConfig.technical_specification[0];
  const priorityLines: string[] = [];

  // 1. Sash count change (v8.6.9)
  if (compositionChangeSpecs.length > 0) {
    const c = compositionChangeSpecs[0];
    const verb = c.toSashCount < c.fromSashCount ? "REMOVE" : "ADD";
    const diff = Math.abs(c.fromSashCount - c.toSashCount);
    const resultDesc = c.toSashCount === 1
      ? "ONE single full-width glass panel filling the entire opening (no mullion, no division)"
      : `${c.toSashCount} equal-width glass panels separated by ${c.toSashCount - 1} vertical mullion(s)`;
    priorityLines.push(
      `▶ SASH COUNT: source has ${c.fromSashCount} sashes, NEW window MUST have EXACTLY ${c.toSashCount} sashes. ` +
        `${verb} ${diff} vertical mullion${diff > 1 ? "s" : ""}. Result: ${resultDesc}.`,
    );
  }

  // 2. Nodo asimmetrico / Maniglia centrale (v8.6.19) — bug reale:
  //    OpenAI/Gemini tendono a renderizzare un nodo simmetrico classico
  //    (~110mm doppio montante) anche quando spec.reducedNode=true.
  //    Promosso a PRIMARY TASK con descrizione visuale esplicita.
  if (primarySpec?.centralHandle) {
    const profileId = primarySpec.profileId.toLowerCase();
    const isAluMinimal = profileId === "minimal" || profileId === "alluminio";
    const slimRange = isAluMinimal ? "~30-40mm" : "~50-60mm";
    priorityLines.push(
      `▶ CENTRAL HANDLE (palettone slim): the central vertical mullion MUST be DRAMATICALLY SLIM (${slimRange} wide, NOT 110mm) ` +
        "with ONE single handle mounted at its geometric center. Glass area dominates the visual field. " +
        "This is NOT a classic doubled mullion — it is a slim palettone with central handle. " +
        "This composition is valid for PVC, aluminum and minimal/legno-aluminum frames alike (NOT only aluminum).",
    );
  } else if (primarySpec?.reducedNode) {
    const profileId = primarySpec.profileId.toLowerCase();
    const isAluMinimal = profileId === "minimal" || profileId === "alluminio";
    const slimRange = isAluMinimal ? "~50mm" : "~70mm";
    priorityLines.push(
      `▶ ASYMMETRIC REDUCED NODE (palettone+palettino): the central vertical meeting point MUST be a SLIM SINGLE STILE (${slimRange} wide, NOT a doubled 110mm mullion). ` +
        "The primary sash is visibly WIDER than the secondary sash. The palettone covers the palettino. Glass area increases vs symmetric profile. " +
        "Do NOT render the classic balanced doubled mullion — render a thin asymmetric meeting stile. " +
        "This slim asymmetric node is valid for PVC, aluminum and minimal/legno-aluminum frames alike (NOT only aluminum).",
    );
  }

  // 3. Tapparella nuovo colore (v8.6.19) — bug reale: il modello spesso
  //    mantiene il colore originale tapparella o usa il colore frame come
  //    default invece di applicare il colore specifico richiesto.
  if (primarySpec?.shutter.replace && primarySpec.shutter.colorLabel) {
    const isCustomColor = !primarySpec.shutter.colorLabel.toLowerCase().includes("wood-effect") &&
      !primarySpec.shutter.colorLabel.toLowerCase().includes(primarySpec.finish.name.toLowerCase());
    if (isCustomColor) {
      priorityLines.push(
        `▶ TAPPARELLA NEW COLOR: the roller shutter slats MUST be rendered in "${primarySpec.shutter.colorLabel}". ` +
          `This is a DIFFERENT color from the frame. Do NOT default to the frame color or the original shutter color. ` +
          `If shutter slats are visible (top recessed band or partially lowered), they MUST show this specific color.`,
      );
    }
  }

  let priorityOverride = "";
  if (priorityLines.length > 0) {
    priorityOverride = `[🚨 PRIMARY TASKS — READ FIRST, EXECUTE BEFORE EVERYTHING ELSE 🚨]

The following structural/visual changes are NON-NEGOTIABLE. Models tend to ignore them when buried in long prompts, so they are stated FIRST and BRIEF:

${priorityLines.join("\n\n")}

These tasks have ABSOLUTE PRIORITY over everything else (color matching, handle finish, cassonetto styling, lighting realism). If you fail any of them, the render is unusable for the customer regardless of other quality.`;
  }

  const userPrompt = [
    priorityOverride, // v8.6.9 — Sash count change override (top abs)
    referenceLegend, // v8.3.3 — IMAGE INPUTS LEGEND
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
    referenceImages: referenceImages.map((r) => ({
      kind: r.kind,
      label: r.label,
      filename: r.filename,
      url: r.url,
    })),
    // v8.6 — Negative prompt LEAN: solo pattern STILISTICI univoci.
    // Le regole semantiche (recolor, lateral stiles, handle, cinghia, cassonetto,
    // oggetti inventati, swatch) sono gia' in BLOCK A. Qui solo cio' che il
    // modello tende a fare per default e che il prompt user-side non copre.
    negativePrompt:
      "cartoon, illustration, painterly, fake CGI, glossy fake plastic, " +
      "staged showroom look, AI interior restyling, beautified beyond photographic realism, " +
      "warped geometry, floating elements, wrong shadows, distorted lines, " +
      "changed perspective, changed crop, changed wall color, changed furniture, " +
      "extra windows or doors, mixed hinge colors, oversized cassonetto, " +
      // v8.6.5 — Composition change ignorata (sash count mismatch)
      "keeping 2 sashes when 1 sash is specified, " +
      "keeping 3 sashes when 2 sashes are specified, " +
      "keeping 1 sash when 2 sashes are specified, " +
      "preserving the source photo sash count instead of applying the requested composition change, " +
      "phantom central mullion remaining when sash count was reduced, " +
      "phantom additional mullion missing when sash count was increased, " +
      // v8.6.4 — Atmosfera/luminosita' esterna
      "darkened outdoor view, dimmed natural daylight through the new glass, " +
      "outdoor view muted or desaturated compared to source, " +
      "cinematic teal-orange grading applied to outdoor scene, " +
      "dusk or overcast atmosphere added when source shows bright daylight, " +
      "tinted glazing that reduces outdoor luminosity, " +
      "moody dark-blue tone over the outdoor view that was not in the source, " +
      "floating shutter band above the glazing, shutter rendered in front of the wall, " +
      "old window simply recolored, old handle silhouette preserved, " +
      "lateral stiles in old color while front face is new color, " +
      "residual dark rectangles in upper sashes from old muntins, " +
      "manual belt cord winder rod or wall-plate visible on motorized installation, " +
      "old cassonetto recolored, visible gap or shadow seam between cassonetto and window top, " +
      "rustic wood-textured cassonetto when modern PVC unit is specified, " +
      "screwed butt-joint corners on PVC frame, visible screws at frame corners, " +
      "round LED disk or sensor or smoke detector pasted on window sash or glazing, " +
      "decorative sticker or logo on glass, electronic device drawn on top of glazing, " +
      "swatch sample rectangle or product reference pasted inside the rendered scene, " +
      "curtains lamps plants pictures sensors invented in the room, " +
      "old paint outline or halo around the new frame, " +
      "phantom shadows of the previous installation",
    promptVersion: "8.6.19",
    blocks,
    validation,
    normalizedConfig,
  };
}
