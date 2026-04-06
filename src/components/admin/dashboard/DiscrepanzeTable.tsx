import { AlertTriangle } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface DiscrepanzaRow {
  company_id: string;
  nome: string;
  mrr_stripe: number;
  mrr_interno: number;
}

interface DiscrepanzeTableProps {
  discrepanze: DiscrepanzaRow[];
}

const fmt = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });

export function DiscrepanzeTable({ discrepanze }: DiscrepanzeTableProps) {
  if (discrepanze.length === 0) return null;

  return (
    <div className="mt-4 space-y-2">
      <div className="flex items-center gap-1.5 text-sm font-medium text-orange-600">
        <AlertTriangle className="h-4 w-4" />
        <span>Discrepanze rilevate ({discrepanze.length} aziende)</span>
      </div>
      <div className="rounded-md border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Azienda</TableHead>
              <TableHead className="text-xs text-right">MRR Stripe</TableHead>
              <TableHead className="text-xs text-right">MRR Interno</TableHead>
              <TableHead className="text-xs text-right">Delta</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {discrepanze.map((row) => {
              const delta = row.mrr_stripe - row.mrr_interno;
              const isPositive = delta > 0;
              return (
                <TableRow key={row.company_id}>
                  <TableCell className="text-xs font-medium">{row.nome}</TableCell>
                  <TableCell className="text-xs text-right">{fmt.format(row.mrr_stripe / 100)}</TableCell>
                  <TableCell className="text-xs text-right">{fmt.format(row.mrr_interno / 100)}</TableCell>
                  <TableCell
                    className={`text-xs text-right font-medium ${
                      isPositive ? "text-green-600" : "text-red-600"
                    }`}
                  >
                    {isPositive ? "+" : ""}
                    {fmt.format(delta / 100)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
