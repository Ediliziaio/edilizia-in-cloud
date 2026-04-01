import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { weatherCodeToEmoji, weatherCodeToLabel, type WeatherDay } from "@/hooks/useWeatherForecast";

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
