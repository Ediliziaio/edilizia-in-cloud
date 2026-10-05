/**
 * Foto di riferimento per il render persiane: una foto per ogni elemento che il
 * render cambia, scelta dalla configurazione e allegata solo se quell'elemento
 * cambia davvero (vedi referencePicker.ts per tetto, priorità e regola B/N).
 *
 * Forma in bianco e nero (tipo di oscurante, numero di ante, cassonetto, montaggio),
 * materia a colori (essenza del legno, materiale, ferramenta). Le foto del set del
 * 04/10/2026 sostituiscono quelle di Wikimedia Commons (crediti in CREDITS.md): le
 * vecchie restano su disco ma non sono più allegate, perché ogni tipo ha ora una
 * foto nuova. Il 05/10/2026 sono arrivate quelle degli elementi aggiunti dopo: la
 * veneziana esterna (prima senza foto), l'anta singola e il cassonetto nascosto.
 */
import {
  listReferencePaths,
  pickReferences,
  BLACK_AND_WHITE_RULE,
  type PhotoEntry,
  type PhotoTable,
  type ReferenceCandidate,
} from "./referencePicker.ts";
import type { SharedReferenceImage } from "./referenceUrl.ts";
import { anteCompatibili, type TipoPersiana } from "../render-persiane/types.ts";

export const SHUTTER_FOLDER = "shutters";

const foto = (filename: string, text: string): PhotoEntry => ({ folder: SHUTTER_FOLDER, filename, text });

/** TIPO di oscurante (FORMA, bianco e nero): com'è costruito, mai il colore. */
export const SHUTTER_TYPE_PHOTOS: PhotoTable = {
  veneziana_classica: foto(
    "Persiana-Italiana-A-Lamelle-Chiuse-BN.webp",
    "two hinged louvered leaves closed in the reveal: fixed angled slats in a stile-and-rail frame, small hinges on the jambs",
  ),
  // Frangisole a lamelle su guide (non un'anta a battente): la foto del set Persiana-A-Lamelle-Aperta-Sul-Muro-BN
  // mostrava un'anta aperta sul muro, per questo il tipo era rimasto senza foto fino al 05/10/2026.
  veneziana_esterna: foto(
    "Veneziana-Esterna-A-Lamelle-Orientabili-Su-Guide-BN.webp",
    "external venetian blind in two vertical side guides: wide horizontal tilting slats (shown half open), compact head box above the window; no leaves, no hinges",
  ),
  scuro_pieno: foto(
    "Persiana-In-Legno-A-Due-Ante-BN.webp",
    "two solid leaves of vertical boards, no slats, long strap hinges across the boards on wall pintles, closed in the reveal",
  ),
  scuro_cornice: foto(
    "Persiana-Doppia-A-Pannelli-Rialzati-BN.webp",
    "two solid framed leaves, each with one tall raised panel in a stile-and-rail frame, no slats, side hinges on the jambs",
  ),
  gelosia: foto(
    "Persiana-A-Gelosia-Chiusa-BN.webp",
    "two closed leaves of dense fixed inclined slats in a slim frame: screens the view but lets air through, no tilt rod",
  ),
  avvolgibile_esterno: foto(
    "Serranda-Avvolgibile-Con-Guide-Laterali-BN.webp",
    "roller-shutter curtain of interlocking curved slats sliding in a side guide rail, with a bottom end rail; no hinges, no leaves",
  ),
  a_libro: foto(
    "Persiana-A-Libro-Semiaperta-BN.webp",
    "bi-fold louvered shutters half open: narrow panels hinged to each other, folded back in pairs against both jambs",
  ),
  griglia_sicurezza: foto(
    "Inferriata-In-Ferro-Battuto-BN.webp",
    "security grille fixed inside the window opening: vertical bars with scrolled ornaments and a perimeter frame, glass behind",
  ),
  brise_soleil: foto(
    "Frangisole-In-Alluminio-A-45-BN.webp",
    "brise-soleil outside a window: wide horizontal blades tilted about 45 degrees, held between vertical side supports",
  ),
};

/**
 * Tapparella col cassonetto scelto (FORMA, B/N): la finestra intera, col cassonetto
 * sulla facciata o nascosto nel muro. Chiavi = valori veri di `cassonetto`. Sostituisce
 * la foto del tipo solo se un cassonetto è stato scelto: senza scelta resta il primo
 * piano della serranda, che non impone nessun cassonetto (in molte case è nascosto).
 * Solo per l'avvolgibile: la veneziana esterna ha una sola foto, col cassonetto a vista.
 */
