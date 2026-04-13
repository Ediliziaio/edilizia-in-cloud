import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { weatherCodeToEmoji, weatherCodeToLabel, type WeatherDay, type LocationWeatherDay } from "@/hooks/useWeatherForecast";

interface WeatherBadgeProps {
  weather: WeatherDay;
  size?: "sm" | "md";
  showTemp?: boolean;
}

export function WeatherBadge({ weather, size = "sm", showTemp = false }: WeatherBadgeProps) {
  const emoji = weatherCodeToEmoji(weather.code);
  const label = weatherCodeToLabel(weather.code);
  const isRainy = weather.precip > 5;
  const isHeavyRain = weather.precip > 20;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              "inline-flex items-center gap-0.5 rounded px-1 cursor-default select-none",
              size === "sm" ? "text-[10px]" : "text-xs",
              isHeavyRain ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300" :
              isRainy ? "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300" :
              "text-muted-foreground"
            )}
          >
            <span>{emoji}</span>
            {showTemp && <span>{weather.maxTemp}°</span>}
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <p className="font-medium">{label}</p>
          <p className="text-xs">{weather.minTemp}° – {weather.maxTemp}°C</p>
          {weather.precip > 0 && <p className="text-xs text-blue-600">{weather.precip}mm precipitazioni</p>}
          {isHeavyRain && <p className="text-xs text-red-500 font-medium">⚠️ Lavori esterni sconsigliati</p>}
          {isRainy && !isHeavyRain && <p className="text-xs text-orange-500">⚠️ Rischio pioggia</p>}
          {!isRainy && <p className="text-xs text-green-500">✓ Ideale per lavori esterni</p>}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/* ── WeatherBadgeMulti — mostra meteo per più location ──────────────────────── */

interface WeatherBadgeMultiProps {
  locations: LocationWeatherDay[];
  size?: "sm" | "md";
  showTemp?: boolean;
}

/**
 * Badge meteo che mostra il meteo di più location (cantieri).
 * Se c'è una sola location mostra direttamente il meteo.
 * Se ce ne sono più di una, mostra il "peggiore" + tooltip con dettaglio per città.
 */
