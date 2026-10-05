import type {
  ConfigurazionePiscine,
  PiscinaPromptValidationResult,
  PiscinaRenderConfig,
} from "./types.ts";
import { cambiaElemento } from "./piscineOperationScope.ts";
import {
  acquaIncompatibileConRivestimento,
  formaEffettiva,
  quotaBordoEffettiva,
  sistemaBordoEffettivo,
  vascaRialzata,
} from "./piscineCoerenza.ts";
import { MISURE_PISCINA_METRI } from "./types.ts";
import { misureReali } from "./promptFragments.ts";

const etichetta = (valore: string | null | undefined) => `«${(valore ?? "").replace(/_/g, " ")}»`;

/** Un numero inserito nel campo misura, valido o no (per dire all'utente che non vale). */
function numeroInserito(v: unknown): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
}

/**
 * Avvisi per chi compila il form (italiano): scelte che si contraddicono e come le
 * risolve il render. Lista vuota = niente da dire. Le stesse regole decidono prompt e
 * foto (piscineCoerenza.ts), qui si spiegano soltanto.
 */
export function avvisiConfigurazionePiscina(config: ConfigurazionePiscine): string[] {
  const avvisi: string[] = [];
  const op = config.operazione;
  const tipo = config.piscina?.tipo;
  if (cambiaElemento(op, "vasca")) {
    const forma = config.piscina?.forma;
    if (forma && formaEffettiva(tipo, forma) !== forma) {
      avvisi.push(`La tipologia ${etichetta(tipo)} non va con la forma ${etichetta(forma)}: il render userà la forma ${etichetta(formaEffettiva(tipo, forma))}.`);
    }
    const sistema = config.piscina?.sistema_bordo;
    if (sistema && sistemaBordoEffettivo(tipo, sistema) !== sistema) {
      avvisi.push(`La tipologia ${etichetta(tipo)} non va con il bordo ${etichetta(sistema)}: il render userà ${etichetta(sistemaBordoEffettivo(tipo, sistema))}.`);
    }
    const quota = config.inserimento?.quota_bordo;
    if (quota && quota !== "a_filo_terreno" && !quotaBordoEffettiva(tipo, quota)) {
      avvisi.push(`La quota del bordo ${etichetta(quota)} non va con la tipologia ${etichetta(tipo)}: il render segue la tipologia.`);
    }
    if (config.finiture?.rivestimento_esterno && !vascaRialzata(tipo, quota)) {
      avvisi.push("Il rivestimento esterno si vede solo su una vasca rialzata (fuori terra, semi-incassata o con quota rialzata): così non entra nel render.");
    }
    const l = numeroInserito(config.piscina?.lunghezza_m);
    const w = numeroInserito(config.piscina?.larghezza_m);
    const { lunghezza: lim, larghezza: wim } = MISURE_PISCINA_METRI;
    if ((l !== null && (Number.isNaN(l) || l < lim.min || l > lim.max)) || (w !== null && (Number.isNaN(w) || w < wim.min || w > wim.max))) {
      avvisi.push(`Misure fuori scala: la lunghezza va da ${lim.min} a ${lim.max} m, la larghezza da ${wim.min} a ${wim.max} m. Una misura fuori scala non entra nel render.`);
    }
    const misure = misureReali(config.piscina?.lunghezza_m, config.piscina?.larghezza_m);
    if (misure?.lunghezza && ["plunge_pool", "minipiscina", "terrazzo_compatta"].includes(tipo ?? "") && misure.lunghezza > 6) {
      avvisi.push(`Una ${etichetta(tipo)} lunga ${misure.lunghezza} m non è più compatta: controlla tipologia o misure.`);
    }
    if (tipo === "biopiscina" && (/^mosaico_/.test(config.finiture?.rivestimento_interno ?? "") || ["turchese", "azzurra_classica"].includes(config.piscina?.colore_acqua ?? ""))) {
      avvisi.push("In una biopiscina mosaico e acqua turchese o azzurra non sono credibili: meglio pietra, liner scuro e acqua grigio-verde naturale.");
    }
  }
  if (cambiaElemento(op, "colore_acqua") && acquaIncompatibileConRivestimento(config.finiture?.rivestimento_interno, config.piscina?.colore_acqua)) {
    avvisi.push(`Con il rivestimento ${etichetta(config.finiture?.rivestimento_interno)} l'acqua non può sembrare ${etichetta(config.piscina?.colore_acqua)}: il render segue il rivestimento.`);
  }
  return avvisi;
}

