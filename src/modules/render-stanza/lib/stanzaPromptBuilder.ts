// ═══════════════════════════════════════════════════════════════════
// PROMPT BUILDER — Render Stanza (Room/Interiors)
// Versione: 1.0.0 — Edilizia in Cloud
// ═══════════════════════════════════════════════════════════════════

import type {
  ConfigurazioneStanza,
  StileTarget,
  IntensitaTrasformazione,
} from "./types";

// ── STYLE GUIDE ──────────────────────────────────────────────────────────────
const STYLE_GUIDE: Record<StileTarget, string> = {
  moderno:
    "Modern interior design: clean geometric lines, neutral palette (whites, grays, charcoal) with bold accent color pops, open-plan feel, flush cabinetry with handleless push-to-open doors, large-format porcelain floor tiles or polished concrete, minimalist furniture with metal and glass accents, recessed LED lighting, floor-to-ceiling windows if present remain uncluttered.",
  scandinavo:
    "Scandinavian interior design: warm whites and soft grays as base, natural light wood (birch, ash, pine) furniture and flooring, cozy wool and linen textiles in muted tones (dusty rose, sage green, soft blue), clean simple silhouettes, hygge atmosphere with candles and plants, pendant lights with organic shapes, functional beauty principle.",
  industriale:
    "Industrial interior design: exposed brick walls or concrete surfaces, visible metal ductwork and pipes as decorative elements, dark metal (black iron, raw steel) furniture frames and shelving, Edison-bulb pendant lights, reclaimed wood surfaces, leather seating, muted palette (charcoal, rust, dark brown, warm gray), factory-loft atmosphere.",
  classico:
    "Classic traditional interior design: elegant crown moldings and wainscoting, rich warm color palette (cream, gold, burgundy, navy), solid wood furniture with carved details and turned legs, damask or toile fabrics, crystal or brass chandeliers, symmetrical furniture arrangement, Persian or Aubusson-style area rugs, framed artwork in gilt frames.",
  rustico:
    "Rustic country interior design: exposed ceiling beams in natural or aged wood, terracotta or stone flooring, rough-plastered or lime-washed walls, solid wood farm-style furniture, wrought-iron hardware and light fixtures, earthy warm palette (terracotta, olive, cream, umber), woven baskets and ceramic pottery accents, fireplace or wood-burning stove as focal point.",
  minimalista:
    "Minimalist interior design: ultra-clean surfaces with zero clutter, monochromatic palette (white on white, or all-gray), hidden storage and integrated cabinetry, single statement furniture pieces with sculptural quality, indirect cove lighting, seamless floor surfaces, negative space as design element, Zen-like calm atmosphere.",
  mediterraneo:
    "Mediterranean interior design: sun-bleached white walls with blue accents (Santorini blue, cobalt), terracotta floor tiles, arched doorways and niches, handcrafted ceramic tile backsplashes with geometric patterns, wrought-iron details, natural linen and cotton textiles, olive wood and rattan furniture, indoor plants (olive tree, bougainvillea), warm golden light ambiance.",
  art_deco:
    "Art Deco interior design: geometric patterns (chevron, sunburst, fan motifs), rich jewel tones (emerald, sapphire, gold, black), lacquered surfaces and mirror accents, velvet upholstery, brass and chrome hardware, statement pendant lights with geometric forms, glossy marble or dark hardwood floors, bold wallpaper, Hollywood glamour atmosphere.",
  giapponese:
    "Japanese-inspired interior design (Japandi): natural materials (light wood, bamboo, stone, paper), minimalist and decluttered spaces, shoji screen room dividers, tatami-inspired flooring or light oak, earth-tone palette (warm beige, sage, charcoal, off-white), low furniture profiles, indirect warm lighting, ikebana flower arrangements, wabi-sabi aesthetic celebrating imperfection.",
  provenzale:
    "Provencal French country interior design: soft lavender, sage green, butter yellow and antique white palette, distressed painted wood furniture, toile de Jouy and floral fabrics, exposed ceiling beams painted white or left natural, terracotta hexagonal floor tiles, wrought-iron details, dried lavender bouquets, linen curtains, vintage farmhouse sink if kitchen.",
  eclettico:
    "Eclectic interior design: curated mix of styles and eras, bold pattern mixing (stripes with florals, geometric with organic), rich saturated color palette with unexpected combinations, gallery-wall art displays, vintage furniture mixed with contemporary pieces, global-inspired textiles and accessories, maximalist yet intentional, personality-driven space.",
  luxe_contemporaneo:
    "Luxury contemporary interior design: premium materials (marble, onyx, brushed brass, smoked glass), neutral sophisticated palette (taupe, champagne, charcoal, ivory) with metallic accents, bespoke custom furniture, designer statement lighting, plush textured fabrics (bouclé, cashmere, silk), integrated smart-home technology, gallery-like artwork placement, hotel-suite refinement.",
};

