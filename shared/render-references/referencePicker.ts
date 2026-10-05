/**
 * Scelta delle foto di riferimento condivise per un render.
 *
 * Ogni elemento che il render cambia (tipo di doccia, effetto piastrelle, tipo
 * di pergola, manto del tetto…) ha al massimo UNA foto candidata, con una
 * priorità. Si tengono le prime N: prima ciò che dà la forma (struttura), poi
 * le superfici, poi i dettagli di finitura. Il catalogo dell'azienda, quando c'è,
 * viene prima e occupa i suoi slot (vedi i generate-*-render): qui si riempiono
 * solo quelli rimasti liberi.
 *
 * Regola di progetto (commit 7a2a49b33): le foto di FORMA sono in bianco e nero
 * — il file finisce per «-BN.webp» — perché il modello copi la struttura e non
 * il colore, che arriva dal testo («nero intenso» uscivano marrone per colpa di
 * una foto verde). Le foto di MATERIA (texture, finiture, colori) restano a
 * colori: lì il colore È l'informazione. Il test sulle foto verifica che le due
 * cose combacino con quello che dichiara l'etichetta.
 */
import { makeReferenceImage, type SharedReferenceImage } from "./referenceUrl.ts";

/**
 * Quante foto condivise al massimo per render. Il tetto vero è 4 immagini in
 * tutto (catalogo azienda + condivise, vedi i generate-*-render): se il catalogo
 * ne occupa già alcune, le condivise si fermano agli slot liberi.
 * Erano 2; con una foto per ogni elemento cambiato ne servono di più.
 */
export const MAX_SHARED_REFERENCES = 3;

/** Una voce di libreria: dove sta la foto e cosa il modello deve prenderne. */
export interface PhotoEntry {
  /** Cartella in public/render-references (es. "bathroom", "pergolas"). */
  folder: string;
  /** File vero. Quelli di forma finiscono per «-BN.webp». */
  filename: string;
  /**
   * Cosa il modello prende dalla foto (inglese). Se la foto è in bianco e nero
   * NON deve contenere colore né materiale: arrivano dal testo.
   */
  text: string;
  /**
   * Foto in bianco e nero (di forma)? Se manca lo dice il nome del file
   * («-BN.webp»). Serve per le foto vecchie, convertite prima di questa regola.
   */
  bn?: boolean;
}

export type PhotoTable = Record<string, PhotoEntry>;

export interface ReferenceCandidate {
  /** Più basso = più importante. A parità, vale l'ordine in cui sono state aggiunte. */
  priority: number;
  /** Ruolo per il modello, es. "SHOWER TYPE TARGET". */
  role: string;
  /** Valore dell'opzione scelta, es. "walk_in". */
  key: string;
  entry: PhotoEntry;
  /** Frase finale su cosa copiare; se manca ce n'è una di default (B/N o colori). */
  copy?: string;
}

export const BLACK_AND_WHITE_RULE =
  "the photo is deliberately black-and-white: colour, finish and material come from the written specification";
export const COLOUR_RULE = "the exact colour tone comes from the written specification";

export function isBlackAndWhite(entry: Pick<PhotoEntry, "filename" | "bn">): boolean {
  return entry.bn ?? /-BN\.webp$/i.test(entry.filename);
}

/** `RUOLO — chiave: testo. Cosa copiare`. Il prefisso «RUOLO — chiave» è quello che i test e i log leggono. */
export function buildReferenceLabel(c: ReferenceCandidate): string {
  const tail = c.copy ?? (isBlackAndWhite(c.entry)
    ? `Copy the shape and construction only — ${BLACK_AND_WHITE_RULE}`
    : `Copy the surface, pattern and scale; ${COLOUR_RULE}`);
  return `${c.role} — ${c.key}: ${c.entry.text}. ${tail}`;
}

/**
 * Le prime `max` candidate per priorità, senza la stessa foto due volte (vince la
 * più importante). Funzione pura: l'ordine delle candidate di pari priorità è
 * quello di ingresso.
 */
export function pickReferences(
  candidates: ReferenceCandidate[],
  max: number = MAX_SHARED_REFERENCES,
): SharedReferenceImage[] {
  if (max <= 0) return [];
  const seen = new Set<string>();
  const out: SharedReferenceImage[] = [];
  const ordered = candidates
    .map((c, i) => ({ c, i }))
    .sort((a, b) => a.c.priority - b.c.priority || a.i - b.i);
  for (const { c } of ordered) {
    const id = `${c.entry.folder}/${c.entry.filename}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(makeReferenceImage(c.entry.folder, c.entry.filename, buildReferenceLabel(c)));
    if (out.length >= max) break;
  }
  return out;
}

/** Tutti i percorsi «cartella/file» dichiarati dalle tabelle (senza doppioni): per i test sull'esistenza dei file. */
export function listReferencePaths(...tables: Array<Record<string, PhotoEntry | PhotoEntry[]>>): string[] {
  const out = new Set<string>();
  for (const table of tables) {
    for (const value of Object.values(table)) {
      for (const e of Array.isArray(value) ? value : [value]) out.add(`${e.folder}/${e.filename}`);
    }
  }
  return Array.from(out);
}
