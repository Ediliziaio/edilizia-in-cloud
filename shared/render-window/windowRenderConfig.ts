// shared/render-window/windowRenderConfig.ts — v8 (2026-05-14)
// CHANGELOG v8:
//   ↺ mapProfiloToMateriale: PVC 80mm vs ALU 55mm, alluminio_slim per minimal
//   ↺ Aggiunta profileVisibleThickness + thermalBreakVisible
//   + computeHingeSpec(): regola posizionamento cerniere + supporto hidden hinges
//   + buildTransomRule(): regola traverso portafinestra
//   + buildCompositionChange(): regola cambio numero ante
//   + buildElectricButton(): bottone tapparella elettrica
//   ↺ buildTechnicalSpecifications: integra tutte le nuove regole

import {
  findWizardRal,
  findWizardWood,
  getWizardCassonettoMeta,
  getWizardHardwareMeta,
  getWizardHandleTypeMeta,
  getWizardTapparellaMeta,
  profileSupportsAsymmetricNode,
  profileSupportsHiddenHinges,
  type WizardCassMat,
  type WizardCerniere,
  type WizardHandleType,
  type WizardHw,
  type WizardNodo,
  type WizardProfilo,
  type WizardState,
  type WizardTapp,
  type WizardTipo,
  type WizardTraverso,
} from "./catalog.ts";
import { buildElectricButtonFragment } from "./promptFragments.ts";
import type {
  WindowHingeMode,
  WindowMaterial,
  WindowOpeningType,
  WindowPhotoMeta,
  WindowRenderConfig,
  WindowSceneAnalysis,
  WindowSceneOpening,
  WindowTechnicalSpecification,
} from "./types.ts";
import { normalizeWindowSceneAnalysis, createWindowTargetSelection } from "./windowSceneAnalysis.ts";
import { buildWindowReplacementManifest } from "./windowReplacementRules.ts";

