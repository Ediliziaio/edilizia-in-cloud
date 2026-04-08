// ═══════════════════════════════════════════════════════════════════
// PROMPT MASTER — Sistema a Blocchi (A–N) per Sostituzione Strutturale Infissi
// Versione: 6.0.0 — Edilizia in Cloud port
// ═══════════════════════════════════════════════════════════════════

import type { ColorMode } from "@/components/render/RalColorPicker";
import type { WoodEffect } from "@/components/render/RalColorPicker";
import { formatColorPrompt } from "@/components/render/RalColorPicker";
import type { ManigliaStile } from "@/components/render/ManigliaSelector";
import { MANIGLIE } from "@/components/render/ManigliaSelector";

// ─── Type Enums ───────────────────────────────────────────────────

export type TipoApertura =
  | "battente_1_anta"
  | "battente_2_ante"
  | "battente_3_ante"
  | "scorrevole"
  | "scorrevole_alzante"
  | "vasistas"
  | "anta_ribalta"
  | "bilico"
  | "fisso"
  | "portafinestra"
  | "cassonetto_integrato";

export type MaterialeAttuale =
  | "legno_vecchio"
  | "legno_verniciato"
  | "alluminio_anodizzato"
  | "alluminio_verniciato"
  | "pvc_bianco"
  | "pvc_colorato"
  | "ferro"
  | "acciaio"
  | "sconosciuto";

export type MaterialeNuovo =
  | "pvc"
  | "alluminio"
  | "legno"
  | "legno_alluminio"
  | "acciaio_corten"
  | "acciaio_minimale";

export type StileEdificio =
  | "moderno"
  | "classico"
  | "industriale"
  | "rurale"
  | "liberty"
  | "anni_60_70"
  | "contemporaneo"
  | "storico";

export type ProfiloTelaioSize = "70mm" | "82mm" | "92mm";
export type ProfiloForma = "squadrato" | "arrotondato" | "europeo";

// Legacy types kept for backward compat
export type ManigliaType = "leva_alluminio" | "leva_acciaio" | "pomolo" | "alzante";
export type ColoreFerratura = "argento" | "nero_opaco" | "inox" | "bronzo" | "oro";

// ─── v5 Types ─────────────────────────────────────────────────────

export type CernieraColore = "argento" | "nero_opaco" | "inox" | "bronzo" | "oro" | "uguale_maniglia";
export type CassonettoMateriale = "pvc_tradizionale" | "pvc_slim" | "pvc_integrato" | "alluminio_coibentato";
export type TapparellaMateriale = "pvc_avvolgibile" | "alluminio_avvolgibile" | "microforata" | "persiana_alluminio" | "veneziana_integrata" | "nessuna";

export type CinghiaMode = "con_cinghia" | "senza_cinghia" | "con_catenella" | "con_manovella";

export type StileTelaio =
  | "nodo_ridotto"
  | "nodo_ridotto_maniglia_centrale"
  | "minimal_squadrato"
  | "classico_arrotondato"
  | "europeo_classico"
  | "arco_sagomato";

export type SostituzioneSelezione = {
  infissi: boolean;
  cassonetto: boolean;
  tapparella: boolean;
};

// ─── Interfaces ───────────────────────────────────────────────────

export interface FotoAnalisi {
  tipo_apertura: TipoApertura;
  materiale_attuale: MaterialeAttuale;
  colore_attuale: string;
  condizioni: "buone" | "usurato" | "danneggiato" | "fatiscente";
  num_ante_attuale: number;
  spessore_telaio: string;
  presenza_cassonetto: boolean;
  tipo_cassonetto: string;
  colore_cassonetto_attuale?: string;
  tipo_vetro_attuale: string;
  presenza_tapparella?: boolean;
  tipo_tapparella_attuale?: string;
  colore_tapparella_attuale?: string;
  stile_edificio: StileEdificio | string;
  materiale_muro: string;
  colore_muro: string;
  presenza_davanzale: boolean;
  tipo_davanzale?: string;
  presenza_inferriata: boolean;
  piano: string;
  luce: string;
  angolo_ripresa: string;
  note_aggiuntive?: string;
}

export interface ColoreConfig {
  nome: string;
  ral?: string;
  ncs?: string;
  hex?: string;
  finitura: "liscio_opaco" | "liscio_lucido" | "venatura_legno" | "spazzolato" | "satinato" | "goffrato";
}

export interface ProfiloTelaio {
  dimensione: ProfiloTelaioSize;
  camere: number;
  forma: ProfiloForma;
}

export interface CerniereConfig {
  num_per_anta: 2 | 3;
  colore: CernieraColore;
  tipo: "europea" | "a_libro" | "invisibile";
}

export interface CassonettoConfig {
  azione: "mantieni" | "rimuovi" | "sostituisci";
  materiale?: CassonettoMateriale;
  colore?: ColoreConfig;
  colore_mode?: ColorMode;
  colore_wood_effect?: WoodEffect;
  dimensione_h?: number;
  prompt_fragment?: string;
}

export interface TapparellaConfig {
  azione: "mantieni" | "rimuovi" | "sostituisci";
  materiale?: TapparellaMateriale;
  colore?: ColoreConfig;
  colore_mode?: ColorMode;
  colore_wood_effect?: WoodEffect;
  colore_guide?: ColoreConfig;
  stato_render?: "aperta" | "chiusa" | "mezza";
  cinghia?: CinghiaMode;
  prompt_fragment?: string;
}

export interface VetroConfig {
  tipo: string;
  prompt_fragment?: string;
}

export interface OscuranteConfig {
  tipo: string;
  prompt_fragment?: string;
}

export interface FerramentaConfig {
  // Legacy fields
  maniglia?: ManigliaType;
  colore?: ColoreFerratura;
  // v5 fields
  maniglia_stile?: ManigliaStile;
  colore_hardware_id?: string;
  colore_hardware_finish?: string;
}

export interface TrasformazioneApertura {
  attiva: boolean;
  tipo_originale: TipoApertura;
  tipo_target: TipoApertura;
  num_ante_target?: number;
}

export interface NuovoInfisso {
  materiale: MaterialeNuovo;
  colore: ColoreConfig;
  colore_mode?: ColorMode;
  colore_wood_effect?: WoodEffect;
  profilo: ProfiloTelaio;
  cerniere: CerniereConfig;
  vetro: VetroConfig;
  oscurante?: OscuranteConfig;
  cassonetto: CassonettoConfig;
  tapparella: TapparellaConfig;
  ferramenta: FerramentaConfig;
  num_ante?: number;
  sostituzione: SostituzioneSelezione;
  stile_telaio?: StileTelaio;
  trasformazione?: TrasformazioneApertura;

