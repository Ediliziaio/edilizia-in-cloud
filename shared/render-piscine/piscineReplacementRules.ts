import {
  ACCESS_DESCRIPTIONS,
  ACCESSORY_DESCRIPTIONS,
  AREA_DESCRIPTIONS,
  COPING_DESCRIPTIONS,
  DEFAULT_INTEGRITY_CONSTRAINTS,
  DEFAULT_QUALITY_DIRECTIVES,
  DEFAULT_WATER_REALISM_RULES,
  EXTERIOR_CLADDING_DESCRIPTIONS,
  INTERIOR_FINISH_DESCRIPTIONS,
  KEEP_EXISTING,
  POOL_TYPE_DESCRIPTIONS,
  QUOTA_BORDO_DESCRIPTIONS,
  REMOVED_POOL,
  RESTORED_SURFACE_DESCRIPTIONS,
  WATER_LOOK_DESCRIPTIONS,
  WATER_SYSTEM_DESCRIPTIONS,
  describeFinishWaterConflict,
  describeRealSizeShort,
  misureReali,
} from "./promptFragments.ts";
import { cambiaElemento, type ElementoPiscina } from "./piscineOperationScope.ts";
import {
  acquaIncompatibileConRivestimento,
  formaEffettiva,
  quotaBordoEffettiva,
  sistemaBordoEffettivo,
  vascaRialzata,
} from "./piscineCoerenza.ts";
import type {
  ConfigurazionePiscine,
  PiscinaBuildabilityEnvelope,
  PiscinaReplacementManifest,
  PiscinaSceneAnalysis,
  PiscinaTargetAreaMap,
  PiscinaTechnicalSpecification,
  SistemaBordoPiscina,
} from "./types.ts";

function uniq(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}

function lightingDescription(config: ConfigurazionePiscine): string {
  switch (config.comfort.illuminazione) {
    case "subacquea_soft":
      return "subtle underwater lights integrated into pool walls, realistic soft glow, no fantasy lighting";
    case "perimetrale_calda":
      return "warm perimeter lighting around coping/deck, sparse and architectural";
    case "subacquea_e_perimetrale":
      return "coordinated subtle underwater and warm perimeter lights, realistic and not theatrical";
    default:
      return "no added pool lighting";
  }
}

/** L'operazione cambia questo elemento? (piscineOperationScope.ts: una tabella per prompt e foto) */
function cambia(config: ConfigurazionePiscine, elemento: ElementoPiscina): boolean {
  return cambiaElemento(config.operazione, elemento);
}

/** Fuori ambito: si conserva com'è; in una rimozione sparisce con la piscina. */
function keepOr(config: ConfigurazionePiscine, keep: string, removed: string): string {
  return config.operazione === "remove_existing_pool" ? removed : keep;
}

/** Forma e bordo coerenti con la tipologia (piscineCoerenza.ts). */
export function sistemaBordoPiscina(config: ConfigurazionePiscine): SistemaBordoPiscina {
  return sistemaBordoEffettivo(config.piscina.tipo, config.piscina.sistema_bordo) as SistemaBordoPiscina;
}

/** Geometria della vasca da costruire, con i campi nuovi solo se valorizzati. */
function newPoolGeometry(config: ConfigurazionePiscine): string {
  const tipo = config.piscina.tipo;
  const forma = formaEffettiva(tipo, config.piscina.forma);
  const misure = misureReali(config.piscina.lunghezza_m, config.piscina.larghezza_m);
  const quota = quotaBordoEffettiva(tipo, config.inserimento?.quota_bordo);
  const cladding = vascaRialzata(tipo, config.inserimento?.quota_bordo) && config.finiture.rivestimento_esterno
    ? EXTERIOR_CLADDING_DESCRIPTIONS[config.finiture.rivestimento_esterno]
    : undefined;
  return [
    `${POOL_TYPE_DESCRIPTIONS[tipo]}; shape ${forma.replace(/_/g, " ")}; apparent size ${config.piscina.dimensione_apparente.replace(/_/g, " ")}`,
    misure ? describeRealSizeShort(misure) : null,
    quota ? `edge height: ${QUOTA_BORDO_DESCRIPTIONS[quota as keyof typeof QUOTA_BORDO_DESCRIPTIONS]}` : null,
    cladding ? `exterior cladding: ${cladding}` : null,
  ].filter(Boolean).join("; ");
}

