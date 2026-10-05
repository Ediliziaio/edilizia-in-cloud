import {
  opzioniDelModulo,
  opzioniValide,
  valoriApplicabili,
  type CampoTestoTecnico,
} from "../../../shared/render-technical/opzioni.ts";

export const TECHNICAL_RENDER_MODULE_IDS = [
  "ristrutturazioni",
  "pavimenti-esterni",
  "giardini",
  "porte-blindate",
  "porte-interne",
] as const;

export type TechnicalRenderModuleId = typeof TECHNICAL_RENDER_MODULE_IDS[number];

export interface TechnicalRenderConfig {
  interventionPreset: string;
  targetArea: string;
  materialOrSystem: string;
  colorAndFinish: string;
  technicalDetails: string;
  preserveNotes: string;
  intensity: "leggera" | "media" | "completa";
  /** Foto prodotto del catalogo render dell'azienda scelte nel wizard (max 4). */
  catalogo_reference_ids?: string[];
  /**
   * Scelte strutturate oltre al preset (shared/render-technical/opzioni.ts):
   * chiave → valore. Assente = «non specificato», il prompt resta quello di prima.
   */
  opzioni?: Record<string, string>;
}

export interface TechnicalRenderPreset {
  value: string;
  label: string;
  description: string;
  /**
   * Testi di partenza coerenti con il preset. Prima il form teneva i testi del
   * preset predefinito anche cambiando preset: una «Battente liscia» partiva con
   * «Porta richiesta: porta interna rasomuro laccata» nelle note del prompt.
   * Assenti = quelli di defaultConfig.
   */
  testi?: Partial<Record<CampoTestoTecnico, string>>;
}

export interface TechnicalRenderModuleSpec {
  id: TechnicalRenderModuleId;
  label: string;
  singularLabel: string;
  uploadTitle: string;
  uploadDescription: string;
  configTitle: string;
  resultTitle: string;
  galleryTitle: string;
  galleryDescription: string;
  accentClassName: string;
  buttonClassName: string;
  presets: TechnicalRenderPreset[];
  defaultConfig: TechnicalRenderConfig;
}