  // v6: Colore cassonetto (top-level)
  cass_colore_mode?: ColorMode;
  cass_colore?: { name: string; ral: string; hex: string } | null;
  cass_wood_effect?: WoodEffect | null;

  // v6: Colore tapparella (top-level)
  tap_colore_mode?: ColorMode;
  tap_colore?: { name: string; ral: string; hex: string } | null;
  tap_wood_effect?: WoodEffect | null;

  // v6: Dimensioni immagine originale
  original_image_width?: number;
  original_image_height?: number;
}

export interface RenderOptions {
  notes?: string;
}

export interface RenderConfigV2 {
  foto_analisi: FotoAnalisi;
  nuovo_infisso: NuovoInfisso;
  options?: RenderOptions;
}

// Legacy interface kept for backward compat
export interface RenderConfig {
  materiale?: string;
  colore?: string;
  stile?: string;
  vetro?: string;
  oscurante?: string;
  ante?: number;
  note?: string;
  fragments: {
    materiale?: string;
    colore?: string;
    stile?: string;
    vetro?: string;
    oscurante?: string;
  };
}

// ─── Material Physics Dictionary ──────────────────────────────────

const MATERIAL_PHYSICS: Record<MaterialeNuovo, string> = {
  pvc: "white or colored PVC (polyvinyl chloride) frame — smooth matte surface with very slight plastic texture under direct light, internal multi-chamber structure visible at frame cross-section edges, corners welded with subtle seam lines, uniform color throughout without natural grain, exterior surface shows shallow surface relief from extrusion process",
  alluminio: "extruded aluminum frame — anodized or powder-coated exterior, sharp precise 90° or slightly beveled edges, clearly visible thermal break (dark polyamide strip, approximately 3-5mm wide) between inner and outer shells at frame cross-section, surface shows very subtle directional micro-texture from coating process, thin elegant profile (typically 50-65mm visible sight line width), consistent metallic finish",
  legno: "solid wood frame — clearly visible natural wood grain running along the frame length, slightly rounded milled edges, paint or opaque stain finish showing faint grain texture beneath the coating, traditional mortise-and-tenon visible corner joint geometry (slight raised line at 45° miter), warm organic color variation, thicker profile (68-92mm sight line), possible hairline micro-cracks at painted corners",
  legno_alluminio: "hybrid timber-aluminum composite frame — interior side shows solid wood with warm grain and stain finish, exterior side shows slim precision-extruded aluminum cladding with powder-coated finish, visible thin shadow line at the wood-aluminum transition edge, combines warmth of interior wood aesthetic with weather-resistant modern aluminum exterior",
  acciaio_corten: "Corten weathering steel frame — unmistakable rust-orange patina with rough oxidized surface texture and natural color variation from dark rust-red to lighter orange-tan, ultra-thin sight line profiles (25-35mm visible width), industrial precise geometric form, characteristic streaking pattern typical of Cor-Ten oxidation",
  acciaio_minimale: "ultra-minimal structural steel frame — extremely thin sight lines (15-25mm), deep matte black or dark anthracite powder-coated surface, machined precise geometric edges, nearly frameless appearance with maximum glass-to-frame ratio, industrial modern aesthetic, tiny cap screws or concealed fixings visible at mullion intersections",
};

// ─── Apertura Descriptions ────────────────────────────────────────

