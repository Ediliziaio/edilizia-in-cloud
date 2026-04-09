// ═══════════════════════════════════════════════════════════════════
// PROMPT MASTER — Sistema a Blocchi per Sostituzione Copertura Tetto
// Versione: 1.0.0 — Edilizia in Cloud — Render Tetto AI
// ═══════════════════════════════════════════════════════════════════

import type {
  ConfigurazioneTetto,
  AnalisiTetto,
  TipoManto,
  MaterialeGrondaia,
  TipoLucernario,
} from "./types";

// ─── ROOF_PHYSICS ────────────────────────────────────────────────────────────
const ROOF_PHYSICS: Record<TipoManto, string> = {
  tegole_coppi:
    "traditional curved terracotta coppi tiles (barrel tiles) — hand-formed half-cylinder profile approximately 40mm tall, warm terracotta red-orange with natural color variation from kiln firing, rough matte porous surface, overlapping rows alternating concave-down (coppo di gronda) and concave-up (coppo di colmo), visible mortar bed at ridge line, slight moss or lichen at shadow edges on weathered examples, authentic Italian/Mediterranean roofing tradition",
  tegole_marsigliesi:
    "Marseille interlocking clay tiles (tegole marsigliesi) — flat tile body with single prominent raised central rib running head-to-tail, standard ~420x240mm format, interlocking side and head laps with visible overlap shadow lines, smooth or lightly textured matte ceramic surface, terracotta or custom glazed color, regular geometric grid pattern when viewed from distance, French origin widely used in Italian residential construction",
  tegole_portoghesi:
    "Portuguese S-profile clay tiles (tegole portoghesi) — distinctive undulating S-curve cross-section combining a flat lower portion with a curved raised upper ridge, ~420x260mm format, creates alternating convex/concave channels running down the slope, shadow lines deeper than marsigliesi creating stronger visual rhythm, traditional warm terracotta or custom colored glaze, common on Mediterranean residential and heritage buildings",
  tegole_piane:
    "flat interlocking concrete or clay tiles (tegole piane) — minimal profile with clean planar surface, very low raised edges for water channeling, modern geometric appearance with tight joint lines, smooth or micro-textured surface finish, available in wide color range, creates a sleek contemporary roof plane with subtle grid pattern, uniform industrial precision",
  ardesia_naturale:
    "natural slate roofing tiles (ardesia naturale) — hand-split or machine-cut natural stone slabs typically 300x200mm to 600x300mm, dark blue-grey to charcoal black with natural cleft surface showing fine laminar texture, slight thickness variation 4-8mm, installed in diminishing courses or uniform courses with copper/stainless nails, visible side-lap shadow lines, prestigious appearance with subtle sheen when wet, centuries-long tradition in Liguria and Alpine regions",
  ardesia_sintetica:
    "synthetic slate tiles (ardesia sintetica) — fiber-cement or recycled composite tiles replicating natural slate appearance, uniform 5mm thickness, consistent matte dark grey or anthracite surface with embossed grain texture simulating natural cleft, lighter weight than real slate, very regular coursing pattern, clean modern interpretation of traditional slate aesthetic",
  lamiera_grecata:
    "trapezoidal corrugated metal sheet roofing (lamiera grecata) — pre-painted galvanized steel or aluminum sheets with regular trapezoidal rib profile 35-55mm tall at 200-333mm centers, long continuous panels running full slope length with no transverse joints, visible screw fixings with EPDM washers at rib crests, panel side-laps with sealant, crisp industrial shadow pattern from ribs, pre-coated polyester or PVDF paint finish in specified color, common on commercial and modern residential buildings",
  lamiera_aggraffata:
    "standing seam metal roofing (lamiera aggraffata) — flat metal panels 400-530mm wide joined by raised vertical standing seams 25-38mm tall, continuous seam lines running from eave to ridge with no exposed fasteners, clean smooth panel surface between seams, pre-painted aluminum or zinc-titanium with satin or matte finish, elegant modern minimalist appearance, premium architectural grade, typical on contemporary and design-forward buildings",
  lamiera_zinco_titanio:
    "zinc-titanium roofing (lamiera zinco-titanio) — natural zinc alloy sheets developing characteristic blue-grey patina over time, available pre-weathered (quartz grey) or bright mill finish, standing seam or flat-lock panel installation, 0.7mm thickness, subtle directional surface grain from rolling process, weathers naturally from bright silver to warm grey-blue, self-healing surface scratches, premium material for contemporary and heritage projects, 80-100 year lifespan",
  guaina_bituminosa:
    "bituminous membrane flat roofing (guaina bituminosa) — multi-layer modified bitumen waterproofing membrane with mineral granule surface finish (slate-grey, green, or red granules), visible torch-applied lap seams at 100mm overlaps, slightly rough granular surface texture, flat or very low slope application, metal drip edges at perimeter, typical on flat-roof Italian residential and commercial buildings",
  guaina_tpo:
    "TPO single-ply membrane roofing (guaina TPO) — white or light-grey thermoplastic polyolefin membrane, smooth slightly glossy surface, heat-welded lap seams visible as 40mm wide flat weld lines, highly reflective surface for energy efficiency, mechanically fastened or adhered, clean modern appearance on flat and low-slope roofs, typical on contemporary commercial and green buildings",
  tegole_fotovoltaiche:
    "solar roof tiles (tegole fotovoltaiche) — building-integrated photovoltaic tiles designed to replace conventional roof tiles, each tile contains monocrystalline solar cells behind tempered glass, dark black or dark blue surface with subtle cell grid pattern visible at close range, flush-mounted to create smooth roof plane without raised rack systems, integrated wiring concealed beneath tiles, cutting-edge technology combining energy production with architectural aesthetics, premium contemporary appearance",
};

