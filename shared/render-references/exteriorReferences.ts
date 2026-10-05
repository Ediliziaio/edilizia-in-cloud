/**
 * Foto di riferimento condivise per i render di pavimenti esterni e giardini
 * (moduli tecnici, generate-technical-render).
 *
 * Pavimenti esterni, superficie: foto di MATERIA, a colori — la superficie, la scala del
 * modulo e la posa sono l'informazione; il tono esatto resta nel testo. Alcune
 * foto stanno nella cartella delle piscine (ghiaia, deck WPC, bordi vasca): sono
 * le stesse del set, usate qui con un'etichetta che dice cosa prendere e cosa
 * ignorare (acqua, lettini, paesaggio).
 *
 * Pavimenti esterni, gradini e bordi (fascia perimetrale, cordolo, profilo): foto di
 * FORMA, in bianco e nero («-BN.webp») — la costruzione dello spigolo, della sporgenza,
 * dello spessore è l'informazione; materiale e colore arrivano dal testo, e l'etichetta
 * non li nomina. Entrano solo se il prompt chiede davvero di costruire quel gradino o
 * quel bordo (stesse operazioni del replacement manifest), vedi collectExteriorFloorReferenceImages.
 *
 * Le tabelle usano le chiavi VERE della configurazione ricca di
 * render-exterior-floor (`materiale`; `materiale/pattern_posa` per le foto che
 * valgono solo con una posa; `coping_materiale`; `gradino`; `bordo`), che il ponte
 * (shared/render-technical/bridge.ts) costruisce dal preset e dalle opzioni.
 *
 * Giardino: le foto vicine (prato, pietra, deck) sono scattate a bordo piscina, e
 * allegate a un giardino spingerebbero il modello a inventare una vasca — proprio ciò
 * che il prompt del giardino vieta. Per questo le superfici (prato, ghiaia, pietra) non
 * hanno foto (GARDEN_SENZA_FOTO). Hanno la foto, fatta apposta in un giardino senza
 * piscina, tre elementi di FORMA (bianco e nero): la siepe schermante, il camminamento
 * a lastre a passo e i segnapasso. Le tabelle sono indicizzate con le chiavi vere della
 * configurazione ricca di render-garden (`siepi.tipo`, `camminamenti.tipo`,
 * `illuminazione`); le foto ancora da generare sono in
 * docs/render-foto-da-generare/moduli-tecnici.md.
 */
import {
  BLACK_AND_WHITE_RULE,
  pickReferences,
  listReferencePaths,
  type PhotoEntry,
  type PhotoTable,
  type ReferenceCandidate,
} from "./referencePicker.ts";
import type { SharedReferenceImage } from "./referenceUrl.ts";

export const EXTERIOR_FOLDER = "exterior";
const POOLS_FOLDER = "pools";

/** Foto di pavimentazione: oltre al file, la posa che mostra (per sapere se la si può copiare). */
export interface PavingPhotoEntry extends PhotoEntry {
  posa?: string;
}

const lastreGres = "Lastre-Outdoor-In-Gres-Effetto-Pietra.webp";

/** Materiale della pavimentazione esterna (`materiale`) → foto di materia. */
export const EXTERIOR_PAVING_REFERENCES: Record<string, PavingPhotoEntry> = {
  masselli_autobloccanti: {
    folder: EXTERIOR_FOLDER,
    filename: "Vialetto-Residenziale-In-Autobloccanti-Grigi.webp",
    text: "concrete interlocking pavers: rectangular modules about 20x10 cm in herringbone with tight sand-filled joints; take only the paver field, not the kerbs",
    posa: "massello_spina",
  },
  lastre_grande_formato: {
    folder: EXTERIOR_FOLDER,
    filename: lastreGres,
    text: "outdoor porcelain slabs with a cleft slate-like stone texture, large square modules in a straight grid; ignore the pebble-filled joints",
    posa: "rettilineo",
  },
  gres_outdoor: {
    folder: EXTERIOR_FOLDER,
    filename: lastreGres,
    text: "outdoor porcelain slabs with a cleft slate-like stone texture and anti-slip surface; ignore the pebble-filled joints and the module size",
    posa: "rettilineo",
  },
  ghiaia_stabilizzata: {
    folder: POOLS_FOLDER,
    filename: "Ghiaia-Drenante-Grigio-Chiaro.webp",
    text: "close-up of rounded gravel: pebbles of even small size with natural tone variation; take only the aggregate size and shape",
  },
  deck_wpc: {
    folder: POOLS_FOLDER,
    filename: "Decking-WPC-Effetto-Legno-Intorno-Alla-Piscina.webp",
    text: "composite WPC deck: long parallel boards with fine brushed wood-grain grooves and narrow open gaps; take only the boards, ignore pool and furniture",
    posa: "doga_parallela",
  },
};

