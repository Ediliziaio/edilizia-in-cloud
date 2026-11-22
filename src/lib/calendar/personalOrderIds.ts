import { supabase } from "@/integrations/supabase/client";
import { loadDashboardRows } from "@/lib/attivita/dashboardTasks";

export async function personalOrderIds(
  company: string,
  user: string,
  signal: AbortSignal,
) {
  const [direct, campo] = await Promise.all([
    loadDashboardRows<{ id: string }>((a, b) =>
      supabase
        .from("orders")
        .select("id")
        .eq("company_id", company)
        .is("deleted_at", null)
        .or(`assigned_to.eq.${user},capomastro_user_id.eq.${user}`)
        .order("id")
        .range(a, b)
        .abortSignal(signal),
    ),
    loadDashboardRows<{ id: string; order_id: string }>((a, b) =>
      supabase
        .from("order_campo_assignments")
        .select("id,order_id")
        .eq("company_id", company)
        .eq("user_id", user)
        .order("id")
        .range(a, b)
        .abortSignal(signal),
    ),
  ]);
  return [
    ...new Set(
      [...direct.map((o) => o.id), ...campo.map((a) => a.order_id)].filter(
        Boolean,
      ),
    ),
  ];
}
