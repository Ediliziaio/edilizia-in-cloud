import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { variazione } from "@/lib/metaAdsReportModel";
import { cn } from "@/lib/utils";

/**
 * Variazione rispetto al periodo precedente. `meglio` dice se salire è buono
 * (lead, clic) o cattivo (costo per lead): il colore segue quello, non il segno.
 */
export function DeltaPercentuale({ ora, prima, meglio }: { ora: number; prima?: number | null; meglio: "su" | "giu" | "neutro" }) {
  const v = variazione(ora, prima);
  if (v == null || !Number.isFinite(v)) return null;
  const buono = meglio === "neutro" ? null : meglio === "su" ? v > 0 : v < 0;
  const Icona = v >= 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-xs font-medium tabular-nums",
        Math.abs(v) < 1 ? "text-muted-foreground" : buono == null ? "text-slate-600" : buono ? "text-emerald-600" : "text-red-600",
      )}
      title="Rispetto al periodo precedente di pari durata"
    >
      <Icona className="h-3 w-3" />
      {v > 0 ? "+" : ""}
      {new Intl.NumberFormat("it-IT", { maximumFractionDigits: 0 }).format(v)}%
    </span>
  );
}
