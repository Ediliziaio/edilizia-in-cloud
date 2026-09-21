/**
 * Le foto dei blocchi del preventivo, pronte per il PDF (documento edile e
 * Serramenti).
 *
 * Il motore PDF scarica le immagini senza un tempo massimo e legge solo JPG e
 * PNG: ogni foto passa da `toDataUrl`, e si caricano solo quelle dei blocchi che
 * escono, al massimo due per blocco. Una foto che non arriva lascia il blocco
 * senza quella foto, non il documento senza blocco.
 */
import { toDataUrl } from "@/lib/serramenti/pdfImageUtils";
import {
  bloccoDellaPagina, eFotoDiSerie, leggiBlocco, type ChiaveBlocco, type SettoreBlocchi,
} from "../../../supabase/functions/_shared/blocchiPreventivo";

export interface FotoBloccoPronta {
  src: string;
  /** Foto della libreria: sotto, il PDF scrive «Immagini indicative». */
  diSerie: boolean;
}

/** Le foto di serie sono indirizzi del sito («/pdf-stock/…»): si completano con l'origine della pagina. */
export const conOrigine = (url: string): string => {
  const origine = (globalThis as { location?: { origin?: string } }).location?.origin;
  return url.startsWith("/") && origine ? `${origine}${url}` : url;
};

/** Per ogni blocco indicato, le sue foto già convertite: { [blocco]: foto }. */
export async function fotoDeiBlocchi(
  settore: SettoreBlocchi,
  salvati: unknown,
  chiavi: ChiaveBlocco[],
): Promise<Record<string, FotoBloccoPronta[]>> {
  const coppie = await Promise.all(chiavi.map(async (chiave) => {
    const indirizzi = leggiBlocco(chiave, settore, salvati).foto.slice(0, 2);
    const pronte = await Promise.all(indirizzi.map(async (u) => ({ src: await toDataUrl(conOrigine(u)), diSerie: eFotoDiSerie(u) })));
    return [chiave, pronte.filter((f): f is FotoBloccoPronta => Boolean(f.src))] as const;
  }));
  return Object.fromEntries(coppie);
}

/**
 * Le foto di un blocco per il PDF: quelle convertite da `fotoDeiBlocchi` se ci
 * sono (una che non si è caricata non c'è), altrimenti gli indirizzi completi
 * dell'origine (un'azienda senza modello salvato, le anteprime di prova).
 */
export function fotoPerIlPdf(pronte: unknown, chiave: ChiaveBlocco, indirizzi: string[]): FotoBloccoPronta[] {
  if (pronte && typeof pronte === "object") {
    const lista = (pronte as Record<string, unknown>)[chiave];
    return (Array.isArray(lista) ? (lista as Array<{ src?: unknown; diSerie?: unknown }>) : [])
      .filter((f) => typeof f?.src === "string" && f.src)
      .map((f) => ({ src: String(f.src), diSerie: f.diSerie === true }));
  }
  return indirizzi.map((src) => ({ src: conOrigine(src), diSerie: eFotoDiSerie(src) }));
}

/** I blocchi accesi in un ordine di pagine (Serramenti, Fotovoltaico). */
export function blocchiAccesi(pagine: ReadonlyArray<{ id: string; visible: boolean }>): ChiaveBlocco[] {
  return pagine
    .filter((p) => p.visible)
    .map((p) => bloccoDellaPagina(p.id))
    .filter((c): c is ChiaveBlocco => c !== null);
}
