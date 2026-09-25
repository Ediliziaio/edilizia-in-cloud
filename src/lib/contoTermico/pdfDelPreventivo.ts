/**
 * Dal preventivo termoidraulico col modello «conto-termico» ai dati del PDF
 * Conto Termico. Usato da useTermoidraulicoPDF: anteprima, download e firma
 * online passano tutti da qui, così il documento è sempre lo stesso.
 */
import type { ContoTermicoPdfData, FotoContoTermico } from "@/components/termoidraulico/contoTermico/ContoTermicoPDF";
import type { IdrPdfEnriched } from "@/hooks/useTermoidraulicoPDF";
import { raccontoDelPreventivo, usaModello } from "@/lib/termoidraulico/raccontoDelPreventivo";
import { economiaContoTermico, leggiDatiContoTermico } from "./dati";
import { FOTO_CONTO_TERMICO_DI_SERIE, FOTO_DOMANI_PER_TIPO } from "./anteprima";
import { PASSAGGI_CONTO_TERMICO } from "./testi";

export const MODELLO_CONTO_TERMICO = "conto-termico";

/** Il preventivo usa il modello Conto Termico? Si legge dal modello congelato. */
export function eContoTermico(e: Pick<IdrPdfEnriched, "progetto" | "template">): boolean {
  return usaModello(e, MODELLO_CONTO_TERMICO);
}

/** Le foto del documento, prima di essere incorporate: percorsi del sito. */
export function fotoDelPreventivo(tipo: ReturnType<typeof leggiDatiContoTermico>["tipo"]): Partial<Record<FotoContoTermico, string>> {
  return { ...FOTO_CONTO_TERMICO_DI_SERIE, domani: FOTO_DOMANI_PER_TIPO[tipo] ?? undefined };
}

export function datiPdfContoTermico(e: IdrPdfEnriched, foto: Partial<Record<FotoContoTermico, string | null>>): ContoTermicoPdfData {
  const dati = leggiDatiContoTermico((e.progetto as unknown as { conto_termico?: unknown }).conto_termico);
  const racconto = raccontoDelPreventivo(e);
  return {
    azienda: racconto.azienda,
    cliente: racconto.cliente,
    preventivo: racconto.preventivo,
    standard: racconto.standard,
    intervento: {
      tipo: dati.tipo,
      titolo: dati.titolo,
      impiantoAttuale: dati.impianto_attuale,
      voci: racconto.voci,
      caratteristiche: dati.caratteristiche,
    },
    economia: economiaContoTermico(dati, e.totali.totale, e.totali.ivaPct),
    testi: {
      titoloCopertina: racconto.testi.titoloCopertina,
      sottotitoloCopertina: racconto.testi.sottotitoloCopertina,
      faq: racconto.testi.faq,
      passaggi: racconto.testi.passaggi.length ? racconto.testi.passaggi : PASSAGGI_CONTO_TERMICO,
    },
    foto,
    colorePrimario: racconto.colorePrimario,
  };
}
