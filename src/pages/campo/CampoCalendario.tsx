/**
 * Calendario settimanale per i lavori assegnati all'operaio/sub.
 * Strip orizzontale 7 giorni + lista cantieri assegnati.
 * Usa order_employees come fonte dati (con fallback order_campo_assignments).
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  format, addDays, startOfWeek, isSameDay,
  addWeeks, subWeeks,
} from "date-fns";
import { it } from "date-fns/locale";
import { ChevronLeft, ChevronRight, MapPin, Loader2, CalendarOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

export default function CampoCalendario() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();

  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [selectedDay, setSelectedDay] = useState(new Date());
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  // Cerca employee_id
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

  // Cantieri assegnati (tutti, non filtrati per data — le date non sono su order_employees)
  const { data: cantieri = [], isLoading } = useQuery({
    queryKey: ["campo-calendario-cantieri", employeeId],
    queryFn: async () => {
      const { data } = await supabase
        .from("order_employees")
        .select(`
          id, order_id,
          order:orders(
            id, order_code, description, status,
            indirizzo_lavori,
            percentuale_avanzamento
          )
        `)
        .eq("employee_id", employeeId!);
      // Deduplica per order_id
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

  return (
    <div className="flex flex-col h-full">
      {/* Header settimana */}
      <div className="bg-muted border-b border-border px-4 py-3">
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={() => setWeekStart(w => subWeeks(w, 1))}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-background border active:bg-muted transition-colors"
          >
            <ChevronLeft className="w-5 h-5 text-foreground" />
          </button>
          <span className="text-sm font-medium text-foreground capitalize">
            {format(weekStart, "MMMM yyyy", { locale: it })}
          </span>
          <button
            onClick={() => setWeekStart(w => addWeeks(w, 1))}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-background border active:bg-muted transition-colors"
          >
            <ChevronRight className="w-5 h-5 text-foreground" />
          </button>
        </div>

        {/* Strip 7 giorni */}
        <div className="flex gap-1">
          {days.map((day) => {
            const isSelected = isSameDay(day, selectedDay);
            const isDayToday = isSameDay(day, new Date());

            return (
              <button
                key={day.toISOString()}
                onClick={() => setSelectedDay(day)}
                className={cn(
                  "flex-1 flex flex-col items-center py-2 rounded-xl transition-all duration-150",
                  isSelected ? "bg-primary" : "bg-transparent active:bg-muted"
                )}
              >
                <span className={cn(
                  "text-[10px] font-medium",
                  isSelected ? "text-primary-foreground" : "text-muted-foreground"
                )}>
                  {format(day, "EEE", { locale: it }).slice(0, 1).toUpperCase()}
                </span>
                <span className={cn(
                  "text-sm font-bold mt-0.5",
                  isSelected ? "text-primary-foreground" :
                  isDayToday ? "text-primary" : "text-foreground"
                )}>
                  {format(day, "d")}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Lista cantieri */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <p className="text-sm text-muted-foreground mb-3 capitalize">
          {format(selectedDay, "EEEE d MMMM", { locale: it })}
        </p>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : cantieri.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
            <CalendarOff className="w-10 h-10 text-muted-foreground" />
            <p className="text-muted-foreground">Nessun cantiere assegnato</p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
              I tuoi cantieri ({cantieri.length})
            </p>
            {cantieri.map((a: any) => (
              <button
                key={a.id}
                onClick={() => navigate(`/campo/lavoro/${a.order?.id}`)}
                className="w-full bg-muted/50 border border-border rounded-xl p-4 text-left hover:bg-muted active:scale-[0.98] transition-all"
              >
                <div className="flex items-start justify-between mb-1">
                  <p className="font-semibold text-foreground">{a.order?.order_code}</p>
                </div>
                <p className="text-sm text-muted-foreground mb-2 line-clamp-2">{a.order?.description}</p>
                {a.order?.indirizzo_lavori && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground mb-2">
                    <MapPin className="w-3 h-3 shrink-0" />
                    <span className="truncate">{a.order.indirizzo_lavori}</span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-muted rounded-full h-1.5">
                    <div
                      className="bg-primary h-1.5 rounded-full"
                      style={{ width: `${a.order?.percentuale_avanzamento ?? 0}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-muted-foreground tabular-nums">
                    {a.order?.percentuale_avanzamento ?? 0}%
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
