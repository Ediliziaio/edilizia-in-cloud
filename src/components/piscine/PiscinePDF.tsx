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
import { COSTRUZIONI_PISCINA, TIPI_PISCINA, parolaDelCodice } from "@/components/preventivi/pdf/paroleDeiCodici";

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
    // In una frase: «La tua piscina {tipo_piscina}» → «La tua piscina a skimmer».
    sostituzioniExtra: { tipo_piscina: (parolaDelCodice(p.tipo_piscina, TIPI_PISCINA) ?? "").toLowerCase() },
    schedaModulo: [
      { etichetta: "Tipo di piscina", valore: parolaDelCodice(p.tipo_piscina, TIPI_PISCINA) },
      { etichetta: "Costruzione", valore: parolaDelCodice(p.tipo_costruzione, COSTRUZIONI_PISCINA) },
    ],
  });
  return <DocumentoEdilePDF dati={dati} />;
}

export default PiscinePDF;
