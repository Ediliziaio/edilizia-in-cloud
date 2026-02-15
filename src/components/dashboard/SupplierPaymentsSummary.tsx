import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "react-router-dom";
import { formatCurrency } from "@/lib/formatters";
import { Truck, CheckCircle, Clock } from "lucide-react";
import { PAYMENT_METHODS } from "@/components/orders/OrderItemsList";

interface SupplierSummary {
  id: string | null;
  name: string;
  totalPaid: number;
  totalUnpaid: number;
  total: number;
  paymentMethod: string | null;
}

export function SupplierPaymentsSummary() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  const { data: supplierSummaries = [], isLoading } = useQuery({
    queryKey: ["supplier-payments-summary", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_items")
        .select(`
          purchase_price, quantity, is_paid, payment_method, supplier_id,
          order:orders!inner(company_id)
        `)
        .eq("order.company_id", companyId!);

      if (error) throw error;

      // Fetch suppliers
      const { data: suppliers } = await supabase
        .from("suppliers")
        .select("id, name")
        .eq("company_id", companyId!);

      const supplierMap = new Map(
        (suppliers || []).map((s) => [s.id, s.name])
      );

      // Group by supplier
      const grouped = new Map<string, { totalPaid: number; totalUnpaid: number; methods: Map<string, number> }>();

      (data || []).forEach((item) => {
        const key = item.supplier_id || "__none__";
        if (!grouped.has(key)) {
          grouped.set(key, { totalPaid: 0, totalUnpaid: 0, methods: new Map() });
        }
        const entry = grouped.get(key)!;
        const cost = (item.purchase_price || 0) * (item.quantity || 1);
        if (item.is_paid) {
          entry.totalPaid += cost;
        } else {
          entry.totalUnpaid += cost;
        }
        if (item.payment_method) {
          entry.methods.set(item.payment_method, (entry.methods.get(item.payment_method) || 0) + 1);
        }
      });

      const summaries: SupplierSummary[] = [];
      grouped.forEach((entry, key) => {
        const total = entry.totalPaid + entry.totalUnpaid;
        if (total <= 0) return;

        // Find most common payment method
        let topMethod: string | null = null;
        let topCount = 0;
        entry.methods.forEach((count, method) => {
          if (count > topCount) {
            topCount = count;
            topMethod = method;
          }
        });

        summaries.push({
          id: key === "__none__" ? null : key,
          name: key === "__none__" ? "Senza fornitore" : (supplierMap.get(key) || "Fornitore sconosciuto"),
          totalPaid: entry.totalPaid,
          totalUnpaid: entry.totalUnpaid,
          total,
          paymentMethod: topMethod,
        });
      });

      return summaries.sort((a, b) => b.total - a.total);
    },
    enabled: !!companyId,
    staleTime: 2 * 60 * 1000,
  });

  const getPaymentMethodLabel = (value: string | null) => {
    if (!value) return null;
    return PAYMENT_METHODS.find((m) => m.value === value)?.label || value;
  };

  const totalPaidAll = supplierSummaries.reduce((s, x) => s + x.totalPaid, 0);
  const totalUnpaidAll = supplierSummaries.reduce((s, x) => s + x.totalUnpaid, 0);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5 text-primary" />
            Pagamenti Fornitori
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Truck className="h-5 w-5 text-primary" />
              Pagamenti Fornitori
            </CardTitle>
            <CardDescription>Riepilogo pagamenti per fornitore</CardDescription>
          </div>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/azienda/previsionale">Dettaglio</Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {supplierSummaries.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <Truck className="h-10 w-10 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Nessun articolo con fornitore associato</p>
            <p className="text-xs mt-1">I pagamenti appariranno qui quando aggiungi articoli agli ordini</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Totals */}
            <div className="flex items-center justify-between text-sm pb-2 border-b">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-3.5 w-3.5 text-green-600" />
                <span>Pagato: <span className="font-semibold text-green-600">{formatCurrency(totalPaidAll)}</span></span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="h-3.5 w-3.5 text-amber-600" />
                <span>Da pagare: <span className="font-semibold text-amber-600">{formatCurrency(totalUnpaidAll)}</span></span>
              </div>
            </div>

            {/* Per-supplier rows */}
            <div className="space-y-3 max-h-[280px] overflow-y-auto pr-1">
              {supplierSummaries.map((supplier) => {
                const paidPercent = supplier.total > 0 ? Math.round((supplier.totalPaid / supplier.total) * 100) : 0;
                return (
                  <div key={supplier.id || "__none__"} className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium truncate max-w-[140px]">{supplier.name}</span>
                      <div className="flex items-center gap-1.5">
                        {paidPercent === 100 ? (
                          <Badge variant="secondary" className="bg-green-100 text-green-700 hover:bg-green-100 text-xs">
                            Pagato
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="bg-amber-100 text-amber-700 hover:bg-amber-100 text-xs">
                            Da pagare
                          </Badge>
                        )}
                      </div>
                    </div>
                    <Progress value={paidPercent} className="h-2" />
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{formatCurrency(supplier.totalPaid)} / {formatCurrency(supplier.total)}</span>
                      {supplier.paymentMethod && (
                        <span className="text-xs">{getPaymentMethodLabel(supplier.paymentMethod)}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
