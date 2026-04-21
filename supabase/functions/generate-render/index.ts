// generate-render — Edge Function EiC
// Render Infissi AI — Multi-Provider (OpenAI / Gemini)
// NO Lovable Gateway — API keys da platform_settings
// Prompt Engine v6 completo (ported from Edile Genius)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { captureRealCost } from "../_shared/renderCost.ts";
import { prepareInputImage, pickProviderSize } from "../_shared/renderImage.ts";
import { canAccessCompany } from "../_shared/effectiveCompany.ts";
import { deductRenderCreditSafe } from "../_shared/renderCreditDeduct.ts";

// ── MATERIAL_PHYSICS ──────────────────────────────────────────────────────────
const MATERIAL_PHYSICS: Record<string, string> = {
  pvc: "white or colored PVC (polyvinyl chloride) frame — smooth matte surface with very slight plastic texture under direct light, internal multi-chamber structure visible at frame cross-section edges, corners welded with subtle seam lines, uniform color throughout without natural grain, exterior surface shows shallow surface relief from extrusion process",
  alluminio: "extruded aluminum frame — anodized or powder-coated exterior, sharp precise 90° or slightly beveled edges, clearly visible thermal break (dark polyamide strip, approximately 3-5mm wide) between inner and outer shells at frame cross-section, surface shows very subtle directional micro-texture from coating process, thin elegant profile (typically 50-65mm visible sight line width), consistent metallic finish",
  legno: "solid wood frame — clearly visible natural wood grain running along the frame length, slightly rounded milled edges, paint or opaque stain finish showing faint grain texture beneath the coating, traditional mortise-and-tenon visible corner joint geometry (slight raised line at 45° miter), warm organic color variation, thicker profile (68-92mm sight line), possible hairline micro-cracks at painted corners",
  legno_alluminio: "hybrid timber-aluminum composite frame — interior side shows solid wood with warm grain and stain finish, exterior side shows slim precision-extruded aluminum cladding with powder-coated finish, visible thin shadow line at the wood-aluminum transition edge, combines warmth of interior wood aesthetic with weather-resistant modern aluminum exterior",
  acciaio_corten: "Corten weathering steel frame — unmistakable rust-orange patina with rough oxidized surface texture and natural color variation from dark rust-red to lighter orange-tan, ultra-thin sight line profiles (25-35mm visible width), industrial precise geometric form, characteristic streaking pattern typical of Cor-Ten oxidation",
  acciaio_minimale: "ultra-minimal structural steel frame — extremely thin sight lines (15-25mm), deep matte black or dark anthracite powder-coated surface, machined precise geometric edges, nearly frameless appearance with maximum glass-to-frame ratio, industrial modern aesthetic, tiny cap screws or concealed fixings visible at mullion intersections",
};

// ── APERTURA_DESCRIPTION ──────────────────────────────────────────────────────
const APERTURA_DESCRIPTION: Record<string, string> = {
  battente_1_anta: "single-leaf inward-opening casement window — ONE sash panel hinged on the LEFT or RIGHT side, operated by a single lever handle on the opposite stile, 2 hinges visible on the hinge side stile (top and bottom), center-of-glass gasket line visible",
  battente_2_ante: "double-leaf inward-opening casement window — TWO equal sash panels meeting at center, exactly 2 visible hinges total on the window (one upper hinge and one lower hinge on the hinge-side stile), lever handle near the center meeting stile, center rebate/espagnolette bolt visible where panels meet",
  battente_3_ante: "triple-leaf casement window — THREE panels, typically center panel fixed (no hinges, no handle) flanked by two opening sashes each with 2 hinges and a handle, visible central fixed mullion and two moving sash dividers",
  scorrevole: "horizontal sliding window — two or more panels sliding on visible aluminum top rail and bottom track, each panel has a flush pull handle or recessed grip, no hinges visible, only sliding hardware guides at top corners",
  scorrevole_alzante: "lift-and-slide large door/window — very large glass panels (typically 1.5-3m wide each), bottom track system with lifting hardware visible, heavy-duty multi-point lock handle on leading edge, no exposed hinges, minimal frame profile at panel edges",
  vasistas: "top-hung tilt-in window — sash hinged at TOP rail only, opens by tilting inward from the bottom, handle located on bottom rail of sash, 2 friction hinges at top corners, scissor-arm stay mechanism visible on both side stiles when open",
  anta_ribalta: "tilt-and-turn window — multi-function sash with BOTH tilt-in (vasistas) and side-swing (battente) capability, 2 hinges on hinge-side stile, distinctive multi-position lever handle (pointing DOWN=closed, HORIZONTAL=tilt, UP=turn), rebated all around",
  bilico: "center-pivot window — sash rotates on central horizontal pivot axis, top half swings inward while bottom swings outward, visible pivot fittings at mid-height of both side stiles, no traditional hinges on frame edges",
  fisso: "fixed non-opening light — no hinges, no handle, no gaps or shadow lines from sash rebate, glass beaded directly into fixed frame, single uninterrupted frame profile all around",
  portafinestra: "full-height balcony/French door — floor-to-near-ceiling height (typically 210-240cm), low threshold (15-20mm) at floor level, same 2-hinges-per-leaf as standard window but larger scale, may have floor-mounted pivot pin, anti-panic handle or lever, often with fixed sidelight panels",
  cassonetto_integrato: "window with integrated roller box — standard opening sash below, above the frame top rail a visible box housing containing the rolled-up shutter, box face-panel protrudes 60-200mm from wall plane, typically same color as frame",
};

// ── CASSONETTO_MATERIAL_DESC ──────────────────────────────────────────────────
const CASSONETTO_MATERIAL_DESC: Record<string, string> = {
  pvc_tradizionale: "traditional PVC roller shutter housing (cassonetto PVC standard) — rectangular box profile protruding 160-200mm above window top rail, face panel approximately 200mm tall, smooth matte PVC surface with subtle panel seam line, bottom strip slightly recessed where shutter curtain exits, same extrusion quality as PVC window frame",
  pvc_slim: "slim-profile PVC cassonetto — reduced-depth housing only 110-130mm visible height above frame, lower profile ratio for modern facades, smooth face panel with minimal protrusion (80-100mm from wall), contemporary proportions matching thin-profile frame systems",
  pvc_integrato: "wall-integrated cassonetto (cassonetto a muro/incassato) — fully recessed into masonry, only the bottom inspection strip approximately 30-40mm visible below wall surface level, wall plaster or cladding runs continuously over the housing, virtually invisible from exterior — only a thin reveal line marks its position",
  alluminio_coibentato: "insulated aluminum cassonetto — aluminum face panels with powder-coated finish matching or contrasting frame, visible side inspection cover flanges at 45° angles, polyurethane foam fill (not visible but implied by professional thermal appearance), face panel 170-210mm height, crisp machined edges and corners",
};