export const SHUTTER_HEAD_BOX_PHOTOS: PhotoTable = {
  esterno_a_vista: foto(
    "Finestra-Con-Tapparella-Abbassata-BN.webp",
    "window with an external roller shutter lowered: box mounted on the facade above the opening, curtain in two side guides down to the sill",
  ),
  a_scomparsa: foto(
    "Finestra-Con-Tapparella-Cassonetto-Nascosto-BN.webp",
    "window with an external roller shutter lowered halfway: the curtain comes out of a thin slot under the lintel, no head box on the facade, two slim side guides",
  ),
};

/**
 * NUMERO DI ANTE (FORMA, bianco e nero): le foto di tutti i tipi a battente mostrano
 * due ante, quindi una foto in più serve solo all'anta singola. Chiavi = valori veri
 * di `numero_ante` (in stringa). La foto è di una persiana a lamelle ma dice solo
 * quante ante ci sono e come sono appese: lamelle o pannelli li dà la foto del tipo.
 */
export const SHUTTER_LEAF_COUNT_PHOTOS: PhotoTable = {
  "1": foto(
    "Persiana-Ad-Una-Anta-Chiusa-BN.webp",
    "one single louvered leaf hinged on one side jamb and covering the whole opening: fixed angled slats in a stile-and-rail frame, two hinges at the wall",
  ),
};

/**
 * Essenza dell'effetto legno (MATERIA, a colori): il tono e la venatura sono
 * l'informazione. Chiavi = valori veri di `effetto_legno` (il manifest diceva
 * «noce» e «douglas_fiammato»: nel codice sono `noce_nazionale` e `douglas`).
 */
export const SHUTTER_WOOD_FINISH_PHOTOS: PhotoTable = {
  rovere_scuro: foto(
    "Lamella-Di-Persiana-In-Rovere-Scuro.webp",
    "dark oak finish on a shutter slat: deep brown tone, fine straight grain with a soft cathedral figure, low sheen",
  ),
  noce_nazionale: foto(
    "Lamella-Verticale-Effetto-Noce.webp",
    "walnut finish on a vertical slat: warm mid-brown with darker flowing streaks and a long cathedral grain",
  ),
  castagno: foto(
    "Listello-Verticale-Effetto-Castagno.webp",
    "chestnut finish on a vertical batten: golden brown with a pronounced straight grain and open pores",
  ),
  douglas: foto(
    "Lamella-Effetto-Abete-Douglas-Fiammato.webp",
    "flamed Douglas fir finish on a vertical slat: warm orange-amber tone with bold flame-shaped growth rings",
  ),
};

/** MATERIALE (MATERIA, a colori): la superficie del materiale. */
export const SHUTTER_MATERIAL_PHOTOS: PhotoTable = {
  legno_naturale: foto(
    "Persiana-In-Legno-Massello-Oliato.webp",
    "solid natural wood louvers with an oiled finish: open grain, small knots and slight tone variation from slat to slat",
  ),
  fibra_vetro: foto(
    "Dettaglio-Di-Persiana-In-Fibra-Di-Vetro.webp",
    "fiberglass louvers: smooth slats with a fine even surface texture, softly rounded edges, no wood grain",
  ),
  alluminio: foto(
    "Dettaglio-Di-Lamella-In-Alluminio-Opaco.webp",
    "extruded aluminium slats: matt powder-coated surface, crisp straight profiles and tight interlocking joints",
  ),
};

/**
 * Tono medio misurato al centro di ogni foto di materiale (crop 40%, media):
 * la foto si allega solo se la tinta scelta le è vicina (vedi tonoCompatibile).
 */
export const SHUTTER_MATERIAL_TONES: Record<string, string> = {
  legno_naturale: "#8F5224",
  fibra_vetro: "#A3A4A2",
  alluminio: "#5B6168",
};

/** MONTAGGIO (FORMA, bianco e nero): come l'anta è fissata, solo per i tipi a battente. */
export const SHUTTER_MOUNTING_PHOTOS: PhotoTable = {
  su_telaio: foto(
    "Dettaglio-Di-Persiana-E-Cerniera-BN.webp",
    "shutter leaf hung on a flat butt hinge fixed to the window frame inside the reveal, not on wall pintles",
  ),
  brackets_architettonici: foto(
    "Persiana-Sostenuta-Da-Staffe-Decorative-BN.webp",
    "shutter leaf held off the wall on two long scrolled support brackets anchored to the facade beside the window",
  ),
};

