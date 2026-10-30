import { supabase } from "@/integrations/supabase/client";

// Le commesse archiviate cambiano di rado, ma 14 lettori le rileggevano a ogni giro
// (contatori del menu compresi: 37.700 letture in 14 giorni fino al 30/10/2026).
// Si tengono 2 minuti per azienda; nei test no, perché lì gli stessi id azienda
// tornano con dati finti diversi da un caso all'altro.
const MEMORIA_MS = 2 * 60_000;
const memoria = new Map<string, { quando: number; ids: Promise<string[]> }>();

/** Dimentica le commesse archiviate in memoria: dopo un'archiviazione o un ripristino. */
export function dimenticaCommesseArchiviate(companyId?: string): void {
  if (companyId) memoria.delete(companyId);
  else memoria.clear();
}

/** Keep historical financial rows intact, but exclude their retired job from operations. */
export async function loadArchivedOrderIds(companyId: string): Promise<string[]> {
  if (!companyId) throw new Error("Azienda non selezionata");
  if (import.meta.env?.MODE === "test") return leggiArchiviate(companyId);
  const ora = Date.now();
  const voce = memoria.get(companyId);
  if (voce && ora - voce.quando < MEMORIA_MS) return voce.ids;
  const ids = leggiArchiviate(companyId);
  memoria.set(companyId, { quando: ora, ids });
  // Una lettura fallita non resta in memoria.
  ids.catch(() => { if (memoria.get(companyId)?.ids === ids) memoria.delete(companyId); });
  return ids;
}

async function leggiArchiviate(companyId: string): Promise<string[]> {
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