export const technicalRenderModuleSpecs: Record<TechnicalRenderModuleId, TechnicalRenderModuleSpec> = {
  ristrutturazioni: {
    id: "ristrutturazioni",
    label: "Ristrutturazioni",
    singularLabel: "ristrutturazione",
    uploadTitle: "Foto ambiente / immobile",
    uploadDescription: "Carica una foto reale dell'ambiente da ristrutturare. Il sistema usera solo i domini visibili nella scena.",
    configTitle: "Configura ristrutturazione coordinata",
    resultTitle: "Render ristrutturazione completato",
    galleryTitle: "Render ristrutturazioni salvati, coordinati per sistemi e CRM.",
    galleryDescription: "Controlla interventi multi-sistema, autore, data e collegamenti commerciali senza mostrare il prompt.",
    accentClassName: "text-indigo-600",
    buttonClassName: "bg-indigo-600 hover:bg-indigo-700",
    presets: [
      { value: "restyling_interno_coordinato", label: "Restyling interno coordinato", description: "Pareti, pavimento, luci e arredo nella stessa stanza." },
      { value: "riqualificazione_involucro", label: "Involucro esterno", description: "Facciata, infissi, persiane e tetto se visibili insieme." },
      { value: "outdoor_completo", label: "Outdoor completo", description: "Giardino, pavimenti esterni, piscina e pergola se compatibili." },
      { value: "bagno_completo", label: "Bagno completo", description: "Rivestimenti, sanitari, doccia/vasca, mobile e luci." },
    ],
    defaultConfig: {
      interventionPreset: "restyling_interno_coordinato",
      targetArea: "sistemi visibili nella foto caricata",
      materialOrSystem: "finiture coordinate premium",
      colorAndFinish: "palette contemporanea neutra e materiali realistici",
      technicalDetails: "Orchestra solo domini compatibili con la singola foto; risolvi conflitti e preserva geometria, aperture e prospettiva.",
      preserveNotes: "stessa stanza/immobile, stessa prospettiva, aperture, elementi non target e contesto",
      intensity: "completa",
    },
  },
  "pavimenti-esterni": {
    id: "pavimenti-esterni",
    label: "Pavimenti esterni",
    singularLabel: "pavimento esterno",
    uploadTitle: "Foto area esterna",
    uploadDescription: "Carica patio, vialetto, terrazza, bordo piscina o ingresso esterno con superfici e soglie leggibili.",
    configTitle: "Configura pavimentazione esterna",
    resultTitle: "Render pavimento esterno completato",
    galleryTitle: "Render pavimenti esterni salvati, filtrabili per materiale e CRM.",
    galleryDescription: "Vedi subito materiale, target area, autore e collegamenti commerciali di ogni proposta hardscape.",
    accentClassName: "text-lime-700",
    buttonClassName: "bg-lime-700 hover:bg-lime-800",
    presets: [
      { value: "gres_outdoor_grande_formato", label: "Gres outdoor grande formato", description: "Lastre esterne antiscivolo con fughe rade e tagli perimetrali." },
      {
        value: "gres_outdoor_standard", label: "Gres outdoor 60x60", description: "Piastrelle esterne 2 cm antiscivolo in formato standard, fuga sottile.",
        testi: { materialOrSystem: "gres porcellanato outdoor 2 cm 60x60" },
      },
      {
        value: "pietra_naturale", label: "Pietra naturale", description: "Variazioni minerali, moduli plausibili e raccordi puliti.",
        testi: { materialOrSystem: "pietra naturale a opus, spessore 3 cm", colorAndFinish: "tonalità naturale della pietra", technicalDetails: "Rispetta soglie e pendenze; fughe regolari e tagli perimetrali puliti." },
      },
      {
        value: "autobloccanti_carrabili", label: "Autobloccanti carrabili", description: "Pattern modulare stabile e look tecnico da vialetto.",
        testi: { materialOrSystem: "masselli autobloccanti carrabili 20x10", colorAndFinish: "grigio chiaro", technicalDetails: "Rispetta soglie, pendenze e cordoli; fughe in sabbia e tagli perimetrali puliti." },
      },
      {
        value: "cotto_esterno", label: "Cotto da esterno", description: "Cotto antigelivo con variazioni di tono e fughe medie.",
        testi: { materialOrSystem: "cotto da esterno antigelivo 15x30", colorAndFinish: "cotto naturale", technicalDetails: "Rispetta soglie e pendenze; fughe medie regolari e tagli perimetrali puliti." },
      },
      {
        value: "cemento_architettonico", label: "Cemento spazzolato", description: "Getto continuo a campiture, superficie spazzolata, giunti di controllo sottili.",
        testi: { materialOrSystem: "cemento spazzolato a getto continuo", colorAndFinish: "grigio cemento naturale", technicalDetails: "Rispetta soglie e pendenze; giunti di controllo sottili e bordi netti." },
      },
      {
        value: "cemento_drenante", label: "Cemento drenante", description: "Getto continuo permeabile, grana a vista, nessuna fuga.",
        testi: { materialOrSystem: "cemento drenante a getto continuo", colorAndFinish: "grigio naturale", technicalDetails: "Rispetta soglie e pendenze; bordi di contenimento netti, nessuna fuga." },
      },
      {
        value: "ghiaia_stabilizzata", label: "Ghiaia stabilizzata", description: "Ghiaia compattata su grigliato, calpestabile, con bordi di contenimento.",
        testi: { materialOrSystem: "ghiaia stabilizzata su grigliato drenante", colorAndFinish: "ghiaia chiara", technicalDetails: "Rispetta soglie e pendenze; bordi di contenimento netti, superficie compatta e piana." },
      },
      {
        value: "deck_wpc", label: "Deck WPC", description: "Doghe outdoor, giunti aperti e bordo deck credibile.",
        testi: { materialOrSystem: "deck in WPC a doghe con giunti aperti", colorAndFinish: "marrone legno naturale", technicalDetails: "Rispetta soglie e pendenze; doghe con giunti aperti e testate pulite." },
      },
      {
        value: "deck_legno", label: "Deck legno naturale", description: "Doghe in legno massello con venatura, giunti aperti e testate pulite.",
        testi: { materialOrSystem: "deck in legno naturale a doghe", colorAndFinish: "legno naturale oliato", technicalDetails: "Rispetta soglie e pendenze; doghe con giunti aperti e testate pulite." },
      },
      {
        value: "coping_piscina", label: "Solo coping piscina", description: "Cambia solo bordo piscina, preservando vasca e superfici non target.",
        testi: { targetArea: "bordo della piscina", materialOrSystem: "bordo piscina (copertina) nuovo", colorAndFinish: "tono naturale del materiale del bordo", technicalDetails: "Cambia solo il bordo vasca: acqua, vasca e superfici intorno restano identiche." },
      },
    ],
    defaultConfig: {
      interventionPreset: "gres_outdoor_grande_formato",
      targetArea: "patio o superficie esterna principale",
      materialOrSystem: "gres porcellanato outdoor 90x90 o 120x120",
      colorAndFinish: "grigio caldo antiscivolo naturale",
      technicalDetails: "Rispetta soglie, pendenze, drenaggio apparente, fughe sottili e tagli perimetrali realistici.",
      preserveNotes: "facciata, infissi, prato, piscina non target, arredi e quote esistenti",
      intensity: "media",
    },
  },
  giardini: {
    id: "giardini",
    label: "Giardini",
    singularLabel: "giardino",
    uploadTitle: "Foto giardino",
    uploadDescription: "Carica giardino, cortile, lato casa o area verde con casa, percorsi e vegetazione leggibili.",
    configTitle: "Configura progetto giardino",
    resultTitle: "Render giardino completato",
    galleryTitle: "Render giardini salvati, organizzati per stile e CRM.",
    galleryDescription: "Confronta prato, aiuole, siepi, camminamenti, autore, data e collegamenti commerciali.",
    accentClassName: "text-green-700",
    buttonClassName: "bg-green-700 hover:bg-green-800",
    presets: [
      {
        value: "solo_prato", label: "Solo prato nuovo", description: "Rifacimento prato senza aggiungere elementi non richiesti.",
        testi: { targetArea: "prato principale", materialOrSystem: "prato nuovo in rotoli", colorAndFinish: "verde naturale" },
      },
      {
        value: "aiuole_perimetrali", label: "Aiuole perimetrali", description: "Bordi puliti, arbusti in scala e passaggi liberi.",
        testi: { targetArea: "bordi perimetrali del giardino", materialOrSystem: "aiuole perimetrali con arbusti e bordure" },
      },
      {
        value: "siepe_schermante", label: "Siepe schermante", description: "Schermatura realistica senza coprire aperture non richieste.",
        testi: { targetArea: "confine del giardino da schermare", materialOrSystem: "siepe sempreverde schermante", colorAndFinish: "verde scuro naturale" },
      },
      { value: "moderno_minimale", label: "Moderno minimale", description: "Prato, masse verdi controllate, bordi netti e camminamento." },
      {
        value: "premium_relax", label: "Premium relax", description: "Progetto completo con zone verdi, percorsi, luci e arredo sobrio.",
        testi: { materialOrSystem: "prato, aiuole curate, camminamento in pietra e luci soffuse" },
      },
    ],
    defaultConfig: {
      interventionPreset: "moderno_minimale",
      targetArea: "prato principale e bordi perimetrali",
      materialOrSystem: "prato resistente, aiuole moderne e stepping stones",
      colorAndFinish: "verde naturale con bordure minerali chiare",
      technicalDetails: "Mantieni scala vegetale plausibile, passaggi liberi, visuali e densita controllata.",
      preserveNotes: "casa, hardscape non target, piscina/pergola se presenti, recinzioni e alberi significativi",
      intensity: "media",
    },
  },
  "porte-blindate": {
    id: "porte-blindate",
    label: "Porte blindate",
    singularLabel: "porta blindata",
    uploadTitle: "Foto ingresso / porta esistente",
    uploadDescription: "Carica ingresso, pianerottolo o portico con vano porta, pareti e pavimento leggibili.",
    configTitle: "Configura porta blindata",
    resultTitle: "Render porta blindata completato",
    galleryTitle: "Render porte blindate salvati, filtrabili per modello e CRM.",
    galleryDescription: "Ritrova porta, finitura, telaio, lato visibile, autore e collegamenti commerciali.",
    accentClassName: "text-slate-700",
    buttonClassName: "bg-slate-800 hover:bg-slate-900",
    presets: [
      { value: "moderna_liscia", label: "Moderna liscia", description: "Pannello pulito, ferramenta minimale e telaio coerente." },
      {
        value: "classica_pantografata", label: "Classica pantografata", description: "Dettagli classici proporzionati senza eccessi.",
        testi: { materialOrSystem: "porta blindata classica con pannello pantografato", colorAndFinish: "noce caldo pantografato" },
      },
      // Questi tre preset tengono la finitura del modello base, effetto legno: il colore di
      // partenza è un legno, non l'«antracite opaco» del preset liscio («wood-effect in antracite»).
      {
        value: "rasomuro", label: "Rasomuro", description: "Coprifili assenti o minimi e integrazione filo parete.",
        testi: { materialOrSystem: "porta blindata rasomuro filo parete", colorAndFinish: "rovere naturale" },
      },
      {
        value: "con_fiancoluce", label: "Con fiancoluce", description: "Fiancoluce proporzionato solo se il vano lo consente.",
        testi: { materialOrSystem: "porta blindata con fiancoluce vetrato", colorAndFinish: "rovere naturale" },
      },
      {
        value: "solo_finitura", label: "Cambio sola finitura", description: "Preserva vano e geometria, cambia solo look pannello.",
        testi: {
          materialOrSystem: "stessa porta blindata, nuovo pannello di rivestimento",
          colorAndFinish: "rovere naturale",
          technicalDetails: "Cambia solo il pannello di rivestimento: stessa porta, stesso telaio, stessa ferramenta e stessa soglia.",
        },
      },
    ],
    defaultConfig: {
      interventionPreset: "moderna_liscia",
      targetArea: "vano porta d'ingresso visibile",
      materialOrSystem: "porta blindata moderna anta singola con telaio minimale",
      colorAndFinish: "antracite opaco lato visibile, interno effetto legno chiaro se coerente",
      technicalDetails: "Integra telaio, coprifili, soglia, maniglia e defender in scala; rimuovi ogni residuo della vecchia porta.",
      preserveNotes: "pareti, pavimento, zoccolino, citofono/interruttori e contesto non target",
      intensity: "media",
    },
  },
  "porte-interne": {
    id: "porte-interne",
    label: "Porte interne",
    singularLabel: "porta interna",
    uploadTitle: "Foto stanza / vano interno",
    uploadDescription: "Carica soggiorno, corridoio, bagno o camera con vano porta e parete circostante leggibili.",
    configTitle: "Configura porta interna",
    resultTitle: "Render porta interna completato",
    galleryTitle: "Render porte interne salvati, filtrabili per apertura e CRM.",
    galleryDescription: "Consulta tipologia, finitura, telaio, autore, data e associazione commerciale di ogni porta.",
    accentClassName: "text-violet-600",
    buttonClassName: "bg-violet-600 hover:bg-violet-700",
    presets: [
      {
        value: "battente_liscia", label: "Battente liscia", description: "Porta semplice con telaio e coprifili coerenti.",
        testi: { materialOrSystem: "porta interna battente liscia con coprifili" },
      },
      {
        value: "battente_classica", label: "Battente classica", description: "Pannelli pantografati, coprifili classici e maniglia in tono.",
        testi: { materialOrSystem: "porta interna classica pantografata con coprifili", colorAndFinish: "bianco opaco con maniglia ottone" },
      },
      {
        value: "scorrevole_interno_muro", label: "Scorrevole interno muro", description: "Porta a scomparsa senza binario esterno visibile.",
        testi: { materialOrSystem: "porta scorrevole a scomparsa nel muro (controtelaio)" },
      },
      {
        value: "scorrevole_esterno_muro", label: "Scorrevole esterno muro", description: "Binario visibile solo con parete libera e senza collisioni.",
        testi: { materialOrSystem: "porta scorrevole esterno muro con binario a vista" },
      },
      { value: "rasomuro", label: "Rasomuro", description: "Integrazione pulita con parete e coprifili assenti/minimi." },
      {
        value: "tutta_altezza", label: "Tutta altezza", description: "Anta dal pavimento al soffitto, telaio minimale.",
        testi: { materialOrSystem: "porta interna a tutta altezza fino al soffitto" },
      },
      {
        value: "a_libro", label: "A libro", description: "Due ante che si ripiegano: per vani dove l'anta non ha spazio.",
        testi: { materialOrSystem: "porta a libro a due ante" },
      },
      {
        value: "doppia_anta", label: "Doppia anta", description: "Due ante simmetriche: solo per vani larghi.",
        testi: { materialOrSystem: "porta interna a doppia anta per vano largo" },
      },
      {
        value: "vetrata_satinata", label: "Vetrata", description: "Anta in vetro con telaio sottile: satinato se non scegli altro.",
        testi: { materialOrSystem: "porta interna in vetro con telaio sottile", colorAndFinish: "telaio sottile nero opaco" },
      },
    ],
    defaultConfig: {
      interventionPreset: "rasomuro",
      targetArea: "vano porta interno principale",
      materialOrSystem: "porta interna rasomuro laccata",
      colorAndFinish: "bianco opaco con maniglia nera minimale",
      technicalDetails: "Preserva pareti, pavimento, zoccolino e stanza; rispetta spazio di apertura/scorrimento e proporzioni del vano.",
      preserveNotes: "stessa stanza, arredi non target, interruttori, termosifoni, pavimento e prospettiva",
      intensity: "media",
    },
  },
};

