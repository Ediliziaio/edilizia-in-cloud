// src/lib/orders/listaGenerali.ts
// Lista commesse ad albero: una commessa generale e, sotto, le sue commesse.
// Le commesse dentro una generale che è nella stessa pagina non stanno più in giro per la lista:
// stanno sotto la loro generale, che si apre e si chiude. Se la generale non è nella pagina
// (filtri, paginazione), la commessa resta al suo posto con l'etichetta «in O-…».

export interface RigaAlbero<T> {
  order: T;
  /** 0 = riga della lista; 1 = commessa dentro la generale aperta sopra. */
  livello: 0 | 1;
  /** Per una generale: le sue commesse presenti nella lista (aperta o chiusa). */
  figlie: T[];
}

export function raggruppaGenerali<T extends { id: string }>(
  items: readonly T[],
  generaleDi: (id: string) => string | undefined,
  isGenerale: (id: string) => boolean,
  aperte: ReadonlySet<string>,
): RigaAlbero<T>[] {
  const presenti = new Set(items.map((o) => o.id));
  const figliePer = new Map<string, T[]>();
  for (const o of items) {
    const g = generaleDi(o.id);
    if (g && presenti.has(g) && isGenerale(g)) {
      const lista = figliePer.get(g) ?? [];
      lista.push(o);
      figliePer.set(g, lista);
    }
  }
  const sotto = new Set([...figliePer.values()].flat().map((o) => o.id));
  const righe: RigaAlbero<T>[] = [];
  for (const o of items) {
    if (sotto.has(o.id)) continue;
    const figlie = figliePer.get(o.id) ?? [];
    righe.push({ order: o, livello: 0, figlie });
    if (figlie.length && aperte.has(o.id)) {
      for (const f of figlie) righe.push({ order: f, livello: 1, figlie: [] });
    }
  }
  return righe;
}

/** La somma di un numero sulle commesse dentro: i totali della riga della generale. */
export const sommaFiglie = <T>(figlie: readonly T[], valore: (o: T) => number): number =>
  Math.round(figlie.reduce((t, o) => t + (Number.isFinite(valore(o)) ? valore(o) : 0), 0) * 100) / 100;

/** Cosa cambia nei totali di una generale quando una commessa esce (-1) o entra (+1). */
export function effettoSpostamento(
  t: { assegnato: number | null; daAssegnare: number | null },
  importo: number | null,
  verso: 1 | -1,
): { assegnatoDopo: number | null; daAssegnareDopo: number | null } {
  const delta = (importo ?? 0) * verso;
  const tondo = (n: number) => Math.round(n * 100) / 100;
  return {
    assegnatoDopo: t.assegnato === null ? null : tondo(t.assegnato + delta),
    daAssegnareDopo: t.daAssegnare === null ? null : tondo(t.daAssegnare - delta),
  };
}

export interface RigaRaggruppo { id: string; customer_id?: string | null; total_amount?: number | null }

/**
 * Il controllo prima di raggruppare commesse in una generale nuova (F8): il cliente se è uno
 * solo, l'importo totale, e cosa non si può mettere dentro. Una generale non entra in un'altra:
 * si fermerebbe il database, quindi lo si dice prima.
 */
export function controllaRaggruppo(
  righe: readonly RigaRaggruppo[],
  mappa: { figliePerGenerale: ReadonlyMap<string, number>; generaleDellaFiglia: ReadonlyMap<string, unknown> },
) {
  const buone = righe.filter((r) => !mappa.figliePerGenerale.has(r.id));
  const clienti = [...new Set(buone.map((r) => r.customer_id).filter((c): c is string => !!c))];
  const senzaCliente = buone.some((r) => !r.customer_id);
  return {
    commesse: buone.map((r) => r.id),
    generaliEscluse: righe.length - buone.length,
    giaInUnaGenerale: buone.filter((r) => mappa.generaleDellaFiglia.has(r.id)).length,
    clienteUnico: clienti.length === 1 && !senzaCliente ? clienti[0] : null,
    clientiDiversi: clienti.length > 1,
    totale: Math.round(buone.reduce((s, r) => s + (Number(r.total_amount) || 0), 0) * 100) / 100,
  };
}
