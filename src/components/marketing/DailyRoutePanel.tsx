import { MapPin, AlertTriangle } from "lucide-react";

interface RouteStop {
  label: string;
  address: string;
}

interface Props {
  route: RouteStop[];
  totalKm: number;
  maxKm: number;
}

export default function DailyRoutePanel({ route, totalKm, maxKm }: Props) {
  const isOver = totalKm > maxKm;

  return (
    <div className="rounded-md border bg-background p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold">Percorso giornaliero</span>
        <span className={`text-xs font-medium ${isOver ? "text-destructive" : "text-muted-foreground"}`}>
          {totalKm} km A/R {isOver && `(limite: ${maxKm} km)`}
        </span>
      </div>

      {isOver && (
        <div className="flex items-center gap-2 rounded-md bg-destructive/10 border border-destructive/20 px-3 py-1.5 text-xs text-destructive">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          Superato il limite km giornaliero
        </div>
      )}

      <div className="relative pl-4">
        {route.map((stop, i) => {
          const isNew = stop.label === "NUOVO";
          const isLast = i === route.length - 1;
          return (
            <div key={i} className="relative pb-3 last:pb-0">
              {/* Vertical line */}
              {!isLast && (
                <div className="absolute left-0 top-2 bottom-0 w-px bg-border" />
              )}
              {/* Dot */}
              <div className={`absolute -left-1.5 top-1 h-3 w-3 rounded-full border-2 ${
                isNew ? "bg-primary border-primary" : "bg-background border-muted-foreground/40"
              }`} />
              {/* Content */}
              <div className="ml-4">
                <p className={`text-xs font-medium ${isNew ? "text-primary" : "text-foreground"}`}>
                  {isNew ? "🆕 Nuovo appuntamento" : stop.label}
                </p>
                <p className="text-[11px] text-muted-foreground truncate">{stop.address}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
