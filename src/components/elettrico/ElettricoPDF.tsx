/**
 * ElettricoPDF — il PDF cliente del preventivo dell'impianto elettrico.
 *
 * Dal 20/09/2026 l'impaginazione non sta più qui: gli otto moduli edili
 * consegnano lo stesso documento, il «Piano dei lavori» di
 * `@/components/preventivi/pdf/DocumentoEdilePDF`. Questo file dice solo che
 * cosa cambia per questo mestiere: le parole di copertina e i fatti
 * dell'intervento da mettere nella scheda.
 */
import * as React from "react";
import type { ElePdfEnriched } from "@/hooks/useElettricoPDF";
import { DocumentoEdilePDF } from "@/components/preventivi/pdf/DocumentoEdilePDF";
import { costruisciDatiEdile } from "@/components/preventivi/pdf/adattatoreEdile";
import { MODULI_EDILI } from "@/components/preventivi/pdf/moduliEdili";

const MODULO = MODULI_EDILI.elettrico;

export function ElettricoPDF(props: ElePdfEnriched) {
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
    sostituzioniExtra: { superficie_mq: p.immobile_superficie_mq != null ? String(p.immobile_superficie_mq) : "—" },
    schedaModulo: [
      { etichetta: "Livello dell'impianto", valore: p.livello_impianto },
      { etichetta: "Punti", valore: p.numero_punti ? String(p.numero_punti) : null },
    ],
  });
  return <DocumentoEdilePDF dati={dati} />;
}

export default ElettricoPDF;