// ── INTENSITY MAP ────────────────────────────────────────────────────────────
const INTENSITY_MAP: Record<IntensitaTrasformazione, string> = {
  leggero:
    "LIGHT TRANSFORMATION: Only modify the explicitly requested elements (paint, floor, etc.). Keep ALL existing furniture, layout, architectural features, and room structure EXACTLY as they are unless explicitly targeted for change. Preserve the original room's character while applying the new style touches subtly.",
  medio:
    "MEDIUM TRANSFORMATION: Modify all explicitly requested elements AND harmonize surrounding elements to match the new style. Adjust furniture colors/textures to complement the new design direction while maintaining the same room layout and furniture positions. Update accessories and decorative items to match the target style.",
  radicale:
    "RADICAL TRANSFORMATION: Complete room redesign following the target style. Replace all furniture, decor, and finishes with new ones matching the target aesthetic while keeping the room's architectural shell (walls, windows, doors position, room dimensions) intact. This is a full interior design makeover.",
};

// ── TIPO STANZA LABEL ────────────────────────────────────────────────────────
const TIPO_STANZA_LABEL: Record<string, string> = {
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

// ── Helper: hex → readable color description ─────────────────────────────────
function describeColor(hex?: string, nome?: string): string {
  if (nome) return nome;
  if (!hex) return "neutral tone";
  return `color ${hex}`;
}

// ═══════════════════════════════════════════════════════════════════
// buildStanzaPrompt — Main export
// ═══════════════════════════════════════════════════════════════════
export function buildStanzaPrompt(config: ConfigurazioneStanza): {
  systemPrompt: string;
  userPrompt: string;
  promptVersion: string;
} {
  const blocks: string[] = [];
  const activeInterventions: string[] = [];

  // ── Collect active interventions ────────────────────────────────
  if (config.verniciatura.attivo) activeInterventions.push("wall painting/color");
  if (config.pavimento.attivo) activeInterventions.push("flooring replacement");
  if (config.arredo.attivo) activeInterventions.push("furniture restyling");
  if (config.soffitto.attivo) activeInterventions.push("ceiling modification");
  if (config.illuminazione.attivo) activeInterventions.push("lighting redesign");
  if (config.carta_da_parati.attivo) activeInterventions.push("wallpaper application");
  if (config.rivestimento_pareti.attivo) activeInterventions.push("wall cladding");
  if (config.tende.attivo) activeInterventions.push("curtain/window treatment");
  if (config.tipo_stanza === "cucina" && config.restyling_cucina?.attivo) {
    activeInterventions.push("kitchen cabinet restyling");
  }

  const roomLabel = TIPO_STANZA_LABEL[config.tipo_stanza] ?? "interior room";

  // ── BLOCK 0: MISSION ───────────────────────────────────────────
  blocks.push(
    `[BLOCK 0 — MISSION]\n` +
    `You are a photorealistic interior design AI renderer.\n` +
    `TARGET ROOM TYPE: ${roomLabel}\n` +
    `TARGET STYLE: ${config.stile_target.replace(/_/g, " ").toUpperCase()}\n` +
    `${STYLE_GUIDE[config.stile_target]}\n\n` +
    `TRANSFORMATION INTENSITY: ${config.intensita.toUpperCase()}\n` +
    `${INTENSITY_MAP[config.intensita]}\n\n` +
    `ACTIVE INTERVENTIONS (${activeInterventions.length}): ${activeInterventions.join(", ") || "none specified — apply style globally"}.\n` +
    `Only modify elements for which an intervention block is provided below. Everything else must remain EXACTLY as in the original photo.`
  );

  // ── BLOCK PARETI: Verniciatura ─────────────────────────────────
  if (config.verniciatura.attivo) {
    const v = config.verniciatura;
    let wallTarget = "all walls";
    if (v.applica_a === "parete_principale") wallTarget = "the main/focal wall only";
    else if (v.applica_a === "parete_accento") wallTarget = "one accent wall only (leave other walls as-is)";
    else if (v.applica_a === "specifiche") wallTarget = "specifically indicated walls";

    let desc =
      `[BLOCK PARETI — Wall Paint]\n` +
      `Apply ${describeColor(v.colore_hex, v.colore_nome)} paint to ${wallTarget}.\n` +
      `Finish: ${v.finitura ?? "satinato"} (${v.finitura === "opaco" ? "flat matte" : v.finitura === "lucido" ? "high gloss reflective" : v.finitura === "lavabile" ? "washable eggshell" : "satin eggshell"}).`;

    if (v.applica_a === "parete_accento" && v.colore_accento_hex) {
      desc += `\nAccent wall color: ${describeColor(v.colore_accento_hex, v.colore_accento_nome)}.`;
    }

    blocks.push(desc);
  }

  // ── BLOCK PAVIMENTO ────────────────────────────────────────────
  if (config.pavimento.attivo) {
    const p = config.pavimento;
    blocks.push(
      `[BLOCK PAVIMENTO — Floor Replacement]\n` +
      `Replace the existing floor with: ${p.tipo ?? "porcelain tile"}.\n` +
      `Color: ${describeColor(p.colore_hex)}.\n` +
      `Pattern: ${p.pattern ?? "standard straight lay"}.\n` +
      `Finish: ${p.finitura ?? "matte"}.\n` +
      `Tile/plank size: ${p.dimensione ?? "standard"}.\n` +
      `Ensure realistic grout lines for tiles or plank gaps for wood. Floor must show correct perspective and shadow continuity with existing furniture/walls.`
    );
  }

  // ── BLOCK ARREDO ───────────────────────────────────────────────
  if (config.arredo.attivo) {
    const a = config.arredo;
    let changeLevel = "change furniture colors/textures only, keep same pieces";
    if (a.intensita_cambio === "stile_mantenendo_layout") changeLevel = "change furniture style but keep same layout/positions";
    else if (a.intensita_cambio === "arredo_completo") changeLevel = "replace all furniture with new pieces matching target style";

    blocks.push(
      `[BLOCK ARREDO — Furniture Restyling]\n` +
      `Furniture change level: ${changeLevel}.\n` +
      `Target furniture style: ${a.stile ?? config.stile_target.replace(/_/g, " ")}.\n` +
      `Primary color: ${describeColor(a.colore_principale_hex)}.\n` +
      `Primary material: ${(a.materiale ?? "legno_chiaro").replace(/_/g, " ")}.\n` +
      `${a.mantieni_elettrodomestici ? "KEEP all existing appliances (oven, fridge, dishwasher, washing machine) EXACTLY as they are." : "Appliances may be updated to match the new style."}`
    );
  }

  // ── BLOCK SOFFITTO ─────────────────────────────────────────────
  if (config.soffitto.attivo) {
    const s = config.soffitto;
    const tipoDesc: Record<string, string> = {
      piano: "flat smooth ceiling",
      controsoffitto_cartongesso: "dropped plasterboard ceiling with recessed edge for indirect lighting",
      travi_legno: `exposed wood ceiling beams (${s.colore_travi ?? "natural wood color"})`,
      boiserie_soffitto: "decorative wood paneling (boiserie) on ceiling",
    };
    blocks.push(
      `[BLOCK SOFFITTO — Ceiling Modification]\n` +
      `Ceiling type: ${tipoDesc[s.tipo ?? "piano"] ?? "flat ceiling"}.\n` +
      `Ceiling color: ${describeColor(s.colore_hex ?? "#FFFFFF")}.`
    );
  }

  // ── BLOCK ILLUMINAZIONE ────────────────────────────────────────
  if (config.illuminazione.attivo) {
    const il = config.illuminazione;
    const tipoDesc: Record<string, string> = {
      faretti_incassati: "recessed ceiling spotlights (downlights)",
      lampadario_centrale: "central chandelier or pendant light",
      led_strip_perimetrale: "perimeter LED strip cove lighting along ceiling edge",
      lampade_sospensione: "hanging pendant lamps (over dining/island)",
      applique_parete: "wall sconce lights (appliqué)",
      misto: "combination of recessed spots + decorative pendant + accent lights",
    };
    const tempDesc: Record<string, string> = {
      calda_2700k: "warm white 2700K (cozy amber tone)",
      neutra_3000k: "neutral white 3000K",
      fredda_4000k: "cool white 4000K (crisp daylight tone)",
    };
    blocks.push(
      `[BLOCK ILLUMINAZIONE — Lighting Design]\n` +
      `Lighting type: ${tipoDesc[il.tipo ?? "misto"] ?? "mixed lighting"}.\n` +
      `Color temperature: ${tempDesc[il.temperatura ?? "calda_2700k"] ?? "warm white"}.\n` +
      `Light intensity: ${il.intensita_luce ?? "normale"} (${il.intensita_luce === "soffusa" ? "dim and atmospheric" : il.intensita_luce === "forte" ? "bright and well-lit" : "balanced normal brightness"}).`
    );
  }

  // ── BLOCK CARTA_PARATI ─────────────────────────────────────────
  if (config.carta_da_parati.attivo) {
    const cp = config.carta_da_parati;
    const patternDesc: Record<string, string> = {
      geometrico: "geometric repeating pattern (hexagons, triangles, lines)",
      floreale: "floral botanical pattern with flowers and leaves",
      tropicale: "tropical pattern with palm leaves, monstera, exotic plants",
      astratto: "abstract artistic pattern with fluid organic shapes",
      righe: "vertical or horizontal stripes",
      damasco: "damask pattern with ornate repeating motifs",
      toile_de_jouy: "classic Toile de Jouy scenic pattern",
      botanico: "botanical illustration pattern with herbs, ferns, botanical drawings",
      minimal: "minimal subtle texture or micro-pattern",
    };
    blocks.push(
      `[BLOCK CARTA_PARATI — Wallpaper]\n` +
      `Apply wallpaper to: ${cp.applica_a === "tutte" ? "all walls" : "the main/focal wall only"}.\n` +
      `Pattern style: ${patternDesc[cp.stile_pattern ?? "geometrico"] ?? "geometric pattern"}.\n` +
      `Base color: ${describeColor(cp.colore_base)}.\n` +
      `${cp.descrizione ? `Additional description: ${cp.descrizione}` : ""}\n` +
      `IMPORTANT: Wallpaper must look photorealistic — visible paper texture, correct perspective distortion on angled walls, proper shadow interaction.`
    );
  }

  // ── BLOCK RIVESTIMENTO ─────────────────────────────────────────
  if (config.rivestimento_pareti.attivo) {
    const r = config.rivestimento_pareti;
    const tipoDesc: Record<string, string> = {
      boiserie_legno: "wood boiserie paneling (wainscoting) with raised or flat panel profiles",
      mattone_vista: "exposed brick wall with natural mortar joints and rustic texture",
      pietra_naturale: "natural stone cladding (slate, travertine, or limestone) with realistic grout",
      pannelli_3d: "3D decorative wall panels with geometric relief pattern",
      intonaco_spatolato: "spatulated plaster (stucco spatolato) with smooth trowel marks and subtle sheen",
      stucco_veneziano: "Venetian plaster (stucco veneziano) with polished marble-like finish and depth",
    };
    blocks.push(
      `[BLOCK RIVESTIMENTO — Wall Cladding]\n` +
      `Apply ${tipoDesc[r.tipo ?? "boiserie_legno"] ?? "wood paneling"} to ${r.applica_a === "tutte" ? "all walls" : "the main/focal wall"}.\n` +
      `Color: ${describeColor(r.colore_hex)}.`
    );
  }

  // ── BLOCK TENDE ────────────────────────────────────────────────
  if (config.tende.attivo) {
    const t = config.tende;
    const tipoDesc: Record<string, string> = {
      tende_a_pannello: "panel track blinds (clean modern vertical panels)",
      tende_classiche: "classic pleated drapes hanging from curtain rod",
      veneziane: "Venetian blinds (horizontal slats, wood or aluminum)",
      rullo: "roller blinds (single panel rolling up)",
      tende_lino: "natural linen sheer curtains (light and airy)",
      tende_velluto: "heavy velvet floor-length curtains (luxurious draping)",
      nessuna: "NO curtains — bare windows",
    };
    blocks.push(
      `[BLOCK TENDE — Window Treatments]\n` +
      `Window treatment: ${tipoDesc[t.tipo ?? "tende_classiche"] ?? "classic curtains"}.\n` +
      `Color: ${describeColor(t.colore_hex, t.colore_nome)}.`
    );
  }

  // ── BLOCK CUCINA (solo se tipo_stanza = cucina) ────────────────
  if (config.tipo_stanza === "cucina" && config.restyling_cucina?.attivo) {
    const k = config.restyling_cucina;
    const materialeDesc: Record<string, string> = {
      laccato: "lacquered smooth finish",
      legno: "solid natural wood grain",
      effetto_legno: "wood-effect laminate (realistic grain texture)",
      vetro: "frosted or clear glass panel fronts",
      metallo: "brushed metal (stainless steel or aluminum) fronts",
    };
    const pianoDesc: Record<string, string> = {
      marmo: "marble countertop with natural veining",
      granito: "granite countertop with speckled pattern",
      quarzo: "engineered quartz countertop (uniform surface)",
      laminato: "laminate countertop",
      legno: "solid wood butcher-block countertop",
    };
    const maniglieDesc: Record<string, string> = {
      senza_maniglia: "handleless push-to-open (no visible hardware)",
      metallo_nero: "matte black metal handles",
      metallo_oro: "brushed gold/brass metal handles",
      legno: "natural wood handles",
      cromato: "polished chrome handles",
    };
    blocks.push(
      `[BLOCK CUCINA — Kitchen Cabinet Restyling]\n` +
      `Cabinet fronts: ${materialeDesc[k.materiale_frontali ?? "laccato"] ?? "lacquered"}, color ${describeColor(k.colore_frontali_hex)}.\n` +
      `Countertop: ${pianoDesc[k.piano_lavoro_materiale ?? "quarzo"] ?? "quartz"}, color ${describeColor(k.colore_piano_lavoro_hex)}.\n` +
      `Handles: ${maniglieDesc[k.maniglie ?? "senza_maniglia"] ?? "handleless"}.\n` +
      `${k.cambia_piano_cottura ? "Replace the cooktop/hob with a modern induction or gas model matching the new style." : "KEEP the existing cooktop/hob EXACTLY as is."}\n` +
      `IMPORTANT: Keep sink, faucet, and major appliances (fridge, oven, dishwasher) in their current positions unless their appearance conflicts severely with the new style.`
    );
  }

  // ── BLOCK PRESERVAZIONE ────────────────────────────────────────
  blocks.push(
    `[BLOCK PRESERVAZIONE — Preservation Rules]\n` +
    `CRITICAL PRESERVATION RULES:\n` +
    `1. Room dimensions, perspective, and camera angle must remain IDENTICAL to the original photo.\n` +
    `2. Window positions, doors, and architectural openings must NOT move.\n` +
    `3. Natural light direction and intensity from windows must stay consistent.\n` +
    `4. Any element NOT explicitly targeted for change in the blocks above must remain EXACTLY as it appears in the original photo.\n` +
    `5. The output must be PHOTOREALISTIC — it should look like a real photograph taken by a professional interior photographer, not a 3D render or illustration.\n` +
    `6. Shadows, reflections, and ambient occlusion must be physically accurate for all new elements.\n` +
    `7. Maintain the same image resolution and aspect ratio as the input.`
  );

  // ── Add free notes if present ──────────────────────────────────
  if (config.note_libere?.trim()) {
    blocks.push(
      `[ADDITIONAL NOTES FROM USER]\n${config.note_libere.trim()}`
    );
  }

  // ── System prompt ──────────────────────────────────────────────
  const systemPrompt =
    `You are a photorealistic interior design AI. You receive a photo of a ${roomLabel} ` +
    `and must generate a SINGLE photorealistic image showing the room transformed according to the ` +
    `intervention blocks provided. The result must be indistinguishable from a real professional interior photograph.`;

  const userPrompt = blocks.join("\n\n");

  return {
    systemPrompt,
    userPrompt,
    promptVersion: "stanza-v1.0.0",
  };
}
