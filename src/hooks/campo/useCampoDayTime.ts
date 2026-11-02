import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { campoWorkDay, validWorkDay } from "@/lib/campo/workDay";
import { campoDayWindow, summarizeCampoTime } from "@/lib/campo/timeSummary";
import { loadCampoDayPunches } from "@/lib/campo/loadTimePunches";
import { syncQueue, syncItemScope } from "@/lib/campo/sync-queue";
import { erroreDiRete, type rigaTimbratura } from "@/lib/campo/timbra";

const EMPTY_PUNCHES: Awaited<ReturnType<typeof loadCampoDayPunches>> = [];

type RigaInCoda = ReturnType<typeof rigaTimbratura>;

/** Le timbrature fatte senza campo: contano subito sul telefono, prima di arrivare al server. */
function useTimbratureInCoda(userId: string | undefined, companyId: string | null | undefined, ricarica: () => void) {
  const [righe, setRighe] = useState<RigaInCoda[]>([]);
  useEffect(() => {
    let attivo = true;
    const leggi = () => {
      syncQueue.getAll().then((items) => {
        if (!attivo) return;
        setRighe(items
          .filter((i) => {
            if (i.type !== "timbratura" || i.status === "done") return false;
            const scope = syncItemScope(i);
            return scope.owner === userId && scope.companyId === companyId;
          })
          .map((i) => i.payload as RigaInCoda));
      }).catch(() => { /* Senza IndexedDB la coda è vuota: resta quello che dice il server. */ });
    };
    leggi();
    const via = syncQueue.on("change", leggi);
    const viaProcessate = syncQueue.on("processed", ricarica);
    return () => { attivo = false; via(); viaProcessate(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, companyId]);
  return righe;
}

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
  const inCoda = useTimbratureInCoda(userId, companyId, () => { void query.refetch?.(); });
  const punches = useMemo(() => {
    const letti = query.data ?? EMPTY_PUNCHES;
    if (inCoda.length === 0) return letti;
    const noti = new Set(letti.map(p => p.id));
    return [...letti, ...inCoda.filter(r => !noti.has(r.id))]
      .sort((a, b) => a.timestamp_evento.localeCompare(b.timestamp_evento)) as typeof letti;
  }, [query.data, inCoda]);
  const ultimaInCoda = inCoda.reduce((m, r) => Math.max(m, Date.parse(r.timestamp_evento)), 0);
  const now = useMemo(() => new Date(Math.max(clockNow.getTime(), query.dataUpdatedAt || 0, ultimaInCoda)), [clockNow, query.dataUpdatedAt, ultimaInCoda]);
  const dayWindow = useMemo(() => campoDayWindow(day), [day]);
  const summary = useMemo(() => summarizeCampoTime(punches, { ...dayWindow, now, includeOpen: true }), [punches, dayWindow, now]);
  const todayPunches = useMemo(() => punches.filter(p => {
    const at = Date.parse(p.timestamp_evento);
    return at >= dayWindow.start.getTime() && at < dayWindow.end.getTime() && at <= now.getTime();
  }), [punches, dayWindow, now]);
  // Si può timbrare anche senza aver letto il server, quando il motivo è la rete: valgono copia sul telefono e coda.
  const pronto = !!query.isSuccess || query.fetchStatus === "paused" || (!!query.isError && erroreDiRete(query.error));
  return { ...query, summary, todayPunches, day, now, pronto };
}
