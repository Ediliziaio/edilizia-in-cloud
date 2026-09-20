/**
 * TettiPDF — il PDF cliente del preventivo dei tetti.
 *
 * Dal 20/09/2026 l'impaginazione non sta più qui: gli otto moduli edili
 * consegnano lo stesso documento, il «Piano dei lavori» di
 * `@/components/preventivi/pdf/DocumentoEdilePDF`. Questo file dice solo che
 * cosa cambia per questo mestiere: le parole di copertina e i fatti
 * dell'intervento da mettere nella scheda.
 */
import * as React from "react";
import type { TetPdfEnriched } from "@/hooks/useTettiPDF";
import { DocumentoEdilePDF } from "@/components/preventivi/pdf/DocumentoEdilePDF";
import { costruisciDatiEdile } from "@/components/preventivi/pdf/adattatoreEdile";
import { MODULI_EDILI } from "@/components/preventivi/pdf/moduliEdili";

const MODULO = MODULI_EDILI.tetti;

const virgola = (n: number) => String(n).replace(".", ",");

export function TettiPDF(props: TetPdfEnriched) {
  const { progetto: p, template, company, capitoli, totali, media, computoOptions } = props;
  const dati = costruisciDatiEdile({
    modulo: MODULO,
    progetto: p,
    template: template as unknown as Record<string, unknown>,
    azienda: company,
    capitoli,
    totali,
    media,
    opzioniComputo: computoOptions,
    schedaModulo: [
      { etichetta: "Falde", valore: p.numero_falde ? String(p.numero_falde) : null },
      { etichetta: "Superficie in pianta", valore: p.superficie_pianta_mq ? `${virgola(p.superficie_pianta_mq)} mq` : null },
      { etichetta: "Pendenza", valore: p.pendenza_pct ? `${virgola(p.pendenza_pct)}%` : null },
      { etichetta: "Perimetro", valore: p.perimetro_ml ? `${virgola(p.perimetro_ml)} m` : null },
      { etichetta: "Amianto", valore: p.amianto ? "Presente" : null },
    ],
  });
  return <DocumentoEdilePDF dati={dati} />;
}

export default TettiPDF;