// ─── GRONDAIA_DESC ───────────────────────────────────────────────────────────
const GRONDAIA_DESC: Record<MaterialeGrondaia, string> = {
  alluminio:
    "pre-painted aluminum half-round or box gutter — lightweight, clean sharp edges, powder-coated in specified color, matching round or rectangular downpipe, pop-rivet joints, standard Italian residential profile",
  rame:
    "natural copper half-round gutter — bright orange-copper when new developing green verdigris patina over years, soldered seam joints, elegant traditional appearance, matching round copper downpipes with decorative brackets",
  acciaio_zincato:
    "galvanized steel gutter — hot-dip zinc coating with bright silver metallic finish, standard half-round profile, visible external bracket clips at 600mm centers, sturdy industrial appearance, matching round downpipes",
  pvc:
    "PVC plastic half-round gutter — smooth matte surface, clip-together joints with rubber seals, lightweight, available in white brown or grey, matching round PVC downpipes with push-fit joints, economical residential choice",
  zinco_titanio:
    "zinc-titanium half-round gutter — natural zinc developing blue-grey patina, soldered joints, premium craftsmanship, elegant understated appearance matching zinc roofing, round downpipes with concealed brackets",
};

// ─── LUCERNARIO_DESC ─────────────────────────────────────────────────────────
const LUCERNARIO_DESC: Record<TipoLucernario, string> = {
  piatto:
    "flat roof window (velux-style) — flush-mounted rectangular window sitting nearly flat with the roof plane, low-profile aluminum frame, double or triple glazed unit, visible flashing kit integrating with surrounding roof tiles, when open tilts from top pivot",
  sporgente:
    "protruding skylight (lucernario sporgente) — raised dome or pyramid form projecting 150-300mm above roof plane, typically polycarbonate or glass dome with aluminum or PVC curb frame, visible curb flashing integrated with roof covering",
  abbaino:
    "dormer window (abbaino) — small gabled or flat-roofed structure projecting vertically from the sloped roof, has its own mini-roof, side cheeks clad in matching roof material or zinc/lead, front face contains a vertical window with frame and glass, creates usable headroom in attic space",
};

