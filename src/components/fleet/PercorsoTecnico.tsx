import { useState, Suspense, lazy } from "react";
import { format, subDays } from "date-fns";
import { it } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Route, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { usePercorsoGiornaliero } from "@/hooks/usePercorsoGiornaliero";

// Lazy-load della mappa percorso per non bloccare il bundle
const PercorsoMap = lazy(() =>
  import("./PercorsoMap").then((m) => ({ default: m.PercorsoMap }))
);

interface PercorsoTecnicoProps {
  companyId: string;
  userId: string;
  fullName: string;
  className?: string;
}

/**
 * Mostra il percorso giornaliero di un tecnico con navigazione per data.
 */
export function PercorsoTecnico({
  companyId,
  userId,
  fullName,
  className,
}: PercorsoTecnicoProps) {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const dateStr = format(selectedDate, "yyyy-MM-dd");
  const isToday = dateStr === format(new Date(), "yyyy-MM-dd");

  const { positions, isLoading, totalKm } = usePercorsoGiornaliero(
    companyId,
    userId,
    dateStr
  );

  const prevDay = () => setSelectedDate((d) => subDays(d, 1));
  const nextDay = () => {
    if (!isToday) setSelectedDate((d) => subDays(d, -1));
  };

  return (
    <div className={className}>
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Route className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">{fullName}</span>
        </div>

        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={prevDay}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-xs min-w-[80px] text-center">
            {format(selectedDate, "d MMM yyyy", { locale: it })}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={nextDay}
            disabled={isToday}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <Badge variant="outline" className="text-xs gap-1">
          <Route className="h-3 w-3" />
          {totalKm} km
        </Badge>
      </div>

      {/* Mappa */}
      {isLoading ? (
        <div className="h-64 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : positions.length === 0 ? (
        <div className="h-32 flex items-center justify-center text-sm text-muted-foreground">
          Nessun percorso registrato per questa data
        </div>
      ) : (
        <Suspense
          fallback={
            <div className="h-64 flex items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          }
        >
          <PercorsoMap positions={positions} height="320px" />
        </Suspense>
      )}
    </div>
  );
}
