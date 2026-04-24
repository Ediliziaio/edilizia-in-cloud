import type {
  SecurityDoorFinish,
  SecurityDoorFrameType,
  SecurityDoorHardwareType,
  SecurityDoorLeafType,
  SecurityDoorSideContext,
  SecurityDoorType,
} from "./types.ts";

export function bullets(lines: string[]): string {
  return lines.filter((line) => line.trim().length > 0).map((line) => `- ${line}`).join("\n");
}

export const DOOR_TYPE_DESCRIPTIONS: Record<SecurityDoorType, string> = {
  appartamento_moderna: "modern apartment security door, clean slab or subtle grooves, premium protective entrance look",
  appartamento_classica: "classic apartment security door with balanced pantographed panels and traditional casing",
  villa_moderna: "modern villa security entrance door, exterior-grade finish, robust frame and premium threshold",
  villa_classica: "classic villa security door with warm panel detailing and coherent exterior casing",
  rasomuro: "flush-wall / rasomuro security door with integrated minimal casing and clean wall alignment",
  con_fiancoluce: "security door with integrated sidelight inside the same frame composition",
  con_sopraluce: "security door with integrated transom above the leaf inside a coherent frame",
  doppia_anta: "double-leaf security entrance door with coherent active/passive leaf split and premium hardware scale",
};

export const LEAF_DESCRIPTIONS: Record<SecurityDoorLeafType, string> = {
  anta_singola: "single main security leaf fitted inside the existing opening",
  anta_singola_con_fianco: "single security leaf plus proportional side-light module",
  anta_singola_con_sopraluce: "single security leaf plus proportional transom module",
  doppia_anta_simmetrica: "symmetrical double-leaf composition with a centered vertical meeting line",
  doppia_anta_asimmetrica: "asymmetrical double-leaf composition with a larger active leaf and smaller passive leaf",
};

export const FINISH_DESCRIPTIONS: Record<SecurityDoorFinish, string> = {
  liscio_opaco: "smooth matte slab finish with controlled reflections and no fake plastic shine",
  effetto_legno: "wood-effect finish with directional grain, warm depth and realistic panel scale",
  pantografato: "pantographed decorative paneling with crisp routed reliefs and realistic shadows",
  laccato: "lacquered finish, even premium color, subtle satin reflection and clean edges",
  effetto_metallico: "metallic-effect technical finish with restrained reflectance and security-door solidity",
  microtexture: "fine micro-textured technical finish, tactile and premium without noisy AI patterning",
};

export const FRAME_DESCRIPTIONS: Record<SecurityDoorFrameType, string> = {
  standard: "standard security frame with realistic visible depth, gasket line and clean casing",
  complanare: "complanar frame aligned with the panel plane, precise shadow line and refined casing",
  rasomuro: "flush-wall frame with minimal or absent casing, integrated into the wall plane",
  cornice_classica: "classic casing/cornice proportioned to the doorway and panel style",
  minimale: "minimal slim casing, sharp junctions and reduced visual trim",
};

export const HARDWARE_DESCRIPTIONS: Record<SecurityDoorHardwareType, string> = {
  maniglia_moderna: "modern handle with clean geometry and realistic grip scale",
  maniglia_classica: "classic handle coherent with traditional panel detailing",
  pomolo_esterno_maniglia_interna: "outside knob / inside handle logic when the visible side requires it",
  barra_verticale: "vertical pull bar with correct length, offset and mounting points",
  defender_visibile: "subtle visible security defender lock detail, not oversized",
  spioncino_standard: "standard peephole at credible eye height",
  spioncino_digitale: "discreet digital peephole/smart viewer, commercial and not gadget-like",
};

export const SIDE_CONTEXT_DESCRIPTIONS: Record<SecurityDoorSideContext, string> = {
  lato_interno: "interior side of the entrance door, seen from inside the apartment or house",
  lato_esterno: "exterior-facing side of the security door",
  pianerottolo: "condominium landing / stairwell side of an apartment entrance",
  ingresso_villa: "covered or semi-covered villa entrance context",
  corridoio_interno: "interior corridor looking toward the entrance door",
};

export const DEFAULT_SECURITY_DOOR_INTEGRITY_CONSTRAINTS = [
  "surrounding walls outside the opening",
  "floor outside the threshold zone",
  "skirting/baseboards outside direct casing junctions",
  "visible adjacent furniture and decor if non-target",
  "switches, intercom, alarm keypad and electrical plates if non-target",
  "corridor, landing, facade or porch context",
  "camera angle, crop, perspective and image dimensions",
];

export const DEFAULT_SECURITY_DOOR_NEGATIVE_CONSTRAINTS = [
  "do not redesign the entrance",
  "do not move the doorway",
  "do not alter non-target walls or floors",
  "do not invent unrelated decor",
  "do not create impossible sidelight or transom proportions",
  "do not leave traces of the old door",
  "do not leave old frame ghosts or hybrid old/new casing",
  "do not create oversized handles, knobs, peepholes or locks",
  "do not generate a different property",
  "do not produce fake CGI showroom lighting",
  "do not warp perspective or opening geometry",
];

export const DEFAULT_SECURITY_DOOR_QUALITY_DIRECTIVES = [
  "professional security-door sales visualization",
  "same-property realism",
  "technically plausible installation",
  "clearly recognizable selected security door product",
  "trustworthy output for commercial use",
];