/**
 * Foto che valgono solo per una certa posa del materiale («materiale/posa»): la pietra del
 * set è a lastre irregolari, quindi guida la pietra solo quando la posa scelta è proprio
 * l'opus incertum (palladiana), non l'opus romano a moduli del preset.
 */
export const EXTERIOR_PAVING_PATTERN_REFERENCES: Record<string, PavingPhotoEntry> = {
  "pietra_naturale/opus_incertum": {
    folder: POOLS_FOLDER,
    filename: "Pietra-Naturale-Intorno-Alla-Piscina.webp",
    text: "irregular polygonal natural stone flagging (crazy paving) with even joints and natural-cut edges; take only the paving, ignore pool and furniture",
    posa: "opus_incertum",
  },
};

/** Gres «formato standard»: la foto mostra lastre grandi, quindi se ne prende la sola superficie. */
const COPIA_SOLO_SUPERFICIE =
  "Copy the surface texture only; module size, laying pattern and the exact colour tone come from the written specification";
/** Foto con una posa diversa da quella scelta: si prende il modulo, non il disegno. */
const COPIA_SENZA_POSA =
  "Copy the surface and module scale only; the laying pattern and the exact colour tone come from the written specification";
/** Ghiaia: la foto è ghiaia sciolta, il prompt chiede una superficie compattata. */
const COPIA_GHIAIA =
  "Copy the aggregate size, shape and tone variation only; the surface must read compacted and stable as specified, exact colour from the written specification";

/** Materiali di pavimentazione esterna senza foto, col motivo. */
export const EXTERIOR_PAVING_SENZA_FOTO: Record<string, string> = {
  pietra_naturale:
    "con la posa del preset (opus romano a moduli) nessuna foto: l'unica pietra del set è a opus incertum/palladiana e si allega solo con quella posa (EXTERIOR_PAVING_PATTERN_REFERENCES)",
  cotto_esterno: "nessuna foto nel set",
  cemento_architettonico: "nessuna foto nel set",
  cemento_drenante: "nessuna foto nel set",
  deck_legno: "nessuna foto nel set: le foto deck sono WPC (composito), il legno naturale ha venatura e invecchiamento diversi",
  coping_bordo_piscina: "materiale «di servizio» del preset bordo piscina: la foto la sceglie il materiale del bordo (coping_materiale)",
};

const bordo = (filename: string, text: string): PhotoEntry => ({ folder: POOLS_FOLDER, filename, text });

