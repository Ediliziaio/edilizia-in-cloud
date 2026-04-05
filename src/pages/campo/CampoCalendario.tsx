/**
 * Calendario settimanale mobile per i lavori assegnati all'operaio/sub.
 * Strip orizzontale 7 giorni + lista lavori del giorno selezionato.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  format, addDays, startOfWeek, isSameDay, parseISO,
  addWeeks, subWeeks
} from "date-fns";
import { it } from "date-fns/locale";
import { ChevronLeft, ChevronRight, MapPin, Loader2, CalendarOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

export default function CampoCalendario() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [selectedDay, setSelectedDay] = useState(new Date());

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  // Fetch assegnazioni nell'intervallo settimana visibile
  const rangeStart = format(weekStart, "yyyy-MM-dd");
  const rangeEnd = format(addDays(weekStart, 6), "yyyy-MM-dd");

  const { data: assegnazioni = [], isLoading } = useQuery({
    queryKey: ["campo-calendario", user?.id, rangeStart, rangeEnd],
    queryFn: async () => {
      const { data } = await supabase
        .from("order_campo_assignments")
        .select(`
          *,
          order:orders(id, order_code, description, status, address_line1, city, percentuale_avanzamento)
        `)
        .eq("user_id", user!.id)
        .or(`data_inizio.lte.${rangeEnd},data_inizio.is.null`)
        .or(`data_fine_prevista.gte.${rangeStart},data_fine_prevista.is.null`);
      return data ?? [];
    },
    enabled: !!user?.id,
  });

  // Giorni con lavori
  const daysWithWork = new Set(
    assegnazioni.flatMap((a: any) => {
      const start = a.data_inizio ? parseISO(a.data_inizio) : weekStart;
      const end = a.data_fine_prevista ? parseISO(a.data_fine_prevista) : addDays(weekStart, 6);
      const result: string[] = [];
      let d = start;
      while (d <= end && d <= addDays(weekStart, 6)) {
        result.push(format(d, "yyyy-MM-dd"));
        d = addDays(d, 1);
      }
      return result;
    })
  );

  // Lavori del giorno selezionato
  const selectedDateStr = format(selectedDay, "yyyy-MM-dd");
  const lavoriGiorno = assegnazioni.filter((a: any) => {
    const start = a.data_inizio ? parseISO(a.data_inizio) : new Date(0);
    const end = a.data_fine_prevista ? parseISO(a.data_fine_prevista) : new Date(9999, 0);
    const sel = parseISO(selectedDateStr);
    return sel >= start && sel <= end;
  });

  return (
    <div className="flex flex-col h-full">
      {/* Header settimana */}
      <div className="bg-slate-900 border-b border-slate-800 px-4 py-3">
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={() => { setWeekStart(w => subWeeks(w, 1)); }}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-800 active:bg-slate-700 transition-colors"
          >
            <ChevronLeft className="w-5 h-5 text-white" />
          </button>
          <span className="text-sm font-medium text-white">
            {format(weekStart, "MMMM yyyy", { locale: it })}
          </span>
          <button
            onClick={() => { setWeekStart(w => addWeeks(w, 1)); }}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-800 active:bg-slate-700 transition-colors"
          >
            <ChevronRight className="w-5 h-5 text-white" />
          </button>
        </div>

        {/* Strip 7 giorni */}
        <div className="flex gap-1">
          {days.map((day) => {
            const isSelected = isSameDay(day, selectedDay);
            const isToday = isSameDay(day, new Date());
            const hasWork = daysWithWork.has(format(day, "yyyy-MM-dd"));

            return (
              <button
                key={day.toISOString()}
                onClick={() => setSelectedDay(day)}
                className={cn(
                  "flex-1 flex flex-col items-center py-2 rounded-xl transition-all duration-150",
                  isSelected ? "bg-amber-500" : "bg-transparent active:bg-slate-800"
                )}
              >
                <span className={cn(
                  "text-[10px] font-medium",
                  isSelected ? "text-black" : "text-slate-500"
                )}>
                  {format(day, "EEE", { locale: it }).slice(0, 1).toUpperCase()}
                </span>
                <span className={cn(
                  "text-sm font-bold mt-0.5",
                  isSelected ? "text-black" :
                  isToday ? "text-amber-400" : "text-white"
                )}>
                  {format(day, "d")}
                </span>
                {hasWork && !isSelected && (
                  <div className="w-1 h-1 rounded-full bg-amber-500 mt-0.5" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Lista lavori del giorno */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <p className="text-sm text-slate-400 mb-3">
          {format(selectedDay, "EEEE d MMMM", { locale: it })}
        </p>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-slate-500" />
          </div>
        ) : lavoriGiorno.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
            <CalendarOff className="w-10 h-10 text-slate-700" />
            <p className="text-slate-400">Giornata libera</p>
          </div>
        ) : (
          <div className="space-y-3">
            {lavoriGiorno.map((a: any) => (
              <button
                key={a.id}
                onClick={() => navigate(`/campo/lavoro/${a.order?.id}`)}
                className="w-full bg-slate-900 border border-slate-800 rounded-2xl p-4 text-left active:scale-[0.98] transition-transform"
              >
                <div className="flex items-start justify-between mb-1">
                  <p className="font-semibold text-white">{a.order?.order_code}</p>
                  {a.is_capocantiere && (
                    <span className="text-[10px] bg-amber-500/20 text-amber-400 rounded-full px-2 py-0.5">
                      Capo
                    </span>
                  )}
                </div>
                <p className="text-sm text-slate-300 mb-2 line-clamp-2">{a.order?.description}</p>
                {a.order?.address_line1 && (
                  <div className="flex items-center gap-1 text-xs text-slate-400">
                    <MapPin className="w-3 h-3" />
                    <span>{a.order.address_line1}, {a.order.city}</span>
                  </div>
                )}
                <div className="w-full bg-slate-800 rounded-full h-1 mt-2">
                  <div
                    className="bg-amber-500 h-1 rounded-full"
                    style={{ width: `${a.order?.percentuale_avanzamento ?? 0}%` }}
                  />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
