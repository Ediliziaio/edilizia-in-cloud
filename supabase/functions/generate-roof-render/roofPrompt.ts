// generate-roof-render/roofPrompt.ts — il prompt a blocchi del render tetto.
//
// Spostato qui da index.ts (10/2026) senza cambiarne una riga, per poterlo
// provare nei test: index.ts importa supabase-js da esm.sh e chiama Deno.serve,
// quindi non si carica sotto vitest. È QUESTO il prompt che va al provider (o
// al rewriter come `__payload`): src/modules/render-tetto/lib/tettoPromptBuilder.ts
// è una copia che nessun edge usa.
//
// Gira in Deno e in vitest: nessun import, nessuna API di Deno.

// ── ROOF_PHYSICS ─────────────────────────────────────────────────────────────
const ROOF_PHYSICS: Record<string, string> = {
  tegole_coppi:
    "traditional curved terracotta coppi tiles (barrel tiles) — hand-formed half-cylinder profile, warm terracotta red-orange with natural color variation, rough matte porous surface, overlapping rows alternating concave-down and concave-up",
  tegole_marsigliesi:
    "Marseille interlocking clay tiles — flat body with single raised central rib, ~420x240mm, interlocking laps with visible overlap shadow lines, smooth matte ceramic surface",
  tegole_portoghesi:
    "Portuguese S-profile clay tiles — distinctive undulating S-curve cross-section, ~420x260mm, alternating convex/concave channels, deeper shadow lines creating strong visual rhythm",
  tegole_piane:
    "flat interlocking concrete or clay tiles — minimal profile with clean planar surface, very low raised edges, modern geometric appearance with tight joint lines",
  ardesia_naturale:
    "natural slate roofing tiles — hand-split natural stone slabs, dark blue-grey to charcoal, fine laminar surface texture, installed in courses with copper/stainless nails",
  ardesia_sintetica:
    "synthetic slate tiles — fiber-cement or recycled composite replicating natural slate, uniform 5mm thickness, consistent matte dark grey, embossed grain texture",
  lamiera_grecata:
    "trapezoidal corrugated metal sheet roofing — pre-painted galvanized steel with regular trapezoidal rib profile 35-55mm tall, continuous panels, visible screw fixings, crisp industrial shadow pattern",
  lamiera_aggraffata:
    "standing seam metal roofing — flat panels 400-530mm wide joined by raised vertical seams 25-38mm tall, no exposed fasteners, elegant modern minimalist appearance",
  lamiera_zinco_titanio:
    "zinc-titanium roofing — natural zinc alloy developing blue-grey patina, standing seam or flat-lock installation, subtle directional surface grain, premium contemporary material",
  guaina_bituminosa:
    "bituminous membrane flat roofing — multi-layer modified bitumen with mineral granule surface, visible torch-applied lap seams, slightly rough granular texture",
  guaina_tpo:
    "TPO single-ply membrane roofing — white/light-grey thermoplastic membrane, smooth slightly glossy surface, heat-welded lap seams, highly reflective for energy efficiency",
  tegole_fotovoltaiche:
    "solar roof tiles — building-integrated photovoltaic tiles, monocrystalline cells behind tempered glass, dark black or blue surface with subtle cell grid, flush-mounted",
};

const GRONDAIA_DESC: Record<string, string> = {
  alluminio:
    "pre-painted aluminum half-round or box gutter — lightweight, clean sharp edges, powder-coated, matching downpipe",
  rame:
    "natural copper half-round gutter — bright orange-copper developing verdigris patina, soldered joints, matching copper downpipes",
  acciaio_zincato:
    "galvanized steel gutter — hot-dip zinc coating with bright silver metallic finish, standard half-round profile, matching downpipes",
  pvc:
    "PVC plastic half-round gutter — smooth matte surface, clip-together joints, matching round PVC downpipes",
  zinco_titanio:
    "zinc-titanium half-round gutter — natural zinc developing blue-grey patina, soldered joints, premium appearance",
};

const LUCERNARIO_DESC: Record<string, string> = {
  piatto:
    "flat roof window (velux-style) — flush-mounted rectangular window, low-profile aluminum frame, double/triple glazed, visible flashing kit",
  sporgente:
    "protruding skylight — raised dome or pyramid projecting 150-300mm above roof, polycarbonate or glass dome with curb frame",
  abbaino:
    "dormer window — small gabled structure projecting vertically from slope, own mini-roof, side cheeks clad in matching material, front vertical window",
};

const FINITURA_DESC: Record<string, string> = {
  opaco: "matte finish with no unrealistic specular glare",
  semi_lucido: "semi-gloss finish with controlled soft highlights",
  lucido:
    "glossier finish with visible but physically plausible sky reflections",
};

