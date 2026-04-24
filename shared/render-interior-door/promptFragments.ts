import type {
  InteriorDoorContext,
  InteriorDoorFinish,
  InteriorDoorFrameType,
  InteriorDoorHardwareType,
  InteriorDoorLeafConfig,
  InteriorDoorType,
} from "./types.ts";

export function bullets(lines: string[]): string {
  return lines.filter((line) => line.trim().length > 0).map((line) => `- ${line}`).join("\n");
}

export const DOOR_TYPE_DESCRIPTIONS: Record<InteriorDoorType, string> = {
  battente_liscia: "smooth hinged interior door, clean slab panel and standard swing-door reading",
  battente_classica: "classic hinged interior door with balanced pantographed paneling and traditional proportions",
  scorrevole_interno_muro: "pocket sliding interior door disappearing into the wall, no external rail visible",
  scorrevole_esterno_muro: "wall-mounted sliding interior door with visible rail only where selected and feasible",
  a_libro: "folding interior door with clear hinged/folded leaves and compact opening logic",
  rasomuro: "flush-wall interior door integrated into the wall plane with minimal or absent casing",
  tutta_altezza: "full-height interior door with credible floor-to-ceiling vertical relation",
  vetrata: "glazed interior door with believable glass, coherent frames and correct room-to-room transparency",
  doppia_anta: "double-leaf interior door with coherent central split and balanced hardware scale",
};

export const LEAF_DESCRIPTIONS: Record<InteriorDoorLeafConfig, string> = {
  singola: "single interior door leaf",
  doppia_simmetrica: "symmetrical double-leaf interior door with centered split",
  doppia_asimmetrica: "asymmetrical double-leaf interior door with active and passive leaf",
  libro_doppia: "folding double-leaf book door with visible fold line and compact leaf stack",
  scorrevole_singola: "single sliding panel with coherent track/pocket direction",
  scorrevole_doppia: "double sliding panels with coherent overlap or opposing movement",
};

export const FINISH_DESCRIPTIONS: Record<InteriorDoorFinish, string> = {
  laccato_bianco: "white lacquered finish with clean satin reflection and no plastic look",
  laccato_colorato: "colored lacquered finish, even premium surface and controlled reflections",
  effetto_legno_chiaro: "light wood-effect finish with realistic grain direction and interior-door scale",
  effetto_legno_scuro: "dark wood-effect finish with believable depth and restrained grain",
  laminato: "laminate interior-door finish, controlled repetition and practical residential look",
  materico: "textured material finish with subtle tactile grain and premium matte response",
  vetro_trasparente: "clear glass with realistic reflections, refraction and room-to-room visibility",
  vetro_satinato: "frosted glass with privacy diffusion, soft highlights and no flat gray texture",
  vetro_fume: "smoked glass with controlled transparency, reflections and darker tint",
};

export const FRAME_DESCRIPTIONS: Record<InteriorDoorFrameType, string> = {
  standard: "standard interior frame and casing, clean and proportioned to the doorway",
  minimale: "minimal slim casing with sharp edges and reduced visual trim",
  rasomuro: "flush-wall frame with minimal/absent casing and precise wall-plane integration",
  complanare: "complanar frame/leaf relationship with refined shadow line",
  coprifilo_classico: "classic casing/coprifiilo proportioned to traditional interior doors",
};

export const HARDWARE_DESCRIPTIONS: Record<InteriorDoorHardwareType, string> = {
  maniglia_moderna: "modern handle with correct scale and clean geometry",
  maniglia_classica: "classic handle coherent with traditional paneling",
  pomolo: "interior knob mounted at believable height and scale",
  serratura_privacy: "subtle privacy lock detail for bathroom/bedroom contexts",
  binario_visibile: "visible sliding rail with realistic brackets and wall clearance",
  cerniere_scomparse: "concealed hinge logic with clean leaf/frame joint",
  cerniere_visibili: "visible hinges placed on the correct side and scaled realistically",
};

export const CONTEXT_DESCRIPTIONS: Record<InteriorDoorContext, string> = {
  soggiorno: "living room interior",
  corridoio: "corridor / hallway interior",
  camera: "bedroom interior",
  bagno: "bathroom or bathroom-access doorway",
  cucina: "kitchen interior",
  disimpegno: "internal distribution hallway / disimpegno",
  open_space: "open-space interior with visible room-to-room passage",
};

export const DEFAULT_INTERIOR_DOOR_INTEGRITY_CONSTRAINTS = [
  "surrounding walls outside the direct doorway junction",
  "floor outside the threshold/passage zone",
  "skirting/baseboards outside direct casing cuts",
  "ceiling and upper wall planes outside selected full-height relation",
  "visible furniture and decor if non-target",
  "switches, radiators, pictures and nearby fixtures if non-target",
  "adjacent room view if visible",
  "camera angle, crop, perspective and image dimensions",
];

export const DEFAULT_INTERIOR_DOOR_NEGATIVE_CONSTRAINTS = [
  "do not redesign the room",
  "do not move the doorway",
  "do not alter non-target furniture or walls",
  "do not invent unrelated decor",
  "do not create impossible sliding conditions",
  "do not leave traces of the old door",
  "do not leave old frame ghosts or hybrid old/new casing",
  "do not create oversized handles, hinges or rails",
  "do not generate a different room",
  "do not warp perspective or opening geometry",
  "do not make a sliding door without a pocket or free wall area",
];

export const DEFAULT_INTERIOR_DOOR_QUALITY_DIRECTIVES = [
  "professional interior-door sales visualization",
  "same-room realism",
  "technically plausible installation",
  "clearly recognizable selected interior door product",
  "trustworthy output for commercial use",
];
