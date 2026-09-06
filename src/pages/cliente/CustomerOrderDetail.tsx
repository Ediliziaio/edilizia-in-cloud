import { useMemo } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { OrderProgressTracker } from "@/components/orders/OrderProgressTracker";
import { FotoCantiereCliente } from "@/components/cliente/FotoCantiereCliente";
import { VariantiDaApprovare } from "@/components/cliente/VariantiDaApprovare";
import { CustomerFinancialSummary } from "@/components/orders/CustomerFinancialSummary";
import { TimelineCantiere } from "@/components/orders/TimelineCantiere";
import { CustomerOrderAttachments } from "@/components/orders/OrderAttachments";
import { VariantiCard } from "@/components/orders/VariantiCard";
import { ArrowLeft, MessageSquare, FileText, AlertCircle, CalendarDays, Truck, Wrench, CheckCircle2, Clock, CreditCard } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { type Installment, buildInstallmentsFromLegacy } from "@/lib/orderUtils";

export default function CustomerOrderDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  // Fetch order details
  const { data: order, isLoading: orderLoading, isError: orderError, refetch: refetchOrder } = useQuery({
    queryKey: ["customer-order", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select(`
          id, order_code, description, total_amount, deposit_amount, deposit_2_amount,
          financing_amount, payment_type, balance_amount, vat_rate,
          expected_date, created_at, current_status_id, company_id,
          warehouse_arrival_date, work_start_date, work_end_date,
          deposit_paid, deposit_paid_date, deposit_expected_date,
          deposit_2_paid, deposit_2_paid_date, deposit_2_expected_date,
          balance_paid, balance_paid_date, balance_expected_date,
          financing_paid, financing_paid_date, financing_expected_date,
          has_building_bonus,
          status:order_statuses(name, color, icon)
        `)
        .eq("id", id!)
        .eq("customer_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!id && !!user?.id,
    staleTime: 2 * 60 * 1000,
  });

  // Fetch installments from DB
  const { data: dbInstallments = [] } = useQuery({
    queryKey: ["customer-order-installments", user?.id, order?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_installments")
        .select("*, order:orders!inner(id, customer_id)")
        .eq("order_id", order!.id)
        .eq("order.customer_id", user!.id)
        .order("position");
      if (error) throw error;
      return (data || []) as unknown as (Installment & { id: string })[];
    },
    enabled: !!order?.id && !!user?.id,
  });

  // Build installments for display
  const displayInstallments: Installment[] = useMemo(() => {
    if (dbInstallments.length > 0) {
      return dbInstallments.map(i => ({
        id: i.id, position: i.position, label: i.label,
        type: i.type as Installment['type'], amount: i.amount,
        is_paid: i.is_paid, paid_date: i.paid_date, expected_date: i.expected_date,
      }));
    }
    if (!order) return [];
    return buildInstallmentsFromLegacy(order);
  }, [dbInstallments, order]);

  // Fetch all order statuses for this company
  const { data: statuses = [] } = useQuery({
    queryKey: ["order-statuses", order?.company_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_statuses")
        .select("id, name, icon, color, position")
        .eq("company_id", order!.company_id)
        .order("position");
      if (error) throw error;
      return data;
    },
    enabled: !!order?.company_id,
    staleTime: 10 * 60 * 1000,
  });

  // Fetch status history
  const { data: statusHistory = [] } = useQuery({
    queryKey: ["customer-order-status-history", user?.id, order?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_status_history")
        .select(`id, status_id, changed_at, order:orders!inner(id, customer_id), status:order_statuses(name, color, icon)`)
        .eq("order_id", order!.id)
        .eq("order.customer_id", user!.id)
        .order("changed_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!order?.id && !!user?.id,
    staleTime: 2 * 60 * 1000,
  });

  if (orderLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (orderError) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-4">
        <AlertCircle className="h-10 w-10 text-destructive" />
        <p className="text-muted-foreground">Impossibile caricare l'ordine.</p>
        <Button variant="outline" onClick={() => refetchOrder()}>Riprova</Button>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Ordine non trovato</p>
        <Button variant="link" onClick={() => navigate("/cliente")}>Torna ai miei ordini</Button>
      </div>
    );
  }

  const historyForTracker = statusHistory.map((h) => ({
    status_id: h.status_id,
    changed_at: h.changed_at,
  }));
  const nextUnpaidInstallment = displayInstallments
    .filter((installment) => !installment.is_paid)
    .sort((a, b) => {
      if (!a.expected_date && !b.expected_date) return a.position - b.position;
      if (!a.expected_date) return 1;
      if (!b.expected_date) return -1;
      return new Date(a.expected_date).getTime() - new Date(b.expected_date).getTime();
    })[0];

  // «Prossimo pagamento» con una data già passata va detto chiaramente.
  const pagamentoScaduto = (() => {
    const d = nextUnpaidInstallment?.expected_date;
    if (!d) return false;
    const oggi = new Date(); oggi.setHours(0, 0, 0, 0);
    return new Date(d) < oggi;
  })();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate("/cliente")}
          className="w-10 h-10 rounded-xl flex items-center justify-center hover:bg-muted transition-colors shrink-0"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl md:text-2xl font-bold truncate">{order.order_code ? `Ordine ${order.order_code}` : `Ordine #${order.id.slice(0, 8).toUpperCase()}`}</h1>
          <p className="text-xs md:text-sm text-muted-foreground">Creato il {formatDate(order.created_at)}</p>
        </div>
      </div>

      {/* CTA Assistenza */}
      <Link
        to={`/cliente/assistenza/nuovo?ordine=${order.id}`}
        className="flex items-center justify-center gap-2 w-full bg-primary text-primary-foreground rounded-2xl py-3.5 text-sm font-semibold hover:bg-primary/90 transition-colors"
      >
        <MessageSquare className="h-4 w-4" />
        Richiedi Assistenza
      </Link>

      <div className="grid gap-3">
        <Link
          to="/cliente/rate"
          className="flex items-start gap-3 rounded-2xl border border-border/60 bg-background p-4 hover:shadow-md transition-all"
        >
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <CreditCard className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <p className={pagamentoScaduto ? "text-sm font-semibold text-destructive" : "text-sm font-semibold"}>
              {nextUnpaidInstallment ? (pagamentoScaduto ? "Pagamento scaduto" : "Prossimo pagamento") : "Pagamenti completati"}
            </p>
            <p className="text-sm text-muted-foreground mt-0.5">
              {nextUnpaidInstallment
                ? `${nextUnpaidInstallment.label}: ${formatCurrency(nextUnpaidInstallment.amount)}${nextUnpaidInstallment.expected_date ? ` entro ${formatDate(nextUnpaidInstallment.expected_date)}` : ""}`
                : "Non risultano rate aperte per questo ordine."}
            </p>
          </div>
        </Link>
      </div>

      {/* Progress Tracker */}
      <Card>
        <CardHeader><CardTitle className="text-lg">Stato dell'ordine</CardTitle></CardHeader>
        <CardContent>
          {statuses.length > 0 ? (
            <OrderProgressTracker statuses={statuses} currentStatusId={order.current_status_id}
              statusHistory={historyForTracker} interactive={false} size="md" />
          ) : (
            <p className="text-muted-foreground text-sm">Nessuno stato configurato</p>
          )}
        </CardContent>
      </Card>

      {/* Varianti in attesa: stanno subito sotto lo stato perché sono la cosa
          che blocca l'avanzamento del cantiere. */}
      <VariantiDaApprovare orderId={order.id} />

      {/* Foto per fase, dai rapportini che l'impresa ha marcato visibili. */}
      <FotoCantiereCliente orderId={order.id} />

      {/* Key Dates */}
      {(order.warehouse_arrival_date || order.work_start_date || order.work_end_date || order.expected_date) && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <CalendarDays className="h-5 w-5" />
              Date Chiave
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {order.warehouse_arrival_date && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 border border-blue-200">
                  <Truck className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs text-blue-600 font-medium">Arrivo materiali</p>
                    <p className="text-sm font-semibold">{formatDate(order.warehouse_arrival_date)}</p>
                  </div>
                </div>
              )}
              {order.work_start_date && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200">
                  <Wrench className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs text-amber-600 font-medium">Inizio lavori</p>
                    <p className="text-sm font-semibold">{formatDate(order.work_start_date)}</p>
                  </div>
                </div>
              )}
              {order.work_end_date && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-emerald-50 border border-emerald-200">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs text-emerald-600 font-medium">Fine lavori</p>
                    <p className="text-sm font-semibold">{formatDate(order.work_end_date)}</p>
                  </div>
                </div>
              )}
              {order.expected_date && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-purple-50 border border-purple-200">
                  <Clock className="h-4 w-4 text-purple-600 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs text-purple-600 font-medium">Consegna prevista</p>
                    <p className="text-sm font-semibold">{formatDate(order.expected_date)}</p>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Order Description */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Descrizione lavoro
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-foreground whitespace-pre-wrap">{order.description}</p>
        </CardContent>
      </Card>

      {/* Timeline cantiere — aggrega stati, lavori, SAL, varianti */}
      <div className="space-y-2">
        <div>
          <h2 className="text-lg font-semibold">Aggiornamenti Cantiere</h2>
          <p className="text-sm text-muted-foreground">
            Tutti gli aggiornamenti in tempo reale sul tuo ordine.
          </p>
        </div>
        <TimelineCantiere
          orderId={order.id}
          companyId={order.company_id}
          adminView={false}
        />
      </div>

      {/* Varianti d'ordine */}
      <VariantiCard orderId={order.id} companyId={order.company_id} readOnly />

      {/* Order Documents */}
      <CustomerOrderAttachments orderId={order.id} />

      {/* Financial Summary */}
      <CustomerFinancialSummary
        totalAmount={order.total_amount}
        vatRate={order.vat_rate || 22}
        paymentType={order.payment_type || 'standard'}
        installments={displayInstallments}
        hasBuildingBonus={order.has_building_bonus}
      />

      {/* Storico stati ora incluso nella TimelineCantiere sopra */}
    </div>
  );
}
