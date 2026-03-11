import { PackageOpen, AlertCircle, TrendingDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useLowStockAlerts } from "@/hooks/useMagazzinoLive";

interface Props {
  companyId: string;
  compact?: boolean;
}

export default function LowStockAlertsPanel({ companyId, compact = false }: Props) {
  const { data: alerts = [], isLoading } = useLowStockAlerts(companyId);

  if (isLoading) return (
    <Card><CardContent className="py-4 text-center text-sm text-muted-foreground">Verifica giacenze...</CardContent></Card>
  );

  if (alerts.length === 0) return (
    <Card><CardContent className="py-4 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
      <PackageOpen className="h-4 w-4" /> Tutte le giacenze sopra il livello minimo
    </CardContent></Card>
  );

  const critical = alerts.filter((a) => a.quantity_available === 0);
  const warning = alerts.filter((a) => a.quantity_available > 0);

  return (
    <Card className="border-amber-500/30 bg-amber-50/30 dark:bg-amber-950/10">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <TrendingDown className="h-4 w-4 text-amber-600" />
          Sottoscorta
          <Badge className="bg-amber-100 text-amber-800 text-xs ml-auto border-amber-300">
            {alerts.length} articol{alerts.length === 1 ? "o" : "i"}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {/* Esauriti (rosso) */}
        {critical.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-destructive flex items-center gap-1">
              <AlertCircle className="h-3 w-3" /> Esauriti ({critical.length})
            </p>
            {critical.slice(0, compact ? 3 : undefined).map((a) => (
              <div key={a.stock_item_id} className="flex items-center justify-between p-1.5 rounded bg-destructive/10 text-sm">
                <div className="min-w-0">
                  <span className="truncate font-medium block">{a.name}</span>
                  {a.supplier_name && <span className="text-[10px] text-muted-foreground">{a.supplier_name}</span>}
                </div>
                <Badge variant="destructive" className="text-[10px] shrink-0">
                  mancano {a.deficit}
                </Badge>
              </div>
            ))}
          </div>
        )}

        {/* Sotto soglia (giallo) */}
        {warning.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">
              Sotto soglia ({warning.length})
            </p>
            {warning.slice(0, compact ? 3 : undefined).map((a) => (
              <div key={a.stock_item_id} className="flex items-center justify-between p-1.5 rounded bg-background/80 border text-sm">
                <div className="min-w-0">
                  <span className="truncate block">{a.name}</span>
                  {a.supplier_name && <span className="text-[10px] text-muted-foreground">{a.supplier_name}</span>}
                </div>
                <span className="text-xs text-muted-foreground shrink-0">
                  {a.quantity_available}/{a.min_stock_level} min · mancano {a.deficit}
                </span>
              </div>
            ))}
          </div>
        )}

        {compact && alerts.length > 6 && (
          <p className="text-xs text-muted-foreground text-center pt-1">
            +{alerts.length - 6} altri articoli sotto scorta
          </p>
        )}
      </CardContent>
    </Card>
  );
}
