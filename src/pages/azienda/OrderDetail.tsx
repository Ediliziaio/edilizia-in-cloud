import { useState, useMemo } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, User, Calendar, FileText, Clock, Trash2, Pencil, AlertTriangle, AlertCircle, Package } from "lucide-react";
import { formatDate, formatDateTime } from "@/lib/formatters";
import { differenceInDays, parseISO, isBefore, startOfDay } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { OrderProgressTracker } from "@/components/orders/OrderProgressTracker";
import { OrderItemsList, OrderItem } from "@/components/orders/OrderItemsList";
import { FinancialSummaryReadOnly, PaymentType } from "@/components/orders/FinancialSummary";
import { OrderEconomics } from "@/components/orders/OrderEconomics";
import { OrderAttachments } from "@/components/orders/OrderAttachments";
import { OrderLaborCosts } from "@/components/orders/OrderLaborCosts";
import { OrderCommissions } from "@/components/orders/OrderCommissions";
import { LinkedTasks } from "@/components/tasks/LinkedTasks";
import { SupplierPaymentsCard } from "@/components/orders/SupplierPaymentsCard";
import type { OrderStatus, StatusHistoryItem } from "@/components/orders/OrderProgressTracker";

// Order Alert Interface
interface OrderAlert {
  type: 'urgent' | 'warning' | 'info';
  title: string;
  description: string;
  icon: React.ReactNode;
}

// Function to calculate order alerts based on items and dates
function getOrderAlerts(
  order: { expected_date: string | null; warehouse_arrival_date: string | null },
  items: { name: string; status: string }[]
): OrderAlert[] {
  const alerts: OrderAlert[] = [];
  const today = startOfDay(new Date());

  // Filter items by status
  const itemsDaOrdinare = items.filter(i => i.status === 'da_ordinare');
  const itemsOrdinati = items.filter(i => i.status === 'ordinato');
  const itemsNonPronti = items.filter(i => 
    i.status === 'da_ordinare' || i.status === 'ordinato'
  );

  // Alert 1: Installation date approaching with items not ready
  if (order.expected_date && itemsNonPronti.length > 0) {
    const expectedDate = startOfDay(parseISO(order.expected_date));
    const daysUntilPosa = differenceInDays(expectedDate, today);

    if (daysUntilPosa <= 7) {
      const itemNames = itemsNonPronti.slice(0, 3).map(i => i.name).join(', ');
      const moreItems = itemsNonPronti.length > 3 ? ` e altri ${itemsNonPronti.length - 3}` : '';
      
      alerts.push({
        type: 'urgent',
        title: daysUntilPosa <= 0
          ? 'Posa scaduta!'
          : daysUntilPosa === 1
            ? 'Posa prevista domani!'
            : `Posa prevista tra ${daysUntilPosa} giorni`,
        description: `${itemsNonPronti.length} articol${itemsNonPronti.length > 1 ? 'i' : 'o'} non ancora pront${itemsNonPronti.length > 1 ? 'i' : 'o'}: ${itemNames}${moreItems}`,
        icon: <AlertTriangle className="h-4 w-4" />,
      });
    }
  }

  // Alert 2: Goods arrival delayed
  if (order.warehouse_arrival_date && itemsOrdinati.length > 0) {
    const arrivalDate = startOfDay(parseISO(order.warehouse_arrival_date));
    if (isBefore(arrivalDate, today)) {
      alerts.push({
        type: 'warning',
        title: 'Merce in ritardo',
        description: `${itemsOrdinati.length} articol${itemsOrdinati.length > 1 ? 'i' : 'o'} dovrebbe${itemsOrdinati.length > 1 ? 'ro' : ''} essere già arrivat${itemsOrdinati.length > 1 ? 'i' : 'o'} in magazzino`,
        icon: <AlertCircle className="h-4 w-4" />,
      });
    }
  }

  // Alert 3: Items to order (only if no more urgent alerts)
  if (itemsDaOrdinare.length > 0 && alerts.length === 0) {
    const itemNames = itemsDaOrdinare.slice(0, 3).map(i => i.name).join(', ');
    const moreItems = itemsDaOrdinare.length > 3 ? ` e altri ${itemsDaOrdinare.length - 3}` : '';
    
    alerts.push({
      type: 'info',
      title: `${itemsDaOrdinare.length} articol${itemsDaOrdinare.length > 1 ? 'i' : 'o'} da ordinare`,
      description: `${itemNames}${moreItems}`,
      icon: <Package className="h-4 w-4" />,
    });
  }

  return alerts;
}

