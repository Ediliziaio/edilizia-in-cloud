/**
 * RistrutturazionePDF — il PDF cliente del preventivo Ristrutturazione.
 *
 * Dal 20/09/2026 l'impaginazione non sta più qui: gli otto moduli edili
 * consegnano lo stesso documento, il «Piano dei lavori» di
 * `@/components/preventivi/pdf/DocumentoEdilePDF`. Questo file dice solo che
 * cosa cambia per le ristrutturazioni: le parole di copertina e i fatti
 * dell'intervento da mettere nella scheda.
 */
import * as React from "react";
import type { RstPdfEnriched } from "@/hooks/useRistrutturazionePDF";
import { DocumentoEdilePDF } from "@/components/preventivi/pdf/DocumentoEdilePDF";
import { costruisciDatiEdile } from "@/components/preventivi/pdf/adattatoreEdile";
import { MODULI_EDILI } from "@/components/preventivi/pdf/moduliEdili";

const MODULO = MODULI_EDILI.ristrutturazione;

export function RistrutturazionePDF(props: RstPdfEnriched) {
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
      { etichetta: "Vani", valore: p.numero_vani ? String(p.numero_vani) : null },
      { etichetta: "Altezza media", valore: p.altezza_media_m ? `${String(p.altezza_media_m).replace(".", ",")} m` : null },
    ],
  });
  return <DocumentoEdilePDF dati={dati} />;
}

export default RistrutturazionePDF;
