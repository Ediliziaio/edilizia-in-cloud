import { Progress } from "@/components/ui/progress";

interface CreditUsageBarProps {
  spentEur: number;
  rechargedEur: number;
  label?: string;
}

export function CreditUsageBar({ spentEur, rechargedEur, label }: CreditUsageBarProps) {
  const pct = rechargedEur > 0 ? Math.min(100, Math.round((spentEur / rechargedEur) * 100)) : 0;

  const barColor =
    pct > 80 ? "[&>div]:bg-destructive" :
    pct > 60 ? "[&>div]:bg-amber-500" :
    "[&>div]:bg-primary";

  return (
    <div className="space-y-2">
      {label && <p className="text-sm font-medium">{label}</p>}
      <Progress value={pct} className={`h-3 ${barColor}`} />
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>€{spentEur.toFixed(2)} usati — €{rechargedEur.toFixed(2)} totale ricaricato</span>
        <span>{pct}%</span>
      </div>
    </div>
  );
}