// ── TAPPARELLA_DESC ───────────────────────────────────────────────────────────
const TAPPARELLA_DESC: Record<string, string> = {
  pvc_avvolgibile: "PVC roll-up shutter curtain — horizontal extruded PVC slats 37-55mm wide, each slat with smooth rounded upper edge and male-female interlocking lower edge, uniform matte colored surface with very subtle extrusion line texture running horizontally, bottom end-rail heavier profile (40-60mm) with integrated rubber seal and lift lug, side guide channels (guide) visible as thin U-profile strips on left and right jamb faces, total curtain thickness approximately 8-12mm",
  alluminio_avvolgibile: "aluminum roll-up shutter curtain — extruded aluminum foam-filled slats 37-55mm wide, slightly metallic surface sheen compared to PVC, slat walls approximately 1.2-1.5mm thick with visible interior foam at side edges when looked at obliquely, crisp precise slat-to-slat joints, heavier appearance than PVC equivalent, bottom bar with EPDM rubber weatherstrip, side guide channels in matching anodized or powder-coated aluminum",
  microforata: "microperforated roll-up shutter — same slat profile as standard PVC/aluminum avvolgibile but with regular grid of circular perforations 3-4mm diameter at approximately 6-8mm centers, perforation pattern creates a screenprint-like texture visible across the curtain surface, light passes through holes creating dappled interior light, retains privacy from outside while allowing partial outward vision from inside",
  persiana_alluminio: "aluminum louvered shutter (persiana avvolgibile) — horizontal extruded aluminum slats 60-80mm wide with traditional shutter profile (S-curve cross-section), visible twin pivot pins at each slat end inserted into side guide channels, slats appear at consistent angle (typically 30-45° open or closed), side channel guides are deeper (40-50mm) than standard roller guides, traditional Mediterranean aesthetic, bottom rail is a solid bar connecting all slat pivots",
  veneziana_integrata: "integral blind between glazing (tendina veneziana integrata) — visible only as a series of very thin parallel horizontal lines 25mm apart suspended between the two glass panes inside the double-glazing unit, slat lines cast faint shadow on interior glass surface, operated by a small external thumb-wheel or magnetic control on frame edge, no external mechanism visible, glass still appears transparent with blind fully open, gives ultra-minimal modern look",
  nessuna: "No shutter or blind — bare window frame only with no additional covering system",
};

// ── CERNIERA_DESC / CERNIERA_COLORE_DESC ─────────────────────────────────────
const CERNIERA_DESC: Record<string, string> = {
  europea: "Standard European butt hinge (cerniera europea) — two rectangular steel plates approximately 50×35mm each, 3 countersunk screws per plate, polished or coated to match hardware, central pin knuckle approximately 8mm diameter, hinge projects 3-4mm from frame face when closed",
  a_libro: "Book-fold concealed hinge (cerniera a libro) — when door/window is closed hinge is partially recessed into frame rebate, only the outer knuckle visible as a thin strip approximately 6mm × 40mm, appears more elegant and flush than standard hinge",
  invisibile: "Fully concealed pivot hinge (cerniera invisibile/nascosta) — completely hidden inside frame rebate when window is closed, no visible hardware on frame face, only a very faint rebate shadow line indicates hinge location, premium invisible appearance",
};

const CERNIERA_COLORE_DESC: Record<string, string> = {
  argento: "silver polished chrome finish",
  nero_opaco: "matte black finish",
  inox: "brushed stainless steel finish",
  bronzo: "antique bronze finish",
  oro: "polished gold/brass finish",
  uguale_maniglia: "same finish as the window handle",
};

// ── CINGHIA_DESC ──────────────────────────────────────────────────────────────
const CINGHIA_DESC: Record<string, string> = {
  con_cinghia: "manual strap winder (avvolgitore a cinghia) — rectangular surface-mounted plastic box (120×160mm) on interior wall beside window, 15mm wide woven polyester strap exits through wall slot and wraps around internal spring-loaded drum, visible strap hanging in slight arc when at rest",
  senza_cinghia: "motorized (no strap) — no visible strap or winder on interior or exterior; small flush switch plate (single rocker UP/DOWN/STOP) or RF remote receiver mounted near frame; motor housed inside roller tube within cassonetto, inaudible from exterior",
  con_catenella: "bead chain operator (catenella) — small-diameter stainless-steel or plastic bead chain loop hanging 300-400mm beside window frame, connected to internal geared clutch mechanism at frame edge, used for venetian blinds or light roller screens",
  con_manovella: "manual crank operator (manovella) — folding or fixed metal crank handle 100-150mm long projecting from frame edge or wall plate, connected via rigid rod through wall to worm-gear mechanism on roller tube, visible crank hardware at waist height beside window",
};

// ── STILE_TELAIO_DESC ─────────────────────────────────────────────────────────
const STILE_TELAIO_DESC: Record<string, string> = {
  nodo_ridotto: "reduced-node (nodo ridotto) profile — sash sits nearly flush with outer frame, minimal step between sash face and frame face (only 3-5mm reveal), maximizes glass area, contemporary flush-line aesthetic, gasket lines barely visible",
  nodo_ridotto_maniglia_centrale: "reduced-node profile with CENTER-PLACED handle — same flush geometry as nodo ridotto, BUT the lever handle is positioned at exact vertical center of the sash height (not at standard 1/2-down or lock-stile position), creating a symmetrical visual balance point",
  minimal_squadrato: "minimal squared profile — ultra-thin sight lines (35-45mm), sharp 90° edges with no rounding, Bauhaus-inspired geometric precision, maximum glass-to-frame ratio",
  classico_arrotondato: "classic rounded profile — traditional residential proportions with softly rounded edges (radius 3-5mm), wider sight lines (55-70mm), familiar warm aesthetic",
  europeo_classico: "classic European profile — standard 70-82mm system with gentle 2mm edge radius, balanced proportions suitable for renovation of traditional buildings",
  arco_sagomato: "arched/shaped frame — non-rectangular frame following arch, gothic, or custom curved geometry at top rail, requires bent or segmented profile pieces, traditional architectural feature",
};

// ── MANIGLIE_V5 ───────────────────────────────────────────────────────────────
const MANIGLIE_V5: Record<string, string> = {
  toulon: "Toulon-style curved ergonomic lever handle — smooth S-curve body form, rounded grip terminus, 130-145mm total length, slim 22-25mm grip diameter, visible curved shank transition from backplate to lever body",
  classica_dritta: "Classic straight lever handle — flat rectangular profile, 120-130mm lever length, 20-22mm grip thickness, square or slightly beveled edges, standard Italian residential window hardware",
  vienna: "Vienna butterfly-wing (farfalla) lever handle — two symmetric curved wing-lobes flanking the center spindle rose, graceful organic silhouette, traditional Viennese architectural style, ornate period-appropriate appearance with visible casting detail",
  q_moderna: "Q-model squared minimal lever handle — strict rectangular cross-section with sharp 90° corners, completely flat face with no rounding, 125-135mm lever length, Bauhaus/industrial minimalist style, clean architectural appearance",
  con_rosetta: "Lever handle with decorative backplate (con rosetta) — circular or square backplate 50-60mm spanning the spindle area, lever body 120-130mm emerging from plate center, visible screw heads on plate corners or perimeter",
  pomolo: "Round pomolo knob handle — spherical or cylindrical form 35-45mm diameter, compact low projection from frame face, smooth rounded surface with visible setscrew or cover cap",
  alzante: "Lift-and-slide (alzante) operating handle — long ergonomic lever 200-280mm with curved palm grip, heavy die-cast body with visible mechanism pivot, projects 60-80mm from frame face, used on large sliding door panels",
  nessuna: "Fixed light (no handle) — completely clean frame face with no handle hardware, no backplate, no visible spindle hole. The sash is non-opening.",
};

// ── HARDWARE_COLORS_V5 ────────────────────────────────────────────────────────
const HARDWARE_COLORS_V5: Record<string, string> = {
  cromo_lucido: "polished chrome — bright specular reflection",
  inox_spazzolato: "brushed stainless steel — directional satin micro-lines",
  nero_opaco: "matte black powder coat — no specular highlight",
  nero_lucido: "gloss black — clear specular reflection",
  bronzo_anticato: "antique bronze patina — warm irregular oxidized surface",
  oro_pvd: "polished gold PVD coating — warm yellow specular reflection",
  ottone_spazzolato: "brushed brass — warm gold directional micro-lines",
  titanio: "titanium anodized — cool grey with subtle metallic depth",
};

