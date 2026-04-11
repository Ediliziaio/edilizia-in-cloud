import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  Wallet,
  Loader2,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Circle,
  ArrowRight,
  Receipt,
  TrendingUp,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { format, isPast, isToday, addDays, isBefore } from "date-fns";
import { it } from "date-fns/locale";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";

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

type StatusKey = "paid" | "overdue" | "due_soon" | "pending";

function getInstallmentStatus(inst: Installment): StatusKey {
  if (inst.is_paid) return "paid";
  if (!inst.expected_date) return "pending";
  const date = new Date(inst.expected_date);
  if (isPast(date) && !isToday(date)) return "overdue";
  if (isBefore(date, addDays(new Date(), 7))) return "due_soon";
  return "pending";
}

const statusConfig: Record<StatusKey, { label: string; icon: typeof CheckCircle2; color: string; bg: string; badge: "default" | "destructive" | "secondary" | "outline"; borderColor: string }> = {
  paid:     { label: "Pagato",      icon: CheckCircle2,  color: "text-emerald-600", bg: "bg-emerald-50",      badge: "default",      borderColor: "border-emerald-200" },
  overdue:  { label: "Scaduto",     icon: AlertTriangle, color: "text-destructive", bg: "bg-destructive/5",   badge: "destructive",  borderColor: "border-destructive/20" },
  due_soon: { label: "In scadenza", icon: Clock,         color: "text-amber-600",   bg: "bg-amber-50",        badge: "secondary",    borderColor: "border-amber-200" },
  pending:  { label: "Da pagare",   icon: Circle,        color: "text-muted-foreground", bg: "bg-muted/30",   badge: "outline",      borderColor: "border-border" },
};

type FilterKey = "all" | StatusKey;

