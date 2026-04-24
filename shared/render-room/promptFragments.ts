export const ROOM_STYLE_GUIDE: Record<string, string> = {
  moderno:
    "modern interior design with clean geometry, refined neutral palette, realistic contemporary materials, restrained accents and built-in looking details",
  scandinavo:
    "Scandinavian interior with warm whites, natural light wood, linen/wool textiles, soft daylight and simple functional furniture",
  industriale:
    "industrial interior with controlled metal, concrete, reclaimed wood and dark accents, without fake stage-set exaggeration",
  classico:
    "classic interior with balanced symmetry, refined moldings, warm colors and solid materials, proportioned to the original room",
  rustico:
    "rustic interior with natural stone/wood/terracotta cues, warm tactile materials and credible lived-in construction details",
  minimalista:
    "minimalist interior with uncluttered surfaces, hidden storage, seamless finishes and very controlled object count",
  mediterraneo:
    "Mediterranean interior with warm light, ceramic/terracotta details, soft whites and natural textures",
  art_deco:
    "Art Deco inspired interior with geometric accents, elegant metals and premium surfaces, kept realistic and not theatrical",
  giapponese:
    "Japandi interior with low visual noise, natural materials, warm indirect light and wabi-sabi restraint",
  provenzale:
    "Provencal interior with soft muted colors, painted wood, linen curtains and warm country elegance",
  eclettico:
    "eclectic interior with curated mixed pieces, strong personality and coherent color balance",
  luxe_contemporaneo:
    "luxury contemporary interior with premium stone/wood/metal details, bespoke feeling, realistic reflections and no showroom fakery",
};

export const ROOM_TYPE_LABELS: Record<string, string> = {
  cucina: "kitchen",
  soggiorno: "living room",
  camera_da_letto: "bedroom",
  bagno: "bathroom",
  studio: "home office / study",
  ingresso: "entrance hallway",
  taverna: "basement / rec room",
  sala_da_pranzo: "dining room",
  corridoio: "corridor / hallway",
  altro: "interior room",
};

export const ROOM_INTEGRITY_CONSTRAINTS = [
  "same room geometry, same walls, same ceiling plane and same openings",
  "same camera angle, same perspective, same lens feel and same image orientation",
  "same exterior view through windows unless directly affected by glass/reflection realism",
  "same non-target furniture, appliances, decor, switches, outlets, radiators and doors",
  "same natural-light direction and believable existing shadow logic",
  "same image dimensions and no crop",
];

export const ROOM_NEGATIVE_CONSTRAINTS = [
  "do not generate a different room",
  "do not redesign architecture beyond selected interventions",
  "do not move fixed windows, doors, walls, ceiling or structural openings",
  "do not move furniture unless furniture replacement explicitly allows same-layout replacement",
  "do not change wall color or floor if those systems are not active",
  "do not let paint, wallpaper or cladding spill onto non-target walls, ceilings, openings, trims or furniture",
  "do not invent lighting fixtures outside the exact selected lighting type",
  "do not remove curtains, appliances, main furniture or functional anchors unless explicitly selected",
  "do not add generic luxury staging unrelated to the uploaded photo",
  "do not create showroom perfection when the source is a real lived-in room",
  "do not distort perspective, proportions, object scale or image aspect ratio",
  "do not leave hybrid old/new states on selected surfaces or furniture",
];

export const ROOM_QUALITY_DIRECTIVES = [
  "professional architectural interior renovation visualization",
  "same-room realism and high trust output for sales/preventivi",
  "surgical interpretation of selected finishes, lights, furniture and details",
  "photographic material response with correct shadows, reflections and contact occlusion",
  "installable, buildable renovation details, not abstract decoration",
];
