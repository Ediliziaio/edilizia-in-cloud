import { useState, forwardRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { MapPin, Clock, Car, AlertTriangle, CheckCircle2, Ban, ChevronDown, ChevronUp } from "lucide-react";
import DailyRoutePanel from "./DailyRoutePanel";

export interface CalendarSuggestion {
  calendar_id: string;
  calendar_name: string;
  owner_name: string | null;
  travel_km: number;
  travel_minutes: number;
  daily_km_if_assigned: number;
  max_daily_km: number;
  suggested_times: string[];
  reason: string;
  status: "OK" | "WARNING" | "BLOCKED";
  score: number;
  daily_route: { label: string; address: string }[];
  is_estimate: boolean;
  existing_appointments_count: number;
}

interface Props {
  suggestions: CalendarSuggestion[];
  isLoading: boolean;
  onSelect: (calendarId: string, suggestedTime?: string) => void;
  selectedCalendarId?: string;
}

const statusConfig = {
  OK: { icon: CheckCircle2, color: "text-green-600", bg: "bg-green-50 border-green-200", badge: "bg-green-100 text-green-800" },
  WARNING: { icon: AlertTriangle, color: "text-yellow-600", bg: "bg-yellow-50 border-yellow-200", badge: "bg-yellow-100 text-yellow-800" },
  BLOCKED: { icon: Ban, color: "text-destructive", bg: "bg-red-50 border-red-200", badge: "bg-red-100 text-red-800" },
};

const CalendarSuggestions = forwardRef<HTMLDivElement, Props>(({ suggestions, isLoading, onSelect, selectedCalendarId }, ref) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Car className="h-4 w-4 text-primary animate-pulse" />
          <span className="text-sm font-medium">Calcolo calendari consigliati...</span>
        </div>
        {[1, 2].map((i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  if (suggestions.length === 0) {
    return (
      <div className="rounded-lg border bg-muted/30 p-4">
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Nessun calendario disponibile per questa data e posizione.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <MapPin className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold">Calendari consigliati</span>
        <span className="text-xs text-muted-foreground ml-auto">{suggestions.length} risultati</span>
      </div>

      <div className="space-y-2">
        {suggestions.map((s) => {
          const cfg = statusConfig[s.status];
          const StatusIcon = cfg.icon;
          const isSelected = selectedCalendarId === s.calendar_id;
          const isExpanded = expandedId === s.calendar_id;
          const kmPercent = s.max_daily_km > 0 ? Math.min((s.daily_km_if_assigned / s.max_daily_km) * 100, 100) : 0;

          return (
            <div key={s.calendar_id} className={`rounded-lg border p-3 space-y-2 transition-colors ${isSelected ? "ring-2 ring-primary" : ""} ${cfg.bg}`}>
              {/* Header row */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <StatusIcon className={`h-4 w-4 shrink-0 ${cfg.color}`} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{s.calendar_name}</p>
                    {s.owner_name && <p className="text-xs text-muted-foreground truncate">{s.owner_name}</p>}
                  </div>
                </div>
                <Badge variant="outline" className={`shrink-0 text-[11px] ${cfg.badge}`}>
                  {s.status}
                </Badge>
              </div>

              {/* Stats row */}
              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Car className="h-3 w-3" />
                  {s.travel_km} km
                </span>
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {s.travel_minutes} min
                </span>
                {s.is_estimate && (
                  <span className="text-[10px] italic text-yellow-600">(stima)</span>
                )}
              </div>

              {/* Reason */}
              <p className="text-xs text-muted-foreground">{s.reason}</p>

              {/* KM progress bar */}
              <div className="space-y-1">
                <div className="flex justify-between text-[11px] text-muted-foreground">
                  <span>Km giornalieri</span>
                  <span className={kmPercent > 100 ? "text-destructive font-medium" : ""}>
                    {s.daily_km_if_assigned} / {s.max_daily_km} km
                  </span>
                </div>
                <Progress
                  value={kmPercent}
                  className={`h-1.5 ${kmPercent > 100 ? "[&>div]:bg-destructive" : kmPercent > 80 ? "[&>div]:bg-yellow-500" : ""}`}
                />
              </div>

              {/* Suggested times + Select button */}
              <div className="flex flex-wrap items-center gap-2">
                {s.suggested_times.map((t) => (
                  <Button
                    key={t}
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs gap-1"
                    disabled={s.status === "BLOCKED"}
                    onClick={() => onSelect(s.calendar_id, t)}
                  >
                    <Clock className="h-3 w-3" />
                    {t}
                  </Button>
                ))}

                {s.status !== "BLOCKED" && s.suggested_times.length === 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => onSelect(s.calendar_id)}
                  >
                    Seleziona
                  </Button>
                )}

                {s.status === "BLOCKED" && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="text-[11px] text-destructive cursor-help">Non disponibile</span>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs text-xs">{s.reason}</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}

                {/* Expand route */}
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto h-7 text-xs gap-1"
                  onClick={() => setExpandedId(isExpanded ? null : s.calendar_id)}
                >
                  {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  Percorso
                </Button>
              </div>

              {/* Expanded daily route */}
              {isExpanded && (
                <DailyRoutePanel
                  route={s.daily_route}
                  totalKm={s.daily_km_if_assigned}
                  maxKm={s.max_daily_km}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
});

CalendarSuggestions.displayName = "CalendarSuggestions";

export default CalendarSuggestions;
