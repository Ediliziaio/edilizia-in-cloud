/**
 * Il PDF vero di un preventivatore edile, a destra del wizard (07/11/2026).
 *
 * Mette insieme quello che usa «Scarica PDF» nel passo PDF — modello del preventivo (o la sua copia congelata),
 * azienda, computo, foto, opzioni del computo — e lo passa alla funzione del modulo che disegna il PDF
 * (`renderBgnPreviewBlobUrl`, `renderRstPreviewBlobUrl`…). Così a destra c'è lo stesso documento che si scarica.
 */
import { useCallback, useMemo } from "react";
import { readPdfPreviewBlob, revokePdfPreviewUrl } from "@/lib/pdfPreviewSource";
import { opzioniEffettive, useAziendaDelPdf, type OpzioniPdfComputo } from "@/lib/preventivatore/datiPdfEdile";
import { AnteprimaPdfVero } from "./AnteprimaPdfVero";

/** La funzione del modulo che fa il PDF (quella del bottone «Anteprima PDF»): restituisce un blob URL. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DisegnaPdfEdile = (payload: any) => Promise<string>;

interface Props {
  progetto: { company_id?: string | null; modello_snapshot?: unknown } & Record<string, unknown>;
  computo: unknown[];
  media: unknown[];
  /**
   * Il modello PDF dell'azienda per questo modulo. Se il preventivo ne ha una copia congelata
   * (`modello_snapshot`) vale quella: la sceglie la funzione del modulo, come per «Scarica».
   */
  templateAzienda: unknown;
  opzioni: OpzioniPdfComputo;
  disegna: DisegnaPdfEdile;
  attivo: boolean;
}

/** I campi che cambiano a ogni salvataggio senza cambiare il documento: non rifanno il PDF. */
const SENZA_TIMBRI = (p: Record<string, unknown>) => {
  const { updated_at: _u, ...resto } = p;
  return resto;
};

export function PdfVeroEdile({ progetto, computo, media, templateAzienda, opzioni, disegna, attivo }: Props) {
  const azienda = useAziendaDelPdf(progetto.company_id);
  const company = azienda.data;
  const template = templateAzienda ?? null;
  const pdfOptions = useMemo(() => opzioniEffettive(opzioni), [opzioni]);
  const payload = useMemo(
    () => ({ progetto, computo, media, template, company: company ?? null, pdfOptions }),
    [progetto, computo, media, template, company, pdfOptions],
  );
  const chiave = useMemo(
    () => JSON.stringify([SENZA_TIMBRI(progetto), computo, media, template, company ?? null, pdfOptions]),
    [progetto, computo, media, template, company, pdfOptions],
  );
  const genera = useCallback(async () => {
    const url = await disegna(payload);
    try {
      return await readPdfPreviewBlob(url);
    } finally {
      revokePdfPreviewUrl(url);
    }
  }, [disegna, payload]);
  // L'azienda arriva subito dopo l'apertura: si aspetta, per non fare un primo PDF con l'intestazione vuota.
  return <AnteprimaPdfVero genera={genera} chiave={chiave} attivo={attivo && !azienda.isLoading} />;
}

export default PdfVeroEdile;
