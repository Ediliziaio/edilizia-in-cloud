import { supabase } from "@/integrations/supabase/client";

type Person = { employeeId: string; userId?: never } | { employeeId?: never; userId: string };
/** Assignment returns only an ID; private rates are calculated on the server. */
export async function assignOfficeEmployee(orderId: string, person: Person, phaseId: string | null = null, plannedHours: number | null = null) {
  if (plannedHours !== null && (!Number.isFinite(plannedHours) || plannedHours < 0)) throw new Error("Ore previste non valide");
  // New local RPC, pending the next database type generation.
  const client = supabase as unknown as { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }> };
  const { data, error } = await client.rpc("commessa_assegna_persona", {
    p_order_id: orderId, p_employee_id: person.employeeId ?? null, p_user_id: person.userId ?? null,
    p_phase_id: phaseId, p_planned_hours: plannedHours,
  });
  if (error) throw new Error(error.message);
  if (typeof data !== "string" || !data) throw new Error("Assegnazione non confermata");
  return data;
}
