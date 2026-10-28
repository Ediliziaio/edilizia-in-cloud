import { useSearchParams } from "react-router-dom";
import { CalendarDays, ChevronLeft, ChevronRight, HardHat } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DailyHoursPanel } from "@/components/personale/DailyHoursPanel";
import { PresenzeHrCalendar } from "@/components/personale/PresenzeHrCalendar";
import { oggiRoma } from "@/hooks/useOperai";
import { meseValido, spostaMese } from "@/lib/personale/presenze";
import { cn } from "@/lib/utils";
import { HrMonthlyReview } from "@/components/personale/HrMonthlyReview";

export function TabPresenze() {
  const [params, setParams] = useSearchParams();
  const oggi = oggiRoma();
  const meseUrl = params.get("mese") ?? "";
  const mese = meseValido(meseUrl) ? meseUrl : oggi.slice(0, 7);
  const vista = params.get("vista_presenze") === "cantieri" ? "cantieri" : "hr";
  const aggiorna = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    next.set(key, value);
    setParams(next, { replace: true });
  };

  return (
    <div className="space-y-4 pt-2">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Presenze</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Presenze del personale e ore sui cantieri, ognuna nel suo registro.
          </p>
        </div>
        <div
          className="inline-flex rounded-lg border bg-white p-1"
          role="group"
          aria-label="Registro da consultare"
        >
          {(
            [
              ["hr", "Calendario HR", CalendarDays],
              ["cantieri", "Ore per cantiere", HardHat],
            ] as const
          ).map(([value, label, Icon]) => (
            <button
              key={value}
              type="button"
              aria-pressed={vista === value}
              onClick={() => aggiorna("vista_presenze", value)}
              className={cn(
                "inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                vista === value
                  ? "bg-blue-50 text-blue-800"
                  : "text-muted-foreground hover:bg-slate-50",
              )}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="icon"
            variant="ghost"
            aria-label="Mese precedente"
            onClick={() => aggiorna("mese", spostaMese(mese, -1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <label className="sr-only" htmlFor="presenze-month">
            Mese delle presenze
          </label>
          <Input
            id="presenze-month"
            type="month"
            value={mese}
            className="h-9 w-44 border-0 bg-slate-50 font-medium"
            onChange={(e) => {
              if (meseValido(e.target.value)) aggiorna("mese", e.target.value);
            }}
          />
          <Button
            size="icon"
            variant="ghost"
            aria-label="Mese successivo"
            onClick={() => aggiorna("mese", spostaMese(mese, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => aggiorna("mese", oggi.slice(0, 7))}
          >
            Questo mese
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {vista === "hr"
            ? "Timbrature, assenze e anomalie del personale"
            : "Ore da ufficio e rapportini · costi delle commesse"}
        </p>
      </div>
      <HrMonthlyReview key={`review-${mese}`} mese={mese} />
      {vista === "hr" ? (
        <PresenzeHrCalendar key={mese} mese={mese} oggi={oggi} />
      ) : (
        <DailyHoursPanel
          month={mese}
          onMonthChange={(value) => aggiorna("mese", value)}
          embedded
        />
      )}
    </div>
  );
}
