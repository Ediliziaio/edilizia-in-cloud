import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { formatCurrency } from "@/lib/formatters";
import { Truck, CheckCircle, Clock, AlertTriangle } from "lucide-react";
import { differenceInDays, parseISO, startOfDay } from "date-fns";
import { format } from "date-fns";
import { PAYMENT_METHODS } from "@/components/orders/OrderItemsList";

interface SupplierPaymentItem {
  id: string;
  name: string;
  supplier_id: string | null;
  purchase_price: number | null;
  quantity: number;
  is_paid: boolean | null;
  payment_method: string | null;
  deposit_amount: number | null;
  deposit_paid: boolean | null;
  deposit_paid_date: string | null;
  balance_amount: number | null;
  balance_paid: boolean | null;
  balance_paid_date: string | null;
  balance_expected_date: string | null;
}

interface SupplierPaymentsCardProps {
  items: SupplierPaymentItem[];
  companyId: string;
}

interface SupplierGroup {
  supplierId: string | null;
  supplierName: string;
  total: number;
  paid: number;
  unpaid: number;
  nextDeadline: string | null;
  paymentMethod: string | null;
}

const INSTALLMENT_METHODS = ["50_50", "30_70"];

function isInstallmentMethod(method: string | null): boolean {
  return !!method && INSTALLMENT_METHODS.includes(method);
}

export function SupplierPaymentsCard({ items, companyId }: SupplierPaymentsCardProps) {
  // Fetch supplier names
  const supplierIds = useMemo(
    () => [...new Set(items.map((i) => i.supplier_id).filter(Boolean))] as string[],
    [items]
  );

  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers-for-payments", companyId, supplierIds],
    queryFn: async () => {
      if (supplierIds.length === 0) return [];
      const { data, error } = await supabase
        .from("suppliers")
        .select("id, name")
        .in("id", supplierIds);
      if (error) throw error;
      return data;
    },
    enabled: supplierIds.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  const supplierMap = useMemo(
    () => new Map(suppliers.map((s) => [s.id, s.name])),
    [suppliers]
  );

  // Group items by supplier and calculate totals
  const groups = useMemo<SupplierGroup[]>(() => {
    const itemsWithSupplier = items.filter((i) => i.supplier_id);
    if (itemsWithSupplier.length === 0) return [];

    const grouped = new Map<string, SupplierPaymentItem[]>();
    itemsWithSupplier.forEach((item) => {
      const key = item.supplier_id!;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(item);
    });

    const result: SupplierGroup[] = [];
    grouped.forEach((groupItems, supplierId) => {
      let total = 0;
      let paid = 0;
      let nextDeadline: string | null = null;
      let primaryMethod: string | null = null;

      groupItems.forEach((item) => {
        const cost = (item.purchase_price || 0) * (item.quantity || 1);
        total += cost;

        if (!primaryMethod && item.payment_method) {
          primaryMethod = item.payment_method;
        }

        if (isInstallmentMethod(item.payment_method)) {
          // Installment-based: check deposit + balance separately
          if (item.deposit_paid && item.deposit_amount) {
            paid += item.deposit_amount;
          }
          if (item.balance_paid && item.balance_amount) {
            paid += item.balance_amount;
          }
          // Track next unpaid balance deadline
          if (!item.balance_paid && item.balance_expected_date) {
            if (!nextDeadline || item.balance_expected_date < nextDeadline) {
              nextDeadline = item.balance_expected_date;
            }
          }
        } else {
          // Single payment: use is_paid
          if (item.is_paid) {
            paid += cost;
          }
        }
      });

      result.push({
        supplierId,
        supplierName: supplierMap.get(supplierId) || "Fornitore",
        total,
        paid,
        unpaid: total - paid,
        nextDeadline,
        paymentMethod: primaryMethod,
      });
    });

    return result.sort((a, b) => b.total - a.total);
  }, [items, supplierMap]);

  if (groups.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Truck className="h-5 w-5 text-primary" />
            Pagamenti Fornitori
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4 text-muted-foreground">
            <Truck className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">Nessun fornitore associato</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const totalPaid = groups.reduce((s, g) => s + g.paid, 0);
  const totalUnpaid = groups.reduce((s, g) => s + g.unpaid, 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Truck className="h-5 w-5 text-primary" />
          Pagamenti Fornitori
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary row */}
        <div className="flex items-center justify-between text-sm pb-2 border-b">
          <div className="flex items-center gap-1.5">
            <CheckCircle className="h-3.5 w-3.5 text-green-600" />
            <span>
              Pagato:{" "}
              <span className="font-semibold text-green-600">
                {formatCurrency(totalPaid)}
              </span>
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-amber-600" />
            <span>
              Da pagare:{" "}
              <span className="font-semibold text-amber-600">
                {formatCurrency(totalUnpaid)}
              </span>
            </span>
          </div>
        </div>

        {/* Per-supplier rows */}
        <div className="space-y-3">
          {groups.map((group) => {
            const paidPercent =
              group.total > 0
                ? Math.round((group.paid / group.total) * 100)
                : 0;

            const deadlineInfo = getDeadlineInfo(group.nextDeadline);

            return (
              <div key={group.supplierId} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium truncate max-w-[160px]">
                    {group.supplierName}
                  </span>
                  <StatusBadge paidPercent={paidPercent} />
                </div>
                <Progress value={paidPercent} className="h-2" />
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {formatCurrency(group.paid)} / {formatCurrency(group.total)}
                  </span>
                  {group.paymentMethod && (
                    <span>
                      {PAYMENT_METHODS.find((m) => m.value === group.paymentMethod)?.label || group.paymentMethod}
                    </span>
                  )}
                </div>
                {deadlineInfo && (
                  <div className={`flex items-center gap-1 text-xs ${deadlineInfo.colorClass}`}>
                    <AlertTriangle className="h-3 w-3" />
                    <span>{deadlineInfo.label}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ paidPercent }: { paidPercent: number }) {
  if (paidPercent >= 100) {
    return (
      <Badge variant="secondary" className="bg-green-100 text-green-700 hover:bg-green-100 text-xs">
        Pagato
      </Badge>
    );
  }
  if (paidPercent > 0) {
    return (
      <Badge variant="secondary" className="bg-amber-100 text-amber-700 hover:bg-amber-100 text-xs">
        Parziale
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="bg-red-100 text-red-700 hover:bg-red-100 text-xs">
      Da pagare
    </Badge>
  );
}

function getDeadlineInfo(dateStr: string | null): { label: string; colorClass: string } | null {
  if (!dateStr) return null;
  const today = startOfDay(new Date());
  const deadline = startOfDay(parseISO(dateStr));
  const days = differenceInDays(deadline, today);
  const formatted = format(deadline, "dd/MM/yyyy");

  if (days < 0) {
    return { label: `Scadenza saldo: ${formatted} (scaduto)`, colorClass: "text-red-600" };
  }
  if (days <= 7) {
    return { label: `Scadenza saldo: ${formatted}`, colorClass: "text-amber-600" };
  }
  return { label: `Scadenza saldo: ${formatted}`, colorClass: "text-muted-foreground" };
}
