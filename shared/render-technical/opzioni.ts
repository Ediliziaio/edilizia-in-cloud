// shared/render-technical/opzioni.ts
//
// Le scelte strutturate dei moduli tecnici, oltre al preset.
//
// La pagina "Moduli tecnici" aveva un solo campo strutturato (il preset); tutto
// il resto era testo libero. Le librerie di prompt però sanno descrivere molto di
// più — finitura del pannello, lato fotografato, materiale del bordo vasca,
// gradini, stile del giardino… — e quei campi restavano fermi al valore di
// default (il bordo vasca sempre «pietra chiara», la blindata sempre vista
// dall'interno, la porta interna sempre «laccato bianco» anche in rovere).
//
// Qui ogni opzione dice: chiave in `config.opzioni`, etichetta, per quali preset
// ha senso e quali valori ammette. Il ponte (bridge.ts) la legge con
// `leggiOpzione`, che scarta i valori non ammessi (le config arrivano anche
// dall'API) e quelli di un preset diverso. Valore assente = «non specificato»:
// il ponte non tocca niente e il prompt resta identico a quello di prima.
//
// I valori sono le chiavi vere delle configurazioni ricche (types.ts dei
// moduli); le etichette sono in italiano per il form.

export type ModuloConOpzioni = "giardini" | "pavimenti-esterni" | "porte-interne" | "porte-blindate";

/** Campi di testo della pagina che una scelta può riempire quando l'utente non li ha toccati. */
export type CampoTestoTecnico = "targetArea" | "materialOrSystem" | "colorAndFinish" | "technicalDetails";

export interface ValoreOpzioneTecnica {
  value: string;
  label: string;
  /** Testi di partenza coerenti con questo valore (vedi testoPredefinito in technicalRenderModules.ts). */
  testi?: Partial<Record<CampoTestoTecnico, string>>;
}

export interface OpzioneTecnica {
  /** Chiave in `config.opzioni`. */
  chiave: string;
  etichetta: string;
  /** Testo della scelta «non specificato» nel form. */
  nonSpecificato: string;
  /** Preset per cui l'opzione ha senso; assente = tutti. */
  preset?: string[];
  valori: ValoreOpzioneTecnica[];
  /** Per alcune opzioni (la posa) i valori ammessi dipendono dal preset. */
  valoriPerPreset?: Record<string, string[]>;
}

const MANIGLIA_COMUNE: ValoreOpzioneTecnica[] = [
  { value: "nero_opaco", label: "Nero opaco" },
  { value: "cromo", label: "Cromo lucido" },
  { value: "acciaio", label: "Acciaio satinato" },
  { value: "ottone", label: "Ottone" },
  { value: "bronzo", label: "Bronzo" },
];

