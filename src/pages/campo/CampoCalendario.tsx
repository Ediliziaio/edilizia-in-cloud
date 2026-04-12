/**
 * Lavori — vista giornaliera/settimanale per l'operaio.
 * Mostra i cantieri programmati per ogni giorno in base a work_start_date / work_end_date.
 * Strip settimanale + lista cantieri del giorno selezionato.
 */
import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  format, addDays, startOfWeek, isSameDay, isWithinInterval,
  addWeeks, subWeeks, parseISO, isToday, isTomorrow, isYesterday,
  differenceInCalendarDays,
} from "date-fns";
import { it } from "date-fns/locale";
import {
  ChevronLeft, ChevronRight, MapPin, Loader2, CalendarOff,
  Clock, Navigation, HardHat, CheckCircle2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

// ── Helpers ──
function dayLabel(day: Date): string {
  if (isToday(day)) return "Oggi";
  if (isTomorrow(day)) return "Domani";
  if (isYesterday(day)) return "Ieri";
  return format(day, "EEEE d MMMM", { locale: it });
}

function statusBadge(status: string) {
  const map: Record<string, { label: string; cls: string }> = {
    confermato:   { label: "Confermato",   cls: "bg-blue-100 text-blue-700" },
    in_corso:     { label: "In corso",     cls: "bg-green-100 text-green-700" },
    in_lavorazione: { label: "In corso",   cls: "bg-green-100 text-green-700" },
    completato:   { label: "Completato",   cls: "bg-slate-100 text-slate-600" },
    sospeso:      { label: "Sospeso",      cls: "bg-amber-100 text-amber-700" },
  };
  const found = map[status?.toLowerCase()] ?? { label: status, cls: "bg-muted text-muted-foreground" };
  return found;
}

export default function CampoCalendario() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();

  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [selectedDay, setSelectedDay] = useState(new Date());
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  // Employee ID
  const { data: employeeId } = useQuery({
    queryKey: ["campo-emp-id", user?.id, profile?.company_id],
    queryFn: async () => {
      const { data } = await supabase
        .from("employees")
        .select("id")
        .eq("user_id", user!.id)
        .eq("company_id", profile!.company_id)
        .maybeSingle();
      return data?.id ?? null;
    },
    enabled: !!user?.id && !!profile?.company_id,
  });

  // Tutti i cantieri assegnati con date
  const { data: allCantieri = [], isLoading } = useQuery({
    queryKey: ["campo-lavori-full", employeeId],
    queryFn: async () => {
      const { data } = await supabase
        .from("order_employees")
        .select(`
          id, order_id,
          order:orders(
            id, order_code, description, status,
            indirizzo_lavori,
            percentuale_avanzamento,
            work_start_date,
            work_end_date
          )
        `)
        .eq("employee_id", employeeId!);
      const seen = new Set<string>();
      return (data ?? []).filter((a: any) => {
        if (!a.order?.id || seen.has(a.order.id)) return false;
        seen.add(a.order.id);
        const status = a.order.status?.toLowerCase();
        if (status === "annullato" || status === "chiuso") return false;
        return true;
      });
    },
    enabled: !!employeeId,
  });

  // Cantieri per giorno selezionato
  const cantieriGiorno = useMemo(() => {
    return allCantieri.filter((a: any) => {
      const order = a.order;
      if (!order) return false;
      // Se ha date di lavoro, filtra per giorno
      if (order.work_start_date && order.work_end_date) {
        const start = parseISO(order.work_start_date);
        const end = parseISO(order.work_end_date);
        return isWithinInterval(selectedDay, { start, end });
      }
      if (order.work_start_date) {
        return isSameDay(parseISO(order.work_start_date), selectedDay) ||
               parseISO(order.work_start_date) <= selectedDay;
      }
      // Senza date, mostra sempre (non programmato)
      return true;
    });
  }, [allCantieri, selectedDay]);

  // Conta cantieri per ogni giorno della settimana (per i dot)
  const cantieriPerGiorno = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const day of days) {
      const key = format(day, "yyyy-MM-dd");
      counts[key] = allCantieri.filter((a: any) => {
        const order = a.order;
        if (!order) return false;
        if (order.work_start_date && order.work_end_date) {
          return isWithinInterval(day, {
            start: parseISO(order.work_start_date),
            end: parseISO(order.work_end_date),
          });
        }
        if (order.work_start_date) {
          return isSameDay(parseISO(order.work_start_date), day) ||
                 parseISO(order.work_start_date) <= day;
        }
        return true;
      }).length;
    }
    return counts;
  }, [allCantieri, days]);

  // Separa: programmati oggi vs non programmati
  const { programmati, nonProgrammati } = useMemo(() => {
    const prog: any[] = [];
    const noProg: any[] = [];
    cantieriGiorno.forEach((a: any) => {
      if (a.order?.work_start_date) prog.push(a);
      else noProg.push(a);
    });
    return { programmati: prog, nonProgrammati: noProg };
  }, [cantieriGiorno]);

  return (
    <div className="flex flex-col h-full max-w-3xl mx-auto">
      {/* Header settimana */}
      <div className="bg-gradient-to-b from-muted/80 to-background border-b border-border/50 px-4 pt-3 pb-4">
        {/* Navigazione settimana */}
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={() => setWeekStart(w => subWeeks(w, 1))}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-background border active:scale-95 transition-all"
          >
            <ChevronLeft className="w-5 h-5 text-foreground" />
          </button>
          <div className="text-center">
            <span className="text-sm font-semibold text-foreground capitalize">
              {format(weekStart, "MMMM yyyy", { locale: it })}
            </span>
          </div>
          <button
            onClick={() => setWeekStart(w => addWeeks(w, 1))}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-background border active:scale-95 transition-all"
          >
            <ChevronRight className="w-5 h-5 text-foreground" />
          </button>
        </div>

        {/* Strip 7 giorni */}
        <div className="flex gap-1">
          {days.map((day) => {
            const isSelected = isSameDay(day, selectedDay);
            const isDayToday = isToday(day);
            const key = format(day, "yyyy-MM-dd");
            const count = cantieriPerGiorno[key] ?? 0;

            return (
              <button
                key={day.toISOString()}
                onClick={() => setSelectedDay(day)}
                className={cn(
                  "flex-1 flex flex-col items-center py-2 rounded-2xl transition-all duration-150 relative",
                  isSelected
                    ? "bg-primary shadow-sm shadow-primary/20"
                    : "bg-transparent active:bg-muted"
                )}
              >
                <span className={cn(
                  "text-[10px] font-semibold uppercase",
                  isSelected ? "text-primary-foreground" : "text-muted-foreground"
                )}>
                  {format(day, "EEE", { locale: it }).slice(0, 2)}
                </span>
                <span className={cn(
                  "text-base font-bold mt-0.5",
                  isSelected ? "text-primary-foreground" :
                  isDayToday ? "text-primary" : "text-foreground"
                )}>
                  {format(day, "d")}
                </span>
                {/* Dots per cantieri */}
                {count > 0 && (
                  <div className="flex gap-0.5 mt-1">
                    {Array.from({ length: Math.min(count, 3) }).map((_, i) => (
                      <div
                        key={i}
                        className={cn(
                          "w-1.5 h-1.5 rounded-full",
                          isSelected ? "bg-primary-foreground/70" : "bg-primary/60"
                        )}
                      />
                    ))}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Contenuto giorno */}
      <div className="flex-1 overflow-y-auto px-4 py-4 pb-24 md:pb-6">
        {/* Label giorno */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-foreground capitalize">
            {dayLabel(selectedDay)}
          </h2>
          {!isToday(selectedDay) && (
            <button
              onClick={() => {
                setSelectedDay(new Date());
                setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }));
              }}
              className="text-xs font-semibold text-primary px-3 py-1.5 rounded-lg bg-primary/10 active:bg-primary/20 transition-all"
            >
              Oggi
            </button>
          )}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : cantieriGiorno.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
            <CalendarOff className="w-12 h-12 text-muted-foreground/40" />
            <div>
              <p className="font-medium text-muted-foreground">Nessun lavoro programmato</p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                {isToday(selectedDay)
                  ? "Non hai cantieri assegnati per oggi"
                  : `Nessun cantiere per ${format(selectedDay, "EEEE d MMMM", { locale: it })}`
                }
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            {/* Cantieri programmati */}
            {programmati.length > 0 && (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold flex items-center gap-1.5">
                  <HardHat className="w-3.5 h-3.5" />
                  Programmati ({programmati.length})
                </p>
                {programmati.map((a: any) => (
                  <CantiereCard key={a.id} assignment={a} selectedDay={selectedDay} onTap={() => navigate(`/campo/lavoro/${a.order?.id}`)} />
                ))}
              </div>
            )}

            {/* Cantieri senza data (sempre visibili) */}
            {nonProgrammati.length > 0 && (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  Senza programmazione ({nonProgrammati.length})
                </p>
                {nonProgrammati.map((a: any) => (
                  <CantiereCard key={a.id} assignment={a} selectedDay={selectedDay} onTap={() => navigate(`/campo/lavoro/${a.order?.id}`)} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Card cantiere ──
function CantiereCard({ assignment, selectedDay, onTap }: { assignment: any; selectedDay: Date; onTap: () => void }) {
  const order = assignment.order;
  if (!order) return null;

  const badge = statusBadge(order.status);
  const perc = order.percentuale_avanzamento ?? 0;
  const hasDateRange = order.work_start_date && order.work_end_date;

  // Calcola giorno X di Y
  let dayInfo = "";
  if (hasDateRange) {
    const start = parseISO(order.work_start_date);
    const end = parseISO(order.work_end_date);
    const totalDays = differenceInCalendarDays(end, start) + 1;
    const currentDay = differenceInCalendarDays(selectedDay, start) + 1;
    dayInfo = `Giorno ${currentDay} di ${totalDays}`;
  }

  return (
    <button
      onClick={onTap}
      className="w-full bg-background border border-border/80 rounded-2xl p-4 text-left active:scale-[0.98] transition-all shadow-sm hover:shadow-md"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-0.5">
            <p className="font-bold text-foreground text-base">{order.order_code}</p>
            <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full", badge.cls)}>
              {badge.label}
            </span>
          </div>
          <p className="text-sm text-muted-foreground line-clamp-2">{order.description}</p>
        </div>
        <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0 mt-1" />
      </div>

      {/* Info row */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 mb-3">
        {order.indirizzo_lavori && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <MapPin className="w-3.5 h-3.5 text-primary/60 shrink-0" />
            <span className="truncate max-w-[200px]">{order.indirizzo_lavori}</span>
          </div>
        )}
        {dayInfo && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="w-3.5 h-3.5 text-primary/60 shrink-0" />
            <span>{dayInfo}</span>
          </div>
        )}
      </div>

      {/* Date range */}
      {hasDateRange && (
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground mb-3 bg-muted/50 rounded-lg px-2.5 py-1.5">
          <Navigation className="w-3 h-3 shrink-0" />
          <span>
            {format(parseISO(order.work_start_date), "d MMM", { locale: it })} → {format(parseISO(order.work_end_date), "d MMM", { locale: it })}
          </span>
        </div>
      )}

      {/* Progress bar */}
      <div className="flex items-center gap-2">
        <div className="flex-1 bg-muted rounded-full h-2">
          <div
            className={cn(
              "h-2 rounded-full transition-all",
              perc >= 100 ? "bg-green-500" : perc > 0 ? "bg-primary" : "bg-muted-foreground/20"
            )}
            style={{ width: `${Math.max(perc, 2)}%` }}
          />
        </div>
        <div className="flex items-center gap-1">
          {perc >= 100 && <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />}
          <span className="text-xs font-semibold tabular-nums text-muted-foreground">
            {perc}%
          </span>
        </div>
      </div>
    </button>
  );
}
