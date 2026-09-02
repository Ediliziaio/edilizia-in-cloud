// shared/render-technical/bridge.ts
//
// Ponte fra la configurazione GENERICA della pagina "Moduli tecnici" (sette
// campi: preset + testo libero) e le configurazioni RICCHE delle librerie di
// prompt di ogni modulo.
//
// Perche' esiste. La pagina ha un solo stato per tutti i moduli — preset,
// area target, materiale/sistema, colore/finitura, dettagli tecnici, note di
// preservazione, intensita'. Le librerie di prompt (render-garden,
// render-exterior-floor, render-interior-door, render-security-door) vogliono
// invece un oggetto strutturato con decine di campi, e lo normalizzano con un
// cast senza controlli: passargli i sette campi generici significa leggere
// `config.prato.tipo` su undefined e crashare, come successo su facciata.
// Risultato, prima di questo file: quattro librerie di prompt curate — con i
// loro test verdi — che non raggiungevano MAI il modello; l'edge usava una
// tabella generica di regole.
//
// Cosa fa. Parte dal default completo del modulo, applica il preset scelto
// (che e' l'unica scelta strutturata dell'utente) e infila i campi di testo
// libero dove la libreria li legge: area target -> posizione/zona, materiale
// e colore -> campi materiale/colore, dettagli tecnici -> note libere, note di
// preservazione -> elementi_da_preservare. Il testo libero non viene mai
// buttato: quello che non ha un campo dedicato finisce in note_libere, che
// tutte le librerie stampano nel prompt.
//
// Cosa NON fa. Non inventa scelte che l'utente non ha fatto: dove il preset
// non dice nulla resta il default, dichiarato e leggibile qui sotto.

import type { ConfigurazioneGiardino } from "../render-garden/types.ts";
import type { ConfigurazionePavimentoEsterno } from "../render-exterior-floor/types.ts";
import type { ConfigurazionePortaInterna } from "../render-interior-door/types.ts";
import type { ConfigurazionePortaBlindata } from "../render-security-door/types.ts";
import {
  DEFAULT_EXTERIOR_FLOOR_CONFIG,
  DEFAULT_GARDEN_CONFIG,
  DEFAULT_INTERIOR_DOOR_CONFIG,
  DEFAULT_SECURITY_DOOR_CONFIG,
} from "./defaults.ts";

export interface GenericTechnicalConfig {
  interventionPreset?: string;
  targetArea?: string;
  materialOrSystem?: string;
  colorAndFinish?: string;
  technicalDetails?: string;
  preserveNotes?: string;
  intensity?: string;
}

export type BridgedModule =
  | "giardini"
  | "pavimenti-esterni"
  | "porte-interne"
  | "porte-blindate";

