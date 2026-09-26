import { useMyTaskCount } from "@/hooks/useMyTaskCount";
import { useAuth } from "@/contexts/AuthContext";
import { AlertTriangle, CalendarDays, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface MyDayHeaderProps {
  estimatedHoursToday?: number;
  /** Dentro «Attività» il saluto è già nella testata della pagina. */
  senzaSaluto?: boolean;
}

export function MyDayHeader({ estimatedHoursToday, senzaSaluto = false }: MyDayHeaderProps) {
  const { profile } = useAuth();
  const { data: count } = useMyTaskCount();

  const ora = new Date().getHours();
  const saluto = ora < 12 ? "Buongiorno" : ora < 18 ? "Buon pomeriggio" : "Buonasera";
  const nome = profile?.first_name || "utente";

  const numeri = [
    { label: "Da fare oggi", value: String(count?.dueToday ?? 0), icon: CalendarDays, colore: "text-primary", allarme: false },
    { label: "Scadute", value: String(count?.overdue ?? 0), icon: AlertTriangle, colore: "text-destructive", allarme: !!count?.overdue },
    { label: "Totale aperte", value: String(count?.total ?? 0), icon: Clock, colore: "text-muted-foreground", allarme: false },
    ...(estimatedHoursToday != null && estimatedHoursToday > 0
      ? [{ label: "Stimate oggi", value: `~${estimatedHoursToday}h`, icon: Clock, colore: "text-primary", allarme: false }]
      : []),
  ];

  return (
    <div className="space-y-3">
      {!senzaSaluto && (
        <div>
          <h2 className="text-xl font-semibold">{saluto}, {nome} 👋</h2>
          <p className="text-sm text-muted-foreground">
            {new Date().toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" })}
          </p>
        </div>
      )}

      {/* Pastiglie come i contatori di «Tutte le attività»: erano tre riquadri
          da un terzo di pagina, a 1440px 380px l'uno con dentro un numero. */}
      <div className="flex flex-wrap items-center gap-1.5">
        {numeri.map((n) => (
          <div
            key={n.label}
            className={cn(
              "flex items-center gap-2 rounded-lg border bg-card px-2.5 py-1.5 shadow-sm",
              n.allarme && "border-destructive/30",
            )}
          >
            <n.icon className={cn("h-4 w-4 shrink-0", n.colore)} />
            <span className="text-base font-bold tabular-nums leading-none">{n.value}</span>
            <span className="text-xs text-muted-foreground">{n.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