export function isTechnicalRenderModuleId(value: string | undefined): value is TechnicalRenderModuleId {
  return Boolean(value && TECHNICAL_RENDER_MODULE_IDS.includes(value as TechnicalRenderModuleId));
}

export function getTechnicalRenderModuleSpec(moduleId: TechnicalRenderModuleId): TechnicalRenderModuleSpec {
  return technicalRenderModuleSpecs[moduleId];
}

const CAMPI_TESTO: CampoTestoTecnico[] = ["targetArea", "materialOrSystem", "colorAndFinish", "technicalDetails"];

/**
 * Il testo di partenza di un campo per le scelte correnti: prima quello del valore
 * di un'opzione scelta (es. finitura «noce scuro»), poi quello del preset, infine
 * quello del modulo.
 */
export function testoPredefinito(
  spec: TechnicalRenderModuleSpec,
  config: Pick<TechnicalRenderConfig, "interventionPreset" | "opzioni">,
  campo: CampoTestoTecnico,
): string {
  for (const opzione of opzioniDelModulo(spec.id)) {
    const scelto = config.opzioni?.[opzione.chiave];
    if (!scelto) continue;
    const valore = valoriApplicabili(opzione, config.interventionPreset).find((v) => v.value === scelto);
    if (valore?.testi?.[campo]) return valore.testi[campo] as string;
  }
  const preset = spec.presets.find((p) => p.value === config.interventionPreset);
  return preset?.testi?.[campo] ?? spec.defaultConfig[campo];
}