/** Materiale del bordo vasca (`coping_materiale`) → foto di materia (cartella piscine). */
export const POOL_COPING_REFERENCES: PhotoTable = {
  travertino: bordo(
    "Bordo-Piscina-In-Travertino-Beige.webp",
    "honed travertine coping slabs with natural pores and soft veining, square eased edge at the waterline; take only the coping stone",
  ),
  pietra_chiara: bordo(
    "Bordo-Piscina-In-Pietra-Beige.webp",
    "light limestone coping slabs with a fine even grain, crisp square edge at the waterline; take only the coping stone",
  ),
  pietra_grigia: bordo(
    "Bordo-Piscina-Moderno-In-Pietra-Grigia.webp",
    "grey natural stone coping slabs with subtle darker veining, thin crisp edge at the waterline; take only the coping stone",
  ),
  gres_2cm: bordo(
    "Pavimentazione-Piscina-Moderna-In-Gres-Effetto-Pietra.webp",
    "2 cm stone-effect outdoor porcelain slabs used as a flush coping, sharp edge at the waterline; take only the coping slabs",
  ),
  cemento_spazzolato: bordo(
    "Bordo-Piscina-In-Cemento-Spazzolato.webp",
    "brushed concrete coping slabs with fine linear brush marks and thin joints, square edge at the waterline; take only the coping",
  ),
  legno_wpc: bordo(
    "Decking-WPC-Marrone-A-Bordo-Piscina.webp",
    "composite WPC deck boards finishing the pool edge, grooved surface and narrow gaps, board ends neatly closed; take only the boards",
  ),
};

/** Foto di FORMA (bianco e nero) dei gradini e dei bordi: il testo descrive la costruzione, mai colore né finitura. */
const forma = (filename: string, text: string): PhotoEntry => ({ folder: EXTERIOR_FOLDER, filename, text });

/**
 * Gradini (`gradino`) → foto di forma. Mostrano come è costruito il gradino (spigolo, sporgenza,
 * spessore), non di che materiale: quello arriva dal testo. Tre scatti davanti a una porta o in
 * giardino: il numero e la misura dei gradini restano quelli della foto da modificare (COPIA_GRADINI).
 */
export const EXTERIOR_STEP_REFERENCES: PhotoTable = {
  rivestito_stesso_materiale: forma(
    "Gradini-Esterni-Rivestiti-Stesso-Materiale-BN.webp",
    "entrance steps clad in the same slabs as the landing: treads and risers with aligned joints, square edges, no nosing; take only the steps, not door or pots",
  ),
  toro_arrotondato: forma(
    "Gradino-Esterno-Bordo-Toro-BN.webp",
    "entrance steps with thick treads rounded to a bullnose that overhangs a plain vertical riser; take only the steps, not the door, pot or doormat",
  ),
  gradone_monolitico: forma(
    "Gradoni-Esterni-Monolitici-BN.webp",
    "garden steps of solid single blocks, thick front face, square edges, each block forming tread and riser in one piece; take only the steps, not rocks or plants",
  ),
};

/** Gradini senza foto, col motivo (il test verifica che ogni tipo di gradino stia o di qua o di là). */
export const EXTERIOR_STEP_SENZA_FOTO: Record<string, string> = {
  pedata_alzata_coordinate:
    "nessuna foto: è un abbinamento di finiture (pedata e alzata coordinate), non una costruzione diversa; la forma resta quella dei gradini della foto da modificare",
};

/**
 * Bordo della pavimentazione (`bordo`) → foto di forma. Mostrano la costruzione del bordo (fascia,
 * cordolo, profilo sottile) lungo una pavimentazione, un prato o una ghiaia: la pavimentazione, il
 * prato e la ghiaia che compaiono nello scatto non si copiano (l'etichetta lo dice).
 */
export const EXTERIOR_BORDER_REFERENCES: PhotoTable = {
  fascia_perimetrale: forma(
    "Fascia-Perimetrale-Pavimento-Esterno-BN.webp",
    "perimeter band one slab wide framing the paved field, its slabs turned 90 degrees to the field slabs, same thin joints; take only the band, not house or pots",
  ),
  bordo_pietra: forma(
    "Cordolo-In-Pietra-Pavimento-Esterno-BN.webp",
    "raised kerb of short blocks laid end to end, about 8 cm wide, closing the paving along the lawn, slightly proud of both; take only the kerb, not lawn or flowers",
  ),
  bordo_alluminio: forma(
    "Profilo-Alluminio-Bordo-Ghiaia-BN.webp",
    "thin edging strip a few millimetres wide, upright, its top almost flush with the ground, straight along the path edge; take only the strip, not gravel or lawn",
  ),
};

