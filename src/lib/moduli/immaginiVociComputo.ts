/**
 * Le foto dei prodotti del listino dentro il PDF del preventivo.
 *
 * Una riga del computo scelta dal listino prodotti porta con sé la foto (`immagine_url`:
 * un percorso dell'app o un link pubblico). Il PDF non può scaricarla da sé — react-pdf
 * non ha timeout e legge solo JPG e PNG — quindi prima del render ogni foto diventa
 * un'immagine incorporata, in miniatura. Una foto che non si carica esce di scena: il PDF
 * resta senza, mai con un riquadro rotto o un'attesa infinita.
 */
import { toDataUrl } from "@/lib/serramenti/pdfImageUtils";

/** Lato lungo massimo della miniatura nel PDF: la foto sta in una quarantina di punti. */
export const LATO_MINIATURA_PDF = 360;

/** Quante foto si caricano insieme: decine di righe non devono aprire decine di richieste. */
const IN_CONTEMPORANEA = 4;

export async function inlineImmaginiVoci<V extends { immagine_url?: string | null }>(voci: V[]): Promise<V[]> {
  const indirizzi = Array.from(new Set(voci.map((v) => v.immagine_url).filter((u): u is string => !!u)));
  if (indirizzi.length === 0) return voci;

  // La stessa foto su più righe (tre box doccia uguali) si carica una volta sola.
  const incorporate = new Map<string, string | null>();
  let prossimo = 0;
  const lavoratori = Array.from({ length: Math.min(IN_CONTEMPORANEA, indirizzi.length) }, async () => {
    while (prossimo < indirizzi.length) {
      const url = indirizzi[prossimo++];
      incorporate.set(url, await toDataUrl(url, { latoMax: LATO_MINIATURA_PDF }));
    }
  });
  await Promise.all(lavoratori);

  return voci.map((v) => (v.immagine_url ? { ...v, immagine_url: incorporate.get(v.immagine_url) ?? null } : v));
}