export function validatePiscinePromptConfig(config: PiscinaRenderConfig): PiscinaPromptValidationResult {
  const missingSections: string[] = [];
  const missingBusinessRules: string[] = [];

  if (!config.target_pool_insertion_map?.footprint) missingSections.push("target pool insertion map");
  if (!config.buildability_envelope?.plausibleSize) missingSections.push("buildability envelope");
  if (!config.replacement_manifest?.conversions?.length) missingSections.push("replacement manifest");
  if (!config.technical_specification?.poolGeometry) missingSections.push("pool geometry specification");
  if (!config.technical_specification?.waterSystemDescription) missingSections.push("water system specification");
  if (!config.technical_specification?.interiorFinishDescription) missingSections.push("interior finish and water look specification");
  if (!config.technical_specification?.copingDescription) missingSections.push("coping and deck rules");
  if (!config.water_realism_rules?.length) missingSections.push("water realism rules");
  if (!config.integrity_constraints?.length) missingSections.push("property integrity constraints");

  const cfg = config.legacy_config;
  const allText = [
    ...config.replacement_manifest.additions,
    ...config.replacement_manifest.replacements,
    ...config.replacement_manifest.recolors,
    ...config.replacement_manifest.removals,
    ...config.replacement_manifest.conversions,
    ...config.water_realism_rules,
    config.technical_specification.waterSystemDescription,
    config.buildability_envelope.groundPlaneRelation,
  ].join(" ").toLowerCase();

  const vasca = cambiaElemento(cfg.operazione, "vasca");
  const sistema = sistemaBordoEffettivo(cfg.piscina.tipo, cfg.piscina.sistema_bordo);
  if (vasca && sistema === "infinity_edge" && config.buildability_envelope.infinityFeasibility !== "plausible") {
    missingBusinessRules.push("infinity-edge selected but context feasibility is limited; prompt must constrain it to a plausible edge or downgrade visually");
  }
  if (
    vasca &&
    sistema === "skimmer" &&
    (
      allText.includes("infinity pool: only one plausible edge") ||
      allText.includes("overflow pool: water level nearly flush") ||
      allText.includes("water level very close to upper edge")
    )
  ) {
    missingBusinessRules.push("skimmer selected but overflow/infinity language leaks into rules");
  }
  if (vasca && (sistema === "sfioro" || sistema === "sfioro_nascosto") && !allText.includes("water level")) {
    missingBusinessRules.push("overflow selected but water-level rules are missing");
  }
  if (cfg.operazione === "recolor_waterlook_or_liner_only" && !allText.includes("preserve exact pool shape")) {
    missingBusinessRules.push("waterlook/liner-only must preserve shape, footprint and coping");
  }
  if (
    cfg.operazione === "recolor_waterlook_or_liner_only" &&
    config.replacement_manifest.additions.some((item) => /access|lighting|furniture|water feature|deck|coping/i.test(item))
  ) {
    missingBusinessRules.push("waterlook/liner-only must not add access, lighting, furniture, deck or coping changes");
  }
  if (cfg.operazione === "replace_existing_pool" && !allText.includes("remove the existing pool")) {
    missingBusinessRules.push("replace existing pool must include old pool removal rules");
  }
  if (cfg.operazione === "remove_existing_pool" && !allText.includes("restore")) {
    missingBusinessRules.push("remove pool must include ground/hardscape restoration rules");
  }
  if (
    cfg.operazione === "change_coping_only" &&
    config.replacement_manifest.additions.some((item) => /access|step|beach|ladder|lighting|furniture|water feature/i.test(item))
  ) {
    missingBusinessRules.push("coping-only must not add or modify access, lighting, furniture or pool features");
  }
  if (cfg.operazione === "change_coping_only" && !allText.includes("strict scope")) {
    missingBusinessRules.push("coping-only requires strict scope rules");
  }
  if (cfg.operazione === "add_access_system" && cfg.comfort.accesso === "nessuno") {
    missingBusinessRules.push("add_access_system requires a selected pool access feature");
  }
  if (cambiaElemento(cfg.operazione, "accesso") && (cfg.comfort.accesso === "spiaggetta" || cfg.comfort.accesso === "beach_entry") && !allText.includes("shallow")) {
    missingBusinessRules.push("beach/baja shelf requires shallow-water rules");
  }
  if (vasca && cfg.piscina.tipo === "fuori_terra_premium" && !allText.includes("above-ground")) {
    missingBusinessRules.push("premium above-ground pool requires base/support logic");
  }
  // Le scelte che si contraddicono: il prompt le risolve (piscineCoerenza.ts), ma la
  // configurazione non è quella che l'utente crede di aver scelto.
  const avvisi = avvisiConfigurazionePiscina(cfg).length;
  if (avvisi > 0) {
    missingBusinessRules.push(`${avvisi} conflicting or out-of-range form choice(s): the prompt applies the pool type / interior finish precedence (avvisiConfigurazionePiscina)`);
  }

  return {
    isValid: missingSections.length === 0 && missingBusinessRules.length === 0,
    missingSections,
    missingBusinessRules,
  };
}
