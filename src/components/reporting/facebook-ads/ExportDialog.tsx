import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FileSpreadsheet, FileText } from "lucide-react";
import { format } from "date-fns";
import type { NormalizedCampaignRow } from "@/lib/metaInsightsNormalizer";
import type { DateRange } from "@/hooks/useMetaAdsReport";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rows: NormalizedCampaignRow[];
  visibleColumns: string[];
  dateRange: DateRange;
  accountId: string;
  companyName?: string;
}

const COLUMN_LABELS: Record<string, string> = {
  campaign_name: "Campagna",
  account_name: "Account BM",
  status: "Stato",
  clicks: "Clic",
  spend: "Costo",
  revenue: "Entrate",
  roi: "ROI %",
  cpc: "CPC",
  cpm: "CPM",
  ctr: "CTR",
  frequency: "Frequenza",
  purchases: "Vendite",
  cps: "CPS",
  leads: "Lead",
  cpl: "CPL",
  impressions: "Impressioni",
  avg_revenue: "Entrate medie",
};

const ExportDialog = ({ open, onOpenChange, rows, visibleColumns, dateRange, accountId, companyName }: Props) => {
  const buildData = () =>
    rows.map((r) => {
      const obj: Record<string, any> = {};
      for (const col of visibleColumns) {
        obj[COLUMN_LABELS[col] || col] = (r as any)[col] ?? "";
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
      ...data.map((row) => headers.map((h) => `"${String(row[h] ?? "").replace(/"/g, '""')}"`).join(",")),
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
      ws.columns = Object.keys(data[0]).map((key) => ({ header: key, key }));
      ws.addRows(data);
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
