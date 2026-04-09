// ===================================================================
// PROMPT MASTER — Sistema a Blocchi per Render Bagno AI
// Versione: 1.0.0 — Edilizia in Cloud
// ===================================================================

import type {
  ConfigurazioneBagno,
  AnalisiBagno,
} from "./types";

// --- TILE_PHYSICS ---------------------------------------------------
const TILE_PHYSICS: Record<string, string> = {
  // Marbles (7)
  marmo_carrara:
    "Carrara marble — white to light grey base with fine grey veining running in organic flowing patterns, subtle translucent depth, polished surface with high specular reflection showing mirror-like highlights under direct light, veins are thin (1-3mm) and slightly irregular, natural stone edge texture visible at tile joints",
  marmo_calacatta:
    "Calacatta marble — warm white/ivory base with bold dramatic gold and grey veining, veins are wider (3-8mm) and more pronounced than Carrara, strong contrast between base and vein color, luxurious premium appearance, polished finish with deep reflective surface, each tile shows unique vein pattern",
  marmo_sahara_noir:
    "Sahara Noir marble — deep black base with striking gold/amber veining creating dramatic contrast, veins are irregular and organic (2-6mm wide), polished surface shows deep lustre with warm gold reflections, surface appears almost liquid-like in its depth, premium exotic stone appearance",
  marmo_marquinia:
    "Nero Marquinia marble — solid deep black base with crisp white veining, veins are thin to medium (1-4mm) with clean linear patterns, highly polished surface with strong mirror-like reflection, elegant and contemporary appearance, minimal color variation in base",
  marmo_verde_guatemala:
    "Verde Guatemala marble — deep emerald green base with white and lighter green veining, veins create flowing organic patterns (2-5mm), polished surface with rich saturated color depth, distinctive luxury stone with vivid natural character",
  marmo_statuario:
    "Statuario marble — bright luminous white base with bold grey-to-gold dramatic veining, veins are thick (4-10mm) and sweeping in large-scale patterns, highest grade Italian marble appearance, polished finish with exceptional depth and clarity, each slab dramatically unique",
  marmo_emperador:
    "Emperador marble — rich warm brown base with cream and gold veining, medium density veining (2-5mm) creating mosaic-like pattern, polished surface with warm amber tones and deep lustre, traditional Mediterranean luxury stone appearance",

  // Cement (3)
  cemento_grigio:
    "Grey cement effect — uniform medium grey surface with subtle tonal micro-variation, matte or satin finish with zero specular reflection, visible fine aggregate texture and micro-pitting typical of polished concrete, slightly chalky appearance, no veining or organic pattern, contemporary industrial aesthetic",
  cemento_bianco:
    "White cement effect — light off-white to pale grey surface with minimal tonal variation, smooth matte finish with soft texture, slight cloudiness typical of white Portland cement, clean minimal appearance with no veining, occasional subtle surface imperfection for authenticity",
  cemento_antracite:
    "Anthracite cement effect — dark charcoal grey approaching black, matte surface with very subtle surface texture, minimal tonal variation, strong contemporary industrial character, occasional fine aggregate speck visible, zero specular reflection",

  // Wood (3)
  legno_rovere_chiaro:
    "Light oak wood effect — warm honey-blonde base with visible linear grain pattern running along tile length, grain lines alternate between light and medium tones (1-2mm apart), occasional knot pattern (20-40mm diameter), satin or matte finish with low sheen, authentic timber plank appearance with slight color variation between tiles",
  legno_rovere_scuro:
    "Dark oak wood effect — rich walnut-brown base with prominent dark grain lines, deeper contrast between grain and base color compared to light oak, grain runs longitudinally, occasional larger knot features, satin finish with warm amber depth, traditional hardwood floor appearance",
  legno_wenge:
    "Wenge wood effect — very dark chocolate-brown approaching black, fine tight grain pattern with subtle contrast, grain lines are closely spaced (0.5-1mm), minimal knot features, sophisticated contemporary appearance, matte to satin finish with rich depth",

  // Natural stone (3)
  ardesia:
    "Slate (ardesia) — dark grey to black surface with characteristic natural cleavage texture creating subtle layered relief (0.5-2mm depth variation), matte finish with no specular reflection, fine parallel texture lines from geological layering, occasional rusty mineral inclusion spots, organic edge texture at tile joints",
  travertino:
    "Travertine — warm beige to cream base with characteristic natural pitting and holes (1-5mm diameter) filled or unfilled, wavy banding pattern in light-to-medium tones, honed or polished finish, organic soft appearance with geological depth, warm Mediterranean character",
  basalto:
    "Basalt — dark grey to black volcanic stone, very fine uniform grain with minimal pattern, bush-hammered or honed surface with subtle micro-texture, extremely hard and dense appearance, minimal color variation, contemporary minimalist stone aesthetic",

  // Monocromo (7)
  mono_bianco:
    "Monochrome white — pure bright white surface with perfectly uniform color, glossy or matte finish depending on format, no pattern or texture variation, clean clinical appearance, sharp light reflection on glossy variants, contemporary minimal aesthetic",
  mono_nero:
    "Monochrome black — deep uniform black surface, glossy finish creates strong mirror-like reflections while matte finish absorbs light completely, zero pattern variation, bold dramatic contemporary appearance, fingerprint and water drop marks may be visible on glossy variants",
  mono_grigio:
    "Monochrome grey — neutral medium grey with perfectly uniform color distribution, versatile contemporary appearance, available in matte or satin finish, clean smooth surface with no texture or pattern, neutral backdrop aesthetic",
  mono_verde_salvia:
    "Sage green monochrome — soft muted green-grey tone with uniform color, organic calming appearance, matte or satin finish with gentle warmth, no pattern or texture, contemporary nature-inspired aesthetic, pairs well with wood and brass tones",
  mono_blu_navy:
    "Navy blue monochrome — deep saturated dark blue with uniform color distribution, bold sophisticated appearance, glossy finish adds depth and richness, dramatic contemporary character, strong presence as feature wall material",
  mono_terracotta:
    "Terracotta monochrome — warm orange-red earth tone with uniform color, matte or satin finish with warm organic quality, no pattern but maintains earthy character, Mediterranean and rustic contemporary crossover aesthetic",
  mono_greige:
    "Greige monochrome — neutral warm grey-beige hybrid tone, perfectly balanced between cool and warm, uniform smooth surface, matte finish with sophisticated understated appearance, currently trending neutral, pairs with virtually any accent color",

  // Mosaics (4)
  mosaico_esagoni:
    "Hexagonal mosaic — tessellated hexagonal tiles 50-80mm across arranged in honeycomb pattern, visible grout lines (2-3mm wide) between each hexagon, may be single color or multi-tonal pattern, characteristic geometric regularity, tactile grout grid surface, contemporary graphic appearance",
  mosaico_penny:
    "Penny round mosaic — small circular tiles 20-25mm diameter arranged in offset grid pattern, visible grout fill between circles (2mm), characteristic retro/vintage aesthetic, available in single or multi-color patterns, tactile surface with pronounced grout relief",
  zellige:
    "Zellige tiles — handmade Moroccan ceramic tiles 100x100mm approximately, characteristic irregular edges and slightly uneven surface creating handcrafted appearance, rich glossy glaze with subtle color variation between individual tiles (3-5% tonal shift), visible crackle glaze effect, irregular grout lines (2-4mm), artisanal Mediterranean character",
  cotto_toscano:
    "Tuscan cotto — handmade terracotta tiles with warm orange-red to sienna tones, matte surface with visible handwork marks and subtle surface undulation, slight color variation between tiles, authentic rustic Mediterranean appearance, grout lines wider (3-5mm) with organic irregularity, ages with beautiful patina",

  // Special (2)
  resina_spatolata:
    "Troweled resin (resina spatolata) — seamless continuous surface with NO tile joints or grout lines, smooth flowing surface with very subtle trowel mark texture (organic flowing strokes), matte to satin finish, slight color depth variation from application layers, continuous monolithic appearance covering walls and floors without interruption",
  pietra_ardesia:
    "Split-face slate stone — dramatic dimensional stone surface with natural rough-split texture creating 5-15mm relief depth, deep shadow lines between protruding stone layers, dark grey to black with occasional mineral color flashes, highly textured feature wall material, zero polish or shine, raw geological character",
};

