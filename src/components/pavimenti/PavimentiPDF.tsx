/**
 * PavimentiPDF — il PDF cliente del preventivo dei pavimenti.
 *
 * Dal 20/09/2026 l'impaginazione non sta più qui: gli otto moduli edili
 * consegnano lo stesso documento, il «Piano dei lavori» di
 * `@/components/preventivi/pdf/DocumentoEdilePDF`. Questo file dice solo che
 * cosa cambia per questo mestiere: le parole di copertina e i fatti
 * dell'intervento da mettere nella scheda.
 */
import * as React from "react";
import type { PavPdfEnriched } from "@/hooks/usePavimentiPDF";
import { DocumentoEdilePDF } from "@/components/preventivi/pdf/DocumentoEdilePDF";
import { costruisciDatiEdile } from "@/components/preventivi/pdf/adattatoreEdile";
import { MODULI_EDILI } from "@/components/preventivi/pdf/moduliEdili";

const MODULO = MODULI_EDILI.pavimenti;

export function PavimentiPDF(props: PavPdfEnriched) {
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
      { etichetta: "Materiale", valore: p.tipo_materiale },
      { etichetta: "Ambienti", valore: p.numero_ambienti ? String(p.numero_ambienti) : null },
    ],
  });
  return <DocumentoEdilePDF dati={dati} />;
}

export default PavimentiPDF;
