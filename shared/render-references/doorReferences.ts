/**
 * Foto di riferimento condivise per i render di porte interne e porte blindate
 * (moduli tecnici, generate-technical-render).
 *
 * Sono tutte foto di FORMA, in bianco e nero («-BN.webp»): mostrano al modello
 * come è costruita la porta scelta (battente, scorrevole a scomparsa, binario a
 * vista, filo muro, vetrata, pannello pantografato, fiancoluce). Colore,
 * finitura del pannello, maniglia e vetro arrivano dal testo: per questo le
 * etichette descrivono solo la costruzione e, dove la foto mostra anche altro
 * (maniglione, portale in pietra), dicono quale sola cosa prendere.
 *
 * Le tabelle sono indicizzate con le chiavi VERE della configurazione ricca
 * (`door_type` di render-interior-door / render-security-door), cioè quella che
 * il ponte (shared/render-technical/bridge.ts) costruisce dal preset della
 * pagina. Le voci del manifest che usano un altro nome sono mappate qui:
 * porta_interna «vetrata» = preset «vetrata_satinata» (door_type "vetrata");
 * porta_blindata «moderna_liscia» = door_type "appartamento_moderna",
 * «classica_pantografata» = "appartamento_classica".
 *
 * Gating (regola di progetto: una foto entra solo se quell'elemento cambia, e
 * solo se è coerente con quello che il prompt chiede): stessa logica dei
 * builder dei prompt — finitura soltanto, telaio o maniglia soltanto,
 * scorrevole esterno senza parete libera, fiancoluce su vano stretto, doppia
 * anta in un vano non largo, vetro su una porta cieca, due varianti insieme
 * (doppia anta a tutta altezza, a libro con vetro…) → nessuna foto, perché la
 * foto spingerebbe il modello a costruire proprio ciò che il prompt esclude.
 *
 * Porte interne, 05/10/2026: ai cinque tipi del primo set si sono aggiunte le foto
 * della battente classica pantografata, della porta a libro, della doppia anta,
 * della porta a tutta altezza e della vetrata con vetro trasparente (docs/render-foto-da-generare/moduli-tecnici.md).
 * Le prime quattro hanno la chiave del tipo; la vetrata trasparente è una foto di
 * variante («vetrata/trasparente»), come la pietra a opus incertum dei pavimenti esterni.
 */
import {
  pickReferences,
  listReferencePaths,
  type PhotoEntry,
  type PhotoTable,
  type ReferenceCandidate,
} from "./referencePicker.ts";
import type { SharedReferenceImage } from "./referenceUrl.ts";

export const DOORS_FOLDER = "doors";

const porta = (filename: string, text: string): PhotoEntry => ({ folder: DOORS_FOLDER, filename, text });

// ── Porte interne ───────────────────────────────────────────────────────────

/** Tipo di porta interna (door_type, o il meccanismo che il prompt impone) → foto di forma. */
export const INTERIOR_DOOR_TYPE_REFERENCES: PhotoTable = {
  battente_liscia: porta(
    "Porta-Interna-Bianca-Minimalista-BN.webp",
    "hinged interior door: flat slab leaf without panels, slim flat casing on three sides, two visible hinges, lever handle with keyhole rose",
  ),
  battente_classica: porta(
    "Porta-Interna-Battente-Classica-Pantografata-BN.webp",
    "classic panelled interior door: one leaf with two rectangular raised-moulding panels, stepped moulded casing on three sides, lever handle, two visible hinges",
  ),
  vetrata: porta(
    "Porta-Interna-In-Vetro-Satinato-BN.webp",
    "glazed interior door: one frosted glass pane filling a slim metal frame, no panels or muntins, hinged, short lever handle",
  ),
  scorrevole_interno_muro: porta(
    "Porta-Scorrevole-A-Scomparsa-Elegante-BN.webp",
    "pocket sliding door: flat leaf running into the wall cavity, no visible track or hinges, slim flush jambs, recessed finger pull",
  ),
  scorrevole_esterno_muro: porta(
    "Porta-Scorrevole-Moderna-Con-Binario-Visibile-BN.webp",
    "wall-mounted sliding door: flat leaf hung from a boxed top track fixed above the opening, sliding along the wall face, recessed pull",
  ),
  rasomuro: porta(
    "Porta-Rasomuro-Minimalista-Tono-Su-Tono-BN.webp",
    "flush concealed-frame door: leaf in the same plane as the wall, no casing, only a thin perimeter shadow gap, concealed hinges, lever handle",
  ),
  a_libro: porta(
    "Porta-Interna-A-Libro-Due-Ante-BN.webp",
    "bi-fold interior door: two flat leaves joined by hinges at a visible fold line, shown half-folded and stacking to one side in a slim casing; take the door only",
  ),
  doppia_anta: porta(
    "Porta-Interna-Doppia-Anta-BN.webp",
    "double-leaf hinged interior door: two flat leaves of equal width meeting at a central joint, two lever handles side by side, hinges on both jambs, flat casing",
  ),
  tutta_altezza: porta(
    "Porta-Interna-Tutta-Altezza-BN.webp",
    "full-height interior door: one flat leaf from floor to ceiling with no transom, frame reduced to a hairline shadow gap, concealed hinges, slim lever handle",
  ),
};

