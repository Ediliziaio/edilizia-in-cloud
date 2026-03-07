import { Progress } from "@/components/ui/progress";

interface CreditUsageBarProps {
  used: number;
  total: number;
  label?: string;
}

export function CreditUsageBar({ used, total, label }: CreditUsageBarProps) {
  const pct = total > 0 ? Math.round((used / total) * 100) : 0;
  const remaining = Math.max(0, total - used);

  return (
    <div className="space-y-2">
      {label && <p className="text-sm font-medium">{label}</p>}
      <Progress value={pct} className="h-3" />
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{used} / {total} minuti utilizzati ({pct}%)</span>
        <span>{remaining} rimanenti</span>
      </div>
    </div>
  );
}
