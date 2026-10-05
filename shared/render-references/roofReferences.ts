/**
 * Foto di riferimento del render tetto: una per ogni elemento che il render cambia.
 *
 * - MANTO (materia, a colori): dettaglio del modulo e, se resta posto, una vista
 *   d'insieme della falda. Il colore lo detta il testo.
 * - GRONDAIE (materia, a colori): profilo, materiale e giunti. Servono anche alla
 *   facciata, che le importa da qui (le foto stanno in roofs/).
 * - LUCERNARI / ABBAINI, FOTOVOLTAICO (tegole solari e moduli con cornice), SCOSSALINE e
 *   FERMANEVE (forma, in bianco e nero): la costruzione; colore e materiale arrivano dal testo.
 *
 * Una foto si allega SOLO se quell'elemento cambia (stesso gating del prompt in
 * generate-roof-render/roofPrompt.ts): il manto solo quando la copertura si rifà,
 * le grondaie solo se sono attive, il lucernario solo se se ne aggiunge uno, il
 * fotovoltaico solo se è attivo (la foto dipende dal tipo), le scossaline solo se si
 * sostituiscono, i fermaneve solo se sono attivi. Prima il manto guidava tutto:
 * «solo accessori» e «solo colore» non allegavano niente, nemmeno le grondaie o
 * l'abbaino che stavano cambiando.
 *
 * Le foto vecchie (Wikimedia Commons, crediti in public/render-references/CREDITS.md)
 * restano solo dove il set nuovo non ne ha una e dove mostrano davvero l'opzione:
 * quelle che la contraddicono stanno in ROOF_SENZA_FOTO, con il motivo.
 */
import {
  BLACK_AND_WHITE_RULE,
  listReferencePaths,
  MAX_SHARED_REFERENCES,
  pickReferences,
  type PhotoEntry,
  type PhotoTable,
  type ReferenceCandidate,
} from "./referencePicker.ts";
import type { SharedReferenceImage } from "./referenceUrl.ts";

export const ROOF_FOLDER = "roofs";

const r = (filename: string, text: string): PhotoEntry => ({ folder: ROOF_FOLDER, filename, text });

/** Manto, foto di dettaglio: modulo, sovrapposizione e rilievo. */
export const ROOF_COVERING_PHOTOS: PhotoTable = {
  tegole_coppi: r("Tegole-Italiane-In-Terracotta.webp", "Italian clay barrel tiles (coppi): rounded half-round covers in overlapping staggered rows, rough fired surface with natural tone variation"),
  // Il file «-Falda» è il primo piano delle tegole; «-Dettaglio» è la veduta dei tetti: prima erano scambiati.
  tegole_marsigliesi: r("Tetto-Tegole-Marsigliesi-Falda.webp", "Marseille interlocking clay tiles: flat rectangular tiles with raised vertical ribs and interlocking side and head laps in a regular grid"),
  tegole_portoghesi: r("Tetto-Tegole-Portoghesi-Falda.webp", "Portuguese clay tiles: wide undulating S-profile, one raised barrel and one channel per tile, in long regular rows down the slope"),
  ardesia_naturale: r("Tetto-Ardesia-Naturale-Lastre.webp", "natural slate: thin split stone scales with rounded lower edges, overlapping in staggered courses and fixed with small metal hooks"),
  ardesia_sintetica: r("Tetto-Ardesia-Naturale-Lastre-2.webp", "slate-look roof: thin overlapping scales in staggered courses with small fixing hooks; the synthetic version is more even in size and tone"),
  lamiera_grecata: r("Tetto-Lamiera-Grecata-Grigia.webp", "trapezoidal ribbed metal sheet: straight parallel ribs from eave to ridge, folded edge trim; take the roof only, not the wall cladding"),
  lamiera_aggraffata: r("Tetto-Lamiera-Aggraffata-Grigia-Casa.webp", "standing-seam metal roof: wide flat pans joined by slim raised seams at regular spacing, no visible fixings, folded hips and ridge"),
  lamiera_zinco_titanio: r("Tetto-Lamiera-Aggraffata-Bianca-Casa.webp", "zinc standing-seam roof: long flat pans with slim raised seams at regular spacing, crisp folded hips, ridge and eaves"),
  guaina_tpo: r("Tetto-Piano-Membrana-TPO-Bianca.webp", "single-ply TPO membrane: smooth sheets joined by straight heat-welded lap seams; take the membrane only, ignore the welding tool and its cable"),
  // Il set nuovo ha la copertura solare integrata solo in bianco e nero: è la forma (moduli a filo in file allineate) che conta, il colore lo dice il testo.
  tegole_fotovoltaiche: r("Tetto-Moderno-Con-Tegole-Solari-Integrate-BN.webp", "integrated solar roof: flat rectangular solar tiles laid flush in aligned rows over the whole slope, no frames or rails, slim verge and eave trims"),
};

