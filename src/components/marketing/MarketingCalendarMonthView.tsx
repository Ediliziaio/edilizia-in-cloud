import { useMemo, useState, useRef } from "react";
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  isSameMonth,
  isToday,
  isSameDay,
  format,
} from "date-fns";
import { it } from "date-fns/locale";
import { DndContext, DragOverlay, MouseSensor, TouchSensor, useSensors, useSensor, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { Calendar as CalendarIcon, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import type { MarketingAppointment } from "@/types/marketingCalendar";
import { buildColorMap } from "@/lib/marketingCalendarConstants";
import DraggableAppointment from "./DraggableAppointment";
import DroppableSlot from "./DroppableSlot";

const DAY_NAMES = ["lun", "mar", "mer", "gio", "ven", "sab", "dom"];

/**
 * BusySlot type — riflette righe di google_calendar_busy_slots e
 * apple_calendar_busy_slots merged in MarketingCalendar.
 * Rappresenta un evento del calendario esterno (Google/Apple) che il
 * portale visualizza come "slot occupato" — non un appointment editabile.
 */
interface BusySlot {
  id: string;
  start_at: string;
  end_at: string;
  summary: string | null;
  is_all_day: boolean;
  user_id: string;
  google_calendar_id?: string | null;
  provider?: "google" | "apple" | "outlook";
}

interface Props {
  currentDate: Date;
  appointments: MarketingAppointment[];
  calendarIds: string[];
  onClickAppointment: (apt: MarketingAppointment) => void;
  onClickDay: (date: Date) => void;
  onDropAppointment?: (id: string, newDate: string) => void;
  /**
   * 2026-05-27 (fix utente "non vedo eventi Google in vista mese"):
   * Prima WeekView/DayView ricevevano busySlots ma MonthView no →
   * eventi Google importati in DB ma invisibili nella view default.
   */
  busySlots?: BusySlot[];
  onClickBusySlot?: (slot: BusySlot) => void;
  /** Colori per calendario calcolati a monte (rispettano marketing_calendars.color) */
  colorMap?: Record<string, string>;
}

export default function MarketingCalendarMonthView({
  currentDate,
  appointments,
  calendarIds,
  onClickAppointment,
  onClickDay,
  onDropAppointment,
  busySlots = [],
  onClickBusySlot,
  colorMap: colorMapProp,
}: Props) {
  const internalColorMap = useMemo(() => buildColorMap(calendarIds), [calendarIds]);
  const colorMap = colorMapProp ?? internalColorMap;
  const [activeApt, setActiveApt] = useState<MarketingAppointment | null>(null);
  const justDragged = useRef(false);
  // Mouse: drag dopo 5px (evita click accidentali). Touch: long-press 180ms
  // (come il kanban Opportunità) — prima il solo PointerSensor partiva dopo 5px
  // anche col dito → fare SCROLL sopra un appuntamento lo riprogrammava.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } })
  );

  const weeks = useMemo(() => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });

    const result: Date[][] = [];
    let day = calStart;
    while (day <= calEnd) {
      const week: Date[] = [];
      for (let i = 0; i < 7; i++) {
        week.push(day);
        day = addDays(day, 1);
      }
      result.push(week);
    }
    return result;
  }, [currentDate]);

  const appointmentsByDate = useMemo(() => {
    const grouped = new Map<string, MarketingAppointment[]>();

    appointments.forEach((appointment) => {
      if (!appointment.appointment_date) return;
      const dateKey = appointment.appointment_date.slice(0, 10);
      const dayAppointments = grouped.get(dateKey) ?? [];
      dayAppointments.push(appointment);
      grouped.set(dateKey, dayAppointments);
    });

    grouped.forEach((dayAppointments) => {
      dayAppointments.sort((a, b) =>
        (a.appointment_time || "23:59").localeCompare(b.appointment_time || "23:59")
      );
    });

    return grouped;
  }, [appointments]);

  /**
   * Busy slots (eventi esterni Google/Apple) raggruppati per data.
   * Estraggono yyyy-mm-dd da start_at + estraggono HH:MM per visualizzazione.
   * Filtrano eventi all-day per evitare clutter.
   */
  const busySlotsByDate = useMemo(() => {
    const grouped = new Map<string, BusySlot[]>();
    busySlots.forEach((slot) => {
      if (!slot.start_at) return;
      const dateKey = slot.start_at.slice(0, 10);
      const arr = grouped.get(dateKey) ?? [];
      arr.push(slot);
      grouped.set(dateKey, arr);
    });
    grouped.forEach((arr) => {
      arr.sort((a, b) => a.start_at.localeCompare(b.start_at));
    });
    return grouped;
  }, [busySlots]);

  // ── Mobile (stile Google Calendar) ──────────────────────────────────────
  // Su 375px le chip evento nelle celle sono illeggibili (testo troncato a
  // "08:"): griglia compatta con PALLINI per giorno + agenda del giorno
  // selezionato sotto. Il tap sul giorno seleziona (non apre il dialog);
  // "Nuovo" nell'agenda crea l'appuntamento sul giorno selezionato.
  const isMobile = useIsMobile();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const selectedDate = useMemo(() => {
    if (selectedKey) {
      const d = new Date(`${selectedKey}T00:00:00`);
      if (isSameMonth(d, currentDate)) return d;
    }
    return currentDate;
  }, [selectedKey, currentDate]);

  const handleDragStart = (event: DragStartEvent) => {
    const apt = (event.active.data.current as any)?.appointment as MarketingAppointment;
    setActiveApt(apt || null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveApt(null);
    const { active, over } = event;
    if (!over || !onDropAppointment) return;
    justDragged.current = true;
    setTimeout(() => { justDragged.current = false; }, 200);
    const aptId = (active.id as string).replace("apt-", "");
    const overId = over.id as string;
    if (!overId.startsWith("day-")) return;
    const newDate = overId.replace("day-", "");
    onDropAppointment(aptId, newDate);
  };

  if (isMobile) {
    const selKey = format(selectedDate, "yyyy-MM-dd");
    const selApts = appointmentsByDate.get(selKey) ?? [];
    const selBusy = busySlotsByDate.get(selKey) ?? [];
    const fmtBusy = (iso: string) =>
      new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
    // Agenda unificata (appuntamenti + eventi esterni) ordinata per orario.
    const agenda = [
      ...selApts.map((apt) => ({
        kind: "apt" as const,
        sort: apt.appointment_time || "23:59",
        apt,
      })),
      ...selBusy.map((slot) => ({
        kind: "busy" as const,
        sort: slot.is_all_day ? "00:00" : fmtBusy(slot.start_at),
        slot,
      })),
    ].sort((a, b) => a.sort.localeCompare(b.sort));

    return (
      <div className="flex min-h-0 flex-1 flex-col gap-2">
        {/* Griglia mese compatta: numero giorno + pallini evento */}
        <div className="shrink-0 overflow-hidden rounded-lg border bg-background shadow-sm">
          <div className="grid grid-cols-7 border-b bg-muted/30">
            {DAY_NAMES.map((name) => (
              <div key={name} className="py-1.5 text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {name}
              </div>
            ))}
          </div>
          {weeks.map((week) => (
            <div key={format(week[0], "yyyy-MM-dd")} className="grid grid-cols-7">
              {week.map((day) => {
                const dateKey = format(day, "yyyy-MM-dd");
                const inMonth = isSameMonth(day, currentDate);
                const nApts = (appointmentsByDate.get(dateKey) ?? []).length;
                const nBusy = (busySlotsByDate.get(dateKey) ?? []).length;
                const selected = isSameDay(day, selectedDate);
                return (
                  <button
                    key={dateKey}
                    type="button"
                    onClick={() => setSelectedKey(dateKey)}
                    className={cn("flex h-11 flex-col items-center justify-center gap-0.5", !inMonth && "opacity-40")}
                  >
                    <span
                      className={cn(
                        "flex h-6 w-6 items-center justify-center rounded-full text-xs",
                        selected
                          ? "bg-primary font-semibold text-primary-foreground"
                          : isToday(day)
                            ? "font-bold text-primary"
                            : "text-foreground"
                      )}
                    >
                      {format(day, "d")}
                    </span>
                    <span className="flex h-1.5 items-center gap-0.5">
                      {nApts > 0 && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
                      {nApts > 1 && <span className="h-1.5 w-1.5 rounded-full bg-primary/60" />}
                      {nBusy > 0 && <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* Agenda del giorno selezionato */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border bg-background shadow-sm">
          <div className="flex shrink-0 items-center justify-between border-b px-3 py-2">
            <p className="text-sm font-semibold capitalize">
              {format(selectedDate, "EEEE d MMMM", { locale: it })}
            </p>
            <button
              type="button"
              onClick={() => onClickDay(selectedDate)}
              className="inline-flex h-7 items-center gap-1 rounded-md border px-2 text-xs font-medium text-muted-foreground hover:bg-muted"
            >
              <Plus className="h-3.5 w-3.5" /> Nuovo
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {agenda.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">Nessun impegno</p>
            ) : (
              <div className="divide-y">
                {agenda.map((item) =>
                  item.kind === "apt" ? (
                    <button
                      key={`apt-${item.apt.id}`}
                      type="button"
                      onClick={() => onClickAppointment(item.apt)}
                      className="flex w-full items-center gap-2.5 px-3 py-2 text-left active:bg-muted"
                    >
                      <span className="w-11 shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">
                        {item.apt.appointment_time ? item.apt.appointment_time.slice(0, 5) : "—"}
                      </span>
                      <span
                        className={cn(
                          "min-w-0 flex-1 truncate rounded border-l-2 px-2 py-1 text-[13px] leading-tight",
                          item.apt.calendar_id && colorMap[item.apt.calendar_id]
                            ? colorMap[item.apt.calendar_id]
                            : "border-muted-foreground/40 bg-muted text-foreground",
                          item.apt.status === "annullato" && "line-through opacity-50 saturate-50"
                        )}
                      >
                        {item.apt.title}
                      </span>
                    </button>
                  ) : (
                    <button
                      key={`busy-${item.slot.id}`}
                      type="button"
                      onClick={() => onClickBusySlot?.(item.slot)}
                      className="flex w-full items-center gap-2.5 px-3 py-2 text-left active:bg-muted"
                    >
                      <span className="w-11 shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">
                        {item.slot.is_all_day ? "Tutto il giorno" : fmtBusy(item.slot.start_at)}
                      </span>
                      <span className={cn(
                        "flex min-w-0 flex-1 items-center gap-1 truncate rounded border-l-2 border-dashed px-2 py-1 text-[13px] italic leading-tight",
                        item.slot.provider === "apple"
                          ? "border-zinc-500/60 bg-zinc-100/80 text-zinc-700"
                          : "border-blue-500/60 bg-blue-50 text-blue-800"
                      )}>
                        <CalendarIcon className="h-3 w-3 shrink-0" />
                        <span className="truncate">{item.slot.summary || "Occupato"}</span>
                      </span>
                    </button>
                  )
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border bg-background shadow-sm">
        {/* Header */}
        <div className="grid shrink-0 grid-cols-7 border-b bg-muted/30">
          {DAY_NAMES.map((name) => (
            <div key={name} className="border-r p-2 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground last:border-r-0">
              {name}
            </div>
          ))}
        </div>

        {/* Weeks */}
        <div className="grid min-h-0 flex-1" style={{ gridTemplateRows: `repeat(${weeks.length}, minmax(0, 1fr))` }}>
          {weeks.map((week) => (
            <div key={format(week[0], "yyyy-MM-dd")} className="grid min-h-0 grid-cols-7 border-b last:border-b-0">
              {week.map((day) => {
                const inMonth = isSameMonth(day, currentDate);
                const maxShow = 3;
                const dateKey = format(day, "yyyy-MM-dd");
                const dayApts = appointmentsByDate.get(dateKey) ?? [];
                const dayBusySlots = busySlotsByDate.get(dateKey) ?? [];
                const totalItems = dayApts.length + dayBusySlots.length;

                return (
                  <DroppableSlot
                    key={day.toISOString()}
                    id={`day-${dateKey}`}
                    className={cn(
                      "min-h-[84px] cursor-pointer overflow-hidden border-r p-2 transition-colors last:border-r-0 hover:bg-muted/30",
                      !inMonth && "bg-muted/20 text-muted-foreground/70",
                      isToday(day) && "bg-primary/5"
                    )}
                    onClick={() => { if (!justDragged.current) onClickDay(day); }}
                  >
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <div
                        className={cn(
                          "flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold",
                          isToday(day)
                            ? "bg-primary text-primary-foreground"
                            : inMonth
                              ? "text-foreground"
                              : "text-muted-foreground"
                        )}
                      >
                        {format(day, "d")}
                      </div>
                      {totalItems > 0 && (
                        <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                          {totalItems}
                        </span>
                      )}
                    </div>
                    <div className="space-y-1">
                      {dayApts.slice(0, maxShow).map((apt) => (
                        <DraggableAppointment key={apt.id} appointment={apt}>
                          <div
                            onClick={(e) => {
                              e.stopPropagation();
                              onClickAppointment(apt);
                            }}
                            className={cn(
                              "cursor-pointer truncate rounded border-l-2 px-1.5 py-1 text-[11px] leading-tight shadow-sm hover:opacity-85",
                              apt.is_blocked_slot
                                ? "border-dashed border-muted-foreground/50 bg-muted/60 text-muted-foreground italic"
                                : apt.calendar_id && colorMap[apt.calendar_id]
                                  ? colorMap[apt.calendar_id]
                                  : "border-muted-foreground/40 bg-muted text-foreground",
                              // Annullato: spento e barrato — vedi WeekView.
                              apt.status === "annullato" && "opacity-50 saturate-50 line-through"
                            )}
                            title={apt.title}
                          >
                            {apt.appointment_time && (
                              <span className="font-semibold">{apt.appointment_time.slice(0, 5)} </span>
                            )}
                            {apt.title}
                          </div>
                        </DraggableAppointment>
                      ))}
                      {/* 2026-05-27: busy slots Google/Apple come blocchi grigi
                          non draggabili (sono eventi esterni, vengono solo
                          mostrati per evitare conflitti). Click apre slot vuoto
                          come gli altri giorni. */}
                      {/* 2026-05-27 (richiesta UI): emoji 🟢/🍎 sostituite da
                          icona Calendar con colore brand (blu per Google,
                          slate per Apple). Più professionale e leggibile
                          a colpo d'occhio rispetto all'emoji. */}
                      {dayBusySlots.slice(0, Math.max(0, maxShow - dayApts.length)).map((slot) => {
                        // 2026-06-14: mostra la fascia oraria completa (inizio–fine),
                        // non solo l'inizio, e rende il blocco cliccabile per aprire il
                        // dettaglio dell'evento esterno.
                        const fmt = (iso: string) =>
                          new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
                        const range = !slot.is_all_day && slot.start_at
                          ? slot.end_at ? `${fmt(slot.start_at)}–${fmt(slot.end_at)}` : fmt(slot.start_at)
                          : null;
                        const isApple = slot.provider === "apple";
                        const isOutlook = slot.provider === "outlook";
                        const providerLabel = isApple ? "Apple Calendar" : isOutlook ? "Outlook Calendar" : "Google Calendar";
                        return (
                          <button
                            type="button"
                            key={`busy-${slot.id}`}
                            onClick={(e) => { e.stopPropagation(); onClickBusySlot?.(slot); }}
                            className={cn(
                              "flex w-full cursor-pointer items-center gap-1 truncate rounded border-l-2 border-dashed px-1.5 py-1 text-left text-[11px] leading-tight transition-colors",
                              isApple
                                ? "border-zinc-500/60 bg-zinc-100/80 text-zinc-700 italic hover:bg-zinc-200/80"
                                : isOutlook
                                  ? "border-indigo-500/60 bg-indigo-50 text-indigo-800 italic hover:bg-indigo-100"
                                  : "border-blue-500/60 bg-blue-50 text-blue-800 italic hover:bg-blue-100"
                            )}
                            title={`${slot.summary || "Occupato"}${range ? ` · ${range}` : ""} (da ${providerLabel})`}
                          >
                            <CalendarIcon
                              className={cn(
                                "h-3 w-3 shrink-0",
                                isApple ? "text-zinc-600" : isOutlook ? "text-indigo-600" : "text-blue-600"
                              )}
                              aria-label={providerLabel}
                            />
                            {range && <span className="font-medium shrink-0">{range}</span>}
                            <span className="truncate">{slot.summary || "Occupato"}</span>
                          </button>
                        );
                      })}
                      {totalItems > maxShow && (
                        <div className="px-1 text-[10px] font-medium text-muted-foreground">
                          +{totalItems - maxShow} altri
                        </div>
                      )}
                    </div>
                  </DroppableSlot>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <DragOverlay>
        {activeApt && (
          <div className="bg-primary/90 text-primary-foreground text-xs px-2 py-1 rounded shadow-lg max-w-[200px] truncate">
            {activeApt.appointment_time && (
              <span className="font-medium">{activeApt.appointment_time.slice(0, 5)} </span>
            )}
            {activeApt.title}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
