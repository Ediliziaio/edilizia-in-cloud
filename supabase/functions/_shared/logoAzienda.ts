/**
 * Il logo dell'azienda come riserva (24/09/2026).
 *
 * Il logo si carica in un posto solo (Impostazioni → Branding o Profilo
 * aziendale → companies.logo_url), ma email e PDF lo leggevano ognuno da un
 * campo suo, senza ripiego: le preferenze email (vuote per tutte e 21 le
 * aziende), il modello PDF del fotovoltaico (nessuna azienda vera l'ha mai
 * aperto: al posto del logo usciva ☀), l'anagrafica per SAL, giornale lavori e
 * fatture. Il campo del documento vince ancora — chi ha messo un logo diverso
 * nel modello lo ritrova — ma se è vuoto vale quello aziendale.
 *
 * Niente import esterni: lo usano sia le funzioni sia i test.
 */

const pulito = (valore: string | null | undefined): string | null =>
  typeof valore === "string" && valore.trim() ? valore.trim() : null;

/** Il logo da usare: quello del documento se c'è, altrimenti quello aziendale. */
export function logoDiRiserva(
  specifico: string | null | undefined,
  aziendale: string | null | undefined,
): string | null {
  return pulito(specifico) ?? pulito(aziendale);
}

/**
 * PNG o JPEG dai primi byte. L'estensione non basta: il logo aziendale finisce
 * con `?t=…` per scavalcare la cache. Altri formati (WebP, SVG) pdf-lib non li
 * incorpora.
 */
export function formatoImmagine(byte: Uint8Array): "png" | "jpg" | null {
  if (byte.length >= 8 && byte[0] === 0x89 && byte[1] === 0x50 && byte[2] === 0x4e && byte[3] === 0x47) return "png";
  if (byte.length >= 3 && byte[0] === 0xff && byte[1] === 0xd8 && byte[2] === 0xff) return "jpg";
  return null;
}

/**
 * I byte del logo per un PDF costruito con pdf-lib.
 *
 * Un percorso si legge dai bucket dei modelli, come prima. Un indirizzo — il
 * logo aziendale sta nel bucket pubblico company-logos — si scarica solo se è
 * dello storage pubblico di questo progetto: l'indirizzo lo scrive l'azienda,
 * e la funzione non deve andare a prendere pagine altrui. Prima anche
 * l'indirizzo veniva cercato come percorso nei bucket, e il logo non c'era.
 */
export async function leggiLogo(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseAdmin: any,
  logo: string,
  opzioni: { supabaseUrl: string; bucket: string[]; scarica?: typeof fetch },
): Promise<Uint8Array | null> {
  if (/^https?:\/\//i.test(logo)) {
    const pubblico = `${opzioni.supabaseUrl.replace(/\/+$/, "")}/storage/v1/object/public/`;
    if (!opzioni.supabaseUrl || !logo.startsWith(pubblico)) return null;
    const risposta = await (opzioni.scarica ?? fetch)(logo);
    if (!risposta.ok) return null;
    return new Uint8Array(await risposta.arrayBuffer());
  }

  const risultati = await Promise.all(
    opzioni.bucket.map((bucket) =>
      supabaseAdmin.storage.from(bucket).download(logo).catch((): { data: Blob | null } => ({ data: null }))
    ),
  );
  const file = risultati.find((r: { data: Blob | null } | null) => r?.data)?.data as Blob | undefined;
  return file ? new Uint8Array(await file.arrayBuffer()) : null;
}
