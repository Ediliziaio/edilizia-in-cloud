import { format, subDays, startOfMonth, endOfMonth, subMonths, startOfDay } from "date-fns";
import { it } from "date-fns/locale";
import { CalendarIcon, Download, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useState, useMemo } from "react";
import ColumnsDrawer from "./ColumnsDrawer";
import ExportDialog from "./ExportDialog";
import LevelToggle from "./LevelToggle";
import type { useMetaAdsReport } from "@/hooks/useMetaAdsReport";

interface Props {
  report: ReturnType<typeof useMetaAdsReport>;
}

const ReportHeader = ({ report }: Props) => {
  const [showColumns, setShowColumns] = useState(false);
  const [showExport, setShowExport] = useState(false);

  return (
    <>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-xl font-semibold tracking-tight">Report di Facebook Ads</h2>

        <div className="flex flex-wrap items-center gap-2">
          {/* Date Range */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2 text-xs">
                <CalendarIcon className="h-3.5 w-3.5" />
                {format(report.dateRange.from, "dd MMM", { locale: it })} –{" "}
                {format(report.dateRange.to, "dd MMM yyyy", { locale: it })}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="range"
                selected={{ from: report.dateRange.from, to: report.dateRange.to }}
                onSelect={(range) => {
                  if (range?.from && range?.to) {
                    report.setDateRange({ from: range.from, to: range.to });
                  }
                }}
                numberOfMonths={2}
                className={cn("p-3 pointer-events-auto")}
                locale={it}
              />
            </PopoverContent>
          </Popover>

          {/* Ad Account */}
          {report.adAccounts.length > 0 && (
            <Select value={report.selectedAccountId} onValueChange={report.setSelectedAccountId}>
              <SelectTrigger className="w-[200px] h-8 text-xs">
                <SelectValue placeholder="Seleziona account" />
              </SelectTrigger>
              <SelectContent>
                {report.adAccounts.map((acc) => (
                  <SelectItem key={acc.id} value={acc.id}>
                    {acc.name || acc.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <LevelToggle level={report.level} onChange={report.setLevel} />

          <Button variant="outline" size="sm" onClick={() => setShowColumns(true)} className="gap-1.5 text-xs">
            <Settings2 className="h-3.5 w-3.5" />
            Colonne
          </Button>

          <Button variant="outline" size="sm" onClick={() => setShowExport(true)} className="gap-1.5 text-xs">
            <Download className="h-3.5 w-3.5" />
            Esporta
          </Button>
        </div>
      </div>

      <ColumnsDrawer
        open={showColumns}
        onOpenChange={setShowColumns}
        visibleColumns={report.visibleColumns}
        onColumnsChange={report.setVisibleColumns}
      />

      <ExportDialog
        open={showExport}
        onOpenChange={setShowExport}
        rows={report.rows}
        visibleColumns={report.visibleColumns}
        dateRange={report.dateRange}
        accountId={report.selectedAccountId}
        companyName={report.companyName}
      />
    </>
  );
};

export default ReportHeader;