// --- POSA_DESC ------------------------------------------------------
const POSA_DESC: Record<string, string> = {
  dritta:
    "Straight/stack bond — tiles aligned in perfect grid with horizontal and vertical joints perfectly aligned, clean geometric appearance, grout lines form continuous straight lines in both directions",
  sfalsata:
    "Offset/running bond (sfalsata) — tiles offset by 50% like brick pattern, horizontal grout lines continuous but vertical joints staggered, classic and most common laying pattern, adds visual length to the space",
  diagonale:
    "Diagonal (45-degree) — tiles rotated 45° relative to walls, diamond orientation creates dynamic visual movement, grout lines run at 45° angles, adds apparent width to narrow spaces",
  spina_pesce:
    "Herringbone (spina di pesce) — rectangular tiles arranged in alternating 90° V-pattern creating zigzag design, requires precise 45° cuts at perimeter, elegant traditional pattern with strong visual texture",
  spina_ungherese:
    "Hungarian herringbone (spina ungherese) — similar to herringbone but with longer tiles creating a more elongated V-pattern, tiles meet at 45° angles, more contemporary and dramatic than standard herringbone",
  chevron:
    "Chevron — tiles cut at parallelogram angles to create continuous V-shaped pattern where tiles meet in a clean straight centerline, more refined and modern than herringbone, creates strong directional visual flow",
  casuale:
    "Random/mixed pattern (casuale) — tiles laid in varied sizes and orientations creating organic non-repeating pattern, requires multiple tile formats, relaxed Mediterranean or rustic character",
};