const INTERVENTO_DESC: Record<string, string> = {
  sostituzione_manto:
    "replace the roof covering system while preserving roof geometry and untouched accessories",
  solo_colore:
    "recolor/refinish the existing covering only; preserve module geometry, ridges, gutters, skylights and accessories",
  lattonerie_accessori:
    "work only on selected accessories such as gutters, skylights, downpipes or photovoltaic elements; preserve the covering unless local flashing is required",
  sovracopertura_coibentata:
    "add an insulated over-roof/secondary package with realistic edge thickness, eaves, flashings and gutter adaptation",
  rifacimento_completo:
    "coordinate covering, insulation, gutters, flashings, skylights and photovoltaic elements as one buildable roof renovation",
};

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function bool(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function bullets(lines: Array<string | null | undefined>): string {
  return lines
    .filter((line): line is string => Boolean(line && line.trim()))
    .map((line) => `- ${line}`)
    .join("\n");
}

function isMetalOrMembrane(tipoManto: string): boolean {
  return tipoManto.startsWith("lamiera") || tipoManto.startsWith("guaina");
}

// ── Aggiunte audit 10/2026 ───────────────────────────────────────────────────

/**
 * Metalli che restano al naturale: il loro colore è il metallo. Prima il prompt
 * scriveva comunque «gutter color #8b4513» (il marrone di default del form):
 * grondaie in rame con un colore marrone da rispettare.
 */
const METALLI_NATURALI = new Set(["rame", "zinco_titanio", "acciaio_zincato"]);

/** Posizioni del lucernario in inglese (prima «at laterale dx on the target slope»). */
const POSIZIONE_LUCERNARIO: Record<string, string> = {
  centrale: "in the middle of the target slope",
  laterale_sx: "on the left part of the target slope",
  laterale_dx: "on the right part of the target slope",
  distribuiti: "spread evenly across the target slope",
};

/** Posizioni del fotovoltaico in inglese; la falda sud dalla foto non si legge sempre. */
const POSIZIONE_FOTOVOLTAICO: Record<string, string> = {
  falda_principale: "the main visible roof slope",
  falda_sud: "the south-facing slope (if the orientation cannot be read from the photo, the main sunlit slope)",
  distribuiti: "the visible roof slopes, in clean separate blocks",
};

const LATTONERIA_DESC: Record<string, string> = {
  rame: "natural copper sheet",
  zinco_titanio: "zinc-titanium sheet with a blue-grey patina",
  acciaio_zincato: "galvanized steel sheet",
  alluminio: "pre-painted aluminium sheet",
};

const COMIGNOLO_DESC: Record<string, string> = {
  intonaco: "rendered and painted",
  mattoni: "exposed facing brick with neat mortar joints",
  rame: "clad in natural copper sheet",
};

const FERMANEVE_DESC: Record<string, string> = {
  ganci: "rows of small metal snow-guard hooks staggered over the lower part of each target slope",
  griglia: "a continuous metal snow-guard grille rail parallel to the eaves, a short distance above the gutter",
};

const INTERVENTI_CHE_RIFANNO_IL_MANTO = ["sostituzione_manto", "sovracopertura_coibentata", "rifacimento_completo"];

/**
 * Configurazione da dare al rewriter (roofRewriterProfile legge `manto` come «la copertura
 * nuova, la cosa che cambia»). Se il manto non si rifà, il tipo rimasto nel form — di default
 * i coppi — gli arrivava come se cambiasse: in «solo accessori» poteva trasformare in coppi
 * un tetto di marsigliesi. Con il manto da rifare la configurazione passa intatta.
 */
export function configPerIlRewriter(config: Record<string, unknown>): Record<string, unknown> {
  const tipoIntervento = text(config.tipo_intervento, "sostituzione_manto");
  if (INTERVENTI_CHE_RIFANNO_IL_MANTO.includes(tipoIntervento)) return config;
  const manto = asRecord(config.manto);
  if (tipoIntervento === "solo_colore") {
    return {
      ...config,
      manto: {
        tipo: "existing covering, kept exactly as photographed (recolor only: same modules, profile and laying)",
        colore_hex: manto.colore_hex,
        colore_nome: manto.colore_nome,
        finitura: manto.finitura,
      },
    };
  }
  return { ...config, manto: { tipo: "existing covering, kept exactly as photographed: same material, modules and colour" } };
}

// ── buildRoofPrompt ──────────────────────────────────────────────────────────
export function buildRoofPrompt(session: Record<string, unknown>): {
  systemPrompt: string;
  userPrompt: string;
  promptVersion: string;
  promptPayload: Record<string, unknown>;
} {
  const config = asRecord(session.config);
  const manto = asRecord(config.manto);
  const isolamento = asRecord(config.isolamento);
  const target = asRecord(config.target);
  const grondaie = asRecord(config.grondaie);
  const lucernari = asRecord(config.lucernari);
  const pannelli = asRecord(config.pannelli_solari);
  // Elementi aggiunti nel 10/2026: assenti nelle sessioni vecchie, e allora non scrivono niente.
  const scossaline = asRecord(config.scossaline);
  const comignoli = asRecord(config.comignoli);
  const fermaneve = asRecord(config.fermaneve);
  const lineaVita = asRecord(config.linea_vita);
  const notesRaw = text(config.note_libere);

  const tipoIntervento = text(config.tipo_intervento, "sostituzione_manto");
  const scope = text(target.scope, "tutto_tetto");
  const targetDescriptionMap: Record<string, string> = {
    tutto_tetto:
      "all visible roof planes / the complete roof visible in the photo",
    falda_principale: "main visible roof slope only",
    falda_frontale: "front-facing roof slope only",
    falda_laterale: "side roof slope only",
    zona_specifica: text(
      target.descrizione_zona,
      "specific user-described roof zone",
    ),
  };
  const targetDescription = targetDescriptionMap[scope] ||
    targetDescriptionMap.tutto_tetto;
  const untouchedSlopes = scope === "tutto_tetto"
    ? "none; entire visible roof is in scope"
    : "all non-target visible roof planes must remain unchanged";

  const tipoManto = text(manto.tipo, "tegole_coppi");
  const mantoDesc = ROOF_PHYSICS[tipoManto] || tipoManto;
  const coloreHex = text(manto.colore_hex, "#b5651d");
  const coloreNome = text(manto.colore_nome, coloreHex);
  const finitura = FINITURA_DESC[text(manto.finitura, "opaco")] ||
    FINITURA_DESC.opaco;
  const coveringActive = [
    "sostituzione_manto",
    "sovracopertura_coibentata",
    "rifacimento_completo",
  ].includes(tipoIntervento);

  const scene = {
    buildingType:
      "same photographed building, infer residential/commercial type from the image",
    roofType: "existing roof geometry visible in the photo",
    currentCovering: "current photographed roof covering",
    visibleSlopes: scope === "tutto_tetto"
      ? "all visible roof planes"
      : targetDescription,
    contextToPreserve: [
      "facade",
      "windows",
      "doors",
      "sky",
      "vegetation",
      "street",
      "neighboring buildings",
      "people/vehicles if present",
    ],
  };

  const replacements: string[] = [];
  const additions: string[] = [];
  const removals: string[] = [];
  const conversionRules: string[] = [
    "Preserve exact roof pitch, ridge lines, hip/valley geometry, eaves, building proportions, camera angle and image dimensions.",
  ];
  const compatibilityAdjustments: string[] = [];
  const restorationRules: string[] = [];

  if (coveringActive) {
    replacements.push(
      `Replace roof covering on ${targetDescription} with ${mantoDesc}; color ${coloreNome} (${coloreHex}); finish ${finitura}.`,
    );
    conversionRules.push(
      "Remove incompatible details from the previous covering and rebuild ridge caps, flashings, valleys, hips, eaves and drip edges coherently for the selected system.",
    );
    compatibilityAdjustments.push(
      "Adapt ridge caps, valley/converse details, eaves, drip edges, flashings and local accessory returns to the selected covering family.",
    );
    if (isMetalOrMembrane(tipoManto)) {
      conversionRules.push(
        "If the original roof has coppi/tiles, remove all visible coppi/tiles, tile rows, tile overlaps and old ridge tile logic; introduce coherent metal/membrane panels, seams/laps, cappings, fasteners or heat-welded joints with no hybrid remnants.",
      );
      restorationRules.push(
        "Clear every trace of the previous tile/coppi rhythm before drawing metal seams or membrane laps on the same target roof plane.",
      );
    }
  } else if (tipoIntervento === "solo_colore") {
    replacements.push(
      `Recolor/refinish the existing roof covering on ${targetDescription} to ${coloreNome} (${coloreHex}), ${finitura}; do not change tile/panel geometry, module size, ridges, skylights, gutters, chimneys or accessories.`,
    );
    conversionRules.push(
      "Color-only operation: only surface color/finish changes; no new thickness, no new modules, no new panels, no new architectural details.",
    );
    compatibilityAdjustments.push(
      "No roof-system conversion, thickness change, new flashings, accessory relocation or geometry drift is allowed in color-only mode.",
    );
  } else {
    replacements.push(
      "Keep the existing roof covering unchanged except for small local flashing adjustments required by selected accessories.",
    );
    compatibilityAdjustments.push(
      "Accessory-only scope: preserve roof covering, facade, pitch, ridges and module geometry; update only selected accessory materials/details.",
    );
  }

  if (
    bool(isolamento.attivo) || tipoIntervento === "sovracopertura_coibentata"
  ) {
    additions.push(
      `Add realistic insulated over-roof package (${
        text(isolamento.tipo, "sarking_legno").replace(/_/g, " ")
      }, about ${
        Number(isolamento.spessore_cm || 10)
      } cm): visible only as plausible build-up thickness at eaves/edges, with adapted fascia, drip edges, flashings and gutter relationship; do not deform the building.`,
    );
    compatibilityAdjustments.push(
      "Resolve added roof package thickness at eaves, verges, wall abutments, ridge caps and gutter brackets; no floating or swollen roof edges.",
    );
  }

  if (bool(grondaie.attivo)) {
    const grMat = text(grondaie.materiale, "alluminio");
    const coloriGrondaie = METALLI_NATURALI.has(grMat)
      ? "; gutters and downpipes left in the natural unpainted metal colour"
      : `; gutter color ${text(grondaie.colore_hex, "#8b4513")}${
        text(grondaie.colore_pluviale_hex)
          ? `; downpipe color ${text(grondaie.colore_pluviale_hex)}`
          : ""
      }`;
    replacements.push(
      `Replace gutters and downpipes only with ${
        GRONDAIA_DESC[grMat] || grMat
      }${coloriGrondaie}.`,
    );
    conversionRules.push(
      "Gutter/downpipe replacement must not change roof covering, facade, eave geometry or downpipe path except for material/color/detail of gutters, brackets, elbows and joints.",
    );
    compatibilityAdjustments.push(
      "Gutters/downpipes must align to the final drip edge and keep a plausible runoff path, bracket rhythm, joints, elbows and facade-mounted vertical line.",
    );
  }

  if (bool(lucernari.attivo)) {
    const azione = text(lucernari.azione, "mantieni");
    if (azione === "rimuovi") {
      removals.push(
        "Remove existing skylights/dormers completely and rebuild continuous roof covering at their former positions, with no ghost outline, frame, curb, flashing or color scar.",
      );
      restorationRules.push(
        "After skylight/dormer removal, restore the roof plane as uninterrupted covering: same module/seam rhythm, no rectangular scars, no old flashing shadow, no glass reflection.",
      );
    } else if (azione === "aggiungi") {
      const tipo = text(lucernari.tipo, "piatto");
      const posizione = text(lucernari.posizione, "centrale");
      additions.push(
        `Add ${Number(lucernari.quantita || 1)} ${
          LUCERNARIO_DESC[tipo] || tipo
        } ${
          POSIZIONE_LUCERNARIO[posizione] || `at ${posizione.replace(/_/g, " ")} on the target slope`
        }, with frame color ${
          text(lucernari.colore_telaio_hex, "#3c3c3c")
        }; integrate with correct opening cut, waterproof flashing kit, material returns, shadows and scale.`,
      );
      compatibilityAdjustments.push(
        "New skylights/dormers must avoid ridges, valleys, chimneys and photovoltaic arrays, and must show correct head/sill/side flashing for the selected roof system.",
      );
    } else {
      conversionRules.push(
        "Keep existing skylights/dormers in place and adapt only their flashing if surrounding covering changes.",
      );
      compatibilityAdjustments.push(
        "Existing skylight/dormer geometry remains fixed; only immediate local flashings may adapt to the new surrounding covering.",
      );
    }
  }

  if (bool(pannelli.attivo)) {
    const tipoP = text(pannelli.tipo, "fotovoltaico_nero");
    const tipoMap: Record<string, string> = {
      fotovoltaico_nero:
        "black monocrystalline photovoltaic panels with dark anti-reflective coating, slim aluminum frame",
      fotovoltaico_blu:
        "blue polycrystalline photovoltaic panels with characteristic blue shimmer, aluminum frame",
      tegola_solare_integrata:
        "building-integrated solar tiles replacing conventional tiles, flush-mounted, dark surface with subtle cell pattern",
    };
    const qtyMap: Record<string, string> = {
      pochi: "a small cluster of 4-6 panels (~20% of one slope)",
      medi: "a medium array of 8-14 panels (~40-50% of one slope)",
      tanti: "a large array of 16-24 panels (~70-90% of one slope)",
    };
    const posizionePannelli = text(pannelli.posizione, "falda_principale");
    const pos = POSIZIONE_FOTOVOLTAICO[posizionePannelli] || posizionePannelli.replace(/_/g, " ");
    const mounting = tipoP === "tegola_solare_integrata"
      ? "flush integrated into the covering, without raised rails"
      : "mounted on realistic rails/standoffs aligned to the roof slope";
    additions.push(
      `Add photovoltaic on ${pos}: ${tipoMap[tipoP] || tipoP}; ${
        qtyMap[text(pannelli.quantita, "medi")] || "medium array"
      }; ${mounting}; modules must align perfectly with roof plane, rows, perspective and shadows.`,
    );
    compatibilityAdjustments.push(
      "Photovoltaic modules must be rectangular, coplanar with the target slope, parallel to eaves/ridges, clear of skylights/chimneys/valleys, and mounted with credible rails or flush integration.",
    );
  }

  if (text(scossaline.azione) === "sostituisci") {
    const materiale = text(scossaline.materiale, "alluminio");
    const colore = METALLI_NATURALI.has(materiale)
      ? " in its natural unpainted colour"
      : text(scossaline.colore_hex) ? ` in colour ${text(scossaline.colore_hex)}` : "";
    replacements.push(
      `Replace the visible sheet-metal flashings only — verge trims, metal ridge and hip cappings, chimney and wall abutment flashings — with ${
        LATTONERIA_DESC[materiale] || materiale
      }${colore}; same positions and profiles, no new flashing lines.`,
    );
  }

  if (text(comignoli.azione) === "rinnova") {
    const finituraComignoli = text(comignoli.finitura, "intonaco");
    const colore = finituraComignoli !== "rame" && text(comignoli.colore_hex) ? ` in colour ${text(comignoli.colore_hex)}` : "";
    replacements.push(
      `Refinish the existing chimney stacks only: ${
        COMIGNOLO_DESC[finituraComignoli] || finituraComignoli
      }${colore}; keep the same number, position, height, section and cap design, with base flashings tucked under the covering; add or remove no chimney.`,
    );
  }

  if (bool(fermaneve.attivo)) {
    const tipoFermaneve = text(fermaneve.tipo, "ganci");
    additions.push(
      `Add snow guards on the target slopes: ${
        FERMANEVE_DESC[tipoFermaneve] || tipoFermaneve
      }, in a colour matching the covering, fixed to the roof structure, small and evenly spaced.`,
    );
  }

  if (bool(lineaVita.attivo)) {
    additions.push(
      "Add a permanent fall-arrest lifeline along the ridge: short stainless-steel posts at the ends and at regular intervals, linked by a taut thin steel cable; small and discreet, following the ridge line.",
    );
  }

  const preserve = [
    "facade walls and facade finish",
    "windows and doors",
    "building proportions",
    "roof planes outside target scope",
    "chimneys, antennas, life lines and roof devices unless explicitly modified",
    "sky, vegetation, street, neighboring buildings, vehicles and people",
    "image dimensions, crop and orientation",
  ];

  const insulationActive = bool(isolamento.attivo) ||
    tipoIntervento === "sovracopertura_coibentata";
  const membrane = tipoManto.startsWith("guaina");
  const metal = tipoManto.startsWith("lamiera");
  const coveringFamily = isMetalOrMembrane(tipoManto)
    ? membrane ? "membrane/waterproofing roof system" : "metal roof system"
    : tipoManto === "tegole_fotovoltaiche"
    ? "building-integrated solar tile system"
    : "tile/slate roof system";
  const compatibilityWarnings = membrane
    ? [
      "Selected membrane covering requires low-slope-looking waterproofing logic: avoid tile-like pitched-roof texture and keep seams/laps technically plausible.",
    ]
    : [];
  if (membrane && bool(fermaneve.attivo)) {
    compatibilityWarnings.push(
      "Snow guards belong on pitched slopes: on a flat membrane roof place them only along pitched eaves, if any are visible.",
    );
  }
  const buildabilityEnvelope = {
    material_pitch_compatibility:
      `${coveringFamily} must follow the photographed roof pitch with correct module scale, eave-to-ridge direction and no roof-plane warping.`,
    insulation_thickness_effect: insulationActive
      ? `Insulated over-roof build-up is active: show about ${
        Number(isolamento.spessore_cm || 10)
      } cm only as plausible added thickness at eaves, verge/edge lines, flashings and gutter relationship; do not inflate or deform the house.`
      : "No insulation build-up is active: facade depth, eaves thickness and roof edge thickness remain unchanged.",
    eave_edge_adaptation: insulationActive
      ? "Eaves, fascia, verge trim, drip edges and gutter brackets must adapt to the new package thickness with crisp continuous lines."
      : "Eaves, fascia, verge trim, drip edges and gutter brackets preserve original depth unless material is explicitly replaced.",
    skylight_integration:
      bool(lucernari.attivo) && text(lucernari.azione) === "aggiungi"
        ? "New skylights require real opening cut, curb/frame, head/sill/side flashing and covering returns aligned to the target slope."
        : bool(lucernari.attivo) && text(lucernari.azione) === "rimuovi"
        ? "Removed skylights require continuous rebuilt covering, restored waterproofing and no frame, curb, flashing scar or ghost outline."
        : "Existing skylights/dormers are preserved unless explicitly active; adapt only immediate flashings if surrounding covering changes.",
    photovoltaic_integration: bool(pannelli.attivo)
      ? "Photovoltaic modules must fit within the visible slope plane, align in clean rows, use realistic rails/standoffs or flush integrated solar tiles, and never float above seams or ridges."
      : "No photovoltaic is added; preserve existing solar elements only if visible and not in scope.",
    gutter_compatibility: bool(grondaie.attivo)
      ? "New gutters/downpipes must connect credibly to the eave/drip-edge logic, with brackets, elbows and downpipe path aligned to the facade."
      : "Existing gutters/downpipes stay unchanged; only local relation to changed covering/insulation edge may adapt if physically necessary.",
    forbidden_results: [
      "floating over-roof thickness",
      "tile rows visible below a new metal or membrane system",
      "solar panels crossing ridges, valleys or skylights",
      "water-trap details around chimneys, skylights, valleys or wall abutments",
      "changed facade or changed building proportions",
      "mixed tile and metal module logic on the same target roof plane unless explicitly selected",
    ],
    compatibility_warnings: compatibilityWarnings,
  };

  const waterRules = {
    ridge_caps: metal
      ? "Use folded metal ridge/hip caps compatible with standing seam or corrugated sheet geometry; no clay ridge tiles remain on target slopes."
      : membrane
      ? "Use membrane-compatible cappings/termination bars at ridges, upstands or parapets; no tile ridge logic remains."
      : "Use coherent ridge/hip caps matching the selected tile/slate system, with realistic overlap and shadow.",
    valleys_hips:
      "Valleys, hips and converse lines remain aligned to the photographed roof geometry, with crisp waterproof transitions and no smeared AI seams.",
    eaves_drip_edges:
      "Eaves require believable drip edge, fascia/verge finish and runoff path into the gutter when present; no impossible water trap at roof edge.",
    flashings:
      "Chimneys, skylights, dormers and wall abutments need compatible step/apron/side flashings, correctly tucked under/over the selected covering.",
    gutters_downpipes: bool(grondaie.attivo)
      ? "New gutters/downpipes collect from the drip edge with plausible slope, brackets, joints, end caps, elbows and facade-mounted downpipe continuity."
      : "Existing gutters/downpipes remain as photographed unless an insulated edge requires a subtle physically necessary relationship update.",
    no_water_trap_rules: [
      "no open gaps uphill of skylights or chimneys",
      "no reverse-lap seams",
      "no valleys draining into blocked edges",
      "no decorative trims that would trap water",
      "no random gutter segments disconnected from downpipes",
    ],
  };

  const accessoryCompatibility = {
    preserve_accessories: [
      bool(grondaie.attivo) ? "" : "existing gutters/downpipes",
      bool(lucernari.attivo) ? "" : "existing skylights/dormers",
      text(comignoli.azione) === "rinnova" ? "chimney positions, heights and sections" : "chimneys",
      "antennas",
      "life lines",
      "snow guards / paraneve if visible",
      "non-target photovoltaic if visible",
    ].filter(Boolean),
    replace_accessories: [
      bool(grondaie.attivo) ? "gutters and downpipes" : "",
      bool(lucernari.attivo) && text(lucernari.azione) === "aggiungi"
        ? "new skylight/dormer kit"
        : "",
      bool(pannelli.attivo) ? "photovoltaic mounting system" : "",
      text(scossaline.azione) === "sostituisci" ? "sheet-metal flashings, verge trims and metal cappings" : "",
      text(comignoli.azione) === "rinnova" ? "chimney stack finish" : "",
      bool(fermaneve.attivo) ? "new snow guards" : "",
      bool(lineaVita.attivo) ? "new ridge lifeline" : "",
    ].filter(Boolean),
    remove_accessories: [
      bool(lucernari.attivo) && text(lucernari.azione) === "rimuovi"
        ? "existing skylights/dormers and their frames/curbs/flashings"
        : "",
    ].filter(Boolean),
    solar_compatibility: bool(pannelli.attivo)
      ? "Solar must be placed only on compatible visible roof planes, aligned to slope rows, with realistic mounting and no collision with skylights, chimneys, valleys or ridges."
      : "Solar state is preserved; do not invent photovoltaic panels.",
  };

  const executionPlan = [
    removals.length
      ? "1. Remove obsolete skylights/accessories and old incompatible covering details first."
      : "1. Lock original roof geometry and preserve non-target accessories first.",
    coveringActive
      ? "2. Rebuild target roof covering system with correct module/seam direction and roof-plane scale."
      : "2. Apply selected accessory/color intervention without changing covering system.",
    insulationActive
      ? "3. Resolve insulation thickness at eaves, verges, flashings and gutter relationship."
      : "",
    "4. Resolve waterproofing, ridges, hips, valleys, eaves and penetration flashings.",
    bool(grondaie.attivo)
      ? "5. Install/finish gutters and downpipes after edge/drip logic is defined."
      : "",
    bool(lucernari.attivo)
      ? "6. Integrate or remove skylights/dormers with restored roof-plane continuity."
      : "",
    bool(pannelli.attivo)
      ? "7. Place photovoltaic modules last, aligned to final roof plane and avoiding penetrations."
      : "",
  ].filter(Boolean);

  // Blocco F: con il manto che non si rifà, il tipo rimasto nel form (di default i coppi)
  // non è la copertura della foto. Prima «solo accessori» diceva comunque «Covering type:
  // tegole_coppi» e «Color / finish: Terracotta classico»: invito a cambiare tegole e colore.
  const righeManto = coveringActive
    ? `Covering type: ${tipoManto}\nMaterial / construction: ${mantoDesc}\nColor / finish: ${coloreNome} (${coloreHex}), ${finitura}`
    : tipoIntervento === "solo_colore"
    ? `Covering type: keep the existing covering exactly as photographed\nMaterial / construction: same modules, profile, overlap and laying as in the photo\nColor / finish: ${coloreNome} (${coloreHex}), ${finitura}`
    : "Covering type: keep the existing covering exactly as photographed\nMaterial / construction: unchanged\nColor / finish: unchanged — keep the photographed colour";

  const blocks: Record<string, string> = {
    A: `[BLOCK A - MISSION]\nYou are a SURGICAL PHOTOREALISTIC ROOF RENOVATION IMAGE EDITOR. Apply exactly the selected roof intervention while preserving the same photographed building: same roof geometry, same camera angle, same facade, same context, same lighting and same image dimensions. No artistic reinterpretation and no different-building generation.`,
    B: `[BLOCK B - EXISTING ROOF INVENTORY]\nBuilding: ${scene.buildingType}\nRoof type: ${scene.roofType}\nVisible slopes: ${scene.visibleSlopes}\nCurrent covering: ${scene.currentCovering}\nContext to preserve: ${
      scene.contextToPreserve.join(", ")
    }\nRead all chimneys, skylights, dormers, gutters, ridges, hips, valleys, eaves, flashings, antennas and photovoltaic elements directly from the uploaded photo.`,
    C: `[BLOCK C - TARGET SLOPES MAP]\nScope: ${scope}\nTarget slopes: ${targetDescription}\nUntouched slopes: ${untouchedSlopes}\nAccessory zone: gutters, downpipes, skylights, dormers, ridges, hips, valleys and flashings only where explicitly active.`,
    D: `[BLOCK D - BUILDABILITY ENVELOPE]\nMaterial / pitch compatibility:\n- ${buildabilityEnvelope.material_pitch_compatibility}\nInsulation / over-roof thickness:\n- ${buildabilityEnvelope.insulation_thickness_effect}\nEave and edge adaptation:\n- ${buildabilityEnvelope.eave_edge_adaptation}\nSkylight / dormer integration:\n- ${buildabilityEnvelope.skylight_integration}\nPhotovoltaic integration:\n- ${buildabilityEnvelope.photovoltaic_integration}\nGutter compatibility:\n- ${buildabilityEnvelope.gutter_compatibility}\nForbidden impossible results:\n${
      bullets(buildabilityEnvelope.forbidden_results)
    }\n${
      buildabilityEnvelope.compatibility_warnings.length
        ? `Compatibility warnings:\n${
          bullets(buildabilityEnvelope.compatibility_warnings)
        }`
        : "Compatibility warnings: none."
    }`,
    E: `[BLOCK E - REPLACEMENT MANIFEST]\nIntervention: ${
      INTERVENTO_DESC[tipoIntervento] || INTERVENTO_DESC.sostituzione_manto
    }\nReplacements / refinishes:\n${bullets(replacements)}\nAdditions:\n${
      bullets(
        additions.length
          ? additions
          : ["no roof additions unless explicitly selected"],
      )
    }\nRemovals:\n${
      bullets(
        removals.length ? removals : [
          "remove only construction details made incompatible by selected interventions",
        ],
      )
    }\nCompatibility adjustments:\n${
      bullets(
        compatibilityAdjustments.length ? compatibilityAdjustments : [
          "no compatibility adjustments beyond physically necessary local flashings",
        ],
      )
    }\nRestoration rules:\n${
      bullets(
        restorationRules.length ? restorationRules : [
          "restore only surfaces directly affected by removals or conversion details",
        ],
      )
    }\nPreserve exactly:\n${bullets(preserve)}`,
    F: `[BLOCK F - NEW ROOF SYSTEM SPECIFICATION]\nCovering active: ${
      coveringActive
        ? "yes"
        : tipoIntervento === "solo_colore"
        ? "recolor only"
        : "no"
    }\n${righeManto}\nRidge logic: coherent ridge caps, metal cappings or membrane cappings for the selected system.\nEdge logic: eaves, fascia, drip edges and roof borders stay aligned to the original geometry.\nFlashing logic: chimney, skylight, valley and wall flashings must be plausible for the selected covering.\nProfile/module geometry: tiles, seams, ribs, panels or membrane laps must follow the real roof plane with correct scale and perspective.`,
    G: `[BLOCK G - WATERPROOFING AND FLASHING RULES]\nRidge caps / cappings:\n- ${waterRules.ridge_caps}\nValleys / hips / converse:\n- ${waterRules.valleys_hips}\nEaves / drip edges:\n- ${waterRules.eaves_drip_edges}\nFlashings around penetrations:\n- ${waterRules.flashings}\nGutters / downpipes:\n- ${waterRules.gutters_downpipes}\nNo-water-trap rules:\n${
      bullets(waterRules.no_water_trap_rules)
    }`,
    H: `[BLOCK H - GUTTERS / DOWNPIPES / ACCESSORIES]\nGutters/downpipes: ${
      bool(grondaie.attivo)
        ? GRONDAIA_DESC[text(grondaie.materiale, "alluminio")] ||
          text(grondaie.materiale, "alluminio")
        : "keep existing gutters and downpipes unchanged"
    }\nSkylights/dormers: ${
      bool(lucernari.attivo) ? text(lucernari.azione, "mantieni") : "unchanged"
    }\nPhotovoltaic: ${
      bool(pannelli.attivo)
        ? "active; see replacement manifest and solar rules"
        : "do not add photovoltaic panels"
    }\nInsulation / over-roof: ${
      insulationActive
        ? "active; adapt thickness, eaves, flashings and gutters realistically"
        : "not active"
    }\nPreserve accessories:\n${
      bullets(accessoryCompatibility.preserve_accessories)
    }\nReplace accessories:\n${
      bullets(
        accessoryCompatibility.replace_accessories.length
          ? accessoryCompatibility.replace_accessories
          : ["no accessory replacement unless explicitly selected"],
      )
    }\nRemove accessories:\n${
      bullets(
        accessoryCompatibility.remove_accessories.length
          ? accessoryCompatibility.remove_accessories
          : ["no accessory removal unless explicitly selected"],
      )
    }\nSolar compatibility:\n- ${accessoryCompatibility.solar_compatibility}${
      // Righe solo per gli elementi attivi: le sessioni vecchie danno lo stesso blocco.
      [
        text(scossaline.azione) === "sostituisci" ? "\nFlashings / verge trims: replace with the selected sheet metal; see replacement manifest" : "",
        text(comignoli.azione) === "rinnova" ? "\nChimneys: refinish the existing stacks only; see replacement manifest" : "",
        bool(fermaneve.attivo) ? "\nSnow guards: add; see additions" : "",
        bool(lineaVita.attivo) ? "\nRidge lifeline: add; see additions" : "",
      ].join("")
    }`,
    I: `[BLOCK I - SOLAR AND SKYLIGHT RULES]\n${
      bullets([
        bool(pannelli.attivo)
          ? "Photovoltaic panels/tiles must be coplanar with final roof plane, aligned parallel to eaves and ridges, mounted with realistic rails/standoffs or flush integrated solar-tile logic, and clear of chimneys, skylights, valleys and ridge caps."
          : "Do not add photovoltaic panels, solar tiles, rails, cables or mounting hardware.",
        bool(lucernari.attivo) && text(lucernari.azione) === "aggiungi"
          ? "Added skylights/dormers must show an actual roof cut, frame/curb, head/sill/side flashings, correct glass reflection and local covering returns."
          : "",
        bool(lucernari.attivo) && text(lucernari.azione) === "rimuovi"
          ? "Removed skylights/dormers must disappear completely; rebuild module/seam rhythm across the former opening with no ghost outline."
          : "",
        !bool(lucernari.attivo)
          ? "Do not invent skylights or dormers; preserve existing ones exactly if visible."
          : "",
      ])
    }`,
    J: `[BLOCK J - CONVERSION / REMOVAL RULES]\n${bullets(conversionRules)}\n${
      compatibilityAdjustments.length ? bullets(compatibilityAdjustments) : ""
    }\n${restorationRules.length ? bullets(restorationRules) : ""}\n${
      removals.length
        ? bullets(removals)
        : "- Do not leave hybrid old/new roof states, ghost outlines, incompatible old rows, wrong flashings or random patches."
    }`,
    K: `[BLOCK K - EXECUTION PRIORITY]\n${
      bullets(executionPlan)
    }\nPriority rules:\n${
      bullets([
        "Geometry and waterproofing constraints override decorative appearance.",
        "Covering replacement clears old incompatible roof-system details before new details are introduced.",
        "Accessory-only interventions must not drift into covering/facade redesign.",
        "Color-only interventions preserve exact module geometry and all accessories.",
      ])
    }`,
    L: `[BLOCK L - BUILDING INTEGRITY]\n${
      bullets([
        "preserve facade, wall color, windows, doors, balconies and architectural proportions",
        "preserve roof shape, pitch, ridge line, hip/valley geometry and eave overhang unless insulation requires only realistic edge thickness",
        "preserve sky, vegetation, street, neighboring buildings, vehicles and people",
        "preserve exact camera perspective, crop, image dimensions and orientation",
        "do not alter non-target roof planes or non-target roof accessories",
      ])
    }`,
    M: `[BLOCK M - PHOTOREALISM RULES]\n${
      bullets([
        "material response must be physically plausible: clay, slate, metal, membrane, glass and photovoltaic surfaces must look different",
        "shadows, contact shadows, roof-plane perspective and overlap depths must match the original lighting",
        "all added elements must look installed and buildable, with correct mounting, flashing, trim, edge and waterproofing details",
        "no floating panels, no warped seams, no random tile scales, no fake CGI showroom look",
      ])
    }`,
    N: `[BLOCK N - NEGATIVE CONSTRAINTS]\n${
      bullets([
        "do not redesign the building",
        "do not change facade color, windows, doors or wall geometry",
        "do not change non-target roof planes",
        "do not invent balconies, dormers, skylights, chimneys, photovoltaic panels or antennas unless selected",
        "do not leave traces of removed skylights or old covering systems",
        "do not mix tile rows with metal/membrane systems on the same target slope unless explicitly selected",
        "do not change sky, vegetation, neighboring buildings, street or context",
        "do not stylize, illustrate, over-beautify or create a different house",
      ])
    }`,
    O: `[BLOCK O - QUALITY BAR]\n${
      bullets([
        "professional architectural roof renovation visualization",
        "same-building realism suitable for sales/preventivi",
        "precise interpretation of selected roof system, target slopes and accessories",
        compatibilityWarnings.length
          ? `Compatibility warnings: ${compatibilityWarnings.join("; ")}`
          : "No unresolved roof compatibility warning.",
      ])
    }`,
  };

  const notes = notesRaw ? `[ADDITIONAL USER NOTES]\n${notesRaw}` : "";
  const userPrompt = [
    blocks.B,
    blocks.C,
    blocks.D,
    blocks.E,
    blocks.F,
    blocks.G,
    blocks.H,
    blocks.I,
    blocks.J,
    blocks.K,
    blocks.L,
    blocks.M,
    blocks.N,
    blocks.O,
    notes,
  ]
    .filter(Boolean)
    .join("\n\n");

  return {
    systemPrompt: blocks.A,
    userPrompt,
    promptVersion: "roof-v2.1.0",
    promptPayload: {
      scene_analysis: scene,
      target_slopes: {
        scope,
        target_description: targetDescription,
        untouched_slopes: untouchedSlopes,
      },
      buildability_envelope: buildabilityEnvelope,
      water_management_rules: waterRules,
      accessory_compatibility: accessoryCompatibility,
      execution_priority_plan: executionPlan,
      replacement_manifest: {
        intervention: tipoIntervento,
        replacements,
        additions,
        removals,
        conversion_rules: conversionRules,
        compatibility_adjustments: compatibilityAdjustments,
        restoration_rules: restorationRules,
        preserve,
      },
      final_prompt_version: "roof-v2.1.0",
    },
  };
}
