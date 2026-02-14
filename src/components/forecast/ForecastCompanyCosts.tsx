import { Link } from "react-router-dom";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { Receipt, Building2, AlertCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency } from "@/lib/formatters";
import type { CostsSummary } from "@/lib/forecastTypes";

interface ForecastCompanyCostsProps {
  costsSummary: CostsSummary;
}

export function ForecastCompanyCosts({ costsSummary }: ForecastCompanyCostsProps) {
  return (
    <Card className="border-red-200 bg-red-50/50 dark:bg-red-900/10 dark:border-red-800">
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-red-600" />
              Costi Aziendali
            </CardTitle>
            <CardDescription>
              Costi fissi e variabili non ancora pagati
            </CardDescription>
          </div>
          <Button variant="outline" asChild className="gap-1">
            <Link to="/azienda/costi">
              <Building2 className="h-4 w-4" />
              Gestisci Costi
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="p-4 rounded-lg bg-background border">
            <span className="text-sm text-muted-foreground">Costi Fissi da pagare</span>
            <p className="text-2xl font-bold text-red-600 mt-1">
              {formatCurrency(costsSummary.fixedTotal)}
            </p>
          </div>
          <div className="p-4 rounded-lg bg-background border">
            <span className="text-sm text-muted-foreground">Costi Variabili da pagare</span>
            <p className="text-2xl font-bold text-red-600 mt-1">
              {formatCurrency(costsSummary.variableTotal)}
            </p>
          </div>
        </div>

        {costsSummary.upcoming.length > 0 && (
          <div className="rounded-md border bg-background">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Costo</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Scadenza</TableHead>
                  <TableHead className="text-right">Importo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {costsSummary.upcoming.slice(0, 5).map((cost) => (
                  <TableRow key={cost.id}>
                    <TableCell className="font-medium">{cost.name}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          cost.costType === "fixed"
                            ? "border-red-400 text-red-600"
                            : "border-amber-400 text-amber-600"
                        }
                      >
                        {cost.type}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {cost.expectedDate
                        ? format(cost.expectedDate, "dd/MM/yyyy", { locale: it })
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right font-medium text-red-600">
                      {formatCurrency(cost.amount)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {costsSummary.upcoming.length === 0 && (
          <div className="text-center py-4 text-muted-foreground text-sm">
            <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-40" />
            Nessun costo in scadenza nei prossimi 30 giorni
          </div>
        )}
      </CardContent>
    </Card>
  );
}
