/**
 * Dal preventivo termoidraulico col modello «full-electric» ai dati del PDF
 * Casa Full Electric. Usato da useTermoidraulicoPDF: anteprima, download e firma
 * online passano tutti da qui.
 */
import type { FotoFullElectric, FullElectricPdfData } from "@/components/termoidraulico/fullElectric/FullElectricPDF";
import type { IdrPdfEnriched } from "@/hooks/useTermoidraulicoPDF";
import { raccontoDelPreventivo, usaModello } from "@/lib/termoidraulico/raccontoDelPreventivo";
import { economiaFullElectric, leggiDatiFullElectric, type PezzoFullElectric } from "./dati";
import { FOTO_FULL_ELECTRIC_DI_SERIE, FOTO_PEZZI_FULL_ELECTRIC } from "./anteprima";
import { PASSAGGI_FULL_ELECTRIC } from "./testi";

export const MODELLO_FULL_ELECTRIC = "full-electric";

export function eFullElectric(e: Pick<IdrPdfEnriched, "progetto" | "template">): boolean {
  return usaModello(e, MODELLO_FULL_ELECTRIC);
}

/** Le foto del documento, prima di essere incorporate: di serie più quelle dei pezzi scelti. */
export function fotoFullElectric(componenti: PezzoFullElectric[]): Partial<Record<FotoFullElectric, string>> {
  const pezzi = Object.fromEntries(componenti.map((c) => [c.tipo, FOTO_PEZZI_FULL_ELECTRIC[c.tipo] ?? undefined]).filter(([, url]) => url));
  return { ...FOTO_FULL_ELECTRIC_DI_SERIE, ...pezzi };
}

export function datiPdfFullElectric(e: IdrPdfEnriched, foto: Partial<Record<FotoFullElectric, string | null>>): FullElectricPdfData {
  const dati = leggiDatiFullElectric((e.progetto as unknown as { full_electric?: unknown }).full_electric);
  const racconto = raccontoDelPreventivo(e);
  return {
    azienda: racconto.azienda,
    cliente: racconto.cliente,
    preventivo: racconto.preventivo,
    standard: racconto.standard,
    sistema: {
      componenti: dati.componenti,
      impiantoAttuale: dati.impianto_attuale,
      voci: racconto.voci,
      caratteristiche: dati.caratteristiche,
    },
    economia: economiaFullElectric(dati, e.totali.totale, e.totali.ivaPct),
    testi: {
      titoloCopertina: racconto.testi.titoloCopertina,
      sottotitoloCopertina: racconto.testi.sottotitoloCopertina,
      faq: racconto.testi.faq,
      passaggi: racconto.testi.passaggi.length ? racconto.testi.passaggi : PASSAGGI_FULL_ELECTRIC,
    },
    foto,
    colorePrimario: racconto.colorePrimario,
  };
}