/**
 * Foto che valgono solo per una variante del tipo («tipo/variante»): la vetrata con vetro
 * trasparente non è la vetrata satinata del tipo. Come per la posa dei pavimenti esterni, la
 * variante sta nella chiave dell'etichetta: il form la usa per la miniatura accanto alla scelta
 * «Trasparente» (fotoDellOpzione cerca «/valore»).
 */
export const INTERIOR_DOOR_VARIANT_REFERENCES: PhotoTable = {
  "vetrata/trasparente": porta(
    "Porta-Interna-Vetro-Trasparente-Telaio-Sottile-BN.webp",
    "glazed interior door: one clear glass pane filling a slim metal frame, no panels or muntins, hinged, short lever handle; ignore the room seen through the glass",
  ),
};

/**
 * Tipi di porta interna senza foto, col motivo (il test verifica che ogni tipo stia o di qua o di là).
 * Oggi nessuno: dal 05/10/2026 tutti e nove i tipi hanno la loro foto.
 */
export const INTERIOR_DOOR_SENZA_FOTO: Record<string, string> = {};

// ── Porte blindate ──────────────────────────────────────────────────────────

/** Tipo di porta blindata (door_type) → foto di forma. */
export const SECURITY_DOOR_TYPE_REFERENCES: PhotoTable = {
  appartamento_moderna: porta(
    "Porta-Blindata-Moderna-Eleganza-Italiana-BN.webp",
    "modern security door: plain flat slab leaf without grooves or panels, slim frame tight to the opening; take leaf and frame only, hardware as written",
  ),
  appartamento_classica: porta(
    "Porta-Blindata-Classica-Con-Pannello-Inciso-BN.webp",
    "classic security door leaf: routed panelling with an arched upper field, a central roundel and a lower field in raised mouldings; take the leaf, not the portal",
  ),
  rasomuro: porta(
    "Porta-Blindata-Rasomuro-Minimalista-BN.webp",
    "flush security door: leaf in the same plane as the wall, no casing, thin perimeter shadow gap, lever handle with the lock cylinder just below",
  ),
  con_fiancoluce: porta(
    "Porta-Blindata-Con-Fiancoluce-Elegante-BN.webp",
    "security door with sidelight: grooved slab leaf plus one narrow full-height glazed side panel in one shared frame; take this layout, hardware as written",
  ),
};

/** Tipi di porta blindata senza foto, col motivo. */
export const SECURITY_DOOR_SENZA_FOTO: Record<string, string> = {
  villa_moderna: "non raggiungibile dal form (nessun preset) e nessuna foto di ingresso villa",
  villa_classica: "non raggiungibile dal form (nessun preset) e nessuna foto di ingresso villa",
  con_sopraluce: "nessuna foto nel set con sopraluce: quelle disponibili hanno la testata piena",
  doppia_anta: "nessuna foto nel set: tutte le foto sono ad anta singola",
};

/**
 * Foto del set per le porte che il motore NON allega, col motivo. La foto «effetto legno»
 * era destinata al preset «solo_finitura»: ma lì cambia solo la finitura del pannello, e una
 * foto di forma spingerebbe il modello a ricostruire la porta; come foto di materia
 * servirebbe a colori, e il file a colori non esiste.
 */
export const DOOR_FOTO_ORFANE: Record<string, string> = {
  "doors/Porta-Blindata-Effetto-Legno-BN.webp":
    "manifest: porta_blindata solo_finitura. Non allegata: «solo finitura» non cambia la forma (regola: niente foto di forma) e in bianco e nero non può guidare la finitura legno",
};

// ── Gating ──────────────────────────────────────────────────────────────────

/** Il minimo che i collector leggono: le config arrivano anche dall'API, quindi tutto è opzionale e letto con cautela. */
interface DoorConfigLike {
  interventi?: unknown;
  door_type?: unknown;
  leaf_config?: unknown;
  leaf_type?: unknown;
  height?: unknown;
  frame?: { tipo?: unknown } | null;
  glass?: { enabled?: unknown; type?: unknown } | null;
  vetri?: { fiancoluce?: unknown; sopraluce?: unknown } | null;
  apertura?: {
    spazio_scorrimento_parete?: unknown;
    altezza_apparente?: unknown;
    larghezza_apparente?: unknown;
    presenza_fiancoluce?: unknown;
    presenza_sopraluce?: unknown;
  } | null;
}

