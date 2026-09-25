/**
 * Reminder based on the SAME time segments as the clock and report.
 * Generic hours stay unallocated: a sole assignment is not proof of presence.
 * Crew coverage will be resolved by the canonical performance ledger (next phase).
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { loadCampoDayPunches } from "@/lib/campo/loadTimePunches";
import { campoDayWindow, campoReportHours, summarizeCampoTime } from "@/lib/campo/timeSummary";
import { shiftWorkDay } from "@/lib/campo/workDay";
import { useCampoWorkDay } from "@/hooks/campo/useCampoWorkDay";

export interface RapportinoMancante {
  data_lavoro: string;
  order_id: string;
  order_code: string | null;
  description: string | null;
  indirizzo_lavori: string | null;
  prima_timbratura_at: string;
  prossima_timbratura_at: string | null;
  ore_in_cantiere_stimate: number;
}

export function useCampoRapportiniDaCompilare(userId: string | undefined) {
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;
  const today = useCampoWorkDay();
  return useQuery({
    queryKey: ["campo-rapportini-da-compilare", userId, companyId, today],
    enabled: !!userId && !!companyId,
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<RapportinoMancante[]> => {
      const now = new Date();
      const yesterday = shiftWorkDay(today, -1);
      const punches = await loadCampoDayPunches(userId!, companyId!, yesterday, true);
      // Yesterday first: it expires tonight. Split multi-site / overnight work
      // into distinct site + day reports, without inventing missing exits.
      const days = [yesterday, today].map(day => ({ day,
        summary: summarizeCampoTime(punches, { ...campoDayWindow(day), now, includeOpen: true }),
      }));
      const ids = [...new Set(days.flatMap(({ summary }) => [...summary.byOrder]
        .filter(([id, time]) => id && time.workMinutes > 0).map(([id]) => id!)))];
      if (!ids.length) return [];
      const [reports, orders] = await Promise.all([
        supabase.from("campo_rapportini").select("order_id, data_lavoro, stato")
          .eq("user_id", userId!).eq("company_id", companyId!).in("data_lavoro", [yesterday, today]),
        supabase.from("orders").select("id, order_code, description, indirizzo_lavori")
          .eq("company_id", companyId!).in("id", ids),
      ]);
      if (reports.error) throw reports.error;
      if (orders.error) throw orders.error;
      // A draft/rejected report already has a unique daily key: its correction
      // is surfaced separately, not offered as a second daily insertion.
      const covered = new Set((reports.data ?? []).map(r => `${r.order_id}:${r.data_lavoro}`));
      return days.flatMap(({ day, summary }) => (orders.data ?? [])
        .filter(o => !covered.has(`${o.id}:${day}`) && (summary.byOrder.get(o.id)?.workMinutes ?? 0) > 0).map(order => {
        const segments = summary.segments.filter(s => s.orderId === order.id && s.kind === "work");
        return {
          data_lavoro: day,
          order_id: order.id,
          order_code: order.order_code,
          description: order.description,
          indirizzo_lavori: order.indirizzo_lavori,
          prima_timbratura_at: new Date(segments[0].start).toISOString(),
          prossima_timbratura_at: new Date(segments[segments.length - 1].end).toISOString(),
          ore_in_cantiere_stimate: campoReportHours(summary.byOrder.get(order.id)!.workMinutes),
        };
      }));
    },
  });
}
