/**
 * Pulsante di esportazione riutilizzabile per CSV e PDF.
 * Supporta qualsiasi dataset con colonne configurabili.
 */
import { useState } from "react";
import { Download, FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { exportToCSV, exportToXLSX, type CsvColumn } from "@/lib/csvExport";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

interface ExportButtonProps {
  /** I dati da esportare come array di record */
  getData: () => Record<string, string>[] | Promise<Record<string, string>[]>;
  /** Definizione delle colonne */
  columns: CsvColumn[];
  /** Nome base del file (senza estensione) */
  filename: string;
  /** Variante del pulsante */
  variant?: "outline" | "ghost" | "secondary" | "default";
  /** Dimensione del pulsante */
  size?: "sm" | "default" | "lg" | "icon";
  /** Mostra testo o solo icona */
  iconOnly?: boolean;
  /** Classe CSS aggiuntiva */
  className?: string;
}

export function ExportButton({
  getData,
  columns,
  filename,
  variant = "outline",
  size = "sm",
  iconOnly = false,
  className,
}: ExportButtonProps) {
  const t = useT();
  const [isExporting, setIsExporting] = useState(false);
  const isMobile = useIsMobile();

  const handleExport = async (format: "csv" | "xlsx") => {
    try {
      setIsExporting(true);
      const data = await getData();
      if (!data.length) {
        toast.info(t("Nessun dato da esportare"));
        return;
      }
      const ts = new Date().toISOString().slice(0, 10);
      const fullFilename = `${filename}_${ts}`;

      if (format === "csv") {
        exportToCSV(data, columns, `${fullFilename}.csv`);
      } else {
        await exportToXLSX(data, columns, `${fullFilename}.xlsx`);
      }
      toast.success(t("Esportazione {format} completata", { format: format.toUpperCase() }), {
        description: t("{rows} righe esportate", { rows: data.length }),
      });
    } catch (err) {
      toast.error(t("Errore durante l'esportazione"));
      console.error("Export error:", err);
    } finally {
      setIsExporting(false);
    }
  };

  // Su telefono nessun export: la regola vale per il pulsante, non per la
  // pagina che lo contiene, quindi si spegne qui una volta sola invece che in
  // ognuno dei posti che lo montano.
  if (isMobile) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={variant} size={size} disabled={isExporting} className={className}>
          {isExporting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          {!iconOnly && <span className="ml-1.5">{t("Esporta")}</span>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => handleExport("csv")} className="gap-2">
          <FileText className="h-4 w-4" />
          {t("Esporta CSV")}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleExport("xlsx")} className="gap-2">
          <FileSpreadsheet className="h-4 w-4" />
          {t("Esporta Excel (XLSX)")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