export interface WindowRenderBuildOptions {
  notes?: string;
  sceneAnalysis?: unknown;
  selectedOpeningIds?: string[] | null;
  photoMeta?: WindowPhotoMeta | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tipologie e profili — v8 con misure precise
// ─────────────────────────────────────────────────────────────────────────────

function mapTipoToApertura(tipo: WizardTipo): {
  apertura: WindowOpeningType;
  num_ante: number;
  desiredElement: WindowTechnicalSpecification["desiredElement"];
} {
  switch (tipo) {
    case "F1A": return { apertura: "battente_1_anta", num_ante: 1, desiredElement: "window" };
    case "F2A": return { apertura: "battente_2_ante", num_ante: 2, desiredElement: "window" };
    case "F3A": return { apertura: "battente_3_ante", num_ante: 3, desiredElement: "window" };
    case "PF1A": return { apertura: "portafinestra", num_ante: 1, desiredElement: "door_window" };
    case "PF2A": return { apertura: "portafinestra", num_ante: 2, desiredElement: "door_window" };
    case "PF3A": return { apertura: "portafinestra", num_ante: 3, desiredElement: "door_window" };
    case "SCORR": return { apertura: "scorrevole_alzante", num_ante: 2, desiredElement: "sliding_panel" };
  }
}

interface ProfileMapping {
  materiale: Exclude<WindowMaterial, "unknown">;
  stile_telaio: string;
  profilo_dim: string;
  profilo_forma: string;
  slimness: string;
  profileVisibleThickness: string;
  thermalBreakVisible: boolean;
}

function mapProfiloToMateriale(profilo: WizardProfilo): ProfileMapping {
  switch (profilo) {
    case "pvc":
      return {
        materiale: "pvc",
        stile_telaio: "europeo_classico",
        profilo_dim: "80mm",
        profilo_forma: "europeo",
        slimness: "balanced residential sightline",
        profileVisibleThickness: "80-90mm outer, 110mm central mullion",
        thermalBreakVisible: false,
      };
    case "alluminio":
      return {
        materiale: "alluminio",
        stile_telaio: "alluminio_slim",
        profilo_dim: "55mm",
        profilo_forma: "squadrato",
        slimness: "slim architectural sightline",
        profileVisibleThickness: "50-60mm outer, 60-70mm central mullion",
        thermalBreakVisible: true,
      };
    case "minimal":
      return {
        materiale: "alluminio",
        stile_telaio: "minimal_squadrato",
        profilo_dim: "45mm",
        profilo_forma: "squadrato",
        slimness: "very slim minimal sightline",
        profileVisibleThickness: "45-55mm outer, 45mm central mullion",
        thermalBreakVisible: true,
      };
    case "legno":
      return {
        materiale: "legno",
        stile_telaio: "classico_arrotondato",
        profilo_dim: "82mm",
        profilo_forma: "arrotondato",
        slimness: "warmer traditional sightline",
        profileVisibleThickness: "82-90mm outer, 100mm central mullion",
        thermalBreakVisible: false,
      };
    case "legno_alluminio":
      return {
        materiale: "legno_alluminio",
        stile_telaio: "europeo_classico",
        profilo_dim: "82mm",
        profilo_forma: "europeo",
        slimness: "premium hybrid sightline",
        profileVisibleThickness: "82mm interior wood, 50mm exterior aluminum cladding",
        thermalBreakVisible: true,
      };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Finiture, hardware, cassonetto, tapparella — invariato dalla v7 (tranne v8 marker)
// ─────────────────────────────────────────────────────────────────────────────

function mapFrameFinish(colorId: string) {
  const wood = findWizardWood(colorId);
  if (wood) {
    return {
      mode: "legno" as const,
      name: wood.nome,
      ral: null,
      hex: wood.hex,
      finish: "wood-grain textured surface",
      woodEffectId: wood.id,
      promptFragment: wood.fragment,
    };
  }
  const ral = findWizardRal(colorId) ?? findWizardRal("9016");
  return {
    mode: "ral" as const,
    name: ral?.nome ?? "Bianco Traffico",
    // v8.3: id ora ha formato `<code>_<nome>` (es. "1009_grigio_ardesia").
    // Per il prompt usiamo il `code` numerico Renolit/RAL puro quando esiste.
    // Fallback "9016" mantiene backward-compat per preventivi storici.
    ral: ral?.code ?? "9016",
    hex: ral?.hex ?? "#F1F0EA",
    finish: "smooth matte finish",
    woodEffectId: null,
    promptFragment: null,
  };
}

function mapHardware(hwId: WizardHw, handleTypeId: WizardHandleType, openingType: WindowOpeningType) {
  const meta = getWizardHardwareMeta(hwId);
  const handleMeta = getWizardHandleTypeMeta(handleTypeId);
  const resolvedHandleStyle = openingType.includes("scorrevole")
    ? "alzante"
    : handleTypeId === "alzante"
      ? "classica_dritta"
      : handleMeta.id;
  return {
    handleStyle: resolvedHandleStyle,
    handleFinish: meta.finish,
    handleColorId: meta.id,
    hingeFinish:
      hwId === "nero_opaco" ? "matte black"
      : hwId === "bronzo" ? "antique bronze"
      : hwId === "oro" ? "polished gold"
      : hwId === "inox" ? "brushed stainless steel"
      : hwId === "titanio" ? "titanium anodized"
      : "polished chrome",
    hardwarePayload: {
      maniglia_stile: resolvedHandleStyle,
      colore_hardware_id: meta.hw_id,
      colore_hardware_finish: meta.finish,
    },
    cerniereColor:
      hwId === "nero_opaco" ? "nero_opaco"
      : hwId === "bronzo" ? "bronzo"
      : hwId === "oro" ? "oro"
      : hwId === "inox" ? "inox"
      : "argento",
  };
}

function mapCassonetto(state: WizardState, finish: ReturnType<typeof mapFrameFinish>) {
  if (!state.cass) {
    return {
      replace: false,
      payload: { azione: "mantieni" as const },
      materialLabel: "Keep existing cassonetto",
      colorMode: null,
      colorLabel: null,
    };
  }
  const meta = getWizardCassonettoMeta(state.cassMat);
  let material = "pvc_tradizionale";
  if (state.cassMat === "alluminio") material = "alluminio_coibentato";
  let colorMode: "ral" | "legno" = finish.mode;
  let colorLabel: string | null = null;
  if (state.cassMat === "pvc_bianco") {
    colorMode = "ral";
    colorLabel = "Bianco Traffico (RAL 9016)";
  } else if (state.cassMat === "colore_custom") {
    const custom = findWizardRal(state.cassCol);
    colorMode = "ral";
    colorLabel = custom ? `${custom.nome} (RAL ${custom.id})` : null;
  } else {
    colorLabel = finish.mode === "legno"
      ? `${finish.name} wood-effect`
      : `${finish.name}${finish.ral ? ` (RAL ${finish.ral})` : ""}`;
  }
  return {
    replace: true,
    payload: { azione: "sostituisci" as const, materiale: material, colore_mode: colorMode },
    materialLabel: meta.label,
    colorMode,
    colorLabel,
  };
}

function mapTapparella(state: WizardState, finish: ReturnType<typeof mapFrameFinish>) {
  if (state.tapp === "no") {
    return {
      replace: false,
      isMotorized: false,
      payload: { azione: "mantieni" as const },
      colorMode: null,
      colorLabel: null,
    };
  }
  const meta = getWizardTapparellaMeta(state.tapp);
  const custom = state.tappCol !== "stesso" ? findWizardRal(state.tappCol) : null;
  const colorMode: "ral" | "legno" = custom ? "ral" : finish.mode;
  const colorLabel = custom
    ? `${custom.nome} (RAL ${custom.id})`
    : finish.mode === "legno"
      ? `${finish.name} wood-effect`
      : `${finish.name}${finish.ral ? ` (RAL ${finish.ral})` : ""}`;
  return {
    replace: true,
    isMotorized: state.tapp === "motorizzate",
    payload: {
      azione: "sostituisci" as const,
      materiale: "pvc_avvolgibile",
      cinghia: state.tapp === "motorizzate" ? "senza_cinghia" : "con_cinghia",
      colore_mode: colorMode,
    },
    label: meta.label,
    colorMode,
    colorLabel,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers prompt rule
// ─────────────────────────────────────────────────────────────────────────────

function ensureSentence(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function describeManualControlPlacement(opening: WindowSceneOpening): string {
  switch (opening.beltPlacement) {
    case "right_wall": return "on the right wall beside the opening";
    case "left_wall": return "on the left wall beside the opening";
    case "right_reveal": return "on the right reveal beside the opening";
    case "left_reveal": return "on the left reveal beside the opening";
    case "center": return "near the centerline of the opening";
    default: return "near the opening side wall/reveal";
  }
}

function buildManualControlCleanupRule(opening: WindowSceneOpening, isMotorized: boolean): string | null {
  if (!isMotorized || (!opening.hasBelt && !opening.hasBeltBox)) return null;
  const placement = describeManualControlPlacement(opening);
  const note = ensureSentence(opening.beltPlacementNotes || `manual control is visible ${placement}`);
  return (
    `Because the new shutter is motorized, remove the entire legacy manual shutter-control assembly ${placement}: ` +
    `belt/strap/cord, wall winder box or cover plate, belt exit slot and any remaining vertical guide/trim linked to ` +
    `the manual control. ${note} Then install a new electric switch plate at the SAME location, flush with the wall.`
  );
}

function buildCassonettoDimensionRule(opening: WindowSceneOpening, replaceCassonetto: boolean): string {
  if (!replaceCassonetto) {
    return "Keep the existing cassonetto dimensions, depth, visible height and lower reveal line exactly as photographed.";
  }
  if (opening.hasCassonetto) {
    return `${ensureSentence(opening.cassonettoGeometryNotes || "Keep the existing cassonetto envelope close to the source photo.")} Update finish/material only unless a different architecture is explicitly requested.`;
  }
  return "If a new cassonetto must appear, size it credibly around the existing opening with realistic installation depth and no oversized box.";
}

function buildShutterVisibilityRule(opening: WindowSceneOpening, replaceShutter: boolean) {
  if (!replaceShutter) {
    return {
      visibilityState: "match_existing" as const,
      placementRule: "Keep the existing shading system visibility state exactly as photographed.",
    };
  }
  if (opening.rollerCurtainState === "partially_lowered" || opening.rollerCurtainState === "fully_lowered") {
    return {
      visibilityState: opening.rollerCurtainState,
      placementRule: "Keep the shutter curtain recessed within the side guides and behind the frame/glass plane, matching a real installed roller shutter.",
    };
  }
  if (opening.rollerCurtainState === "top_recessed_band") {
    return {
      visibilityState: "top_recessed_band" as const,
      placementRule: "Only a very small recessed top shutter band may be visible, tucked behind the frame/glass plane and aligned within the guides. Never place a colored band in front of the wall or cassonetto.",
    };
  }
  return {
    visibilityState: "fully_raised_hidden" as const,
    placementRule: "Keep the shutter fully raised/open by default. Slats must stay hidden inside the cassonetto, with no visible colored band floating above the glass. If any shutter detail is visible, it must be recessed inside the guides behind the glass plane as in real life.",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// v8.2 — Compute handle spec: REGOLA UNIVERSALE numero maniglie
//
// In edilizia italiana il numero di maniglie visibili NON corrisponde MAI al
// numero di ante. La regola standard è:
//   - 1 anta              → 1 maniglia
//   - 2 ante (F2A/PF2A)   → 1 SOLA maniglia sull'anta principale (operativa).
//                           L'anta secondaria ha solo cricchetto interno,
//                           NESSUNA maniglia visibile.
//                           Variante "maniglia centrale": la maniglia singola
//                           sta sul palettone al centro invece che sull'anta.
//   - 3 ante (F3A/PF3A)   → 2 maniglie totali. Composizione tipica: gruppo
//                           a 2 ante (1 maniglia) + 1 anta singola (1 maniglia).
//   - 4 ante              → 2 maniglie totali (2 gruppi da 2 ante).
//
// Questa è una correzione critica: il modello AI tende a mettere una maniglia
// per anta (1 per anta = 2 su F2A, 3 su F3A), che è SBAGLIATO nella realtà
// italiana e produce render non vendibili.
// ─────────────────────────────────────────────────────────────────────────────

interface HandleSpec {
  /** Numero totale di maniglie da renderizzare visivamente. */
  handleCountVisible: number;
  /** Regola esplicita per il prompt builder. */
  handlePlacementRule: string;
}

function computeHandleSpec(args: {
  apertura: WindowOpeningType;
  numAnte: number;
  isCentralHandle: boolean;
  openingLabel: string;
}): HandleSpec {
  const { apertura, numAnte, isCentralHandle, openingLabel } = args;

  // Tipologie senza maniglia
  if (apertura === "fisso") {
    return {
      handleCountVisible: 0,
      handlePlacementRule: "Fixed light: NO handle anywhere.",
    };
  }

  // Scorrevoli: maniglia alzante dedicata, una per gruppo di ante mobili
  if (apertura.includes("scorrevole")) {
    const slidingHandles = Math.max(1, Math.floor(numAnte / 2));
    return {
      handleCountVisible: slidingHandles,
      handlePlacementRule:
        `Sliding system on opening ${openingLabel}: render ${slidingHandles} lift-and-slide handle${slidingHandles > 1 ? "s" : ""}, ` +
        `one per movable sash group. NO additional casement handles.`,
    };
  }

  // 1 anta → 1 maniglia laterale standard
  if (numAnte === 1) {
    return {
      handleCountVisible: 1,
      handlePlacementRule:
        `Single sash on opening ${openingLabel}: ONE handle on the operative side stile of the sash, ` +
        `mounted at the geometric vertical center of the sash (about 50% height).`,
    };
  }

  // 2 ante → SEMPRE 1 SOLA maniglia (sull'anta principale o sul palettone se centralHandle)
  if (numAnte === 2) {
    if (isCentralHandle) {
      return {
        handleCountVisible: 1,
        handlePlacementRule:
          `Two-sash composition on opening ${openingLabel} with CENTRAL-HANDLE configuration: ` +
          `render EXACTLY ONE single handle, mounted at the geometric vertical center of the ` +
          `central palettone (the meeting stile between the two sashes). ` +
          `Do NOT render a second handle anywhere. The secondary sash has only internal locking.`,
      };
    }
    return {
      handleCountVisible: 1,
      handlePlacementRule:
        `Two-sash composition on opening ${openingLabel}: render EXACTLY ONE single handle on ` +
        `the PRIMARY OPERATIVE SASH (typically the right sash for right-handed European windows; ` +
        `match the photographed swing direction of the source window). ` +
        `The SECONDARY SASH has NO visible handle — only an internal locking mechanism. ` +
        `THIS IS NON-NEGOTIABLE: do NOT render two handles on a two-sash window. ` +
        `Italian residential standard.`,
    };
  }

  // 3 ante → 2 maniglie totali (gruppo 2-ante + anta singola)
  if (numAnte === 3) {
    return {
      handleCountVisible: 2,
      handlePlacementRule:
        `Three-sash composition on opening ${openingLabel}: render EXACTLY TWO handles total, NOT three. ` +
        `Standard Italian configuration: the three sashes are subdivided into ONE 2-sash group + ONE single sash. ` +
        `Place ONE handle on the primary sash of the 2-sash group (typically the inner sash of the group, ` +
        `adjacent to the single sash) and ONE handle on the single sash. ` +
        `The remaining sash (secondary of the 2-sash group) has NO visible handle, only internal locking. ` +
        `Match the photographed sash grouping if visible; otherwise default to 2+1 grouping ` +
        `(2-sash on one side, 1 single sash on the other side).`,
    };
  }

  // 4 ante → 2 maniglie totali (due gruppi da 2 ante)
  if (numAnte === 4) {
    return {
      handleCountVisible: 2,
      handlePlacementRule:
        `Four-sash composition on opening ${openingLabel}: render EXACTLY TWO handles total, NOT four. ` +
        `Standard Italian configuration: the four sashes are subdivided into TWO 2-sash groups. ` +
        `Place ONE handle on the primary sash of each group. ` +
        `The other two secondary sashes have NO visible handle, only internal locking.`,
    };
  }

  // Fallback per >4 ante (raro): metà delle ante hanno la maniglia
  const handles = Math.max(1, Math.ceil(numAnte / 2));
  return {
    handleCountVisible: handles,
    handlePlacementRule:
      `Multi-sash composition (${numAnte} sashes) on opening ${openingLabel}: render EXACTLY ${handles} handles total. ` +
      `Group sashes into 2-sash groups (where possible) plus residual single sashes, and place ONE handle per group. ` +
      `Secondary sashes within each 2-sash group have NO visible handle.`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// v8 — Compute hinge spec corretto per portafinestre e supporto hidden hinges
// ─────────────────────────────────────────────────────────────────────────────

interface HingeSpec {
  hingeMode: WindowHingeMode;
  hingesPerSash: 0 | 2 | 3;
  hingeCountVisible: number;
  hingePlacementRule: string;
  hingeConsistencyRule: string;
  hingeStyle: string;
}

function computeHingeSpec(args: {
  apertura: WindowOpeningType;
  numAnte: number;
  opening: WindowSceneOpening | undefined;
  cerniereChoice: WizardCerniere;
  profileId: WizardProfilo;
  handleFinish: string;
  openingLabel: string;
}): HingeSpec {
  const { apertura, numAnte, opening, cerniereChoice, profileId, handleFinish, openingLabel } = args;

  // Sliding e fixed: nessuna cerniera visibile, indipendentemente dalla scelta
  if (apertura.includes("scorrevole")) {
    return {
      hingeMode: "none",
      hingesPerSash: 0,
      hingeCountVisible: 0,
      hingePlacementRule: "Sliding system: NO visible side hinges. Use sliding tracks at top and bottom only.",
      hingeConsistencyRule: "Do not render any side hinges or battente hinge geometry on a sliding system.",
      hingeStyle: "no visible side hinges because the system is sliding",
    };
  }
  if (apertura === "fisso") {
    return {
      hingeMode: "none",
      hingesPerSash: 0,
      hingeCountVisible: 0,
      hingePlacementRule: "Fixed light: NO visible hinges anywhere.",
      hingeConsistencyRule: "Do not render any hinges on a fixed light.",
      hingeStyle: "no visible hinges",
    };
  }

  // Cerniere a scomparsa richieste E profilo compatibile
  const hiddenRequested = cerniereChoice === "scomparsa";
  const hiddenSupported = profileSupportsHiddenHinges(profileId);

  if (hiddenRequested && hiddenSupported) {
    return {
      hingeMode: "hidden",
      hingesPerSash: 0,
      hingeCountVisible: 0,
      hingePlacementRule:
        "HIDDEN HINGES: NO visible hinge knuckles, caps, or cylinders on the hinged side stile. " +
        "The sash side appears clean and continuous. The hinge mechanism is fully concealed inside " +
        "the frame profile when the window is closed.",
      hingeConsistencyRule:
        "Maintain pixel-clean side stiles. Do not render any decorative hinge elements.",
      hingeStyle: "hidden (concealed inside the frame, no visible hardware)",
    };
  }

  // Cerniere visibili — calcolo posizione e numero
  // Portafinestra: 2 per anta (top + bottom), 3 solo se extra-alta (>2.4m stimato)
  const isPortafinestra = apertura === "portafinestra";
  const estimatedH = opening?.estimatedHeightCm ?? 0;
  const isExtraTall = isPortafinestra && estimatedH > 240;
  const perSash: 2 | 3 = isExtraTall ? 3 : 2;

  const placementDescription = perSash === 3
    ? "top (15cm from frame top), middle (geometric vertical center), bottom (15cm from frame bottom)"
    : isPortafinestra
      ? "top (15cm from frame top) and bottom (15cm from frame bottom)"
      : "top (10cm from sash top) and bottom (10cm from sash bottom)";

  const hingePlacementRule =
    `${isPortafinestra ? "Door-window (portafinestra)" : "Casement window"} hinge layout for opening ${openingLabel}: ` +
    `EXACTLY ${perSash} compact European hinges per sash, positioned at ${placementDescription} on the hinged side stile. ` +
    `Total visible hinges on the entire composition: ${perSash * numAnte}. ` +
    `DO NOT add extra hinges. DO NOT cluster hinges at top alone. DO NOT mirror hinges on the non-hinged stile.`;

  const hingeConsistencyRule =
    `All visible hinges on opening ${openingLabel} MUST have the exact same ${handleFinish} finish as the handle, ` +
    `with identical compact knuckle geometry top-to-bottom. No mixed black/dark hinge parts. ` +
    `No oversized industrial hinges — keep compact residential European proportions.`;

  return {
    hingeMode: "visible",
    hingesPerSash: perSash,
    hingeCountVisible: perSash * numAnte,
    hingePlacementRule,
    hingeConsistencyRule,
    hingeStyle: "compact European residential hinges aligned on the outer stiles with realistic proportions",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// v8 — Composition change rule (3 ante → 2 ante etc.)
// ─────────────────────────────────────────────────────────────────────────────

function buildCompositionChange(
  opening: WindowSceneOpening | undefined,
  desiredSashCount: number,
): WindowTechnicalSpecification["compositionChange"] {
  if (!opening) return null;
  const from = opening.sashCount;
  const to = desiredSashCount;
  if (from === to) return null;

  if (from > to) {
    return {
      fromSashCount: from,
      toSashCount: to,
      instruction:
        `REMOVE ${from - to} central vertical mullion(s) and redistribute the glazing into ${to} ` +
        `panels of approximately equal width within the SAME original opening width. ` +
        `Do NOT shrink the wall opening. Do NOT change the outer frame perimeter. ` +
        `The result must occupy the same hole in the wall, just with fewer subdivisions.`,
    };
  }

  return {
    fromSashCount: from,
    toSashCount: to,
    instruction:
      `ADD ${to - from} new vertical mullion(s) to subdivide the opening into ${to} sashes of ` +
      `approximately equal width. Do NOT enlarge the wall opening. Use the new mullion(s) in the ` +
      `same material and finish as the outer frame.`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// v8 — Transom rule (traverso portafinestra)
// ─────────────────────────────────────────────────────────────────────────────

function buildTransomRule(
  opening: WindowSceneOpening | undefined,
  apertura: WindowOpeningType,
  desiredElement: WindowTechnicalSpecification["desiredElement"],
  traverso: WizardTraverso,
): string | null {
  // Solo per portafinestre
  if (apertura !== "portafinestra" && desiredElement !== "door_window") return null;

  const hasExisting = opening?.hasHorizontalTransom ?? false;
  const existingPos = opening?.transomPositionPct ?? 50;
  const panelBelow = opening?.transomPanelBelowType ?? "unknown";

  switch (traverso) {
    case "auto":
      return hasExisting
        ? `Keep the existing horizontal transom at ~${existingPos}% height exactly as photographed. ` +
          `Below the transom: ${panelBelow === "solid_panel" ? "keep the existing solid panel" : "clear glass"}.`
        : `No transom present in source — keep the door-window as a single full-height glazed sash composition.`;

    case "keep" as WizardTraverso:
    case "mantieni":
      return hasExisting
        ? `Keep the existing horizontal transom at ${existingPos}% height with the same panel-below configuration (${panelBelow}).`
        : `Add a horizontal transom at 50% height with clear glass both above and below.`;

    case "remove" as WizardTraverso:
    case "rimuovi":
      return (
        `REMOVE the horizontal transom entirely. The door-window must become a SINGLE full-height ` +
        `glazed sash per anta, with NO horizontal divider in the middle. Replace the area below the ` +
        `former transom with continuous clear glass from the top of the door to the bottom rail. ` +
        `The result must look like a modern frameless full-height glazed door-window.`
      );

    case "add" as WizardTraverso:
    case "aggiungi":
      return (
        `Add a horizontal transom at approximately 50% height. The transom is a horizontal frame ` +
        `element in the same material and finish as the outer frame. Above: clear glass. Below: clear glass.`
      );

    default:
      return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// v8 — Electric button per tapparella motorizzata
// ─────────────────────────────────────────────────────────────────────────────

function buildElectricButton(
  opening: WindowSceneOpening | undefined,
  isMotorized: boolean,
): WindowTechnicalSpecification["shutter"]["electricButton"] | undefined {
  if (!isMotorized || !opening) return undefined;
  if (!opening.hasBelt && !opening.hasBeltBox) {
    // Tapparella già motorizzata, niente cinghia da rimuovere → niente bottone nuovo
    return undefined;
  }
  const side: "left" | "right" =
    opening.beltPlacement.includes("right") ? "right"
    : opening.beltPlacement.includes("left") ? "left"
    : "right";  // default su lato destro

  return {
    install: true,
    side,
    heightFromFloor: "110cm",
    style: "match_room_switches",
    description: buildElectricButtonFragment("match_room_switches"),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Costruzione tecnica specifiche (v8)
// ─────────────────────────────────────────────────────────────────────────────

function buildTechnicalSpecifications(
  state: WizardState,
  sceneAnalysis: WindowSceneAnalysis,
  selectedOpeningIds: string[],
): { technicalSpecifications: WindowTechnicalSpecification[]; nuovoInfisso: Record<string, unknown>; aperturaDefault: WindowOpeningType } {
  const finish = mapFrameFinish(state.coloreInfisso);
  const base = mapTipoToApertura(state.tipo as WizardTipo);
  const profilo = mapProfiloToMateriale(state.profilo as WizardProfilo);
  const hardware = mapHardware(state.coloreHw, state.tipoManiglia, base.apertura);
  const cassonetto = mapCassonetto(state, finish);
  const tapparella = mapTapparella(state, finish);

  // v8.1 — Risoluzione "stile telaio" (in realtà = stile NODO + stile PROFILO unificati).
  // Il prompt builder gestisce sia il telaio (profilo struttura) sia il nodo (composizione ante).
  // Per backward-compat con sessioni v7 che usavano `manigliaCentrale: true` senza `nodo`,
  // forziamo nodo = "maniglia_centrale" quando manigliaCentrale è true (e profilo è compatibile).
  const effectiveNodo: WizardNodo =
    state.nodo
    ?? (state.manigliaCentrale && profileSupportsAsymmetricNode(state.profilo as WizardProfilo)
      ? "maniglia_centrale"
      : "simmetrico");

  // Il nodo asimmetrico / maniglia_centrale ha senso solo su 2 ante.
  const isTwoSash = base.num_ante === 2;
  const resolvedNodo: WizardNodo = isTwoSash ? effectiveNodo : "simmetrico";

  // Lo "stile telaio" v8.1 distingue il NODO (chi vince visivamente al centro)
  // dal PROFILO (materiale e spessore). Manteniamo `stileTelaio` come ID utile
  // al prompt builder per scegliere il fragment, ma separato dal profilo material.
  const stileTelaio: string =
    resolvedNodo === "maniglia_centrale" ? "nodo_asimmetrico_maniglia_centrale"
    : resolvedNodo === "asimmetrico" ? "nodo_asimmetrico"
    : profilo.stile_telaio;  // simmetrico → usa il default del profilo (europeo_classico, alluminio_slim, etc.)

  const targetOpenings = sceneAnalysis.openings.filter((o) => selectedOpeningIds.includes(o.id));

  const technicalSpecifications: WindowTechnicalSpecification[] = targetOpenings.map((opening) => {
    const hingeSpec = computeHingeSpec({
      apertura: base.apertura,
      numAnte: base.num_ante,
      opening,
      cerniereChoice: state.cerniere,
      profileId: state.profilo as WizardProfilo,
      handleFinish: hardware.handleFinish,
      openingLabel: opening.label,
    });

    // v8.2 — Regola universale numero maniglie
    const handleSpec = computeHandleSpec({
      apertura: base.apertura,
      numAnte: base.num_ante,
      isCentralHandle: resolvedNodo === "maniglia_centrale",
      openingLabel: opening.label,
    });

    const compositionChange = buildCompositionChange(opening, base.num_ante);
    const transomRule = buildTransomRule(opening, base.apertura, base.desiredElement, state.traverso);
    const electricButton = buildElectricButton(opening, tapparella.isMotorized);

    return {
      openingId: opening.id,
      openingLabel: opening.label,
      desiredTypeId: state.tipo as WizardTipo,
      desiredOpeningType: base.apertura,
      desiredSashCount: base.num_ante,
      desiredElement: base.desiredElement,
      material: profilo.materiale,
      profileId: state.profilo as WizardProfilo,
      frameStyle: stileTelaio,
      frameDepthLabel: profilo.profilo_dim,
      frameShape: profilo.profilo_forma,
      slimnessLabel: profilo.slimness,

      profileVisibleThickness: profilo.profileVisibleThickness,
      thermalBreakVisible: profilo.thermalBreakVisible,
      compositionChange,
      transomRule,
      hingeMode: hingeSpec.hingeMode,
      hingesPerSash: hingeSpec.hingesPerSash,

      finish,
      handleStyle: hardware.handleStyle,
      handleColorId: hardware.handleColorId as WizardHw,
      handleFinish: hardware.handleFinish,
      handleCountVisible: handleSpec.handleCountVisible,
      handlePlacementRule: handleSpec.handlePlacementRule,
      hingeFinish: hardware.hingeFinish,
      hingeStyle: hingeSpec.hingeStyle,
      hingeConsistencyRule: hingeSpec.hingeConsistencyRule,
      hingePlacementRule: hingeSpec.hingePlacementRule,
      hingeCountVisible: hingeSpec.hingeCountVisible,

      manualControlCleanupRule: buildManualControlCleanupRule(opening, tapparella.isMotorized),
      reducedNode: resolvedNodo !== "simmetrico",
      centralHandle: resolvedNodo === "maniglia_centrale",

      glassSpec: "double glazed clear low-iron glass with realistic gasket lines",

      cassonetto: {
        replace: cassonetto.replace,
        materialId: cassonetto.replace ? (state.cassMat as WizardCassMat) : null,
        materialLabel: cassonetto.materialLabel,
        colorMode: cassonetto.colorMode,
        colorLabel: cassonetto.colorLabel,
        dimensionRule: buildCassonettoDimensionRule(opening, cassonetto.replace),
      },
      shutter: {
        mode: state.tapp as WizardTapp,
        replace: tapparella.replace,
        colorMode: tapparella.colorMode,
        colorLabel: tapparella.colorLabel,
        isMotorized: tapparella.isMotorized,
        ...buildShutterVisibilityRule(opening, tapparella.replace),
        electricButton,
      },

      compatibilityNotes: [
        opening.hasCurtains ? "Preserve existing curtains exactly." : null,
        opening.radiatorNearby ? "Preserve nearby radiator and its spacing relationship with the opening." : null,
        opening.hasGrates ? "Keep existing grates unless explicitly stated otherwise." : null,
        opening.hasPersiane ? "Keep existing external shutters unless explicitly stated otherwise." : null,
        buildManualControlCleanupRule(opening, tapparella.isMotorized),
        tapparella.replace && opening.rollerCurtainState !== "partially_lowered" && opening.rollerCurtainState !== "fully_lowered"
          ? "If the source photo does not show a lowered shutter curtain, keep the new shutter fully open with slats hidden in the cassonetto; do not invent a colored strip above the glazing."
          : null,
        tapparella.replace
          ? "Any visible shutter curtain must stay recessed within the guides behind the frame/glass plane, never floating on the wall surface."
          : null,
        cassonetto.replace && opening.hasCassonetto
          ? "Keep the cassonetto very close to the original visible size, depth and lower edge line; do not oversize it."
          : null,
        base.apertura.includes("scorrevole") ? "Use sliding geometry only; do not invent battente hinges." : null,
        state.profilo === "minimal" ? "Use slimmer sightlines and a wider perceived glazed area." : null,
        compositionChange ? `Composition changes from ${compositionChange.fromSashCount} to ${compositionChange.toSashCount} sashes — keep the same wall opening width.` : null,
      ].filter((item): item is string => Boolean(item)),
    };
  });

  const nuovoInfisso = {
    materiale: profilo.materiale,
    stile_telaio: stileTelaio,
    num_ante: base.num_ante,
    colore: {
      nome: finish.name,
      ral: finish.ral ?? undefined,
      hex: finish.hex ?? undefined,
      finitura: finish.finish,
    },
    colore_mode: finish.mode,
    colore_wood_effect: finish.woodEffectId
      ? { id: finish.woodEffectId, name: finish.name, prompt_fragment: finish.promptFragment }
      : null,
    profilo: { dimensione: profilo.profilo_dim, forma: profilo.profilo_forma },
    vetro: { tipo: "trasparente", prompt_fragment: "double glazed clear glass" },
    ferramenta: hardware.hardwarePayload,
    cerniere: {
      tipo: state.cerniere === "scomparsa" ? "scomparsa" : "europea",
      colore: hardware.cerniereColor,
      modo: state.cerniere,
    },
    nodo_mode: resolvedNodo,
    traverso_mode: state.traverso,
    sostituzione: {
      infissi: true,
      cassonetto: cassonetto.replace,
      tapparella: tapparella.replace,
    },
    cassonetto: cassonetto.payload,
    tapparella: tapparella.payload,
    cass_colore_mode: cassonetto.colorMode,
    cass_colore: cassonetto.colorLabel ? { name: cassonetto.colorLabel } : null,
    tap_colore_mode: tapparella.colorMode,
    tap_colore: tapparella.colorLabel ? { name: tapparella.colorLabel } : null,
    scope_mode:
      selectedOpeningIds.length === sceneAnalysis.openings.length ? "all_visible"
      : selectedOpeningIds.length === 1 ? "single_target"
      : "multi_target",
    target_opening_ids: selectedOpeningIds,
  };

  return { technicalSpecifications, nuovoInfisso, aperturaDefault: base.apertura };
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

export function buildWindowRenderConfig(state: WizardState, options: WindowRenderBuildOptions = {}): WindowRenderConfig {
  const sceneAnalysis = normalizeWindowSceneAnalysis(options.sceneAnalysis, options.photoMeta);
  const targetSelection = createWindowTargetSelection(sceneAnalysis, options.selectedOpeningIds);
  const { technicalSpecifications, nuovoInfisso, aperturaDefault } = buildTechnicalSpecifications(
    state,
    sceneAnalysis,
    targetSelection.selectedOpeningIds,
  );

  const provisional: WindowRenderConfig = {
    schema_version: "window_render_v2",
    notes: options.notes?.trim() ?? "",
    apertura_default: aperturaDefault,
    photo_meta: options.photoMeta ?? null,
    scene_analysis: sceneAnalysis,
    target_selection: targetSelection,
    technical_specification: technicalSpecifications,
    replacement_manifest: {} as WindowRenderConfig["replacement_manifest"],
    removal_rules: [],
    integrity_constraints: [],
    quality_directives: [
      "Professional architectural photorealistic replacement render quality bar.",
      "Same room, same camera angle, same geometry, same lighting direction, same furniture, same environment.",
      "Surgical infisso replacement only. No generic AI redesign.",
      "Exact same image format and orientation as the source photo.",
      "Numerical profile thickness values stated in the specification MUST be visually respected.",
    ],
    nuovo_infisso: nuovoInfisso,
  };

  const replacement_manifest = buildWindowReplacementManifest(provisional);

  return {
    ...provisional,
    replacement_manifest,
    removal_rules: replacement_manifest.removals.map((rule) => rule.summary),
    integrity_constraints: replacement_manifest.integrityConstraints,
  };
}

/** Backward-compat: rinormalizza una config v7 esistente nello schema v8. */
export function ensureWindowRenderConfig(
  rawConfig: Record<string, unknown>,
  rawAnalysis?: unknown,
  photoMeta?: WindowPhotoMeta | null,
): WindowRenderConfig {
  if (
    rawConfig?.schema_version === "window_render_v2" &&
    Array.isArray(rawConfig.technical_specification) &&
    rawConfig.scene_analysis
  ) {
    const sceneAnalysis = normalizeWindowSceneAnalysis(rawConfig.scene_analysis, photoMeta);
    const targetSelection = createWindowTargetSelection(
      sceneAnalysis,
      (rawConfig.target_selection as { selectedOpeningIds?: string[] } | undefined)?.selectedOpeningIds,
    );
    const normalized = rawConfig as unknown as WindowRenderConfig;

    const technicalSpecification: WindowTechnicalSpecification[] = normalized.technical_specification.map((spec) => {
      const opening = sceneAnalysis.openings.find((o) => o.id === spec.openingId);

      // Backfill v8/v8.2 fields se mancanti
      const fallbackHandleSpec = computeHandleSpec({
        apertura: spec.desiredOpeningType,
        numAnte: spec.desiredSashCount,
        isCentralHandle: Boolean(spec.centralHandle),
        openingLabel: spec.openingLabel,
      });

      const filled: WindowTechnicalSpecification = {
        ...spec,
        profileVisibleThickness: spec.profileVisibleThickness ?? "70-80mm outer, 100mm central mullion",
        thermalBreakVisible: spec.thermalBreakVisible ?? false,
        compositionChange: spec.compositionChange ?? buildCompositionChange(opening, spec.desiredSashCount),
        transomRule: spec.transomRule ?? null,
        hingeMode: spec.hingeMode ?? "visible",
        hingesPerSash: spec.hingesPerSash ?? (spec.desiredOpeningType.includes("scorrevole") ? 0 : 2),
        hingePlacementRule:
          spec.hingePlacementRule ??
          `Visible hinges: ${spec.hingeCountVisible ?? 2} total on the hinged stiles.`,
        handleCountVisible: spec.handleCountVisible ?? fallbackHandleSpec.handleCountVisible,
        handlePlacementRule: spec.handlePlacementRule ?? fallbackHandleSpec.handlePlacementRule,
      };

      // Backfill electric button quando motorizzato + cinghia rimossa
      if (filled.shutter.isMotorized && opening?.hasBelt && !filled.shutter.electricButton) {
        filled.shutter = {
          ...filled.shutter,
          electricButton: buildElectricButton(opening, true),
        };
      }

      return filled;
    });

    return {
      ...normalized,
      scene_analysis: sceneAnalysis,
      target_selection: targetSelection,
      photo_meta: photoMeta ?? normalized.photo_meta ?? null,
      technical_specification: technicalSpecification,
      removal_rules: Array.isArray(normalized.removal_rules) ? normalized.removal_rules : [],
      integrity_constraints: Array.isArray(normalized.integrity_constraints)
        ? normalized.integrity_constraints
        : normalized.replacement_manifest?.integrityConstraints ?? [],
      quality_directives: Array.isArray(normalized.quality_directives) ? normalized.quality_directives : [],
    };
  }

  // Legacy v1: lo riconvertiamo
  const sceneAnalysis = normalizeWindowSceneAnalysis(rawConfig.scene_analysis ?? rawAnalysis, photoMeta);
  return normalizeLegacyWindowConfig(rawConfig, sceneAnalysis, photoMeta);
}

function normalizeLegacyWindowConfig(
  rawConfig: Record<string, unknown>,
  sceneAnalysis: WindowSceneAnalysis,
  photoMeta?: WindowPhotoMeta | null,
): WindowRenderConfig {
  // Per le sessioni legacy (config v1) creiamo una baseline minima.
  // Le specifiche tecniche vengono sintetizzate con valori di default sicuri.
  const selectedOpeningIds = sceneAnalysis.openings.map((o) => o.id);
  const targetSelection = createWindowTargetSelection(sceneAnalysis, selectedOpeningIds);

  const baselineState: WizardState = {
    tipo: "F2A",
    profilo: "pvc",
    manigliaCentrale: false,
    coloreInfisso: "9016",
    tipoManiglia: "classica_dritta",
    coloreHw: "cromo",
    cass: false,
    cassMat: "stesso_colore",
    cassCol: "",
    tapp: "no",
    tappCol: "stesso",
    traverso: "auto",
    cerniere: "visibili",
    nodo: "simmetrico",
  };
  const { technicalSpecifications, nuovoInfisso, aperturaDefault } = buildTechnicalSpecifications(
    baselineState,
    sceneAnalysis,
    targetSelection.selectedOpeningIds,
  );

  const provisional: WindowRenderConfig = {
    schema_version: "window_render_v2",
    notes: typeof rawConfig.notes === "string" ? rawConfig.notes : "",
    apertura_default: aperturaDefault,
    photo_meta: photoMeta ?? null,
    scene_analysis: sceneAnalysis,
    target_selection: targetSelection,
    technical_specification: technicalSpecifications,
    replacement_manifest: {} as WindowRenderConfig["replacement_manifest"],
    removal_rules: [],
    integrity_constraints: [],
    quality_directives: [
      "Professional architectural photorealistic replacement render quality bar.",
      "Preserve the same environment and photo geometry exactly.",
    ],
    nuovo_infisso: nuovoInfisso,
  };

  const replacement_manifest = buildWindowReplacementManifest(provisional);
  return {
    ...provisional,
    replacement_manifest,
    removal_rules: replacement_manifest.removals.map((rule) => rule.summary),
    integrity_constraints: replacement_manifest.integrityConstraints,
  };
}
