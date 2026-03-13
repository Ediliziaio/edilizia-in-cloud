import { formatCurrency } from "@/lib/formatters";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Download, ChevronDown } from "lucide-react";
import * as XLSX from "xlsx";
import type { DocumentoFiscale } from "@/types/fatturazione";

interface DocumentiFooterProps {
  total: number;
  documenti: DocumentoFiscale[];
  totalImponibile: number;
  totalIva: number;
  totalDocumento: number;
}

function exportToXLS(documenti: DocumentoFiscale[], filename: string) {
  const rows = documenti.map((doc) => ({
    Numero: doc.numero,
    Tipo: doc.tipo,
    Data: doc.data_emissione,
    Cliente: doc.cliente_snapshot?.ragione_sociale ?? "",
    Imponibile: doc.imponibile_totale,
    IVA: doc.iva_totale,
    Totale: doc.totale_documento,
    Stato: doc.stato,
    Scadenza: doc.data_scadenza ?? "",
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Documenti");
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

export function DocumentiFooter({
  total,
  documenti,
  totalImponibile,
  totalIva,
  totalDocumento,
}: DocumentiFooterProps) {
  return (
    <div className="flex items-center justify-between border-t border-border bg-muted/30 rounded-b-lg px-4 py-3">
      <p className="text-sm text-muted-foreground">
        {total} {total === 1 ? "documento" : "documenti"}
      </p>

      <div className="flex items-center gap-4">
        <div className="text-right">
          <p className="text-sm font-semibold">{formatCurrency(totalDocumento)}</p>
          <p className="text-[11px] text-muted-foreground">
            Imponibile {formatCurrency(totalImponibile)} + IVA {formatCurrency(totalIva)}
          </p>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5">
              <Download className="h-3.5 w-3.5" />
              XLS
              <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => exportToXLS(documenti, "documenti-pagina")}>
              Esporta pagina corrente
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