/** Manto, vista d'insieme: come il manto «si legge» su una falda intera. Solo dove ce n'è una che mostra davvero quel manto. */
export const ROOF_COVERING_OVERVIEW_PHOTOS: PhotoTable = {
  tegole_coppi: r("Tetto-Coppi-Rosso-Falda.webp", "coppi roof at the eave: rows of half-round covers bedded along the edge, first course and gutter line"),
  tegole_marsigliesi: r("Tetto-Tegole-Marsigliesi-Dettaglio.webp", "Marseille-tile roofs seen from above: regular tile rows across whole slopes, ridges, hips and a roof window"),
  lamiera_aggraffata: r("Tetto-Lamiera-Aggraffata-Bianca-Casa.webp", "standing-seam roof on a whole house: continuous pans from eave to ridge, folded hips and valleys, slim eave trim"),
  tegole_fotovoltaiche: r("Tetto-Tegole-Fotovoltaiche-Integrate.webp", "house with a full solar-tile roof: flush modules over the whole slope, a roof window cut into the array, slim eave trim"),
};

/** Grondaie e pluviali (materia): profilo, materiale e giunti. Usate anche dalla facciata. */
export const GUTTER_MATERIAL_PHOTOS: PhotoTable = {
  rame: r("Grondaia-In-Rame-Dalla-Patina-Calda.webp", "copper half-round gutter and round downpipe: warm metallic copper with light patina, copper hangers, swan-neck bend and wall bracket"),
  zinco_titanio: r("Grondaia-In-Zinco-Titanio-Blu-Grigia.webp", "zinc-titanium half-round gutter and downpipe: even blue-grey patina, soldered seams, swan-neck bend and wall bracket"),
  acciaio_zincato: r("Grondaia-Semicircolare-In-Acciaio-Zincato.webp", "galvanized steel half-round gutter and downpipe: silver spangled zinc coating, riveted joints, swan-neck bend and wall bracket"),
  pvc: r("Grondaia-Semicircolare-Marrone-Con-Staffa.webp", "PVC half-round gutter and downpipe: smooth moulded plastic, clip-on brackets along the eave, rounded joints and offset bend"),
  alluminio: r("Grondaia-Semicircolare-Con-Staffa.webp", "pre-painted aluminium half-round gutter and downpipe: smooth evenly coated metal, slim hangers, offset bend and wall bracket"),
};

/** Lucernari e abbaini (forma, B/N). */
export const SKYLIGHT_TYPE_PHOTOS: PhotoTable = {
  piatto: r("Lucernario-A-Filo-Del-Tetto-In-Tegole-BN.webp", "roof window set flush in the slope: rectangular glazed sash in a slim frame with a flashing collar, tiles lapped closely around it"),
  sporgente: r("Lucernario-A-Cupola-Sul-Tetto-BN.webp", "dome skylight: transparent domed glazing on a raised round upstand fixed to the roof deck; take only the dome-on-upstand construction"),
  abbaino: r("Abbaino-A-Capanna-Sul-Tetto-BN.webp", "gable dormer: small pitched mini-roof with its own ridge, vertical front wall with a window, side cheeks tied into the main slope"),
};

/**
 * Il fotovoltaico (forma, B/N), per `pannelli_solari.tipo`. La tegola solare integrata ha la sua foto; i
 * moduli con cornice su staffe ne hanno UNA per tutti e due i tipi (nero e blu): il colore del vetro e
 * della cornice lo dice il testo, non la foto grigia.
 */
const MODULI_CON_CORNICE = r("Pannelli-Fotovoltaici-Su-Binari-BN.webp", "framed rectangular solar modules in aligned rows on small standoff feet just above the roof surface, coplanar with the slope, parallel to eaves and ridge");
export const SOLAR_TYPE_PHOTOS: PhotoTable = {
  tegola_solare_integrata: r("Tetto-Moderno-Con-Tegole-Solari-Integrate-BN.webp", "integrated solar tiles: flat rectangular modules laid flush in the roof plane in aligned rows, no raised frames or rails, slim edge trims"),
  fotovoltaico_nero: MODULI_CON_CORNICE,
  fotovoltaico_blu: MODULI_CON_CORNICE,
};

/**
 * Scossaline, colmi e converse (forma, B/N), per `scossaline.materiale`: una sola foto per i quattro metalli.
 * Mostra dove stanno e come sono piegati i profili; il metallo e il suo colore li dice il testo.
 */
