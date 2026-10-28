import type { BozzaComputo } from "./editorNativo";

/** Cambiano solo le opzioni di stampa, mai i dati economici o le misurazioni. */
export function applicaVarianteComputo(bozza: BozzaComputo, formato: BozzaComputo["formatoPdf"]): BozzaComputo {
  const opzioni = {
    cliente: { mostraMisurePdf: false, mostraCodiciPdf: false, mostraFontiPdf: false, mostraPrezziUnitariPdf: true, mostraImportiPdf: true },
    tecnico: { mostraMisurePdf: true, mostraCodiciPdf: true, mostraFontiPdf: true, mostraPrezziUnitariPdf: true, mostraImportiPdf: true },
    "senza-prezzi": { mostraMisurePdf: true, mostraCodiciPdf: true, mostraFontiPdf: false, mostraPrezziUnitariPdf: false, mostraImportiPdf: false },
    riepilogo: { mostraMisurePdf: false, mostraCodiciPdf: false, mostraFontiPdf: false, mostraPrezziUnitariPdf: false, mostraImportiPdf: true },
  };
  return { ...bozza, formatoPdf: formato, ...opzioni[formato] };
}