// --- buildBathroomPrompt --------------------------------------------
export function buildBathroomPrompt(
  config: ConfigurazioneBagno,
  analisi?: AnalisiBagno | null,
): {
  systemPrompt: string;
  userPrompt: string;
  promptVersion: string;
  blocks: Record<string, string>;
} {
  const a: AnalisiBagno = {
    tipo_stanza: "bagno",
    dimensione_stimata: "sconosciuta",
    altezza_stimata: "circa 2.70m",
    piastrelle_parete_attuali: "non identificabili",
    pavimento_attuale: "non identificabile",
    colori_dominanti: [],
    presenza_doccia: false,
    presenza_vasca: false,
    presenza_mobile: false,
    stato_conservazione: "discreto",
    ...(analisi || {}),
  };

  const blocks: Record<string, string> = {};

  // Block A — Role & Mission (system prompt)
  blocks.A = `[BLOCK A – ROLE & MISSION]
You are a SURGICAL PHOTOREALISTIC IMAGE EDITOR specialized in bathroom renovation visualization. Your ONLY task: replace EXACTLY the specified bathroom elements while leaving EVERYTHING ELSE 100% pixel-perfect identical. This is PRECISE SURGICAL REPLACEMENT, not artistic interpretation.

CRITICAL RENDERING RULES:
1. Replaced tiles must show physically correct material properties — veining direction, surface reflectivity, grout line width and color, tile format proportions.
2. Laying pattern (posa) must be geometrically precise — exact offset percentage, angle, and repetition.
3. Fixtures (shower, tub, vanity, toilet) must appear as real commercial products with correct proportions, shadow casting, and material reflectivity.
4. Water fixtures (taps, shower heads) must show correct metal finish with specular highlights matching the scene lighting.
5. All shadows, reflections, and ambient occlusion must be physically correct for the new elements.
6. Elements marked as "mantieni" (keep) MUST remain pixel-identical to the original photograph.
7. The camera perspective, room geometry, lighting direction, and image dimensions must remain exactly as in the original.
8. Output image dimensions must match input image dimensions exactly.`;

  // Block B — Existing Elements Inventory
  blocks.B = `[BLOCK B – EXISTING BATHROOM INVENTORY]
Room type: ${a.tipo_stanza}
Estimated dimensions: ${a.dimensione_stimata}
Estimated ceiling height: ${a.altezza_stimata}
Current wall tiles: ${a.piastrelle_parete_attuali}
Current floor: ${a.pavimento_attuale}
Dominant colors: ${a.colori_dominanti.length > 0 ? a.colori_dominanti.join(", ") : "not identified"}
Shower present: ${a.presenza_doccia ? "YES" + (a.tipo_doccia ? ` — ${a.tipo_doccia}` : "") : "NO"}
Bathtub present: ${a.presenza_vasca ? "YES" : "NO"}
Vanity present: ${a.presenza_mobile ? "YES" + (a.tipo_mobile ? ` — ${a.tipo_mobile}` : "") : "NO"}
Toilet/bidet type: ${a.sanitari_tipo || "not identified"}
Current fixtures finish: ${a.rubinetteria_attuale || "not identified"}
Current lighting: ${a.illuminazione_attuale || "not identified"}
Conservation state: ${a.stato_conservazione}${a.note ? `\nNotes: ${a.note}` : ""}`;

  // Block C — Intervention Type & Replacement Manifest
  const interventionDesc: Record<string, string> = {
    restyling_piastrelle: "Tile restyling only — change wall tiles and/or floor tiles, keep all fixtures and furniture",
    restyling_completo: "Complete restyling — change tiles, fixtures, furniture, and fittings without structural demolition",
    demolizione_parziale: "Partial demolition — structural changes to some elements (e.g., remove tub for shower), replace selected items",
    demolizione_completa: "Complete demolition & rebuild — full bathroom renovation, all elements replaced from scratch",
  };

  const sost = config.sostituzione;
  const cLines: string[] = [
    `[BLOCK C – REPLACEMENT MANIFEST]`,
    `Intervention type: ${interventionDesc[config.tipo_intervento] || config.tipo_intervento}`,
    `\nEXACTLY these elements must change — NOTHING else:`,
  ];

  cLines.push(sost.piastrelle_parete ? `\n  WALL TILES → REPLACE` : `\n  WALL TILES → KEEP as-is`);
  cLines.push(sost.pavimento ? `\n  FLOOR → REPLACE` : `\n  FLOOR → KEEP as-is`);
  cLines.push(sost.doccia ? `\n  SHOWER → REPLACE` : `\n  SHOWER → KEEP as-is`);
  cLines.push(sost.vasca ? `\n  BATHTUB → REPLACE` : `\n  BATHTUB → KEEP as-is`);
  cLines.push(sost.mobile_bagno ? `\n  VANITY/CABINET → REPLACE` : `\n  VANITY/CABINET → KEEP as-is`);
  cLines.push(sost.sanitari ? `\n  TOILET/BIDET → REPLACE` : `\n  TOILET/BIDET → KEEP as-is`);
  cLines.push(sost.rubinetteria ? `\n  FAUCETS/FIXTURES → REPLACE` : `\n  FAUCETS/FIXTURES → KEEP as-is`);
  cLines.push(sost.parete_colore ? `\n  NON-TILED WALLS → REPAINT/RECLAD` : `\n  NON-TILED WALLS → KEEP as-is`);
  cLines.push(sost.illuminazione ? `\n  LIGHTING → REPLACE` : `\n  LIGHTING → KEEP as-is`);

  cLines.push(`\n\nCRITICAL: Every element NOT listed for replacement must be pixel-identical to the original.`);
  blocks.C = cLines.join("");

  // Block D — Wall Tiles
  if (sost.piastrelle_parete && config.piastrelle_parete.attivo) {
    const pp = config.piastrelle_parete;
    const tileDesc = TILE_PHYSICS[pp.effetto] || pp.effetto;
    const posaDesc = POSA_DESC[pp.posa] || pp.posa;
    blocks.D = `[BLOCK D – NEW WALL TILES]
Material/Effect: ${tileDesc}
Format: ${pp.formato}
Laying pattern: ${posaDesc}
Grout color: ${pp.fuga_colore}
${pp.altezza_rivestimento ? `Tile height coverage: ${pp.altezza_rivestimento}` : "Full wall height coverage"}

RENDERING RULES:
- Tile joints must be geometrically precise with consistent grout width (2-3mm)
- Grout color must match specification exactly
- Tile surface reflectivity must match the specified material physics
- Laying pattern must be geometrically correct with proper offsets`;
  } else {
    blocks.D = `[BLOCK D – WALL TILES — SKIPPED]\nWall tile replacement not requested. Keep existing tiles pixel-identical.`;
  }

  // Block E — Floor
  if (sost.pavimento && config.pavimento.attivo) {
    const pv = config.pavimento;
    const tileDesc = TILE_PHYSICS[pv.effetto] || pv.effetto;
    const posaDesc = POSA_DESC[pv.posa] || pv.posa;
    blocks.E = `[BLOCK E – NEW FLOOR]
Material/Effect: ${tileDesc}
Format: ${pv.formato}
Laying pattern: ${posaDesc}
Grout color: ${pv.fuga_colore}

RENDERING RULES:
- Floor must show correct perspective foreshortening
- Tile reflections must show ambient environment (wet-look for polished, matte for honed)
- Grout lines must follow room geometry with correct vanishing points
- Laying pattern must be consistent across entire visible floor area`;
  } else {
    blocks.E = `[BLOCK E – FLOOR — SKIPPED]\nFloor replacement not requested.`;
  }

  // Block F — Shower
  if (sost.doccia && config.doccia.attivo) {
    const d = config.doccia;
    const showerTypes: Record<string, string> = {
      walk_in: "Walk-in shower — open entry with no door, single glass panel (8-10mm tempered) on one side, continuous floor tile flowing into shower area, minimal frame or frameless design, contemporary open-space concept",
      nicchia_box: "Niche shower enclosure — fully enclosed shower box fitted between existing walls, hinged or sliding glass door panel, shower tray within the niche, standard residential bathroom configuration",
      angolare: "Corner shower enclosure — two glass panels meeting at 90° angle forming quarter-square enclosure in room corner, entry door on one panel, square or rectangular shower tray base",
      semicircolare: "Semicircular shower enclosure — curved glass panel forming quarter-circle enclosure in corner, curved sliding door entry, radius-shaped shower tray base, smooth flowing glass curvature",
    };
    const glassTypes: Record<string, string> = {
      trasparente: "clear transparent tempered glass — fully see-through with thin green edge tint, specular reflections of bathroom environment",
      satinato: "satin/frosted glass — translucent white-matte surface diffusing light, objects behind appear as soft blurred shapes, no specular reflection",
      fume: "smoke-tinted glass — semi-transparent dark grey tint reducing visibility, modern dramatic appearance, subtle environment reflections",
      serigrafato: "screen-printed decorative glass — geometric or organic pattern printed on glass surface, alternating clear and frosted zones creating privacy pattern",
    };
    const trayTypes: Record<string, string> = {
      filo_pavimento: "flush-mount/zero-entry shower tray — surface level with surrounding floor, seamless transition, linear drain channel along one edge, contemporary minimal appearance",
      rialzato_3cm: "low-profile raised tray (3cm) — subtle step up from floor level, minimal raised edge, clean modern appearance with slight definition from floor",
      rialzato_5cm: "standard raised tray (5cm) — visible step with defined edge profile, traditional residential configuration, clear demarcation of shower area",
      pietra: "natural stone shower tray — cut from single stone slab or stone-effect composite, visible stone texture and natural edge, premium organic appearance, matte non-slip surface",
    };
    const showerHeadTypes: Record<string, string> = {
      a_parete: "wall-mounted shower head — adjustable head on visible wall bracket/slider rail, standard configuration with flexible hose",
      pioggia_soffitto: "ceiling-mounted rain shower head — large circular or square head (200-300mm) flush or semi-flush to ceiling, produces rain-like water flow, contemporary spa-like appearance",
      colonna_completa: "exposed thermostatic shower column — vertical bar system with upper fixed rain head and lower adjustable hand shower, visible thermostatic mixer valve, chrome or colored pipe work exposed on wall",
      combinato: "combination system — ceiling-mounted rain head plus wall-mounted adjustable hand shower on slider rail, dual-function luxury configuration",
    };

    blocks.F = `[BLOCK F – NEW SHOWER]
Type: ${showerTypes[d.tipo] || d.tipo}
Glass: ${glassTypes[d.box_vetro] || d.box_vetro}
Shower tray: ${trayTypes[d.piatto] || d.piatto}
Profile finish: ${d.profilo === "senza_profilo" ? "frameless — no visible metal profile, glass fixed with minimal point fixings or silicone channel" : d.profilo + " metal profile — visible frame around glass panels"}
Shower head: ${showerHeadTypes[d.soffione] || d.soffione}

RENDERING RULES:
- Glass panel must show physically correct transparency/frosting per specification
- Metal profiles must show correct finish with accurate specular highlights
- Water fixtures must appear as real commercial products
- Shower tray must integrate correctly with surrounding floor`;
  } else {
    blocks.F = `[BLOCK F – SHOWER — SKIPPED]\nShower replacement not requested.`;
  }

  // Block G — Bathtub
  if (sost.vasca && config.vasca.attivo) {
    const v = config.vasca;
    const tubTypes: Record<string, string> = {
      freestanding_ovale: "Freestanding oval bathtub — sculptural organic oval shape standing independently on floor, no contact with walls, visible floor space around all sides, smooth exterior curves, contemporary design statement, typically 170-180cm long × 75-85cm wide × 58-65cm tall",
      freestanding_rettangolare: "Freestanding rectangular bathtub — geometric rectangular form with sharp or slightly radiused corners, standing independently on floor, modern minimalist design, clean linear silhouette, typically 170-180cm long × 75-80cm wide",
      incassata: "Built-in/drop-in bathtub — tub inset into a tiled surround or deck, only the interior basin visible from above, surrounding rim finished with matching tile or stone, integrated into bathroom architecture",
      angolare: "Corner bathtub — fitted into room corner, fan-shaped or asymmetric plan, two sides against walls with exposed front panel, integrated shelf or wide rim, space-efficient configuration",
    };
    const materialTypes: Record<string, string> = {
      acrilico_bianco: "white acrylic — smooth glossy pure white surface with high specular reflection, lightweight contemporary appearance, slight bluish reflection in water, standard residential grade",
      solid_surface: "solid surface composite (Corian-like) — matte smooth surface with subtle warmth, seamless joints, soft-touch appearance, available in white to light tones, contemporary premium material",
      ghisa_smaltata: "enameled cast iron — extremely smooth glossy porcelain enamel over heavy iron body, deep lustre with mirror-like reflections, traditional premium material, visible weight and solidity in form proportions",
      pietra: "natural stone — carved from single stone block or stone composite, visible stone grain and subtle color variation, matte to honed finish, ultimate luxury organic material, substantial visual weight",
    };
    const tapTypes: Record<string, string> = {
      a_parete: "wall-mounted bath filler — spout and mixer controls mounted on wall above tub rim, clean tub rim with no penetrations",
      a_pavimento: "floor-standing bath filler — tall freestanding pipe rising from floor beside tub, dramatic sculptural element, typically 80-100cm tall with gooseneck spout",
      bordo_vasca: "deck-mounted bath filler — mixer and spout mounted through holes in tub rim or surrounding deck, traditional configuration with visible handles on rim",
    };

    blocks.G = `[BLOCK G – NEW BATHTUB]
Type: ${tubTypes[v.tipo] || v.tipo}
Material: ${materialTypes[v.materiale] || v.materiale}
Faucet: ${tapTypes[v.rubinetteria_vasca] || v.rubinetteria_vasca}

RENDERING RULES:
- Bathtub must cast correct shadow on floor
- Interior should show subtle water reflection/sheen
- Material surface must match specification (matte vs glossy, texture)
- Proportions must be architecturally realistic for residential bathroom`;
  } else {
    blocks.G = `[BLOCK G – BATHTUB — SKIPPED]\nBathtub replacement not requested.`;
  }

  // Block H — Vanity
  if (sost.mobile_bagno && config.vanity.attivo) {
    const van = config.vanity;
    const vanityStyles: Record<string, string> = {
      sospeso_moderno: "Wall-hung modern vanity — floating cabinet mounted to wall with visible gap between unit bottom and floor (typically 150-200mm), clean rectangular form with flat or slightly recessed handle-less drawers (push-to-open), contemporary minimal aesthetic",
      sospeso_minimal: "Wall-hung minimal vanity — ultra-slim floating cabinet with maximum simplicity, thin profile (150-180mm depth), handle-less design, single drawer or open shelf below, Scandinavian/Japanese minimalist influence",
      a_terra_classico: "Floor-standing classic vanity — cabinet resting on floor with visible legs or plinth base, may include turned legs or traditional moulding details, drawer pulls or knobs, classic residential bathroom furniture",
      a_terra_industrial: "Floor-standing industrial vanity — raw metal frame (visible welded steel or iron pipe structure) supporting wood or concrete countertop, open shelving below, exposed plumbing as design feature, loft/industrial aesthetic",
    };
    const topMaterials: Record<string, string> = {
      marmo_bianco: "white marble countertop with grey veining, polished finish",
      marmo_nero: "black marble countertop with white veining, polished finish",
      quarzo: "engineered quartz countertop, uniform color with fine sparkle, polished smooth surface",
      legno: "solid wood countertop with visible grain, sealed/oiled finish, warm organic appearance",
      ceramica: "ceramic countertop, smooth glazed surface, integrated or separate basin option",
    };
    const basinTypes: Record<string, string> = {
      integrato: "integrated basin — sink molded as single piece with countertop, seamless no-edge transition, contemporary clean-line appearance",
      appoggio_ovale: "oval vessel basin — ceramic or stone bowl sitting on top of countertop surface, visible countertop area around basin, sculptural elevated appearance, requires tall wall-mounted mixer",
      appoggio_rettangolare: "rectangular vessel basin — geometric rectangular bowl on countertop, sharp clean edges, modern architectural appearance",
      semincasso: "semi-recessed basin — partially inset into countertop with front portion protruding beyond counter edge, space-saving compromise between vessel and undermount",
    };

    blocks.H = `[BLOCK H – NEW VANITY UNIT]
Style: ${vanityStyles[van.stile] || van.stile}
Cabinet color/finish: ${van.colore}
Countertop: ${topMaterials[van.piano] || van.piano}
Basin: ${basinTypes[van.lavabo] || van.lavabo}
Width: ${van.larghezza_cm}cm

RENDERING RULES:
- Cabinet must appear as real furniture with correct material textures
- Mirror above vanity should reflect room environment
- Countertop material must show specified surface properties
- Basin must show realistic ceramic/stone material with proper light interaction`;
  } else {
    blocks.H = `[BLOCK H – VANITY — SKIPPED]\nVanity replacement not requested.`;
  }

  // Block I — Sanitari
  if (sost.sanitari && config.sanitari.attivo) {
    const s = config.sanitari;
    const wcTypes: Record<string, string> = {
      sospeso: "wall-hung WC — toilet cantilevered from wall with no floor contact, concealed cistern behind wall, contemporary floating appearance with visible gap under bowl",
      a_terra: "floor-standing WC — traditional toilet resting on floor with visible floor flange, exposed or close-coupled cistern, standard residential configuration",
      rimless_sospeso: "rimless wall-hung WC — wall-mounted with advanced rimless flushing technology, smooth interior with no rim cavity, hygienic modern design, same floating appearance as standard wall-hung",
    };
    const bidetTypes: Record<string, string> = {
      sospeso: "wall-hung bidet matching WC style — floating from wall, contemporary paired set appearance",
      a_terra: "floor-standing bidet — traditional configuration resting on floor, paired with matching WC style",
    };

    let sanitariDesc = `[BLOCK I – NEW SANITARI]
WC: ${s.azione_wc === "mantieni" ? "KEEP existing" : wcTypes[s.tipo_wc] || s.tipo_wc}
Color: ${s.colore === "bianco" ? "bright white ceramic" : s.colore === "grigio_chiaro" ? "light grey ceramic with subtle color" : "matte black ceramic — no specular highlight, deep flat black"}`;

    if (s.azione_bidet === "rimuovi") {
      sanitariDesc += `\nBidet: REMOVE — show clean floor/wall where bidet was`;
    } else if (s.azione_bidet === "sostituisci" && s.tipo_bidet) {
      sanitariDesc += `\nBidet: ${bidetTypes[s.tipo_bidet] || s.tipo_bidet}`;
    } else {
      sanitariDesc += `\nBidet: KEEP existing`;
    }

    sanitariDesc += `\n\nRENDERING RULES:\n- Ceramic must show correct specular properties for the specified color\n- Wall-hung units must show realistic wall-mounting with shadow beneath\n- WC and bidet must appear as matching design series`;
    blocks.I = sanitariDesc;
  } else {
    blocks.I = `[BLOCK I – SANITARI — SKIPPED]\nSanitari replacement not requested.`;
  }

  // Block J — Rubinetteria
  if (sost.rubinetteria && config.rubinetteria.attivo) {
    const r = config.rubinetteria;
    const finishes: Record<string, string> = {
      cromo: "polished chrome — bright mirror-like specular reflection with cool silver tone, most common bathroom fixture finish",
      nero_opaco: "matte black — zero specular highlight, deep flat black powder coat, contemporary dramatic appearance, shows fingerprints slightly",
      oro_spazzolato: "brushed gold/brass — warm yellow-gold tone with directional brushed micro-lines reducing specular sharpness, luxury contemporary finish",
      oro_rosa: "rose gold / brushed copper — warm pink-gold metallic tone with satin brushed surface, soft romantic contemporary finish",
      acciaio_spazzolato: "brushed stainless steel — cool grey metallic with directional satin micro-lines, industrial-contemporary crossover, subtle warm undertone compared to chrome",
    };
    const styles: Record<string, string> = {
      quadro_moderno: "modern square profile — geometric rectangular cross-section lever handle and spout, sharp 90° edges, contemporary architectural design",
      tondo_classico: "classic round profile — cylindrical lever handle and tubular spout, softly rounded forms, timeless universal design",
      industrial: "industrial style — exposed pipe-like connections, knurled grip handles, raw mechanical aesthetic, visible joint fittings",
      vintage_crosshead: "vintage crosshead — traditional cross-shaped handle with ceramic hot/cold indices, curved gooseneck or bridge spout, period-authentic design",
    };

    blocks.J = `[BLOCK J – NEW FAUCETS & FIXTURES]
Finish: ${finishes[r.finitura] || r.finitura}
Style: ${styles[r.stile] || r.stile}

ALL visible water fixtures (basin mixer, shower controls, bath filler if present) must be rendered in this EXACT finish and style. No mixing of finishes.

RENDERING RULES:
- Metal finish must show physically correct specular behavior
- All fixtures in the room must match — basin, shower, bath
- Handles and spouts must show correct proportions for the specified style
- Reflections on chrome/gold must reflect bathroom environment`;
  } else {
    blocks.J = `[BLOCK J – FAUCETS — SKIPPED]\nFixture replacement not requested.`;
  }

  // Block K — Non-tiled walls
  if (sost.parete_colore && config.parete.attivo) {
    const p = config.parete;
    if (p.azione === "tinta_unita") {
      blocks.K = `[BLOCK K – NON-TILED WALL FINISH]
Action: Paint with solid color
Color: ${p.colore_hex || "#FFFFFF"} — apply this exact color to all non-tiled wall surfaces
Finish: matte or eggshell paint finish, smooth surface

RENDERING RULES:
- Only walls NOT covered by tiles should be painted
- Ceiling and tiled areas remain unchanged
- Paint must appear as real wall paint with subtle surface texture`;
    } else if (p.azione === "lastra_decorativa") {
      blocks.K = `[BLOCK K – NON-TILED WALL FINISH]
Action: Apply decorative panel/slab
Surface: large-format decorative panel or stone slab covering non-tiled wall areas
Color reference: ${p.colore_hex || "neutral"}

RENDERING RULES:
- Panel must show seamless large-format appearance
- Minimal or no visible joints
- Surface texture should complement tile selection`;
    } else {
      blocks.K = `[BLOCK K – NON-TILED WALLS — KEEP]\nMaintain existing non-tiled wall finish.`;
    }
  } else {
    blocks.K = `[BLOCK K – NON-TILED WALLS — SKIPPED]`;
  }

  // Block Z — Environment Preservation & Negative Constraints
  blocks.Z = `[BLOCK Z – PIXEL-PERFECT ENVIRONMENT PRESERVATION & CONSTRAINTS]
The following MUST remain 100% unchanged:
- Room geometry: walls, ceiling, floor plan, door positions, window positions
- Camera perspective: exact same viewpoint, focal length, distortion
- Lighting: same direction, intensity, color temperature, shadows
- Any element NOT specified for replacement
- Image dimensions: output MUST match input exactly

NEVER:
- Change room geometry or camera perspective
- Add elements not present in original (windows, doors, plants, towels, accessories) unless specified
- Produce cartoon/CGI/illustration artifacts
- Add text or watermarks
- Alter elements marked for preservation
- Show physically impossible material properties (chrome reflection on matte surface, etc.)
- Change image dimensions`;

  // Assemble prompts
  const systemPrompt = blocks.A;
  const userParts = [blocks.B, blocks.C, blocks.D, blocks.E, blocks.F, blocks.G, blocks.H, blocks.I, blocks.J, blocks.K, blocks.Z];

  if (config.illuminazione_tipo) {
    const illBlock = `[ADDITIONAL – LIGHTING]
New lighting type: ${config.illuminazione_tipo}
Render new light fixtures with correct illumination effect on surrounding surfaces.`;
    userParts.push(illBlock);
  }

  if (config.note_libere) {
    userParts.push(`[ADDITIONAL NOTES]\n${config.note_libere}`);
  }

  const userPrompt = userParts.join("\n\n");

  return {
    systemPrompt,
    userPrompt,
    promptVersion: "1.0.0",
    blocks,
  };
}
