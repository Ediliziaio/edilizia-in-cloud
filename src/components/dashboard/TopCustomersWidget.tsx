import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Users, Crown } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";

interface Props {
  companyId: string | undefined;
  dateFrom: Date;
  dateTo: Date;
}

interface Row {
  customerId: string;
  customerName: string;
  totalRevenue: number;
  orderCount: number;
}

export function TopCustomersWidget({ companyId, dateFrom, dateTo }: Props) {
  const { data = [], isLoading } = useQuery({
    queryKey: ["dashboard", "top-customers", companyId, dateFrom.toISOString(), dateTo.toISOString()],
    enabled: !!companyId,
    staleTime: 3 * 60 * 1000,
    queryFn: async (): Promise<Row[]> => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("orders")
        .select("customer_id, total_amount, customer:profiles!orders_customer_id_fkey(id, first_name, last_name)")
        .eq("company_id", companyId)
        .gte("created_at", dateFrom.toISOString())
        .lte("created_at", dateTo.toISOString())
        .not("customer_id", "is", null);
      if (error) throw error;

      const grouped = new Map<string, Row>();
      (data || []).forEach((row: any) => {
        const cid = row.customer_id as string;
        if (!cid) return;
        const name = row.customer
          ? `${row.customer.first_name ?? ""} ${row.customer.last_name ?? ""}`.trim() || "Cliente"
          : "Cliente";
        const existing = grouped.get(cid);
        const amount = Number(row.total_amount) || 0;
        if (existing) {
          existing.totalRevenue += amount;
          existing.orderCount += 1;
        } else {
          grouped.set(cid, { customerId: cid, customerName: name, totalRevenue: amount, orderCount: 1 });
        }
      });
      return Array.from(grouped.values())
        .sort((a, b) => b.totalRevenue - a.totalRevenue)
        .slice(0, 5);
    },
  });

  const maxRevenue = useMemo(
    () => data.reduce((m, r) => Math.max(m, r.totalRevenue), 0),
    [data]
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Crown className="h-4 w-4 text-amber-500" />
              Top Clienti
            </CardTitle>
            <CardDescription>I 5 clienti con più fatturato nel periodo</CardDescription>
          </div>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/azienda/clienti">Tutti</Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : data.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <Users className="h-10 w-10 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Nessun cliente nel periodo</p>
          </div>
        ) : (
          <div className="space-y-3">
            {data.map((row, idx) => {
              const pct = maxRevenue > 0 ? (row.totalRevenue / maxRevenue) * 100 : 0;
              return (
                <Link
                  key={row.customerId}
                  to={`/azienda/clienti/${row.customerId}`}
                  className="block group"
                >
                  <div className="flex items-center justify-between gap-3 mb-1">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className={`inline-flex items-center justify-center h-5 w-5 rounded-full text-[10px] font-bold shrink-0 ${
                        idx === 0
                          ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                          : idx === 1
                          ? "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200"
                          : idx === 2
                          ? "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300"
                          : "bg-muted text-muted-foreground"
                      }`}>
                        {idx + 1}
                      </span>
                      <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">
                        {row.customerName}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold tabular-nums">{formatCurrency(row.totalRevenue)}</p>
                      <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                        {row.orderCount} {row.orderCount === 1 ? "ordine" : "ordini"}
                      </Badge>
                    </div>
                  </div>
                  <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-primary/60 to-primary rounded-full transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
