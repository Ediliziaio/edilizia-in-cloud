import type { ToolCtx } from "./types.ts";

/** Null means company-wide office access; workers see only actual assignments. */
export async function assignedSiteIds(ctx: ToolCtx, day = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(new Date())): Promise<Set<string> | null> {
  if (ctx.kind === "unknown") return new Set();
  if (ctx.kind !== "operaio") return null;
  const ids = new Set<string>();
  if (ctx.user_id) {
    const { data, error } = await ctx.supabase.from("order_campo_assignments")
      .select("order_id,data_inizio,data_fine_prevista").eq("company_id", ctx.company_id).eq("user_id", ctx.user_id);
    if (error) throw new Error("site_assignments_unavailable");
    for (const row of data ?? []) if ((!row.data_inizio || row.data_inizio <= day) && (!row.data_fine_prevista || row.data_fine_prevista >= day)) ids.add(row.order_id);
  }
  if (ctx.employee_id) {
    const { data, error } = await ctx.supabase.from("order_phase_assignments")
      .select("order_id").eq("company_id", ctx.company_id).eq("employee_id", ctx.employee_id);
    if (error) throw new Error("site_assignments_unavailable");
    for (const row of data ?? []) ids.add(row.order_id);
  }
  return ids;
}

export async function requireSiteAccess(ctx: ToolCtx, id: string): Promise<void> {
  const assigned = await assignedSiteIds(ctx);
  if (assigned && !assigned.has(id)) throw new Error("Cantiere non assegnato a questa persona.");
  const { data, error } = await ctx.supabase.from("orders").select("id").eq("company_id", ctx.company_id).eq("id", id).maybeSingle();
  if (error || !data) throw new Error("Cantiere non disponibile in questa azienda.");
}
