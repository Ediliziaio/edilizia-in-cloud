/**
 * Foto del giornale dei lavori: dove stanno e come si leggono.
 *
 * Il bucket `giornale-foto` non è mai esistito: ogni foto del giornale falliva in
 * silenzio (0 righe in `giornale_foto` al 07/11/2026). Ora stanno nel bucket
 * PRIVATO `foto-cantiere`, lo stesso delle foto di campo, con le sue policy:
 * caricabile se la prima cartella è l'azienda e la seconda la commessa
 * (`campo_file_cantiere_caricabile`), leggibile/cancellabile con
 * `campo_file_cantiere_visibile`. Nessun bucket nuovo, nessuna policy nuova.
 *
 * In `giornale_foto`:
 *   - `storage_path` = `<azienda>/<commessa>/giornale/<uuid>.jpg` (il percorso nel bucket)
 *   - `url`          = `foto-cantiere/<storage_path>`, il «percorso nudo» che il resto
 *     dell'app già sa firmare (src/lib/storage/fileRiservati.ts). Mai un URL pubblico:
 *     il bucket è privato e un URL firmato salvato scadrebbe.
 *
 * Modulo puro (niente Deno, niente browser): lo usano il frontend e l'edge
 * `generate-giornale-pdf`, ognuno con il proprio client per firmare.
 */

export const BUCKET_FOTO_GIORNALE = "foto-cantiere";

/** Percorso nel bucket: le prime due cartelle sono quelle che la policy di caricamento controlla. */
export function percorsoFotoGiornale(companyId: string, orderId: string, nomeFile: string): string {
  return `${companyId}/${orderId}/giornale/${nomeFile}`;
}

/** Il valore da salvare in `giornale_foto.url`. */
export function urlSalvatoFotoGiornale(storagePath: string): string {
  return `${BUCKET_FOTO_GIORNALE}/${storagePath.replace(/^\/+/, "")}`;
}

export interface RigaFotoGiornale {
  url?: string | null;
  storage_path?: string | null;
}

/**
 * Come leggere una riga:
 *   - `diretto`: un indirizzo http già salvato (righe vecchie, se mai ce ne fossero)
 *   - `firma`:   il percorso in `foto-cantiere` da firmare
 *   - null:      niente di leggibile
 */
export function comeLeggereFotoGiornale(riga: RigaFotoGiornale):
  | { tipo: "diretto"; url: string }
  | { tipo: "firma"; path: string }
  | null {
  const url = String(riga.url ?? "").trim();
  if (/^https?:\/\//i.test(url)) return { tipo: "diretto", url };
  const path = String(riga.storage_path ?? "").trim().replace(/^\/+/, "");
  if (path) return { tipo: "firma", path };
  const prefisso = `${BUCKET_FOTO_GIORNALE}/`;
  if (url.startsWith(prefisso) && url.length > prefisso.length) return { tipo: "firma", path: url.slice(prefisso.length) };
  return null;
}

/** Firma in blocco: una sola chiamata per tutte le foto; restituisce un URL per path (null se non firmato). */
export type FirmaInBlocco = (paths: string[]) => Promise<(string | null)[]>;

/**
 * Un indirizzo leggibile per ogni riga, nello stesso ordine; "" dove non c'è
 * (firma rifiutata, riga vuota): chi mostra le foto salta le vuote invece di
 * disegnare un'immagine rotta.
 */
export async function indirizziFotoGiornale(righe: RigaFotoGiornale[], firma: FirmaInBlocco): Promise<string[]> {
  const modi = righe.map(comeLeggereFotoGiornale);
  const daFirmare = [...new Set(modi.flatMap((m) => (m?.tipo === "firma" ? [m.path] : [])))];
  const firmati = new Map<string, string>();
  if (daFirmare.length) {
    try {
      const link = await firma(daFirmare);
      daFirmare.forEach((p, i) => { if (link[i]) firmati.set(p, link[i] as string); });
    } catch { /* restano vuote: meglio nessuna foto che una rotta */ }
  }
  return modi.map((m) => (!m ? "" : m.tipo === "diretto" ? m.url : firmati.get(m.path) ?? ""));
}