function interventiDi(config: DoorConfigLike): string[] {
  return Array.isArray(config.interventi) ? config.interventi.filter((v): v is string => typeof v === "string") : [];
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** Interventi che cambiano l'anta (e quindi la sua forma). Telaio, maniglia o finitura da soli no. */
const INTERNA_CAMBIA_FORMA = ["replace_existing_door", "convert_to_pocket_sliding", "convert_to_wall_sliding", "convert_to_flush_door", "add_glazing"];
const BLINDATA_CAMBIA_FORMA = ["replace_existing_door", "add_sidelight", "add_transom", "convert_to_flush_or_minimal"];

/** Vani per cui il prompt ammette la doppia anta: negli altri avverte che serve un vano largo e la vieta (interiorDoorOpeningRules). */
const VANO_LARGO = ["ampia", "molto_ampia"];
/** Telai che il prompt descrive senza coprifili in vista: la foto a tutta altezza non ne ha, un telaio «standard» o «classico» la smentirebbe. */
const TELAIO_SENZA_COPRIFILI = ["minimale", "rasomuro", "complanare"];

/**
 * La chiave di forma che il prompt della porta interna descrive davvero, o null se la foto
 * contraddirebbe il prompt. Stesse condizioni di interiorDoorReplacementRules /
 * interiorDoorOpeningRules. È la chiave di INTERIOR_DOOR_TYPE_REFERENCES o, per la vetrata
 * con vetro trasparente, quella di INTERIOR_DOOR_VARIANT_REFERENCES.
 */
export function interiorDoorShapeKey(raw: object): string | null {
  const config = raw as DoorConfigLike;
  const interventi = interventiDi(config);
  const recolorOnly = interventi.length === 1 && interventi[0] === "recolor_or_restyle_only";
  if (recolorOnly || !interventi.some((i) => INTERNA_CAMBIA_FORMA.includes(i))) return null;
  const doorType = str(config.door_type);
  const leaf = str(config.leaf_config);
  const pocket = doorType === "scorrevole_interno_muro" || interventi.includes("convert_to_pocket_sliding");
  const wallSliding = doorType === "scorrevole_esterno_muro" || interventi.includes("convert_to_wall_sliding");
  const flush = doorType === "rasomuro" || str(config.frame?.tipo) === "rasomuro" || interventi.includes("convert_to_flush_door");
  const glass = config.glass?.enabled === true || interventi.includes("add_glazing") || doorType === "vetrata";
  const doubleLeaf = doorType === "doppia_anta" || leaf.startsWith("doppia");
  const folding = doorType === "a_libro" || leaf === "libro_doppia";
  const fullHeight = doorType === "tutta_altezza" || str(config.height) === "tutta_altezza" || str(config.apertura?.altezza_apparente) === "tutta_altezza";

  // Due meccanismi insieme: il prompt li stampa entrambi, una foto ne sceglierebbe uno a caso.
  if (pocket && wallSliding) return null;
  let key = doorType;
  if (pocket) key = "scorrevole_interno_muro";
  else if (wallSliding) {
    // Senza parete libera il prompt dice «non costruibile, niente binario»: la foto col binario lo smentirebbe.
    if (!["sufficiente", "ampio"].includes(str(config.apertura?.spazio_scorrimento_parete))) return null;
    key = "scorrevole_esterno_muro";
  } else if (flush) key = "rasomuro";

  // Il vetro vive solo sulla vetrata: sulle altre foto (porte cieche) lo smentirebbe.
  if (glass && key !== "vetrata") return null;

  // Doppia anta, a libro e tutta altezza hanno ognuna la sua foto, ma una per volta: con due insieme
  // (doppia anta a tutta altezza, a libro con doppia anta…) la foto ne mostrerebbe una sola.
  const varianti = [doubleLeaf && "doppia_anta", folding && "a_libro", fullHeight && "tutta_altezza"].filter((v): v is string => typeof v === "string");
  if (varianti.length > 1) return null;

  if (key === "vetrata") {
    if (varianti.length > 0) return null;
    const tipoVetro = str(config.glass?.type);
    // Il vetro non specificato è quello del modello (satinato); fumé e inglesine guiderebbero il vetro sbagliato.
    if (!tipoVetro || tipoVetro === "satinato") return "vetrata";
    return tipoVetro === "trasparente" ? "vetrata/trasparente" : null;
  }

  if (varianti.length === 1) {
    const variante = varianti[0];
    // Le tre foto mostrano un'anta liscia: la variante conta solo su una battente liscia (o sul suo stesso tipo).
    // Una classica pantografata, una scorrevole o una rasomuro con la doppia anta non hanno foto; la tutta altezza
    // è già a filo parete, quindi sta bene anche sulla rasomuro.
    const ante = key === "battente_liscia" || key === variante || (variante === "tutta_altezza" && key === "rasomuro");
    if (!ante) return null;
    if (variante === "doppia_anta") {
      // Le due ante della foto sono uguali; con ante diverse (attiva e passiva) o un vano non largo la foto smentirebbe il prompt.
      if (leaf === "doppia_asimmetrica" || !VANO_LARGO.includes(str(config.apertura?.larghezza_apparente))) return null;
    }
    if (variante === "tutta_altezza") {
      const telaio = str(config.frame?.tipo);
      if (telaio && !TELAIO_SENZA_COPRIFILI.includes(telaio)) return null;
    }
    key = variante;
  }
  return Object.prototype.hasOwnProperty.call(INTERIOR_DOOR_TYPE_REFERENCES, key) ? key : null;
}

/**
 * Chiave di forma per la porta blindata, o null. «Solo finitura» non allega mai la forma:
 * cambia il pannello, non la porta. Stesse condizioni di securityDoorReplacementRules /
 * securityDoorOpeningRules.
 */
export function securityDoorShapeKey(raw: object): string | null {
  const config = raw as DoorConfigLike;
  const interventi = interventiDi(config);
  const recolorOnly = interventi.length === 1 && interventi[0] === "recolor_or_restyle_only";
  if (recolorOnly || !interventi.some((i) => BLINDATA_CAMBIA_FORMA.includes(i))) return null;
  const doorType = str(config.door_type);
  const leaf = str(config.leaf_type);
  const flush = doorType === "rasomuro" || str(config.frame?.tipo) === "rasomuro" || interventi.includes("convert_to_flush_or_minimal");
  const sidelight = config.vetri?.fiancoluce === true || interventi.includes("add_sidelight") || leaf === "anta_singola_con_fianco"
    || config.apertura?.presenza_fiancoluce === true;
  const sidelightFeasible = sidelight && str(config.apertura?.larghezza_apparente) !== "stretta";
  const transom = config.vetri?.sopraluce === true || interventi.includes("add_transom") || leaf === "anta_singola_con_sopraluce"
    || config.apertura?.presenza_sopraluce === true || doorType === "con_sopraluce";
  const doubleLeaf = doorType === "doppia_anta" || leaf.startsWith("doppia_anta");

  if (transom || doubleLeaf) return null;
  if (sidelightFeasible) return flush ? null : "con_fiancoluce";
  // Fiancoluce chiesto ma non costruibile (o tipo «con fiancoluce» senza fiancoluce): la foto lo mostrerebbe.
  if (doorType === "con_fiancoluce") return null;
  const key = flush ? "rasomuro" : doorType;
  return key in SECURITY_DOOR_TYPE_REFERENCES ? key : null;
}

// ── Collector ───────────────────────────────────────────────────────────────

/*
 * Priorità (più basso = più importante). Oggi c'è una sola foto per render, quella del
 * tipo di porta: è ciò che cambia la sagoma (anta, meccanismo, telaio). Le foto di
 * finitura del pannello e della maniglia, quando esisteranno, andranno a 20 e 30:
 * prima la forma, poi la superficie grande, poi i dettagli.
 */
const PRIORITA_TIPO = 10;

export function collectInteriorDoorReferenceImages(config: object | null | undefined): SharedReferenceImage[] {
  if (!config || typeof config !== "object") return [];
  const candidates: ReferenceCandidate[] = [];
  const key = interiorDoorShapeKey(config);
  const entry = key ? (INTERIOR_DOOR_VARIANT_REFERENCES[key] ?? INTERIOR_DOOR_TYPE_REFERENCES[key]) : undefined;
  if (key && entry) candidates.push({ priority: PRIORITA_TIPO, role: "INTERIOR DOOR TYPE TARGET", key, entry });
  return pickReferences(candidates);
}

export function collectSecurityDoorReferenceImages(config: object | null | undefined): SharedReferenceImage[] {
  if (!config || typeof config !== "object") return [];
  const candidates: ReferenceCandidate[] = [];
  const key = securityDoorShapeKey(config);
  if (key) candidates.push({ priority: PRIORITA_TIPO, role: "SECURITY DOOR TYPE TARGET", key, entry: SECURITY_DOOR_TYPE_REFERENCES[key] });
  return pickReferences(candidates);
}

/** Tutti i file «cartella/nome» dichiarati, per i test di esistenza. */
export function listDoorReferencePaths(): string[] {
  return listReferencePaths(INTERIOR_DOOR_TYPE_REFERENCES, INTERIOR_DOOR_VARIANT_REFERENCES, SECURITY_DOOR_TYPE_REFERENCES);
}
