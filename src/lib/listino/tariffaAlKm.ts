import { unitaTariffa } from "@/lib/listino/costoTariffa";

/**
 * Tariffe al km nel preventivo (05/10/2026).
 *
 * La quantità della riga SONO i km: «45 km × 0,80 € = 36 €». Prima la riga
 * nasceva «1 × (prezzo × distanza)», con un prezzo unitario che non era il
 * prezzo al km, e senza la distanza del cantiere a 0 € senza dirlo: la
 * distanza si chiedeva solo con «Chiedi trasporto» acceso nelle impostazioni.
 */

/** Quantità con cui nasce la riga: la distanza del cantiere se c'è, altrimenti 1 da correggere. */
export function quantitaInizialeTariffa(
  tariffa: { unita?: string | null; unita_fatturazione?: string | null },
  kmCantiere?: number | null,
): { quantita: number; mancaDistanza: boolean } {
  if (unitaTariffa(tariffa) !== "km") return { quantita: 1, mancaDistanza: false };
  const km = Number(kmCantiere);
  return Number.isFinite(km) && km > 0
    ? { quantita: Math.round(km * 100) / 100, mancaDistanza: false }
    : { quantita: 1, mancaDistanza: true };
}

/**
 * Cambiata la distanza del cantiere, le righe al km che la seguivano prendono
 * quella nuova: le righe con la quantità uguale alla distanza di prima, oppure
 * a 1 se prima una distanza non c'era (la riga era nata da correggere). Una
 * quantità scritta a mano, come il doppio per andata e ritorno, resta com'è.
 * Una distanza cancellata (0) non tocca niente. Se nessuna riga cambia torna
 * lo stesso array.
 */
export function allineaRigheAlKm<
  T extends { tariffa_id?: string | null; unit_of_measure?: string | null; quantity: number },
>(righe: T[], kmPrima: number, kmDopo: number): T[] {
  if (!(kmDopo > 0)) return righe;
  const quantitaDopo = Math.round(kmDopo * 100) / 100;
  const seguiva = (q: number) => (kmPrima > 0 ? Math.abs(q - kmPrima) < 0.005 : q === 1);
  let cambiate = false;
  const nuove = righe.map((r) => {
    if (!r.tariffa_id || r.unit_of_measure !== "km") return r;
    const q = Number(r.quantity);
    if (!seguiva(q) || q === quantitaDopo) return r;
    cambiate = true;
    return { ...r, quantity: quantitaDopo };
  });
  return cambiate ? nuove : righe;
}
