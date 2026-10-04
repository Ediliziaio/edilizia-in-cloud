/**
 * Timbratura per operai e subappaltatori.
 * La giornata è una sola: «Inizia la giornata», un tocco su ogni posto in cui si arriva,
 * «Fine giornata» (vedi CampoTimbroCard). Qui sotto: ore di oggi e storico degli ultimi 14 giorni.
 */
import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { LogIn, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { useCampoDayTime } from "@/hooks/campo/useCampoDayTime";
import { campoDayWindow, campoReportHours, summarizeCampoTime } from "@/lib/campo/timeSummary";
import { CampoTimbroCard, type TimbroEsito } from "@/components/campo/CampoTimbroCard";
import { useCampoAssignments } from "@/hooks/campo/useCampoAssignments";
import { useCampoSedi } from "@/hooks/campo/useCampoSedi";
import { costruisciLuoghi, righeTimeline, type RigaTimeline } from "@/lib/campo/luoghi";
import { campoWorkDay, reportDayAllowed } from "@/lib/campo/workDay";

type TipoTimbratura = "entrata" | "uscita" | "pausa_inizio" | "pausa_fine";

interface Timbratura {
  id: string;
  tipo: TipoTimbratura;
  timestamp_evento: string;
  order_id: string | null;
  lat?: number;
  lng?: number;
  indirizzo?: string;
  fonte: string;
}

function etichettaRiga(r: RigaTimeline): string {
  switch (r.tipo) {
    case "inizio": return r.luogo ? `Inizio giornata · ${r.luogo}` : "Inizio giornata";
    case "cambio": return r.luogo ? `Arrivato a ${r.luogo}` : "Cambio posto";
    case "pausa_inizio": return "Inizio pausa";
    case "pausa_fine": return "Fine pausa";
    default: return "Fine giornata";
  }
}

export default function CampoTimbratura() {
  const { user, profile } = useAuth();
  const [params] = useSearchParams();
  return <CampoTimbraturaEditor key={`${profile?.company_id}:${user?.id}:${params.get("order_id")}`} />;
}

function CampoTimbraturaEditor() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [lastExit, setLastExit] = useState<{ orderId: string; day: string } | null>(null);
  const [searchParams] = useSearchParams();
  const companyId = profile?.company_id ?? null;
  const dayTime = useCampoDayTime(user?.id, companyId);
  const linkedOrderId = searchParams.get("order_id");
  const today = campoWorkDay(dayTime.now);
  const timbratureOggi = dayTime.todayPunches;
  const assegnazioni = useCampoAssignments();
  const sedi = useCampoSedi();
  const righe = useMemo(
    () => righeTimeline(timbratureOggi, costruisciLuoghi({ assegnazioni: assegnazioni.data ?? [], sedi: sedi.data ?? [], oggiIds: new Set() })),
    [timbratureOggi, assegnazioni.data, sedi.data],
  );
  const isInPausa = dayTime.summary.state === "paused";
  const minutiPausa = Math.round(dayTime.summary.pauseMinutes);
  const oreLavorate = campoReportHours(dayTime.summary.workMinutes);
  // Le ore «di questo cantiere»: quello del link, altrimenti quello in cui sei adesso.
  const focusOrderId = linkedOrderId ?? dayTime.summary.activeOrderId;
  const focusSiteMinutes = focusOrderId ? dayTime.summary.byOrder.get(focusOrderId)?.workMinutes ?? 0 : null;

  // Storico 14 giorni
  const { data: storico = [] } = useQuery({
    queryKey: ["campo-timbrature-storico", companyId, user?.id],
    queryFn: async () => {
      const from = new Date();
      from.setDate(from.getDate() - 14);
      const { data, error } = await supabase
        .from("campo_timbrature")
        .select("*")
        .eq("user_id", user!.id)
        .eq("company_id", companyId!)
        .gte("timestamp_evento", from.toISOString())
        .order("timestamp_evento", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Timbratura[];
    },
    enabled: !!user?.id && !!companyId,
  });

  const storicoByDay = useMemo(() => {
    const byDay: Record<string, Timbratura[]> = {};
    storico.forEach(t => {
      const day = campoWorkDay(parseISO(t.timestamp_evento));
      if (!byDay[day]) byDay[day] = [];
      byDay[day].push(t);
    });
    return byDay;
  }, [storico]);

  const dopoTimbro = (esito: TimbroEsito) => {
    if (esito.tipo === "uscita" && esito.orderId) setLastExit({ orderId: esito.orderId, day: esito.day });
  };

  // Niente h-full + scroll interno: il <main> della shell è l'unico scroller
  // mobile (il suo pb-28 dà già aria sopra la bottom nav).
  return (
    <div className="flex flex-col">
      <div className="px-4 py-4 space-y-4">
        <CampoTimbroCard preferOrderId={linkedOrderId} onPunched={dopoTimbro} />
        {lastExit && reportDayAllowed(lastExit.day, dayTime.now) && <div role="status" className="space-y-2 rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-900">
          <p className="font-semibold">Giornata finita. Il rapportino è separato.</p>
          <p>Puoi compilarlo ora o entro il giorno successivo al lavoro.</p>
          <button type="button" className="min-h-12 w-full rounded-lg border border-green-300 bg-background px-3 font-semibold"
            onClick={() => navigate(`/campo/lavoro/${lastExit.orderId}/rapportino?data=${lastExit.day}`)}>Compila il rapportino</button>
        </div>}

        {/* Ore lavorate oggi */}
        <div className="bg-muted border border-border rounded-2xl p-5">
          <p className="text-xs text-muted-foreground mb-1">Oggi — {format(new Date(), "EEEE d MMMM", { locale: it })}</p>
          <div className="flex items-end gap-2">
            <span className="text-4xl font-bold text-foreground">{dayTime.isError || dayTime.isLoading ? "—" : oreLavorate.toFixed(1)}</span>
            <span className="text-lg text-muted-foreground mb-1">h nella giornata</span>
          </div>
          {minutiPausa > 0 && (
            <p className="text-xs text-muted-foreground mt-1">{minutiPausa} min pausa{isInPausa ? " (in corso)" : ""}</p>
          )}
          {focusSiteMinutes != null && dayTime.isSuccess && (
            <p className="mt-2 text-sm">Su questo cantiere: {campoReportHours(focusSiteMinutes)} h · pause escluse</p>
          )}

          {/* Cronologia di oggi: un cambio di posto è una riga sola */}
          {righe.length > 0 && (
            <div className="mt-4 space-y-2">
              {righe.map((r) => (
                <div key={r.id} className="flex items-center gap-3">
                  <div className={cn(
                    "w-2 h-2 rounded-full shrink-0",
                    r.tipo === "inizio" ? "bg-green-400" :
                    r.tipo === "fine" ? "bg-red-400" :
                    r.tipo === "cambio" ? "bg-blue-400" :
                    "bg-primary"
                  )} />
                  <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
                    <span className="min-w-0 truncate text-sm text-foreground">{etichettaRiga(r)}</span>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {format(parseISO(r.at), "HH:mm")}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Storico */}
        <div>
          <p className="text-xs text-muted-foreground mb-3 uppercase tracking-wide">Storico ultimi 14 giorni</p>
          {Object.entries(storicoByDay).filter(([day]) => day !== today).length === 0 && (
            <p className="rounded-xl border border-dashed border-border py-6 text-center text-sm text-muted-foreground">
              Nessuna timbratura nei giorni scorsi. Qui vedrai le ore degli ultimi 14 giorni.
            </p>
          )}
          <div className="space-y-3">
            {Object.entries(storicoByDay)
              .filter(([day]) => day !== today)
              .map(([day, items]) => {
                const asc = [...items].sort((a, b) => a.timestamp_evento.localeCompare(b.timestamp_evento));
                const historical = summarizeCampoTime(storico, { ...campoDayWindow(day), now: dayTime.now });
                const ent = asc.find(t => t.tipo === "entrata");
                const usc = [...asc].reverse().find(t => t.tipo === "uscita");
                const ore = (historical.workMinutes / 60).toFixed(1);
                return (
                  <div key={day} className="bg-muted border border-border rounded-xl p-3">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-medium text-foreground">
                        {format(parseISO(day), "EEE d MMM", { locale: it })}
                      </p>
                      <span className="text-sm text-primary font-semibold">{ore}h</span>
                    </div>
                    <div className="flex gap-3">
                      {ent && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <LogIn className="w-3 h-3 text-green-600" />
                          {format(parseISO(ent.timestamp_evento), "HH:mm")}
                        </span>
                      )}
                      {usc && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <LogOut className="w-3 h-3 text-red-600" />
                          {format(parseISO(usc.timestamp_evento), "HH:mm")}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      </div>
    </div>
  );
}