/** Bordi senza foto, col motivo. */
export const EXTERIOR_BORDER_SENZA_FOTO: Record<string, string> = {
  bordo_massello: "nessuna foto nel set: il cordolo in masselli non è tra le foto da generare (docs/render-foto-da-generare/moduli-tecnici.md)",
  coping_piscina_moderno: "il bordo vasca si sceglie per materiale (coping_materiale): le sue foto sono in POOL_COPING_REFERENCES",
  coping_piscina_classico: "il bordo vasca si sceglie per materiale (coping_materiale): le sue foto sono in POOL_COPING_REFERENCES",
};

/** Gradini: nella foto sono tre davanti a una porta (o in giardino); il prompt vuole i gradini veri della foto da modificare. */
const COPIA_GRADINI =
  `Copy the construction of the step edge, tread and riser only; the number, size and position of the steps stay exactly as in the source photo — ${BLACK_AND_WHITE_RULE}`;
/** Bordo: la foto lo mostra lungo un prato o una ghiaia, con una pavimentazione di un altro tono; il tracciato è quello della foto da modificare. */
const COPIA_BORDO =
  `Copy the construction and width of the edge only; where it runs follows the paved area in the source photo, and any tone difference between edge and field in the photo is not to be copied — ${BLACK_AND_WHITE_RULE}`;

/*
 * Priorità (più basso = più importante): la pavimentazione è la superficie che cambia (10);
 * i gradini, che cambiano la sagoma del dislivello, e il bordo vasca, quando cambia insieme
 * alla pavimentazione, vengono subito dopo (20); fascia, cordolo e profilo sono il dettaglio
 * del perimetro (30). Nel preset «solo bordo piscina» il bordo è l'unica cosa che cambia: resta
 * l'unica foto. Il bordo vasca e quello di perimetro sono lo stesso campo (`bordo`) e non si
 * presentano insieme: al massimo pavimentazione + gradini + un bordo, cioè il tetto di tre foto.
 */
const PRIORITA_PAVIMENTAZIONE = 10;
const PRIORITA_BORDO_VASCA = 20;
const PRIORITA_GRADINI = 20;
const PRIORITA_BORDO_PERIMETRO = 30;

/** Operazioni che rifanno la superficie (e quindi ne cambiano la materia). */
const RIFA_SUPERFICIE = ["replace_existing_surface", "convert_to_deck", "convert_to_gravel_or_stepping_stones"];
/**
 * Operazioni per cui il prompt chiede di costruire i gradini / il bordo: la superficie rifatta li
 * porta con sé («also clad the visible exterior steps», «finish the new surface with a border band»)
 * e «solo gradini» / «fascia di bordo» sono operazioni loro (exteriorFloorReplacementRules).
 * Ricolorazione, drenaggio e solo bordo vasca non li toccano: nessuna foto, anche se la config li nomina.
 */
const FA_GRADINI = [...RIFA_SUPERFICIE, "change_steps_only"];
const FA_BORDO = [...RIFA_SUPERFICIE, "add_border_band"];

/** La voce della tabella solo se è una chiave vera (le config arrivano anche dall'API: «constructor» non è un gradino). */
function voce(tabella: PhotoTable, chiave: string): PhotoEntry | undefined {
  return Object.prototype.hasOwnProperty.call(tabella, chiave) ? tabella[chiave] : undefined;
}