export const OPZIONI_TECNICHE: Record<ModuloConOpzioni, OpzioneTecnica[]> = {
  "porte-interne": [
    {
      chiave: "finitura_anta",
      etichetta: "Finitura anta",
      nonSpecificato: "Come da modello",
      preset: ["battente_liscia", "battente_classica", "scorrevole_interno_muro", "scorrevole_esterno_muro", "rasomuro", "a_libro", "doppia_anta", "tutta_altezza"],
      valori: [
        { value: "laccato_bianco", label: "Laccato bianco", testi: { colorAndFinish: "bianco opaco" } },
        { value: "laccato_colorato", label: "Laccato colorato", testi: { colorAndFinish: "laccato grigio tortora opaco" } },
        { value: "effetto_legno_chiaro", label: "Effetto legno chiaro", testi: { colorAndFinish: "rovere chiaro naturale" } },
        { value: "effetto_legno_scuro", label: "Effetto legno scuro", testi: { colorAndFinish: "noce scuro" } },
        { value: "laminato", label: "Laminato", testi: { colorAndFinish: "laminato rovere naturale" } },
        { value: "materico", label: "Materico", testi: { colorAndFinish: "grigio materico opaco" } },
      ],
    },
    {
      chiave: "vetro",
      etichetta: "Vetro",
      nonSpecificato: "Satinato (come da modello)",
      preset: ["vetrata_satinata"],
      valori: [
        { value: "satinato", label: "Satinato" },
        { value: "trasparente", label: "Trasparente" },
        { value: "fume", label: "Fumé" },
      ],
    },
    {
      chiave: "maniglia",
      etichetta: "Finitura maniglia",
      nonSpecificato: "Come da modello",
      valori: [...MANIGLIA_COMUNE, { value: "bianco", label: "Bianca" }],
    },
  ],
  "porte-blindate": [
    {
      chiave: "lato_foto",
      etichetta: "Lato fotografato",
      nonSpecificato: "Non specificato (interno)",
      valori: [
        { value: "interno", label: "Dall'interno di casa" },
        { value: "pianerottolo", label: "Dal pianerottolo" },
        { value: "esterno_villa", label: "Dall'esterno (ingresso villa)" },
      ],
    },
    {
      chiave: "finitura_pannello",
      etichetta: "Finitura pannello (lato fotografato)",
      nonSpecificato: "Come da modello",
      valori: [
        { value: "liscio_opaco", label: "Liscio opaco", testi: { colorAndFinish: "antracite opaco" } },
        { value: "effetto_legno", label: "Effetto legno", testi: { colorAndFinish: "rovere naturale" } },
        { value: "pantografato", label: "Pantografato", testi: { colorAndFinish: "noce" } },
        { value: "laccato", label: "Laccato", testi: { colorAndFinish: "bianco laccato" } },
        { value: "effetto_metallico", label: "Effetto metallico", testi: { colorAndFinish: "bronzo metallico" } },
        { value: "microtexture", label: "Microtexture", testi: { colorAndFinish: "grigio microtexture" } },
      ],
    },
    {
      chiave: "maniglia",
      etichetta: "Finitura maniglia",
      nonSpecificato: "Come da modello",
      valori: [...MANIGLIA_COMUNE, { value: "antracite", label: "Antracite" }],
    },
  ],
  "pavimenti-esterni": [
    {
      chiave: "coping_materiale",
      etichetta: "Materiale bordo piscina",
      nonSpecificato: "Non specificato (pietra chiara)",
      preset: ["coping_piscina"],
      valori: [
        { value: "travertino", label: "Travertino" },
        { value: "pietra_chiara", label: "Pietra chiara" },
        { value: "pietra_grigia", label: "Pietra grigia" },
        { value: "gres_2cm", label: "Gres 2 cm" },
        { value: "cemento_spazzolato", label: "Cemento spazzolato" },
        { value: "legno_wpc", label: "Legno / WPC" },
      ],
    },
    {
      chiave: "posa",
      etichetta: "Posa",
      nonSpecificato: "Come da modello",
      valori: [
        { value: "rettilineo", label: "Dritta, fughe allineate" },
        { value: "a_correre", label: "A correre (sfalsata)" },
        { value: "diagonale", label: "Diagonale 45°" },
        { value: "opus", label: "Opus romano (moduli misti)" },
        { value: "opus_incertum", label: "Opus incertum (palladiana)" },
        { value: "massello_spina", label: "Spina di pesce" },
        { value: "massello_classico", label: "A correre (masselli)" },
        { value: "doga_parallela", label: "Doghe continue" },
        { value: "doga_sfalsata", label: "Doghe sfalsate" },
      ],
      valoriPerPreset: {
        gres_outdoor_grande_formato: ["rettilineo", "a_correre", "diagonale"],
        gres_outdoor_standard: ["rettilineo", "a_correre", "diagonale"],
        cotto_esterno: ["rettilineo", "a_correre", "diagonale"],
        pietra_naturale: ["opus", "opus_incertum", "rettilineo", "a_correre"],
        autobloccanti_carrabili: ["massello_spina", "massello_classico"],
        deck_wpc: ["doga_parallela", "doga_sfalsata"],
        deck_legno: ["doga_parallela", "doga_sfalsata"],
      },
    },
    {
      chiave: "gradini",
      etichetta: "Gradini",
      nonSpecificato: "Restano come sono",
      // Non sulla ghiaia: un gradino «rivestito con lo stesso materiale» in ghiaia non esiste.
      preset: [
        "gres_outdoor_grande_formato", "gres_outdoor_standard", "deck_wpc", "deck_legno", "pietra_naturale",
        "autobloccanti_carrabili", "cotto_esterno", "cemento_architettonico", "cemento_drenante",
      ],
      valori: [
        { value: "rivestito_stesso_materiale", label: "Rivestiti con lo stesso materiale" },
        { value: "pedata_alzata_coordinate", label: "Pedata e alzata coordinate" },
        { value: "toro_arrotondato", label: "Bordo a toro arrotondato" },
        { value: "gradone_monolitico", label: "Gradoni monolitici" },
      ],
    },
    {
      chiave: "bordo",
      etichetta: "Bordo / cordolo",
      nonSpecificato: "Nessun bordo nuovo",
      preset: [
        "gres_outdoor_grande_formato", "gres_outdoor_standard", "deck_wpc", "deck_legno", "pietra_naturale",
        "autobloccanti_carrabili", "cotto_esterno", "cemento_architettonico", "cemento_drenante", "ghiaia_stabilizzata",
      ],
      valori: [
        { value: "fascia_perimetrale", label: "Fascia perimetrale" },
        { value: "bordo_pietra", label: "Cordolo in pietra" },
        { value: "bordo_alluminio", label: "Profilo in alluminio" },
        { value: "bordo_massello", label: "Cordolo in masselli" },
      ],
    },
  ],
  giardini: [
    {
      chiave: "stile",
      etichetta: "Stile",
      nonSpecificato: "Come da modello",
      valori: [
        { value: "contemporaneo", label: "Contemporaneo" },
        { value: "moderno_minimale", label: "Moderno minimale" },
        { value: "mediterraneo", label: "Mediterraneo" },
        { value: "naturale", label: "Naturale" },
        { value: "classico", label: "Classico all'italiana" },
        { value: "rustico_elegante", label: "Rustico elegante" },
        { value: "zen", label: "Zen" },
        { value: "tropicale_controllato", label: "Tropicale" },
        { value: "low_maintenance", label: "Poca manutenzione" },
        { value: "premium_relax", label: "Premium relax" },
      ],
    },
    {
      chiave: "prato",
      etichetta: "Tipo di prato",
      nonSpecificato: "Come da modello",
      preset: ["solo_prato", "moderno_minimale", "premium_relax"],
      valori: [
        { value: "prato_resistente", label: "Resistente (rotoli)" },
        { value: "prato_inglese", label: "All'inglese" },
        { value: "macroterma", label: "Macroterma" },
        { value: "prato_ornamentale", label: "Ornamentale" },
        { value: "prato_low_maintenance", label: "Poca manutenzione" },
        { value: "sintetico_premium", label: "Sintetico" },
      ],
    },
    {
      chiave: "camminamento",
      etichetta: "Camminamento",
      nonSpecificato: "Come da modello",
      preset: ["aiuole_perimetrali", "siepe_schermante", "moderno_minimale", "premium_relax"],
      valori: [
        { value: "stepping_stones", label: "Lastre a passo (stepping stones)" },
        { value: "pietra_naturale", label: "Pietra naturale" },
        { value: "ghiaia", label: "Ghiaia" },
        { value: "betonelle", label: "Masselli / betonelle" },
        { value: "lastre_modulari", label: "Lastre modulari" },
        { value: "deck_path", label: "Passerella in legno" },
      ],
    },
    {
      chiave: "illuminazione",
      etichetta: "Illuminazione",
      nonSpecificato: "Come da modello",
      valori: [
        { value: "nessuna", label: "Nessuna luce nuova" },
        { value: "segnapasso", label: "Segnapasso lungo i percorsi" },
        { value: "uplight_vegetazione", label: "Faretti sulle piante" },
        { value: "luce_perimetrale", label: "Luce perimetrale" },
        { value: "mix_soft", label: "Mix soffuso" },
      ],
    },
    {
      chiave: "copertura_aiuole",
      etichetta: "Copertura aiuole",
      nonSpecificato: "Come da modello",
      preset: ["aiuole_perimetrali", "moderno_minimale", "premium_relax"],
      valori: [
        { value: "corteccia", label: "Corteccia" },
        { value: "ghiaia", label: "Ghiaia decorativa" },
        { value: "lapillo", label: "Lapillo vulcanico" },
        { value: "tappezzante_vegetale", label: "Piante tappezzanti" },
      ],
    },
    {
      chiave: "alberi",
      etichetta: "Alberi nuovi",
      nonSpecificato: "Nessuno",
      preset: ["aiuole_perimetrali", "siepe_schermante", "moderno_minimale", "premium_relax"],
      valori: [
        { value: "1", label: "1 albero" },
        { value: "2", label: "2 alberi" },
        { value: "3", label: "3 alberi" },
      ],
    },
  ],
};