/** FERRAMENTA (MATERIA, a colori): solo la finitura di cerniere e fermapersiane. */
export const SHUTTER_HARDWARE_PHOTOS: PhotoTable = {
  bronzo_scuro: foto(
    "Cerniera-E-Fermapersiana-In-Bronzo.webp",
    "dark bronze strap hinge and shutter dog: hand-forged look with a slightly textured patina",
  ),
};

/**
 * Opzioni vere senza foto, col motivo. Il test verifica che ogni opzione del
 * codice stia o in una tabella o qui.
 */
export const SENZA_FOTO_PERSIANE: Record<string, string> = {
  "numero_ante.2": "le foto di tutti i tipi a battente mostrano già due ante: serve una foto solo per l'anta singola",
  "numero_ante.4": "nessuna foto con questo numero di pannelli: bastano le parole",
  "numero_ante.6": "nessuna foto con questo numero di pannelli: bastano le parole",
  "materiale.legno_composito": "nessuna foto nel set: bastano le parole",
  "materiale.pvc": "nessuna foto nel set: bastano le parole",
  "materiale.acciaio":
    "nessuna foto nuova; la vecchia (Griglia-Sicurezza-Ferro-Bombata) mostra inferriate bombate su una facciata gialla: forma e sfondo sbagliati per un materiale",
  "effetto_legno.rovere_chiaro":
    "nessuna foto a colori: la vecchia Persiana-Veneziana-Legno-Chiaro-Lamelle è in grigio e non dice il tono",
  "ferramenta_finitura.verniciata_tinta": "tinta della persiana: bastano le parole",
  "ferramenta_finitura.nero_opaco": "tinta unita: bastano le parole",
  "ferramenta_finitura.acciaio_satinato": "finitura semplice: bastano le parole",
  "ferramenta_finitura.ferro_micaceo": "nessuna foto nel set: bastano le parole",
  "installazione.cardini_tradizionali":
    "foto orfana (Persiana-Su-Cardini-Murali-Tradizionali-BN): è il montaggio di default dei tipi a battente e le loro foto mostrano già i cardini sugli stipiti; allegarla toglierebbe uno slot senza aggiungere niente",
  "installazione.guide_laterali":
    "montaggio nativo di avvolgibile e veneziana esterna: la foto (Serranda-Avvolgibile-Con-Guide-Laterali-BN) è già quella del tipo avvolgibile; per i tipi a battente le guide non sono un montaggio coerente",
};

/** Tipi con ante a battente e ferramenta visibile (cardini, fermapersiane). */
const TIPI_A_BATTENTE = new Set(["veneziana_classica", "scuro_pieno", "scuro_cornice", "gelosia", "a_libro"]);

/** Montaggio implicito di ogni tipo (stessa regola di inferInstallation nel builder). */
function montaggioNativo(tipo: string): string {
  if (tipo === "avvolgibile_esterno" || tipo === "veneziana_esterna") return "guide_laterali";
  if (tipo === "brise_soleil") return "brackets_architettonici";
  return "cardini_tradizionali";
}

// ── Vicinanza di tono ────────────────────────────────────────────────────────
// Una foto di materia è a colori perché il colore è l'informazione. Ma per il
// materiale (alluminio, fibra di vetro, legno oliato) il colore lo sceglie la
// finitura, non il materiale: una lamella antracite allegata a una persiana
// «Bianco puro» tira il bianco verso il grigio, come la foto verde faceva
// uscire marrone il «nero intenso» (7a2a49b33). Quindi la foto del materiale
// va al modello solo se il suo tono è vicino alla tinta scelta.

/** Oltre questa distanza (ΔE CIE76) due tinte si leggono come colori diversi. */
export const TONO_MASSIMO_MATERIA = 20;

function hexToLab(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
  const y = r * 0.2126 + g * 0.7152 + b * 0.0722;
  const z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116);
  const [fx, fy, fz] = [f(x), f(y), f(z)];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** Distanza ΔE (CIE76) tra due esadecimali, null se uno dei due non è leggibile. */
export function distanzaTono(a: string, b: string): number | null {
  const la = hexToLab(a);
  const lb = hexToLab(b);
  if (!la || !lb) return null;
  return Math.hypot(la[0] - lb[0], la[1] - lb[1], la[2] - lb[2]);
}

/** La tinta scelta e il tono della foto si leggono come lo stesso colore? Senza tinta scelta non c'è conflitto. */
export function tonoCompatibile(tintaScelta: string | null | undefined, tonoFoto: string): boolean {
  if (!tintaScelta) return true;
  const d = distanzaTono(tintaScelta, tonoFoto);
  return d === null ? true : d <= TONO_MASSIMO_MATERIA;
}

// ── Scelta delle foto ────────────────────────────────────────────────────────

