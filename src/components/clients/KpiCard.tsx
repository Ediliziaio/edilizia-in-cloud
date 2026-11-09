import { cn } from "@/lib/utils";

/** Un numero della testata di una scheda: etichetta, valore, riga sotto; un tocco apre il suo pannello. */
export function KpiCard({
  icon: Icon,
  iconColor,
  label,
  value,
  subtext,
  tono,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  iconColor?: string;
  label: string;
  value: number | string;
  subtext?: string;
  tono?: "rosso";
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "min-w-0 rounded-lg border bg-card px-3 py-1.5 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        tono === "rosso" && "border-red-200 bg-red-50/60 dark:border-red-900/50 dark:bg-red-950/20",
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold truncate">
          {label}
        </span>
        <Icon className={`h-3 w-3 ${iconColor ?? "text-muted-foreground"}`} />
      </div>
      <div className="flex items-baseline gap-1.5 mt-0.5">
        <span className={cn("text-lg font-bold tabular-nums truncate", tono === "rosso" && "text-red-700 dark:text-red-400")}>{value}</span>
      </div>
      {subtext && (
        <p className={cn("text-[10px] mt-0.5 truncate", tono === "rosso" ? "text-red-700 dark:text-red-400" : "text-muted-foreground")}>{subtext}</p>
      )}
    </button>
  );
}
