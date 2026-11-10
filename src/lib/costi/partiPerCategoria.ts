/**
 * Le parti di un costo per categoria (10/11/2026).
 *
 * Una fattura d'acquisto può mettere insieme costi diversi (calcestruzzo e pompaggio,
 * materie prime e trasporto): con il conto per riga, il costo porta la sua divisione in
 * `company_costs.ripartizione_categorie` ([{categoria, importo}], la scrive il database). Chi
 * somma i costi per categoria (Costi, budget, punto di pareggio) li legge da qui, come fa il
 * Controllo di gestione (costo_parti_categoria). Vuota = tutto sulla categoria del costo.
 */
export interface ParteCategoria { categoria: string | null; importo: number }

const numero = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Le parti del costo. Con `importo` diverso dall'intero (una quota, il netto IVA) le parti si
 * riportano a quell'importo in proporzione.
 */
export function partiPerCategoria(
  costo: { category?: string | null; amount?: unknown; ripartizione_categorie?: unknown },
  importo: number = numero(costo.amount),
): ParteCategoria[] {
  const parti = Array.isArray(costo.ripartizione_categorie)
    ? (costo.ripartizione_categorie as Array<Record<string, unknown>>)
        .map((p) => ({ categoria: typeof p?.categoria === "string" && p.categoria ? p.categoria : null, importo: numero(p?.importo) }))
        .filter((p) => p.importo !== 0)
    : [];
  if (parti.length === 0) return [{ categoria: costo.category ?? null, importo }];
  const totale = parti.reduce((s, p) => s + p.importo, 0);
  if (totale === 0) return [{ categoria: costo.category ?? null, importo }];
  const fattore = importo / totale;
  return parti.map((p) => ({ categoria: p.categoria, importo: Math.round(p.importo * fattore * 100) / 100 }));
}

/** Le categorie in cui cade il costo (per i filtri): la sua e quelle delle parti. */
export function categorieDelCosto(costo: { category?: string | null; ripartizione_categorie?: unknown }): string[] {
  const cat = partiPerCategoria({ ...costo, amount: 1 }).map((p) => p.categoria).filter((c): c is string => !!c);
  return Array.from(new Set([costo.category ?? "", ...cat].filter(Boolean)));
}