function isStrictSurfaceOnlyOperation(config: ConfigurazionePiscine): boolean {
  return config.operazione === "recolor_waterlook_or_liner_only" || config.operazione === "change_coping_only";
}

/**
 * Gli elementi che l'operazione non cambia si descrivono «come in foto» (o, in una
 * rimozione, «tolti con la piscina»): prima comparivano col valore di default del form
 * («Coping: travertine» in un render «solo acqua», la tipologia rettangolare in «solo bordo»).
 */
export function buildPiscinaTechnicalSpecification(config: ConfigurazionePiscine): PiscinaTechnicalSpecification {
  const vasca = cambia(config, "vasca");
  const sistema = sistemaBordoPiscina(config);
  const finitura = config.finiture.rivestimento_interno;
  const accessoryDescriptions = cambia(config, "accessori")
    ? (config.comfort.accessori ?? []).map((item) => ACCESSORY_DESCRIPTIONS[item])
    : [];
  const installationType = !vasca
    ? keepOr(config, KEEP_EXISTING.installation, REMOVED_POOL.installation)
    : ["semi_incassata", "fuori_terra_premium", "minipiscina", "terrazzo_compatta"].includes(config.piscina.tipo)
    ? "raised / semi-inground / compact system with visible premium base and edge integration"
    : "in-ground pool inserted into the terrain with believable excavation and coping";
  const ripristino = config.finiture.superficie_ripristino;

  return {
    poolTypology: config.piscina.tipo,
    poolGeometry: vasca ? newPoolGeometry(config) : keepOr(config, KEEP_EXISTING.geometry, REMOVED_POOL.geometry),
    installationType,
    waterSystem: sistema,
    waterSystemDescription: vasca
      ? WATER_SYSTEM_DESCRIPTIONS[sistema]
      : keepOr(config, KEEP_EXISTING.waterSystemRules, REMOVED_POOL.waterSystemRules),
    interiorFinish: finitura,
    interiorFinishDescription: cambia(config, "rivestimento")
      ? INTERIOR_FINISH_DESCRIPTIONS[finitura]
      : keepOr(config, KEEP_EXISTING.interiorFinishRules, REMOVED_POOL.interiorFinishRules),
    // Colore impossibile su quel rivestimento (liner scuro + turchese): vince il rivestimento.
    waterLookDescription: !cambia(config, "colore_acqua")
      ? keepOr(config, KEEP_EXISTING.waterLook, REMOVED_POOL.waterLook)
      : acquaIncompatibileConRivestimento(finitura, config.piscina.colore_acqua)
      ? `${INTERIOR_FINISH_DESCRIPTIONS[finitura]}; ${describeFinishWaterConflict(finitura, config.piscina.colore_acqua)}`
      : `${WATER_LOOK_DESCRIPTIONS[config.piscina.colore_acqua]}; must be consistent with ${INTERIOR_FINISH_DESCRIPTIONS[finitura]}`,
    accessDescription: cambia(config, "accesso")
      ? ACCESS_DESCRIPTIONS[config.comfort.accesso]
      : keepOr(config, KEEP_EXISTING.access, REMOVED_POOL.access),
    copingDescription: cambia(config, "coping")
      ? COPING_DESCRIPTIONS[config.finiture.coping]
      : keepOr(config, KEEP_EXISTING.coping, REMOVED_POOL.coping),
    deckDescription: cambia(config, "area_perimetrale")
      ? AREA_DESCRIPTIONS[config.finiture.area_perimetrale]
      : config.operazione === "change_coping_only"
      ? KEEP_EXISTING.surroundingsCopingJunction
      : config.operazione === "remove_existing_pool"
      ? (ripristino && RESTORED_SURFACE_DESCRIPTIONS[ripristino]) || "restore the ground as coherent lawn, patio, deck or hardscape matching the photographed context"
      : KEEP_EXISTING.surroundings,
    lightingDescription: cambia(config, "illuminazione")
      ? lightingDescription(config)
      : keepOr(config, KEEP_EXISTING.lighting, "remove the pool lights with the pool"),
    accessoryDescriptions,
  };
}

