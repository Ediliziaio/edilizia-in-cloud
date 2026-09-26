import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { exportToCSV, exportToXLSX, type CsvColumn } from "@/lib/csvExport";

interface ReportExportMenuProps {
  rows: Record<string, string>[];
  columns: CsvColumn[];
  filenameBase: string;
  disabled?: boolean;
}

export function ReportExportMenu({ rows, columns, filenameBase, disabled }: ReportExportMenuProps) {
  // Niente export sul telefono.
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled || !rows.length} className="max-sm:hidden">
          <Download className="h-4 w-4 mr-1.5" />
          Esporta
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => exportToCSV(rows, columns, `${filenameBase}.csv`)}>
          <FileText className="h-4 w-4 mr-2" />
          CSV
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => exportToXLSX(rows, columns, `${filenameBase}.xlsx`)}>
          <FileSpreadsheet className="h-4 w-4 mr-2" />
          Excel (XLSX)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
