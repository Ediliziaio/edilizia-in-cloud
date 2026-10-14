import { useMemo, useState } from "react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  format,
  isSameDay,
  parseISO,
  startOfMonth,
} from "date-fns";
import { it } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { planningWorkloadOnDay } from "@/lib/calendar/planningTools";
import {
  planningResourceRows,
  resourceCellCount,
  workloadBands,
  type PlanningResource,
} from "@/lib/calendar/resourcePlanning";
import { buildCalendarEvents } from "@/lib/calendar/events";
import type { CalendarOrder, CalendarScope } from "@/types/calendar";

import { CalendarDayDetailsDialog } from "./CalendarDayDetailsDialog";
interface Props {
  orders: CalendarOrder[];
  currentDate: Date;
  onDateChange: (date: Date) => void;
  employees?: {
    id: string;
    first_name: string | null;
    last_name: string | null;
  }[];
  teams?: PlanningResource[];
  calendarScope?: CalendarScope;
  orderColorFn?: (order: CalendarOrder) => string;
}
const colors = [
  "bg-muted/35 text-muted-foreground",
  "bg-blue-50 text-blue-800 dark:bg-blue-950 dark:text-blue-200",
  "bg-blue-100 text-blue-900 dark:bg-blue-900 dark:text-blue-100",
  "bg-blue-200 text-blue-950 dark:bg-blue-800 dark:text-blue-100",
  "bg-blue-600 text-white",
];
export function CalendarHeatmapView({
  orders,
  currentDate,
  onDateChange,
  employees = [],
  teams = [],
  calendarScope = "personal",
  orderColorFn,
}: Props) {
  const p = usePermissions();
  const [mode, setMode] = useState<"day" | "employee" | "team">("day");
  const [search, setSearch] = useState("");
  const [assignedOnly, setAssignedOnly] = useState(false);
  const [selected, setSelected] = useState<{
    date: string;
    kind?: "employee" | "team";
    resourceId?: string;
  } | null>(null);
  const days = useMemo(
    () =>
      eachDayOfInterval({
        start: startOfMonth(currentDate),
        end: endOfMonth(currentDate),
      }),
    [currentDate],
  );
  const workloads = useMemo(
    () =>
      days.map((day) =>
        planningWorkloadOnDay(orders, format(day, "yyyy-MM-dd")),
      ),
    [days, orders],
  );
  const people = useMemo(
    () =>
      planningResourceRows(
        orders,
        days,
        "employee",
        employees.map((e) => ({
          id: e.id,
          name:
            [e.first_name, e.last_name].filter(Boolean).join(" ") || "Persona",
        })),
        orderColorFn,
      ),
    [orders, days, employees, orderColorFn],
  );
  const squads = useMemo(
    () => planningResourceRows(orders, days, "team", teams, orderColorFn),
    [orders, days, teams, orderColorFn],
  );
  const rows = (mode === "team" ? squads : people).filter(
    (r) =>
      (!assignedOnly || r.days > 0) &&
      r.name
        .toLocaleLowerCase("it")
        .includes(search.trim().toLocaleLowerCase("it")),
  );
  const resourceMode = mode !== "day";
  const counts = resourceMode
    ? rows.flatMap((r) =>
        days.map((d) =>
          resourceCellCount(r.cells.get(format(d, "yyyy-MM-dd"))),
        ),
      )
    : workloads.map((w) => w.length);
  const peak = Math.max(0, ...counts),
    bands = workloadBands(
      peak,
      Math.min(...counts.filter((count) => count > 0)),
    );
  const intensity = (count: number) =>
    colors[bands.find((b) => b.min <= count && b.max >= count)?.level || 0];
  const activeDays = workloads.filter((w) => w.length > 0).length;
  const activeOrders = new Set(
    workloads.flatMap((w) => w.map((e) => e.order.id)),
  ).size;
  const selectedRow = selected?.resourceId
    ? (selected.kind === "team" ? squads : people).find(
        (r) => r.id === selected.resourceId,
      )
    : undefined;
  const detailEvents = selected
    ? selected.resourceId
      ? selectedRow?.cells.get(selected.date) || []
      : buildCalendarEvents([parseISO(selected.date)], {
          orders,
          orderColorFn,
          hiddenEventTypes: new Set(["merce"]),
        }).get(selected.date) || []
    : [];
  const validSelection =
    selected && days.some((d) => format(d, "yyyy-MM-dd") === selected.date);
  const changeDate = (date: Date) => {
    setSelected(null);
    onDateChange(date);
  };
  return (
    <Card className="overflow-hidden" aria-label="Carico delle lavorazioni">
      <div className="space-y-3 border-b p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Mese di carico precedente"
              onClick={() => changeDate(addMonths(currentDate, -1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <h2 className="text-lg font-semibold capitalize">
              {format(currentDate, "MMMM yyyy", { locale: it })}
            </h2>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Mese di carico successivo"
              onClick={() => changeDate(addMonths(currentDate, 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <div
            className="flex rounded-lg bg-muted p-1"
            aria-label="Distribuzione del carico"
          >
            {(
              [
                ["day", "Per giorno"],
                ["employee", "Per persona"],
                ["team", "Per squadra"],
              ] as const
            ).map(([value, label]) => (
              <button
                type="button"
                key={value}
                aria-pressed={mode === value}
                onClick={() => {
                  setMode(value);
                  setSearch("");
                  setSelected(null);
                }}
                className={cn(
                  "min-h-9 rounded-md px-3 text-xs",
                  mode === value && "bg-background font-semibold shadow-sm",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <dl className="flex flex-wrap items-center gap-x-6 gap-y-2">
          {[
            ["Cantieri nel mese", activeOrders],
            ["Giorni con lavori", activeDays],
            [
              resourceMode
                ? "Picco per risorsa e giorno"
                : "Picco nello stesso giorno",
              peak,
            ],
          ].map(([label, value]) => (
            <div key={label} className="flex items-baseline gap-2">
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="text-lg font-semibold tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="text-xs text-muted-foreground">
          Cantieri dalle date effettive delle lavorazioni e della posa. Più fasi
          della stessa commessa contano una sola volta al giorno. I colori
          indicano il volume, non la disponibilità delle squadre.
        </p>
        {resourceMode && (
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-52 flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="h-9 pl-9"
                aria-label="Cerca risorsa nel carico"
                placeholder={
                  mode === "team" ? "Cerca una squadra…" : "Cerca una persona…"
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
            <span className="text-xs text-muted-foreground">
              {rows.length} {mode === "team" ? "squadre" : "persone"}
            </span>
          </div>
        )}
      </div>
      {!resourceMode ? (
        <div className="p-4">
          <div className="grid grid-cols-7 gap-1.5">
            {["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"].map((d) => (
              <div
                key={d}
                className="py-2 text-center text-xs font-medium text-muted-foreground"
              >
                {d}
              </div>
            ))}
            {Array.from({ length: (days[0].getDay() + 6) % 7 }, (_, i) => (
              <div key={"empty-" + i} />
            ))}
            {days.map((day, i) => {
              const count = workloads[i].length,
                key = format(day, "yyyy-MM-dd");
              return (
                <button
                  key={key}
                  type="button"
                  aria-label={
                    format(day, "EEEE d MMMM yyyy", { locale: it }) +
                    ": " +
                    count +
                    " cantieri"
                  }
                  onClick={() => setSelected({ date: key })}
                  className={cn(
                    "flex min-h-16 flex-col items-center justify-center gap-1 rounded-lg border border-transparent p-2 transition-colors hover:border-primary focus-visible:ring-2 focus-visible:ring-primary",
                    intensity(count),
                    isSameDay(day, new Date()) && "ring-2 ring-primary",
                  )}
                >
                  <span className="text-xs">{format(day, "d")}</span>
                  <span className="text-2xl font-semibold tabular-nums">
                    {count || "—"}
                  </span>
                  <span className="text-[10px]">
                    {count === 1 ? "cantiere" : "cantieri"}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : rows.length ? (
        <div className="max-h-[65vh] overflow-auto">
          <table className="w-full min-w-max text-left text-xs">
            <caption className="sr-only">
              Cantieri assegnati a ogni{" "}
              {mode === "team" ? "squadra" : "persona"} per giorno
            </caption>
            <thead className="sticky top-0 z-20">
              <tr>
                <th className="sticky left-0 z-30 min-w-48 border-b bg-card p-3">
                  {mode === "team" ? "Squadra" : "Persona"}
                </th>
                {days.map((day) => (
                  <th
                    key={format(day, "yyyy-MM-dd")}
                    className={cn(
                      "min-w-10 border-b bg-card p-1.5 text-center font-normal",
                      day.getDay() % 6 === 0 && "bg-muted",
                      isSameDay(day, new Date()) &&
                        "bg-blue-50 dark:bg-blue-950",
                    )}
                  >
                    <span className="block text-[9px] uppercase text-muted-foreground">
                      {format(day, "EEEEE", { locale: it })}
                    </span>
                    {format(day, "d")}
                  </th>
                ))}
                <th className="border-b bg-card p-3 text-center">
                  Giorni assegnati
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((resource) => (
                <tr key={resource.id}>
                  <th
                    scope="row"
                    className="sticky left-0 z-10 border-b bg-card p-3 font-medium"
                  >
                    {resource.name}
                    <span className="mt-1 block text-[10px] font-normal text-muted-foreground">
                      {resource.orders} cantieri nel mese
                    </span>
                  </th>
                  {days.map((day) => {
                    const key = format(day, "yyyy-MM-dd"),
                      count = resourceCellCount(resource.cells.get(key));
                    return (
                      <td
                        key={key}
                        className={cn(
                          "border-b p-1",
                          day.getDay() % 6 === 0 && "bg-muted/20",
                        )}
                      >
                        <button
                          type="button"
                          aria-label={
                            resource.name +
                            " · " +
                            format(day, "d MMM", { locale: it }) +
                            ": " +
                            count +
                            " cantieri"
                          }
                          className={cn(
                            "flex h-9 w-9 items-center justify-center rounded font-medium tabular-nums hover:ring-1 hover:ring-primary focus-visible:ring-2 focus-visible:ring-primary",
                            intensity(count),
                            isSameDay(day, new Date()) &&
                              "ring-1 ring-primary/40",
                          )}
                          onClick={() =>
                            setSelected({
                              date: key,
                              kind: mode === "team" ? "team" : "employee",
                              resourceId: resource.id,
                            })
                          }
                        >
                          {count || "—"}
                        </button>
                      </td>
                    );
                  })}
                  <td className="border-b p-3 text-center font-medium tabular-nums">
                    {resource.days}/{days.length}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="px-4 py-10 text-center text-sm text-muted-foreground">
          Nessuna {mode === "team" ? "squadra" : "persona"} nei filtri
          selezionati.
        </p>
      )}
      <div
        className="flex flex-wrap items-center gap-3 border-t px-4 py-3 text-xs text-muted-foreground"
        aria-label="Legenda del carico"
      >
        {bands.map((b) => (
          <span key={b.level} className="flex items-center gap-1.5">
            <span className={cn("h-3 w-3 rounded", colors[b.level])} />
            {b.label} cantieri
          </span>
        ))}
        <span className="ml-auto text-[10px]">
          Scala sui valori visibili · seleziona un giorno per i dettagli
        </span>
      </div>
      {validSelection && selected && (
        <CalendarDayDetailsDialog
          open
          onOpenChange={(open) => {
            if (!open) setSelected(null);
          }}
          date={parseISO(selected.date)}
          events={detailEvents}
          contextLabel={selectedRow?.name}
          isMobile={false}
          calendarScope={calendarScope}
          readOnly
          canEditOrders={p.canEditOrders}
          canViewPayments={p.canViewScadenzario}
          onCreateAppointment={() => {}}
          onEditEvent={() => {}}
        />
      )}
    </Card>
  );
}
