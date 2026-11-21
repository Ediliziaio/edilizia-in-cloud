import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { readAllOrderRows } from "@/lib/orders/listScope";

const colonne = [
  "id", "stock_item_id", "movement_type", "rientro_commessa", "quantity", "notes",
  "created_at", "performed_by", "order_id", "lot_number", "warehouse_id",
] as const;
type RigaMovimento = Pick<Tables<"warehouse_movements">, typeof colonne[number]> &
  Partial<Pick<Tables<"warehouse_movements">, "unit_cost">>;

export type CursoreMovimenti = Pick<RigaMovimento, "id" | "created_at">;

interface FiltriMovimenti {
  warehouseId?: string | null;
  since?: string | null;
  orderId?: string;
  canViewCosts?: boolean;
  page?: { after: CursoreMovimenti | null; size: number };
}

async function leggiPerId<T>(
  ids: (string | null)[],
  read: (ids: string[]) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const unici = [...new Set(ids.filter((id): id is string => !!id))];
  const rows: T[] = [];
  for (let i = 0; i < unici.length; i += 150) {
    const { data, error } = await read(unici.slice(i, i + 150));
    if (error) throw error;
    rows.push(...(data ?? []));
  }
  return rows;
}

/** La scheda commessa e il registro leggono gli stessi movimenti, senza ricostruire lo scarico. */
export async function leggiMovimentiMagazzino(
  companyId: string,
  { warehouseId, since, orderId, canViewCosts, page }: FiltriMovimenti,
  signal: AbortSignal,
) {
  const fields = canViewCosts ? [...colonne, "unit_cost"] : colonne;
  const query = supabase
    .from("warehouse_movements")
    .select(fields.join(","))
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .order("id")
    .abortSignal(signal);
  if (warehouseId) query.eq("warehouse_id", warehouseId);
  if (since) query.gte("created_at", since);
  if (orderId) {
    query.eq("order_id", orderId).eq("movement_type", "scarico")
      // La ripartizione di una riga tra fasi genera movimenti interni, senza uscita fisica.
      .or('order_item_id.is.null,notes.is.null,notes.not.like."Divisione tra le fasi:*"');
  }

  if (page?.after) {
    const { created_at, id } = page.after;
    query.or(`created_at.lt.${created_at},and(created_at.eq.${created_at},id.gt.${id})`);
  }
  const result = page ? await query.limit(page.size).overrideTypes<RigaMovimento[], { merge: false }>() : null;
  if (result?.error) throw result.error;
  const movimenti = result ? result.data ?? [] : await readAllOrderRows((from, to) =>
    query.range(from, to).overrideTypes<RigaMovimento[], { merge: false }>(), 1000);

  if (!movimenti.length) return [];
  const [articoli, commesse, operatori] = await Promise.all([
    leggiPerId(movimenti.map(m => m.stock_item_id), ids => supabase.from("warehouse_stock")
      .select("id, name, unita_misura").eq("company_id", companyId).in("id", ids).abortSignal(signal)),
    leggiPerId(movimenti.map(m => m.order_id), ids => supabase.from("orders")
      .select("id, order_code").eq("company_id", companyId).in("id", ids).abortSignal(signal)),
    leggiPerId(movimenti.map(m => m.performed_by), ids => supabase.from("profiles")
      .select("id, first_name, last_name").in("id", ids).abortSignal(signal)),
  ]);
  const articoloPerId = new Map(articoli.map(s => [s.id, s]));
  const codicePerId = new Map(commesse.map(o => [o.id, o.order_code]));
  const nomePerId = new Map(operatori.map(p => [p.id, [p.first_name, p.last_name].filter(Boolean).join(" ").trim()]));

  return movimenti.map(m => {
    const articolo = articoloPerId.get(m.stock_item_id);
    return {
      ...m,
      unit_cost: m.unit_cost ?? null,
      unit: articolo?.unita_misura ?? null,
      notes: m.rientro_commessa && /^Rientro dal cantiere · uscita [0-9a-f-]{36}$/.test(m.notes ?? "")
        ? "Reso da cantiere collegato all’uscita originale" : m.notes,
      itemName: articolo?.name ?? "Articolo eliminato",
      orderCode: m.order_id ? codicePerId.get(m.order_id) ?? m.order_id.slice(0, 8) : null,
      performerName: m.performed_by ? nomePerId.get(m.performed_by) || null : null,
    };
  });
}

export type MovimentoMagazzino = Awaited<ReturnType<typeof leggiMovimentiMagazzino>>[number];