const APERTURA_DESCRIPTION: Record<TipoApertura, string> = {
  battente_1_anta: "single-leaf inward-opening casement window — ONE sash panel hinged on the LEFT or RIGHT side, operated by a single lever handle on the opposite stile, 2 hinges visible on the hinge side stile (top and bottom), center-of-glass gasket line visible",
  battente_2_ante: "double-leaf inward-opening casement window — TWO equal sash panels meeting at center, each hinged on its outer side stile, 2 hinges per sash = 4 hinges total (2 visible on left stile, 2 on right stile), each sash has its own lever handle near the center meeting stile, center rebate/espagnolette bolt visible where panels meet",
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

// ─── v5 Dictionaries ──────────────────────────────────────────────

const CASSONETTO_MATERIAL_DESC: Record<CassonettoMateriale, string> = {
  pvc_tradizionale: "traditional PVC roller shutter housing (cassonetto PVC standard) — rectangular box profile protruding 160-200mm above window top rail, face panel approximately 200mm tall, smooth matte PVC surface with subtle panel seam line, bottom strip slightly recessed where shutter curtain exits, same extrusion quality as PVC window frame",
  pvc_slim: "slim-profile PVC cassonetto — reduced-depth housing only 110-130mm visible height above frame, lower profile ratio for modern facades, smooth face panel with minimal protrusion (80-100mm from wall), contemporary proportions matching thin-profile frame systems",
  pvc_integrato: "wall-integrated cassonetto (cassonetto a muro/incassato) — fully recessed into masonry, only the bottom inspection strip approximately 30-40mm visible below wall surface level, wall plaster or cladding runs continuously over the housing, virtually invisible from exterior — only a thin reveal line marks its position",
  alluminio_coibentato: "insulated aluminum cassonetto — aluminum face panels with powder-coated finish matching or contrasting frame, visible side inspection cover flanges at 45° angles, polyurethane foam fill (not visible but implied by professional thermal appearance), face panel 170-210mm height, crisp machined edges and corners",
};

const TAPPARELLA_DESC: Record<string, string> = {
  pvc_avvolgibile: "PVC roll-up shutter curtain — horizontal extruded PVC slats 37-55mm wide, each slat with smooth rounded upper edge and male-female interlocking lower edge, uniform matte colored surface with very subtle extrusion line texture running horizontally, bottom end-rail heavier profile (40-60mm) with integrated rubber seal and lift lug, side guide channels (guide) visible as thin U-profile strips on left and right jamb faces, total curtain thickness approximately 8-12mm",
  alluminio_avvolgibile: "aluminum roll-up shutter curtain — extruded aluminum foam-filled slats 37-55mm wide, slightly metallic surface sheen compared to PVC, slat walls approximately 1.2-1.5mm thick with visible interior foam at side edges when looked at obliquely, crisp precise slat-to-slat joints, heavier appearance than PVC equivalent, bottom bar with EPDM rubber weatherstrip, side guide channels in matching anodized or powder-coated aluminum",
  microforata: "microperforated roll-up shutter — same slat profile as standard PVC/aluminum avvolgibile but with regular grid of circular perforations 3-4mm diameter at approximately 6-8mm centers, perforation pattern creates a screenprint-like texture visible across the curtain surface, light passes through holes creating dappled interior light, retains privacy from outside while allowing partial outward vision from inside",
  persiana_alluminio: "aluminum louvered shutter (persiana avvolgibile) — horizontal extruded aluminum slats 60-80mm wide with traditional shutter profile (S-curve cross-section), visible twin pivot pins at each slat end inserted into side guide channels, slats appear at consistent angle (typically 30-45° open or closed), side channel guides are deeper (40-50mm) than standard roller guides, traditional Mediterranean aesthetic, bottom rail is a solid bar connecting all slat pivots",
  veneziana_integrata: "integral blind between glazing (tendina veneziana integrata) — visible only as a series of very thin parallel horizontal lines 25mm apart suspended between the two glass panes inside the double-glazing unit, slat lines cast faint shadow on interior glass surface, operated by a small external thumb-wheel or magnetic control on frame edge, no external mechanism visible, glass still appears transparent with blind fully open, gives ultra-minimal modern look",
  nessuna: "No shutter or blind — bare window frame only with no additional covering system.",
};

const CERNIERA_DESC: Record<string, string> = {
  europea: "Standard European butt hinge (cerniera europea) — two rectangular steel plates approximately 50×35mm each, 3 countersunk screws per plate, polished or coated to match hardware, central pin knuckle approximately 8mm diameter, hinge projects 3-4mm from frame face when closed",
  a_libro: "Book-fold concealed hinge (cerniera a libro) — when door/window is closed hinge is partially recessed into frame rebate, only the outer knuckle visible as a thin strip approximately 6mm × 40mm, appears more elegant and flush than standard hinge",
  invisibile: "Fully concealed pivot hinge (cerniera invisibile/nascosta) — completely hidden inside frame rebate when window is closed, no visible hardware on frame face, only a very faint rebate shadow line indicates hinge location, premium invisible appearance",
};

const CERNIERA_COLORE_DESC: Record<CernieraColore, string> = {
  argento: "silver polished chrome finish",
  nero_opaco: "matte black finish",
  inox: "brushed stainless steel finish",
  bronzo: "antique bronze finish",
  oro: "polished gold/brass finish",
  uguale_maniglia: "same finish as the window handle",
};

const CINGHIA_DESC: Record<CinghiaMode, string> = {
  con_cinghia: "Manual strap operation (cinghia manuale): show a flat 20-25mm wide fabric strap exiting the bottom of the cassonetto through a small rectangular strap guide (passante/archetto) mounted on the wall face adjacent to the window, approximately 120-150cm below cassonetto level. The strap hangs visibly down the wall face and may have a winding reel mounted on the wall.",
  senza_cinghia: "Electric motor operation (motorizzato): NO visible strap, NO strap guide on wall. Cassonetto and window appear completely clean on exterior. The electric motor is concealed inside the cassonetto housing — completely invisible from exterior.",
  con_catenella: "Chain operation (catenella): show a continuous loop ball-chain on one side of the shutter assembly, running through a small chain guide mounted at the side frame or wall jamb. Chain diameter approximately 4-5mm, metallic appearance.",
  con_manovella: "Crank handle operation (manovella): show a small folding crank handle receiver port (presa manovella) on the cassonetto face or side. The crank itself is not shown (stored indoors) but the receiver socket is visible.",
};

const STILE_TELAIO_DESC: Record<StileTelaio, string> = {
  nodo_ridotto: "ULTRA-SLIM NODO RIDOTTO: frame sight lines 25-35mm max, sash and fixed frame nearly flush, nearly frameless modern appearance",
  nodo_ridotto_maniglia_centrale: "ULTRA-SLIM NODO RIDOTTO WITH CENTRAL HANDLE: Frame sight lines: 25-35mm maximum. Sash nearly flush with fixed frame, minimal rebate step (~3mm). Central handle: horizontal bar or T-grip centered on bottom rail — NOT on side stile. Visual result: glass panels appear nearly frameless, completely symmetrical facade.",
  minimal_squadrato: "sharp-edged minimal frame, 90° squared profile, no chamfers or bevels, Bauhaus-inspired",
  classico_arrotondato: "traditional rounded-edge profile, 3-5mm radius, warm residential Italian style",
  europeo_classico: "classic European profile, traditional rebate, slight outer bevel",
  arco_sagomato: "arched/shaped frame following curved opening geometry",
};

// ─── Material Distinction ─────────────────────────────────────────

export function getMaterialDistinction(
  oldMat: MaterialeAttuale,
  newMat: MaterialeNuovo
): string {
  const oldDesc: Record<string, string> = {
    legno_vecchio: "aged unpainted or faded wood with visible weathering, cracks and grain",
    legno_verniciato: "painted wood with possible peeling or chipping paint",
    alluminio_anodizzato: "old anodized aluminum with dull silver or bronze tone",
    alluminio_verniciato: "painted aluminum with possible fading or chalking",
    pvc_bianco: "white PVC that may be yellowed or stained from UV exposure",
    pvc_colorato: "colored PVC with possible fading",
    ferro: "old iron frame with possible rust, heavy thick profile",
    acciaio: "steel frame, possibly with paint wear",
    sconosciuto: "existing frame material",
  };

  return `Remove the existing ${oldDesc[oldMat] || "old frame"} completely. Replace it with a brand new ${MATERIAL_PHYSICS[newMat]}. The material change should be clearly visible — this is a full structural replacement, not a repaint or overlay.`;
}

// ─── Block Builders (A–N) v6 ──────────────────────────────────────

function buildBlock_A(): string {
  return `[BLOCK A – ROLE & MISSION]
You are a SURGICAL PHOTOREALISTIC IMAGE EDITOR for architectural visualization. Your ONLY task: replace EXACTLY the specified building elements (window frames, roller box, shutters) while leaving EVERYTHING ELSE in the photo 100% pixel-perfect identical.
This is NOT image generation. This is NOT artistic interpretation. This is PRECISE SURGICAL REPLACEMENT of specific architectural elements.`;
}

function buildBlock_B(analisi: FotoAnalisi): string {
  return `[BLOCK B – EXISTING ELEMENTS INVENTORY]
Window/door type: ${APERTURA_DESCRIPTION[analisi.tipo_apertura] || analisi.tipo_apertura}
Current frame material: ${analisi.materiale_attuale}
Color: ${analisi.colore_attuale}
Condition: ${analisi.condizioni}
Panel count: ${analisi.num_ante_attuale}
Frame depth visible: ${analisi.spessore_telaio}
Glass: ${analisi.tipo_vetro_attuale}
Roller box (cassonetto): ${analisi.presenza_cassonetto ? 'YES — type: ' + analisi.tipo_cassonetto + ', color: ' + (analisi.colore_cassonetto_attuale || 'unknown') : 'NOT PRESENT'}
Shutter/blind (tapparella): ${analisi.presenza_tapparella ? 'YES — type: ' + (analisi.tipo_tapparella_attuale || 'unknown') + ', color: ' + (analisi.colore_tapparella_attuale || 'unknown') : 'NOT PRESENT'}
Building style: ${analisi.stile_edificio}
Wall: ${analisi.materiale_muro} (${analisi.colore_muro})
Sill: ${analisi.presenza_davanzale ? 'YES (' + (analisi.tipo_davanzale || 'unknown type') + ')' : 'NO'}
Security bars: ${analisi.presenza_inferriata ? 'YES' : 'NO'}
Floor: ${analisi.piano}
Lighting: ${analisi.luce}
Angle: ${analisi.angolo_ripresa}`;
}

function buildBlock_C(analisi: FotoAnalisi, infisso: NuovoInfisso): string {
  const sost = infisso.sostituzione;
  const items: string[] = [];

  if (sost.infissi) {
    const infissoColor = formatColorPrompt(
      infisso.colore_mode ?? "ral",
      infisso.colore_mode === "ral" && infisso.colore?.ral ? { ral: infisso.colore.ral, name: infisso.colore.nome, hex: infisso.colore.hex || "", group: "" } : null,
      infisso.colore_wood_effect ?? null
    );
    items.push(`✅ REPLACE window/door frame (infisso) → new finish: ${infissoColor}`);
  } else {
    items.push(`🚫 KEEP window/door frame exactly as in original photo`);
  }

  const c = infisso.cassonetto;
  if (sost.cassonetto) {
    if (c.azione === "rimuovi") {
      items.push(`✅ REMOVE cassonetto (roller shutter box) — fill with continuous wall surface`);
    } else if (c.azione === "sostituisci" && c.materiale) {
      const cassRalObj = infisso.cass_colore
        ? { ral: infisso.cass_colore.ral, name: infisso.cass_colore.name, hex: infisso.cass_colore.hex, group: "" }
        : (c.colore?.ral ? { ral: c.colore.ral, name: c.colore.nome, hex: c.colore.hex || "", group: "" } : null);
      const cassColor = formatColorPrompt(
        infisso.cass_colore_mode ?? c.colore_mode ?? "ral",
        cassRalObj,
        infisso.cass_wood_effect ?? c.colore_wood_effect ?? null
      );
      items.push(`✅ REPLACE cassonetto (roller shutter box above window) → new finish: ${cassColor}`);
    } else {
      items.push(`🚫 KEEP cassonetto exactly as in original photo`);
    }
  } else {
    items.push(`🚫 ${analisi.presenza_cassonetto ? 'KEEP existing cassonetto exactly as in photo' : 'No cassonetto present — do not add one'}`);
  }

  const t = infisso.tapparella;
  if (sost.tapparella) {
    if (t.azione === "rimuovi") {
      items.push(`✅ REMOVE tapparella (roller shutter slats) completely`);
    } else if (t.azione === "sostituisci" && t.materiale) {
      const tapRalObj = infisso.tap_colore
        ? { ral: infisso.tap_colore.ral, name: infisso.tap_colore.name, hex: infisso.tap_colore.hex, group: "" }
        : (t.colore?.ral ? { ral: t.colore.ral, name: t.colore.nome, hex: t.colore.hex || "", group: "" } : null);
      const tapColor = formatColorPrompt(
        infisso.tap_colore_mode ?? t.colore_mode ?? "ral",
        tapRalObj,
        infisso.tap_wood_effect ?? t.colore_wood_effect ?? null
      );
      items.push(`✅ REPLACE tapparella (roller shutter slats) → new finish: ${tapColor}`);
    } else {
      items.push(`🚫 KEEP tapparella exactly as in original photo`);
    }
  } else {
    items.push(`🚫 ${analisi.presenza_tapparella ? 'KEEP existing shutter exactly as in photo' : 'No shutter present — do not add one'}`);
  }

  return `[BLOCK C – REPLACEMENT MANIFEST]
EXACTLY these elements must change — NOTHING else:
${items.join("\n")}

⚠️ CRITICAL RULE: Every element marked 🚫 KEEP must be pixel-identical to the original.
⚠️ CRITICAL RULE: Every element marked ✅ REPLACE must be rendered with the EXACT specified finish.`;
}

function buildBlock_D(infisso: NuovoInfisso): string {
  if (!infisso.sostituzione.infissi) {
    return `[BLOCK D – FRAME MATERIAL — SKIPPED]\nFrame replacement not requested. Skip this block.`;
  }

  const mat = MATERIAL_PHYSICS[infisso.materiale];
  const colorMode = infisso.colore_mode || "ral";

  const colorDesc = formatColorPrompt(
    colorMode,
    colorMode === "ral" && infisso.colore ? { ral: infisso.colore.ral || "9016", name: infisso.colore.nome, hex: infisso.colore.hex || "#F1F0EB", group: "" } : null,
    colorMode === "legno" && infisso.colore_wood_effect ? infisso.colore_wood_effect : null
  );

  let block = `[BLOCK D – MATERIAL & COLOR SPECIFICATION]
Material: ${mat}
Color/finish: ${colorDesc}`;

  if (colorMode === "legno") {
    block += `

IMPORTANT — WOOD EFFECT RENDERING RULES:
- Do NOT render solid flat color — the frame MUST show visible wood grain texture
- Grain runs parallel to the frame members (vertical on stiles, horizontal on rails)
- The grain texture is embossed/subtle, NOT painted-on
- The effect is a PVC laminate foil — the frame is structurally PVC but visually wood
- Do NOT add knots or imperfections unless the specific wood type is known for them (Pine, Douglas)
- Keep the grain realistic but not exaggerated`;
  } else {
    block += `

IMPORTANT — SOLID COLOR RENDERING RULES:
- Render as smooth, flat, consistent RAL color
- No grain, no wood texture
- Correct specular highlights for the material (PVC: matte-satin, aluminium: satin-metallic)`;
  }

  return block;
}

function buildBlock_E(infisso: NuovoInfisso): string {
  if (!infisso.sostituzione.infissi) {
    return `[BLOCK E – FRAME PROFILE — SKIPPED]\nFrame replacement not requested. Skip this block.`;
  }

  const p = infisso.profilo;
  const sizeDesc: Record<ProfiloTelaioSize, string> = {
    "70mm": "70mm residential profile with 3 internal chambers, standard thermal insulation",
    "82mm": "82mm premium profile with 5 internal chambers, enhanced thermal insulation (Uw ~1.0)",
    "92mm": "92mm Passivhaus-grade profile with 7 internal chambers, maximum thermal insulation (Uw ~0.7)",
  };

  const stile = infisso.stile_telaio || "classico_arrotondato";
  const stileDesc = STILE_TELAIO_DESC[stile] || stile;
  const isCentrale = stile === "nodo_ridotto_maniglia_centrale";

  const numAnte = infisso.num_ante || 1;
  const cer = infisso.cerniere;
  const cernierePerLato = cer.num_per_anta;
  const cerniereTotal = cernierePerLato * numAnte;
  const cerTipoDesc = CERNIERA_DESC[cer.tipo] || cer.tipo;
  const cerColoreDesc = CERNIERA_COLORE_DESC[cer.colore] || cer.colore;

  return `[BLOCK E – FRAME PROFILE, GEOMETRY & STYLE]
Profile system: ${sizeDesc[p.dimensione]}
Style: ${stileDesc}
Number of opening panels (sashes): ${numAnte}

HINGE SPECIFICATION:
Total hinges: ${cerniereTotal} (${cernierePerLato} per sash × ${numAnte} sash${numAnte > 1 ? 'es' : ''})
Hinge type: ${cerTipoDesc}
Hinge color/finish: ${cerColoreDesc}
Position per sash: top hinge at 15-20% of sash height, bottom hinge at 80-85% of sash height
${cer.tipo !== 'invisibile' ? `Hinge plate: approx 50×35mm, ${cer.num_per_anta === 2 ? '2 screws/plate' : '3 screws/plate'}` : ''}
${cer.tipo === 'invisibile' ? 'Fully concealed — NOT visible from exterior' : 'Two plates visible on hinge-side stile'}
Cast correct shadow of hinge knuckle onto frame face and wall rebate.
${isCentrale ? `
CENTRAL HANDLE PLACEMENT:
Handle MUST be centered on bottom rail (horizontal center of glass panel)
NO handle on side stile — if rendered on side stile it is WRONG
Handle appears symmetric when viewed frontally` : ''}`;
}

function buildBlock_F(infisso: NuovoInfisso): string {
  if (!infisso.sostituzione.infissi) {
    return `[BLOCK F – GLASS — SKIPPED]\nFrame replacement not requested. Skip this block.`;
  }

  const v = infisso.vetro;
  return `[BLOCK F – GLASS UNIT]
${v.prompt_fragment || v.tipo}
Technical rendering requirements:
- Thin greenish tint at glass edge (typical of multi-pane low-iron or standard float glass)
- Specular highlight/reflection matching scene light source direction
- Interior appears as dark/neutral (curtains or room interior barely visible)
- Air gap line between panes invisible from exterior at normal viewing angle
- Spacer bar (15-16mm aluminum or warm-edge) visible only at perimeter inside rebate`;
}

function buildBlock_G(infisso: NuovoInfisso): string {
  if (!infisso.sostituzione.infissi) {
    return `[BLOCK G – HARDWARE — SKIPPED]\nFrame replacement not requested. Skip this block.`;
  }

  const f = infisso.ferramenta;

  if (f.maniglia_stile) {
    const manigliaEntry = MANIGLIE.find(x => x.stile === f.maniglia_stile);
    const manigliaPrompt = manigliaEntry?.prompt_fragment || `standard lever handle, ${f.colore_hardware_finish || "brushed stainless steel finish"}`;

    return `[BLOCK G – HARDWARE DETAILS]
Handle: ${manigliaPrompt}
Handle finish: ${f.colore_hardware_finish || "brushed stainless steel"}
Handle position: centered vertically on meeting stile for battente windows, lower-third for portafinestre
Espagnolette lock: multi-point locking system visible at frame rebate edge
All hardware must cast correct shadows matching scene lighting direction`;
  }

  // Legacy fallback
  const manigliaDesc: Record<ManigliaType, string> = {
    leva_alluminio: "aluminum lever handle — die-cast aluminum body with smooth matte or anodized finish, rectangular cross-section grip approximately 130mm long, 8mm square spindle",
    leva_acciaio: "stainless steel lever handle — precision-machined 316 stainless steel, satin brushed or mirror polish finish, slim ergonomic grip 120-140mm, premium minimalist aesthetic",
    pomolo: "round knob handle (pomolo) — spherical or cylindrical knob approximately 35-45mm diameter, compact low-profile, typically used on fixed panels or low-use windows",
    alzante: "lift-and-slide long lever handle 200-300mm with ergonomic palm grip and upward-lift-then-push-down mechanism, heavy-duty die-cast body for panel weights up to 400kg",
  };
  const coloreDesc: Record<ColoreFerratura, string> = {
    argento: "silver polished chrome finish",
    nero_opaco: "matte black finish",
    inox: "brushed stainless steel finish",
    bronzo: "antique bronze finish",
    oro: "polished gold/brass finish",
  };

  return `[BLOCK G – HARDWARE DETAILS]
Handle: ${manigliaDesc[f.maniglia || "leva_alluminio"]}
Handle color: ${coloreDesc[f.colore || "argento"]}
Handle position: centered on the meeting stile (vertical center of sash height) for battente windows, lower third for portafinestre
Espagnolette lock bar: concealed inside frame rebate, only the multi-point locking pins (3-4) visible at frame edge when window is shown open
Corner connectors: thin aluminum corner keys inside profile — not visible externally
Strikeplate: small 20×60mm metal plate recessed into frame face opposite handle — show subtle shadow`;
}

function buildBlock_H(analisi: FotoAnalisi, infisso: NuovoInfisso): string {
  const c = infisso.cassonetto;

  if (!infisso.sostituzione.cassonetto) {
    return `[BLOCK H – ROLLER BOX — NOT MODIFIED]\n${analisi.presenza_cassonetto ? 'Cassonetto present in photo — keep EXACTLY as-is, do not alter color, shape or position.' : 'No cassonetto in original photo — do not add one.'}`;
  }

  if (c.azione === "rimuovi") {
    return `[BLOCK H – ROLLER BOX REMOVAL]
Remove the entire cassonetto (roller shutter box) above the window. Replace with: continuous wall surface matching the exact wall texture, color, and material of the surrounding facade. The wall fill must be seamless — no visible ghost outline, shadow gap or discoloration where the box was. Match plaster texture, paint sheen level, aging/weathering exactly to surrounding wall.`;
  }

  if (c.azione === "sostituisci" && c.materiale) {
    const cassMode = infisso.cass_colore_mode ?? c.colore_mode ?? "ral";
    const cassWood = infisso.cass_wood_effect ?? c.colore_wood_effect ?? null;
    const cassRal = infisso.cass_colore
      ? { ral: infisso.cass_colore.ral, name: infisso.cass_colore.name, hex: infisso.cass_colore.hex, group: "" }
      : (c.colore?.ral ? { ral: c.colore.ral, name: c.colore.nome, hex: c.colore.hex || "", group: "" } : null);

    const cassColorDesc = formatColorPrompt(cassMode, cassRal, cassWood);
    const isWoodCass = cassMode === "legno";

    return `[BLOCK H – NEW ROLLER BOX (CASSONETTO)]
IMPORTANT: The cassonetto (roller shutter box housing) mounted above the window MUST be replaced.
Replace existing cassonetto with: ${CASSONETTO_MATERIAL_DESC[c.materiale]}
Target cassonetto finish: ${cassColorDesc}

${isWoodCass
  ? `CASSONETTO WOOD EFFECT RENDERING RULES:
- The cassonetto box MUST show visible wood grain texture on its visible face
- Grain orientation: horizontal (parallel to the top of the window)
- The cassonetto is covered with the same laminate foil as specified
- Do NOT render it as flat solid color — grain must be visible
- Match wood grain character to: ${cassWood?.name_en || cassWood?.name || "specified wood effect"}`
  : `CASSONETTO RAL COLOR RENDERING RULES:
- The cassonetto box MUST be rendered in the exact RAL color specified
- Render as smooth flat consistent tone — no grain, no texture
- The color must match RAL ${cassRal?.ral || "9016"} (${cassRal?.hex || "#F1F0EB"})
- Correct specular highlights for PVC surface (matte-satin)`
}

Cassonetto shape: keep EXACT same dimensions and proportions as existing cassonetto in photo.
Only the color/finish changes — NOT the shape, size, or position.
Position: directly above window top frame rail, face flush with or slightly proud of wall plane
Bottom reveal: show the shutter exit slot (approximately 15-20mm slit) at bottom of cassonetto face panel
Width: exactly matching window frame outer width
Side flanges: small triangular or stepped PVC/aluminum caps where cassonetto meets wall on left and right
Cast appropriate shadow from cassonetto protrusion onto wall below
CRITICAL: Do NOT leave the cassonetto in the original color if replacement was requested.`;
  }

  return `[BLOCK H – ROLLER BOX — MAINTAIN]\n${analisi.presenza_cassonetto ? 'Keep existing cassonetto exactly as photographed.' : 'No cassonetto in original photo — do not add one.'}`;
}

function buildBlock_I(analisi: FotoAnalisi, infisso: NuovoInfisso): string {
  const t = infisso.tapparella;

  if (!infisso.sostituzione.tapparella) {
    return `[BLOCK I – SHUTTER/BLIND — NOT MODIFIED]\n${analisi.presenza_tapparella ? 'Shutter/blind present in photo — keep EXACTLY as-is.' : 'No shutter/blind in original — do not add one.'}`;
  }

  if (t.azione === "rimuovi") {
    return `[BLOCK I – SHUTTER REMOVAL]
Remove the existing shutter/blind system completely. Show bare window frame with no shutter curtain, no side guides, no bottom bar. If guide channels were surface-mounted: remove them and show clean wall face.`;
  }

  if (t.azione === "sostituisci" && t.materiale) {
    const lines: string[] = [`[BLOCK I – NEW SHUTTER/BLIND SYSTEM]`];
    lines.push(`Install new: ${TAPPARELLA_DESC[t.materiale] || t.materiale}`);

    const tapMode = infisso.tap_colore_mode ?? t.colore_mode ?? "ral";
    const tapWood = infisso.tap_wood_effect ?? t.colore_wood_effect ?? null;
    const tapRal = infisso.tap_colore
      ? { ral: infisso.tap_colore.ral, name: infisso.tap_colore.name, hex: infisso.tap_colore.hex, group: "" }
      : (t.colore?.ral ? { ral: t.colore.ral, name: t.colore.nome, hex: t.colore.hex || "", group: "" } : null);

    const tapColorDesc = formatColorPrompt(tapMode, tapRal, tapWood);
    const isWoodTap = tapMode === "legno";

    lines.push(`Roller shutter finish: ${tapColorDesc}`);

    if (isWoodTap) {
      lines.push(`TAPPARELLA WOOD EFFECT: slats MUST show wood grain texture — grain runs horizontally across each slat. Do NOT render as solid color.`);
    } else {
      lines.push(`TAPPARELLA RAL COLOR: slats must be smooth flat ${tapRal?.name || "specified"} color — no grain`);
    }

    if (t.colore_guide) {
      lines.push(`Side guide channel color: ${t.colore_guide.nome}${t.colore_guide.ral ? ` (RAL ${t.colore_guide.ral})` : ""}`);
    } else {
      lines.push(`Side guide channel color: same as slats`);
    }
    const stato = t.stato_render || "chiusa";
    if (stato === "aperta") {
      lines.push("FULLY OPEN STATE: shutter curtain completely rolled up inside cassonetto — NO curtain visible below the cassonetto. Only side guide channels (guide) remain visible running down both sides of the window. Show empty guide channels with no curtain engaged.");
    } else if (stato === "mezza") {
      lines.push("HALF-OPEN STATE: shutter curtain partially lowered covering approximately lower 50% of glass height. Top of curtain visible inside guide channels at mid-height. Show slat texture and horizontal joint lines on lower curtain portion. Upper glass area clear and visible.");
    } else {
      lines.push("FULLY CLOSED STATE: shutter curtain completely lowered, covering the ENTIRE glass area from cassonetto bottom to windowsill level. Full slat texture visible across entire curtain face. Bottom bar resting on or near sill.");
    }
    lines.push("Guide channel width: approximately 16-20mm × 20-25mm deep, mounted on wall face or frame edge. Guide channel extends from cassonetto bottom to window sill level (or floor for portafinestre). Ensure guide channels are straight, parallel, and symmetrically positioned on both sides.");

    if (t.cinghia) {
      lines.push(`\nStrap/motor configuration: ${CINGHIA_DESC[t.cinghia]}`);
    }

    return lines.join("\n");
  }

  return `[BLOCK I – SHUTTER — MAINTAIN]\n${analisi.presenza_tapparella ? 'Keep existing shutter exactly as photographed.' : 'No shutter present — do not add one.'}`;
}

function buildBlock_J(analisi: FotoAnalisi): string {
  return `[BLOCK J – PIXEL-PERFECT ENVIRONMENT PRESERVATION]
The following MUST remain 100% unchanged — zero modification allowed:
- Wall: color (${analisi.colore_muro}), material (${analisi.materiale_muro}), texture, aging, stains, weathering
- Window sill: ${analisi.presenza_davanzale ? 'KEEP — same ' + (analisi.tipo_davanzale || 'material') + ', shape, shadow, any chips or weathering' : 'NOT PRESENT — do not add a sill'}
- Security bars: ${analisi.presenza_inferriata ? 'KEEP — maintain all bars at exact position, color, shadow' : 'NOT PRESENT — do not add bars'}
- Camera: preserve exact perspective, focal length, vanishing points (${analisi.angolo_ripresa})
- Surroundings: every pipe, cable, drain, crack, plant, neighboring window, balcony, street element
- Sky/background: identical — no color shift, no weather change
- Lighting: same direction, same ambient/diffuse ratio (${analisi.luce})`;
}

function buildBlock_K(analisi: FotoAnalisi): string {
  return `[BLOCK K – PHOTOREALISTIC LIGHTING & SHADOWS]
Lighting scene: ${analisi.luce}
Required shadow elements (all must be physically correct):
- Frame shadow: new frame profile casts shadow into wall rebate — depth approximately 15-25mm
- Hinge shadow: small cast shadow from each hinge knuckle on hinge-side stile face
- Handle shadow: lever or knob casts shadow on frame face — direction matches scene light
- Cassonetto shadow: ${analisi.presenza_cassonetto ? 'box face casts horizontal shadow onto wall below it — match overhang depth' : 'no cassonetto shadow'}
- Shutter shadow: if shutter partially open, hanging curtain edge casts shadow on window below
- Glass reflection: specular highlight on glass matches scene light direction, not perpendicular to camera
- Ambient occlusion: soft dark gradient in wall-to-frame rebate transition, in frame corners, under sill`;
}

function buildBlock_L(): string {
  return `[BLOCK L – ABSOLUTE NEGATIVE CONSTRAINTS]
NEVER DO any of the following — instant disqualification:
- ✗ Change wall color, texture, plaster pattern, or any facade element not explicitly requested
- ✗ Alter camera perspective, field of view, or tilt/shift
- ✗ Add elements absent in the original (plants, people, decorations, extra windows)
- ✗ Change sky color, cloud pattern, or weather conditions
- ✗ Produce cartoon, illustrated, or CGI-look artifacts
- ✗ Add text, watermarks, copyright marks, or any overlays
- ✗ Distort window proportions or change opening/glass dimensions
- ✗ Add hinges to fixed lights (fisso) — fixed panels have NO hinges
- ✗ Add shutters or cassonetto if replacement was NOT requested AND none existed in photo
- ✗ Change the number of window panes unless explicitly requested in config
- ✗ Make the result look like a 3D render — must be indistinguishable from real photograph`;
}

function buildBlock_M(analisi: FotoAnalisi, infisso: NuovoInfisso): string | null {
  const t = infisso.trasformazione;
  if (!t || !t.attiva) return null;

  const TRANSFORMATION_INSTRUCTIONS: Partial<Record<string, string>> = {
    "battente_2_ante→battente_1_anta": `Convert from double-leaf to single-leaf casement.
Remove the central mullion. Single sash occupies FULL opening width.
One set of hinges on left OR right side. One handle on opposite stile.
Opening size stays identical.`,
    "battente_2_ante→scorrevole": `Convert from inward-opening casement to horizontal sliding window.
Remove both casement sashes. Install sliding track top and bottom. Two sliding panels each ~50% of total opening width. No hinges visible.`,
    "portafinestra→scorrevole_alzante": `Convert from French door to lift-and-slide door.
Panels align flush with frame when closed. Very low-profile 15mm lift-and-slide threshold. Heavy-duty lift handle on leading panel edge. No hinges on side frame. Maximum glass area.`,
    "battente_1_anta→anta_ribalta": `Convert single casement to tilt-and-turn.
Same frame profile. Add tilt-and-turn handle (pointing sideways for closed position). Add friction scissors-arm stays on both side stiles. Bottom hinge: tilt pivot at bottom center.`,
    "battente_3_ante→battente_2_ante": `Convert triple-leaf to double-leaf casement.
Remove center fixed panel and mullion. Two opening sashes each ~50% of opening width. Central rebate line where sashes meet. Both sashes with handles.`,
  };

  const key = `${t.tipo_originale}→${t.tipo_target}`;
  const specificInstructions = TRANSFORMATION_INSTRUCTIONS[key] || "";

  return `[BLOCK M – OPENING TYPE TRANSFORMATION]
⚠ IMPORTANT: This render shows a TYPE TRANSFORMATION — the window opening type is being CHANGED.
CURRENT type (in photo): ${APERTURA_DESCRIPTION[t.tipo_originale] || t.tipo_originale}
NEW type to render: ${APERTURA_DESCRIPTION[t.tipo_target] || t.tipo_target}
${specificInstructions ? `\nTransformation details:\n${specificInstructions}` : ""}
Transformation: completely remove current configuration. Install new type within SAME rough opening dimensions. Masonry opening stays exactly the same — only the window product changes. Adjust hardware, hinges, and handles to match the new type.
CRITICAL: Keep IDENTICAL — wall opening, wall material, lintel, sill, all surroundings. ONLY the window product inside the opening changes.`;
}

// ─── Main Builder ─────────────────────────────────────────────────

export interface PromptResult {
  systemPrompt: string;
  userPrompt: string;
  negativePrompt: string;
  promptVersion: string;
  charCount: number;
  blocks: Record<string, string>;
}

export function buildRenderPromptV2(
  config: RenderConfigV2,
  _provider: string
): PromptResult {
  const { foto_analisi, nuovo_infisso, options } = config;

  const blocks: Record<string, string> = {
    A: buildBlock_A(),
    B: buildBlock_B(foto_analisi),
    C: buildBlock_C(foto_analisi, nuovo_infisso),
    D: buildBlock_D(nuovo_infisso),
    E: buildBlock_E(nuovo_infisso),
    F: buildBlock_F(nuovo_infisso),
    G: buildBlock_G(nuovo_infisso),
    H: buildBlock_H(foto_analisi, nuovo_infisso),
    I: buildBlock_I(foto_analisi, nuovo_infisso),
    J: buildBlock_J(foto_analisi),
    K: buildBlock_K(foto_analisi),
    L: buildBlock_L(),
  };

  const blockM = buildBlock_M(foto_analisi, nuovo_infisso);
  if (blockM) {
    blocks.M = blockM;
  }

  const systemPrompt = blocks.A;

  const cassAction = nuovo_infisso.sostituzione.cassonetto
    ? (nuovo_infisso.cassonetto.azione === "rimuovi" ? "REMOVE entirely" : `REPLACE with new ${nuovo_infisso.cassonetto.materiale || "cassonetto"}`)
    : "🚫 KEEP unchanged — do NOT alter";
  const tapAction = nuovo_infisso.sostituzione.tapparella
    ? (nuovo_infisso.tapparella.azione === "rimuovi" ? "REMOVE entirely" : `REPLACE with new ${nuovo_infisso.tapparella.materiale || "shutter"}`)
    : "🚫 KEEP unchanged — do NOT alter";

  blocks.N = `[BLOCK N – FINAL PRESERVATION CHECKLIST]
⚠️ BEFORE generating the output image, verify each element:
- WINDOW FRAME: REPLACE with new ${nuovo_infisso.materiale} frame as described above
- CASSONETTO (roller box above window): ${cassAction}
- TAPPARELLA (roller shutter curtain): ${tapAction}
- WALL, SILL, SURROUNDINGS: 🚫 MUST remain 100% identical to original photo
- IMAGE DIMENSIONS: 🚫 MUST match original photo exactly — no cropping, no resizing, no bars

CRITICAL RULE: Any element marked 🚫 KEEP must appear IDENTICAL to the original photo.
DO NOT remove, recolor, reshape, or alter any element marked 🚫 KEEP.
If the cassonetto is marked KEEP, it must remain exactly as in the original photo — same color, same shape, same position.`;

  const userParts = [blocks.B, blocks.C, blocks.D, blocks.E, blocks.F, blocks.G, blocks.H, blocks.I, blocks.J, blocks.K, blocks.L];
  if (blockM) userParts.push(blockM);
  userParts.push(blocks.N);
  if (options?.notes) {
    userParts.push(`[ADDITIONAL CLIENT NOTES]\n${options.notes}`);
  }
  const userPrompt = userParts.join("\n\n");

  const negativePrompt = [
    "cartoon", "illustration", "sketch", "watermark", "text overlay",
    "3D render", "CGI look", "oversaturated", "HDR effect", "vignette",
    "wrong number of window panes", "handles on wrong side", "hinges on fixed panels",
    "missing hinges", "wrong hinge count", "shutters not requested", "cassonetto not requested",
    "strap visible on motorized window",
    "wood grain on RAL solid color", "flat solid color on wood-effect foil", "wrong wood species grain pattern",
    "changed wall opening size", "moved lintel", "different rough opening",
    "changed wall color", "changed facade", "different building style",
    "altered perspective", "different weather", "different lighting",
    "cassonetto unchanged when replacement was requested",
    "wrong cassonetto color", "cassonetto same color as original when asked to change",
    "tapparella unchanged when replacement was requested",
    "resized or cropped original photo", "different image dimensions than original",
    "black bars added", "white bars added", "letterboxing", "pillarboxing",
  ].join(", ");

  const fullText = systemPrompt + userPrompt;

  return {
    systemPrompt,
    userPrompt,
    negativePrompt,
    promptVersion: "6.0.0",
    charCount: fullText.length,
    blocks,
  };
}

// ─── Legacy builder (kept for backward compat) ────────────────────

export function buildRenderPrompt(config: RenderConfig, _provider: string): {
  system: string;
  user: string;
  negative: string;
} {
  const parts: string[] = [];

  if (config.fragments.materiale) parts.push(config.fragments.materiale);
  if (config.fragments.colore) parts.push(config.fragments.colore);
  if (config.fragments.stile) parts.push(config.fragments.stile);
  if (config.fragments.vetro) parts.push(config.fragments.vetro);
  if (config.fragments.oscurante && config.fragments.oscurante !== "no shutters or blinds") {
    parts.push(config.fragments.oscurante);
  }
  if (config.ante && config.ante > 1) parts.push(`${config.ante}-panel window`);
  if (config.note) parts.push(config.note);

  const windowDesc = parts.join(", ");

  const system = `You are an expert architectural visualization AI. Your task is to replace the existing windows/doors in a building photograph with new ones while maintaining photorealistic quality. Keep the building structure, surroundings, lighting, and perspective exactly the same. Only replace the window/door frames and glass.`;
  const user = `Replace all visible windows in this photograph with: ${windowDesc}. Maintain exact same perspective, lighting conditions, wall texture, and surroundings. The result must look like a real photograph, not a rendering. Keep shadows consistent with the existing light direction.`;
  const negative = `cartoon, illustration, sketch, drawing, watermark, text overlay, blurry, distorted perspective, different building, changed wall color, unrealistic lighting`;

  return { system, user, negative };
}

// ─── Photo Validation ─────────────────────────────────────────────

export function validatePhoto(file: File): { valid: boolean; error?: string } {
  const validTypes = ["image/jpeg", "image/png", "image/webp"];
  if (!validTypes.includes(file.type)) {
    return { valid: false, error: "Formato non supportato. Usa JPG, PNG o WebP." };
  }
  if (file.size > 20 * 1024 * 1024) {
    return { valid: false, error: "File troppo grande. Massimo 20MB." };
  }
  if (file.size < 10 * 1024) {
    return { valid: false, error: "File troppo piccolo. Carica una foto di qualità." };
  }
  return { valid: true };
}

export async function checkImageDimensions(file: File): Promise<{ width: number; height: number; valid: boolean; error?: string }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(img.src);
      if (img.width < 600 || img.height < 600) {
        resolve({ width: img.width, height: img.height, valid: false, error: `Risoluzione troppo bassa (${img.width}×${img.height}). Minimo 600×600px.` });
      } else {
        resolve({ width: img.width, height: img.height, valid: true });
      }
    };
    img.onerror = () => resolve({ width: 0, height: 0, valid: false, error: "Impossibile leggere l'immagine." });
    img.src = URL.createObjectURL(file);
  });
}