// ── buildPromptFromConfig v6 ──────────────────────────────────────────────────
// Accepts a session-like object with .config (v6 nested or legacy flat) and optional .foto_analisi
function buildPromptFromConfig(session: any): {
  systemPrompt: string;
  userPrompt: string;
  negativePrompt: string;
  promptVersion: string;
  blocks: Record<string, string>;
} {
  // Fallback defaults for missing analysis fields
  const analisi = {
    tipo_apertura: "battente_2_ante",
    materiale_attuale: "sconosciuto",
    colore_attuale: "sconosciuto",
    condizioni: "sconosciuto",
    num_ante_attuale: 2,
    spessore_telaio: "circa 70mm",
    tipo_vetro_attuale: "non identificabile",
    presenza_cassonetto: false,
    tipo_cassonetto: "non presente",
    presenza_tapparella: false,
    stile_edificio: "classico",
    materiale_muro: "intonaco",
    colore_muro: "chiaro",
    presenza_davanzale: false,
    presenza_inferriata: false,
    piano: "non identificabile",
    luce: "luce naturale",
    angolo_ripresa: "frontale",
    ...(session.foto_analisi || {}),
  };
  const config = session.config || {};
  const nuovoInfisso = config.nuovo_infisso || {};
  const notes = config.notes || config.options?.notes || "";

  const hasV2 = nuovoInfisso.sostituzione || (analisi.tipo_apertura && nuovoInfisso.materiale);

  if (!hasV2) {
    // Legacy v1 fallback (config flat: materiale, apertura, colore, vetro)
    const mat = config.materiale || "pvc";
    const col = config.colore || "bianco";
    const vet = config.vetro || "trasparente";
    const note = config.note_libere || "";
    const windowDesc = `${mat} window, ${col} color, ${vet} glass${note ? ", " + note : ""}`;
    const system = "You are an expert architectural visualization AI. Replace the existing windows/doors with new ones while maintaining photorealistic quality.";
    const user = `Replace all visible windows in this photograph with: ${windowDesc}. Maintain exact same perspective, lighting, wall texture, and surroundings.`;
    const negative = "cartoon, illustration, sketch, drawing, watermark, text overlay, blurry, distorted perspective, different building, changed wall color, unrealistic lighting";
    return { systemPrompt: system, userPrompt: user, negativePrompt: negative, promptVersion: "1.0.0", blocks: { legacy: user } };
  }

  const sost = nuovoInfisso.sostituzione || { infissi: true, cassonetto: false, tapparella: false };
  const colore = nuovoInfisso.colore || {};
  const profilo = nuovoInfisso.profilo || {};
  const vetro = nuovoInfisso.vetro || {};
  const ferramenta = nuovoInfisso.ferramenta || {};
  const cassonetto = nuovoInfisso.cassonetto || {};
  const tapparella = nuovoInfisso.tapparella || {};
  const cerniere = nuovoInfisso.cerniere || {};
  const trasformazione = nuovoInfisso.trasformazione || {};

  const finituraMap: Record<string, string> = {
    liscio_opaco: "smooth matte finish", liscio_lucido: "smooth glossy finish",
    venatura_legno: "wood-grain textured surface", spazzolato: "brushed metallic finish",
    satinato: "satin finish", goffrato: "embossed/textured surface",
  };
  const profiloSize: Record<string, string> = {
    "70mm": "70mm residential profile with 3 chambers",
    "82mm": "82mm premium profile with 5 chambers",
    "92mm": "92mm Passivhaus-grade profile with 7 chambers",
  };
  const profiloForma: Record<string, string> = {
    squadrato: "squared/angular edges", arrotondato: "softly rounded edges", europeo: "classic European profile",
  };

  const blocks: Record<string, string> = {};

  // Block A
  blocks.A = `[BLOCK A – ROLE & MISSION]\nYou are a SURGICAL PHOTOREALISTIC IMAGE EDITOR for architectural visualization. Your ONLY task: replace EXACTLY the specified window frame/door-window frame and explicitly requested accessories while leaving EVERYTHING ELSE 100% pixel-perfect identical. This is PRECISE SURGICAL REPLACEMENT, not artistic interpretation.\n\nEDIT MASK RULE:\nOnly pixels belonging to the existing infisso area may change: frame, sash, glass edges, handles, hinges, gaskets, and accessories explicitly marked ✅ REPLACE. Do not repaint, redesign, relight, crop, expand, clean, sharpen, beautify, or reinterpret the surrounding room/facade.\n\nCRITICAL RENDERING RULES:\n1. Preserve the original photo composition, crop, aspect ratio, camera angle, lens perspective, focal length feel, exposure, white balance, noise/grain, and image format. The output must look like the same real photo after only the infisso was replaced.\n2. If the frame color is a SOLID RAL color: render perfectly uniform flat color with NO wood grain, NO natural texture variation, NO organic patterns. Only the specified finish texture (matte/glossy/satin) is allowed.\n3. If the frame color is a WOOD EFFECT laminate: render realistic wood grain pattern with natural color variation, visible grain direction running along the frame length, knot patterns, and subtle depth — as a high-quality laminate film applied over PVC or aluminum substrate.\n4. Never mix these two modes — a RAL color must never show grain, and a wood effect must always show grain.\n5. Handle hardware must match the exact style and finish specified — do not default to generic lever handles.\n6. Frame profile style (nodo ridotto, minimal, classic) must be accurately represented in sight-line width and edge geometry.\n7. If cinghia/motor mode is specified, render the appropriate operating mechanism.\n8. If a transformation is requested, accurately depict the new opening type while preserving the original wall opening dimensions.\n9. All shadows, reflections, and ambient occlusion must be physically correct for the new elements and match the original light direction.\n10. CASSONETTO — if marked ✅ REPLACE in BLOCK C, the roller shutter box ABOVE the window MUST be rendered in the exact specified color/finish.\n11. TAPPARELLA — if marked ✅ REPLACE in BLOCK C, every slat of the roller shutter MUST be rendered in the exact specified color/finish.\n12. For a double-leaf/two-sash window, render exactly 2 visible hinges total, not 4.\n13. Output image dimensions and aspect ratio must match input image dimensions as closely as the provider allows; never intentionally crop or pad.`;

  // Block B
  blocks.B = `[BLOCK B – EXISTING ELEMENTS INVENTORY]\nWindow/door type: ${APERTURA_DESCRIPTION[analisi.tipo_apertura] || analisi.tipo_apertura}\nCurrent material: ${analisi.materiale_attuale}, Color: ${analisi.colore_attuale}, Condition: ${analisi.condizioni}\nPanels: ${analisi.num_ante_attuale}, Frame depth: ${analisi.spessore_telaio}\nGlass: ${analisi.tipo_vetro_attuale}\nRoller box: ${analisi.presenza_cassonetto ? "YES — " + analisi.tipo_cassonetto : "NOT PRESENT"}\nShutter: ${analisi.presenza_tapparella ? "YES" : "NOT PRESENT"}\nBuilding: ${analisi.stile_edificio}, Wall: ${analisi.materiale_muro} (${analisi.colore_muro})\nSill: ${analisi.presenza_davanzale ? "YES" : "NO"}, Bars: ${analisi.presenza_inferriata ? "YES" : "NO"}\nFloor: ${analisi.piano}, Light: ${analisi.luce}, Angle: ${analisi.angolo_ripresa}`;

  // Block C
  const cLines: string[] = ["[BLOCK C – REPLACEMENT MANIFEST]", "EXACTLY these elements must change — NOTHING else:"];
  if (sost.infissi) {
    let infissoColorDesc = colore.nome || "white";
    if (nuovoInfisso.colore_mode === "legno" && nuovoInfisso.colore_wood_effect) {
      infissoColorDesc = `${nuovoInfisso.colore_wood_effect.name || nuovoInfisso.colore_wood_effect.id} wood-effect laminate`;
    } else if (colore.ral) {
      infissoColorDesc = `${colore.nome} (RAL ${colore.ral})`;
    }
    cLines.push(`\n✅ REPLACE window/door frame → new finish: ${infissoColorDesc}`);
  } else {
    cLines.push(`\n🚫 KEEP window/door frame exactly as in original photo`);
  }
  if (sost.cassonetto) {
    if (cassonetto.azione === "rimuovi") {
      cLines.push(`\n✅ REMOVE cassonetto — fill with continuous wall surface`);
    } else if (cassonetto.azione === "sostituisci" && cassonetto.materiale) {
      const cassMode = nuovoInfisso.cass_colore_mode || cassonetto.colore_mode || "ral";
      let cassColorDesc = "";
      if (cassMode === "legno") {
        const cwe = nuovoInfisso.cass_wood_effect || cassonetto.colore_wood_effect;
        cassColorDesc = cwe ? `${cwe.name || cwe.id} wood-effect laminate` : "wood-effect laminate";
      } else {
        const cc = nuovoInfisso.cass_colore || cassonetto.colore;
        cassColorDesc = cc ? `${cc.name || cc.nome || ""}${cc.ral ? ` (RAL ${cc.ral})` : ""}` : "specified color";
      }
      cLines.push(`\n✅ REPLACE cassonetto → new finish: ${cassColorDesc}`);
    } else {
      cLines.push(`\n🚫 KEEP cassonetto exactly as in original photo`);
    }
  } else {
    cLines.push(`\n🚫 ${analisi.presenza_cassonetto ? "KEEP existing cassonetto exactly as-is" : "No cassonetto present — do not add one"}`);
  }
  if (sost.tapparella) {
    if (tapparella.azione === "rimuovi") {
      cLines.push(`\n✅ REMOVE tapparella completely`);
    } else if (tapparella.azione === "sostituisci" && tapparella.materiale) {
      const tapMode = nuovoInfisso.tap_colore_mode || tapparella.colore_mode || "ral";
      let tapColorDesc = "";
      if (tapMode === "legno") {
        const twe = nuovoInfisso.tap_wood_effect || tapparella.colore_wood_effect;
        tapColorDesc = twe ? `${twe.name || twe.id} wood-effect laminate` : "wood-effect laminate";
      } else {
        const tc = nuovoInfisso.tap_colore || tapparella.colore;
        tapColorDesc = tc ? `${tc.name || tc.nome || ""}${tc.ral ? ` (RAL ${tc.ral})` : ""}` : "specified color";
      }
      cLines.push(`\n✅ REPLACE tapparella → new finish: ${tapColorDesc}`);
    } else {
      cLines.push(`\n🚫 KEEP tapparella exactly as in original photo`);
    }
  } else {
    cLines.push(`\n🚫 ${analisi.presenza_tapparella ? "KEEP existing shutter exactly as-is" : "No shutter present — do not add one"}`);
  }
  cLines.push(`\n⚠️ CRITICAL: Every element marked 🚫 KEEP must be pixel-identical to the original.`);
  cLines.push(`⚠️ CRITICAL: Every element marked ✅ REPLACE must be rendered with the EXACT specified finish.`);
  blocks.C = cLines.join("\n");

  // Block D
  if (sost.infissi) {
    const coloreMode = nuovoInfisso.colore_mode || "ral";
    if (coloreMode === "legno" && nuovoInfisso.colore_wood_effect) {
      const we = nuovoInfisso.colore_wood_effect;
      blocks.D = `[BLOCK D – NEW FRAME MATERIAL & COLOR]\nMaterial: ${MATERIAL_PHYSICS[nuovoInfisso.materiale] || nuovoInfisso.materiale}\nColor mode: WOOD EFFECT LAMINATE\nWood effect: ${we.name || we.id} — ${we.prompt_fragment || "realistic wood grain laminate film"}\nFinish: ${finituraMap[colore.finitura] || colore.finitura || "wood-grain textured surface"}\n\nWOOD EFFECT RENDERING RULES:\n- Frame MUST show realistic wood grain pattern with natural color variation\n- Grain direction runs ALONG frame length\n- Surface is high-quality laminate film — do NOT render as flat solid color`;
    } else {
      let colorDesc = colore.nome || "";
      if (colore.ral) colorDesc += ` (RAL ${colore.ral})`;
      blocks.D = `[BLOCK D – NEW FRAME MATERIAL & COLOR]\nMaterial: ${MATERIAL_PHYSICS[nuovoInfisso.materiale] || nuovoInfisso.materiale}\nColor: ${colorDesc}\nFinish: ${finituraMap[colore.finitura] || colore.finitura || "smooth matte"}\n\nSOLID RAL COLOR RENDERING RULES:\n- Frame MUST be perfectly uniform in color with NO wood grain, NO natural texture variation\n- Only the specified surface finish texture is permitted\n- Do NOT add any grain or natural material patterns`;
    }
  } else {
    blocks.D = `[BLOCK D – FRAME MATERIAL — SKIPPED]\nFrame replacement not requested.`;
  }

  // Block E
  if (sost.infissi) {
    const numAnte = nuovoInfisso.num_ante || analisi.num_ante_attuale || 1;
    const isTwoLeafCasement = numAnte === 2 || analisi.tipo_apertura === "battente_2_ante";
    const cerPerAnta = isTwoLeafCasement ? 1 : (cerniere.num_per_anta || 2);
    const cerTotal = isTwoLeafCasement ? 2 : cerPerAnta * numAnte;
    const cerTipo = CERNIERA_DESC[cerniere.tipo] || cerniere.tipo || "standard hinge";
    const cerColore = CERNIERA_COLORE_DESC[cerniere.colore] || cerniere.colore || "silver";
    const hingeRule = isTwoLeafCasement
      ? "CRITICAL TWO-LEAF RULE: render EXACTLY 2 visible hinges total for the whole double-leaf window: one upper hinge and one lower hinge on the hinge-side stile. Do NOT render 4 hinges."
      : `Total hinges: ${cerTotal} (${cerPerAnta} per sash × ${numAnte} sash${numAnte > 1 ? "es" : ""})`;
    let stileTelaioPart = "";
    const stileTelaio = nuovoInfisso.stile_telaio;
    if (stileTelaio && STILE_TELAIO_DESC[stileTelaio]) {
      stileTelaioPart = `\nFrame style: ${STILE_TELAIO_DESC[stileTelaio]}`;
      if (stileTelaio === "nodo_ridotto_maniglia_centrale") {
        stileTelaioPart += `\nHANDLE PLACEMENT OVERRIDE: lever handle MUST be at exact vertical CENTER of sash height.`;
      }
    }
    blocks.E = `[BLOCK E – FRAME PROFILE & HINGE GEOMETRY]\nProfile system: ${profiloSize[profilo.dimensione] || profilo.dimensione || "standard"}\nEdge shape: ${profiloForma[profilo.forma] || profilo.forma || "standard"}${stileTelaioPart}\nPanels: ${numAnte}\n\nHINGE DETAIL:\n${hingeRule}\nHinge type: ${cerTipo}\nHinge finish: ${cerColore}\nHinge placement: top ~200mm from top rail, bottom ~200mm from bottom rail\nHinges must be small, correctly scaled, aligned with the frame rebate, and casting believable micro-shadows.`;
  } else {
    blocks.E = `[BLOCK E – FRAME PROFILE — SKIPPED]\nFrame replacement not requested.`;
  }

  // Block F
  if (sost.infissi) {
    blocks.F = `[BLOCK F – GLASS UNIT]\n${vetro.prompt_fragment || vetro.tipo || "double glazed clear glass"}\nRequirements:\n- Thin greenish tint at glass edge\n- Specular highlight matching scene light direction\n- Interior appears dark/neutral\n- Spacer bar visible only at perimeter inside rebate`;
  } else {
    blocks.F = `[BLOCK F – GLASS — SKIPPED]`;
  }

  // Block G
  if (sost.infissi) {
    const manigliaStile = ferramenta.maniglia_stile;
    const hwFinish = ferramenta.colore_hardware_finish;
    if (manigliaStile && MANIGLIE_V5[manigliaStile]) {
      const handleDesc = MANIGLIE_V5[manigliaStile];
      const finishDesc = hwFinish || (ferramenta.colore_hardware_id && HARDWARE_COLORS_V5[ferramenta.colore_hardware_id]) || "silver chrome finish";
      blocks.G = `[BLOCK G – HARDWARE DETAILS]\nHandle style: ${handleDesc}\nHandle finish: ${finishDesc}\nHandle position: centered on the meeting stile\nCRITICAL: Handle MUST be clearly visible on every opening sash in exactly the specified style and finish.`;
    } else {
      blocks.G = `[BLOCK G – HARDWARE DETAILS]\nHandle: lever handle\nColor: ${ferramenta.colore || "silver"}\nHandle position: centered on the meeting stile`;
    }
  } else {
    blocks.G = `[BLOCK G – HARDWARE — SKIPPED]`;
  }

  // Block H
  if (sost.cassonetto && cassonetto.azione === "rimuovi") {
    blocks.H = `[BLOCK H – ROLLER BOX REMOVAL]\nRemove entire cassonetto. Show continuous wall surface matching surrounding facade. Wall fill must be seamless — no ghost outline, shadow gap or discoloration.`;
  } else if (sost.cassonetto && cassonetto.azione === "sostituisci" && cassonetto.materiale) {
    const cassMode = nuovoInfisso.cass_colore_mode || cassonetto.colore_mode || "ral";
    const cassWood = nuovoInfisso.cass_wood_effect || cassonetto.colore_wood_effect;
    const cassColorObj = nuovoInfisso.cass_colore || cassonetto.colore;
    let cColor = "";
    if (cassMode === "legno" && cassWood) {
      cColor = `Target finish: ${cassWood.name || cassWood.id} wood-effect laminate — grain must be visible on cassonetto face`;
    } else if (cassColorObj) {
      const name = cassColorObj.name || cassColorObj.nome || "";
      const ral = cassColorObj.ral || "";
      cColor = `Target finish: ${name}${ral ? ` (RAL ${ral})` : ""} — smooth flat consistent tone, no grain`;
    }
    blocks.H = `[BLOCK H – NEW ROLLER BOX (CASSONETTO)]\nIMPORTANT: cassonetto MUST be replaced.\nReplace with: ${CASSONETTO_MATERIAL_DESC[cassonetto.materiale] || cassonetto.materiale}\n${cColor}\nKeep same dimensions. Cast appropriate shadow onto wall below.\nCRITICAL: Do NOT leave cassonetto in original color.`;
  } else {
    blocks.H = `[BLOCK H – ROLLER BOX]\n${analisi.presenza_cassonetto ? "Keep existing cassonetto exactly as-is." : "No cassonetto. Do not add one."}`;
  }

  // Block I
  if (sost.tapparella && tapparella.azione === "rimuovi") {
    blocks.I = `[BLOCK I – SHUTTER REMOVAL]\nRemove shutter completely. Show bare window frame, no guide channels, no bottom bar.`;
  } else if (sost.tapparella && tapparella.azione === "sostituisci" && tapparella.materiale) {
    const tapMode = nuovoInfisso.tap_colore_mode || tapparella.colore_mode || "ral";
    const tapWood = nuovoInfisso.tap_wood_effect || tapparella.colore_wood_effect;
    const tapColorObj = nuovoInfisso.tap_colore || tapparella.colore;
    let iLines = `[BLOCK I – NEW SHUTTER/BLIND SYSTEM]\nInstall: ${TAPPARELLA_DESC[tapparella.materiale] || tapparella.materiale}`;
    if (tapMode === "legno" && tapWood) {
      iLines += `\nFinish: ${tapWood.name || tapWood.id} wood-effect — slats MUST show grain`;
    } else if (tapColorObj) {
      iLines += `\nFinish: ${tapColorObj.name || tapColorObj.nome || ""}${tapColorObj.ral ? ` (RAL ${tapColorObj.ral})` : ""} — solid uniform color`;
    }
    const cinghia = tapparella.cinghia;
    if (cinghia && CINGHIA_DESC[cinghia]) {
      iLines += `\n\nOPERATING MECHANISM:\n${CINGHIA_DESC[cinghia]}`;
    }
    // Strap-removal semantics: if going from manual strap to motorized, explicitly remove strap winder
    const currentCinghia = (analisi as Record<string, unknown>).cinghia_attuale as string | undefined;
    if (cinghia === "senza_cinghia" && (currentCinghia === "con_cinghia" || analisi.presenza_tapparella)) {
      iLines += `\n\n⚠️ STRAP REMOVAL — CRITICAL:\nIf an existing manual strap winder (avvolgitore a cinghia) box is visible on the interior wall beside the window, it MUST be removed entirely. Fill the wall area smoothly with plaster/paint matching the surrounding wall exactly — no ghost outline, no screw holes, no discoloration. On the exterior, the strap exit slot through the wall must be sealed and painted to blend into the facade.`;
    }
    blocks.I = iLines;
  } else {
    blocks.I = `[BLOCK I – SHUTTER]\n${analisi.presenza_tapparella ? "Keep existing shutter exactly as-is." : "No shutter. Do not add one."}`;
  }

  // Block J
  // Block J — Pixel-perfect environment preservation (with strap-winder exception)
  {
    const isStripping = tapparella.cinghia === "senza_cinghia" && sost.tapparella;
    const wallExceptionNote = isStripping
      ? `\n\n⚠️ WALL EXCEPTION (strap removal):\nThe small rectangular strap-winder box area on the interior wall (and its exit slot on the exterior) is the ONE allowed wall modification — fill seamlessly with matching plaster/paint. Every other square centimeter of wall remains pixel-identical.`
      : "";
    blocks.J = `[BLOCK J – PIXEL-PERFECT ENVIRONMENT PRESERVATION]\nThe following MUST remain 100% unchanged:\n- Photo format: same aspect ratio, same orientation, same crop, same framing; do not zoom in or zoom out\n- Wall: color (${analisi.colore_muro}), material (${analisi.materiale_muro}), texture, aging, stains\n- Window opening: same position, same size, same reveal depth, same lintel/jamb/sill geometry\n- Window sill: ${analisi.presenza_davanzale ? "KEEP" : "NOT PRESENT — do not add"}\n- Security bars: ${analisi.presenza_inferriata ? "KEEP all bars" : "NOT PRESENT — do not add"}\n- Camera perspective: exact (${analisi.angolo_ripresa}); keep all vertical/horizontal lines and vanishing points\n- Surroundings: every pipe, cable, drain, crack, plant, neighboring window, floor, furniture, curtain, reflection outside the infisso area\n- Sky/background: identical\n- Lighting: same direction (${analisi.luce}), same exposure and color temperature${wallExceptionNote}`;
  }

  // Block K
  blocks.K = `[BLOCK K – PHOTOREALISTIC LIGHTING & SHADOWS]\nLighting: ${analisi.luce}\nRequired realism:\n- The result must be indistinguishable from a real window installation photograph, not a catalog render\n- Match original sensor noise, sharpness, slight blur, compression, white balance, and exposure\n- Frame shadow into wall rebate (~15-25mm depth)\n- Hinge shadow from each knuckle, correctly tiny and localized\n- Handle shadow on frame face\n- ${analisi.presenza_cassonetto ? "Cassonetto shadow onto wall below" : "No cassonetto shadow"}\n- Glass reflection matching scene light direction and original surroundings\n- Ambient occlusion in wall-to-frame rebate transition\n- Preserve existing reflections outside the edited glass/frame area`;

  // Block L
  blocks.L = `[BLOCK L – ABSOLUTE NEGATIVE CONSTRAINTS]\nNEVER:\n- Change wall color, texture, furniture, facade, floor, ceiling, curtains, sky, vegetation, neighboring buildings, or any element not requested\n- Alter camera perspective, crop, framing, image orientation, or aspect ratio\n- Add elements absent in original (plants, people, extra windows, decorations, furniture)\n- Change sky/weather\n- Produce cartoon/CGI artifacts, plastic-looking fake render, over-smoothed AI texture, warped geometry\n- Add text/watermarks\n- Distort window proportions or wall opening dimensions\n- Add hinges to fixed lights\n- Add 4 hinges on a two-leaf window; two-leaf windows must show exactly 2 visible hinges total\n- Add shutters/cassonetto if not requested AND none existed\n- Show wood grain on solid RAL color\n- Show flat color on wood-effect laminate\n- Change image dimensions`;

  // Block M — Transformation
  if (trasformazione?.attiva && trasformazione.da && trasformazione.a) {
    const daDesc = APERTURA_DESCRIPTION[trasformazione.da] || trasformazione.da;
    const aDesc = APERTURA_DESCRIPTION[trasformazione.a] || trasformazione.a;
    blocks.M = `[BLOCK M – OPENING TYPE TRANSFORMATION]\nTransform from: ${daDesc}\nTransform to: ${aDesc}\n\nRULES:\n- Wall opening dimensions MUST remain identical\n- Only frame, sash configuration, and hardware change\n- Preserve exact wall opening position, lintel, and sill`;
  }

  // Block N — Final Checklist
  const items: string[] = [];
  if (sost.infissi) {
    const colorLabel = nuovoInfisso.colore_mode === "legno"
      ? (nuovoInfisso.colore_wood_effect?.name || "wood-effect laminate")
      : (colore.nome || "specified RAL color");
    items.push(`☐ FRAME → REPLACE with ${nuovoInfisso.materiale || "PVC"} in ${colorLabel}`);
  } else {
    items.push(`☐ FRAME → KEEP identical to original`);
  }
  if (sost.cassonetto && cassonetto.azione === "sostituisci") {
    items.push(`☐ CASSONETTO → REPLACE — verify NOT original color`);
  } else if (sost.cassonetto && cassonetto.azione === "rimuovi") {
    items.push(`☐ CASSONETTO → REMOVE — show clean wall`);
  } else {
    items.push(`☐ CASSONETTO → ${analisi.presenza_cassonetto ? "KEEP as-is" : "NOT PRESENT"}`);
  }
  if (sost.tapparella && tapparella.azione === "sostituisci") {
    items.push(`☐ TAPPARELLA → REPLACE`);
  } else if (sost.tapparella && tapparella.azione === "rimuovi") {
    items.push(`☐ TAPPARELLA → REMOVE`);
  } else {
    items.push(`☐ TAPPARELLA → ${analisi.presenza_tapparella ? "KEEP as-is" : "NOT PRESENT"}`);
  }
  if (sost.infissi && ferramenta.maniglia_stile) {
    items.push(`☐ HANDLE → ${ferramenta.maniglia_stile} in ${ferramenta.colore_hardware_finish || "chrome"} — visible on each sash`);
  }
  if (sost.infissi && (nuovoInfisso.num_ante === 2 || analisi.tipo_apertura === "battente_2_ante")) {
    items.push(`☐ TWO-LEAF HINGES → exactly 2 visible hinges total, not 4`);
  }
  items.push(`☐ WALL, SILL, SURROUNDINGS → KEEP 100% identical`);
  items.push(`☐ PHOTO FORMAT → same crop, orientation, aspect ratio, and dimensions as the original as closely as the provider allows`);
  blocks.N = `[BLOCK N – FINAL PRESERVATION CHECKLIST]\nVerify EVERY item before outputting. Regenerate if any item is wrong.\n\n${items.join("\n")}`;

  const systemPrompt = blocks.A;
  const userParts = [blocks.B, blocks.C, blocks.D, blocks.E, blocks.F, blocks.G, blocks.H, blocks.I, blocks.J, blocks.K, blocks.L];
  if (blocks.M) userParts.push(blocks.M);
  userParts.push(blocks.N);
  if (notes) userParts.push(`[ADDITIONAL NOTES]\n${notes}`);
  const userPrompt = userParts.join("\n\n");
  const negativePrompt = "cartoon, illustration, sketch, drawing, watermark, text overlay, blurry, distorted perspective, different building, changed wall color, changed room, changed facade, changed surroundings, cropped image, zoomed image, padded image, altered aspect ratio, unrealistic lighting, 3D render, CGI artifacts, plastic fake window, over-smoothed AI texture, warped geometry, missing hinges, four hinges on two-leaf window, wrong handle style, wood grain on RAL solid color, flat color on wood-effect laminate, cassonetto unchanged when replacement was requested, wrong image dimensions";

  return { systemPrompt, userPrompt, negativePrompt, promptVersion: "6.1.0", blocks };
}

