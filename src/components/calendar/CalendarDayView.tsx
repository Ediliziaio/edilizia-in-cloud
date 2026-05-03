import { useMemo, useState } from "react";
import {
  format,
  isSameDay,
  addDays,
  subDays,
} from "date-fns";
import { it } from "date-fns/locale";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, Hammer, Package, Wrench, CalendarClock, Check, Car, Settings, type LucideIcon } from "lucide-react";
import { useOperativeTravelLegs } from "@/hooks/useOperativeTravelLegs";
import { cn } from "@/lib/utils";
import { APPOINTMENT_ICONS, DEFAULT_CALENDAR_EVENT_COLORS, getCalendarEventStyle, mapAppointmentToEditData, type CalendarEventColors } from "@/lib/calendarUtils";
import { AppointmentDialog, type AppointmentData } from "@/components/appointments/AppointmentDialog";
import { EditOrderDatesDialog } from "./EditOrderDatesDialog";
import { toast } from "sonner";
import type { CalendarOrder, CalendarAppointment, GoogleBusySlot, ApprovedLeave, CalendarIntervento, CalendarManutenzione } from "@/types/calendar";
import { weatherCodeToEmoji, weatherCodeToLabel, type WeatherDay, type MultiLocationWeather, type LocationWeatherDay } from "@/hooks/useWeatherForecast";

const HOURS = Array.from({ length: 15 }, (_, i) => i + 6); // 06:00 – 20:00

interface CalendarDayViewProps {
  orders: CalendarOrder[];
  appointments?: CalendarAppointment[];
  busySlots?: GoogleBusySlot[];
  approvedLeaves?: ApprovedLeave[];
  currentDate: Date;
  onDateChange: (date: Date) => void;
  syncedAppointmentIds?: Set<string>;
  hiddenEventTypes?: Set<string>;
  warehouseInfo?: Map<string, import("@/types/calendar").CalendarWarehouseInfo>;
  weatherForecast?: Map<string, WeatherDay>;
  calendarWeatherMulti?: MultiLocationWeather;
  orderWeatherMap?: Map<string, { weather?: LocationWeatherDay; distanceKm?: number; durationMin?: number; durationLabel?: string; address?: string }>;
  interventi?: CalendarIntervento[];
  manutenzioni?: CalendarManutenzione[];
  eventColors?: CalendarEventColors;
}