const LATTONERIE = r("Scossalina-Di-Bordo-Falda-E-Colmo-BN.webp", "roof flashings: wide folded verge trim closing the tile edge at the gable, ridge capping with moulded ribs, apron and side flashings at a chimney base");
export const FLASHING_PHOTOS: PhotoTable = {
  rame: LATTONERIE,
  zinco_titanio: LATTONERIE,
  acciaio_zincato: LATTONERIE,
  alluminio: LATTONERIE,
};

/** Fermaneve (forma, B/N), per `fermaneve.tipo`: ganci sfalsati sotto le tegole o barra continua a griglia su staffe. */
export const SNOW_GUARD_PHOTOS: PhotoTable = {
  ganci: r("Fermaneve-A-Ganci-Su-Tegole-BN.webp", "small snow-guard hooks in staggered rows over the lower courses of the slope, one hook every two or three tiles, each hooked under the tile above"),
  griglia: r("Fermaneve-A-Barra-Continua-BN.webp", "continuous snow-guard grille rail parallel to the eaves above the gutter: slim-bar lattice between horizontal rails, on gusseted brackets with bolted feet"),
};

/**
 * Opzioni del wizard senza foto, con il motivo. Il test verifica che ogni opzione
 * stia o in una tabella o qui.
 */
export const ROOF_SENZA_FOTO: Record<string, string> = {
  "manto.tegole_piane": "le due foto vecchie mostrano la coda di castoro tradizionale (bordi arrotondati, doppia sovrapposizione); il testo e il wizard chiedono la tegola piana moderna a incastro: la foto la contraddirebbe",
  "manto.guaina_bituminosa": "la foto vecchia mostra la ghiaia di zavorra e gli sfiati, non la guaina ardesiata con le sormonte a fiamma che il testo descrive: il modello coprirebbe il tetto di ghiaia",
  // Elementi aggiunti nel 10/2026 ancora senza foto (docs/render-foto-da-generare/facciata-tetto.md).
  "comignoli.rinnova": "nessuna foto nel set: si rifinisce il comignolo che è già nella foto, la finitura la dice il testo",
  "linea_vita.attivo": "nessuna foto nel set: paletti e cavo sul colmo, piccoli; il testo basta",
};

/**
 * Configurazione del tetto come la salva il wizard (ConfigurazioneTetto, forma piatta).
 * `tipo_manto` resta per i chiamanti che passavano solo manto e intervento.
 */
export interface RoofReferenceConfig {
  tipo_intervento?: string | null;
  tipo_manto?: string | null;
  manto?: { tipo?: string | null } | null;
  grondaie?: { attivo?: boolean | null; materiale?: string | null } | null;
  lucernari?: { attivo?: boolean | null; azione?: string | null; tipo?: string | null } | null;
  pannelli_solari?: { attivo?: boolean | null; tipo?: string | null } | null;
  scossaline?: { azione?: string | null; materiale?: string | null } | null;
  fermaneve?: { attivo?: boolean | null; tipo?: string | null } | null;
}

/** Interventi che rifanno il manto (gli stessi di `coveringActive` nel prompt). Senza intervento vale «sostituzione_manto». */
const INTERVENTI_CHE_RIFANNO_IL_MANTO = new Set(["sostituzione_manto", "sovracopertura_coibentata", "rifacimento_completo"]);

/**
 * Ordine (tetto 3 foto condivise; il tetto non ha catalogo azienda, quindi tutte e 3):
 *  10 lucernario/abbaino aggiunto — cambia la sagoma della falda; senza foto il modello lo inventa;
 *  20 manto, dettaglio — la superficie più grande, il cuore del render;
 *  30 fotovoltaico (tegole solari integrate o moduli con cornice) — una grande area della falda, di forma;
 *  35 fermaneve aggiunti — elemento nuovo e piccolo, in fila lungo la gronda: la forma (ganci o griglia)
 *     il modello la inventa; prima delle grondaie, che sostituiscono qualcosa che nella foto c'è già;
 *  40 grondaie — dettaglio di bordo;
 *  45 scossaline — sostituiscono lattonerie che nella foto ci sono già: la foto dà il profilo, il metallo
 *     lo dice il testo; dopo le grondaie, che hanno la loro foto di materia;
 *  50 manto, vista d'insieme — solo se resta un posto: non porta un elemento nuovo, dice come il
 *     manto si legge su un tetto intero (è la seconda foto del manto, per questo viene per ultima).
 */
const PRIORITA = { lucernario: 10, manto: 20, solare: 30, fermaneve: 35, grondaie: 40, scossaline: 45, mantoInsieme: 50 } as const;

