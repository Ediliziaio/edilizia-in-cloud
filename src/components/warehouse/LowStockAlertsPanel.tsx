import { PackageOpen, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useLowStockAlerts } from "@/hooks/useMagazzinoLive";

export default function LowStockAlertsPanel() {
  const { data: alerts = [], isLoading } = useLowStockAlerts();

  if (isLoading || alerts.length === 0) return null;

  const outOfStock = alerts.filter((a) => a.available <= 0);
  const lowStock = alerts.filter((a) => a.available > 0);

  return (
    <Card className="border-amber-500/30 bg-amber-50/30 dark:bg-amber-950/10">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <PackageOpen className="h-4 w-4 text-amber-600" />
          Alert Sottoscorta
          <Badge variant="outline" className="ml-auto border-amber-500 text-amber-700">
            {alerts.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {outOfStock.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-destructive flex items-center gap-1">
              <AlertCircle className="h-3 w-3" /> Esauriti ({outOfStock.length})
            </p>
            {outOfStock.slice(0, 4).map((a) => (
              <div key={a.stock_item_id} className="flex items-center justify-between p-1.5 rounded bg-destructive/10 text-sm">
                <span className="truncate font-medium">{a.item_name}</span>
                <Badge variant="destructive" className="text-[10px]">0 disp.</Badge>
              </div>
            ))}
          </div>
        )}
        {lowStock.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">
              Sotto soglia ({lowStock.length})
            </p>
            {lowStock.slice(0, 4).map((a) => (
              <div key={a.stock_item_id} className="flex items-center justify-between p-1.5 rounded bg-background/80 border text-sm">
                <span className="truncate">{a.item_name}</span>
                <span className="text-xs text-muted-foreground shrink-0">
                  {a.available}/{a.min_level} min
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
