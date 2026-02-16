import { format } from "date-fns";
import { Download, Printer } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCashFlowData } from "@/hooks/useCashFlowData";
import { CollectedTab } from "@/components/forecast/CollectedTab";
import { CostsForecastTab } from "@/components/forecast/CostsForecastTab";
import { CashForecastTab } from "@/components/forecast/CashForecastTab";
import { formatCurrency } from "@/lib/formatters";

export default function CashFlowForecast() {
  const {
    isLoading,
    orders,
    expectedPayments,
    expectedExpenses,
    expectedCommissions,
    expectedSupplierPayments,
    expectedCompanyCosts,
    stats,
  } = useCashFlowData();

  // Export CSV
  const exportCSV = () => {
    const allTransactions = [
      ...expectedPayments.map((p) => ({ ...p, direction: "in" as const })),
      ...expectedExpenses.map((e) => ({ ...e, type: "Squadra Esterna" as const, direction: "out" as const })),
      ...expectedCommissions.map((c) => ({
        expectedDate: c.expectedDate,
        amount: c.amount,
        direction: "out" as const,
        type: "Provvigione",
        customerName: c.salespersonName,
        teamName: c.salespersonName,
        orderCode: c.orderCode,
      })),
      ...expectedCompanyCosts.map((c) => ({
        expectedDate: c.expectedDate,
        amount: c.amount,
        direction: "out" as const,
        type: c.type,
        customerName: c.name,
        teamName: c.name,
        orderCode: null,
      })),
      ...expectedSupplierPayments.filter(p => !p.isPaid).map((s) => ({
        expectedDate: s.expectedDate,
        amount: s.amount,
        direction: "out" as const,
        type: s.type,
        customerName: s.supplierName,
        teamName: s.supplierName,
        orderCode: s.orderCode,
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
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
            Analizza entrate, uscite e flusso di cassa previsto
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

      {/* Tabs */}
      <Tabs defaultValue="incassato" className="w-full">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="incassato">Incassato</TabsTrigger>
          <TabsTrigger value="costi">Previsionale Costi</TabsTrigger>
          <TabsTrigger value="cassa">Previsione di Cassa</TabsTrigger>
        </TabsList>

        <TabsContent value="incassato" className="mt-6">
          <CollectedTab orders={orders} expectedPayments={expectedPayments} />
        </TabsContent>

        <TabsContent value="costi" className="mt-6">
          <CostsForecastTab
            expectedExpenses={expectedExpenses}
            expectedCommissions={expectedCommissions}
            expectedSupplierPayments={expectedSupplierPayments}
            expectedCompanyCosts={expectedCompanyCosts}
          />
        </TabsContent>

        <TabsContent value="cassa" className="mt-6">
          <CashForecastTab
            stats={stats}
            expectedPayments={expectedPayments}
            expectedExpenses={expectedExpenses}
            expectedCommissions={expectedCommissions}
            expectedSupplierPayments={expectedSupplierPayments}
            expectedCompanyCosts={expectedCompanyCosts}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
