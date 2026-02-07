import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, startOfMonth, endOfMonth, addMonths, subMonths } from "date-fns";
import { it } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Download, Receipt, TrendingDown, TrendingUp, Calculator } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { calculateNetFromGross } from "@/lib/vatUtils";
import { formatCurrency } from "@/lib/formatters";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";

interface OrderWithCustomer {
  id: string;
  order_code: string | null;
  total_amount: number;
  vat_rate: number | null;
  created_at: string;
  customer: {
    first_name: string;
    last_name: string;
  } | null;
}

interface OrderItemWithOrder {
  id: string;
  name: string;
  purchase_price: number | null;
  quantity: number | null;
  vat_rate: number | null;
  order: {
    id: string;
    order_code: string | null;
    company_id: string;
    created_at: string;
  };
}

interface ExternalTeamWithOrder {
  id: string;
  total_cost: number;
  vat_rate: number | null;
  order: {
    id: string;
    order_code: string | null;
    company_id: string;
    created_at: string;
  };
  external_team: {
    name: string;
  } | null;
}

export default function VatReport() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const [selectedMonth, setSelectedMonth] = useState(new Date());

  const startDate = startOfMonth(selectedMonth);
  const endDate = endOfMonth(selectedMonth);

  // Fetch orders for the selected month
  const { data: orders, isLoading: ordersLoading } = useQuery({
    queryKey: ["vat-report-orders", companyId, startDate.toISOString()],
    queryFn: async () => {
      if (!companyId) return [];
      
      const { data, error } = await supabase
        .from("orders")
        .select(`
          id,
          order_code,
          total_amount,
          vat_rate,
          created_at,
          customer:profiles!orders_customer_id_fkey(first_name, last_name)
        `)
        .eq("company_id", companyId)
        .gte("created_at", startDate.toISOString())
        .lte("created_at", endDate.toISOString())
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as OrderWithCustomer[];
    },
    enabled: !!companyId,
  });

  // Fetch order items for the selected month
  const { data: orderItems, isLoading: itemsLoading } = useQuery({
    queryKey: ["vat-report-items", companyId, startDate.toISOString()],
    queryFn: async () => {
      if (!companyId) return [];

      const { data, error } = await supabase
        .from("order_items")
        .select(`
          id,
          name,
          purchase_price,
          quantity,
          vat_rate,
          order:orders!inner(id, order_code, company_id, created_at)
        `)
        .eq("order.company_id", companyId)
        .gte("order.created_at", startDate.toISOString())
        .lte("order.created_at", endDate.toISOString());

      if (error) throw error;
      return data as OrderItemWithOrder[];
    },
    enabled: !!companyId,
  });

  // Fetch external teams for the selected month
  const { data: externalTeams, isLoading: teamsLoading } = useQuery({
    queryKey: ["vat-report-teams", companyId, startDate.toISOString()],
    queryFn: async () => {
      if (!companyId) return [];

      const { data, error } = await supabase
        .from("order_external_teams")
        .select(`
          id,
          total_cost,
          vat_rate,
          order:orders!inner(id, order_code, company_id, created_at),
          external_team:external_teams(name)
        `)
        .eq("order.company_id", companyId)
        .gte("order.created_at", startDate.toISOString())
        .lte("order.created_at", endDate.toISOString());

      if (error) throw error;
      return data as ExternalTeamWithOrder[];
    },
    enabled: !!companyId,
  });

  // Calculate VAT summary
  const vatSummary = useMemo(() => {
    // VAT debit (sales) - calculate from net amount
    const vatDebit = (orders || []).reduce((sum, order) => {
      const vatRate = order.vat_rate || 22;
      const { vatAmount } = calculateNetFromGross(order.total_amount, vatRate);
      return sum + vatAmount;
    }, 0);

    // VAT credit from items
    const vatCreditItems = (orderItems || []).reduce((sum, item) => {
      const grossCost = (item.purchase_price || 0) * (item.quantity || 1);
      const { vatAmount } = calculateNetFromGross(grossCost, item.vat_rate || 22);
      return sum + vatAmount;
    }, 0);

    // VAT credit from teams
    const vatCreditTeams = (externalTeams || []).reduce((sum, team) => {
      const { vatAmount } = calculateNetFromGross(team.total_cost, team.vat_rate || 22);
      return sum + vatAmount;
    }, 0);

    const totalVatCredit = vatCreditItems + vatCreditTeams;
    const vatBalance = vatDebit - totalVatCredit;

    return {
      vatDebit,
      vatCreditItems,
      vatCreditTeams,
      totalVatCredit,
      vatBalance,
      orderCount: orders?.length || 0,
    };
  }, [orders, orderItems, externalTeams]);

  // Export to CSV
  const exportToCsv = () => {
    const rows: string[][] = [
      ["Tipo", "Ordine", "Descrizione", "Lordo", "Aliquota IVA", "Netto", "IVA"],
    ];

    // Sales
    (orders || []).forEach((order) => {
      const vatRate = order.vat_rate || 22;
      const { netAmount, vatAmount } = calculateNetFromGross(order.total_amount, vatRate);
      rows.push([
        "Vendita",
        order.order_code || order.id.slice(0, 8),
        `${order.customer?.first_name || ""} ${order.customer?.last_name || ""}`.trim(),
        order.total_amount.toFixed(2),
        `${vatRate}%`,
        netAmount.toFixed(2),
        vatAmount.toFixed(2),
      ]);
    });

    // Items
    (orderItems || []).forEach((item) => {
      const grossCost = (item.purchase_price || 0) * (item.quantity || 1);
      const vatRate = item.vat_rate || 22;
      const { netAmount, vatAmount } = calculateNetFromGross(grossCost, vatRate);
      rows.push([
        "Acquisto Articolo",
        item.order.order_code || item.order.id.slice(0, 8),
        item.name,
        grossCost.toFixed(2),
        `${vatRate}%`,
        netAmount.toFixed(2),
        vatAmount.toFixed(2),
      ]);
    });

    // Teams
    (externalTeams || []).forEach((team) => {
      const vatRate = team.vat_rate || 22;
      const { netAmount, vatAmount } = calculateNetFromGross(team.total_cost, vatRate);
      rows.push([
        "Squadra Esterna",
        team.order.order_code || team.order.id.slice(0, 8),
        team.external_team?.name || "-",
        team.total_cost.toFixed(2),
        `${vatRate}%`,
        netAmount.toFixed(2),
        vatAmount.toFixed(2),
      ]);
    });

    const csv = rows.map((r) => r.join(";")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `report-iva-${format(selectedMonth, "yyyy-MM")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const isLoading = ordersLoading || itemsLoading || teamsLoading;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Receipt className="h-6 w-6" />
            Report IVA
          </h1>
          <p className="text-muted-foreground">
            Riepilogo IVA per la liquidazione periodica
          </p>
        </div>
        <Button variant="outline" onClick={exportToCsv} disabled={isLoading}>
          <Download className="h-4 w-4 mr-2" />
          Esporta CSV
        </Button>
      </div>

      {/* Month selector */}
      <div className="flex items-center justify-center gap-4">
        <Button
          variant="outline"
          size="icon"
          onClick={() => setSelectedMonth(subMonths(selectedMonth, 1))}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-lg font-medium min-w-[180px] text-center capitalize">
          {format(selectedMonth, "MMMM yyyy", { locale: it })}
        </span>
        <Button
          variant="outline"
          size="icon"
          onClick={() => setSelectedMonth(addMonths(selectedMonth, 1))}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-destructive" />
              IVA a Debito
            </CardTitle>
            <CardDescription>Vendite</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <>
                <p className="text-2xl font-bold text-destructive">
                  {formatCurrency(vatSummary.vatDebit)}
                </p>
                <p className="text-xs text-muted-foreground">
                  Da {vatSummary.orderCount} ordini
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-success" />
              IVA a Credito
            </CardTitle>
            <CardDescription>Acquisti detraibili</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <>
                <p className="text-2xl font-bold text-success">
                  {formatCurrency(vatSummary.totalVatCredit)}
                </p>
                <p className="text-xs text-muted-foreground">
                  Articoli: {formatCurrency(vatSummary.vatCreditItems)} | Squadre: {formatCurrency(vatSummary.vatCreditTeams)}
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Calculator className="h-4 w-4" />
              Saldo IVA
            </CardTitle>
            <CardDescription>
              {vatSummary.vatBalance >= 0 ? "Da versare" : "A credito"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <p className={`text-2xl font-bold ${vatSummary.vatBalance >= 0 ? "text-destructive" : "text-success"}`}>
                {formatCurrency(Math.abs(vatSummary.vatBalance))}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Sales detail */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dettaglio IVA a Debito (Vendite)</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : orders && orders.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ordine</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead className="text-right">Lordo</TableHead>
                  <TableHead className="text-right">IVA %</TableHead>
                  <TableHead className="text-right">Imponibile</TableHead>
                  <TableHead className="text-right">IVA</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((order) => {
                  const vatRate = order.vat_rate || 22;
                  const { netAmount, vatAmount } = calculateNetFromGross(order.total_amount, vatRate);
                  return (
                    <TableRow key={order.id}>
                      <TableCell className="font-medium">
                        {order.order_code || order.id.slice(0, 8)}
                      </TableCell>
                      <TableCell>
                        {order.customer?.first_name} {order.customer?.last_name}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(order.total_amount)}
                      </TableCell>
                      <TableCell className="text-right">{vatRate}%</TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(netAmount)}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(vatAmount)}
                      </TableCell>
                    </TableRow>
                  );
                })}
                <TableRow className="bg-muted/50 font-medium">
                  <TableCell colSpan={5} className="text-right">
                    Totale IVA Debito
                  </TableCell>
                  <TableCell className="text-right text-destructive">
                    {formatCurrency(vatSummary.vatDebit)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          ) : (
            <p className="text-muted-foreground text-center py-4">
              Nessun ordine nel mese selezionato
            </p>
          )}
        </CardContent>
      </Card>

      {/* Items detail */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dettaglio IVA a Credito (Acquisti Articoli)</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : orderItems && orderItems.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ordine</TableHead>
                  <TableHead>Articolo</TableHead>
                  <TableHead className="text-right">Lordo</TableHead>
                  <TableHead className="text-right">IVA %</TableHead>
                  <TableHead className="text-right">Netto</TableHead>
                  <TableHead className="text-right">IVA</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orderItems.map((item) => {
                  const grossCost = (item.purchase_price || 0) * (item.quantity || 1);
                  const vatRate = item.vat_rate || 22;
                  const { netAmount, vatAmount } = calculateNetFromGross(grossCost, vatRate);
                  return (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">
                        {item.order.order_code || item.order.id.slice(0, 8)}
                      </TableCell>
                      <TableCell>{item.name}</TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(grossCost)}
                      </TableCell>
                      <TableCell className="text-right">{vatRate}%</TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(netAmount)}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(vatAmount)}
                      </TableCell>
                    </TableRow>
                  );
                })}
                <TableRow className="bg-muted/50 font-medium">
                  <TableCell colSpan={5} className="text-right">
                    Totale IVA Credito Articoli
                  </TableCell>
                  <TableCell className="text-right text-success">
                    {formatCurrency(vatSummary.vatCreditItems)}
                  </TableCell>
                </TableRow>

              </TableBody>
            </Table>
          ) : (
            <p className="text-muted-foreground text-center py-4">
              Nessun articolo con costo nel mese selezionato
            </p>
          )}
        </CardContent>
      </Card>

      {/* Teams detail */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dettaglio IVA a Credito (Squadre Esterne)</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : externalTeams && externalTeams.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ordine</TableHead>
                  <TableHead>Squadra</TableHead>
                  <TableHead className="text-right">Lordo</TableHead>
                  <TableHead className="text-right">IVA %</TableHead>
                  <TableHead className="text-right">Netto</TableHead>
                  <TableHead className="text-right">IVA</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {externalTeams.map((team) => {
                  const vatRate = team.vat_rate || 22;
                  const { netAmount, vatAmount } = calculateNetFromGross(team.total_cost, vatRate);
                  return (
                    <TableRow key={team.id}>
                      <TableCell className="font-medium">
                        {team.order.order_code || team.order.id.slice(0, 8)}
                      </TableCell>
                      <TableCell>{team.external_team?.name || "-"}</TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(team.total_cost)}
                      </TableCell>
                      <TableCell className="text-right">{vatRate}%</TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(netAmount)}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(vatAmount)}
                      </TableCell>
                    </TableRow>
                  );
                })}
                <TableRow className="bg-muted/50 font-medium">
                  <TableCell colSpan={5} className="text-right">
                    Totale IVA Credito Squadre
                  </TableCell>
                  <TableCell className="text-right text-success">
                    {formatCurrency(vatSummary.vatCreditTeams)}
                  </TableCell>
                </TableRow>

              </TableBody>
            </Table>
          ) : (
            <p className="text-muted-foreground text-center py-4">
              Nessuna squadra esterna nel mese selezionato
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
