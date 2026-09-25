import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { campoWorkDay, validWorkDay } from "@/lib/campo/workDay";
import { campoDayWindow, summarizeCampoTime } from "@/lib/campo/timeSummary";
import { loadCampoDayPunches } from "@/lib/campo/loadTimePunches";

const EMPTY_PUNCHES: Awaited<ReturnType<typeof loadCampoDayPunches>> = [];

export function useCampoDayTime(userId: string | undefined, companyId: string | null | undefined, workDay?: string) {
  const [clockNow, setNow] = useState(() => new Date());
  useEffect(() => {
    const refresh = () => setNow(new Date());
    const timer = setInterval(refresh, 30_000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { clearInterval(timer); window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, []);
  const today = campoWorkDay(clockNow);
  const day = workDay && validWorkDay(workDay) ? workDay : today;
  const historical = day < today;
  const query = useQuery({
    queryKey: ["campo-time-day", companyId, userId, day, historical],
    enabled: !!userId && !!companyId,
    queryFn: () => loadCampoDayPunches(userId!, companyId!, day, historical),
    staleTime: 15_000,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
  // A just-saved punch must become visible immediately after refetch, without
  // waiting for the 30-second display clock (and accidentally allowing re-entry).
  const now = useMemo(() => new Date(Math.max(clockNow.getTime(), query.dataUpdatedAt || 0)), [clockNow, query.dataUpdatedAt]);
  const punches = query.data ?? EMPTY_PUNCHES;
  const dayWindow = useMemo(() => campoDayWindow(day), [day]);
  const summary = useMemo(() => summarizeCampoTime(punches, { ...dayWindow, now, includeOpen: true }), [punches, dayWindow, now]);
  const todayPunches = useMemo(() => punches.filter(p => {
    const at = Date.parse(p.timestamp_evento);
    return at >= dayWindow.start.getTime() && at < dayWindow.end.getTime() && at <= now.getTime();
  }), [punches, dayWindow, now]);
  return { ...query, summary, todayPunches, day, now };
}
