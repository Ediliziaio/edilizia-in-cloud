/**
 * Link a scadenza per i file riservati.
 *
 * Alcuni contenitori nascono pubblici: chiunque conosca l'indirizzo apre il
 * file, senza essere loggato. Per foto di cantiere, firme e documenti dei
 * subappaltatori non va bene. Il passaggio a "privato" pero' spegnerebbe di
 * colpo tutti gli indirizzi gia' salvati nel database.
 *
 * Questo helper fa da ponte: prende l'indirizzo salvato (pubblico o percorso
 * nudo) e restituisce un link FIRMATO, valido per il tempo indicato. Funziona
 * sia mentre il contenitore e' ancora pubblico sia dopo la chiusura, quindi la
 * conversione si puo' fare senza finestre di disservizio.
 *
 * Vale anche per le immagini dei modelli PDF (sr-progetti, fv-progetti): nel
 * modello c'e' il percorso nudo, firmato quando serve. Il perche' sta in
 * supabase/functions/_shared/immaginiModelloPdf.ts.
 */

import { supabase } from "@/integrations/supabase/client";
import { BUCKET_IMMAGINI_MODELLO } from "../../../supabase/functions/_shared/immaginiModelloPdf";

/**
 * Foto e allegati dei progetti di bagni, tetti, elettrico, termoidraulico,
 * piscine, ristrutturazione, pavimenti e climatizzazione (StepMedia).
 *
 * Sono foto della casa del cliente, render e documenti del suo preventivo:
 * stanno in un contenitore privato e nel progetto c'e' il percorso nudo,
 * firmato quando serve (anteprima nello step, PDF). Prima finivano in
 * company-photo-library, pubblico: chiunque avesse l'indirizzo avrebbe aperto
 * il file, e il contenitore si poteva anche elencare. Un link firmato salvato
 * nel progetto sarebbe invece scaduto, e il PDF avrebbe perso le foto.
 */
export const BUCKET_MEDIA_PROGETTI = "progetti-media";

/** Contenitori che vanno letti con link firmato. */
export const BUCKET_RISERVATI = [
  "campo-rapportini",
  "campo-firme",
  "documenti-sub",
  ...BUCKET_IMMAGINI_MODELLO,
  BUCKET_MEDIA_PROGETTI,
] as const;

const ORE = 60 * 60;
/** Otto ore: copre una giornata di cantiere senza rigenerare a ogni tocco. */
export const SCADENZA_PREDEFINITA = 8 * ORE;

interface Riferimento { bucket: string; path: string }

/**
 * Riconosce bucket e percorso da un indirizzo salvato. Accetta:
 *   - https://<host>/storage/v1/object/public/<bucket>/<path>
 *   - https://<host>/storage/v1/object/sign/<bucket>/<path>?token=...
 *   - "<bucket>/<path>" (percorso nudo)
 */
export function riconosciFile(valore: string | null | undefined): Riferimento | null {
  const v = String(valore ?? "").trim();
  if (!v) return null;
  const m = v.match(/\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/(.+?)(?:\?|$)/);
  if (m) return { bucket: decodeURIComponent(m[1]), path: decodeURIComponent(m[2]) };
  if (!v.startsWith("http")) {
    const i = v.indexOf("/");
    if (i > 0) return { bucket: v.slice(0, i), path: v.slice(i + 1) };
  }
  return null;
}

/** Il percorso nudo da salvare per un file di un contenitore riservato. */
export function riferimentoFile(bucket: string, path: string): string {
  return `${bucket}/${path.replace(/^\/+/, "")}`;
}

/**
 * true per un percorso nudo "<bucket>/<path>" di un contenitore riservato. Non
 * e' un indirizzo: dato cosi' a un <img> il browser lo cercherebbe tra le
 * pagine dell'app. Va prima firmato.
 */
export function eRiferimentoNudo(valore: string | null | undefined): boolean {
  const v = String(valore ?? "").trim();
  if (!v || /^[a-z][a-z0-9+.-]*:/i.test(v)) return false;
  const rif = riconosciFile(v);
  return !!rif && (BUCKET_RISERVATI as readonly string[]).includes(rif.bucket);
}

/**
 * Link firmato per un file riservato. Se l'indirizzo non appartiene a un
 * contenitore riservato, o la firma non riesce, torna l'indirizzo di partenza:
 * mai una schermata rotta al posto di una foto.
 */
export async function linkFileRiservato(
  valore: string | null | undefined,
  scadenzaSecondi = SCADENZA_PREDEFINITA,
): Promise<string | null> {
  const v = String(valore ?? "").trim();
  if (!v) return null;
  const rif = riconosciFile(v);
  if (!rif || !(BUCKET_RISERVATI as readonly string[]).includes(rif.bucket)) return v;
  try {
    const { data, error } = await supabase.storage.from(rif.bucket).createSignedUrl(rif.path, scadenzaSecondi);
    if (error || !data?.signedUrl) return v;
    return data.signedUrl;
  } catch {
    return v;
  }
}

/** Come sopra ma per un elenco: una sola chiamata per contenitore. */
export async function linkFileRiservati(
  valori: (string | null | undefined)[],
  scadenzaSecondi = SCADENZA_PREDEFINITA,
): Promise<string[]> {
  const originali = valori.map((x) => String(x ?? "").trim()).filter(Boolean);
  if (originali.length === 0) return [];
  const perBucket = new Map<string, { path: string; indice: number }[]>();
  const esito: string[] = [...originali];

  originali.forEach((v, i) => {
    const rif = riconosciFile(v);
    if (!rif || !(BUCKET_RISERVATI as readonly string[]).includes(rif.bucket)) return;
    const lista = perBucket.get(rif.bucket) ?? [];
    lista.push({ path: rif.path, indice: i });
    perBucket.set(rif.bucket, lista);
  });

  await Promise.all([...perBucket.entries()].map(async ([bucket, voci]) => {
    try {
      const { data, error } = await supabase.storage.from(bucket).createSignedUrls(voci.map((x) => x.path), scadenzaSecondi);
      if (error || !data) return;
      data.forEach((r, k) => {
        if (r.signedUrl && voci[k]) esito[voci[k].indice] = r.signedUrl;
      });
    } catch { /* restano gli indirizzi di partenza */ }
  }));

  return esito;
}
