import { formatCurrency } from "@/lib/formatters";
import { neutralizeXlsxCell } from "@/lib/csvExport";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Download, ChevronDown } from "lucide-react";
import type { DocumentoFiscale } from "@/types/fatturazione";

interface DocumentiFooterProps {
  total: number;
  documenti: DocumentoFiscale[];
  totalImponibile: number;
  totalIva: number;
  totalDocumento: number;
}

async function exportToXLS(documenti: DocumentoFiscale[], filename: string) {
  const ExcelJS = (await import("exceljs")).default;
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

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Documenti");
  if (rows.length > 0) {
    const safeRows = rows.map((row) => {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(row)) out[k] = neutralizeXlsxCell(v);
      return out;
    });
    ws.columns = Object.keys(rows[0]).map((key) => ({ header: key, key }));
    ws.addRows(safeRows);
  }
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
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
