/**
 * Le foto dei prodotti del listino dentro il PDF del preventivo.
 *
 * Una riga del computo scelta dal listino prodotti porta con sé la foto (`immagine_url`:
 * un percorso dell'app o un link pubblico). Il PDF non può scaricarla da sé — react-pdf
 * non ha timeout e legge solo JPG e PNG — quindi prima del render ogni foto diventa
 * un'immagine incorporata, in miniatura. Una foto che non si carica esce di scena: il PDF
 * resta senza, mai con un riquadro rotto o un'attesa infinita.
 */
import { registraMemoria } from "@/lib/memorieDaSvuotare";
import { toDataUrl } from "@/lib/serramenti/pdfImageUtils";

/** Lato lungo massimo della miniatura nel PDF: la foto sta in una quarantina di punti. */
export const LATO_MINIATURA_PDF = 360;

/** Quante foto si caricano insieme: decine di righe non devono aprire decine di richieste. */
const IN_CONTEMPORANEA = 4;

/**
 * Le miniature già fatte, per indirizzo (07/11/2026). Il PDF vero a destra del wizard si rifà a ogni modifica:
 * senza questa memoria ogni giro riscaricava tutte le foto. Una foto che non si è caricata non si ricorda, così
 * al giro dopo si riprova. Tetto alle voci tenute, perché la memoria del browser non cresca senza fine.
 */
const MINIATURE = new Map<string, string>();
const MINIATURE_MAX = 300;

/** Per le prove: si riparte senza miniature in memoria. */
export function svuotaMiniatureVoci(): void { MINIATURE.clear(); }
registraMemoria(svuotaMiniatureVoci);

async function miniatura(url: string): Promise<string | null> {
  const giaFatta = MINIATURE.get(url);
  if (giaFatta) return giaFatta;
  const fatta = await toDataUrl(url, { latoMax: LATO_MINIATURA_PDF });
  if (fatta) {
    if (MINIATURE.size >= MINIATURE_MAX) MINIATURE.delete(MINIATURE.keys().next().value as string);
    MINIATURE.set(url, fatta);
  }
  return fatta;
}

export async function inlineImmaginiVoci<V extends { immagine_url?: string | null }>(voci: V[]): Promise<V[]> {
  const indirizzi = Array.from(new Set(voci.map((v) => v.immagine_url).filter((u): u is string => !!u)));
  if (indirizzi.length === 0) return voci;

  // La stessa foto su più righe (tre box doccia uguali) si carica una volta sola.
  const incorporate = new Map<string, string | null>();
  let prossimo = 0;
  const lavoratori = Array.from({ length: Math.min(IN_CONTEMPORANEA, indirizzi.length) }, async () => {
    while (prossimo < indirizzi.length) {
      const url = indirizzi[prossimo++];
      incorporate.set(url, await miniatura(url));
    }
  });
  await Promise.all(lavoratori);

  return voci.map((v) => (v.immagine_url ? { ...v, immagine_url: incorporate.get(v.immagine_url) ?? null } : v));
}