// ═══════════════════════════════════════════════════════════════════
// buildTettoPrompt
// ═══════════════════════════════════════════════════════════════════
export function buildTettoPrompt(
  config: ConfigurazioneTetto,
  analisi?: Partial<AnalisiTetto>,
): {
  systemPrompt: string;
  userPrompt: string;
  promptVersion: string;
} {
  const a: AnalisiTetto = {
    tipo_tetto: "a falde",
    numero_falde: 2,
    manto_attuale: "tegole_coppi",
    colore_manto_hex: "#b5651d",
    presenza_lucernari: false,
    numero_lucernari: 0,
    pendenza_stimata: 30,
    presenza_comignoli: true,
    stato_conservazione: "discreto",
    ...(analisi ?? {}),
  };

  const blocks: string[] = [];

  // ── [CONTESTO] ───────────────────────────────────────────────────
  blocks.push(
    `[CONTESTO]\nExisting roof: ${a.tipo_tetto}, ${a.numero_falde} slopes, current covering: ${a.manto_attuale}, color approx ${a.colore_manto_hex}.\nEstimated pitch: ${a.pendenza_stimata} degrees. Chimneys: ${a.presenza_comignoli ? "present" : "none"}. Conservation: ${a.stato_conservazione}.\nExisting skylights: ${a.presenza_lucernari ? `${a.numero_lucernari} present` : "none"}.`
  );

  // ── [MANTO] ──────────────────────────────────────────────────────
  const mantoDesc = ROOF_PHYSICS[config.manto.tipo] || config.manto.tipo;
  const finituraMap: Record<string, string> = {
    opaco: "matte finish with no specular highlights",
    semi_lucido: "semi-gloss finish with soft specular sheen",
    lucido: "high-gloss finish with visible specular reflections",
  };
  const finitura = finituraMap[config.manto.finitura] || "matte finish";
  blocks.push(
    `[MANTO]\nReplace the ENTIRE roof covering with: ${mantoDesc}\nColor: ${config.manto.colore_nome ?? config.manto.colore_hex} (hex ${config.manto.colore_hex}). Finish: ${finitura}.\nThe new covering must follow the exact same roof geometry, slopes, ridges and hips. Maintain all existing chimneys, antennas and other roof-mounted elements unless explicitly changed below.`
  );

  // ── [GRONDE] ─────────────────────────────────────────────────────
  if (config.grondaie.attivo) {
    const grDesc = GRONDAIA_DESC[config.grondaie.materiale] || config.grondaie.materiale;
    const pluvDesc = config.grondaie.colore_pluviale_hex
      ? ` Downpipe color: ${config.grondaie.colore_pluviale_hex}.`
      : "";
    blocks.push(
      `[GRONDE]\nReplace gutters and downpipes with: ${grDesc}\nGutter color: ${config.grondaie.colore_hex}.${pluvDesc}\nAll gutter brackets, end caps, joints and downpipe elbows must be rendered consistently in the same material/color system.`
    );
  } else {
    blocks.push(`[GRONDE]\nKEEP existing gutters and downpipes exactly as in the original photo. Do not change color, material or shape.`);
  }

  // ── [LUCERNARI] ──────────────────────────────────────────────────
  if (config.lucernari.attivo) {
    if (config.lucernari.azione === "rimuovi") {
      blocks.push(
        `[LUCERNARI]\nREMOVE all existing skylights/dormers. Fill their positions with continuous roof covering matching the new manto specified above. No trace of previous openings should remain.`
      );
    } else if (config.lucernari.azione === "aggiungi" && config.lucernari.tipo) {
      const lucDesc = LUCERNARIO_DESC[config.lucernari.tipo] || config.lucernari.tipo;
      const qty = config.lucernari.quantita ?? 1;
      const pos = config.lucernari.posizione ?? "centrale";
      const frameColor = config.lucernari.colore_telaio_hex ?? "#3c3c3c";
      blocks.push(
        `[LUCERNARI]\nADD ${qty} new skylight(s): ${lucDesc}\nPosition: ${pos} on the main visible slope. Frame color: ${frameColor}.\nFlashing kit must integrate seamlessly with the new roof covering. Glass should show realistic sky reflections.`
      );
    } else {
      blocks.push(
        `[LUCERNARI]\nKEEP existing skylights/dormers in their current positions. Update their flashing to integrate with the new roof covering if the manto has changed.`
      );
    }
  } else {
    blocks.push(`[LUCERNARI]\nNo changes to skylights. Keep exactly as in original photo.`);
  }

  // ── [PANNELLI] ───────────────────────────────────────────────────
  if (config.pannelli_solari?.attivo) {
    const ps = config.pannelli_solari;
    const tipoMap: Record<string, string> = {
      fotovoltaico_nero: "black monocrystalline photovoltaic panels with dark anti-reflective coating, slim aluminum frame, visible cell grid pattern",
      fotovoltaico_blu: "blue polycrystalline photovoltaic panels with characteristic blue shimmer, visible cell pattern with silver bus-bar lines, aluminum frame",
      tegola_solare_integrata: "building-integrated solar tiles replacing conventional tiles, flush-mounted with no raised rack, dark surface with subtle cell pattern",
    };
    const tipoDesc = tipoMap[ps.tipo ?? "fotovoltaico_nero"] || "photovoltaic panels";
    const qtyMap: Record<string, string> = {
      pochi: "a small cluster of 4-6 panels covering approximately 20% of one slope",
      medi: "a medium array of 8-14 panels covering approximately 40-50% of one slope",
      tanti: "a large array of 16-24 panels covering approximately 70-90% of one slope",
    };
    const qtyDesc = qtyMap[ps.quantita ?? "medi"] || "a medium array";
    const posMap: Record<string, string> = {
      falda_sud: "on the south-facing slope (or the most sun-exposed slope visible)",
      falda_principale: "on the main visible roof slope",
      distribuiti: "distributed across multiple visible slopes",
    };
    const posDesc = posMap[ps.posizione ?? "falda_principale"] || "on the main slope";
    blocks.push(
      `[PANNELLI]\nADD solar panels: ${tipoDesc}.\nQuantity: ${qtyDesc}.\nPosition: ${posDesc}.\nPanels must be mounted on standard aluminum rail system (unless integrated tiles), maintaining uniform spacing and alignment. Render realistic glass reflections of sky on panel surfaces.`
    );
  } else {
    blocks.push(`[PANNELLI]\nNo solar panels. Do not add any solar installation.`);
  }

  // ── [NOTE] ───────────────────────────────────────────────────────
  if (config.note_libere?.trim()) {
    blocks.push(`[NOTE]\nAdditional instructions: ${config.note_libere.trim()}`);
  }

  // ── [VINCOLI] ────────────────────────────────────────────────────
  blocks.push(
    `[VINCOLI]\nCRITICAL RENDERING RULES:\n1. ONLY change the roof elements specified above — walls, windows, doors, garden, sky, surroundings must remain 100% pixel-identical.\n2. Maintain exact same camera perspective, focal length, lighting direction, and shadow angles.\n3. All ridges, hips, valleys must be properly finished with matching ridge tiles or metal cappings.\n4. Chimney flashings must be updated to integrate with the new roof covering.\n5. Eave overhang, fascia boards and soffit must remain consistent with original proportions.\n6. Output image dimensions must match input image dimensions exactly.\n7. No watermarks, text overlays, or artistic filters — photorealistic result only.`
  );

  // ── System prompt ─────────────────────────────────────────────────
  const systemPrompt = `You are a SURGICAL PHOTOREALISTIC IMAGE EDITOR specializing in ROOF RENOVATION visualization for the Italian construction industry. Your ONLY task: replace EXACTLY the specified roof elements while leaving EVERYTHING ELSE 100% pixel-perfect identical to the original photograph. This is PRECISE SURGICAL REPLACEMENT of roofing materials, gutters, skylights and solar panels — not artistic interpretation. You must produce an image that a building contractor could show to a client as a realistic preview of the renovation result.`;

  const userPrompt = blocks.join("\n\n");

  return {
    systemPrompt,
    userPrompt,
    promptVersion: "1.0.0",
  };
}
