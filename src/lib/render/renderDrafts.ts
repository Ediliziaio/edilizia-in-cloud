import { supabase } from "@/integrations/supabase/client";

/** Una foto caricata senza alcun avvio non è un job in coda da mesi. */
export async function classificaBozzeRender<T extends { id: string; status: string }>(rows: T[], companyId: string): Promise<T[]> {
  const pending = rows.filter((r) => r.status === "pending").map((r) => r.id);
  if (!pending.length) return rows;
  const { data, error } = await supabase.from("render_credit_ledger").select("session_id").eq("company_id", companyId).eq("reason", "consume").in("session_id", pending);
  // Senza il registro non si deduce che non sia stato avviato.
  if (error) return rows;
  const consumed = new Set((data ?? []).map((r) => r.session_id));
  return rows.map((r) => r.status === "pending" && !consumed.has(r.id) ? { ...r, status: "draft" } : r);
}
