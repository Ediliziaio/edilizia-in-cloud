// ═══════════════════════════════════════════════════════════════════
// PROMPT MASTER — Sistema a Blocchi per Render Persiane AI
// Versione: 1.0.0 — Edilizia in Cloud
// ═══════════════════════════════════════════════════════════════════

import type {
  ConfigurazionePersiane,
  AnalisiPersiane,
  TipoPersiana,
  MaterialePersiana,
  StatoApertura,
  AperturaLamelle,
} from "./types";
import { TIPI_CON_LAMELLE } from "./types";

// ─── SHUTTER_PHYSICS ─────────────────────────────────────────────
const SHUTTER_PHYSICS: Record<TipoPersiana, string> = {
  veneziana_classica:
    "Traditional Venetian shutters (persiana alla veneziana) — rectangular wooden or aluminum frame with horizontal tilting louvers/slats 40-60mm wide, each slat pivots on small pins embedded in the vertical stiles, visible pin axis at each slat end, slats overlap by 5-8mm when closed creating a continuous opaque surface with characteristic horizontal shadow lines, frame stiles 50-70mm wide with routed pivot holes at regular 45-55mm intervals, bottom rail heavier (80-100mm) acting as closing bar, surface shows paint layers or natural wood grain depending on material, mounted directly on window reveal or wall face with visible iron or stainless steel hinges (typically 3 per shutter leaf)",

  veneziana_esterna:
    "External Venetian blind (veneziana esterna) — precision-extruded aluminum or PVC horizontal slats 60-80mm wide suspended on fabric tapes or thin steel cables, slats tilt from 0° (closed) to 85° (open) via mechanical or motorized tilting mechanism, visible guide rails on left and right jamb faces (C-channel aluminum profiles 25-30mm wide), head box at top (150-200mm tall) housing the rolled-up blind, bottom bar 40mm with rubber end caps, modern clean aesthetic with uniform color and precise slat spacing",

  scuro_pieno:
    "Solid panel shutters (scuro pieno) — single solid wood or composite panel per leaf, no louvers or openings, thickness 30-45mm, surface may show tongue-and-groove vertical boards (doghe) 80-120mm wide with V-groove joints, or a single flat panel with cross-battens (traversine) visible on the interior face, traditional wrought-iron or stainless-steel pintles and gudgeons hinge system, heavy iron espagnolette bolt (catenaccio) on meeting stile of double-leaf pairs, substantial rustic appearance",

  scuro_cornice:
    "Framed panel shutters (scuro a cornice/bugna) — wood or composite shutter with raised or recessed decorative panels (bugne) set within a frame-and-rail structure, each panel typically 200-400mm wide with beveled or flat fielded center, frame members 70-90mm wide with mortise-and-tenon joinery visible at corners, classic architectural style suitable for historic buildings, may feature small diamond-shaped or round decorative cutouts in upper panel, painted or stained finish",

  gelosia:
    "Fixed louver screen (gelosia) — dense array of thin horizontal wood or aluminum slats 20-35mm wide fixed at a permanent 30-45° downward angle, slats do not tilt or move, spacing 3-5mm between slats allowing air circulation while blocking direct sunlight and view from below, frame is a simple rectangular surround 40-60mm wide, traditional Mediterranean and colonial architectural element, often installed as fixed panels on upper portions of windows or as full window screens",

  avvolgibile_esterno:
    "External roller shutter (avvolgibile/tapparella) — horizontal interlocking extruded PVC or aluminum slats 37-55mm wide that roll up into a head box (cassonetto) above the window, slats connect via male-female interlocking edges creating a continuous flexible curtain, visible side guide channels (guide laterali) as U-shaped aluminum profiles on jamb faces, bottom rail (stecca terminale) 40-60mm with rubber seal strip, operated by strap winder, crank, or electric motor, characteristic horizontal parallel lines when lowered",

  a_libro:
    "Bi-fold/accordion shutters (persiana a libro) — multiple narrow shutter panels (typically 3-5 per side) connected by hinges that fold flat against the wall when open, each panel 150-250mm wide, may have fixed louvers or solid panels, folding track at top with roller carriages, when closed appears as a continuous shutter surface, when open stacks compactly at sides taking minimal space, modern or traditional styles available",

  griglia_sicurezza:
    "Security grille shutters (griglia di sicurezza) — steel or extruded aluminum fixed or openable grille with vertical bars 12-16mm diameter at 100-120mm centers, horizontal cross-members at 200-300mm intervals, may include decorative scrollwork or simple geometric patterns, surface powder-coated or hot-dip galvanized, provides physical security while allowing full visibility and airflow, hinged or sliding opening mechanism with multi-point lock",

  brise_soleil:
    "Brise-soleil / sun louvers — large-format horizontal or vertical aluminum blades 100-300mm wide mounted on visible outrigger brackets projecting 200-400mm from facade, blades may be fixed at calculated solar angle or motorized for tracking, visible mounting brackets are machined aluminum or welded steel arms, blades have aerodynamic elliptical or flat rectangular cross-section, contemporary architectural element providing solar shading while maintaining views, typically anodized or powder-coated in neutral tones",
};