export interface ShutterReferenceInput {
  operazione?: string | null;
  tipo?: string | null;
  materiale?: string | null;
  colore_mode?: string | null;
  colore_hex?: string | null;
  effetto_legno?: string | null;
  installazione?: string | null;
  ferramenta_finitura?: string | null;
  cassonetto?: string | null;
  /** Ante per finestra scelte (1, 2, 4 o 6); assente = come in foto. È un numero, come lo salva il form. */
  numero_ante?: number | null;
}

/** I campi di testo del form (`numero_ante` è un numero: lo legge a parte shutterReferenceInputFromConfig). */
const CAMPI_INPUT: Array<Exclude<keyof ShutterReferenceInput, "numero_ante">> = [
  "operazione", "tipo", "materiale", "colore_mode", "colore_hex", "effetto_legno", "installazione", "ferramenta_finitura", "cassonetto",
];

/**
 * I campi del form da una configurazione salvata. Il wizard manda il piano v2:
 * i campi stanno in `legacy_config`; una chiave al livello alto (payload vecchi)
 * vince, come faceva la edge prima di questa libreria.
 */
export function shutterReferenceInputFromConfig(raw: Record<string, unknown> | null | undefined): ShutterReferenceInput {
  const c = raw && typeof raw === "object" ? raw : {};
  const lc = (c.legacy_config && typeof c.legacy_config === "object" ? c.legacy_config : {}) as Record<string, unknown>;
  const out: ShutterReferenceInput = {};
  for (const k of CAMPI_INPUT) {
    const v = typeof c[k] === "string" ? c[k] : lc[k];
    if (typeof v === "string" && v) out[k] = v;
  }
  // Solo un numero vero, come lo legge il prompt (anteCompatibili): «"1"» in stringa lì non conta, quindi nemmeno qui.
  const ante = typeof c.numero_ante === "number" ? c.numero_ante : lc.numero_ante;
  if (typeof ante === "number") out.numero_ante = ante;
  return out;
}

/** Una sola anta chiesta: la foto del tipo ne mostra due, quindi da quella si prende il disegno e non il numero. */
const COPIA_TIPO_UNA_ANTA =
  `Copy the design of the slats or panels and the frame — the photo shows two leaves but the requested shutter has ONE, see the leaf-count photo and the written specification — ${BLACK_AND_WHITE_RULE}`;
/** Veneziana esterna col cassonetto nascosto: la foto lo ha a vista, ma non è quello chiesto. */
const COPIA_VENEZIANA_SENZA_CASSONETTO =
  `Copy only the slats and the side guides — the head box in the photo is NOT requested: it stays concealed, as the written specification says — ${BLACK_AND_WHITE_RULE}`;

/**
 * Le foto da allegare per una configurazione persiane (massimo 3).
 *
 * Priorità — prima la sagoma, poi le superfici grandi, poi i dettagli:
 *  1. tipo di oscurante (forma): è ciò che il modello sbaglia di più;
 *  2. numero di ante, solo se è scelta l'anta singola: le foto dei tipi ne mostrano due;
 *  3. essenza dell'effetto legno: è la superficie visibile di tutta la persiana;
 *  4. materiale, solo se il suo tono è vicino alla tinta scelta;
 *  5. montaggio scelto a mano (su telaio, su staffe), solo per i tipi a battente;
 *  6. finitura della ferramenta (bronzo scuro), solo per i tipi a battente.
 *
 * Gating: «rimuovi» non allega niente; «cambia colore» cambia solo la finitura,
 * quindi né il tipo né il numero di ante né il cassonetto né il materiale né il
 * montaggio (nel form sono nascosti e resterebbero i valori di default: la foto
 * di una veneziana allegata alla ricolorazione di tapparelle le trasformava in
 * persiane).
 *
 * Tre scelte cambiano ciò che la foto del tipo dice, e l'etichetta lo dice al modello:
 *  - cassonetto della tapparella (nascosto o a vista): al posto del primo piano della
 *    serranda va la foto della finestra intera con quel cassonetto;
 *  - anta singola: la foto del tipo ne mostra due, e a fianco va quella dell'anta sola;
 *  - veneziana esterna con cassonetto nascosto: la foto lo ha a vista, quindi si
 *    copiano solo lamelle e guide.
 */