interface OrderDetail {
  id: string;
  order_code: string | null;
  description: string;
  total_amount: number;
  deposit_amount: number;
  deposit_2_amount: number;
  financing_amount: number;
  payment_type: string;
  balance_amount: number;
  expected_date: string | null;
  created_at: string;
  updated_at: string;
  current_status_id: string | null;
  internal_notes: string | null;
  vat_rate: number;
  warehouse_arrival_date: string | null;
  work_start_date: string | null;
  work_end_date: string | null;
  deposit_paid: boolean;
  deposit_paid_date: string | null;
  deposit_2_paid: boolean;
  deposit_2_paid_date: string | null;
  balance_paid: boolean;
  balance_paid_date: string | null;
  balance_expected_date: string | null;
  customer: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    phone: string | null;
    address: string | null;
  } | null;
}

interface StatusHistoryEntry {
  id: string;
  status_id: string;
  changed_at: string;
  changed_by: string;
  status: {
    name: string;
    color: string;
  };
}

interface OrderItemData {
  id: string;
  name: string;
  description: string | null;
  quantity: number;
  status: string;
  position: number;
  supplier_id: string | null;
  purchase_price: number | null;
  vat_rate: number | null;
  stock_item_id: string | null;
  is_paid: boolean | null;
  paid_date: string | null;
  payment_method: string | null;
  deposit_amount: number | null;
  deposit_paid: boolean | null;
  deposit_paid_date: string | null;
  balance_amount: number | null;
  balance_paid: boolean | null;
  balance_paid_date: string | null;
  balance_expected_date: string | null;
}

interface OrderItemAttachmentData {
  id: string;
  order_item_id: string;
  file_name: string;
  file_url: string;
  file_type: string;
  file_size: number;
}