// ─── MATERIAL_DESC ───────────────────────────────────────────────
const MATERIAL_DESC: Record<MaterialePersiana, string> = {
  legno_naturale:
    "Solid natural wood — visible grain pattern running along the length of each component, warm organic color with subtle tonal variation, possible micro-cracks or grain lines at painted surfaces, traditional hand-crafted appearance, shows paint or stain finish with grain texture visible beneath, ages with patina over time",

  legno_composito:
    "Wood-polymer composite (WPC) — uniform color without natural grain variation, smooth matte factory finish, resistant to weathering with no visible aging, modern material with consistent appearance, may have embossed faux-grain texture but distinctly uniform compared to real wood, no knots or natural defects",

  alluminio:
    "Extruded aluminum — smooth powder-coated or anodized surface, sharp precise edges and corners, consistent metallic appearance with micro-directional surface texture from coating process, lightweight thin-wall profiles, visible corner joining screws or concealed clips, modern industrial precision",

  pvc:
    "PVC (polyvinyl chloride) — smooth matte or slightly glossy surface, uniform color throughout material thickness, rounded edge profiles from extrusion process, multi-chamber internal structure (not visible from exterior), corners welded with subtle seam lines, no natural texture or grain",

  acciaio:
    "Steel — strong structural profiles, may be powder-coated, hot-dip galvanized (visible crystalline zinc surface pattern), or painted, heavier gauge material with visible weld points at joints, industrial robust appearance, thin sight lines possible with high structural strength",

  fibra_vetro:
    "Fiberglass (GRP) — smooth gel-coat exterior surface, can mimic wood grain when embossed, maintains dimensional stability in all temperatures, painted or factory-finished, heavier feel than PVC but lighter than wood, corrosion-proof with long maintenance-free lifespan",
};

// ─── STATO_APERTURA_DESC ─────────────────────────────────────────
const STATO_APERTURA_DESC: Record<StatoApertura, string> = {
  chiuso:
    "Shutters fully CLOSED — both leaves/panels pulled shut against the window, meeting stile flush or overlapping, espagnolette bolt engaged, no gap between leaves, shutter surface forms a continuous plane parallel to the wall",
  socchiuso:
    "Shutters AJAR (socchiuso) — leaves slightly open at 10-15 degrees from closed position, narrow sliver of light visible between meeting stiles and at edges, louvers (if present) partially tilted to allow filtered light, creates subtle shadow play on facade",
  aperto_45:
    "Shutters OPEN at 45 degrees — each leaf swung outward approximately 45 degrees from the wall plane, visible hinge hardware under tension, interior face of shutter partially visible, creates triangular shadow on adjacent wall, characteristic of daytime Mediterranean architecture",
  aperto_90:
    "Shutters FULLY OPEN at 90 degrees — each leaf swung perpendicular to the wall, flat against the adjacent wall surface or held by shutter dogs/fermapersiana hardware, window fully exposed, shutters create strong rectangular shadow on wall, typical of Italian residential facades during daytime",
  anta_singola_aperta:
    "ONE leaf OPEN, one leaf CLOSED — asymmetric configuration with left or right leaf open at 45-90 degrees while the other remains closed, creates distinctive asymmetric facade pattern, common in partially occupied buildings or for ventilation control",
};