export function buildPiscinaReplacementManifest(
  config: ConfigurazionePiscine,
  scene: PiscinaSceneAnalysis,
  target: PiscinaTargetAreaMap,
  envelope: PiscinaBuildabilityEnvelope,
  technical: PiscinaTechnicalSpecification,
): PiscinaReplacementManifest {
  const additions: string[] = [];
  const replacements: string[] = [];
  const recolors: string[] = [];
  const removals: string[] = [];
  const conversions: string[] = [
    "All pool work must respect the target pool insertion map and buildability envelope.",
    envelope.groundPlaneRelation,
    "Pool edges, coping, water level and surrounding deck/lawn transitions must be clean, buildable and perspective-correct.",
  ];

  const poolSummary = `${technical.poolGeometry}; ${technical.installationType}; ${technical.waterSystemDescription}; ${technical.interiorFinishDescription}; coping ${technical.copingDescription}; surrounding ${technical.deckDescription}`;

  switch (config.operazione) {
    case "add_new_pool":
      additions.push(`Insert a new pool in ${target.targetDescription}: ${poolSummary}.`);
      conversions.push("Integrate the basin into the existing ground/patio/deck; do not leave a pasted-on blue rectangle.");
      break;
    case "replace_existing_pool":
      removals.push("Remove the existing pool basin/water plane, old coping, incompatible deck edges, skimmers, ladders and visible outdated pool details completely.");
      removals.push("Rebuild the surrounding ground/deck/paving cleanly before inserting the new pool geometry.");
      replacements.push(`Replace the old pool with only the newly selected pool system: ${poolSummary}.`);
      conversions.push("No hybrid state: no old pool perimeter, old coping, old waterline or old deck scars may remain.");
      break;
    case "remove_existing_pool":
      removals.push("Remove the existing pool completely: water, basin, coping, ladder, skimmer/overflow details, pool lights and incompatible deck edges.");
      // «Al posto della piscina» (campo nuovo): senza scelta, il ripristino di sempre.
      replacements.push(config.finiture.superficie_ripristino && RESTORED_SURFACE_DESCRIPTIONS[config.finiture.superficie_ripristino]
        ? `Restore the target area as ${RESTORED_SURFACE_DESCRIPTIONS[config.finiture.superficie_ripristino]}.`
        : "Restore the target area as coherent lawn, patio, deck or hardscape matching the photographed context.");
      conversions.push("No residual basin ghost, blue water patch, coping outline or excavation scar may remain.");
      break;
    case "recolor_waterlook_or_liner_only":
      recolors.push(`Change only the perceived interior finish/water look to ${technical.interiorFinishDescription} and ${technical.waterLookDescription}.`);
      conversions.push("Waterlook/liner-only: preserve exact pool shape, footprint, coping, surrounding deck and visible pool geometry.");
      conversions.push("Strict scope: do not add or modify steps, beach shelf, lighting, furniture, water features, coping, deck or pool footprint.");
      break;
    case "change_coping_only":
      replacements.push(`Preserve basin geometry and water; replace only coping/immediate pool edge with ${technical.copingDescription}.`);
      conversions.push("Coping-only: no footprint change, no water-system change, no basin shape change.");
      conversions.push("Strict scope: do not add or modify access steps, beach shelf, ladders, water color, liner, pool lighting, furniture or surrounding deck beyond the immediate coping junction.");
      break;
    case "add_access_system":
      additions.push(`Add selected pool access feature: ${technical.accessDescription}.`);
      conversions.push("Access system must be integrated into the basin shape, visible through water when underwater, and not randomly placed.");
      break;
    case "add_pool_features":
      additions.push(...technical.accessoryDescriptions);
      conversions.push("Pool features must appear only if selected, attached to real pool edges/walls/deck and scaled plausibly.");
      break;
  }

  if (cambia(config, "accesso") && config.comfort.accesso !== "nessuno") {
    additions.push(`Access detail: ${technical.accessDescription}.`);
  }
  if (cambia(config, "illuminazione") && config.comfort.illuminazione !== "nessuna") {
    additions.push(`Lighting detail: ${technical.lightingDescription}.`);
  }
  if (cambia(config, "arredo") && config.comfort.arredo === "aggiungi_minimo") {
    additions.push("Add only sparse coherent poolside furniture / sun loungers if there is enough visible space; avoid resort staging.");
  } else if (cambia(config, "arredo") && config.comfort.arredo === "rimuovi_superfluo") {
    removals.push("Declutter only small non-essential outdoor objects; do not remove fixed landscape or main furniture unless explicitly listed.");
  } else {
    conversions.push(isStrictSurfaceOnlyOperation(config)
      ? "Preserve existing outdoor furniture, access features and lighting exactly; do not reinterpret non-target poolside elements."
      : "Preserve existing outdoor furniture in place; adapt only water/deck reflections and shadows around it.");
  }

  for (const item of config.elementi_da_rimuovere ?? []) {
    removals.push(`Remove user-listed incompatible element: ${item}.`);
  }

  const preserveExactly = uniq([
    ...DEFAULT_INTEGRITY_CONSTRAINTS,
    ...scene.untouchableElements,
    ...scene.contextToPreserve,
    ...(config.elementi_da_preservare ?? []),
  ]);

  return {
    operation: config.operazione,
    additions: uniq(additions),
    replacements: uniq(replacements),
    recolors: uniq(recolors),
    removals: uniq(removals),
    conversions: uniq(conversions),
    preserveExactly,
  };
}

