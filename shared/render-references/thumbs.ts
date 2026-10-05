/**
 * Miniature a colori per l'interfaccia (320 px) delle foto di riferimento.
 *
 * Ogni file del motore ha la sua miniatura in public/render-references/thumbs/<cartella>/
 * con lo stesso nome, senza il suffisso «-BN» (le foto di forma esistono per il
 * motore in bianco e nero, ma l'interfaccia le mostra a colori: l'utente deve
 * riconoscere il prodotto, non solo la sagoma). La regola è garantita dal test
 * renderReferenceAssets.test.ts: aggiungere una foto senza la miniatura lo fa fallire.
 */
import { getRenderReferencesBaseUrl } from "./referenceUrl.ts";

export const THUMBS_FOLDER = "thumbs";

/** «Doccia-Walk-In-BN.webp» → «Doccia-Walk-In.webp»; un file a colori resta com'è. */
export function thumbFilename(filename: string): string {
  return filename.replace(/-BN(?=\.webp$)/i, "");
}

/** Percorso relativo alla radice delle reference: `thumbs/<cartella>/<file>`. */
export function thumbPath(folder: string, filename: string): string {
  return `${THUMBS_FOLDER}/${folder}/${thumbFilename(filename)}`;
}

/** URL della miniatura, pronto per un <img>. Stessa base URL delle foto del motore. */
export function referenceThumbUrl(folder: string, filename: string): string {
  const base = getRenderReferencesBaseUrl().replace(/\/+$/, "");
  return `${base}/${THUMBS_FOLDER}/${encodeURIComponent(folder)}/${encodeURIComponent(thumbFilename(filename))}`;
}
