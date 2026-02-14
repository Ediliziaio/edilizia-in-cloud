import { Link } from "react-router-dom";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { UserCheck } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency } from "@/lib/formatters";
import type { ExpectedCommission } from "@/lib/forecastTypes";

interface ForecastCommissionsProps {
  expectedCommissions: ExpectedCommission[];
  commissionsTotal: number;
}

export function ForecastCommissions({ expectedCommissions, commissionsTotal }: ForecastCommissionsProps) {
  if (expectedCommissions.length === 0) return null;

  return (
    <Card className="border-violet-200 bg-violet-50/50 dark:bg-violet-900/10 dark:border-violet-800">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserCheck className="h-5 w-5 text-violet-600" />
          Provvigioni da Pagare
        </CardTitle>
        <CardDescription>
          Provvigioni venditori non ancora pagate
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border bg-background">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Venditore</TableHead>
                <TableHead>Ordine</TableHead>
                <TableHead>Data Prevista</TableHead>
                <TableHead className="text-right">Importo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {expectedCommissions.slice(0, 5).map((commission, index) => (
                <TableRow key={`commission-${commission.orderId}-${index}`}>
                  <TableCell className="font-medium">{commission.salespersonName}</TableCell>
                  <TableCell>
                    <Link
                      to={`/azienda/ordini/${commission.orderId}`}
                      className="text-primary hover:underline"
                    >
                      {commission.orderCode || "—"}
                    </Link>
                  </TableCell>
                  <TableCell>
                    {commission.expectedDate
                      ? format(commission.expectedDate, "dd/MM/yyyy", { locale: it })
                      : <span className="text-muted-foreground italic">Non definita</span>
                    }
                  </TableCell>
                  <TableCell className="text-right font-medium text-violet-600">
                    {formatCurrency(commission.amount)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {expectedCommissions.length > 5 && (
          <p className="text-sm text-muted-foreground mt-2">
            +{expectedCommissions.length - 5} altre provvigioni
          </p>
        )}
        <div className="mt-4 p-3 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-between">
          <span className="font-medium">Totale Provvigioni</span>
          <span className="text-xl font-bold text-violet-700 dark:text-violet-400">
            {formatCurrency(commissionsTotal)}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
