export interface MaterialMovement {
  id: string; stock_item_id: string; movement_type: string; quantity: number; unit_cost: number | null;
}
export interface MaterialReport { id: string; stato: string; materiali_usati: unknown }
export interface MaterialUsage {
  id: string; name: string; unit: string; delivered: number; used: number; returned: number;
  remaining: number; estimatedUsedValue: number | null; review: boolean;
}

/** Numeric DB strings are valid; booleans/arrays/hex/blank are not quantities or prices. */
function materialNumber(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim())) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Physical quantities, not additional job costs. A withdrawal is NOT a consumption. */
export function materialUsage(movements: MaterialMovement[], reports: MaterialReport[], names: Record<string, string> = {}) {
  const groups = new Map<string, MaterialUsage & { deliveredValue: number; priced: number; incompleteData: boolean; units: Set<string> }>();
  let unlinked = 0;
  const get = (id: string) => {
    let g = groups.get(id);
    if (!g) {
      g = { id, name: names[id] ?? 'Articolo non disponibile', unit: 'unità', delivered: 0, used: 0,
        returned: 0, remaining: 0, estimatedUsedValue: null, review: !names[id], deliveredValue: 0, priced: 0, incompleteData: false, units: new Set() };
      groups.set(id, g);
    }
    return g;
  };
  for (const m of new Map(movements.map(m => [m.id, m])).values()) {
    const g = get(m.stock_item_id);
    const qty = materialNumber(m.quantity);
    if (qty == null || qty <= 0 || !['scarico', 'carico'].includes(m.movement_type)) { g.review = true; g.incompleteData = true; continue; }
    if (m.movement_type === 'carico') { g.returned += qty; continue; }
    g.delivered += qty;
    const price = materialNumber(m.unit_cost);
    if (price != null && price >= 0) {
      g.deliveredValue += qty * price; g.priced += qty;
    } else if (m.unit_cost != null) {
      g.review = true; g.incompleteData = true;
    }
  }
  for (const r of new Map(reports.map(r => [r.id, r])).values()) {
    if (r.stato !== 'approvato') continue;
    if (!Array.isArray(r.materiali_usati)) continue;
    for (const entry of r.materiali_usati) {
      if (!entry || typeof entry !== 'object') { unlinked++; continue; }
      const m = entry as Record<string, unknown>;
      if (typeof m.stock_item_id !== 'string' || !m.stock_item_id) { unlinked++; continue; }
      const g = get(m.stock_item_id);
      const qty = materialNumber(m.quantita);
      if (qty == null || qty <= 0) { g.review = true; g.incompleteData = true; continue; }
      g.used += qty;
      if (typeof m.unita === 'string' && m.unita.trim()) g.units.add(m.unita.trim());
    }
  }
  const rows: MaterialUsage[] = [...groups.values()].map(g => {
    const remaining = Math.round((g.delivered - g.used - g.returned) * 1e6) / 1e6;
    // Weighted historical delivery snapshots; indicative, not lot-specific accounting.
    const estimatedUsedValue = !g.incompleteData && g.delivered > 0 && g.priced === g.delivered && g.units.size <= 1 && remaining >= 0
      ? Math.round(g.deliveredValue / g.delivered * g.used * 100) / 100 : null;
    return { id: g.id, name: g.name, unit: [...g.units][0] ?? 'unità', delivered: g.delivered, used: g.used,
      returned: g.returned, remaining, estimatedUsedValue, review: g.review || remaining < 0 || g.units.size > 1 };
  });
  return { rows: rows.sort((a, b) => Number(b.review) - Number(a.review) || a.name.localeCompare(b.name)), unlinked };
}