export function collectShutterReferenceImages(config: ShutterReferenceInput): SharedReferenceImage[] {
  const op = config.operazione ?? "sostituisci";
  if (op === "rimuovi") return [];
  const cambiaForma = op !== "cambia_colore";
  const tipo = config.tipo ?? "";
  const candidates: ReferenceCandidate[] = [];

  // Il numero di ante vale per il tipo? (Stessa regola del prompt: un numero che il tipo non può avere si ignora.)
  const anteScelte = cambiaForma && anteCompatibili(tipo as TipoPersiana, config.numero_ante) ? config.numero_ante : undefined;
  const anteFoto = anteScelte === undefined ? undefined : SHUTTER_LEAF_COUNT_PHOTOS[String(anteScelte)];

  // La tapparella col cassonetto scelto (a vista o nascosto): la foto della finestra intera col cassonetto.
  const cassonettoFoto = tipo === "avvolgibile_esterno" ? SHUTTER_HEAD_BOX_PHOTOS[config.cassonetto ?? ""] : undefined;
  const tipoFoto = !cambiaForma ? undefined : cassonettoFoto ?? SHUTTER_TYPE_PHOTOS[tipo];
  if (tipoFoto) {
    candidates.push({
      priority: 1,
      role: "SHUTTER MODEL TARGET",
      key: tipo,
      entry: tipoFoto,
      copy: anteFoto
        ? COPIA_TIPO_UNA_ANTA
        : tipo === "veneziana_esterna" && config.cassonetto === "a_scomparsa"
          ? COPIA_VENEZIANA_SENZA_CASSONETTO
          : undefined,
    });
  }

  if (anteFoto) {
    candidates.push({
      priority: 2,
      role: "SHUTTER LEAF COUNT TARGET",
      key: String(anteScelte),
      entry: anteFoto,
      copy: `Copy only the number of leaves and how the leaf hangs: ONE leaf on one jamb covering the whole opening; its slats or panels follow the type photo and the written specification — ${BLACK_AND_WHITE_RULE}`,
    });
  }

  const legno = config.colore_mode === "legno";
  const essenza = legno ? SHUTTER_WOOD_FINISH_PHOTOS[config.effetto_legno ?? "rovere_chiaro"] : undefined;
  if (essenza) {
    candidates.push({ priority: 3, role: "WOOD FINISH TARGET", key: config.effetto_legno ?? "rovere_chiaro", entry: essenza });
  }

  // Il materiale solo con una tinta RAL vicina al suo tono: con l'effetto legno
  // il colore lo dà l'essenza, e la foto del materiale lo contraddirebbe.
  const materiale = config.materiale ?? "";
  const materialeFoto = cambiaForma && !legno ? SHUTTER_MATERIAL_PHOTOS[materiale] : undefined;
  if (materialeFoto && tonoCompatibile(config.colore_hex, SHUTTER_MATERIAL_TONES[materiale])) {
    candidates.push({ priority: 4, role: "SHUTTER MATERIAL TARGET", key: materiale, entry: materialeFoto });
  }

  const aBattente = TIPI_A_BATTENTE.has(tipo);
  const montaggio = config.installazione ?? "";
  const montaggioFoto = cambiaForma && aBattente && montaggio && montaggio !== montaggioNativo(tipo)
    ? SHUTTER_MOUNTING_PHOTOS[montaggio]
    : undefined;
  if (montaggioFoto) {
    candidates.push({
      priority: 5,
      role: "SHUTTER MOUNTING TARGET",
      key: montaggio,
      entry: montaggioFoto,
      copy: `Copy only how the leaf is fixed (hinge, bracket, anchor point) — ${BLACK_AND_WHITE_RULE}; the shutter itself follows the type photo and the text`,
    });
  }

  const ferramenta = config.ferramenta_finitura ?? "";
  const ferramentaFoto = (aBattente || !cambiaForma) ? SHUTTER_HARDWARE_PHOTOS[ferramenta] : undefined;
  if (ferramentaFoto) {
    candidates.push({
      priority: 6,
      role: "HARDWARE FINISH TARGET",
      key: ferramenta,
      entry: ferramentaFoto,
      copy: "Copy only the finish of hinges and shutter dogs; ignore the shutter board and its colour, which come from the written specification",
    });
  }

  return pickReferences(candidates);
}

/** Tutti i file dichiarati («shutters/…»): per il test sull'esistenza. */
export function listShutterReferencePaths(): string[] {
  return listReferencePaths(
    SHUTTER_TYPE_PHOTOS,
    SHUTTER_HEAD_BOX_PHOTOS,
    SHUTTER_LEAF_COUNT_PHOTOS,
    SHUTTER_WOOD_FINISH_PHOTOS,
    SHUTTER_MATERIAL_PHOTOS,
    SHUTTER_MOUNTING_PHOTOS,
    SHUTTER_HARDWARE_PHOTOS,
  );
}
