/**
 * Nello stesso giorno, sullo stesso cantiere, una persona può avere DUE rapporti:
 * il giornaliero (interno) e il collaudo col cliente (con la sua firma).
 * Chi cerca «il rapportino di oggi» deve prendere il giornaliero, non il primo che capita.
 *
 * Stessa regola di src/lib/campo/reportKind.ts (isClientReport): la firma del cliente
 * conta anche se manca il flag lavoro_completato.
 */
export interface RigaRapporto {
  lavoro_completato?: boolean | null;
  firma_cliente_url?: string | null;
}

export function eRapportoCliente(r: RigaRapporto): boolean {
  return r.lavoro_completato === true || !!r.firma_cliente_url?.trim();
}

/** Il giornaliero tra le righe di una giornata (o null se c'è solo il collaudo, o niente). */
export function giornalieroDelGiorno<T extends RigaRapporto>(righe: readonly T[] | null | undefined): T | null {
  return (righe ?? []).find((r) => !eRapportoCliente(r)) ?? null;
}
