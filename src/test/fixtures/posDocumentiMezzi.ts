import {
  normalizzaDocumentoMezzo,
  normalizzaControlliMezzo,
  normalizzaDocumentazioneMezzo,
} from "../../../supabase/functions/_shared/posDocumentiMezzi";
export const idMezzoPos = "11111111-1111-4111-8111-111111111111";
export const documentoMezzoProva = () =>
  normalizzaDocumentoMezzo({
    id: "22222222-2222-4222-8222-222222222222",
    mezzo_id: idMezzoPos,
    categoria: "manuale_ce",
    titolo: "TEST Manuale",
    data_inizio: "2026-11-01",
    data_scadenza: "2026-11-30",
    file_name: "test-manuale.pdf",
    disponibile: true,
    impronta: "a".repeat(64),
    revisione_dichiarata: "TEST-1",
    confermata: true,
  });
export const controlliMezzoProva = () =>
  normalizzaControlliMezzo({
    mezzo_id: idMezzoPos,
    manutenzioni: [
      {
        id: "33333333-3333-4333-8333-333333333333",
        tipo: "verifica",
        data: "2026-10-01",
        contatore: "10.5000",
        prossima_data: "2026-12-01",
        prossimo_contatore: "100.0000",
      },
    ],
    segnalazioni: [],
    impronta: "b".repeat(64),
  });
export const documentazioneMezzoProva = () =>
  normalizzaDocumentazioneMezzo({
    modalita: "documenti",
    documenti: [documentoMezzoProva()],
    controlli: controlliMezzoProva(),
    riesame_controlli: "TEST riesame sintetico, nessuna attestazione reale",
    confermata: true,
  });
