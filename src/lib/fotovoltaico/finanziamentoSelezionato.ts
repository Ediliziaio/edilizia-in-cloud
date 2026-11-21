/** Una tabella precedente non disponibile non può salvare una rata vuota. */
export function finanziamentoSelezionatoFv<T extends { id: string; rata: { importo_rata: number; durata_mesi: number } }>(
  id: string | null, disponibili: T[], durata: number | null,
): T {
  const scelta = id ? disponibili.find(t => t.id === id) : disponibili[0];
  if (!scelta || !Number.isFinite(scelta.rata.importo_rata) || scelta.rata.importo_rata <= 0 || scelta.rata.durata_mesi !== durata) {
    throw new Error("Seleziona una finanziaria disponibile per l’importo e la durata attuali prima di proseguire.");
  }
  return scelta;
}