// ─── APERTURA_LAMELLE_DESC ───────────────────────────────────────
const APERTURA_LAMELLE_DESC: Record<AperturaLamelle, string> = {
  chiuse:
    "Louvers/slats CLOSED — tilted to maximum overlap, forming an opaque surface, only thin horizontal shadow lines visible between slat edges, blocks direct sunlight and view",
  parzialmente_aperte:
    "Louvers/slats PARTIALLY OPEN — tilted at approximately 30-45 degrees from closed, visible gaps between slats allowing filtered light and partial view through, characteristic stripe pattern of light and shadow",
  completamente_aperte:
    "Louvers/slats FULLY OPEN — tilted to near-horizontal position, maximum gap between slats providing full ventilation and significant light transmission, slats appear as thin horizontal lines with wide gaps, view partially visible through the shutter",
};

// ─── OPERAZIONE_DESC ─────────────────────────────────────────────
const OPERAZIONE_DESC: Record<string, string> = {
  sostituisci:
    "REPLACE existing shutters with new ones — remove all current shutters and install the specified new type, maintaining the same window opening positions, new mounting hardware appropriate for the selected type",
  cambia_colore:
    "CHANGE COLOR ONLY — keep the existing shutter type, style, hardware and mounting exactly as they are, only repaint/refinish the surface to the specified new color, no structural changes",
  aggiungi:
    "ADD NEW shutters where none exist — install the specified shutters on windows that currently have no shutters, add appropriate mounting hardware (hinges, tracks, guides) visible on the facade",
  rimuovi:
    "REMOVE all shutters — completely remove shutters, hinges, tracks, and mounting hardware from all windows, patch/fill any mounting holes in the wall, leave clean window reveals with no shutter hardware visible",
};

