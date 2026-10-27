import type { DocEdileDati } from "./documentoEdileTipi";

/** Importi incoerenti non diventano documenti da inviare o firmare. */
export function validaPreventivo(dati: DocEdileDati): void {
  const t = dati.totali;
  if (![t.imponibile, t.iva, t.totale, t.scontoEur].every(Number.isFinite) || t.totale < 0 || t.imponibile < 0 || t.iva < 0) {
    throw new Error("Importi del preventivo non validi. Verifica il calcolo prima di generare il PDF.");
  }
  if (Math.abs(t.imponibile + t.iva - t.totale) > 0.03) {
    throw new Error("Imponibile, IVA e totale non coincidono. Ricalcola il preventivo.");
  }
  if (dati.capitoli.some(c => c.voci.some(v => !Number.isFinite(v.quantita) || !Number.isFinite(v.importo)))) {
    throw new Error("Una voce del preventivo contiene quantità o importi non validi.");
  }
}
