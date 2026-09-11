import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { escapeCsvCell, neutralizeCsvFormula } from "@/lib/csvExport";
import { FileSpreadsheet, FileText } from "lucide-react";
import { format } from "date-fns";
import type { NormalizedCampaignRow } from "@/lib/metaInsightsNormalizer";
import type { DateRange, ReportLevel } from "@/hooks/useMetaAdsReport";
import { COLONNE } from "./CampaignTable";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rows: NormalizedCampaignRow[];
  visibleColumns: string[];
  dateRange: DateRange;
  accountId: string;
  companyName?: string;
  level: ReportLevel;
}

const ExportDialog = ({ open, onOpenChange, rows, visibleColumns, dateRange, accountId, companyName, level }: Props) => {
  // Numeri come numeri (il foglio li somma), testi con l'etichetta leggibile;
  // la gerarchia campagna → gruppo → inserzione sempre per esteso.
  const buildData = () =>
    rows.map((r) => {
      const obj: Record<string, string | number> = { Campagna: r.campaign_name || "" };
      if (level !== "campaign") obj["Gruppo di inserzioni"] = r.adset_name || "";
      if (level === "ad") obj["Inserzione"] = r.ad_name || "";
      for (const key of visibleColumns) {
        const col = COLONNE.find((c) => c.key === key);
        if (!col || key === "name" || (col.livelli && !col.livelli.includes(level))) continue;
        const raw = (r as unknown as Record<string, unknown>)[key];
        obj[col.label] = typeof raw === "number" ? Math.round(raw * 100) / 100 : col.format(r);
      }
      return obj;
    });

  const slug = (companyName || "").replace(/[^a-zA-Z0-9]/g, "-").replace(/-+/g, "-").toLowerCase();
  const fileName = `facebook-ads-report_${slug ? slug + "_" : ""}${accountId}_${format(dateRange.from, "yyyyMMdd")}-${format(dateRange.to, "yyyyMMdd")}`;

  const exportCSV = () => {
    const data = buildData();
    if (data.length === 0) return;
    const headers = Object.keys(data[0]);
    const csvRows = [
      headers.join(","),
      ...data.map((row) => headers.map((h) => escapeCsvCell(row[h] as string | number | null | undefined, ",")).join(",")),
    ];
    const csv = csvRows.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${fileName}.csv`;
    link.click();
    onOpenChange(false);
  };

  const exportXLSX = async () => {
    const ExcelJS = (await import("exceljs")).default;
    const data = buildData();
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Facebook Ads");
    if (data.length > 0) {
      // Neutralizza le sole celle stringa (numeri/date intatti) contro
      // formula-injection se l'xlsx viene riesportato in CSV o copia-incollato.
      const safeData = data.map((row) => {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(row)) {
          out[k] = typeof v === "string" ? neutralizeCsvFormula(v) : v;
        }
        return out;
      });
      ws.columns = Object.keys(data[0]).map((key) => ({ header: key, key }));
      ws.addRows(safeData);
    }
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${fileName}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[360px]">
        <DialogHeader>
          <DialogTitle>Esporta report</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{rows.length} righe · {visibleColumns.length} colonne visibili</p>
        <DialogFooter className="flex gap-2 sm:justify-start">
          <Button variant="outline" onClick={exportCSV} className="gap-2">
            <FileText className="h-4 w-4" /> CSV
          </Button>
          <Button onClick={exportXLSX} className="gap-2">
            <FileSpreadsheet className="h-4 w-4" /> XLSX
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ExportDialog;
