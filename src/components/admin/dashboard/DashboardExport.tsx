import { useCallback } from "react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/formatters";
import { downloadFile } from "@/lib/csvExport";
import type { AdminDashboardStats, AdminMrrStats } from "@/hooks/useAdminDashboardData";

interface ExportData {
  stats: AdminDashboardStats;
  mrrStats: AdminMrrStats;
  revenueData?: {
    currentMrr: number;
    arr: number;
    nrr: number;
    avgLtv: number;
    healthSummary?: { healthy: number; atRisk: number; critical: number };
  } | null;
}

export function DashboardExport({ data }: { data: ExportData }) {
  const isMobile = useIsMobile();
  const exportCSV = useCallback(() => {
    const rows = [
      ["Metrica", "Valore"],
      ["Aziende Totali", String(data.stats.totalCompanies)],
      ["Accessi Attivi", String(data.stats.accessActiveCompanies)],
      ["Aziende Paganti", String(data.stats.payingCompanies)],
      ["Aziende Comped", String(data.stats.nonPayingActiveCompanies + data.stats.freeActiveCompanies)],
      ["MRR Escluso Non Pagante", formatCurrency(data.stats.excludedMrr)],
      ["Ordini Totali", String(data.stats.totalOrders)],
      ["Valore Ordini", formatCurrency(data.stats.totalOrdersValue)],
      ["Clienti Totali", String(data.stats.totalCustomers)],
      ["Ticket Aperti", String(data.stats.openSupportConversations)],
      ["MRR Pagante", formatCurrency(data.mrrStats.mrr)],
      ["Trial Attivi", String(data.mrrStats.trialCount)],
      ["Trial In Scadenza", String(data.mrrStats.trialExpiringSoon)],
      ["Churn Mensile", `${data.mrrStats.churnRate}%`],
      ["Aziende Paganti (plan)", String(data.mrrStats.activeCount)],
      ["Aziende Scadute", String(data.mrrStats.expiredCount)],
    ];

    if (data.revenueData) {
      rows.push(
        ["ARR", formatCurrency(data.revenueData.arr)],
        ["NRR", `${data.revenueData.nrr}%`],
        ["LTV Medio", formatCurrency(data.revenueData.avgLtv)],
      );
      if (data.revenueData.healthSummary) {
        rows.push(
          ["Health: Sane", String(data.revenueData.healthSummary.healthy)],
          ["Health: A Rischio", String(data.revenueData.healthSummary.atRisk)],
          ["Health: Critiche", String(data.revenueData.healthSummary.critical)],
        );
      }
    }

    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    downloadFile(csv, `dashboard-admin-${format(new Date(), "yyyy-MM-dd")}.csv`, "text/csv");
    toast.success("CSV esportato con successo");
  }, [data]);

  const exportXLSX = useCallback(async () => {
    try {
      const ExcelJS = (await import("exceljs")).default;
      const wsData: (string | number | null)[][] = [
        ["Dashboard Admin — Report", "", format(new Date(), "dd MMMM yyyy", { locale: it })],
        [],
        ["METRICHE PRINCIPALI"],
        ["Aziende Totali", data.stats.totalCompanies],
        ["Accessi Attivi", data.stats.accessActiveCompanies],
        ["Aziende Paganti", data.stats.payingCompanies],
        ["Aziende Comped", data.stats.nonPayingActiveCompanies + data.stats.freeActiveCompanies],
        ["MRR Escluso Non Pagante (€)", data.stats.excludedMrr],
        ["Ordini Totali", data.stats.totalOrders],
        ["Valore Ordini (€)", data.stats.totalOrdersValue],
        ["Clienti Totali", data.stats.totalCustomers],
        ["Ticket Aperti", data.stats.openSupportConversations],
        [],
        ["METRICHE REVENUE"],
        ["MRR Pagante (€)", data.mrrStats.mrr],
        ["Trial Attivi", data.mrrStats.trialCount],
        ["Trial In Scadenza", data.mrrStats.trialExpiringSoon],
        ["Churn Mensile (%)", data.mrrStats.churnRate],
        ["Aziende Paganti", data.mrrStats.activeCount],
        ["Aziende Scadute", data.mrrStats.expiredCount],
      ];

      if (data.revenueData) {
        wsData.push(
          [],
          ["REVENUE INTELLIGENCE"],
          ["ARR (€)", data.revenueData.arr],
          ["NRR (%)", data.revenueData.nrr],
          ["LTV Medio (€)", data.revenueData.avgLtv],
        );
        if (data.revenueData.healthSummary) {
          wsData.push(
            [],
            ["HEALTH SUMMARY"],
            ["Sane", data.revenueData.healthSummary.healthy],
            ["A Rischio", data.revenueData.healthSummary.atRisk],
            ["Critiche", data.revenueData.healthSummary.critical],
          );
        }
      }

      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Dashboard");
      ws.columns = [{ width: 25 }, { width: 18 }, { width: 20 }];
      wsData.forEach((row) => ws.addRow(row));
      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `dashboard-admin-${format(new Date(), "yyyy-MM-dd")}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Excel esportato con successo");
    } catch {
      toast.error("Errore nell'esportazione Excel");
    }
  }, [data]);

  // Regola fondamentale: niente export/download su mobile (l'export è azione
  // da desktop) — feedback_no_mobile_export. Nascosto ovunque il componente
  // sia usato, senza wrapper per-uso.
  if (isMobile) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Download className="h-4 w-4" />
          <span className="hidden sm:inline">Esporta</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={exportCSV}>
          <FileText className="h-4 w-4 mr-2" /> Esporta CSV
        </DropdownMenuItem>
        <DropdownMenuItem onClick={exportXLSX}>
          <FileSpreadsheet className="h-4 w-4 mr-2" /> Esporta Excel
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