// ─── buildPersianePrompt ─────────────────────────────────────────
export function buildPersianePrompt(
  config: ConfigurazionePersiane,
  analisi?: Partial<AnalisiPersiane>,
): { systemPrompt: string; userPrompt: string; promptVersion: string } {
  const a: AnalisiPersiane = {
    tipo_facciata: "residenziale",
    persiane_attuali: "non identificate",
    materiale_attuale: "sconosciuto",
    colore_attuale: "sconosciuto",
    numero_finestre: 2,
    stato_conservazione: "non valutato",
    ...analisi,
  };

  const blocks: Record<string, string> = {};

  // ── [CONTESTO] ───────────────────────────────────────────────────
  blocks.CONTESTO = [
    "[CONTESTO — ANALISI FACCIATA]",
    `Tipo facciata: ${a.tipo_facciata}`,
    `Persiane attuali: ${a.persiane_attuali}`,
    `Materiale attuale: ${a.materiale_attuale}`,
    `Colore attuale: ${a.colore_attuale}`,
    `Numero finestre: ${a.numero_finestre}`,
    `Stato conservazione: ${a.stato_conservazione}`,
    a.note ? `Note: ${a.note}` : "",
  ].filter(Boolean).join("\n");

  // ── [OPERAZIONE] ─────────────────────────────────────────────────
  blocks.OPERAZIONE = [
    "[OPERAZIONE]",
    `Azione richiesta: ${config.operazione.toUpperCase()}`,
    OPERAZIONE_DESC[config.operazione] || "",
    config.applica_tutte_finestre
      ? "SCOPE: Apply to ALL visible windows/openings in the photograph"
      : "SCOPE: Apply only to the main/central window in the photograph",
  ].join("\n");

  // ── [TIPO] ───────────────────────────────────────────────────────
  blocks.TIPO = [
    "[TIPO PERSIANA]",
    `Tipo selezionato: ${config.tipo}`,
    SHUTTER_PHYSICS[config.tipo] || "",
  ].join("\n");

  // ── [MATERIALE] ──────────────────────────────────────────────────
  blocks.MATERIALE = [
    "[MATERIALE]",
    `Materiale: ${config.materiale}`,
    MATERIAL_DESC[config.materiale] || "",
  ].join("\n");

  // ── [COLORE] ─────────────────────────────────────────────────────
  const coloreLines = ["[COLORE]"];
  if (config.colore_mode === "ral") {
    coloreLines.push(`Modalita: RAL color`);
    if (config.colore_ral) coloreLines.push(`RAL: ${config.colore_ral}`);
    if (config.colore_nome) coloreLines.push(`Nome: ${config.colore_nome}`);
    if (config.colore_hex) coloreLines.push(`Hex riferimento: ${config.colore_hex}`);
    coloreLines.push(
      "Render the shutter surface in this EXACT uniform solid color — no wood grain, no natural texture variation. Only the specified material surface texture (matte/glossy) is permitted."
    );
  } else {
    coloreLines.push(`Modalita: Effetto legno`);
    if (config.effetto_legno) coloreLines.push(`Effetto: ${config.effetto_legno}`);
    coloreLines.push(
      "Render the shutter surface with realistic wood grain pattern, natural color variation, visible grain direction running along each component, as a high-quality wood or wood-effect finish."
    );
  }
  if (config.colore_profilo_diverso && config.colore_profilo_hex) {
    coloreLines.push(
      `FRAME/PROFILE color (different from slats): ${config.colore_profilo_hex} — render the outer frame/stiles in this contrasting color while slats/panels use the main color above.`
    );
  }
  blocks.COLORE = coloreLines.join("\n");

  // ── [STATO] ──────────────────────────────────────────────────────
  blocks.STATO = [
    "[STATO APERTURA]",
    `Stato richiesto: ${config.stato_apertura}`,
    STATO_APERTURA_DESC[config.stato_apertura] || "",
  ].join("\n");

  // ── [LAMELLE] ────────────────────────────────────────────────────
  if (TIPI_CON_LAMELLE.has(config.tipo) && config.lamelle) {
    blocks.LAMELLE = [
      "[LAMELLE / SLATS]",
      `Larghezza lamella: ${config.lamelle.larghezza_mm}mm`,
      `Apertura lamelle: ${config.lamelle.apertura}`,
      APERTURA_LAMELLE_DESC[config.lamelle.apertura] || "",
      `Each slat is ${config.lamelle.larghezza_mm}mm wide. Render the correct number of slats to fill the shutter height with proper spacing.`,
    ].join("\n");
  }

  // ── [VINCOLI] ────────────────────────────────────────────────────
  const vincoliLines = [
    "[VINCOLI CRITICI]",
    "1. PRESERVE the exact perspective, camera angle, lighting conditions, wall texture, wall color, window proportions, surrounding architecture, and all non-shutter elements pixel-perfect identical to the original photo.",
    "2. Shadows cast by shutters must be physically accurate for the depicted sun position and shutter opening angle.",
    "3. Mounting hardware (hinges, brackets, guide rails) must be appropriate for the selected shutter type and realistically rendered.",
    "4. If shutters are open, the interior face must show appropriate construction details (cross-battens, hinge plates, etc.).",
    "5. If the operation is REMOVE, fill former mounting points with matching wall surface — no visible holes, brackets, or shadow marks.",
    "6. Output image dimensions must match input image dimensions exactly.",
    "7. Maintain photorealistic quality — no cartoon, illustration, or artistic interpretation.",
  ];
  if (config.note_libere) {
    vincoliLines.push(`\nUSER NOTES: ${config.note_libere}`);
  }
  blocks.VINCOLI = vincoliLines.join("\n");

  // ── Assemble ─────────────────────────────────────────────────────
  const systemPrompt = [
    "You are a SURGICAL PHOTOREALISTIC IMAGE EDITOR specialized in architectural shutter (persiane) visualization.",
    "Your ONLY task: modify EXACTLY the shutters/persiane on the building facade as specified, while leaving EVERYTHING ELSE 100% pixel-perfect identical.",
    "This is PRECISE SURGICAL REPLACEMENT of shutters, not artistic interpretation.",
    "",
    "CRITICAL RULES:",
    "- If RAL color mode: render perfectly uniform flat color with NO wood grain.",
    "- If wood effect mode: render realistic wood grain with natural variation.",
    "- Shutter hardware (hinges, bolts, stays) must be realistic for the type.",
    "- Shadows from shutters must be physically correct.",
    "- Wall texture, window glass, frames, sills — ALL unchanged.",
    "- Output resolution must match input resolution exactly.",
  ].join("\n");

  const userPrompt = Object.values(blocks).filter(Boolean).join("\n\n");

  return {
    systemPrompt,
    userPrompt,
    promptVersion: "1.0.0",
  };
}
