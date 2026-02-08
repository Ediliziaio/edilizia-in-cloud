import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { OrderProgressTracker } from "@/components/orders/OrderProgressTracker";
import { CustomerFinancialSummary } from "@/components/orders/CustomerFinancialSummary";
import { CustomerDatesCard } from "@/components/orders/CustomerDatesCard";
import { CustomerOrderAttachments } from "@/components/orders/OrderAttachments";
import { ArrowLeft, Clock, CheckCircle2, MessageSquare, FileText } from "lucide-react";
import { formatDate, formatDateTime } from "@/lib/formatters";

export default function CustomerOrderDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  // Fetch order details
  const { data: order, isLoading: orderLoading } = useQuery({
    queryKey: ["customer-order", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select(`
          id, description, total_amount, deposit_amount, deposit_2_amount,
          financing_amount, payment_type, balance_amount, vat_rate,
          expected_date, created_at, current_status_id, company_id,
          warehouse_arrival_date, work_start_date, work_end_date,
          status:order_statuses(name, color, icon)
        `)
        .eq("id", id!)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!id && !!user,
    staleTime: 2 * 60 * 1000, // 2 minuti
  });

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
    staleTime: 10 * 60 * 1000, // 10 minuti - statuses cambiano raramente
  });

  // Fetch status history
  const { data: statusHistory = [] } = useQuery({
    queryKey: ["order-status-history", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_status_history")
        .select(`
          id, status_id, changed_at,
          status:order_statuses(name, color, icon)
        `)
        .eq("order_id", id!)
        .order("changed_at", { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!id,
    staleTime: 2 * 60 * 1000, // 2 minuti
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

  if (!order) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Ordine non trovato</p>
        <Button variant="link" onClick={() => navigate("/cliente")}>
          Torna ai miei ordini
        </Button>
      </div>
    );
  }

  const historyForTracker = statusHistory.map((h) => ({
    status_id: h.status_id,
    changed_at: h.changed_at,
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate("/cliente")}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">
            Ordine #{order.id.slice(0, 8).toUpperCase()}
          </h1>
          <p className="text-sm text-muted-foreground">
            Creato il {formatDate(order.created_at)}
          </p>
        </div>
        <Button asChild variant="outline">
          <Link to={`/cliente/assistenza/nuovo?ordine=${order.id}`}>
            <MessageSquare className="mr-2 h-4 w-4" />
            Richiedi Assistenza
          </Link>
        </Button>
      </div>

      {/* Progress Tracker */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Stato dell'ordine</CardTitle>
        </CardHeader>
        <CardContent>
          {statuses.length > 0 ? (
            <OrderProgressTracker
              statuses={statuses}
              currentStatusId={order.current_status_id}
              statusHistory={historyForTracker}
              interactive={false}
              size="md"
            />
          ) : (
            <p className="text-muted-foreground text-sm">
              Nessuno stato configurato
            </p>
          )}
        </CardContent>
      </Card>

      {/* Order Description */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Descrizione lavoro
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-foreground whitespace-pre-wrap">
            {order.description}
          </p>
        </CardContent>
      </Card>

      {/* Customer Dates */}
      <CustomerDatesCard
        warehouseArrivalDate={order.warehouse_arrival_date}
        workStartDate={order.work_start_date}
        workEndDate={order.work_end_date}
      />

      {/* Order Documents (visible to customer) */}
      <CustomerOrderAttachments orderId={order.id} />

      {/* Financial Summary with VAT */}
      <CustomerFinancialSummary
        totalAmount={order.total_amount}
        depositAmount={order.deposit_amount}
        deposit2Amount={order.deposit_2_amount || 0}
        financingAmount={order.financing_amount || 0}
        paymentType={order.payment_type || 'standard'}
        balanceAmount={order.balance_amount}
        vatRate={order.vat_rate || 22}
      />

      {/* Status History Timeline */}
      {statusHistory.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Storico aggiornamenti
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {statusHistory.map((item, index) => {
                const status = item.status as { name: string; color: string; icon: string } | null;
                return (
                  <div key={item.id} className="flex items-start gap-3">
                    <div className="flex flex-col items-center">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: status?.color || "hsl(var(--muted))" }}
                      />
                      {index < statusHistory.length - 1 && (
                        <div className="w-0.5 h-8 bg-muted mt-1" />
                      )}
                    </div>
                    <div className="flex-1 -mt-0.5">
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="secondary"
                          style={{ 
                            backgroundColor: `${status?.color}20`,
                            color: status?.color 
                          }}
                        >
                          {status?.name || "Stato sconosciuto"}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatDateTime(item.changed_at)}
                      </p>
                    </div>
                    {index === 0 && (
                      <CheckCircle2 className="h-4 w-4 text-primary" />
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