const COPY_INSIEME = "Take only how this covering reads across a whole slope — ridge, eaves and edges; do NOT copy this building, its shape or its surroundings; the colour comes from the written specification";
const COPY_GRONDAIE = "Copy the gutter and downpipe profile, material and joints only, along the eaves of the source photo; the colour comes from the written specification";
const COPY_MODULI = `Copy only the solar array and how it is mounted; ignore this roof, its covering and the building — the number, rows and position of the modules come from the written specification; ${BLACK_AND_WHITE_RULE}`;
const COPY_FERMANEVE = `Copy only the snow guards: their shape, fixing and spacing on the lower part of the slope; ignore the roof covering, gutter and building of this sample — ${BLACK_AND_WHITE_RULE}`;
const COPY_SCOSSALINE = `Copy only the shapes of the flashings and where they run (verge trim, ridge capping, chimney apron); ignore the tiles, gutter, chimney and building of this sample, and add no flashing line, chimney or gable that the source photo does not already have — ${BLACK_AND_WHITE_RULE}`;

export function collectRoofReferenceImages(config: RoofReferenceConfig): SharedReferenceImage[] {
  const candidates: ReferenceCandidate[] = [];
  const intervento = config.tipo_intervento || "sostituzione_manto";
  const tipoManto = config.manto?.tipo || config.tipo_manto || undefined;

  const lucernari = config.lucernari;
  if (lucernari?.attivo === true && lucernari.azione === "aggiungi") {
    const tipo = lucernari.tipo || "piatto"; // stesso default del prompt
    const entry = SKYLIGHT_TYPE_PHOTOS[tipo];
    if (entry) candidates.push({ priority: PRIORITA.lucernario, role: "SKYLIGHT TYPE TARGET", key: tipo, entry });
  }

  if (tipoManto && INTERVENTI_CHE_RIFANNO_IL_MANTO.has(intervento)) {
    const dettaglio = ROOF_COVERING_PHOTOS[tipoManto];
    if (dettaglio) candidates.push({ priority: PRIORITA.manto, role: "ROOF COVERING TARGET (close-up)", key: tipoManto, entry: dettaglio });
    const insieme = ROOF_COVERING_OVERVIEW_PHOTOS[tipoManto];
    if (insieme) candidates.push({ priority: PRIORITA.mantoInsieme, role: "ROOF COVERING TARGET (whole slope)", key: tipoManto, entry: insieme, copy: COPY_INSIEME });
  }

  const pannelli = config.pannelli_solari;
  if (pannelli?.attivo === true) {
    const tipo = pannelli.tipo || "fotovoltaico_nero"; // stesso default del prompt
    const entry = SOLAR_TYPE_PHOTOS[tipo];
    if (entry && tipo === "tegola_solare_integrata") {
      candidates.push({ priority: PRIORITA.solare, role: "SOLAR TILE TARGET", key: tipo, entry });
    } else if (entry) {
      // moduli con cornice: la foto mostra il montaggio e le file, non il tetto su cui sta
      candidates.push({ priority: PRIORITA.solare, role: "SOLAR PANEL TARGET", key: tipo, entry, copy: COPY_MODULI });
    }
  }

  const fermaneve = config.fermaneve;
  if (fermaneve?.attivo === true) {
    const tipo = fermaneve.tipo || "ganci"; // stesso default del prompt
    const entry = SNOW_GUARD_PHOTOS[tipo];
    if (entry) candidates.push({ priority: PRIORITA.fermaneve, role: "SNOW GUARD TARGET", key: tipo, entry, copy: COPY_FERMANEVE });
  }

  const grondaie = config.grondaie;
  if (grondaie?.attivo === true) {
    const materiale = grondaie.materiale || "alluminio"; // stesso default del prompt
    const entry = GUTTER_MATERIAL_PHOTOS[materiale];
    if (entry) candidates.push({ priority: PRIORITA.grondaie, role: "GUTTER MATERIAL TARGET", key: materiale, entry, copy: COPY_GRONDAIE });
  }

  const scossaline = config.scossaline;
  if (scossaline?.azione === "sostituisci") {
    const materiale = scossaline.materiale || "alluminio"; // stesso default del prompt
    const entry = FLASHING_PHOTOS[materiale];
    if (entry) candidates.push({ priority: PRIORITA.scossaline, role: "ROOF FLASHING TARGET", key: materiale, entry, copy: COPY_SCOSSALINE });
  }

  return pickReferences(candidates, MAX_SHARED_REFERENCES);
}

/** Tutti i file dichiarati («roofs/…»), per i test di esistenza. */
export function listRoofReferencePaths(): string[] {
  return listReferencePaths(ROOF_COVERING_PHOTOS, ROOF_COVERING_OVERVIEW_PHOTOS, GUTTER_MATERIAL_PHOTOS, SKYLIGHT_TYPE_PHOTOS, SOLAR_TYPE_PHOTOS, FLASHING_PHOTOS, SNOW_GUARD_PHOTOS);
}
