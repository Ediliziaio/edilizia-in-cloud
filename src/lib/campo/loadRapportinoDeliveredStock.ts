import { supabase } from '@/integrations/supabase/client';
import { shiftWorkDay, workDayStart } from './workDay';
import { rapportinoStockSelectionKey, type RapportinoArticle } from './rapportinoMaterials';

/** Visible delivery identities only. RLS remains authoritative; no stock prices,
 * warehouse-wide catalog or inferred parent/unit is returned to the field form. */
export async function loadRapportinoDeliveredStock(orderId: string, companyId: string, day: string): Promise<RapportinoArticle[]> {
  if (!orderId || !companyId) throw new Error('Commessa e azienda richieste');
  const boundary = workDayStart(shiftWorkDay(day, 1)).toISOString();
  const parents = new Map<string, Set<string | null>>();
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase.from('warehouse_movements')
      .select('id,stock_item_id,order_item_id').eq('company_id', companyId).eq('order_id', orderId)
      .eq('movement_type', 'scarico').lt('created_at', boundary).order('id').range(offset, offset + 499);
    if (error) throw error;
    for (const row of data ?? []) {
      if (!row.stock_item_id) continue;
      const ids = parents.get(row.stock_item_id) ?? new Set<string | null>();
      ids.add(row.order_item_id ?? null);
      parents.set(row.stock_item_id, ids);
    }
    if (!data || data.length < 500) break;
  }
  const stockIds = [...parents.keys()], choices: RapportinoArticle[] = [];
  for (let start = 0; start < stockIds.length; start += 50) {
    const { data, error } = await supabase.from('warehouse_stock').select('id,name')
      .eq('company_id', companyId).in('id', stockIds.slice(start, start + 50)).order('id');
    if (error) throw error;
    for (const row of data ?? []) {
      const ids = parents.get(row.id)!;
      choices.push({ id: rapportinoStockSelectionKey(row.id), name: row.name, categoria: 'Materiali',
        stock_item_id: row.id, order_item_id: ids.size === 1 ? [...ids][0] : null });
    }
  }
  return choices.sort((a,b) => a.name.localeCompare(b.name, 'it') || a.id.localeCompare(b.id));
}
