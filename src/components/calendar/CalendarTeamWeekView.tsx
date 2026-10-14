import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  addDays,
  addWeeks,
  format,
  isSameDay,
  parseISO,
  startOfWeek,
  subWeeks,
} from "date-fns";
import { it } from "date-fns/locale";
import {
  ChevronLeft,
  ChevronRight,
  Search,
  Users,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { calendarWorkLocation } from "@/lib/calendar/navigation";
import {
  calendarEventKey,
  calendarEventTime,
  calendarEventTitle,
} from "@/lib/calendar/eventDetails";
import {
  planningResourceRows,
  resourceCellCount,
  resourceDayEvents,
  type PlanningResource,
} from "@/lib/calendar/resourcePlanning";
import { etichettaCommessa } from "@/lib/calendarUtils";
import type { CalendarOrder, CalendarScope } from "@/types/calendar";
import { CalendarDayDetailsDialog } from "./CalendarDayDetailsDialog";

interface Props {
  orders: CalendarOrder[];
  currentDate: Date;
  onDateChange: (date: Date) => void;
  calendarScope?: CalendarScope;
  canViewPayments?: boolean;
  orderColorFn?: (order: CalendarOrder) => string;
  employees?: PlanningResource[];
  teams?: PlanningResource[];
}
export function CalendarTeamWeekView({
  orders,
  currentDate,
  onDateChange,
  calendarScope = "personal",
  canViewPayments = false,
  orderColorFn,
  employees = [],
  teams = [],
}: Props) {
  const [selected, setSelected] = useState<{
    date: string;
    resourceId?: string;
    eventKey?: string;
  } | null>(null);
  const [kind, setKind] = useState<"team" | "employee">("team");
  const [search, setSearch] = useState("");
  const [assignedOnly, setAssignedOnly] = useState(true);
  const start = useMemo(
    () => startOfWeek(currentDate, { weekStartsOn: 1 }),
    [currentDate],
  );
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(start, i)),
    [start],
  );
  const rows = useMemo(
    () =>
      planningResourceRows(
        orders,
        days,
        kind,
        kind === "team" ? teams : employees,
        orderColorFn,
      ),
    [orders, days, kind, teams, employees, orderColorFn],
  );
  const visible = rows.filter(
    (r) =>
      (!assignedOnly || r.days > 0) &&
      r.name
        .toLocaleLowerCase("it")
        .includes(search.trim().toLocaleLowerCase("it")),
  );
  const activeOrders = new Set(
    visible.flatMap((r) =>
      [...r.cells.values()].flat().map((e) => e.order!.id),
    ),
  ).size;
  const plannedDays = new Set(visible.flatMap((r) => [...r.cells.keys()])).size;
  const selectedRow = selected?.resourceId
    ? rows.find((r) => r.id === selected.resourceId)
    : undefined;
  const detailEvents = selected
    ? selected.resourceId
      ? selectedRow?.cells.get(selected.date) || []
      : resourceDayEvents(visible, parseISO(selected.date))
    : [];
  const validSelection =
    selected && days.some((d) => format(d, "yyyy-MM-dd") === selected.date);
  const changeDate = (value: Date) => {
    setSelected(null);
    onDateChange(value);
  };
  return (
    <section
      className="overflow-hidden rounded-xl border bg-card"
      aria-label="Pianificazione settimanale delle risorse"
    >
      <div className="space-y-3 border-b p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              aria-label="Settimana precedente"
              onClick={() => changeDate(subWeeks(currentDate, 1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <h2 className="text-base font-semibold">
              {format(days[0], "d MMM", { locale: it })} —{" "}
              {format(days[6], "d MMM yyyy", { locale: it })}
            </h2>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              aria-label="Settimana successiva"
              onClick={() => changeDate(addWeeks(currentDate, 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <dl className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">
            {[
              [
                "Risorse con assegnazioni",
                visible.filter((r) => r.days).length,
              ],
              ["Cantieri assegnati", activeOrders],
              ["Giorni pianificati", plannedDays],
            ].map(([label, value]) => (
              <div key={label} className="flex items-baseline gap-1.5">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="text-sm font-semibold tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
          <div
            className="flex rounded-lg bg-muted p-1"
            aria-label="Tipo di risorsa"
          >
            {(
              [
                ["team", "Squadre"],
                ["employee", "Persone"],
              ] as const
            ).map(([value, label]) => (
              <button
                type="button"
                key={value}
                aria-pressed={kind === value}
                onClick={() => {
                  setKind(value);
                  setSelected(null);
                  setSearch("");
                }}
                className={cn(
                  "min-h-9 rounded-md px-3 text-xs",
                  kind === value && "bg-background font-semibold shadow-sm",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-52 flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="h-9 pl-9"
              aria-label="Cerca risorsa nella settimana"
              placeholder={
                kind === "team" ? "Cerca una squadra…" : "Cerca una persona…"
              }
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Button
            size="sm"
            variant={assignedOnly ? "secondary" : "outline"}
            aria-pressed={assignedOnly}
            title={
              assignedOnly
                ? "Mostra anche le risorse senza assegnazioni"
                : "Mostra solo le risorse con assegnazioni"
            }
            onClick={() => setAssignedOnly(!assignedOnly)}
          >
            {assignedOnly ? "Con assegnazioni" : "Tutte le risorse"}
          </Button>
        </div>
      </div>
      {visible.length ? (
        <div className="max-h-[65vh] overflow-auto">
          <table className="w-full min-w-[1000px] table-fixed text-left text-xs">
            <caption className="sr-only">
              Lavorazioni assegnate alle risorse, giorno per giorno
            </caption>
            <thead className="sticky top-0 z-20">
              <tr>
                <th className="sticky left-0 z-30 w-48 border-b bg-card p-3">
                  {kind === "team" ? "Squadra" : "Persona"}
                  <span className="ml-2 font-normal text-muted-foreground">
                    {visible.length}
                  </span>
                </th>
                {days.map((day) => {
                  const date = format(day, "yyyy-MM-dd"),
                    count = resourceCellCount(resourceDayEvents(visible, day));
                  return (
                    <th
                      key={date}
                      className={cn(
                        "border-b border-l bg-card p-2 font-medium",
                        day.getDay() % 6 === 0 && "bg-muted",
                        isSameDay(day, new Date()) &&
                          "bg-blue-50 dark:bg-blue-950",
                      )}
                    >
                      <button
                        type="button"
                        className="w-full rounded px-1 py-1 text-left hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary"
                        aria-label={`Apri assegnazioni del ${date}`}
                        onClick={() => setSelected({ date })}
                      >
                        <span className="capitalize">
                          {format(day, "EEE d", { locale: it })}
                        </span>
                        <span className="mt-1 block text-[10px] font-normal text-muted-foreground">
                          {count} {count === 1 ? "cantiere" : "cantieri"}
                        </span>
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {visible.map((resource) => (
                <tr key={resource.id}>
                  <th
                    scope="row"
                    className="sticky left-0 z-10 border-b bg-card p-3 align-top font-medium"
                  >
                    <div className="sticky top-16 flex items-start gap-2">
                      {kind === "team" ? (
                        <Users className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      ) : (
                        <UserRound className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                      <div>
                        {resource.name}
                        <span className="mt-1 block text-[10px] font-normal text-muted-foreground">
                          {resource.days}/7 giorni · {resource.orders} cantieri
                        </span>
                      </div>
                    </div>
                  </th>
                  {days.map((day) => {
                    const date = format(day, "yyyy-MM-dd"),
                      entries = resource.cells.get(date) || [],
                      count = resourceCellCount(entries);
                    return (
                      <td
                        key={date}
                        className={cn(
                          "border-b border-l p-2 align-top",
                          day.getDay() % 6 === 0 && "bg-muted/15",
                          isSameDay(day, new Date()) && "bg-primary/[0.025]",
                        )}
                      >
                        <div className="space-y-2">
                          {count > 1 && (
                            <span className="block text-[10px] font-medium text-amber-700">
                              {count} cantieri assegnati
                            </span>
                          )}
                          {entries.slice(0, 2).map((event) => {
                            const order = event.order!,
                              title = calendarEventTitle(event),
                              time = calendarEventTime(event),
                              end = event.work?.end_time?.slice(0, 5);
                            return (
                              <div
                                key={calendarEventKey(event)}
                                className="rounded-md border border-l-[3px] bg-card p-2 shadow-sm"
                                style={{ borderLeftColor: event.color }}
                              >
                                <button
                                  type="button"
                                  aria-label={`Dettagli ${title} · ${order.order_code} · ${date}`}
                                  onClick={() =>
                                    setSelected({
                                      date,
                                      resourceId: resource.id,
                                      eventKey: calendarEventKey(event),
                                    })
                                  }
                                  className="block w-full text-left font-medium leading-snug hover:text-primary focus-visible:ring-2 focus-visible:ring-primary"
                                >
                                  {event.work ? title : "Posa"}
                                </button>
                                <p
                                  className="mt-1 truncate text-[10px] text-muted-foreground"
                                  title={etichettaCommessa(order)}
                                >
                                  {etichettaCommessa(order)}
                                </p>
                                <Link
                                  to={calendarWorkLocation(order.id)}
                                  aria-label={`Apri lavorazioni ${title} · ${order.order_code}`}
                                  title={order.order_code || undefined}
                                  className="mt-1 block overflow-hidden text-ellipsis whitespace-nowrap text-[10px] tracking-tight text-primary hover:underline"
                                >
                                  {order.order_code &&
                                  order.order_code.length > 12
                                    ? order.order_code
                                        .split("-")
                                        .slice(-2)
                                        .join("-")
                                    : order.order_code}
                                </Link>
                                <span className="mt-1 block text-[10px] text-muted-foreground">
                                  {time
                                    ? `${time}${end ? `–${end}` : " · fine da definire"}`
                                    : "Orario da definire"}
                                </span>
                              </div>
                            );
                          })}
                          {entries.length > 2 && (
                            <button
                              type="button"
                              className="w-full rounded-md bg-muted/50 px-2 py-2 text-left text-[11px] font-medium text-primary hover:bg-muted"
                              onClick={() =>
                                setSelected({ date, resourceId: resource.id })
                              }
                            >
                              Vedi tutte ({entries.length})
                            </button>
                          )}
                          {!entries.length && (
                            <span
                              className="block px-1 py-2 text-muted-foreground"
                              title="Nessuna assegnazione registrata"
                            >
                              —
                            </span>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="px-4 py-10 text-center text-sm text-muted-foreground">
          Nessuna assegnazione {kind === "team" ? "a squadre" : "a persone"} nel
          periodo e nei filtri selezionati.{search && " Prova un altro nome."}
        </p>
      )}
      <p className="border-t px-4 py-2 text-[11px] text-muted-foreground">
        Assegnazioni dalle lavorazioni e dalla posa delle commesse. Gli spazi
        vuoti indicano nessuna assegnazione registrata; gli orari mancanti
        restano da definire.
      </p>
      {validSelection && selected && (
        <CalendarDayDetailsDialog
          open
          onOpenChange={(open) => {
            if (!open) setSelected(null);
          }}
          date={parseISO(selected.date)}
          events={detailEvents}
          initialEventKey={selected.eventKey}
          contextLabel={selectedRow?.name}
          isMobile={false}
          calendarScope={calendarScope}
          readOnly
          canEditOrders={false}
          canViewPayments={canViewPayments}
          onCreateAppointment={() => {}}
          onEditEvent={() => {}}
        />
      )}
    </section>
  );
}