export function WeatherBadgeMulti({ locations, size = "sm", showTemp = false }: WeatherBadgeMultiProps) {
  if (!locations || locations.length === 0) return null;

  if (locations.length === 1) {
    const loc = locations[0];
    const emoji = weatherCodeToEmoji(loc.code);
    const label = weatherCodeToLabel(loc.code);
    const isRainy = loc.precip > 5;
    const isHeavyRain = loc.precip > 20;

    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className={cn(
                "inline-flex items-center gap-0.5 rounded px-1 cursor-default select-none",
                size === "sm" ? "text-[10px]" : "text-xs",
                isHeavyRain ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300" :
                isRainy ? "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300" :
                "text-muted-foreground"
              )}
            >
              <span>{emoji}</span>
              {showTemp && <span>{loc.maxTemp}°</span>}
            </span>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            {(loc.orderRef || loc.customerName) && (
              <div className="flex items-center gap-1.5 mb-0.5">
                {loc.orderRef && <span className="text-[10px] text-primary font-mono font-bold">{loc.orderRef}</span>}
                {loc.customerName && <span className="text-[10px] font-semibold">{loc.customerName}</span>}
              </div>
            )}
            {loc.orderDesc && <p className="text-[10px] text-foreground/80 mb-0.5">{loc.orderDesc}</p>}
            {loc.address && <p className="text-[10px] text-muted-foreground mb-0.5">{loc.address}</p>}
            {!loc.address && loc.city && <p className="font-semibold text-xs mb-0.5">{loc.city}</p>}
            <p className="font-medium">{label}</p>
            <p className="text-xs">{loc.minTemp}° – {loc.maxTemp}°C</p>
            {loc.precip > 0 && <p className="text-xs text-blue-600">{loc.precip}mm precipitazioni</p>}
            {isHeavyRain && <p className="text-xs text-red-500 font-medium">⚠️ Lavori esterni sconsigliati</p>}
            {isRainy && !isHeavyRain && <p className="text-xs text-orange-500">⚠️ Rischio pioggia</p>}
            {!isRainy && <p className="text-xs text-green-500">✓ Ideale per lavori esterni</p>}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // Multiple locations — mostra worst-case come icona, dettaglio nel tooltip
  const worst = locations.reduce((a, b) => ({
    ...a,
    maxTemp: Math.max(a.maxTemp, b.maxTemp),
    minTemp: Math.min(a.minTemp, b.minTemp),
    precip: Math.max(a.precip, b.precip),
    code: Math.max(a.code, b.code),
  }));
  const worstEmoji = weatherCodeToEmoji(worst.code);
  const anyRainy = locations.some(l => l.precip > 5);
  const anyHeavyRain = locations.some(l => l.precip > 20);

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              "inline-flex items-center gap-0.5 rounded px-1 cursor-default select-none",
              size === "sm" ? "text-[10px]" : "text-xs",
              anyHeavyRain ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300" :
              anyRainy ? "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300" :
              "text-muted-foreground"
            )}
          >
            <span>{worstEmoji}</span>
            {showTemp && <span>{worst.maxTemp}°</span>}
            {locations.length > 1 && <span className="opacity-60">×{locations.length}</span>}
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-sm">
          <p className="font-semibold text-xs mb-1.5">Meteo cantieri ({locations.length} luoghi)</p>
          <div className="space-y-2">
            {locations.map((loc, i) => {
              const emoji = weatherCodeToEmoji(loc.code);
              const label = weatherCodeToLabel(loc.code);
              const isLocRainy = loc.precip > 5;
              const isLocHeavy = loc.precip > 20;
              // Titolo: ordine + cliente oppure indirizzo/città
              const hasOrder = loc.orderRef || loc.customerName;
              const addressLine = loc.address || loc.city || "";
              return (
                <div key={i} className={cn(
                  "rounded px-1.5 py-1 border-l-2",
                  isLocHeavy ? "bg-red-50 border-l-red-500 dark:bg-red-900/20" :
                  isLocRainy ? "bg-orange-50 border-l-orange-400 dark:bg-orange-900/20" :
                  "bg-muted/40 border-l-green-400"
                )}>
                  {/* Riga 1: Ordine + Cliente */}
                  {hasOrder && (
                    <div className="flex items-center gap-1.5 leading-tight">
                      {loc.orderRef && <span className="text-[10px] font-mono font-bold text-primary">{loc.orderRef}</span>}
                      {loc.customerName && <span className="text-[10px] font-semibold">{loc.customerName}</span>}
                    </div>
                  )}
                  {/* Riga 2: Descrizione ordine o indirizzo */}
                  {loc.orderDesc && (
                    <p className="text-[10px] text-foreground/80 leading-tight truncate" title={loc.orderDesc}>{loc.orderDesc}</p>
                  )}
                  {addressLine && (
                    <p className="text-[10px] text-muted-foreground leading-tight truncate" title={addressLine}>{addressLine}</p>
                  )}
                  {/* Riga 3: Meteo */}
                  <div className="flex items-center gap-1 mt-0.5">
                    <span className="text-sm leading-none">{emoji}</span>
                    <span className="text-xs font-medium">{label}</span>
                    <span className="text-xs text-muted-foreground">{loc.minTemp}°–{loc.maxTemp}°</span>
                    {loc.precip > 0 && <span className="text-[10px] text-blue-600">{loc.precip}mm</span>}
                    {isLocHeavy && <span className="text-[10px] text-red-500 font-medium">⚠️ Stop</span>}
                    {isLocRainy && !isLocHeavy && <span className="text-[10px] text-orange-500">⚠️</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
