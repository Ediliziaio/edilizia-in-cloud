import { memo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { fmtCur } from "@/components/marketing/dashboard/utils";
import { safeNumber } from "@/hooks/useCruscottoData";

export type DrilldownType = "revenue" | "margin" | "late-orders" | "tickets" | null;

interface Props {
  type: DrilldownType;
  onClose: () => void;
  dateFrom: Date;
  dateTo: Date;
}

export const DrilldownDrawer = memo(function DrilldownDrawer({ type, onClose, dateFrom, dateTo }: Props) {
  if (!type) return null;

  return (
    <Sheet open={!!type} onOpenChange={() => onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{TITLES[type]}</SheetTitle>
        </SheetHeader>
        <div className="mt-4">
          {type === "revenue" && <RevenueDrill dateFrom={dateFrom} dateTo={dateTo} />}
          {type === "margin" && <MarginDrill dateFrom={dateFrom} dateTo={dateTo} />}
          {type === "late-orders" && <LateOrdersDrill />}
          {type === "tickets" && <TicketsDrill />}
        </div>
      </SheetContent>
    </Sheet>
  );
});

const TITLES: Record<string, string> = {
  revenue: "Dettaglio Ricavi",
  margin: "Dettaglio Margini per Ordine",
  "late-orders": "Ordini in Ritardo",
  tickets: "Ticket Aperti",
};

function RevenueDrill({ dateFrom, dateTo }: { dateFrom: Date; dateTo: Date }) {
  const { effectiveCompany } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ["drill-revenue", effectiveCompany?.id, dateFrom.toISOString(), dateTo.toISOString()],
    queryFn: async () => {
      const { data, error } = await supabase.from("orders")
        .select("id, order_code, description, total_amount, created_at, customer:customers(name)")
        .eq("company_id", effectiveCompany!.id)
        .gte("created_at", dateFrom.toISOString())
        .lte("created_at", dateTo.toISOString())
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
    enabled: !!effectiveCompany?.id,
  });

  if (isLoading) return <DrillSkeleton />;
  if (!data?.length) return <EmptyDrill />;

  return (
    <div className="space-y-2">
      {data.map((o: any) => (
        <div key={o.id} className="flex items-center justify-between p-3 rounded-lg border text-sm">
          <div className="min-w-0">
            <div className="font-medium truncate">{o.order_code || o.description || "Ordine"}</div>
            <div className="text-xs text-muted-foreground">{(o.customer as any)?.name || "—"}</div>
          </div>
          <div className="font-semibold tabular-nums shrink-0 ml-4">{fmtCur(safeNumber(o.total_amount))}</div>
        </div>
      ))}
    </div>
  );
}

function MarginDrill({ dateFrom, dateTo }: { dateFrom: Date; dateTo: Date }) {
  const { effectiveCompany } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ["drill-margin", effectiveCompany?.id, dateFrom.toISOString(), dateTo.toISOString()],
    queryFn: async () => {
      const { data, error } = await supabase.from("orders")
        .select("id, order_code, description, total_amount, order_items(purchase_price, quantity), order_employees(total_cost), order_external_teams(total_cost)")
        .eq("company_id", effectiveCompany!.id)
        .gte("created_at", dateFrom.toISOString())
        .lte("created_at", dateTo.toISOString())
        .order("total_amount", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
    enabled: !!effectiveCompany?.id,
  });

  if (isLoading) return <DrillSkeleton />;
  if (!data?.length) return <EmptyDrill />;

  return (
    <div className="space-y-2">
      {data.map((o: any) => {
        const revenue = safeNumber(o.total_amount);
        const cost = (o.order_items || []).reduce((s: number, i: any) => s + safeNumber(i.purchase_price) * safeNumber(i.quantity, 1), 0)
          + (o.order_employees || []).reduce((s: number, e: any) => s + safeNumber(e.total_cost), 0)
          + (o.order_external_teams || []).reduce((s: number, e: any) => s + safeNumber(e.total_cost), 0);
        const marginPct = revenue > 0 ? ((revenue - cost) / revenue) * 100 : 0;

        return (
          <div key={o.id} className="p-3 rounded-lg border text-sm">
            <div className="flex justify-between mb-1">
              <span className="font-medium truncate">{o.order_code || o.description || "Ordine"}</span>
              <span className={cn("font-bold tabular-nums", marginPct >= 20 ? "text-emerald-600" : "text-destructive")}>
                {safeNumber(marginPct).toFixed(1)}%
              </span>
            </div>
            <div className="flex gap-4 text-xs text-muted-foreground">
              <span>Ricavo: {fmtCur(revenue)}</span>
              <span>Costo: {fmtCur(cost)}</span>
              <span>Margine: {fmtCur(revenue - cost)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function LateOrdersDrill() {
  const { effectiveCompany } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ["drill-late", effectiveCompany?.id],
    queryFn: async () => {
      const todayStr = new Date().toISOString().split("T")[0];
      const { data, error } = await supabase.from("orders")
        .select("id, order_code, description, expected_date, customer:customers(name)")
        .eq("company_id", effectiveCompany!.id)
        .lt("expected_date", todayStr)
        .is("work_end_date", null)
        .order("expected_date", { ascending: true })
        .limit(50);
      if (error) throw error;
      return data;
    },
    enabled: !!effectiveCompany?.id,
  });

  if (isLoading) return <DrillSkeleton />;
  if (!data?.length) return <EmptyDrill />;

  const today = new Date();
  return (
    <div className="space-y-2">
      {data.map((o: any) => {
        const daysLate = o.expected_date ? Math.ceil((today.getTime() - new Date(o.expected_date).getTime()) / 86400000) : 0;
        return (
          <div key={o.id} className="flex items-center justify-between p-3 rounded-lg border text-sm">
            <div className="min-w-0">
              <div className="font-medium truncate">{o.order_code || o.description || "Ordine"}</div>
              <div className="text-xs text-muted-foreground">{(o.customer as any)?.name || "—"}</div>
            </div>
            <div className="text-right shrink-0 ml-4">
              <div className="font-semibold text-destructive">{daysLate}gg in ritardo</div>
              <div className="text-xs text-muted-foreground">{o.expected_date}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TicketsDrill() {
  const { effectiveCompany } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ["drill-tickets", effectiveCompany?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("tickets")
        .select("id, subject, priority, created_at")
        .eq("company_id", effectiveCompany!.id)
        .eq("status", "aperto")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
    enabled: !!effectiveCompany?.id,
  });

  if (isLoading) return <DrillSkeleton />;
  if (!data?.length) return <EmptyDrill />;

  return (
    <div className="space-y-2">
      {data.map((t: any) => (
        <div key={t.id} className="flex items-center justify-between p-3 rounded-lg border text-sm">
          <div className="min-w-0">
            <div className="font-medium truncate">{t.subject || "Ticket"}</div>
            <div className="text-xs text-muted-foreground">{new Date(t.created_at).toLocaleDateString("it-IT")}</div>
          </div>
          <span className={cn(
            "text-xs px-2 py-0.5 rounded-full shrink-0",
            t.priority === "alta" || t.priority === "urgente" ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"
          )}>
            {t.priority || "normale"}
          </span>
        </div>
      ))}
    </div>
  );
}

function DrillSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-16 w-full rounded-lg" />
      ))}
    </div>
  );
}

function EmptyDrill() {
  return (
    <p className="text-sm text-muted-foreground text-center py-8">Nessun dato per il periodo selezionato</p>
  );
}