export function opzioniDelModulo(modulo: string): OpzioneTecnica[] {
  return (OPZIONI_TECNICHE as Record<string, OpzioneTecnica[] | undefined>)[modulo] ?? [];
}

/** L'opzione si mostra (e si legge) per questo preset? */
export function opzioneApplicabile(opzione: OpzioneTecnica, preset: string | undefined): boolean {
  const p = preset ?? "";
  if (opzione.valoriPerPreset) return Boolean(opzione.valoriPerPreset[p]?.length);
  return !opzione.preset || opzione.preset.includes(p);
}

/** I valori che il form offre per questo preset. */
export function valoriApplicabili(opzione: OpzioneTecnica, preset: string | undefined): ValoreOpzioneTecnica[] {
  if (!opzioneApplicabile(opzione, preset)) return [];
  const ammessi = opzione.valoriPerPreset?.[preset ?? ""];
  return ammessi ? opzione.valori.filter((v) => ammessi.includes(v.value)) : opzione.valori;
}

/**
 * Il valore scelto per `chiave`, solo se ammesso per il modulo e per il preset
 * corrente. Tutto il resto (chiave sconosciuta, valore inventato, opzione di un
 * altro preset rimasta nella config) vale «non specificato».
 */
export function leggiOpzione(
  g: { interventionPreset?: unknown; opzioni?: unknown },
  modulo: ModuloConOpzioni,
  chiave: string,
): string | undefined {
  const opzioni = g.opzioni;
  if (!opzioni || typeof opzioni !== "object" || Array.isArray(opzioni)) return undefined;
  const valore = (opzioni as Record<string, unknown>)[chiave];
  if (typeof valore !== "string" || !valore) return undefined;
  const opzione = OPZIONI_TECNICHE[modulo].find((o) => o.chiave === chiave);
  if (!opzione) return undefined;
  const preset = typeof g.interventionPreset === "string" ? g.interventionPreset.trim() : "";
  return valoriApplicabili(opzione, preset).some((v) => v.value === valore) ? valore : undefined;
}

/** Le sole opzioni ancora valide dopo un cambio di preset (le altre si scartano). */
export function opzioniValide(
  modulo: string,
  preset: string,
  opzioni: Record<string, string> | undefined,
): Record<string, string> | undefined {
  if (!opzioni) return undefined;
  const out: Record<string, string> = {};
  for (const opzione of opzioniDelModulo(modulo)) {
    const v = opzioni[opzione.chiave];
    if (v && valoriApplicabili(opzione, preset).some((x) => x.value === v)) out[opzione.chiave] = v;
  }
  return Object.keys(out).length ? out : undefined;
}
