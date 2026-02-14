import { useState, useMemo } from "react";
import { format } from "date-fns";
import { Download, Printer } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/formatters";
import type { DateRange } from "@/lib/forecastTypes";
import { useCashFlowData } from "@/hooks/useCashFlowData";
import { ForecastStatCards } from "@/components/forecast/ForecastStatCards";
import { ForecastMaterialCosts } from "@/components/forecast/ForecastMaterialCosts";
import { ForecastCommissions } from "@/components/forecast/ForecastCommissions";
import { ForecastCompanyCosts } from "@/components/forecast/ForecastCompanyCosts";
import { ForecastChart } from "@/components/forecast/ForecastChart";
import { ForecastTransactionsTable } from "@/components/forecast/ForecastTransactionsTable";

export default function CashFlowForecast() {
  const [dateRange, setDateRange] = useState<DateRange>({ from: undefined, to: undefined });
  const [activeTab, setActiveTab] = useState<"all" | "income" | "expenses">("all");
  const [supplierFilter, setSupplierFilter] = useState<string>("all");

  const {
    isLoading,
    expectedPayments,
    expectedExpenses,
    expectedCommissions,
    expectedCompanyCosts,
    stats,
    cfoKpis,
    chartData,
    costsSummary,
    suppliers,
    pendingItems,
    getMaterialCosts,
  } = useCashFlowData();

  const materialCosts = useMemo(
    () => getMaterialCosts(supplierFilter),
    [getMaterialCosts, supplierFilter]
  );

  // Export CSV
  const exportCSV = () => {
    const allTransactions = [
      ...expectedPayments.map((p) => ({ ...p, direction: "in" as const })),
      ...expectedExpenses.map((e) => ({ ...e, type: "Squadra Esterna" as const, direction: "out" as const })),
      ...expectedCompanyCosts.map((c) => ({
        expectedDate: c.expectedDate,
        amount: c.amount,
        direction: "out" as const,
        type: c.type,
        customerName: c.name,
        teamName: c.name,
        orderCode: null,
      })),
    ];

    const rows = [["Data", "Tipo", "Descrizione", "Ordine", "Direzione", "Importo"]];
    allTransactions.forEach((t: any) => {
      rows.push([
        t.expectedDate ? format(t.expectedDate, "dd/MM/yyyy") : "",
        t.type || (t.direction === "in" ? "Pagamento" : "Uscita"),
        t.customerName || t.teamName || t.name || "",
        t.orderCode || "",
        t.direction === "in" ? "Entrata" : "Uscita",
        String(t.amount),
      ]);
    });
    rows.unshift(
      ["RIEPILOGO PREVISIONALE", "", "", "", "", ""],
      ["Totale Entrate", "", "", "", "", String(stats.total.income)],
      ["Totale Uscite", "", "", "", "", String(stats.total.expenses)],
      ["Saldo Netto", "", "", "", "", String(stats.total.net)],
      ["", "", "", "", "", ""],
    );
    const csv = rows.map((r) => r.map((v) => `"${v}"`).join(";")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `previsionale-cassa-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="h-16 bg-muted animate-pulse rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:mb-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Previsionale Cassa</h1>
          <p className="text-muted-foreground">
            Analizza entrate e uscite previste, inclusi costi aziendali
          </p>
        </div>
        <div className="flex items-center gap-2 print:hidden">
          <Button variant="outline" size="sm" onClick={exportCSV} className="gap-1">
            <Download className="h-4 w-4" />
            Esporta CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.print()} className="gap-1">
            <Printer className="h-4 w-4" />
            Stampa PDF
          </Button>
        </div>
      </div>

      <ForecastStatCards stats={stats} cfoKpis={cfoKpis} />

      <ForecastMaterialCosts
        materialCosts={materialCosts}
        supplierFilter={supplierFilter}
        onSupplierFilterChange={setSupplierFilter}
        suppliers={suppliers}
        hasPendingItems={pendingItems.length > 0}
      />

      <ForecastCommissions
        expectedCommissions={expectedCommissions}
        commissionsTotal={stats.total.commissionsTotal}
      />

      <ForecastCompanyCosts costsSummary={costsSummary} />

      <ForecastChart chartData={chartData} />

      <ForecastTransactionsTable
        expectedPayments={expectedPayments}
        expectedExpenses={expectedExpenses}
        expectedCompanyCosts={expectedCompanyCosts}
        activeTab={activeTab}
        onActiveTabChange={setActiveTab}
        dateRange={dateRange}
        onDateRangeChange={setDateRange}
      />
    </div>
  );
}
