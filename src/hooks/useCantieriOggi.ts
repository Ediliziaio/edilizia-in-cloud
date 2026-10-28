import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { campoWorkDay } from "@/lib/campo/workDay";
import {
  parseCantieriOggi,
  type OggiOverview,
  type OggiOrder,
  type OggiPhase,
  type OggiTask,
} from "@/lib/orders/cantieriOggi";

// Read-only RPC and additive office fields are not in the generated snapshot yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
interface PageResult<T> {
  data: T[] | null;
  error: unknown;
}
async function allPages<T>(
  page: (offset: number) => PromiseLike<PageResult<T>>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += 500) {
    const result = await page(offset);
    if (result.error) throw result.error;
    if (!Array.isArray(result.data))
      throw Error("Risposta pianificazione non valida.");
    rows.push(...result.data);
    if (result.data.length < 500) return rows;
  }
}
/** Batched reads only: no per-row requests and no business writes. */
export async function loadOggiOverview(
  companyId: string,
  ids: string[],
): Promise<OggiOverview> {
  const result: OggiOverview = { orders: [], phases: [], tasks: [] };
  for (let i = 0; i < ids.length; i += 100) {
    const batch = ids.slice(i, i + 100);
    const [orders, phases, tasks] = await Promise.all([
      allPages<OggiOrder>((offset) =>
        supabase
          .from("orders")
          .select("id,assigned_to,client_name,work_start_date,work_end_date")
          .eq("company_id", companyId)
          .is("deleted_at", null)
          .in("id", batch)
          .order("id")
          .range(offset, offset + 499),
      ),
      allPages<OggiPhase>((offset) =>
        supabase
          .from("order_work_phases")
          .select("id,order_id,name,status,start_date,end_date,position")
          .eq("company_id", companyId)
          .in("order_id", batch)
          .neq("status", "completata")
          .order("order_id")
          .order("position")
          .order("id")
          .range(offset, offset + 499),
      ),
      allPages<OggiTask>((offset) =>
        db
          .from("tasks")
          .select(
            "id,order_id,title,status,due_date,assigned_to,ufficio_id,bloccata_da_task_id,attende_fase_id",
          )
          .eq("company_id", companyId)
          .in("order_id", batch)
          .eq("activity_scope", "ufficio")
          .neq("status", "completata")
          .order("due_date", { nullsFirst: false })
          .order("id")
          .range(offset, offset + 499),
      ),
    ]);
    result.orders.push(...orders);
    result.phases.push(...phases);
    result.tasks.push(...tasks);
  }
  return result;
}
export function useCantieriOggi(companyId: string | undefined) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const day = campoWorkDay(now);
  const cantieri = useQuery({
    queryKey: ["ufficio-cantieri-oggi", companyId, day],
    enabled: !!companyId,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await db.rpc("ufficio_cantieri_oggi", {
        p_giorno: day,
      });
      if (error) throw error;
      return parseCantieriOggi(data);
    },
  });
  const ids = (cantieri.data ?? []).map((r) => r.id).sort();
  const overview = useQuery({
    // Same invalidation prefix as the RPC: existing work/report mutations refresh both.
    queryKey: ["ufficio-cantieri-oggi", companyId, day, "pianificazione", ids],
    enabled: !!companyId && cantieri.isSuccess && ids.length > 0,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    queryFn: () => loadOggiOverview(companyId!, ids),
  });
  const ready =
    cantieri.isSuccess &&
    !cantieri.isError &&
    (ids.length === 0 || (overview.isSuccess && !overview.isError));
  const refresh = async () => {
    const main = await cantieri.refetch();
    // Same IDs may contain newly edited phases/tasks; invalidate their cached read.
    if (main.isSuccess && ids.length > 0) await overview.refetch();
  };
  return { cantieri, overview, now, day, ready, refresh };
}
