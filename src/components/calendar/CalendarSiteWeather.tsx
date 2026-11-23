import { Cloud, Loader2 } from "lucide-react";
import { format, parseISO } from "date-fns";
import { useCalendarSiteWeather } from "@/hooks/useCalendarSiteWeather";
import {
  weatherCodeToEmoji,
  weatherCodeToLabel,
} from "@/hooks/useWeatherForecast";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CalendarEvent } from "@/lib/calendar/events";
import { dateFnsCampo, intlCampo, useT } from "@/lib/campo/lingua/LinguaCampo";

export function CalendarSiteWeather({
  event,
  day,
  compact = false,
}: {
  event: CalendarEvent;
  day: string;
  compact?: boolean;
}) {
  const t = useT();
  const q = useCalendarSiteWeather(event, day);
  if (!q.supported) return null;
  const date = format(parseISO(day), "d MMM", { locale: dateFnsCampo() });
  const message =
    q.status === "outside-range"
      ? t("Previsioni disponibili da oggi per i prossimi 16 giorni.")
      : q.status === "missing-address"
        ? t("Indirizzo del cantiere non impostato.")
        : q.status === "missing-position"
          ? t("Indirizzo non localizzato: meteo non disponibile.")
          : q.status === "loading"
            ? t("Caricamento meteo…")
            : t("Meteo temporaneamente non disponibile.");
  const title = t("Meteo · {luogo} · {data}: {dettaglio}", {
    luogo: q.address || t("Posizione del cantiere"),
    data: date,
    dettaglio: q.data
      ? weatherCodeToLabel(q.data.code) +
        " · " +
        q.data.minTemp +
        "–" +
        q.data.maxTemp +
        " °C · " +
        q.data.precip +
        " mm"
      : message,
  });
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
      aria-label={t("Meteo presso questo indirizzo")}
      className="space-y-2 rounded-xl border bg-muted/20 p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-xs font-semibold">{t("Meteo · {data}", { data: date })}</h4>
        {badge}
      </div>
      {q.data ? (
        <div className="text-xs">
          <p className="font-medium">
            {weatherCodeToLabel(q.data.code)} · {q.data.minTemp}°–
            {q.data.maxTemp}°C
          </p>
          <p className="mt-1 text-muted-foreground">
            {t("Precipitazioni previste: {mm} mm.", { mm: q.data.precip.toLocaleString(intlCampo()) })}
          </p>
        </div>
      ) : (
        <p role="status" className="text-xs text-muted-foreground">
          {message}
        </p>
      )}
      {q.status === "error" && (
        <Button size="sm" variant="outline" onClick={q.retry}>
          {t("Riprova meteo")}
        </Button>
      )}
      <p className="text-[10px] text-muted-foreground">
        {t("Previsione per la zona dell’indirizzo")} ·{" "}
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