function testo(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** "casa, deck in legno, alberi" -> ["casa", "deck in legno", "alberi"] */
function elenco(v: unknown): string[] {
  return testo(v).split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
}

/** Le note libere raccolgono tutto il testo che non ha un campo dedicato. */
function noteLibere(g: GenericTechnicalConfig, righe: string[]): string {
  return [
    ...righe,
    testo(g.technicalDetails) ? `Dettagli tecnici: ${testo(g.technicalDetails)}` : "",
    testo(g.colorAndFinish) ? `Colore e finitura: ${testo(g.colorAndFinish)}` : "",
    testo(g.intensity) ? `Intensita' intervento: ${testo(g.intensity)}` : "",
  ].filter(Boolean).join("\n");
}

function clona<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

// ── Giardini ────────────────────────────────────────────────────────────────

export function bridgeGiardini(g: GenericTechnicalConfig): ConfigurazioneGiardino {
  const c = clona(DEFAULT_GARDEN_CONFIG);
  switch (testo(g.interventionPreset)) {
    case "solo_prato":
      c.interventi = ["rifacimento_prato"];
      c.target_zones = ["prato_principale"];
      c.aiuole.attivo = false;
      c.camminamenti.attivo = false;
      break;
    case "aiuole_perimetrali":
      c.interventi = ["aggiunta_aiuole"];
      c.target_zones = ["perimetro", "bordo_casa"];
      c.aiuole = { attivo: true, tipo: "perimetrale", densita: "media", palette: "verde_strutturale" };
      c.prato.attivo = false;
      break;
    case "siepe_schermante":
      c.interventi = ["aggiunta_siepi"];
      c.target_zones = ["perimetro", "fascia_laterale"];
      c.siepi = { attivo: true, tipo: "schermante_media", altezza: "media" };
      c.prato.attivo = false;
      c.aiuole.attivo = false;
      break;
    case "moderno_minimale":
      c.stile = "moderno_minimale";
      c.interventi = ["restyling_completo"];
      c.target_zones = ["prato_principale", "perimetro", "area_camminamento"];
      c.camminamenti = { attivo: true, tipo: "stepping_stones" };
      break;
    case "premium_relax":
      c.stile = "premium_relax";
      c.interventi = ["restyling_completo", "upgrade_area_relax", "aggiunta_camminamenti"];
      c.target_zones = ["prato_principale", "perimetro", "area_relax", "area_camminamento"];
      c.camminamenti = { attivo: true, tipo: "pietra_naturale" };
      c.illuminazione = "mix_soft";
      c.arredo = { modalita: "aggiungi_relax" };
      break;
  }
  // Il testo libero VINCE sul preset quando nomina una scelta concreta.
  // Primo render reale via ponte (14caeaa3): l'utente aveva scritto "vialetto
  // in pietra naturale, largo 90cm", il preset "moderno_minimale" imponeva
  // stepping stones, e il render ha fatto le stepping stones. Il prompt
  // generico, che leggeva solo il testo, aveva seguito l'utente.
  const richiesta = `${testo(g.materialOrSystem)} ${testo(g.technicalDetails)} ${testo(g.targetArea)}`.toLowerCase();
  if (/vialett|cammin|percors|sentier|passaggio/.test(richiesta)) {
    c.camminamenti.attivo = true;
    if (!c.interventi.includes("aggiunta_camminamenti") && !c.interventi.includes("restyling_completo")) {
      c.interventi = [...c.interventi, "aggiunta_camminamenti"];
    }
    if (/pietra/.test(richiesta)) c.camminamenti.tipo = "pietra_naturale";
    else if (/ghiaia/.test(richiesta)) c.camminamenti.tipo = "ghiaia";
    else if (/betonell|masse/.test(richiesta)) c.camminamenti.tipo = "betonelle";
    else if (/lastr/.test(richiesta)) c.camminamenti.tipo = "lastre_modulari";
    else if (/deck|legno/.test(richiesta)) c.camminamenti.tipo = "deck_path";
    else if (/stepping|passi/.test(richiesta)) c.camminamenti.tipo = "stepping_stones";
  }
  if (/sintetic/.test(richiesta)) c.prato.tipo = "sintetico_premium";
  else if (/inglese/.test(richiesta)) c.prato.tipo = "prato_inglese";
  else if (/rotol/.test(richiesta)) c.prato.tipo = "prato_resistente";
  if (/siep/.test(richiesta)) c.siepi.attivo = true;
  if (/alber/.test(richiesta) && !/senza alber|niente alber|no alber/.test(richiesta)) c.alberi.attivo = true;

  const preserva = elenco(g.preserveNotes);
  if (preserva.length > 0) c.elementi_da_preservare = preserva;
  c.note_libere = noteLibere(g, [
    testo(g.targetArea) ? `Area target descritta dall'utente: ${testo(g.targetArea)}` : "",
    testo(g.materialOrSystem) ? `Sistema/materiali richiesti: ${testo(g.materialOrSystem)}` : "",
  ]);
  return c;
}

// ── Pavimenti esterni ───────────────────────────────────────────────────────

export function bridgePavimentiEsterni(g: GenericTechnicalConfig): ConfigurazionePavimentoEsterno {
  const c = clona(DEFAULT_EXTERIOR_FLOOR_CONFIG);
  switch (testo(g.interventionPreset)) {
    case "gres_outdoor_grande_formato":
      c.materiale = "lastre_grande_formato";
      c.finitura = "antiscivolo";
      c.pattern_posa = "rettilineo";
      c.giunto = "fuga_sottile";
      c.formato = "120x120";
      break;
    case "deck_wpc":
      c.operazione = "convert_to_deck";
      c.materiale = "deck_wpc";
      c.finitura = "spazzolato";
      c.pattern_posa = "doga_sfalsata";
      c.giunto = "giunto_aperto_deck";
      c.formato = "doghe 14x300";
      break;
    case "pietra_naturale":
      c.materiale = "pietra_naturale";
      c.finitura = "fiammato";
      c.pattern_posa = "opus";
      c.giunto = "fuga_media";
      c.formato = "moduli misti";
      break;
    case "coping_piscina":
      c.operazione = "change_coping_only";
      c.inserimento.area_target = "bordo_piscina";
      c.uso = "bordo_piscina";
      c.bordo = "coping_piscina_moderno";
      c.coping_materiale = "pietra_chiara";
      c.materiale = "coping_bordo_piscina";
      c.inserimento.rapporto_con_piscina = "cambia SOLO il bordo vasca; acqua, rivestimento vasca e superfici circostanti da preservare";
      break;
    case "autobloccanti_carrabili":
      c.materiale = "masselli_autobloccanti";
      c.finitura = "naturale";
      c.pattern_posa = "massello_spina";
      c.giunto = "sabbia_polimerica";
      c.uso = "carrabile_leggera";
      c.inserimento.area_target = "vialetto";
      c.formato = "masselli 20x10";
      break;
  }
  if (testo(g.targetArea)) c.inserimento.posizione_descrittiva = testo(g.targetArea);
  if (testo(g.colorAndFinish)) c.colore_nome = testo(g.colorAndFinish);
  const preserva = elenco(g.preserveNotes);
  if (preserva.length > 0) c.elementi_da_preservare = preserva;
  c.note_libere = noteLibere(g, [
    testo(g.materialOrSystem) ? `Sistema/materiali richiesti: ${testo(g.materialOrSystem)}` : "",
  ]);
  return c;
}

// ── Porte interne ───────────────────────────────────────────────────────────

export function bridgePorteInterne(g: GenericTechnicalConfig): ConfigurazionePortaInterna {
  const c = clona(DEFAULT_INTERIOR_DOOR_CONFIG);
  switch (testo(g.interventionPreset)) {
    case "battente_liscia":
      c.door_type = "battente_liscia";
      c.leaf_config = "singola";
      c.frame = { tipo: "standard", colore: "coordinato alla porta", coprifilo: "standard" };
      c.hardware = { elementi: ["maniglia_moderna", "cerniere_visibili"], finitura: "nero_opaco" };
      break;
    case "scorrevole_interno_muro":
      c.interventi = ["convert_to_pocket_sliding"];
      c.door_type = "scorrevole_interno_muro";
      c.leaf_config = "scorrevole_singola";
      c.frame = { tipo: "minimale", colore: "coordinato parete", coprifilo: "minimale" };
      c.hardware = { elementi: ["maniglia_moderna"], finitura: "nero_opaco" };
      break;
    case "scorrevole_esterno_muro":
      c.interventi = ["convert_to_wall_sliding"];
      c.door_type = "scorrevole_esterno_muro";
      c.leaf_config = "scorrevole_singola";
      c.frame = { tipo: "minimale", colore: "coordinato parete", coprifilo: "assente" };
      c.hardware = { elementi: ["maniglia_moderna", "binario_visibile"], finitura: "nero_opaco" };
      c.apertura.spazio_scorrimento_parete = "ampio";
      break;
    case "rasomuro":
      c.interventi = ["convert_to_flush_door"];
      c.door_type = "rasomuro";
      c.frame = { tipo: "rasomuro", colore: "bianco coordinato parete", coprifilo: "assente" };
      break;
    case "vetrata_satinata":
      c.interventi = ["replace_existing_door", "add_glazing"];
      c.door_type = "vetrata";
      c.finish = "vetro_satinato";
      c.glass = { enabled: true, type: "satinato", privacy_level: "medio" };
      c.frame = { tipo: "minimale", colore: "nero opaco", coprifilo: "minimale" };
      break;
  }
  if (testo(g.colorAndFinish)) c.colore = testo(g.colorAndFinish);
  const preserva = elenco(g.preserveNotes);
  if (preserva.length > 0) c.elementi_da_preservare = preserva;
  c.note_libere = noteLibere(g, [
    testo(g.targetArea) ? `Vano target descritto dall'utente: ${testo(g.targetArea)}` : "",
    testo(g.materialOrSystem) ? `Porta richiesta: ${testo(g.materialOrSystem)}` : "",
  ]);
  return c;
}

// ── Porte blindate ──────────────────────────────────────────────────────────

export function bridgePorteBlindate(g: GenericTechnicalConfig): ConfigurazionePortaBlindata {
  const c = clona(DEFAULT_SECURITY_DOOR_CONFIG);
  switch (testo(g.interventionPreset)) {
    case "moderna_liscia":
      c.door_type = "appartamento_moderna";
      c.stile = "moderno";
      c.finitura_lato_visibile = "liscio_opaco";
      c.frame = { tipo: "minimale", colore: "antracite coordinato", coprifilo: "minimale" };
      break;
    case "classica_pantografata":
      c.door_type = "appartamento_classica";
      c.stile = "classico";
      c.finitura_lato_visibile = "pantografato";
      c.finitura_interna = "pantografato";
      c.frame = { tipo: "cornice_classica", colore: "coordinato alla porta", coprifilo: "classico" };
      c.hardware = { elementi: ["maniglia_classica", "defender_visibile", "spioncino_standard"], finitura: "ottone", posizione: "standard" };
      break;
    case "rasomuro":
      c.interventi = ["convert_to_flush_or_minimal"];
      c.door_type = "rasomuro";
      c.frame = { tipo: "rasomuro", colore: "coordinato parete", coprifilo: "assente" };
      break;
    case "con_fiancoluce":
      c.interventi = ["replace_existing_door", "add_sidelight"];
      c.door_type = "con_fiancoluce";
      c.leaf_type = "anta_singola_con_fianco";
      c.vetri = { fiancoluce: true, sopraluce: false, finitura_vetro: "satinato" };
      c.apertura.presenza_fiancoluce = true;
      break;
    case "solo_finitura":
      c.interventi = ["recolor_or_restyle_only"];
      break;
  }
  if (testo(g.colorAndFinish)) c.colore_lato_visibile = testo(g.colorAndFinish);
  const preserva = elenco(g.preserveNotes);
  if (preserva.length > 0) c.elementi_da_preservare = preserva;
  c.note_libere = noteLibere(g, [
    testo(g.targetArea) ? `Vano target descritto dall'utente: ${testo(g.targetArea)}` : "",
    testo(g.materialOrSystem) ? `Porta richiesta: ${testo(g.materialOrSystem)}` : "",
  ]);
  return c;
}

export function bridgeTechnicalConfig(
  modulo: BridgedModule,
  generic: GenericTechnicalConfig,
): Record<string, unknown> {
  switch (modulo) {
    case "giardini":
      return bridgeGiardini(generic) as unknown as Record<string, unknown>;
    case "pavimenti-esterni":
      return bridgePavimentiEsterni(generic) as unknown as Record<string, unknown>;
    case "porte-interne":
      return bridgePorteInterne(generic) as unknown as Record<string, unknown>;
    case "porte-blindate":
      return bridgePorteBlindate(generic) as unknown as Record<string, unknown>;
  }
}