// ── resolveRenderSize ─────────────────────────────────────────────────────────
// OpenAI gpt-image-1 / dall-e-2 supportano: 256x256, 512x512, 1024x1024, 1792x1024, 1024x1792
function resolveRenderSize(w?: number, h?: number): string {
  if (!w || !h) return "1024x1024";
  const ratio = w / h;
  // Landscape (>1.4): 1792x1024
  if (ratio > 1.4) return "1792x1024";
  // Portrait (<0.7): 1024x1792
  if (ratio < 0.7) return "1024x1792";
  // Square-ish: 1024x1024
  return "1024x1024";
}

// ── fetchWithTimeout ──────────────────────────────────────────────────────────
async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = 120_000
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

// ── fetchWithRetry ───────────────────────────────────────────────────────────
async function fetchWithRetry(url: string, options: RequestInit, retries = 2, delayMs = 2000): Promise<Response> {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, options);
      if (res.ok || i === retries) return res;
      // Non-ok but retryable (5xx)
      if (res.status < 500) return res;
    } catch (err) {
      if (i === retries) throw err;
    }
    await new Promise(r => setTimeout(r, delayMs * (i + 1)));
  }
  throw new Error("fetchWithRetry: all retries exhausted");
}

// ── CORS ──────────────────────────────────────────────────────────────────────
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── Main handler ──────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    // ── Auth ────────────────────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "missing_auth", message: "Authorization header required" }),
        { status: 401, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    const { data: { user }, error: authErr } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (authErr || !user) {
      return new Response(
        JSON.stringify({ error: "invalid_auth", message: "Invalid or expired token" }),
        { status: 401, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    // ── Parse request ───────────────────────────────────────────────────────
    const body = await req.json().catch(() => ({}));
    const { session_id, config, target_width, target_height } = body as {
      session_id?: string;
      config?: Record<string, unknown>;
      target_width?: number;
      target_height?: number;
    };

    if (!session_id) {
      return new Response(
        JSON.stringify({ error: "validation_error", message: "session_id is required" }),
        { status: 400, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    // ── Legge la sessione ───────────────────────────────────────────────────
    const { data: session, error: sessionErr } = await supabase
      .from("render_sessions")
      .select("*")
      .eq("id", session_id)
      .single();

    if (sessionErr || !session) {
      return new Response(
        JSON.stringify({ error: "not_found", message: "Sessione non trovata" }),
        { status: 404, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    // FIX P1.3: verifica tenant access tramite helper impersonation-aware.
    // L'helper considera: (a) super_admin → accesso globale, (b) impersonation
    // attiva in active_impersonations, (c) fallback profiles.company_id.
    // Il vecchio pattern basato solo su profiles.company_id bloccava i
    // superadmin che lavoravano in impersonazione.
    const allowed = await canAccessCompany(
      supabase,
      user.id,
      session.company_id as string,
    );
    if (!allowed) {
      return new Response(
        JSON.stringify({ error: "forbidden", message: "Accesso negato alla sessione render" }),
        { status: 403, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    // ── Controlla e deduce crediti (v3: audit ledger + FIFO revenue tracking) ──
    // Helper shared: prova v3 → v2 → v1 per backward-compat con ambienti
    // pre-migrazione. v3 scrive render_credit_ledger con session_id + user_id.
    const deductResult = await deductRenderCreditSafe(supabase, {
      companyId: session.company_id as string,
      sessionId: session_id,
      userId:    user.id,
      reasonMeta: { vertical: "infissi", edge_fn: "generate-render" },
      logTag:    "generate-render",
    });

    if (deductResult.status === "insufficient") {
      return new Response(
        JSON.stringify({ error: "insufficient_credits", message: "Crediti render insufficienti" }),
        { status: 402, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    const revenueEur = deductResult.revenue_eur;
    const purchaseId = deductResult.purchase_id;

    // ── Aggiorna sessione: processing ───────────────────────────────────────
    await supabase
      .from("render_sessions")
      .update({ status: "processing", processing_started_at: new Date().toISOString() })
      .eq("id", session_id);

    // ── Prepara immagine input (resize server-side A4) ──────────────────────
    // target_width/target_height sono gli hint originali dal client (foto iPhone,
    // upload utente). Se > 1600 lato lungo, applichiamo Supabase transform per
    // ridurre input tokens e costo API (enorme risparmio).
    const originalPath = session.original_photo_url as string;
    const prepared = await prepareInputImage({
      supabase,
      bucket: "render-originals",
      originalPath,
      hintWidth: target_width,
      hintHeight: target_height,
    });
    const imageUrl = prepared.url;

    // ── Build prompt v6 ─────────────────────────────────────────────────────
    // Bridge v1 → v6: se config è flat (vecchio formato), avvolgilo in
    // nuovo_infisso per compatibilità con buildPromptFromConfig v6
    const rawConfig = (config || (session.config as Record<string, unknown>) || {}) as Record<string, unknown>;

    const renderConfig: Record<string, unknown> = rawConfig.nuovo_infisso
      ? rawConfig // già formato v6
      : {
          nuovo_infisso: {
            materiale: rawConfig.materiale || "pvc",
            colore: {
              ral: "9016",
              nome: String(rawConfig.colore || "bianco").replace(/-/g, " "),
              finitura: "liscio_opaco",
            },
            colore_mode: "ral",
            profilo: { dimensione: "70mm", forma: "europeo" },
            vetro: {
              tipo: rawConfig.vetro || "trasparente",
              prompt_fragment: "double glazed clear glass",
            },
            ferramenta: {
              maniglia_stile: "classica_dritta",
              colore_hardware_id: "cromo_lucido",
              colore_hardware_finish: "polished chrome",
            },
            cerniere: { tipo: "europea", colore: "argento", num_per_anta: 2 },
            num_ante: Number(rawConfig.numero_ante) || 2,
            stile_telaio: "europeo_classico",
            sostituzione: { infissi: true, cassonetto: false, tapparella: false },
          },
          apertura_default: rawConfig.apertura || "battente_2_ante",
          notes: String(rawConfig.note_libere || ""),
        };

    // buildPromptFromConfig v6 riceve session-like object con .config e .foto_analisi
    const sessionLike = {
      ...session,
      config: renderConfig,
      foto_analisi: (session as Record<string, unknown>).foto_analisi || {},
    };

    const { systemPrompt, userPrompt, negativePrompt, promptVersion, blocks } =
      buildPromptFromConfig(sessionLike);

    // ── Legge provider config e API key ─────────────────────────────────────
    const { data: providerConfig } = await supabase
      .from("render_provider_config")
      .select("*")
      .eq("is_default", true)
      .eq("is_active", true)
      .single();

    if (!providerConfig) {
      throw new Error("Nessun provider render attivo. Configurare in Admin > Impostazioni AI > Render.");
    }

    const platformKeyName = `render_${providerConfig.provider_key}_api_key`;
    const { data: keyRow } = await supabase
      .from("platform_settings")
      .select("value")
      .eq("key", platformKeyName)
      .maybeSingle();

    // Fallback chain: DB platform_settings → Supabase edge function secret (env)
    // Env names:  OPENAI_API_KEY, GEMINI_API_KEY, ANTHROPIC_API_KEY
    const envName = `${providerConfig.provider_key.toUpperCase()}_API_KEY`;
    const apiKey =
      (keyRow as { value: string } | null)?.value?.trim() ||
      Deno.env.get(envName)?.trim() ||
      "";
    if (!apiKey) {
      throw new Error(
        `API key mancante per provider '${providerConfig.provider_key}'.` +
        ` Configurarla in Admin > Impostazioni AI > Render o come Supabase secret ${envName}.`
      );
    }

    // ── Chiama il provider AI ───────────────────────────────────────────────
    let imageData: string | null = null;
    let providerRawResponse: Record<string, unknown> = {};

    if (providerConfig.provider_key === "openai") {
      const imgResp = await fetchWithTimeout(imageUrl, {}, 30_000);
      const imgBlob = await imgResp.blob();

      // A5 fix: size output calcolata sulle dims ridotte (max 1600 lato lungo),
      // non sulle dims iPhone originali. Mai > 1600x1600.
      const renderSize = pickProviderSize(
        prepared.effective_width,
        prepared.effective_height,
        "openai",
      ) ?? resolveRenderSize(target_width, target_height);

      // Build form factory so we can rebuild on retry (FormData non rispedibile)
      const buildForm = (modelName: string) => {
        const form = new FormData();
        form.append("model", modelName);
        form.append("prompt", userPrompt);
        // Param name differisce: gpt-image-1 usa "image[]" (array, supporta multi
        // input), dall-e-2 usa "image" singolo. Il file deve essere PNG/JPG < 4MB.
        // dall-e-2 in /images/edits richiede tecnicamente un PNG quadrato + mask,
        // ma l'endpoint accetta JPG senza mask trattando l'intera area come
        // editabile — è quello che vogliamo qui (edit totale con prompt).
        if (modelName === "dall-e-2") {
          form.append("image", imgBlob, "photo.png");
        } else {
          form.append("image[]", imgBlob, "photo.jpg");
        }
        form.append("n", "1");
        // dall-e-2 supporta solo size 256/512/1024 square, quindi forziamo 1024x1024
        const sizeForModel = modelName === "dall-e-2" ? "1024x1024" : renderSize;
        form.append("size", sizeForModel);
        // dall-e-2 non accetta "response_format" con valore "b64_json" in /edits
        // per alcuni client: lo teniamo su dall-e-2 perché in realtà è supportato;
        // gpt-image-1 invece restituisce sempre b64, quindi il parametro è no-op.
        if (modelName !== "gpt-image-1") {
          form.append("response_format", "b64_json");
        }
        return form;
      };

      // Model fallback chain: se il modello configurato non è accessibile
      // (Tier/verification mancante), OpenAI risponde "Invalid value: 'gpt-image-1'.
      // Value must be 'dall-e-2'." → facciamo retry con dall-e-2 automaticamente.
      // Questo evita che il demo / account non verificati vedano il render fallire
      // senza spiegazioni.
      const modelChain = [providerConfig.model];
      if (providerConfig.model !== "dall-e-2") modelChain.push("dall-e-2");

      let resp: Response | null = null;
      let lastErr = "";
      let modelUsed = providerConfig.model;
      for (const m of modelChain) {
        const r = await fetchWithRetry(
          "https://api.openai.com/v1/images/edits",
          {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}` },
            body: buildForm(m),
          },
        );
        if (r.ok) {
          resp = r;
          modelUsed = m;
          break;
        }
        const txt = await r.text();
        lastErr = `OpenAI error ${r.status}: ${txt.substring(0, 300)}`;
        // Retry solo se l'errore è model-access (invalid_value sul param model)
        const isModelAccessIssue =
          txt.includes("invalid_value") && txt.includes("\"model\"");
        if (!isModelAccessIssue) throw new Error(lastErr);
      }
      if (!resp) throw new Error(lastErr || "OpenAI: tutti i model tentati sono falliti");

      const oaiData = await resp.json();
      providerRawResponse = { ...oaiData, _model_used: modelUsed } as Record<string, unknown>;
      const b64 = oaiData.data?.[0]?.b64_json;
      if (b64) imageData = `data:image/png;base64,${b64}`;

    } else if (providerConfig.provider_key === "gemini") {
      const imgResp = await fetchWithTimeout(imageUrl, {}, 30_000);
      const imgBuffer = await imgResp.arrayBuffer();
      const imgB64 = btoa(String.fromCharCode(...new Uint8Array(imgBuffer)));

      const geminiBody = {
        contents: [{
          parts: [
            { text: systemPrompt + "\n\n" + userPrompt },
            { inline_data: { mime_type: "image/jpeg", data: imgB64 } },
          ],
        }],
        generationConfig: {
          responseModalities: ["IMAGE", "TEXT"],
          temperature: 1,
        },
      };

      const geminiUrl = `${providerConfig.api_endpoint}/${providerConfig.model}:generateContent?key=${apiKey}`;
      const resp = await fetchWithRetry(
        geminiUrl,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(geminiBody),
        },
      );

      if (!resp.ok) {
        const err = await resp.text();
        throw new Error(`Gemini error ${resp.status}: ${err.substring(0, 300)}`);
      }

      const gemData = await resp.json();
      providerRawResponse = gemData as Record<string, unknown>;
      const parts = gemData.candidates?.[0]?.content?.parts ?? [];
      for (const part of parts) {
        if (part.inlineData?.mimeType?.startsWith("image/")) {
          imageData = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
          break;
        }
      }

    } else {
      throw new Error(
        `Provider '${providerConfig.provider_key}' non supportato. Selezionare OpenAI o Gemini.`
      );
    }

    if (!imageData) {
      throw new Error("Nessuna immagine ricevuta dal provider AI");
    }

    // ── Upload risultato su Storage ─────────────────────────────────────────
    const base64Data = imageData.replace(/^data:image\/\w+;base64,/, "");
    const uint8 = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
    const resultPath = `${session.company_id}/${session_id}/render_${Date.now()}.png`;

    const { error: uploadErr } = await supabase.storage
      .from("render-results")
      .upload(resultPath, uint8, {
        contentType: "image/png",
        upsert: true,
      });

    if (uploadErr) {
      throw new Error(`Errore upload risultato: ${uploadErr.message}`);
    }

    const { data: publicUrlData } = supabase.storage
      .from("render-results")
      .getPublicUrl(resultPath);

    const resultUrl = publicUrlData.publicUrl;

    // ── Capture costo reale API (B2) ────────────────────────────────────────
    // Provo a leggere il pricing da render_provider_pricing (migration B1).
    // Se fallisce (pricing non definito / parsing response errato), fallback
    // su legacy providerConfig.cost_real_per_render.
    const legacyCostReal = Number(providerConfig.cost_real_per_render ?? 0.04);
    const capture = await captureRealCost({
      supabase,
      providerKey: providerConfig.provider_key,
      model: providerConfig.model,
      rawResponse: providerRawResponse,
      legacyFallbackEur: legacyCostReal,
    });

    // ── Aggiorna render_sessions: completed ─────────────────────────────────
    const costReal = capture.cost_eur;
    const costBilled = providerConfig.cost_billed_per_render ?? 0.10;
    const activeConfig = sessionLike.config as Record<string, unknown>;
    const ni = (activeConfig?.nuovo_infisso as Record<string, unknown>) || {};

    // Update in due fasi per essere robusto se migration economics non
    // ancora applicata (retrocompat deploy order-independent).
    const legacyUpdate = {
      status: "completed",
      result_urls: [resultUrl],
      prompt_used: userPrompt,
      prompt_blocks: blocks,
      prompt_version: promptVersion,
      prompt_char_count: (systemPrompt + userPrompt).length,
      provider_key: providerConfig.provider_key,
      cost_real: costReal,
      cost_billed: costBilled,
      config_snapshot: activeConfig,
      processing_completed_at: new Date().toISOString(),
    };

    const economicsUpdate = {
      cost_real_api: costReal,
      revenue_eur: revenueEur,
      provider_usage: capture.usage,
      provider_model: capture.model,
      provider_request_id: capture.request_id,
      vertical: "infissi",
      meta: {
        purchase_id: purchaseId,
        input_image: prepared.meta,
        provider_size_used: providerConfig.provider_key === "openai"
          ? (pickProviderSize(prepared.effective_width, prepared.effective_height, "openai") ?? null)
          : null,
      },
    };

    // Prova prima con tutti i campi. Se fallisce (migration non applicata),
    // retry solo legacy — l'update legacy è garantito dallo schema esistente.
    const fullUpdate = await supabase
      .from("render_sessions")
      .update({ ...legacyUpdate, ...economicsUpdate })
      .eq("id", session_id);

    if (fullUpdate.error) {
      console.warn(
        "[generate-render] economics columns missing, fallback to legacy update:",
        fullUpdate.error.message
      );
      await supabase
        .from("render_sessions")
        .update(legacyUpdate)
        .eq("id", session_id);
    }

    // ── Incrementa contatore provider ───────────────────────────────────────
    await supabase
      .from("render_provider_config")
      .update({ renders_generated: (providerConfig.renders_generated ?? 0) + 1 })
      .eq("id", providerConfig.id);

    // ── Inserisce in render_gallery ─────────────────────────────────────────
    const tagMat = (ni.materiale as string) || (activeConfig?.materiale as string) || null;
    const tagCol = ((ni.colore as Record<string, string>)?.nome) || (activeConfig?.colore as string) || null;
    await supabase.from("render_gallery").insert({
      company_id: session.company_id,
      session_id,
      created_by: user.id,
      title: `Render ${new Date().toLocaleDateString("it-IT")}`,
      original_url: session.original_photo_url,
      render_url: resultUrl,
      tags: [tagMat, tagCol].filter(Boolean),
    });

    return new Response(
      JSON.stringify({
        success: true,
        session_id,
        result_url: resultUrl,
        provider: providerConfig.provider_key,
        cost_billed: costBilled,
        prompt_version: promptVersion,
        prompt_char_count: (systemPrompt + userPrompt).length,
      }),
      { status: 200, headers: { ...CORS, "Content-Type": "application/json" } }
    );

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[generate-render] error:", msg);

    try {
      const body2 = await req.clone().json().catch(() => ({}));
      const sid = (body2 as { session_id?: string }).session_id;
      if (sid) {
        await supabase
          .from("render_sessions")
          .update({ status: "failed", error_message: msg })
          .eq("id", sid);
      }
    } catch { /* ignore */ }

    return new Response(
      JSON.stringify({ error: "render_failed", message: msg }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } }
    );
  }
});
