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
  Receipt,
  TrendingUp,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
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
        <h1 className="text-2xl font-bold">I Miei Pagamenti</h1>
        <div className="bg-background border border-border/60 rounded-2xl p-8 text-center">
          <Wallet className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
          <p className="font-medium text-muted-foreground text-base">Nessun pagamento registrato</p>
          <p className="text-sm text-muted-foreground/70 mt-2">
            I pagamenti relativi ai tuoi ordini appariranno qui.
          </p>
        </div>
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
    <div className="space-y-6 pb-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">I Miei Pagamenti</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Riepilogo dei pagamenti relativi ai tuoi ordini
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-background border border-border/60 rounded-2xl p-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-muted/60 flex items-center justify-center">
              <Receipt className="h-5 w-5 text-muted-foreground" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground font-medium">Totale dovuto</p>
          <p className="text-xl font-bold mt-0.5">{fmtCur(summary.total)}</p>
        </div>
        <div className="bg-background border border-border/60 rounded-2xl p-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground font-medium">Pagato</p>
          <p className="text-xl font-bold text-emerald-600 mt-0.5">{fmtCur(summary.paid)}</p>
        </div>
        <div className="bg-background border border-border/60 rounded-2xl p-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <TrendingUp className="h-5 w-5 text-primary" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground font-medium">Residuo</p>
          <p className="text-xl font-bold mt-0.5">{fmtCur(summary.remaining)}</p>
        </div>
        {summary.overdue > 0 ? (
          <div className="bg-background border border-destructive/30 rounded-2xl p-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-destructive/10 flex items-center justify-center">
                <AlertTriangle className="h-5 w-5 text-destructive" />
              </div>
            </div>
            <p className="text-xs text-destructive font-medium">Scaduto</p>
            <p className="text-xl font-bold text-destructive mt-0.5">{fmtCur(summary.overdue)}</p>
          </div>
        ) : (
          <div className="bg-background border border-border/60 rounded-2xl p-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-muted/60 flex items-center justify-center">
                <Wallet className="h-5 w-5 text-muted-foreground" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground font-medium">Progresso</p>
            <p className="text-xl font-bold mt-0.5">{summary.paidCount}/{summary.totalCount} rate</p>
          </div>
        )}
      </div>

      {/* Progress bar */}
      <div className="bg-background border border-border/60 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold">Avanzamento pagamenti</p>
          <p className="text-base font-bold text-primary">{Math.round(summary.paidPercent)}%</p>
        </div>
        <Progress value={summary.paidPercent} className="h-3" />
        <div className="flex items-center justify-between mt-2">
          <p className="text-xs text-muted-foreground">{summary.paidCount} di {summary.totalCount} rate pagate</p>
          <p className="text-xs text-emerald-600 font-medium">{fmtCur(summary.paid)} su {fmtCur(summary.total)}</p>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-2.5 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-none">
        {filterButtons.map((fb) => (
          <button
            key={fb.key}
            onClick={() => setFilter(fb.key)}
            className={cn(
              "flex items-center gap-1.5 px-5 py-2.5 rounded-2xl text-sm font-medium transition-all whitespace-nowrap shrink-0",
              filter === fb.key
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-muted/60 text-muted-foreground hover:bg-muted"
            )}
          >
            {fb.label}
            {filterCounts[fb.key] > 0 && (
              <span className={cn(
                "text-xs tabular-nums",
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
        <div className="bg-background border border-border/60 rounded-2xl p-8 text-center">
          <p className="text-muted-foreground text-sm">Nessun pagamento con questo filtro.</p>
        </div>
      ) : (
        filteredGroups.map(({ order, installments: orderInstallments }) => {
          const orderPaid = orderInstallments.filter((i) => i.is_paid).reduce((s, i) => s + Number(i.amount), 0);
          const orderTotal = orderInstallments.reduce((s, i) => s + Number(i.amount), 0);
          const orderPaidPercent = orderTotal > 0 ? (orderPaid / orderTotal) * 100 : 0;

          return (
            <div key={order.id} className="bg-background border border-border/60 rounded-2xl overflow-hidden">
              {/* Order header */}
              <div className="p-5 pb-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Wallet className="h-5 w-5 text-primary shrink-0" />
                      <p className="text-base font-bold truncate">{order.order_code || "Ordine"}</p>
                    </div>
                    {order.description && (
                      <p className="text-sm text-muted-foreground truncate mt-0.5 pl-7">{order.description}</p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold">{fmtCur(orderPaid)}</p>
                    <p className="text-xs text-muted-foreground">su {fmtCur(orderTotal)}</p>
                  </div>
                </div>
                <Progress value={orderPaidPercent} className="h-2 mt-3" />
              </div>

              {/* Installment rows */}
              <div className="px-4 pb-4 space-y-3">
                {orderInstallments.map((inst, idx) => {
                  const status = getInstallmentStatus(inst);
                  const cfg = statusConfig[status];
                  const Icon = cfg.icon;
                  return (
                    <div
                      key={inst.id}
                      className={cn(
                        "p-4 rounded-xl border transition-colors",
                        cfg.bg, cfg.borderColor
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center shrink-0", cfg.bg, cfg.borderColor, "border")}>
                          <Icon className={cn("h-5 w-5", cfg.color)} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm font-semibold">{inst.label || `Rata ${inst.position}`}</p>
                            <Badge variant={cfg.badge} className="text-xs shrink-0">{cfg.label}</Badge>
                          </div>
                          <p className="text-lg font-bold tabular-nums mt-1">{fmtCur(Number(inst.amount))}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {inst.is_paid && inst.paid_date
                              ? `Pagato il ${format(new Date(inst.paid_date), "dd MMMM yyyy", { locale: it })}`
                              : inst.expected_date
                                ? `Scadenza: ${format(new Date(inst.expected_date), "dd MMMM yyyy", { locale: it })}`
                                : "Data non definita"}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
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
