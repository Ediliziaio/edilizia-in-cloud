/**
 * PiscinePDF — il PDF cliente del preventivo delle piscine.
 *
 * Dal 20/09/2026 l'impaginazione non sta più qui: gli otto moduli edili
 * consegnano lo stesso documento, il «Piano dei lavori» di
 * `@/components/preventivi/pdf/DocumentoEdilePDF`. Questo file dice solo che
 * cosa cambia per questo mestiere: le parole di copertina e i fatti
 * dell'intervento da mettere nella scheda.
 */
import * as React from "react";
import type { PisPdfEnriched } from "@/hooks/usePiscinePDF";
import { DocumentoEdilePDF } from "@/components/preventivi/pdf/DocumentoEdilePDF";
import { costruisciDatiEdile } from "@/components/preventivi/pdf/adattatoreEdile";
import { MODULI_EDILI } from "@/components/preventivi/pdf/moduliEdili";

const MODULO = MODULI_EDILI.piscine;

export function PiscinePDF(props: PisPdfEnriched) {
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
    sostituzioniExtra: { tipo_piscina: (p.tipo_piscina ?? "").trim() },
    schedaModulo: [
      { etichetta: "Tipo di piscina", valore: p.tipo_piscina },
      { etichetta: "Costruzione", valore: p.tipo_costruzione },
    ],
  });
  return <DocumentoEdilePDF dati={dati} />;
}

export default PiscinePDF;
