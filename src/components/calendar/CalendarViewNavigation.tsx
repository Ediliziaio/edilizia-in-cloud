import {
  CalendarDays,
  ChartGantt,
  Users,
  ChartNoAxesCombined,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { isCalendarPlanningView } from "@/lib/calendar/viewModes";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CalendarViewType } from "@/types/calendar";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

export function CalendarViewNavigation({
  view,
  onViewChange,
  isMobile,
  canViewTeam,
  onToday,
}: {
  view: CalendarViewType;
  onViewChange: (view: CalendarViewType) => void;
  isMobile: boolean;
  canViewTeam: boolean;
  onToday?: () => void;
}) {
  const t = useT();
  const planning = isCalendarPlanningView(view);
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3"
      aria-label={t("Modalità e periodo del calendario")}
    >
      {!isMobile && (
        <nav
          aria-label={t("Strumenti del calendario")}
          className="flex flex-wrap gap-1 rounded-lg bg-muted/60 p-1"
        >
          {(
            [
              {
                view: "month",
                label: "Calendario",
                icon: CalendarDays,
                active: !planning,
              },
              {
                view: "gantt",
                label: "Gantt",
                icon: ChartGantt,
                active: view === "gantt",
              },
              ...(canViewTeam
                ? [
                    {
                      view: "teams",
                      label: "Squadre e persone",
                      icon: Users,
                      active: view === "teams",
                    },
                  ]
                : []),
              {
                view: "heatmap",
                label: "Carico",
                icon: ChartNoAxesCombined,
                active: view === "heatmap",
              },
            ] as const
          ).map((item) => (
            <button
              type="button"
              key={item.view}
              aria-pressed={item.active}
              onClick={() => onViewChange(item.view as CalendarViewType)}
              className={cn(
                "flex min-h-9 items-center gap-2 rounded-md px-3 text-xs transition-colors",
                item.active
                  ? "bg-background font-semibold text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <item.icon className="h-3.5 w-3.5" />
              {t(item.label)}
            </button>
          ))}
        </nav>
      )}
      {!planning && (
        <Select
          value={view}
          onValueChange={(value) => onViewChange(value as CalendarViewType)}
        >
          <SelectTrigger
            className="h-9 w-[170px] max-md:h-11 max-md:min-w-0 max-md:flex-1 max-md:text-base"
            aria-label={t("Periodo del calendario")}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="month">{t("Mese")}</SelectItem>
            <SelectItem value="agenda">{isMobile ? t("7 giorni") : t("Prossimi 7 giorni")}</SelectItem>
            {!isMobile && (
              <>
                <SelectItem value="week">{t("Settimana")}</SelectItem>
                <SelectItem value="day">{t("Giorno")}</SelectItem>
              </>
            )}
          </SelectContent>
        </Select>
      )}
      {isMobile && onToday && (
        <Button type="button" variant="outline" className="h-11 shrink-0" onClick={onToday}>{t("Oggi")}</Button>
      )}
    </div>
  );
}