interface ExteriorFloorConfigLike {
  operazione?: unknown;
  materiale?: unknown;
  pattern_posa?: unknown;
  bordo?: unknown;
  gradino?: unknown;
  coping_materiale?: unknown;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/**
 * Foto per la configurazione ricca di un pavimento esterno. Ricolorazione, solo gradini,
 * fascia di bordo e drenaggio non cambiano la materia della pavimentazione: nessuna foto
 * di pavimentazione (cambierebbe la posa e il modulo che il prompt dice di preservare).
 * Gradini e bordo hanno la loro foto di forma, ma solo nelle operazioni in cui il prompt li
 * costruisce (FA_GRADINI, FA_BORDO): «solo gradini» porta la sola foto dei gradini.
 */
export function collectExteriorFloorReferenceImages(raw: object | null | undefined): SharedReferenceImage[] {
  if (!raw || typeof raw !== "object") return [];
  const config = raw as ExteriorFloorConfigLike;
  const candidates: ReferenceCandidate[] = [];
  const operazione = str(config.operazione);
  const posa = str(config.pattern_posa);

  if (RIFA_SUPERFICIE.includes(operazione)) {
    const materiale = str(config.materiale);
    // Una foto legata alla posa porta la posa nella chiave («pietra_naturale/opus_incertum»).
    const perPosa = EXTERIOR_PAVING_PATTERN_REFERENCES[`${materiale}/${posa}`];
    const key = perPosa ? `${materiale}/${posa}` : materiale;
    const entry = perPosa ?? EXTERIOR_PAVING_REFERENCES[materiale];
    if (entry) {
      const copy = materiale === "gres_outdoor"
        ? COPIA_SOLO_SUPERFICIE
        : materiale === "ghiaia_stabilizzata"
          ? COPIA_GHIAIA
          : entry.posa && posa && entry.posa !== posa
            ? COPIA_SENZA_POSA
            : undefined;
      candidates.push({ priority: PRIORITA_PAVIMENTAZIONE, role: "EXTERIOR PAVING MATERIAL TARGET", key, entry, ...(copy ? { copy } : {}) });
    }
  }

  // Bordo vasca: nel preset «solo bordo» e quando la pavimentazione rifatta porta anche un bordo vasca.
  const copingKey = str(config.coping_materiale);
  const bordoVasca = str(config.bordo).startsWith("coping_piscina");
  if (copingKey && POOL_COPING_REFERENCES[copingKey] && (operazione === "change_coping_only" || (bordoVasca && RIFA_SUPERFICIE.includes(operazione)))) {
    candidates.push({
      priority: operazione === "change_coping_only" ? PRIORITA_PAVIMENTAZIONE : PRIORITA_BORDO_VASCA,
      role: "POOL COPING MATERIAL TARGET",
      key: copingKey,
      entry: POOL_COPING_REFERENCES[copingKey],
    });
  }

  // Gradini: la foto di forma del tipo scelto, quando il prompt chiede di costruirli.
  const gradino = str(config.gradino);
  const gradinoEntry = voce(EXTERIOR_STEP_REFERENCES, gradino);
  if (gradinoEntry && FA_GRADINI.includes(operazione)) {
    candidates.push({ priority: PRIORITA_GRADINI, role: "EXTERIOR STEPS TARGET", key: gradino, entry: gradinoEntry, copy: COPIA_GRADINI });
  }

  // Fascia, cordolo, profilo: il dettaglio del perimetro. Il bordo vasca (coping_piscina_*) ha le sue foto, qui sopra.
  const bordoKey = str(config.bordo);
  const bordoEntry = voce(EXTERIOR_BORDER_REFERENCES, bordoKey);
  if (bordoEntry && FA_BORDO.includes(operazione)) {
    candidates.push({ priority: PRIORITA_BORDO_PERIMETRO, role: "EXTERIOR BORDER TARGET", key: bordoKey, entry: bordoEntry, copy: COPIA_BORDO });
  }
  return pickReferences(candidates);
}

// ── Giardino ────────────────────────────────────────────────────────────────

/**
 * Siepe (`siepi.tipo`) → foto di forma. Lo scatto è una siepe sempreverde di circa 2 m, fitta e
 * tagliata a piombo, davanti a un prato: vale per la schermante di media altezza (quella del preset
 * «Siepe schermante»), non per le altre (GARDEN_SENZA_FOTO).
 */
export const GARDEN_HEDGE_REFERENCES: PhotoTable = {
  schermante_media: forma(
    "Siepe-Schermante-Sempreverde-BN.webp",
    "dense evergreen hedge about 2 m tall, clipped to a clean vertical face with layered leaf texture, bare soil at its base; take only the hedge, not house or trees",
  ),
};

/** Camminamento (`camminamenti.tipo`) → foto di forma: il ritmo e la distanza tra le lastre, non il materiale. */
export const GARDEN_PATH_REFERENCES: PhotoTable = {
  stepping_stones: forma(
    "Camminamento-Stepping-Stones-Nel-Prato-BN.webp",
    "stepping-stone path: separate rectangular slabs set flush in the lawn, all turned the same way, one regular stride apart; take only the slab layout, not plants",
  ),
};

/** Illuminazione (`illuminazione`) → foto di forma: il tipo di apparecchio, non il crepuscolo in cui è scattata. */
export const GARDEN_LIGHTING_REFERENCES: PhotoTable = {
  segnapasso: forma(
    "Segnapasso-Lungo-Vialetto-BN.webp",
    "low path bollard lights: slim hooded posts at the path edge a few metres apart, each lighting the ground below; take only the fixtures, not dusk sky or trees",
  ),
};

/**
 * Scelte del giardino senza foto, col motivo («dimensione/valore»; il test verifica che ogni tipo di
 * siepe, di camminamento e di illuminazione stia o in una tabella o qui). Le superfici (prato, ghiaia,
 * pietra, deck) non hanno foto di giardino: quelle del set sono scattate a bordo piscina, e allegate a
 * un giardino farebbero comparire una vasca, che il prompt del giardino vieta.
 */
export const GARDEN_SENZA_FOTO: Record<string, string> = {
  "siepi/schermante_alta": "la foto è una siepe di circa 2 m (media): per la schermante alta mostrerebbe un'altezza sbagliata",
  "siepi/bassa_formale": "la foto è una siepe alta e fitta: per il bordo basso e tagliato mostrerebbe un'altezza sbagliata",
  "siepi/naturale_morbida": "la foto è una siepe tagliata a piombo: per la siepe informale e a strati mostrerebbe un taglio sbagliato",
  "camminamento/ghiaia": "foto di materia ancora da generare (Camminamento-In-Ghiaia-Con-Bordo, in docs/render-foto-da-generare/moduli-tecnici.md): le ghiaie del set sono a bordo piscina e farebbero comparire una vasca",
  "camminamento/pietra_naturale": "foto di materia ancora da generare (Camminamento-In-Pietra-Naturale-Giardino, in moduli-tecnici.md): la pietra del set è a bordo piscina e farebbe comparire una vasca",
  "camminamento/betonelle": "nessuna foto nel set",
  "camminamento/lastre_modulari": "nessuna foto nel set",
  "camminamento/deck_path": "nessuna foto nel set: i deck del set sono WPC a bordo piscina e farebbero comparire una vasca",
  "illuminazione/nessuna": "nessuna luce da aggiungere: niente da mostrare",
  "illuminazione/uplight_vegetazione": "nessuna foto nel set",
  "illuminazione/luce_perimetrale": "nessuna foto nel set",
  "illuminazione/mix_soft": "mix di segnapasso e luci sulle piante: nessuna foto propria; la foto dei segnapasso è per la scelta «segnapasso»",
};

/** Segnapasso: lo scatto è al crepuscolo con le luci accese; la scena da modificare tiene il suo orario (il prompt vieta di cambiarlo). */
const COPIA_LUCI =
  `Copy the fixture type, height and spacing only; the time of day, sky and overall light of the source photo stay unchanged and the glow stays subtle — ${BLACK_AND_WHITE_RULE}`;

/*
 * Priorità nel giardino: la siepe è un volume nuovo nella scena (10), il camminamento una
 * superficie (20), i segnapasso un dettaglio (30). Insieme sono tre foto: entrano tutte.
 */
const PRIORITA_SIEPE = 10;
const PRIORITA_CAMMINAMENTO = 20;
const PRIORITA_LUCI = 30;

/** Il minimo che il collector del giardino legge: le config arrivano anche dall'API, quindi tutto è opzionale. */
interface GardenConfigLike {
  interventi?: unknown;
  siepi?: { attivo?: unknown; tipo?: unknown; altezza?: unknown } | null;
  camminamenti?: { attivo?: unknown; tipo?: unknown } | null;
  illuminazione?: unknown;
}

/**
 * Foto per la configurazione ricca di un giardino. Ogni foto entra solo se il prompt chiede
 * quell'elemento (gardenPromptBuilder: «Hedges active», «Path active», la riga «Lighting»). Il
 * camminamento ha di default il tipo «stepping_stones» ma `attivo: false`: senza il controllo del
 * flag ogni giardino riceverebbe la foto di un percorso che nessuno ha chiesto.
 */
export function collectGardenReferenceImages(raw?: unknown): SharedReferenceImage[] {
  if (!raw || typeof raw !== "object") return [];
  const config = raw as GardenConfigLike;
  const interventi = Array.isArray(config.interventi) ? config.interventi : [];
  const candidates: ReferenceCandidate[] = [];

  // Siepe: la foto è una schermante di media altezza; con un'altezza «bassa» o «alta» la smentirebbe.
  const siepi = config.siepi && typeof config.siepi === "object" ? config.siepi : null;
  const tipoSiepe = str(siepi?.tipo);
  const altezzaSiepe = str(siepi?.altezza);
  const siepeEntry = voce(GARDEN_HEDGE_REFERENCES, tipoSiepe);
  const siepeChiesta = siepi?.attivo === true || interventi.includes("aggiunta_siepi");
  if (siepeChiesta && siepeEntry && (altezzaSiepe === "" || altezzaSiepe === "media")) {
    candidates.push({ priority: PRIORITA_SIEPE, role: "GARDEN HEDGE TARGET", key: tipoSiepe, entry: siepeEntry });
  }

  // Camminamento: solo se il prompt aggiunge un percorso, e solo del tipo che la foto mostra.
  const percorso = config.camminamenti && typeof config.camminamenti === "object" ? config.camminamenti : null;
  const tipoPercorso = str(percorso?.tipo);
  const percorsoEntry = voce(GARDEN_PATH_REFERENCES, tipoPercorso);
  const percorsoChiesto = percorso?.attivo === true || interventi.includes("aggiunta_camminamenti");
  if (percorsoChiesto && percorsoEntry) {
    candidates.push({ priority: PRIORITA_CAMMINAMENTO, role: "GARDEN PATH TARGET", key: tipoPercorso, entry: percorsoEntry });
  }

  // Illuminazione: la foto del tipo di luce scelto (le altre scelte, «nessuna» compresa, non ne hanno).
  const luci = str(config.illuminazione);
  const luciEntry = voce(GARDEN_LIGHTING_REFERENCES, luci);
  if (luciEntry) {
    candidates.push({ priority: PRIORITA_LUCI, role: "GARDEN LIGHTING TARGET", key: luci, entry: luciEntry, copy: COPIA_LUCI });
  }
  return pickReferences(candidates);
}

/** Tutti i file «cartella/nome» dei pavimenti esterni, per i test di esistenza (il giardino ha la sua lista). */
export function listExteriorReferencePaths(): string[] {
  return listReferencePaths(
    EXTERIOR_PAVING_REFERENCES,
    EXTERIOR_PAVING_PATTERN_REFERENCES,
    POOL_COPING_REFERENCES,
    EXTERIOR_STEP_REFERENCES,
    EXTERIOR_BORDER_REFERENCES,
  );
}

/** Tutti i file «cartella/nome» del giardino: una foto di giardino non deve mai finire nel render di un pavimento esterno. */
export function listGardenReferencePaths(): string[] {
  return listReferencePaths(GARDEN_HEDGE_REFERENCES, GARDEN_PATH_REFERENCES, GARDEN_LIGHTING_REFERENCES);
}
