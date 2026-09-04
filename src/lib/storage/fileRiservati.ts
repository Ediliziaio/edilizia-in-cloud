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
 */

import { supabase } from "@/integrations/supabase/client";

/** Contenitori che vanno letti con link firmato. */
export const BUCKET_RISERVATI = ["campo-rapportini", "campo-firme", "documenti-sub"] as const;

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