export default function CustomerInstallments() {
  const { user } = useAuth();
  const [filter, setFilter] = useState<FilterKey>("all");

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
    const dueSoon = installments.filter((i) => getInstallmentStatus(i) === "due_soon").reduce((s, i) => s + Number(i.amount), 0);
    const paidCount = installments.filter((i) => i.is_paid).length;
    const totalCount = installments.length;
    return {
      total, paid, remaining: total - paid, overdue, dueSoon,
      paidPercent: total > 0 ? (paid / total) * 100 : 0,
      paidCount, totalCount,
    };
  }, [installments]);

  // Filter counts
  const filterCounts = useMemo(() => {
    const counts: Record<FilterKey, number> = { all: installments.length, paid: 0, overdue: 0, due_soon: 0, pending: 0 };
    installments.forEach((i) => {
      counts[getInstallmentStatus(i)]++;
    });
    return counts;
  }, [installments]);

  // Filtered groups
  const filteredGroups = useMemo(() => {
    if (filter === "all") return orderGroups;
    return orderGroups
      .map((g) => ({
        ...g,
        installments: g.installments.filter((i) => getInstallmentStatus(i) === filter),
      }))
      .filter((g) => g.installments.length > 0);
  }, [orderGroups, filter]);

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
        <h1 className="text-xl font-bold">Stato Pagamenti</h1>
        <Card>
          <CardContent className="py-12 text-center">
            <Wallet className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
            <p className="font-medium text-muted-foreground">Nessun pagamento registrato</p>
            <p className="text-sm text-muted-foreground/70 mt-1">
              I pagamenti relativi ai tuoi ordini appariranno qui.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const filterButtons: { key: FilterKey; label: string; color?: string }[] = [
    { key: "all", label: "Tutti" },
    { key: "paid", label: "Pagati", color: "text-emerald-600" },
    { key: "pending", label: "Da pagare" },
    { key: "due_soon", label: "In scadenza", color: "text-amber-600" },
    { key: "overdue", label: "Scaduti", color: "text-destructive" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Stato Pagamenti</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Riepilogo dei pagamenti relativi ai tuoi ordini
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <Receipt className="h-4 w-4 text-muted-foreground" />
              <p className="text-xs text-muted-foreground font-medium">Totale dovuto</p>
            </div>
            <p className="text-lg font-bold">{fmtCur(summary.total)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <p className="text-xs text-muted-foreground font-medium">Pagato</p>
            </div>
            <p className="text-lg font-bold text-emerald-600">{fmtCur(summary.paid)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="h-4 w-4 text-primary" />
              <p className="text-xs text-muted-foreground font-medium">Residuo</p>
            </div>
            <p className="text-lg font-bold">{fmtCur(summary.remaining)}</p>
          </CardContent>
        </Card>
        {summary.overdue > 0 ? (
          <Card className="border-destructive/30">
            <CardContent className="pt-4 pb-3 px-4">
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                <p className="text-xs text-destructive font-medium">Scaduto</p>
              </div>
              <p className="text-lg font-bold text-destructive">{fmtCur(summary.overdue)}</p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="pt-4 pb-3 px-4">
              <div className="flex items-center gap-2 mb-1">
                <Wallet className="h-4 w-4 text-muted-foreground" />
                <p className="text-xs text-muted-foreground font-medium">Progresso</p>
              </div>
              <p className="text-lg font-bold">{summary.paidCount}/{summary.totalCount} rate</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Progress bar */}
      <Card>
        <CardContent className="pt-4 pb-3 px-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium">Avanzamento pagamenti</p>
            <p className="text-sm text-muted-foreground">{Math.round(summary.paidPercent)}%</p>
          </div>
          <Progress value={summary.paidPercent} className="h-2.5" />
          <div className="flex items-center justify-between mt-1.5">
            <p className="text-xs text-muted-foreground">{summary.paidCount} di {summary.totalCount} rate pagate</p>
            <p className="text-xs text-emerald-600 font-medium">{fmtCur(summary.paid)} su {fmtCur(summary.total)}</p>
          </div>
        </CardContent>
      </Card>

      {/* Filter tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {filterButtons.map((fb) => (
          <button
            key={fb.key}
            onClick={() => setFilter(fb.key)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap",
              filter === fb.key
                ? "bg-primary text-primary-foreground"
                : "bg-muted/60 text-muted-foreground hover:bg-muted"
            )}
          >
            {fb.label}
            {filterCounts[fb.key] > 0 && (
              <span className={cn(
                "text-xs",
                filter === fb.key ? "text-primary-foreground/80" : "text-muted-foreground/60"
              )}>
                ({filterCounts[fb.key]})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Order groups */}
      {filteredGroups.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground text-sm">Nessun pagamento con questo filtro.</p>
          </CardContent>
        </Card>
      ) : (
        filteredGroups.map(({ order, installments: orderInstallments }) => {
          const orderPaid = orderInstallments.filter((i) => i.is_paid).reduce((s, i) => s + Number(i.amount), 0);
          const orderTotal = orderInstallments.reduce((s, i) => s + Number(i.amount), 0);
          const orderPaidPercent = orderTotal > 0 ? (orderPaid / orderTotal) * 100 : 0;

          return (
            <Card key={order.id}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Wallet className="h-4 w-4 text-primary" />
                    {order.order_code || "Ordine"}
                  </CardTitle>
                  <div className="text-right">
                    <p className="text-sm font-semibold">{fmtCur(orderPaid)} <span className="text-muted-foreground font-normal">/ {fmtCur(orderTotal)}</span></p>
                  </div>
                </div>
                {order.description && (
                  <p className="text-xs text-muted-foreground truncate mt-0.5">{order.description}</p>
                )}
                <Progress value={orderPaidPercent} className="h-1.5 mt-2" />
              </CardHeader>
              <CardContent className="pt-0 space-y-2">
                {orderInstallments.map((inst, idx) => {
                  const status = getInstallmentStatus(inst);
                  const cfg = statusConfig[status];
                  const Icon = cfg.icon;
                  return (
                    <div
                      key={inst.id}
                      className={cn(
                        "flex items-center justify-between p-3 rounded-lg border gap-3 transition-colors",
                        cfg.bg, cfg.borderColor
                      )}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={cn("h-8 w-8 rounded-full flex items-center justify-center shrink-0", cfg.bg)}>
                          <Icon className={cn("h-4 w-4", cfg.color)} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{inst.label || `Rata ${inst.position}`}</p>
                          <p className="text-xs text-muted-foreground">
                            {inst.is_paid && inst.paid_date
                              ? `Pagato il ${format(new Date(inst.paid_date), "dd MMMM yyyy", { locale: it })}`
                              : inst.expected_date
                                ? `Scadenza: ${format(new Date(inst.expected_date), "dd MMMM yyyy", { locale: it })}`
                                : "Data non definita"}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant={cfg.badge} className="text-xs">{cfg.label}</Badge>
                        <span className="text-sm font-bold tabular-nums">{fmtCur(Number(inst.amount))}</span>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          );
        })
      )}

      {/* Info footer */}
      <p className="text-xs text-muted-foreground text-center pb-4">
        I pagamenti vengono aggiornati automaticamente dall'ufficio. Per qualsiasi domanda contatta l'assistenza.
      </p>
    </div>
  );
}
