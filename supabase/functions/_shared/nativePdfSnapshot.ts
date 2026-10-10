/** Read old document snapshot keys without rewriting issued fiscal documents. */
export function nativePdfSnapshot(doc: Record<string, any>): Record<string, any> {
  return {
    ...doc,
    righe: (Array.isArray(doc.righe) ? doc.righe : []).map((r: Record<string, any>) => ({
      ...r,
      // Nullish fallback deliberately preserves a legitimate zero.
      totale_riga: r.totale_riga ?? r.totale,
      imposta: r.imposta ?? r.iva,
    })),
    riepilogo_iva: (Array.isArray(doc.riepilogo_iva) ? doc.riepilogo_iva : []).map((r: Record<string, any>) => ({
      ...r,
      aliquota: r.aliquota ?? r.aliquota_iva,
    })),
  };
}
