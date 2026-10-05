/**
 * Controlli riusabili sulle tabelle di foto di riferimento (shared/render-references/*).
 *
 * Una foto di FORMA è in bianco e nero («-BN.webp»): l'etichetta che il modello legge
 * deve descrivere solo la struttura, perché il colore e la finitura arrivano dal testo
 * del prompt. Se l'etichetta dicesse «lucida bianca» il modello avrebbe due fonti in
 * conflitto (la foto grigia e la parola «bianca») e il colore uscirebbe a caso.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { isBlackAndWhite, type PhotoEntry } from "../../../shared/render-references/referencePicker.ts";
import { thumbPath } from "../../../shared/render-references/thumbs.ts";

/** Colori e finiture che non devono comparire nel testo di una foto di forma (inglese: è la lingua dell'etichetta). */
const COLOUR_WORDS = [
  "white", "black", "grey", "gray", "green", "red", "blue", "beige", "brown", "yellow", "orange", "pink", "cream", "ivory",
  "gold", "golden", "silver", "bronze", "copper", "chrome", "anthracite", "charcoal", "terracotta", "teal", "turquoise",
  "matt", "matte", "glossy", "gloss", "polished", "brushed", "satin", "lacquered",
];
const COLOUR_RE = new RegExp(`\\b(${COLOUR_WORDS.join("|")})\\b`, "gi");

/** Parole di colore/finitura presenti in un testo (minuscole, senza doppioni). */
export function colourWordsIn(text: string): string[] {
  return Array.from(new Set((text.match(COLOUR_RE) ?? []).map((w) => w.toLowerCase())));
}

type Tabella = Record<string, PhotoEntry | PhotoEntry[]>;

function voci(tabelle: Tabella[]): Array<{ chiave: string; entry: PhotoEntry }> {
  const out: Array<{ chiave: string; entry: PhotoEntry }> = [];
  for (const t of tabelle) {
    for (const [chiave, valore] of Object.entries(t)) {
      for (const entry of Array.isArray(valore) ? valore : [valore]) out.push({ chiave, entry });
    }
  }
  return out;
}

/** Foto in bianco e nero il cui testo parla di colore o finitura: l'elenco deve essere vuoto. */
export function etichetteDiFormaConColore(...tabelle: Tabella[]): string[] {
  return voci(tabelle)
    .filter(({ entry }) => isBlackAndWhite(entry))
    .flatMap(({ chiave, entry }) => {
      const parole = colourWordsIn(entry.text);
      return parole.length ? [`${chiave} (${entry.filename}): ${parole.join(", ")}`] : [];
    });
}

/** Percorsi «cartella/file» dichiarati che non esistono in public/render-references: l'elenco deve essere vuoto. */
export function fileMancanti(...tabelle: Tabella[]): string[] {
  const radice = join(process.cwd(), "public", "render-references");
  return Array.from(new Set(voci(tabelle).map(({ entry }) => `${entry.folder}/${entry.filename}`))).filter((rel) => !existsSync(join(radice, rel)));
}

/** Foto dichiarate senza la miniatura per l'interfaccia: l'elenco deve essere vuoto. */
export function miniatureMancanti(...tabelle: Tabella[]): string[] {
  const radice = join(process.cwd(), "public", "render-references");
  return Array.from(new Set(voci(tabelle).map(({ entry }) => thumbPath(entry.folder, entry.filename)))).filter((rel) => !existsSync(join(radice, rel)));
}

/**
 * Scarto massimo tra i canali R, G, B su una versione 24×24 del file (0 = grigio puro).
 * Il WebP con perdita lascia un po' di rumore, non colore: sopra ~10 è una foto a colori.
 */
export async function scartoCromatico(relativePath: string): Promise<number> {
  const file = join(process.cwd(), "public", "render-references", relativePath);
  const { data } = await sharp(file).resize(24, 24, { fit: "fill" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let max = 0;
  for (let i = 0; i < data.length; i += 3) {
    max = Math.max(max, Math.abs(data[i] - data[i + 1]), Math.abs(data[i + 1] - data[i + 2]), Math.abs(data[i] - data[i + 2]));
  }
  return max;
}

const SOGLIA_GRIGIO = 10;

/**
 * Voci dichiarate di FORMA (bianco e nero) il cui file è invece a colori: il modello
 * riceverebbe un colore che l'etichetta dice di ignorare. L'elenco deve essere vuoto.
 */
export async function fotoBnADColori(...tabelle: Tabella[]): Promise<string[]> {
  const viste = new Set<string>();
  const out: string[] = [];
  for (const { chiave, entry } of voci(tabelle)) {
    const rel = `${entry.folder}/${entry.filename}`;
    if (!isBlackAndWhite(entry) || viste.has(rel) || !existsSync(join(process.cwd(), "public", "render-references", rel))) continue;
    viste.add(rel);
    const scarto = await scartoCromatico(rel);
    if (scarto > SOGLIA_GRIGIO) out.push(`${chiave}: ${rel} (scarto ${scarto})`);
  }
  return out;
}

/**
 * Voci dichiarate a COLORI il cui file è in scala di grigi: o la voce è di forma e manca
 * `bn: true` (l'etichetta direbbe di copiare superficie e colore da una foto grigia), o è
 * un materiale davvero neutro (cemento, ardesia) e va nell'elenco `ammesse`.
 */
export async function fotoColoriInGrigio(ammesse: string[], ...tabelle: Tabella[]): Promise<string[]> {
  const viste = new Set<string>();
  const out: string[] = [];
  for (const { chiave, entry } of voci(tabelle)) {
    const rel = `${entry.folder}/${entry.filename}`;
    if (isBlackAndWhite(entry) || viste.has(rel) || ammesse.includes(rel) || !existsSync(join(process.cwd(), "public", "render-references", rel))) continue;
    viste.add(rel);
    const scarto = await scartoCromatico(rel);
    if (scarto <= SOGLIA_GRIGIO) out.push(`${chiave}: ${rel} (scarto ${scarto})`);
  }
  return out;
}

