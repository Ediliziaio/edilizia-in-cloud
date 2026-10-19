/** Tipi che nascono senza numero nel motore nativo (documento_crea). */
export const TIPI_BOZZA_SENZA_NUMERO = [
  "fattura", "fattura_pa", "nota_credito", "nota_debito", "autofattura", "fattura_riepilogativa",
];

export const haSegnapostoBozza = (numero?: string | null) => (numero ?? "").startsWith("Bozza ");

interface DocumentoInEmissione {
  tipo?: string | null;
  stato?: string | null;
  numero?: string | null;
}

export function emissioneConDataOdierna(doc: DocumentoInEmissione) {
  return doc.stato === "bozza" && TIPI_BOZZA_SENZA_NUMERO.includes(doc.tipo ?? "") && haSegnapostoBozza(doc.numero);
}

export function avvisoEmissione(doc: DocumentoInEmissione) {
  return emissioneConDataOdierna(doc)
    ? "La data di emissione sarà aggiornata a oggi (ora italiana) e il numero definitivo (progressivo) sarà assegnato adesso. Scadenze e importi restano invariati. L'invio allo SDI è il passaggio successivo."
    : "Il numero e la data già presenti saranno mantenuti e verificati. L'invio allo SDI è il passaggio successivo.";
}