/**
 * Applica una nuova scelta (preset o opzioni) e porta con sé i testi che l'utente
 * non ha toccato: un campo ancora uguale al testo di partenza delle scelte vecchie
 * prende quello delle scelte nuove; uno scritto a mano resta com'è. Le opzioni che
 * il nuovo preset non prevede si scartano.
 */
export function applicaSceltaTecnica(
  spec: TechnicalRenderModuleSpec,
  prima: TechnicalRenderConfig,
  scelta: Partial<Pick<TechnicalRenderConfig, "interventionPreset" | "opzioni">>,
): TechnicalRenderConfig {
  const interventionPreset = scelta.interventionPreset ?? prima.interventionPreset;
  const opzioni = opzioniValide(spec.id, interventionPreset, "opzioni" in scelta ? scelta.opzioni : prima.opzioni);
  const dopo: TechnicalRenderConfig = { ...prima, interventionPreset, opzioni };
  if (!opzioni) delete dopo.opzioni;
  for (const campo of CAMPI_TESTO) {
    if ((prima[campo] ?? "") === testoPredefinito(spec, prima, campo)) dopo[campo] = testoPredefinito(spec, dopo, campo);
  }
  return dopo;
}

/** Cambia (o toglie, con valore vuoto) una sola opzione. */
export function cambiaOpzioneTecnica(
  spec: TechnicalRenderModuleSpec,
  prima: TechnicalRenderConfig,
  chiave: string,
  valore: string | null,
): TechnicalRenderConfig {
  const opzioni = { ...(prima.opzioni ?? {}) };
  if (valore) opzioni[chiave] = valore;
  else delete opzioni[chiave];
  return applicaSceltaTecnica(spec, prima, { opzioni });
}

export function summarizeTechnicalConfig(config: TechnicalRenderConfig): string[] {
  return [
    config.interventionPreset,
    config.targetArea,
    config.materialOrSystem,
    config.colorAndFinish,
    config.technicalDetails,
    config.preserveNotes,
    config.intensity,
  ].filter(Boolean);
}
