import type { TipoDocumentoOperativo } from "./modello";

/** Basi dei cinque documenti operativi. Le personalizzazioni per azienda sono gestite in Modelli PDF. */
export const STANDARD_DOCUMENTI: Record<
  TipoDocumentoOperativo,
  {
    titoloPdf: string;
    destinatario: string;
    destinazione: string;
    condizioni: string;
  }
> = {
  richiesta: {
    titoloPdf: "Richiesta di offerta",
    destinatario: "SPETT.LE FORNITORE",
    destinazione: "LUOGO DI CONSEGNA",
    condizioni: "Come rispondere",
  },
  materiali: {
    titoloPdf: "Ordine fornitore",
    destinatario: "FORNITORE",
    destinazione: "CONSEGNA A",
    condizioni: "Per una consegna senza intoppi",
  },
  servizi: {
    titoloPdf: "Ordine di servizi e lavori",
    destinatario: "FORNITORE",
    destinazione: "LUOGO DEI LAVORI",
    condizioni: "Condizioni principali",
  },
  trasporti: {
    titoloPdf: "Rapporto trasporti",
    // Il rapporto va a chi ha fatto i viaggi, che lo conferma e poi fattura: è il trasportatore (10/11/2026).
    destinatario: "TRASPORTATORE",
    destinazione: "PERIODO",
    condizioni: "Conferma del rapporto",
  },
  economia: {
    titoloPdf: "Rapporto lavori in economia",
    destinatario: "COMMITTENTE",
    destinazione: "COMMESSA",
    condizioni: "Conferma delle quantità",
  },
};
// I titoli come gli altri documenti dello stile unico (10/11/2026): «Ordine fornitore», non tutto maiuscolo.
export const DOCUMENTI_STANDARD_VERSIONE = "2026-11-10-stile-unico";
