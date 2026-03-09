import { useCallback } from "react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/formatters";
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
  const exportCSV = useCallback(() => {
    const rows = [
      ["Metrica", "Valore"],
      ["Aziende Attive", String(data.stats.totalCompanies)],
      ["Ordini Totali", String(data.stats.totalOrders)],
      ["Valore Ordini", formatCurrency(data.stats.totalOrdersValue)],
      ["Clienti Totali", String(data.stats.totalCustomers)],
      ["Ticket Aperti", String(data.stats.openSupportConversations)],
      ["MRR", formatCurrency(data.mrrStats.mrr)],
      ["Trial Attivi", String(data.mrrStats.trialCount)],
      ["Trial In Scadenza", String(data.mrrStats.trialExpiringSoon)],
      ["Churn Rate", `${data.mrrStats.churnRate}%`],
      ["Aziende Attive (plan)", String(data.mrrStats.activeCount)],
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
      const XLSX = await import("xlsx");
      const wsData = [
        ["Dashboard Admin — Report", "", format(new Date(), "dd MMMM yyyy", { locale: it })],
        [],
        ["METRICHE PRINCIPALI"],
        ["Aziende Attive", data.stats.totalCompanies],
        ["Ordini Totali", data.stats.totalOrders],
        ["Valore Ordini (€)", data.stats.totalOrdersValue],
        ["Clienti Totali", data.stats.totalCustomers],
        ["Ticket Aperti", data.stats.openSupportConversations],
        [],
        ["METRICHE REVENUE"],
        ["MRR (€)", data.mrrStats.mrr],
        ["Trial Attivi", data.mrrStats.trialCount],
        ["Trial In Scadenza", data.mrrStats.trialExpiringSoon],
        ["Churn Rate (%)", data.mrrStats.churnRate],
        ["Aziende Attive", data.mrrStats.activeCount],
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

      const ws = XLSX.utils.aoa_to_sheet(wsData);
      ws["!cols"] = [{ wch: 25 }, { wch: 18 }, { wch: 20 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Dashboard");
      XLSX.writeFile(wb, `dashboard-admin-${format(new Date(), "yyyy-MM-dd")}.xlsx`);
      toast.success("Excel esportato con successo");
    } catch {
      toast.error("Errore nell'esportazione Excel");
    }
  }, [data]);

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

function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob(["\ufeff" + content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