export function CalendarDayView({
  orders,
  appointments = [],
  busySlots = [],
  approvedLeaves = [],
  currentDate,
  onDateChange,
  syncedAppointmentIds,
  hiddenEventTypes = new Set(),
  weatherForecast,
  calendarWeatherMulti,
  orderWeatherMap,
  interventi = [],
  manutenzioni = [],
  eventColors = DEFAULT_CALENDAR_EVENT_COLORS,
}: CalendarDayViewProps) {
  const queryClient = useQueryClient();
  const dateStr = format(currentDate, "yyyy-MM-dd");
  const isToday = isSameDay(currentDate, new Date());

  const [editingOrder, setEditingOrder] = useState<CalendarOrder | null>(null);
  const [editingAppointment, setEditingAppointment] = useState<AppointmentData | null>(null);
  const [appointmentDialogOpen, setAppointmentDialogOpen] = useState(false);

  // All-day events for this day
  const allDayEvents = useMemo(() => {
    const events: Array<{ type: string; order?: CalendarOrder; leave?: ApprovedLeave; busySlot?: GoogleBusySlot; intervento?: CalendarIntervento; manutenzione?: CalendarManutenzione }> = [];

    const posaEnabled = !hiddenEventTypes.has("posa");
    const merceEnabled = !hiddenEventTypes.has("merce");
    if (posaEnabled) {
      orders.filter(o => o.expected_date === dateStr).forEach(o => events.push({ type: "posa", order: o }));
    }
    if (merceEnabled) {
      orders.filter(o => o.warehouse_arrival_date === dateStr).forEach(o => events.push({ type: "merce", order: o }));
    }
    if (!hiddenEventTypes.has("lavoro")) {
      orders.forEach(o => {
        if (!o.work_start_date) return;
        const start = new Date(o.work_start_date);
        const end = o.work_end_date ? new Date(o.work_end_date) : start;
        if (currentDate < start || currentDate > end) return;
        // Evita doppione "lavoro" sul giorno in cui l'ordine è già visibile come posa o merce.
        if (posaEnabled && o.expected_date === dateStr) return;
        if (merceEnabled && o.warehouse_arrival_date === dateStr) return;
        events.push({ type: "lavoro", order: o });
      });
    }
    if (!hiddenEventTypes.has("google_busy")) {
      busySlots.filter(s => s.is_all_day && s.start_at.split("T")[0] === dateStr).forEach(s => events.push({ type: "google_busy", busySlot: s }));
    }
    if (!hiddenEventTypes.has("leaves")) {
      approvedLeaves.forEach(lr => {
        const start = new Date(lr.start_date);
        const end = new Date(lr.end_date);
        if (currentDate >= start && currentDate <= end) events.push({ type: "leave", leave: lr });
      });
    }
    if (!hiddenEventTypes.has("intervento")) {
      interventi.forEach(iv => {
        if (iv.data_intervento_prevista && iv.data_intervento_prevista.split("T")[0] === dateStr) {
          events.push({ type: "intervento", intervento: iv });
        }
      });
    }
    if (!hiddenEventTypes.has("manutenzione")) {
      manutenzioni.forEach(mn => {
        if (mn.prossima_scadenza && mn.prossima_scadenza.split("T")[0] === dateStr) {
          events.push({ type: "manutenzione", manutenzione: mn });
        }
      });
    }
    return events;
  }, [orders, busySlots, approvedLeaves, hiddenEventTypes, dateStr, currentDate, interventi, manutenzioni]);

  // Timed appointments for this day
  const timedAppointments = useMemo(() => {
    if (hiddenEventTypes.has("appuntamento")) return [];
    return appointments.filter(apt => apt.appointment_date === dateStr);
  }, [appointments, hiddenEventTypes, dateStr]);

  // Travel legs (only for appointments with lat/lng)
  const appointmentsWithLocation = useMemo(() =>
    timedAppointments.filter(a => a.lat && a.lng),
    [timedAppointments]
  );
  const { travelLegs, totalKm, totalMinutes } = useOperativeTravelLegs(appointmentsWithLocation);
  const travelLegMap = useMemo(() => {
    const map = new Map<string, typeof travelLegs[0]>();
    travelLegs.forEach(leg => map.set(leg.toId, leg));
    return map;
  }, [travelLegs]);
  const hasTravelData = appointmentsWithLocation.length > 0;
  const dailyWorkCount = allDayEvents.filter((event) => event.type === "posa" || event.type === "lavoro").length;
  const dailyOperationalCount = allDayEvents.length + timedAppointments.length;

  const colorMap: Record<string, string> = {
    posa: eventColors.posa,
    lavoro: eventColors.lavoro,
    merce: eventColors.merce,
    google_busy: eventColors.google_busy,
    leave: eventColors.leave,
  };
  const IconMap: Record<string, LucideIcon> = { posa: Hammer, lavoro: Wrench, merce: Package };

  const handleCreateAppointment = (hour: number) => {
    const time = `${String(hour).padStart(2, "0")}:00`;
    setEditingAppointment({
      id: undefined,
      title: "",
      description: null,
      appointment_type: "generico",
      appointment_date: dateStr,
      appointment_time: time,
      assigned_to: null,
      order_id: null,
      is_completed: false,
    });
    setAppointmentDialogOpen(true);
  };

  return (
    <Card className="p-3">
      {/* Navigation */}
      <div className="flex items-center justify-between mb-4">
        <Button variant="ghost" size="icon" onClick={() => onDateChange(subDays(currentDate, 1))}>
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div className="flex items-center gap-2">
          <span className={cn("font-semibold text-lg capitalize", isToday && "text-primary")}>
            {format(currentDate, "EEEE d MMMM yyyy", { locale: it })}
          </span>
          {isToday && <Badge variant="secondary" className="text-xs">Oggi</Badge>}
        </div>
        <Button variant="ghost" size="icon" onClick={() => onDateChange(addDays(currentDate, 1))}>
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>

      {/* Weather card — multi-location */}
      {(() => {
        const multiLocs = calendarWeatherMulti?.get(dateStr);
        if (multiLocs && multiLocs.length > 0) {
          return (
            <div className="mb-3 space-y-1.5">
              {multiLocs.map((loc, i) => {
                const isHeavyRain = loc.precip > 20;
                const isRainy = loc.precip > 5;
                return (
                  <div key={i} className={cn(
                    "flex items-center gap-3 p-2 rounded-lg border text-sm",
                    isHeavyRain ? "bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800" :
                    isRainy ? "bg-orange-50 border-orange-200 dark:bg-orange-900/20 dark:border-orange-800" :
                    "bg-sky-50 border-sky-200 dark:bg-sky-900/20 dark:border-sky-800"
                  )}>
                    <span className="text-2xl">{weatherCodeToEmoji(loc.code)}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {loc.orderRef && <span className="text-[10px] font-mono font-bold text-primary">{loc.orderRef}</span>}
                        {loc.customerName && <span className="text-xs font-semibold">{loc.customerName}</span>}
                      </div>
                      {loc.orderDesc && <p className="text-[10px] text-foreground/80 truncate">{loc.orderDesc}</p>}
                      {loc.address ? (
                        <span className="text-[10px] text-muted-foreground truncate block">{loc.address}</span>
                      ) : loc.city ? (
                        <span className="text-xs text-muted-foreground">{loc.city}</span>
                      ) : null}
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="font-medium">{loc.minTemp}° – {loc.maxTemp}°C</span>
                        <span className="text-xs text-muted-foreground">{weatherCodeToLabel(loc.code)}</span>
                        {loc.precip > 0 && <span className="text-xs text-blue-600">{loc.precip}mm</span>}
                      </div>
                      <p className={cn("text-xs", isHeavyRain ? "text-red-600 font-medium" : isRainy ? "text-orange-600" : "text-green-600")}>
                        {isHeavyRain ? "⚠️ Lavori esterni sconsigliati" : isRainy ? "⚠️ Rischio pioggia" : "✓ Ideale per lavori esterni"}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        }
        // Fallback: meteo singolo (sede)
        if (weatherForecast) {
          const w = weatherForecast.get(dateStr);
          if (!w) return null;
          const isHeavyRain = w.precip > 20;
          const isRainy = w.precip > 5;
          return (
            <div className={cn(
              "mb-3 flex items-center gap-3 p-2 rounded-lg border text-sm",
              isHeavyRain ? "bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800" :
              isRainy ? "bg-orange-50 border-orange-200 dark:bg-orange-900/20 dark:border-orange-800" :
              "bg-sky-50 border-sky-200 dark:bg-sky-900/20 dark:border-sky-800"
            )}>
              <span className="text-2xl">{weatherCodeToEmoji(w.code)}</span>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{w.minTemp}° – {w.maxTemp}°C</span>
                  {w.precip > 0 && <span className="text-xs text-blue-600">{w.precip}mm</span>}
                </div>
                <p className={cn("text-xs", isHeavyRain ? "text-red-600 font-medium" : isRainy ? "text-orange-600" : "text-green-600")}>
                  {isHeavyRain ? "⚠️ Lavori esterni sconsigliati" : isRainy ? "⚠️ Rischio pioggia" : "✓ Ideale per lavori esterni"}
                </p>
              </div>
            </div>
          );
        }
        return null;
      })()}

      {/* Travel summary */}
      {hasTravelData && (
        <div className="mb-3 flex items-center gap-3 p-2 rounded-lg border bg-slate-50 dark:bg-slate-900/30 text-sm">
          <Car className="h-4 w-4 text-muted-foreground shrink-0" />
          <div className="flex-1">
            <span className="font-medium">{totalKm.toFixed(1)} km</span>
            <span className="text-muted-foreground ml-2 text-xs">
              · {Math.round(totalMinutes)} min totali · {appointmentsWithLocation.length} tappe
            </span>
          </div>
        </div>
      )}

      <div className="mb-3 grid grid-cols-3 gap-2">
        <div className="rounded-lg border bg-card px-3 py-2">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Attività</p>
          <p className="text-lg font-bold">{dailyOperationalCount}</p>
        </div>
        <div className="rounded-lg border bg-card px-3 py-2">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Lavori</p>
          <p className="text-lg font-bold">{dailyWorkCount}</p>
        </div>
        <div className="rounded-lg border bg-card px-3 py-2">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Appunt.</p>
          <p className="text-lg font-bold">{timedAppointments.length}</p>
        </div>
      </div>

      {/* All-day events */}
      {allDayEvents.length > 0 && (
        <div className="mb-3 p-2 bg-muted/30 rounded-lg border space-y-1">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">Tutto il giorno</p>
          {allDayEvents.map((evt, idx) => {
            if (evt.type === "intervento" && evt.intervento) {
              return (
                <div key={idx} className="text-xs px-2 py-1 rounded flex items-center gap-1.5 border-l-2" style={getCalendarEventStyle(eventColors.intervento)}>
                  <Wrench className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{evt.intervento.subject}</span>
                </div>
              );
            }
            if (evt.type === "manutenzione" && evt.manutenzione) {
              return (
                <div key={idx} className="text-xs px-2 py-1 rounded flex items-center gap-1.5 border-l-2" style={getCalendarEventStyle(eventColors.manutenzione)}>
                  <Settings className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{evt.manutenzione.titolo}</span>
                </div>
              );
            }
            const o = evt.order;
            const lr = evt.leave;
            const label = lr
              ? `🏖 ${lr.employee?.first_name ?? ""} ${lr.employee?.last_name ?? ""}`
              : o
                ? (o.order_code || o.description?.slice(0, 30) || "Ordine")
                : evt.busySlot?.summary || "Occupato";
            const Icon = IconMap[evt.type];
            return (
              <div
                key={idx}
                className="text-xs px-2 py-1 rounded flex items-center gap-1.5 cursor-pointer border-l-2"
                style={getCalendarEventStyle(colorMap[evt.type] || eventColors.appuntamento)}
                onClick={() => o && setEditingOrder(o)}
              >
                {Icon && <Icon className="h-3.5 w-3.5 shrink-0" />}
                <span className="truncate">{label}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Hourly grid */}
      <div className="divide-y border rounded-lg overflow-hidden">
        {HOURS.map(hour => {
          const hourStr = String(hour).padStart(2, "0");
          const hourApts = timedAppointments.filter(apt => apt.appointment_time?.startsWith(hourStr));
          const hourBusy = !hiddenEventTypes.has("google_busy")
            ? busySlots.filter(s => {
                if (s.is_all_day) return false;
                const start = new Date(s.start_at);
                return format(start, "yyyy-MM-dd") === dateStr && start.getHours() === hour;
              })
            : [];

          return (
            <div
              key={hour}
              className={cn(
                "flex min-h-[56px] group",
                isToday && new Date().getHours() === hour && "bg-primary/5"
              )}
            >
              {/* Time label */}
              <div className="w-14 flex-shrink-0 p-2 text-xs text-muted-foreground text-right border-r bg-muted/20">
                {hourStr}:00
              </div>
              {/* Content */}
              <div
                className="flex-1 p-1.5 space-y-1 cursor-pointer hover:bg-muted/20 transition-colors"
                onClick={() => handleCreateAppointment(hour)}
              >
                {hourApts.map(apt => {
                  const Icon = APPOINTMENT_ICONS[apt.appointment_type] || CalendarClock;
                  const leg = travelLegMap.get(apt.id);
                  const isSynced = syncedAppointmentIds?.has(apt.id);
                  return (
                    <div key={apt.id}>
                      {leg && (
                        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground py-0.5 border-l-2 border-dashed border-muted-foreground/30 pl-2 my-0.5">
                          <Car className="h-3 w-3 shrink-0" />
                          <span>{leg.distance_text}</span>
                          <span>·</span>
                          <span>{leg.duration_text}</span>
                        </div>
                      )}
                      <div
                        className={cn(
                          "text-xs px-2 py-1 rounded flex items-center gap-1.5 cursor-pointer border-l-2",
                          apt.is_completed && "opacity-60 line-through"
                        )}
                        style={getCalendarEventStyle(eventColors.appuntamento)}
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingAppointment(mapAppointmentToEditData(apt));
                          setAppointmentDialogOpen(true);
                        }}
                      >
                        <Icon className="h-3.5 w-3.5 shrink-0" />
                        <span className="font-medium">{apt.appointment_time?.slice(0, 5)}</span>
                        <span className="truncate">{apt.title}</span>
                        {(apt.is_completed || isSynced) && <Check className="h-3.5 w-3.5 shrink-0 text-green-600 ml-auto" />}
                      </div>
                    </div>
                  );
                })}
                {hourBusy.map((s, idx) => (
                  <div key={idx} className="text-xs bg-muted px-2 py-1 rounded truncate text-muted-foreground">
                    {s.summary || "Occupato"}
                  </div>
                ))}
                {hourApts.length === 0 && hourBusy.length === 0 && (
                  <span className="text-[10px] text-muted-foreground/0 group-hover:text-muted-foreground/60 transition-colors">
                    Clicca per aggiungere appuntamento
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Appointment dialog */}
      {appointmentDialogOpen && (
        <AppointmentDialog
          open={appointmentDialogOpen}
          onOpenChange={(open) => {
            setAppointmentDialogOpen(open);
            if (!open) setEditingAppointment(null);
          }}
          initialData={editingAppointment ?? undefined}
          hideMarketingFields
          showOrderSelect
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: queryKeys.appointments.all });
            setAppointmentDialogOpen(false);
            setEditingAppointment(null);
          }}
          onDeleted={() => {
            queryClient.invalidateQueries({ queryKey: queryKeys.appointments.all });
            setAppointmentDialogOpen(false);
            setEditingAppointment(null);
          }}
        />
      )}

      {/* Order dates edit dialog */}
      {editingOrder && (
        <EditOrderDatesDialog
          order={editingOrder}
          open={!!editingOrder}
          onOpenChange={(open) => !open && setEditingOrder(null)}
          onSave={() => {
            queryClient.invalidateQueries({ queryKey: queryKeys.calendarOrders.all });
            setEditingOrder(null);
            toast.success("Date aggiornate");
          }}
          orderWeatherInfo={orderWeatherMap?.get(editingOrder.id)}
        />
      )}
    </Card>
  );
}
