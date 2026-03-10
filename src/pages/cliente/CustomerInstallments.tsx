import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { CreditCard, Loader2, CheckCircle2, Clock, AlertTriangle, Circle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { format, isPast, isToday, addDays, isBefore } from "date-fns";
import { it } from "date-fns/locale";
import { useMemo } from "react";

const fmtCur = (n: number) =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(n);

interface Installment {
  id: string;
  order_id: string;
  position: number;
  label: string;
  type: string;
  amount: number;
  is_paid: boolean;
  paid_date: string | null;
  expected_date: string | null;
  order: { id: string; order_code: string; description: string; total_amount: number };
}

function getInstallmentStatus(inst: Installment) {
  if (inst.is_paid) return "paid";
  if (!inst.expected_date) return "pending";
  const date = new Date(inst.expected_date);
  if (isPast(date) && !isToday(date)) return "overdue";
  if (isBefore(date, addDays(new Date(), 7))) return "due_soon";
  return "pending";
}

const statusConfig = {
  paid: { label: "Pagata", icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-950/30", badge: "default" as const },
  overdue: { label: "Scaduta", icon: AlertTriangle, color: "text-destructive", bg: "bg-destructive/5", badge: "destructive" as const },
  due_soon: { label: "In scadenza", icon: Clock, color: "text-amber-600", bg: "bg-amber-50 dark:bg-amber-950/30", badge: "secondary" as const },
  pending: { label: "Da pagare", icon: Circle, color: "text-muted-foreground", bg: "bg-muted/30", badge: "outline" as const },
};

export default function CustomerInstallments() {
  const { user } = useAuth();

  const { data: installments = [], isLoading } = useQuery({
    queryKey: ["customer-installments", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_installments")
        .select(`
          id, order_id, position, label, type, amount, is_paid, paid_date, expected_date,
          order:orders!inner(id, order_code, description, total_amount, customer_id)
        `)
        .eq("order.customer_id", user!.id)
        .order("position", { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as Installment[];
    },
    enabled: !!user?.id,
    staleTime: 2 * 60 * 1000,
  });

  // Group by order
  const orderGroups = useMemo(() => {
    const map = new Map<string, { order: Installment["order"]; installments: Installment[] }>();
    installments.forEach((inst) => {
      const key = inst.order_id;
      if (!map.has(key)) {
        map.set(key, { order: inst.order, installments: [] });
      }
      map.get(key)!.installments.push(inst);
    });
    return Array.from(map.values());
  }, [installments]);

  // Summary
  const summary = useMemo(() => {
    const total = installments.reduce((s, i) => s + Number(i.amount), 0);
    const paid = installments.filter((i) => i.is_paid).reduce((s, i) => s + Number(i.amount), 0);
    const overdue = installments.filter((i) => getInstallmentStatus(i) === "overdue").reduce((s, i) => s + Number(i.amount), 0);
    return { total, paid, remaining: total - paid, overdue, paidPercent: total > 0 ? (paid / total) * 100 : 0 };
  }, [installments]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (installments.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold">Piano Rate</h1>
        <Card>
          <CardContent className="py-12 text-center">
            <CreditCard className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-muted-foreground">Nessun piano rate attivo.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Piano Rate</h1>

      {/* Summary card */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
            <div>
              <p className="text-xs text-muted-foreground">Totale</p>
              <p className="text-lg font-bold">{fmtCur(summary.total)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Pagato</p>
              <p className="text-lg font-bold text-emerald-600">{fmtCur(summary.paid)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Residuo</p>
              <p className="text-lg font-bold">{fmtCur(summary.remaining)}</p>
            </div>
            {summary.overdue > 0 && (
              <div>
                <p className="text-xs text-muted-foreground">Scaduto</p>
                <p className="text-lg font-bold text-destructive">{fmtCur(summary.overdue)}</p>
              </div>
            )}
          </div>
          <Progress value={summary.paidPercent} className="h-2" />
          <p className="text-xs text-muted-foreground mt-1">{Math.round(summary.paidPercent)}% completato</p>
        </CardContent>
      </Card>

      {/* Order groups */}
      {orderGroups.map(({ order, installments: orderInstallments }) => {
        const orderPaid = orderInstallments.filter((i) => i.is_paid).reduce((s, i) => s + Number(i.amount), 0);
        const orderTotal = orderInstallments.reduce((s, i) => s + Number(i.amount), 0);
        return (
          <Card key={order.id}>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center justify-between text-base">
                <span className="flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-primary" />
                  Ordine {order.order_code || "—"}
                </span>
                <span className="text-sm font-normal text-muted-foreground">
                  {fmtCur(orderPaid)} / {fmtCur(orderTotal)}
                </span>
              </CardTitle>
              {order.description && (
                <p className="text-xs text-muted-foreground truncate">{order.description}</p>
              )}
            </CardHeader>
            <CardContent className="space-y-2">
              {orderInstallments.map((inst) => {
                const status = getInstallmentStatus(inst);
                const cfg = statusConfig[status];
                const Icon = cfg.icon;
                return (
                  <div key={inst.id} className={`flex items-center justify-between p-3 rounded-lg border ${cfg.bg} gap-3`}>
                    <div className="flex items-center gap-3 min-w-0">
                      <Icon className={`h-4 w-4 shrink-0 ${cfg.color}`} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{inst.label || `Rata ${inst.position}`}</p>
                        <p className="text-xs text-muted-foreground">
                          {inst.is_paid && inst.paid_date
                            ? `Pagata il ${format(new Date(inst.paid_date), "dd MMM yyyy", { locale: it })}`
                            : inst.expected_date
                              ? `Scadenza ${format(new Date(inst.expected_date), "dd MMM yyyy", { locale: it })}`
                              : "Data non definita"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant={cfg.badge}>{cfg.label}</Badge>
                      <span className="text-sm font-semibold">{fmtCur(Number(inst.amount))}</span>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
