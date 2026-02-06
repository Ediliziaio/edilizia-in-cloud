import { formatDate } from "@/lib/formatters";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Package, Wrench, CheckCircle, Calendar } from "lucide-react";

interface CustomerDatesCardProps {
  warehouseArrivalDate?: string | null;
  workStartDate?: string | null;
  workEndDate?: string | null;
}

export function CustomerDatesCard({
  warehouseArrivalDate,
  workStartDate,
  workEndDate,
}: CustomerDatesCardProps) {
  const hasAnyDate = warehouseArrivalDate || workStartDate || workEndDate;

  if (!hasAnyDate) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          Tempistiche Previste
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {warehouseArrivalDate && (
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-blue-100 dark:bg-blue-900">
              <Package className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Arrivo Merce in Magazzino</p>
              <p className="font-medium">{formatDate(warehouseArrivalDate)}</p>
            </div>
          </div>
        )}

        {workStartDate && (
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-orange-100 dark:bg-orange-900">
              <Wrench className="h-5 w-5 text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Inizio Lavori</p>
              <p className="font-medium">{formatDate(workStartDate)}</p>
            </div>
          </div>
        )}

        {workEndDate && (
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-green-100 dark:bg-green-900">
              <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Fine Lavori</p>
              <p className="font-medium">{formatDate(workEndDate)}</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
