import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FileSpreadsheet, FileText } from "lucide-react";
import { format } from "date-fns";
import * as XLSX from "xlsx";
import type { NormalizedCampaignRow } from "@/lib/metaInsightsNormalizer";
import type { DateRange } from "@/hooks/useMetaAdsReport";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rows: NormalizedCampaignRow[];
  visibleColumns: string[];
  dateRange: DateRange;
  accountId: string;
}

const COLUMN_LABELS: Record<string, string> = {
  campaign_name: "Campagna",
  status: "Stato",
  clicks: "Clic",
  spend: "Costo",
  revenue: "Entrate",
  roi: "ROI %",
  cpc: "CPC",
  ctr: "CTR",
  purchases: "Vendite",
  cps: "CPS",
  leads: "Lead",
  cpl: "CPL",
  impressions: "Impressioni",
  avg_revenue: "Entrate medie",
};

const ExportDialog = ({ open, onOpenChange, rows, visibleColumns, dateRange, accountId }: Props) => {
  const buildData = () =>
    rows.map((r) => {
      const obj: Record<string, any> = {};
      for (const col of visibleColumns) {
        obj[COLUMN_LABELS[col] || col] = (r as any)[col] ?? "";
      }
      return obj;
    });

  const fileName = `facebook-ads-report_${accountId}_${format(dateRange.from, "yyyyMMdd")}-${format(dateRange.to, "yyyyMMdd")}`;

  const exportCSV = () => {
    const data = buildData();
    const ws = XLSX.utils.json_to_sheet(data);
    const csv = XLSX.utils.sheet_to_csv(ws);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${fileName}.csv`;
    link.click();
    onOpenChange(false);
  };

  const exportXLSX = () => {
    const data = buildData();
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Facebook Ads");
    XLSX.writeFile(wb, `${fileName}.xlsx`);
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
