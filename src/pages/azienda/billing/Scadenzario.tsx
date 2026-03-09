import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { format, isPast, isToday, addDays, differenceInDays } from "date-fns";
import { it } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { CalendarClock, AlertTriangle, CheckCircle2, CreditCard, Loader2 } from "lucide-react";

export default function Scadenzario() {
  const { effectiveCompany } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const companyId = effectiveCompany?.id;
  const [filter, setFilter] = useState("open");

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ["scadenzario", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("*, invoice_payments(amount)")
        .eq("company_id", companyId!)
        .in("status", ["issued", "sent", "delivered", "overdue", "paid"])
        .not("due_date", "is", null)
        .order("due_date", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const markPaidMutation = useMutation({
    mutationFn: async (inv: { id: string; remaining: number }) => {
      const { error } = await supabase.from("invoice_payments").insert({
        invoice_id: inv.id,
        company_id: companyId!,
        amount: inv.remaining,
        payment_date: new Date().toISOString().split("T")[0],
        payment_method: "bank_transfer",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Pagamento registrato");
      queryClient.invalidateQueries({ queryKey: ["scadenzario"] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
    },
    onError: (e) => toast.error("Errore", { description: String(e) }),
  });

  const enriched = useMemo(() => {
    return invoices.map((inv: any) => {
      const paid = (inv.invoice_payments || []).reduce((s: number, p: any) => s + Number(p.amount), 0);
      const remaining = Math.max(0, Number(inv.total) - Number(inv.paid_amount || 0));
      const dueDate = new Date(inv.due_date);
      const daysLeft = differenceInDays(dueDate, new Date());
      const isOverdue = isPast(dueDate) && !isToday(dueDate) && inv.status !== "paid";
      const isDueToday = isToday(dueDate);
      const isDueSoon = daysLeft > 0 && daysLeft <= 7;
      const isPaidFull = inv.status === "paid" || remaining <= 0;
      return { ...inv, paid, remaining, daysLeft, isOverdue, isDueToday, isDueSoon, isPaidFull };
    });
  }, [invoices]);

  const filtered = useMemo(() => {
    if (filter === "open") return enriched.filter((i) => !i.isPaidFull);
    if (filter === "overdue") return enriched.filter((i) => i.isOverdue);
    if (filter === "upcoming") return enriched.filter((i) => !i.isPaidFull && !i.isOverdue && i.daysLeft <= 30);
    if (filter === "paid") return enriched.filter((i) => i.isPaidFull);
    return enriched;
  }, [enriched, filter]);

  const kpis = useMemo(() => {
    const open = enriched.filter((i) => !i.isPaidFull);
    const overdue = enriched.filter((i) => i.isOverdue);
    return {
      totalOpen: open.reduce((s, i) => s + i.remaining, 0),
      countOpen: open.length,
      totalOverdue: overdue.reduce((s, i) => s + i.remaining, 0),
      countOverdue: overdue.length,
      next7Days: enriched.filter((i) => !i.isPaidFull && i.daysLeft >= 0 && i.daysLeft <= 7).reduce((s, i) => s + i.remaining, 0),
    };
  }, [enriched]);

  const fmtEur = (n: number) => `€${n.toLocaleString("it-IT", { minimumFractionDigits: 2 })}`;

  const getRowStyle = (inv: any) => {
    if (inv.isPaidFull) return "opacity-60";
    if (inv.isOverdue) return "bg-destructive/5";
    if (inv.isDueToday) return "bg-amber-50";
    if (inv.isDueSoon) return "bg-orange-50/50";
    return "";
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <CalendarClock className="h-7 w-7 text-primary" />
        <h1 className="text-2xl font-bold">Scadenzario</h1>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Da incassare</p>
            <p className="text-xl font-bold">{fmtEur(kpis.totalOpen)}</p>
            <p className="text-xs text-muted-foreground">{kpis.countOpen} fatture</p>
          </CardContent>
        </Card>
        <Card className={kpis.countOverdue > 0 ? "border-destructive" : ""}>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Scadute</p>
            <p className="text-xl font-bold text-destructive">{fmtEur(kpis.totalOverdue)}</p>
            <p className="text-xs text-muted-foreground">{kpis.countOverdue} fatture</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">In scadenza (7gg)</p>
            <p className="text-xl font-bold text-amber-600">{fmtEur(kpis.next7Days)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Totale movimenti</p>
            <p className="text-xl font-bold">{enriched.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Tabs value={filter} onValueChange={setFilter}>
        <TabsList>
          <TabsTrigger value="open">Aperte ({enriched.filter(i => !i.isPaidFull).length})</TabsTrigger>
          <TabsTrigger value="overdue">Scadute ({enriched.filter(i => i.isOverdue).length})</TabsTrigger>
          <TabsTrigger value="upcoming">Prossime 30gg</TabsTrigger>
          <TabsTrigger value="paid">Pagate</TabsTrigger>
          <TabsTrigger value="all">Tutte</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">Nessuna scadenza trovata.</div>
      ) : (
        <div className="rounded-lg border overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left p-3 font-medium">Scadenza</th>
                <th className="text-left p-3 font-medium">N° Fattura</th>
                <th className="text-left p-3 font-medium">Cliente</th>
                <th className="text-right p-3 font-medium">Totale</th>
                <th className="text-right p-3 font-medium">Residuo</th>
                <th className="text-left p-3 font-medium">Stato</th>
                <th className="p-3 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((inv) => (
                <tr
                  key={inv.id}
                  className={`border-b hover:bg-muted/30 cursor-pointer ${getRowStyle(inv)}`}
                  onClick={() => navigate(`/azienda/fatturazione/${inv.id}`)}
                >
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      {inv.isOverdue && <AlertTriangle className="h-4 w-4 text-destructive" />}
                      {inv.isPaidFull && <CheckCircle2 className="h-4 w-4 text-green-600" />}
                      <span className={inv.isOverdue ? "font-semibold text-destructive" : ""}>
                        {format(new Date(inv.due_date), "dd/MM/yyyy", { locale: it })}
                      </span>
                    </div>
                    {!inv.isPaidFull && (
                      <span className="text-xs text-muted-foreground">
                        {inv.isOverdue
                          ? `${Math.abs(inv.daysLeft)} giorni fa`
                          : inv.isDueToday
                            ? "Oggi"
                            : `tra ${inv.daysLeft} giorni`}
                      </span>
                    )}
                  </td>
                  <td className="p-3 font-mono text-xs">{inv.invoice_number || "—"}</td>
                  <td className="p-3 font-medium">{inv.client_company_name}</td>
                  <td className="p-3 text-right">{fmtEur(Number(inv.total))}</td>
                  <td className="p-3 text-right font-medium">
                    {inv.isPaidFull ? (
                      <Badge variant="secondary" className="bg-green-100 text-green-800">Saldato</Badge>
                    ) : (
                      <span className={inv.isOverdue ? "text-destructive font-bold" : ""}>{fmtEur(inv.remaining)}</span>
                    )}
                  </td>
                  <td className="p-3">
                    {inv.remaining > 0 && inv.remaining < Number(inv.total) && (
                      <div className="space-y-1">
                        <Progress value={((Number(inv.total) - inv.remaining) / Number(inv.total)) * 100} className="h-1.5" />
                        <span className="text-xs text-muted-foreground">
                          {Math.round(((Number(inv.total) - inv.remaining) / Number(inv.total)) * 100)}%
                        </span>
                      </div>
                    )}
                  </td>
                  <td className="p-3" onClick={(e) => e.stopPropagation()}>
                    {!inv.isPaidFull && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs"
                        onClick={() => markPaidMutation.mutate({ id: inv.id, remaining: inv.remaining })}
                      >
                        <CreditCard className="h-3.5 w-3.5 mr-1" /> Incassa
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
