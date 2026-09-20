/**
 * BagniPDF — il PDF cliente del preventivo dei bagni.
 *
 * Dal 20/09/2026 l'impaginazione non sta più qui: gli otto moduli edili
 * consegnano lo stesso documento, il «Piano dei lavori» di
 * `@/components/preventivi/pdf/DocumentoEdilePDF`. Questo file dice solo che
 * cosa cambia per questo mestiere: le parole di copertina e i fatti
 * dell'intervento da mettere nella scheda.
 */
import * as React from "react";
import type { BgnPdfEnriched } from "@/hooks/useBagniPDF";
import { DocumentoEdilePDF } from "@/components/preventivi/pdf/DocumentoEdilePDF";
import { costruisciDatiEdile } from "@/components/preventivi/pdf/adattatoreEdile";
import { MODULI_EDILI } from "@/components/preventivi/pdf/moduliEdili";

const MODULO = MODULI_EDILI.bagni;

const virgola = (n: number) => String(n).replace(".", ",");

export function BagniPDF(props: BgnPdfEnriched) {
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
      { etichetta: "Bagni", valore: p.numero_bagni ? String(p.numero_bagni) : null },
      { etichetta: "Perimetro", valore: p.perimetro_ml ? `${virgola(p.perimetro_ml)} m` : null },
      { etichetta: "Altezza del rivestimento", valore: p.altezza_rivestimento_m ? `${virgola(p.altezza_rivestimento_m)} m` : null },
      { etichetta: "Bagno accessibile", valore: p.accessibile ? "Sì" : null },
    ],
  });
  return <DocumentoEdilePDF dati={dati} />;
}

export default BagniPDF;
