interface RigaUscita {
  stockItemId: string | null;
  itemName: string | null;
  quantity: number;
  trackingMode: "fungible" | "serialized" | null;
  serialNumbers: string[];
}

/** Blocca righe incomplete prima di qualsiasi movimento di magazzino. */
export function validaRigheUscita(righe: readonly RigaUscita[]): string | null {
  if (!righe.length) return "Aggiungi almeno un articolo";
  const seriali = new Set<string>();
  for (const riga of righe) {
    const nome = riga.itemName || "Articolo";
    if (!riga.stockItemId) return `${nome}: seleziona un articolo di magazzino`;
    if (!Number.isFinite(riga.quantity) || riga.quantity <= 0)
      return `${nome}: inserisci una quantità maggiore di zero`;
    if (riga.trackingMode === "serialized") {
      if (!Number.isInteger(riga.quantity) || riga.serialNumbers.length !== riga.quantity)
        return `${nome}: seleziona un seriale per ogni unità`;
      for (const seriale of riga.serialNumbers) {
        const valore = seriale.trim();
        const chiave = JSON.stringify([riga.stockItemId, valore]);
        if (!valore || seriali.has(chiave)) return `${nome}: correggi i seriali vuoti o duplicati`;
        seriali.add(chiave);
      }
    }
  }
  return null;
}
