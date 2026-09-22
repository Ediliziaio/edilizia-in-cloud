/**
 * ClimatizzazionePDF — il PDF cliente del preventivo della climatizzazione.
 *
 * Dal 20/09/2026 l'impaginazione non sta più qui: gli otto moduli edili
 * consegnano lo stesso documento, il «Piano dei lavori» di
 * `@/components/preventivi/pdf/DocumentoEdilePDF`. Questo file dice solo che
 * cosa cambia per questo mestiere: le parole di copertina e i fatti
 * dell'intervento da mettere nella scheda.
 */
import * as React from "react";
import type { ClmPdfEnriched } from "@/hooks/useClimatizzazionePDF";
import { DocumentoEdilePDF } from "@/components/preventivi/pdf/DocumentoEdilePDF";
import { costruisciDatiEdile } from "@/components/preventivi/pdf/adattatoreEdile";
import { MODULI_EDILI } from "@/components/preventivi/pdf/moduliEdili";
import { TIPOLOGIE_CLIMA, parolaDelCodice } from "@/components/preventivi/pdf/paroleDeiCodici";

const MODULO = MODULI_EDILI.climatizzazione;

export function ClimatizzazionePDF(props: ClmPdfEnriched) {
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
      { etichetta: "Tipologia di impianto", valore: parolaDelCodice(p.tipologia_impianto, TIPOLOGIE_CLIMA) },
      { etichetta: "Unità interne", valore: p.numero_unita_interne ? String(p.numero_unita_interne) : null },
    ],
  });
  return <DocumentoEdilePDF dati={dati} />;
}

export default ClimatizzazionePDF;
