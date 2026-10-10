import { supabase } from "@/integrations/supabase/client";

/** Keep historical financial rows intact, but exclude their retired job from operations. */
export async function loadArchivedOrderIds(companyId: string): Promise<string[]> {
  if (!companyId) throw new Error("Azienda non selezionata");
  const ids: string[] = [];
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase.from("orders").select("id")
      .eq("company_id", companyId).not("deleted_at", "is", null)
      .order("id").range(offset, offset + pageSize - 1);
    if (error) throw error;
    ids.push(...(data ?? []).map(row => row.id));
    if ((data?.length ?? 0) < pageSize) return ids;
  }
}

/** Each chunk is ANDed by PostgREST. Unlinked tasks/appointments must remain visible. */
export function excludeArchivedOrders<T extends { or(filters: string): unknown }>(
  query: T, ids: string[], column: "id" | "order_id" = "id",
): T {
  for (const id of ids) if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new Error("Identificativo commessa non valido");
  for (let offset = 0; offset < ids.length; offset += 100) {
    const excluded = `${column}.not.in.(${ids.slice(offset, offset + 100).join(",")})`;
    query.or(column === "order_id" ? `${column}.is.null,${excluded}` : excluded);
  }
  return query;
}
