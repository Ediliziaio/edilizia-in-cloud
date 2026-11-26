/**
 * Il meteo come icona disegnata (26/11/2026). L'emoji della nebbia (🌫️) su Mac è
 * un quadratino grigio sfumato che sembrava un'immagine rotta sulle schede.
 * Codici WMO di Open-Meteo.
 */
import { Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudRain, CloudSnow, CloudSun, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

export function IconaMeteo({ codice, className }: { codice: number; className?: string }) {
  const [Icona, colore] =
    codice === 0 ? [Sun, "text-amber-500"]
      : codice <= 2 ? [CloudSun, "text-amber-500"]
        : codice === 3 ? [Cloud, "text-slate-400"]
          : codice === 45 || codice === 48 ? [CloudFog, "text-slate-400"]
            : codice >= 51 && codice <= 57 ? [CloudDrizzle, "text-sky-500"]
              : (codice >= 61 && codice <= 67) || (codice >= 80 && codice <= 82) ? [CloudRain, "text-sky-600"]
                : (codice >= 71 && codice <= 77) || codice === 85 || codice === 86 ? [CloudSnow, "text-sky-400"]
                  : codice >= 95 ? [CloudLightning, "text-violet-500"]
                    : [Cloud, "text-slate-400"];
  return <Icona className={cn("h-3.5 w-3.5 shrink-0", colore, className)} aria-hidden="true" />;
}
