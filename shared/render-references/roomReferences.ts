/**
 * Foto di riferimento condivise del render stanza.
 *
 * La stanza cambia solo i sistemi attivi (`attivo: true`): una foto entra solo se il suo
 * sistema è attivo, altrimenti spingerebbe il modello a cambiare ciò che deve restare.
 *  - pavimento (`pavimento.attivo`): le stesse foto del render pavimento — posa e
 *    superficie, più il battiscopa se va sostituito con un materiale preciso — lette
 *    dalla stessa traduzione che usa il prompt (normalizeRoomFloorConfig). Bisello e
 *    finitura restano fuori: sono primi piani di dettaglio, alla scala della stanza
 *    non si vedono e toglierebbero posto alle superfici;
 *  - rivestimento pareti (`rivestimento_pareti.attivo`): la superficie scelta. Le foto
 *    stanno in public/render-references/facades/ (stessa materia della facciata);
 *  - illuminazione (`illuminazione.attivo`): la foto dell'apparecchio (per ora solo il binario con
 *    faretti orientabili), di forma, in public/render-references/lighting/. Temperatura e
 *    intensità della luce restano al testo.
 *
 * Ordine (al massimo 3, dopo il catalogo dell'azienda):
 *  10 posa del pavimento — la geometria, ciò che il modello sbaglia di più;
 *  15 rivestimento parete — superficie grande che il prompt descrive in una riga sola
 *     (a differenza del pavimento, che ha la sua specifica completa);
 *  20 superficie del pavimento;
 *  25 illuminazione a binario — un oggetto piccolo nella scena: dopo il rivestimento e dopo la
 *     superficie del pavimento, ma prima del battiscopa (una fascia sottile alla base della parete);
 *  30 battiscopa.
 */
import { normalizeRoomFloorConfig } from "../render-room/roomRenderConfig.ts";
import { floorReferenceCandidates } from "./floorReferences.ts";
import {
  BLACK_AND_WHITE_RULE,
  COLOUR_RULE,
  listReferencePaths,
  pickReferences,
  type PhotoTable,
  type ReferenceCandidate,
} from "./referencePicker.ts";
import type { SharedReferenceImage } from "./referenceUrl.ts";

export const ROOM_CLADDING_FOLDER = "facades";

/** Rivestimento pareti (`rivestimento_pareti.tipo`) — MATERIA, a colori. */
export const ROOM_CLADDING_PHOTOS: PhotoTable = {
  mattone_vista: { folder: ROOM_CLADDING_FOLDER, filename: "Parete-In-Mattoni-Antichi.webp", text: "exposed brick: tumbled clay bricks in running bond with recessed mortar joints and natural brick-to-brick variation" },
  pietra_naturale: { folder: ROOM_CLADDING_FOLDER, filename: "Muro-Rustico-In-Pietra-Naturale.webp", text: "natural stone cladding: irregular split stones of mixed sizes in rough courses, recessed joints and real relief" },
  intonaco_spatolato: { folder: ROOM_CLADDING_FOLDER, filename: "Intonaco-Rustico-Spatolato-In-Primo-Piano.webp", text: "hand-trowelled textured plaster: thick spatula strokes and raised ridges that catch grazing light, no joints" },
  stucco_veneziano: { folder: ROOM_CLADDING_FOLDER, filename: "Intonaco-Veneziano-Levigato-E-Luminoso.webp", text: "polished Venetian stucco: thin layered lime plaster, smooth, with soft cloudy marbling and a gentle sheen" },
};

/** Opzioni del rivestimento senza foto, col motivo. */
export const ROOM_SENZA_FOTO: Record<string, string> = {
  "rivestimento_pareti.boiserie_legno": "nessuna foto nel set (da generare, vedi docs/render-foto-da-generare/pavimento-stanza.md)",
  "rivestimento_pareti.pannelli_3d": "nessuna foto nel set (da generare, vedi docs/render-foto-da-generare/pavimento-stanza.md)",
};

export const ROOM_LIGHTING_FOLDER = "lighting";

/**
 * Illuminazione (`illuminazione.tipo`) — FORMA, bianco e nero: l'apparecchio e come si monta. Solo il
 * binario ha una foto; gli altri tipi (faretti incassati, lampadario, applique…) restano al testo.
 */
export const ROOM_LIGHTING_PHOTOS: PhotoTable = {
  binario: { folder: ROOM_LIGHTING_FOLDER, filename: "Binario-Con-Faretti-Orientabili-BN.webp", text: "slim surface-mounted ceiling track with several cylindrical spot heads on short swivel stems, each aimed in a different direction" },
};

const COPY_CLADDING = `Copy the wall surface only: texture, relief, joint pattern and scale; never copy this sample's framing or light; ${COLOUR_RULE}`;
const COPY_LIGHTING = `Copy only the light fitting: the slim track and how its spot heads are hung and aimed; ignore the room, the walls and the daylight of this sample — the track length, its position and the number of heads come from the written specification; ${BLACK_AND_WHITE_RULE}`;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function attivo(section: Record<string, unknown>): boolean {
  return section.attivo === true;
}

/** Le candidate della stanza, con le priorità scritte in testa al file. */
export function roomReferenceCandidates(config: unknown): ReferenceCandidate[] {
  const cfg = asRecord(config);
  const out: ReferenceCandidate[] = [];

  const rivestimento = asRecord(cfg.rivestimento_pareti);
  if (attivo(rivestimento) && typeof rivestimento.tipo === "string") {
    const entry = ROOM_CLADDING_PHOTOS[rivestimento.tipo];
    if (entry) out.push({ priority: 15, role: "WALL CLADDING TARGET", key: rivestimento.tipo, entry, copy: COPY_CLADDING });
  }

  const pavimento = asRecord(cfg.pavimento);
  if (attivo(pavimento)) {
    out.push(...floorReferenceCandidates(normalizeRoomFloorConfig(pavimento), { dettagli: false }));
  }

  const illuminazione = asRecord(cfg.illuminazione);
  if (attivo(illuminazione) && typeof illuminazione.tipo === "string") {
    const entry = ROOM_LIGHTING_PHOTOS[illuminazione.tipo];
    if (entry) out.push({ priority: 25, role: "LIGHTING TYPE TARGET", key: illuminazione.tipo, entry, copy: COPY_LIGHTING });
  }

  return out;
}

/** Foto condivise per un render stanza (massimo 3): solo per i sistemi attivi. */
export function collectRoomReferenceImages(config: unknown): SharedReferenceImage[] {
  return pickReferences(roomReferenceCandidates(config));
}

/** I percorsi «cartella/file» propri della stanza (il pavimento li dichiara floorReferences.ts). */
export function listRoomReferencePaths(): string[] {
  return listReferencePaths(ROOM_CLADDING_PHOTOS, ROOM_LIGHTING_PHOTOS);
}