export function buildPiscinaWaterRealismRules(config: ConfigurazionePiscine): string[] {
  if (config.operazione === "remove_existing_pool") return [...REMOVED_POOL.waterRealism];
  const sistema = sistemaBordoPiscina(config);
  const systemRule = !cambia(config, "vasca")
    ? KEEP_EXISTING.waterRealismSystem
    : sistema === "skimmer"
    ? "skimmer pool: waterline must sit slightly below coping; do not render an overflow/infinity edge"
    : sistema === "infinity_edge"
      ? "infinity pool: only one plausible edge may visually spill toward the view/lower side; do not use if context is flat and enclosed"
      : "overflow pool: water level nearly flush with edge, continuous premium perimeter, no skimmer ambiguity";

  // Fuori ambito anche con «aggiungi accessori»: prima lì passava la regola dei gradini di default.
  const accessRule = !cambia(config, "accesso")
    ? KEEP_EXISTING.waterRealismAccess
    : config.comfort.accesso === "spiaggetta" || config.comfort.accesso === "beach_entry"
      ? "shallow zone must be clearly readable with thinner transparent water and a smooth depth transition"
      : config.comfort.accesso.includes("grad")
        ? "steps must be visible, proportional, aligned to pool geometry and readable through the water"
        : "do not invent access features beyond selected configuration";

  return uniq([
    ...DEFAULT_WATER_REALISM_RULES,
    systemRule,
    accessRule,
    cambia(config, "rivestimento")
      ? `water look must follow interior finish: ${INTERIOR_FINISH_DESCRIPTIONS[config.finiture.rivestimento_interno]}`
      : "water look must stay exactly as photographed",
  ]);
}

export function buildPiscinaQualityDirectives(config: ConfigurazionePiscine): string[] {
  const aboveGroundRule = !cambia(config, "vasca")
    ? keepOr(config, "existing pool must keep its installation, base and edge exactly as photographed", "the former pool area must read as continuous ground, never as a filled-in basin")
    : ["fuori_terra_premium", "semi_incassata", "terrazzo_compatta"].includes(config.piscina.tipo)
    ? "above-ground / semi-inground pool must show premium base, cladding and deck integration, never cheap or inflatable"
    : "in-ground pool must read as excavated and integrated into terrain with believable coping and deck/lawn junction";

  return uniq([
    ...DEFAULT_QUALITY_DIRECTIVES,
    aboveGroundRule,
    "pool geometry, coping thickness, waterline and deck transitions must be crisp and buildable",
  ]);
}