export default function OrderDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, effectiveCompany } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [editedNotes, setEditedNotes] = useState("");
  const [statusChangeDialog, setStatusChangeDialog] = useState<{
    open: boolean;
    targetStatusId: string | null;
    targetStatusName: string;
  }>({ open: false, targetStatusId: null, targetStatusName: "" });

  // Fetch order details
  const { data: order, isLoading: orderLoading } = useQuery({
    queryKey: ["order", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select(`
          *,
          customer:profiles!orders_customer_id_fkey(id, first_name, last_name, email, phone, address)
        `)
        .eq("id", id!)
        .single();

      if (error) throw error;
      return data as OrderDetail;
    },
    enabled: !!id && !!user,
  });

  // Fetch order items
  const { data: orderItems = [], refetch: refetchItems } = useQuery({
    queryKey: ["order-items", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_items")
        .select("*")
        .eq("order_id", id!)
        .order("position");

      if (error) throw error;
      return data as OrderItemData[];
    },
    enabled: !!id && !!user,
  });

  // Fetch attachments for all order items
  const { data: attachments = [], refetch: refetchAttachments } = useQuery({
    queryKey: ["order-item-attachments", id],
    queryFn: async () => {
      const itemIds = orderItems.map(item => item.id);
      if (itemIds.length === 0) return [];

      const { data, error } = await supabase
        .from("order_item_attachments")
        .select("*")
        .in("order_item_id", itemIds)
        .order("created_at");

      if (error) throw error;
      return data as OrderItemAttachmentData[];
    },
    enabled: orderItems.length > 0,
  });

  // Fetch order statuses (filtered by company)
  const { data: statuses = [] } = useQuery({
    queryKey: ["order-statuses", effectiveCompany?.id],
    queryFn: async () => {
      if (!effectiveCompany?.id) return [];
      
      const { data, error } = await supabase
        .from("order_statuses")
        .select("id, name, icon, color, position")
        .eq("company_id", effectiveCompany.id)
        .order("position");

      if (error) throw error;
      return data as OrderStatus[];
    },
    enabled: !!effectiveCompany?.id,
  });

  // Fetch status history
  const { data: statusHistory = [] } = useQuery({
    queryKey: ["order-status-history", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_status_history")
        .select(`
          id,
          status_id,
          changed_at,
          changed_by,
          status:order_statuses(name, color)
        `)
        .eq("order_id", id!)
        .order("changed_at", { ascending: false });

      if (error) throw error;
      return data as StatusHistoryEntry[];
    },
    enabled: !!id && !!user,
  });

  // Update status mutation
  const updateStatusMutation = useMutation({
    mutationFn: async (newStatusId: string) => {
      // Update order status
      const { error: updateError } = await supabase
        .from("orders")
        .update({ current_status_id: newStatusId })
        .eq("id", id!);

      if (updateError) throw updateError;

      // Add history entry
      const { error: historyError } = await supabase
        .from("order_status_history")
        .insert({
          order_id: id!,
          status_id: newStatusId,
          changed_by: user!.id,
        });

      if (historyError) throw historyError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["order", id] });
      queryClient.invalidateQueries({ queryKey: ["order-status-history", id] });
      toast({
        title: "Stato aggiornato",
        description: "Lo stato dell'ordine è stato aggiornato.",
      });
      setStatusChangeDialog({ open: false, targetStatusId: null, targetStatusName: "" });
    },
    onError: (error) => {
      toast({
        title: "Errore",
        description: "Si è verificato un errore durante l'aggiornamento dello stato.",
        variant: "destructive",
      });
      console.error("Update status error:", error);
    },
  });

  // Update order items mutation
  const updateOrderItemsMutation = useMutation({
    mutationFn: async (items: OrderItem[]) => {
      // Delete existing items and recreate
      await supabase
        .from("order_items")
        .delete()
        .eq("order_id", id!);

      if (items.length > 0) {
        const itemsToInsert = items.map((item, index) => ({
          order_id: id!,
          name: item.name,
          description: item.description || null,
          quantity: item.quantity,
          status: item.status,
          position: index,
          supplier_id: item.supplier_id || null,
          purchase_price: item.purchase_price || null,
          vat_rate: item.vat_rate ?? null,
          stock_item_id: item.stock_item_id || null,
          unit_price: item.unit_price || 0,
          discount_percent: item.discount_percent || 0,
          standard_cost: item.standard_cost || 0,
        }));

        const { error } = await supabase
          .from("order_items")
          .insert(itemsToInsert);

        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["order-items", id] });
      toast({
        title: "Articoli aggiornati",
        description: "Gli articoli dell'ordine sono stati aggiornati.",
      });
    },
    onError: () => {
      toast({
        title: "Errore",
        description: "Si è verificato un errore durante l'aggiornamento degli articoli.",
        variant: "destructive",
      });
    },
  });

  // Update notes mutation
  const updateNotesMutation = useMutation({
    mutationFn: async (notes: string) => {
      const { error } = await supabase
        .from("orders")
        .update({ internal_notes: notes || null })
        .eq("id", id!);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["order", id] });
      toast({
        title: "Note salvate",
        description: "Le note interne sono state aggiornate.",
      });
      setIsEditingNotes(false);
    },
    onError: () => {
      toast({
        title: "Errore",
        description: "Si è verificato un errore durante il salvataggio delle note.",
        variant: "destructive",
      });
    },
  });

  // Delete order mutation
  const deleteOrderMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("orders")
        .delete()
        .eq("id", id!);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      toast({
        title: "Ordine eliminato",
        description: "L'ordine è stato eliminato con successo.",
      });
      navigate("/azienda/ordini");
    },
    onError: () => {
      toast({
        title: "Errore",
        description: "Si è verificato un errore durante l'eliminazione dell'ordine.",
        variant: "destructive",
      });
    },
  });

  const handleStatusChange = (statusId: string) => {
    if (statusId === order?.current_status_id) return;
    
    const targetStatus = statuses.find((s) => s.id === statusId);
    setStatusChangeDialog({
      open: true,
      targetStatusId: statusId,
      targetStatusName: targetStatus?.name || "",
    });
  };

  const confirmStatusChange = () => {
    if (statusChangeDialog.targetStatusId) {
      updateStatusMutation.mutate(statusChangeDialog.targetStatusId);
    }
  };

  const handleEditNotes = () => {
    setEditedNotes(order?.internal_notes || "");
    setIsEditingNotes(true);
  };

  const handleSaveNotes = () => {
    updateNotesMutation.mutate(editedNotes);
  };

  const handleItemsChange = (items: OrderItem[]) => {
    updateOrderItemsMutation.mutate(items);
  };

  // Convert status history for progress tracker
  const progressHistory: StatusHistoryItem[] = statusHistory.map((h) => ({
    status_id: h.status_id,
    changed_at: h.changed_at,
  }));

  // Convert order items for the list with attachments
  const displayItems: OrderItem[] = orderItems.map(item => ({
    id: item.id,
    name: item.name,
    description: item.description || undefined,
    quantity: item.quantity,
    status: item.status as OrderItem['status'],
    position: item.position,
    supplier_id: item.supplier_id || undefined,
    purchase_price: item.purchase_price || undefined,
    vat_rate: item.vat_rate ?? undefined,
    stock_item_id: item.stock_item_id || undefined,
    unit_price: (item as any).unit_price || undefined,
    discount_percent: (item as any).discount_percent || undefined,
    standard_cost: (item as any).standard_cost || undefined,
    attachments: attachments
      .filter(att => att.order_item_id === item.id)
      .map(att => ({
        id: att.id,
        file_name: att.file_name,
        file_url: att.file_url,
        file_type: att.file_type,
        file_size: att.file_size,
      })),
  }));

  // Calculate items for economics
  const economicsItems = displayItems.map(item => ({
    name: item.name,
    quantity: item.quantity,
    purchase_price: item.purchase_price,
    vat_rate: item.vat_rate,
    unit_price: item.unit_price,
    discount_percent: item.discount_percent,
    standard_cost: item.standard_cost,
  }));

  // Calculate order alerts
  const orderAlerts = useMemo(() => {
    if (!order) return [];
    return getOrderAlerts(order, displayItems);
  }, [order, displayItems]);

  const handleAttachmentsRefresh = () => {
    refetchAttachments();
  };

  if (orderLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10 rounded" />
          <div className="space-y-2">
            <Skeleton className="h-7 w-[250px]" />
            <Skeleton className="h-4 w-[150px]" />
          </div>
        </div>
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <Skeleton className="h-[200px] w-full rounded-lg" />
            <Skeleton className="h-[150px] w-full rounded-lg" />
          </div>
          <div className="space-y-6">
            <Skeleton className="h-[120px] w-full rounded-lg" />
            <Skeleton className="h-[200px] w-full rounded-lg" />
          </div>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Ordine non trovato</p>
        <Button className="mt-4" onClick={() => navigate("/azienda/ordini")}>
          Torna agli ordini
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">Dettaglio Ordine</h1>
              {order.order_code && (
                <span className="text-lg text-muted-foreground font-medium">
                  ({order.order_code})
                </span>
              )}
            </div>
            <p className="text-muted-foreground">
              Creato il {formatDate(order.created_at)}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link to={`/azienda/ordini/${id}/modifica`}>
              <Pencil className="h-4 w-4 mr-2" />
              Modifica
            </Link>
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm">
                <Trash2 className="h-4 w-4 mr-2" />
                Elimina
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Eliminare l'ordine?</AlertDialogTitle>
                <AlertDialogDescription>
                  Questa azione è irreversibile. L'ordine e tutto lo storico stati
                  verranno eliminati permanentemente.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Annulla</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => deleteOrderMutation.mutate()}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Elimina
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* Order Alerts */}
      {orderAlerts.length > 0 && (
        <div className="space-y-3">
          {orderAlerts.map((alert, index) => (
            <Alert
              key={index}
              variant={alert.type === 'urgent' ? 'destructive' : 'default'}
              className={cn(
                alert.type === 'warning' && 'border-amber-500 bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-100 [&>svg]:text-amber-600',
                alert.type === 'info' && 'border-blue-500 bg-blue-50 text-blue-900 dark:bg-blue-950 dark:text-blue-100 [&>svg]:text-blue-600'
              )}
            >
              {alert.icon}
              <AlertTitle>{alert.title}</AlertTitle>
              <AlertDescription>{alert.description}</AlertDescription>
            </Alert>
          ))}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left Column - Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Order Description */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Descrizione Lavoro
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap">{order.description}</p>
            </CardContent>
          </Card>

          {/* Order Items */}
          {displayItems.length > 0 && (
            <OrderItemsList
              items={displayItems}
              onItemsChange={handleItemsChange}
              editable={false}
              showStatusControls={true}
              onAttachmentsRefresh={handleAttachmentsRefresh}
            />
          )}

          {/* Order Documents */}
          <OrderAttachments orderId={id!} editable={true} />
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Stato Ordine
              </CardTitle>
            </CardHeader>
            <CardContent>
              <OrderProgressTracker
                statuses={statuses}
                currentStatusId={order.current_status_id}
                statusHistory={progressHistory}
                onStatusChange={handleStatusChange}
                interactive={true}
                size="md"
              />
            </CardContent>
          </Card>

          {/* Status History */}
          <Card>
            <CardHeader>
              <CardTitle>Storico Stati</CardTitle>
            </CardHeader>
            <CardContent>
              {statusHistory.length === 0 ? (
                <p className="text-muted-foreground">Nessuno storico disponibile</p>
              ) : (
                <div className="space-y-4">
                  {statusHistory.map((entry) => (
                    <div
                      key={entry.id}
                      className="flex items-center justify-between border-b pb-3 last:border-0 last:pb-0"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: entry.status.color }}
                        />
                        <span className="font-medium">{entry.status.name}</span>
                      </div>
                      <span className="text-sm text-muted-foreground">
                        {formatDateTime(entry.changed_at)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Sidebar */}
        <div className="space-y-6">
          {/* Customer Info */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Cliente
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {order.customer ? (
                <>
                  <p className="font-medium">
                    {order.customer.first_name} {order.customer.last_name}
                  </p>
                  <p className="text-sm text-muted-foreground">{order.customer.email}</p>
                  {order.customer.phone && (
                    <p className="text-sm text-muted-foreground">{order.customer.phone}</p>
                  )}
                  {order.customer.address && (
                    <p className="text-sm text-muted-foreground">{order.customer.address}</p>
                  )}
                </>
              ) : (
                <p className="text-muted-foreground">Cliente non disponibile</p>
              )}
            </CardContent>
          </Card>

          {/* Financial Summary */}
          <FinancialSummaryReadOnly
            totalAmount={order.total_amount}
            depositAmount={order.deposit_amount}
            deposit2Amount={order.deposit_2_amount || 0}
            financingAmount={order.financing_amount || 0}
            paymentType={(order.payment_type as PaymentType) || 'standard'}
            balanceAmount={order.balance_amount}
            vatRate={order.vat_rate || 22}
            depositPaid={order.deposit_paid}
            depositPaidDate={order.deposit_paid_date}
            deposit2Paid={order.deposit_2_paid}
            deposit2PaidDate={order.deposit_2_paid_date}
            balancePaid={order.balance_paid}
            balancePaidDate={order.balance_paid_date}
            balanceExpectedDate={order.balance_expected_date}
          />

          {/* Order Economics */}
          <OrderEconomics
            orderId={id!}
            totalAmount={order.total_amount}
            vatRate={order.vat_rate || 22}
            items={economicsItems}
          />

          {/* Supplier Payments */}
          <SupplierPaymentsCard items={orderItems} companyId={effectiveCompany?.id || ""} />

          {/* Labor Costs */}
          <OrderLaborCosts orderId={id!} editable={true} />

          {/* Commissions */}
          <OrderCommissions
            orderId={id!}
            totalAmount={order.total_amount}
            collectedAmount={
              (order.deposit_paid ? order.deposit_amount : 0) +
              (order.deposit_2_paid ? (order.deposit_2_amount || 0) : 0) +
              (order.balance_paid ? order.balance_amount : 0)
            }
            vatRate={order.vat_rate || 22}
          />

          {/* Expected Date */}
          {order.expected_date && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  Consegna Prevista
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="font-medium">{formatDate(order.expected_date)}</p>
              </CardContent>
            </Card>
          )}

          {/* Internal Notes */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Note Interne</CardTitle>
              {!isEditingNotes && (
                <Button variant="ghost" size="sm" onClick={handleEditNotes}>
                  Modifica
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {isEditingNotes ? (
                <div className="space-y-3">
                  <Textarea
                    value={editedNotes}
                    onChange={(e) => setEditedNotes(e.target.value)}
                    rows={4}
                    placeholder="Aggiungi note interne..."
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={handleSaveNotes}
                      disabled={updateNotesMutation.isPending}
                    >
                      Salva
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setIsEditingNotes(false)}
                    >
                      Annulla
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {order.internal_notes || "Nessuna nota interna"}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Linked Tasks */}
          <LinkedTasks orderId={id} category="ordini" />
        </div>
      </div>

      {/* Status Change Confirmation Dialog */}
      <Dialog
        open={statusChangeDialog.open}
        onOpenChange={(open) =>
          setStatusChangeDialog({ ...statusChangeDialog, open })
        }
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Conferma cambio stato</DialogTitle>
            <DialogDescription>
              Vuoi cambiare lo stato dell'ordine a "{statusChangeDialog.targetStatusName}"?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() =>
                setStatusChangeDialog({
                  open: false,
                  targetStatusId: null,
                  targetStatusName: "",
                })
              }
            >
              Annulla
            </Button>
            <Button
              onClick={confirmStatusChange}
              disabled={updateStatusMutation.isPending}
            >
              {updateStatusMutation.isPending ? "Aggiornamento..." : "Conferma"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
