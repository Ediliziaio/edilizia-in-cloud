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
