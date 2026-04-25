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
  presets: Array<{ value: string; label: string; description: string }>;
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
      { value: "deck_wpc", label: "Deck WPC", description: "Doghe outdoor, giunti aperti e bordo deck credibile." },
      { value: "pietra_naturale", label: "Pietra naturale", description: "Variazioni minerali, moduli plausibili e raccordi puliti." },
      { value: "coping_piscina", label: "Solo coping piscina", description: "Cambia solo bordo piscina, preservando vasca e superfici non target." },
      { value: "autobloccanti_carrabili", label: "Autobloccanti carrabili", description: "Pattern modulare stabile e look tecnico da vialetto." },
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
      { value: "solo_prato", label: "Solo prato nuovo", description: "Rifacimento prato senza aggiungere elementi non richiesti." },
      { value: "aiuole_perimetrali", label: "Aiuole perimetrali", description: "Bordi puliti, arbusti in scala e passaggi liberi." },
      { value: "siepe_schermante", label: "Siepe schermante", description: "Schermatura realistica senza coprire aperture non richieste." },
      { value: "moderno_minimale", label: "Moderno minimale", description: "Prato, masse verdi controllate, bordi netti e camminamento." },
      { value: "premium_relax", label: "Premium relax", description: "Progetto completo con zone verdi, percorsi, luci e arredo sobrio." },
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
      { value: "classica_pantografata", label: "Classica pantografata", description: "Dettagli classici proporzionati senza eccessi." },
      { value: "rasomuro", label: "Rasomuro", description: "Coprifili assenti o minimi e integrazione filo parete." },
      { value: "con_fiancoluce", label: "Con fiancoluce", description: "Fiancoluce proporzionato solo se il vano lo consente." },
      { value: "solo_finitura", label: "Cambio sola finitura", description: "Preserva vano e geometria, cambia solo look pannello." },
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
      { value: "battente_liscia", label: "Battente liscia", description: "Porta semplice con telaio e coprifili coerenti." },
      { value: "scorrevole_interno_muro", label: "Scorrevole interno muro", description: "Porta a scomparsa senza binario esterno visibile." },
      { value: "scorrevole_esterno_muro", label: "Scorrevole esterno muro", description: "Binario visibile solo con parete libera e senza collisioni." },
      { value: "rasomuro", label: "Rasomuro", description: "Integrazione pulita con parete e coprifili assenti/minimi." },
      { value: "vetrata_satinata", label: "Vetrata satinata", description: "Vetro realistico, privacy coerente e telai proporzionati." },
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
