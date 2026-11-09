/** I numeri di una scheda su una riga sottile, da computer: ognuno apre il suo pannello. */
import { cn } from "@/lib/utils";

export interface NumeroScheda {
  label: string;
  value: number | string;
  sub?: string;
  tono?: "rosso";
  /** Per un testo lungo, come il nome di un contratto: prende più spazio e si taglia solo se non basta. */
  largo?: boolean;
  onClick?: () => void;
}

export function RigaNumeri({ numeri }: { numeri: NumeroScheda[] }) {
  return (
    <div className="mt-2 hidden divide-x overflow-hidden rounded-lg border bg-card md:flex">
      {numeri.map((n) => (
        <button
          key={n.label}
          type="button"
          onClick={n.onClick}
          title={[n.label, n.value, n.sub].filter((x) => x !== undefined && x !== "").join(" · ")}
          className={cn(
            "flex min-w-0 flex-1 items-baseline gap-1.5 px-3 py-1.5 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
            n.largo && "flex-[2]",
            n.tono === "rosso" && "bg-red-50/60 dark:bg-red-950/20",
          )}
        >
          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{n.label}</span>
          <span className={cn("text-sm font-bold tabular-nums", n.largo ? "min-w-0 truncate" : "shrink-0", n.tono === "rosso" && "text-red-700 dark:text-red-400")}>{n.value}</span>
          {n.sub && (
            <span className={cn("min-w-0 flex-1 truncate text-[10px]", n.tono === "rosso" ? "text-red-700 dark:text-red-400" : "text-muted-foreground")}>{n.sub}</span>
          )}
        </button>
      ))}
    </div>
  );
}
