import { Cloud, Loader2 } from "lucide-react";
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { useCalendarSiteWeather } from "@/hooks/useCalendarSiteWeather";
import {
  weatherCodeToEmoji,
  weatherCodeToLabel,
} from "@/hooks/useWeatherForecast";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CalendarEvent } from "@/lib/calendar/events";

export function CalendarSiteWeather({
  event,
  day,
  compact = false,
}: {
  event: CalendarEvent;
  day: string;
  compact?: boolean;
}) {
  const q = useCalendarSiteWeather(event, day);
  if (!q.supported) return null;
  const date = format(parseISO(day), "d MMM", { locale: it });
  const message =
    q.status === "outside-range"
      ? "Previsioni disponibili da oggi per i prossimi 16 giorni."
      : q.status === "missing-address"
        ? "Indirizzo del cantiere non impostato."
        : q.status === "missing-position"
          ? "Indirizzo non localizzato: meteo non disponibile."
          : q.status === "loading"
            ? "Caricamento meteo…"
            : "Meteo temporaneamente non disponibile.";
  const title =
    "Meteo · " +
    (q.address || "Posizione del cantiere") +
    " · " +
    date +
    ": " +
    (q.data
      ? weatherCodeToLabel(q.data.code) +
        " · " +
        q.data.minTemp +
        "–" +
        q.data.maxTemp +
        " °C · " +
        q.data.precip +
        " mm"
      : message);
  const badge = (
    <span
      role="img"
      aria-label={title}
      title={title}
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-1 text-[10px] font-medium",
        q.data
          ? q.data.precip > 5
            ? "border-blue-200 bg-blue-50 text-blue-800"
            : "border-slate-200 bg-slate-50 text-slate-700"
          : "border-transparent text-muted-foreground",
      )}
    >
      {q.status === "loading" ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : q.data ? (
        <span aria-hidden="true" className="text-sm leading-none">
          {weatherCodeToEmoji(q.data.code)}
        </span>
      ) : (
        <Cloud className="h-3 w-3" />
      )}
      {q.data ? q.data.maxTemp + "°" : "—"}
    </span>
  );
  if (compact) return badge;
  return (
    <section
      aria-label="Meteo presso questo indirizzo"
      className="space-y-2 rounded-xl border bg-muted/20 p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-xs font-semibold">Meteo · {date}</h4>
        {badge}
      </div>
      {q.data ? (
        <div className="text-xs">
          <p className="font-medium">
            {weatherCodeToLabel(q.data.code)} · {q.data.minTemp}°–
            {q.data.maxTemp}°C
          </p>
          <p className="mt-1 text-muted-foreground">
            Precipitazioni previste: {q.data.precip.toLocaleString("it-IT")} mm.
          </p>
        </div>
      ) : (
        <p role="status" className="text-xs text-muted-foreground">
          {message}
        </p>
      )}
      {q.status === "error" && (
        <Button size="sm" variant="outline" onClick={q.retry}>
          Riprova meteo
        </Button>
      )}
      <p className="text-[10px] text-muted-foreground">
        Previsione per la zona dell’indirizzo ·{" "}
        <a
          className="hover:underline"
          href="https://open-meteo.com/"
          target="_blank"
          rel="noopener noreferrer"
        >
          Open-Meteo
        </a>
      </p>
    </section>
  );
}
