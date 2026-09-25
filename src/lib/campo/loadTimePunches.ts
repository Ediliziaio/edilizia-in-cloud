import { supabase } from "@/integrations/supabase/client";
import { campoDayWindow } from "./timeSummary";
import { shiftWorkDay } from "./workDay";

/** One prior calendar day provides context for ordinary overnight shifts.
 * Older/missing entries remain anomalies; never infer them from an exit. */
export async function loadCampoDayPunches(userId: string, companyId: string, day: string, includeFollowingDay = false) {
  const { lookback, end } = campoDayWindow(day);
  // A report for yesterday also needs today's confirmed overnight exit.
  const until = includeFollowingDay ? campoDayWindow(shiftWorkDay(day, 1)).end : end;
  const { data, error } = await supabase.from("campo_timbrature")
    .select("id, tipo, timestamp_evento, order_id, fonte")
    .eq("user_id", userId).eq("company_id", companyId)
    .gte("timestamp_evento", lookback.toISOString())
    .lt("timestamp_evento", until.toISOString())
    .order("timestamp_evento", { ascending: true });
  if (error) throw error;
  return data ?? [];
}
