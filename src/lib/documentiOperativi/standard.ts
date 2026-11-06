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
    titoloPdf: "RICHIESTA DI OFFERTA",
    destinatario: "SPETT.LE FORNITORE",
    destinazione: "LUOGO DI CONSEGNA",
    condizioni: "Come rispondere",
  },
  materiali: {
    titoloPdf: "ORDINE FORNITORE",
    destinatario: "FORNITORE",
    destinazione: "CONSEGNA A",
    condizioni: "Per una consegna senza intoppi",
  },
  servizi: {
    titoloPdf: "ORDINE DI SERVIZI E LAVORI",
    destinatario: "FORNITORE",
    destinazione: "LUOGO DEI LAVORI",
    condizioni: "Condizioni principali",
  },
  trasporti: {
    titoloPdf: "RAPPORTO TRASPORTI",
    destinatario: "COMMITTENTE",
    destinazione: "PERIODO",
    condizioni: "Conferma del rapporto",
  },
  economia: {
    titoloPdf: "RAPPORTO LAVORI IN ECONOMIA",
    destinatario: "COMMITTENTE",
    destinazione: "COMMESSA",
    condizioni: "Conferma delle quantità",
  },
};
export const DOCUMENTI_STANDARD_VERSIONE = "2026-11-06-modelli-impaginazione";
