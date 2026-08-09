/**
 * Presenze dell'operaio — calendario mensile con stato giornaliero.
 * Mostra solo le presenze dell'utente loggato da hr_timbrature + campo_timbrature.
 */
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval,
  getDay, addMonths, subMonths, isSameDay, isToday, isBefore,
} from "date-fns";
import { it } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Clock, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useMyHrProfilo } from "@/hooks/useTimbratura";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const GIORNI_SETTIMANA = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

const STATUS_COLORS: Record<string, string> = {
  presente: "bg-green-500",
  assente: "bg-red-400",
  ferie: "bg-blue-400",
  permesso: "bg-amber-400",
  malattia: "bg-orange-400",
  smart_working: "bg-indigo-400",
  trasferta: "bg-purple-400",
  festivita: "bg-sky-300",
  infortunio: "bg-red-600",
};

const STATUS_LABELS: Record<string, string> = {
  presente: "Presente",
  assente: "Assente",
  ferie: "Ferie",
  permesso: "Permesso",
  malattia: "Malattia",
  smart_working: "Smart Working",
  trasferta: "Trasferta",
  festivita: "Festivita",
  infortunio: "Infortunio",
};

export default function CampoPresenze() {
  const { user } = useAuth();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);

  const { data: hrProfilo } = useMyHrProfilo();
  const profiloId = hrProfilo?.id ?? null;

  // Timbrature del mese: campo_timbrature UNITE a hr_timbrature (quelle
  // inserite/corrette dall'ufficio vivono solo lì — il commento del file
  // le prometteva ma la query non le leggeva). Dedup per tipo+minuto:
  // la copia HR della stessa timbratura non deve contare doppio.
  const { data: timbrature = [], isLoading, isError } = useQuery({
    queryKey: ["campo-presenze", user?.id, profiloId, format(monthStart, "yyyy-MM")],
    queryFn: async () => {
      const [campoRes, hrRes] = await Promise.all([
        supabase
          .from("campo_timbrature")
          .select("*")
          .eq("user_id", user!.id)
          .gte("timestamp_evento", format(monthStart, "yyyy-MM-dd") + "T00:00:00")
          .lte("timestamp_evento", format(monthEnd, "yyyy-MM-dd") + "T23:59:59")
          .order("timestamp_evento", { ascending: true }),
        profiloId
          ? supabase
              .from("hr_timbrature")
              .select("tipo, timestamp")
              .eq("profilo_id", profiloId)
              .gte("timestamp", format(monthStart, "yyyy-MM-dd") + "T00:00:00")
              .lte("timestamp", format(monthEnd, "yyyy-MM-dd") + "T23:59:59")
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (campoRes.error) throw campoRes.error;
      if (hrRes.error) throw hrRes.error;

      const unite: Array<{ tipo: string; timestamp_evento: string }> = [
        ...((campoRes.data ?? []) as Array<{ tipo: string; timestamp_evento: string }>),
        ...(((hrRes.data ?? []) as Array<{ tipo: string; timestamp: string }>).map(h => ({
          tipo: h.tipo,
          timestamp_evento: h.timestamp,
        }))),
      ];
      const visti = new Set<string>();
      return unite
        .filter(t => {
          const key = `${t.tipo}|${String(t.timestamp_evento).slice(0, 16)}`;
          if (visti.has(key)) return false;
          visti.add(key);
          return true;
        })
        .sort((a, b) => String(a.timestamp_evento).localeCompare(String(b.timestamp_evento)));
    },
    enabled: !!user?.id,
  });

  // Richieste approvate (ferie/permessi/malattia)
  const { data: richieste = [] } = useQuery({
    queryKey: ["campo-richieste-approvate", user?.id, format(monthStart, "yyyy-MM")],
    queryFn: async () => {
      const { data } = await supabase
        .from("hr_richieste")
        .select("*")
        .eq("user_id", user!.id)
        .eq("stato", "approvata")
        .gte("data_fine", format(monthStart, "yyyy-MM-dd"))
        .lte("data_inizio", format(monthEnd, "yyyy-MM-dd"));
      return data ?? [];
    },
    enabled: !!user?.id,
  });

  // Mappa giorno → stato
  const dayStatusMap = useMemo(() => {
    const map: Record<string, { status: string; ore?: number; entrata?: string; uscita?: string }> = {};

    // Raggruppa timbrature per giorno
    const perGiorno: Record<string, any[]> = {};
    for (const t of timbrature as any[]) {
      const key = format(new Date(t.timestamp_evento), "yyyy-MM-dd");
      if (!perGiorno[key]) perGiorno[key] = [];
      perGiorno[key].push(t);
    }

    // Calcola stato, ore, entrata e uscita per ogni giorno
    for (const [key, timbs] of Object.entries(perGiorno)) {
      timbs.sort((a: any, b: any) => new Date(a.timestamp_evento).getTime() - new Date(b.timestamp_evento).getTime());
      const entrata = timbs.find((t: any) => t.tipo === "entrata");
      const uscita = [...timbs].reverse().find((t: any) => t.tipo === "uscita");

      // Calcola ore lavorate
      let totaleMs = 0;
      let ultimaEntrata: Date | null = null;
      for (const t of timbs) {
        const ts = new Date(t.timestamp_evento);
        if (t.tipo === "entrata" || t.tipo === "pausa_fine") ultimaEntrata = ts;
        else if ((t.tipo === "uscita" || t.tipo === "pausa_inizio") && ultimaEntrata) {
          totaleMs += ts.getTime() - ultimaEntrata.getTime();
          ultimaEntrata = null;
        }
      }
      const ore = Math.round((totaleMs / 3600000) * 10) / 10;

      map[key] = {
        status: "presente",
        ore,
        entrata: entrata ? format(new Date(entrata.timestamp_evento), "HH:mm") : undefined,
        uscita: uscita ? format(new Date(uscita.timestamp_evento), "HH:mm") : undefined,
      };
    }

    // Richieste approvate
    for (const r of richieste as any[]) {
      const start = new Date(r.data_inizio);
      const end = new Date(r.data_fine);
      const days = eachDayOfInterval({ start, end });
      for (const d of days) {
        const key = format(d, "yyyy-MM-dd");
        // La richiesta approvata vince se quel giorno non ha ore lavorate
        // vere: una timbratura vuota non deve nascondere ferie/malattia.
        if (!map[key] || (map[key].ore ?? 0) === 0) {
          map[key] = { status: r.tipo || "permesso" };
        }
      }
    }

    return map;
  }, [timbrature, richieste]);

  // Giorni del calendario
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startPadding = (getDay(monthStart) + 6) % 7; // Lunedi = 0

  // KPI
  const giorniPresente = Object.values(dayStatusMap).filter(d => d.status === "presente").length;
  const oreTotali = Object.values(dayStatusMap).reduce((sum, d) => sum + (d.ore ?? 0), 0);
  const giorniFerie = Object.values(dayStatusMap).filter(d => d.status === "ferie").length;
  const giorniMalattia = Object.values(dayStatusMap).filter(d => d.status === "malattia").length;

  const selectedDayData = selectedDay ? dayStatusMap[format(selectedDay, "yyyy-MM-dd")] : null;

  return (
    <div className="space-y-4 md:space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-lg md:text-xl font-semibold tracking-tight">Le mie presenze</h1>
        <p className="text-xs md:text-sm text-muted-foreground mt-0.5">Storico presenze e ore lavorate</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 md:gap-3">
        {[
          { label: "Giorni presente", value: giorniPresente, color: "text-green-600" },
          { label: "Ore totali", value: `${oreTotali.toFixed(1)}h`, color: "text-primary" },
          { label: "Giorni ferie", value: giorniFerie, color: "text-blue-500" },
          { label: "Giorni malattia", value: giorniMalattia, color: "text-orange-500" },
        ].map(kpi => (
          <Card key={kpi.label}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{kpi.label}</p>
              <p className={cn("text-2xl font-bold mt-1", kpi.color)}>{kpi.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Calendario */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <button onClick={() => setCurrentMonth(m => subMonths(m, 1))} className="p-2 hover:bg-muted active:bg-muted rounded-lg">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <CardTitle className="text-base capitalize">
              {format(currentMonth, "MMMM yyyy", { locale: it })}
            </CardTitle>
            <button onClick={() => setCurrentMonth(m => addMonths(m, 1))} className="p-2 hover:bg-muted active:bg-muted rounded-lg">
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </CardHeader>
        <CardContent>
          {isError ? (
            <p className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-4 text-center text-sm text-destructive">
              Non riesco a caricare le presenze. Controlla la connessione e riapri la pagina.
            </p>
          ) : isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {/* Header giorni */}
              <div className="grid grid-cols-7 gap-1 mb-1">
                {GIORNI_SETTIMANA.map(g => (
                  <div key={g} className="text-center text-xs font-medium text-muted-foreground py-1">{g}</div>
                ))}
              </div>

              {/* Griglia giorni */}
              <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: startPadding }).map((_, i) => (
                  <div key={`pad-${i}`} />
                ))}
                {days.map(day => {
                  const key = format(day, "yyyy-MM-dd");
                  const data = dayStatusMap[key];
                  const isSelected = selectedDay && isSameDay(day, selectedDay);
                  const isCurrentDay = isToday(day);
                  const isFuture = !isBefore(day, new Date()) && !isCurrentDay;

                  return (
                    <button
                      key={key}
                      onClick={() => setSelectedDay(day)}
                      className={cn(
                        "aspect-square rounded-lg flex flex-col items-center justify-center text-sm relative transition-all",
                        isSelected ? "ring-2 ring-primary" : "",
                        isCurrentDay ? "font-bold" : "",
                        isFuture ? "text-muted-foreground/50" : "text-foreground",
                      )}
                    >
                      <span>{format(day, "d")}</span>
                      {data && (
                        <div className={cn("w-2 h-2 rounded-full mt-0.5", STATUS_COLORS[data.status] || "bg-gray-300")} />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Legenda */}
              <div className="flex flex-wrap gap-3 mt-4 pt-3 border-t border-border">
                {Object.entries(STATUS_LABELS).slice(0, 5).map(([key, label]) => (
                  <div key={key} className="flex items-center gap-1.5">
                    <div className={cn("w-2.5 h-2.5 rounded-full", STATUS_COLORS[key])} />
                    <span className="text-xs text-muted-foreground">{label}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Dettaglio giorno selezionato */}
      {selectedDay && (
        <Card>
          <CardContent className="p-4">
            <p className="text-sm font-semibold text-foreground capitalize mb-2">
              {format(selectedDay, "EEEE d MMMM yyyy", { locale: it })}
            </p>
            {selectedDayData ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Badge className={cn("text-white text-xs", STATUS_COLORS[selectedDayData.status])}>
                    {STATUS_LABELS[selectedDayData.status] || selectedDayData.status}
                  </Badge>
                </div>
                {selectedDayData.entrata && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="w-4 h-4" />
                    <span>Entrata: {selectedDayData.entrata?.slice(0, 5)}</span>
                    {selectedDayData.uscita && <span>— Uscita: {selectedDayData.uscita?.slice(0, 5)}</span>}
                  </div>
                )}
                {selectedDayData.ore != null && (
                  <p className="text-sm text-muted-foreground">
                    Ore lavorate: <span className="text-primary font-semibold">{selectedDayData.ore}h</span>
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Nessun dato per questo giorno</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
