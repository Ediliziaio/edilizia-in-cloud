import { Progress } from "@/components/ui/progress";
import { formatCurrency } from "@/lib/formatters";

interface CreditUsageBarProps {
  spentEur: number;
  rechargedEur: number;
  label?: string;
  /** v8.6.60 — "count" mostra numeri puri ("63 render") invece di euro. */
  unit?: "eur" | "count";
  /** Suffisso unitario (es. "render", "msg") quando unit="count". */
  unitSuffix?: string;
}

export function CreditUsageBar({
  spentEur, rechargedEur, label, unit = "eur", unitSuffix = "",
}: CreditUsageBarProps) {
  const pct = rechargedEur > 0 ? Math.min(100, Math.round((spentEur / rechargedEur) * 100)) : 0;

  const barColor =
    pct > 80 ? "[&>div]:bg-destructive" :
    pct > 60 ? "[&>div]:bg-amber-500" :
    "[&>div]:bg-primary";

  const fmt = (n: number): string => {
    if (unit === "count") {
      const intVal = Math.round(n);
      const formatted = intVal.toLocaleString("it-IT");
      return unitSuffix ? `${formatted} ${unitSuffix}` : formatted;
    }
    return formatCurrency(n);
  };

  return (
    <div className="space-y-2">
      {label && <p className="text-sm font-medium">{label}</p>}
      <Progress value={pct} className={`h-3 ${barColor}`} />
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{fmt(spentEur)} usati — {fmt(rechargedEur)} totale</span>
        <span>{pct}%</span>
      </div>
    </div>
  );
}
