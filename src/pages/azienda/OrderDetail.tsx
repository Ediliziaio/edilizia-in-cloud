import { useState, useMemo } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, User, Calendar, FileText, Clock, Trash2, Pencil, AlertTriangle, AlertCircle, Package, Copy } from "lucide-react";
import { formatDate, formatDateTime } from "@/lib/formatters";
import { differenceInDays, parseISO, isBefore, startOfDay } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { OrderProgressTracker } from "@/components/orders/OrderProgressTracker";
import { OrderItemsList, OrderItem } from "@/components/orders/OrderItemsList";
import { FinancialSummaryReadOnly, PaymentType } from "@/components/orders/FinancialSummary";
import { OrderEconomics } from "@/components/orders/OrderEconomics";
import { OrderAttachments } from "@/components/orders/OrderAttachments";
import { OrderLaborCosts } from "@/components/orders/OrderLaborCosts";
import { OrderCommissions } from "@/components/orders/OrderCommissions";
import { OrderErrors } from "@/components/orders/OrderErrors";
import { LinkedTasks } from "@/components/tasks/LinkedTasks";
import { LinkedAppointments } from "@/components/appointments/LinkedAppointments";
import { SupplierPaymentsCard } from "@/components/orders/SupplierPaymentsCard";
import { CreatePurchaseOrderButton } from "@/components/orders/CreatePurchaseOrderButton";
import { InlineEditableDatesCard } from "@/components/orders/InlineEditableDatesCard";
import type { StatusHistoryItem } from "@/components/orders/OrderProgressTracker";
import { type OrderStatus, type OrderItemData, type Installment, deleteOrderCascading, buildInstallmentsFromLegacy } from "@/lib/orderUtils";

// ── Order Alert logic ────────────────────────────────────────────

interface OrderAlert {
  type: 'urgent' | 'warning' | 'info';
  title: string;
  description: string;
  icon: React.ReactNode;
}

function getOrderAlerts(
  order: { expected_date: string | null; warehouse_arrival_date: string | null },
  items: { name: string; status: string }[]
): OrderAlert[] {
  const alerts: OrderAlert[] = [];
  const today = startOfDay(new Date());

  const itemsDaOrdinare = items.filter(i => i.status === 'da_ordinare');
  const itemsOrdinati = items.filter(i => i.status === 'ordinato');
  const itemsNonPronti = items.filter(i => i.status === 'da_ordinare' || i.status === 'ordinato');

  if (order.expected_date && itemsNonPronti.length > 0) {
    const expectedDate = startOfDay(parseISO(order.expected_date));
    const daysUntilPosa = differenceInDays(expectedDate, today);
    if (daysUntilPosa <= 7) {
      const itemNames = itemsNonPronti.slice(0, 3).map(i => i.name).join(', ');
      const moreItems = itemsNonPronti.length > 3 ? ` e altri ${itemsNonPronti.length - 3}` : '';
      alerts.push({
        type: 'urgent',
        title: daysUntilPosa <= 0 ? 'Posa scaduta!' : daysUntilPosa === 1 ? 'Posa prevista domani!' : `Posa prevista tra ${daysUntilPosa} giorni`,
        description: `${itemsNonPronti.length} articol${itemsNonPronti.length > 1 ? 'i' : 'o'} non ancora pront${itemsNonPronti.length > 1 ? 'i' : 'o'}: ${itemNames}${moreItems}`,
        icon: <AlertTriangle className="h-4 w-4" />,
      });
    }
  }

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

// ── Types ────────────────────────────────────────────────────────

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
  deposit_expected_date: string | null;
  deposit_2_paid: boolean;
  deposit_2_paid_date: string | null;
  deposit_2_expected_date: string | null;
  balance_paid: boolean;
  balance_paid_date: string | null;
  balance_expected_date: string | null;
  financing_paid: boolean | null;
  financing_paid_date: string | null;
  financing_expected_date: string | null;
  financing_cost: number | null;
  has_building_bonus: boolean;
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
  status: { name: string; color: string };
}

interface OrderItemAttachmentData {
  id: string;
  order_item_id: string;
  file_name: string;
  file_url: string;
  file_type: string;
  file_size: number;
}

// ── Component ────────────────────────────────────────────────────

export default function OrderDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, effectiveCompany } = useAuth();
  const queryClient = useQueryClient();

  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [editedNotes, setEditedNotes] = useState("");
  const [duplicateDialogOpen, setDuplicateDialogOpen] = useState(false);
  const [statusChangeDialog, setStatusChangeDialog] = useState<{
    open: boolean; targetStatusId: string | null; targetStatusName: string;
  }>({ open: false, targetStatusId: null, targetStatusName: "" });

  // Fetch order details
  const { data: order, isLoading: orderLoading } = useQuery({
    queryKey: ["order", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select(`*, customer:profiles!orders_customer_id_fkey(id, first_name, last_name, email, phone, address)`)
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data as OrderDetail;
    },
    enabled: !!id && !!user,
  });

  // Fetch order installments from DB
  const { data: dbInstallments = [] } = useQuery({
    queryKey: ["order-installments", id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("order_installments")
        .select("*")
        .eq("order_id", id!)
        .order("position");
      if (error) throw error;
      return (data || []) as unknown as (Installment & { id: string })[];
    },
    enabled: !!id && !!user,
  });

  // Build installments for display
  const displayInstallments: Installment[] = useMemo(() => {
    if (dbInstallments.length > 0) {
      return dbInstallments.map(i => ({
        id: i.id,
        position: i.position,
        label: i.label,
        type: i.type as Installment['type'],
        amount: i.amount,
        is_paid: i.is_paid,
        paid_date: i.paid_date,
        expected_date: i.expected_date,
      }));
    }
    if (!order) return [];
    return buildInstallmentsFromLegacy(order);
  }, [dbInstallments, order]);

  // Fetch order items
  const { data: orderItems = [], refetch: refetchItems } = useQuery({
    queryKey: ["order-items", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_items").select("*").eq("order_id", id!).order("position");
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
        .from("order_item_attachments").select("*").in("order_item_id", itemIds).order("created_at");
      if (error) throw error;
      return data as OrderItemAttachmentData[];
    },
    enabled: orderItems.length > 0,
  });

  // Fetch order statuses
  const { data: statuses = [] } = useQuery({
    queryKey: ["order-statuses", effectiveCompany?.id],
    queryFn: async () => {
      if (!effectiveCompany?.id) return [];
      const { data, error } = await supabase
        .from("order_statuses").select("id, name, icon, color, position")
        .eq("company_id", effectiveCompany.id).order("position");
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
        .select(`id, status_id, changed_at, changed_by, status:order_statuses(name, color)`)
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
      const { error: updateError } = await supabase.from("orders").update({ current_status_id: newStatusId }).eq("id", id!);
      if (updateError) throw updateError;
      const { error: historyError } = await supabase.from("order_status_history").insert({ order_id: id!, status_id: newStatusId, changed_by: user!.id });
      if (historyError) throw historyError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["order", id] });
      queryClient.invalidateQueries({ queryKey: ["order-status-history", id] });
      toast.success("Stato aggiornato");
      setStatusChangeDialog({ open: false, targetStatusId: null, targetStatusName: "" });
    },
    onError: () => { toast.error("Errore nell'aggiornamento dello stato."); },
  });

  // Update notes mutation
  const updateNotesMutation = useMutation({
    mutationFn: async (notes: string) => {
      const { error } = await supabase.from("orders").update({ internal_notes: notes || null }).eq("id", id!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["order", id] });
      toast.success("Note salvate");
      setIsEditingNotes(false);
    },
    onError: () => { toast.error("Errore nel salvataggio delle note."); },
  });

  // Delete order mutation
  const deleteOrderMutation = useMutation({
    mutationFn: () => deleteOrderCascading(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      toast.success("Ordine eliminato");
      navigate("/azienda/ordini");
    },
    onError: () => { toast.error("Errore nell'eliminazione dell'ordine."); },
  });

  // Duplicate order mutation
  const duplicateOrderMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("duplicate-order", {
        body: { source_order_id: id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as { id: string; order_code: string };
    },
    onSuccess: (data) => {
      setDuplicateDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      toast.success(`Ordine duplicato con codice ${data.order_code}`);
      navigate(`/azienda/ordini/${data.id}`);
    },
    onError: () => {
      toast.error("Errore nella duplicazione dell'ordine.");
    },
  });

  // Payment toggle mutation — unified: always writes to order_installments.
  // For legacy orders without DB installments, auto-migrates them on first toggle.
  const updatePaymentMutation = useMutation({
    mutationFn: async ({ installment, paid }: { installment: Installment; paid: boolean }) => {
      const today = new Date().toISOString().split("T")[0];

      if (installment.id) {
        // Installment already in DB — update directly (trigger syncs legacy cols)
        const { error } = await supabase
          .from("order_installments" as any)
          .update({ is_paid: paid, paid_date: paid ? today : null })
          .eq("id", installment.id);
        if (error) throw error;
      } else {
        // @deprecated Legacy path: order has no installments in DB yet.
        // Auto-migrate all legacy installments to order_installments table,
        // then update the target one.
        const legacyInstallments = buildInstallmentsFromLegacy(order!);
        const rows = legacyInstallments.map((inst) => ({
          order_id: id!,
          position: inst.position,
          label: inst.label,
          type: inst.type,
          amount: inst.amount,
          is_paid: inst.position === installment.position && inst.type === installment.type ? paid : inst.is_paid,
          paid_date: inst.position === installment.position && inst.type === installment.type
            ? (paid ? today : null)
            : (inst.paid_date || null),
          expected_date: inst.expected_date || null,
        }));
        const { error } = await (supabase as any).from("order_installments").insert(rows);
        if (error) throw error;
      }
    },
    onSuccess: (_, { paid, installment }) => {
      queryClient.invalidateQueries({ queryKey: ["order", id] });
      queryClient.invalidateQueries({ queryKey: ["order-installments", id] });
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      toast.success(paid ? `${installment.label} segnato come pagato` : `${installment.label} segnato come da pagare`);
    },
    onError: () => { toast.error("Impossibile aggiornare lo stato del pagamento."); },
  });

  const handleInstallmentPaidToggle = (installment: Installment, paid: boolean) => {
    updatePaymentMutation.mutate({ installment, paid });
  };

  // Single item update mutation
  const updateSingleItemMutation = useMutation({
    mutationFn: async (item: OrderItem) => {
      if (!item.id) throw new Error("Item ID required");
      const { error } = await supabase.from("order_items").update({
        name: item.name, description: item.description || null,
        quantity: item.quantity, status: item.status,
        supplier_id: item.supplier_id || null, purchase_price: item.purchase_price ?? 0,
        vat_rate: item.vat_rate ?? 22,
        is_paid: item.is_paid ?? false, paid_date: item.paid_date || null,
        payment_method: item.payment_method || null,
        deposit_amount: item.deposit_amount ?? 0, deposit_paid: item.deposit_paid ?? false,
        deposit_paid_date: item.deposit_paid_date || null,
        balance_amount: item.balance_amount ?? 0, balance_paid: item.balance_paid ?? false,
        balance_paid_date: item.balance_paid_date || null,
        balance_expected_date: item.balance_expected_date || null,
        deposit_expected_date: item.deposit_expected_date || null,
      }).eq("id", item.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["order-items", id] });
      queryClient.invalidateQueries({ queryKey: ["forecast-pending-items"] });
      queryClient.invalidateQueries({ queryKey: ["forecast-supplier-balances"] });
      queryClient.invalidateQueries({ queryKey: ["forecast-installments"] });
      toast.success("Articolo aggiornato");
    },
    onError: () => { toast.error("Errore nell'aggiornamento dell'articolo."); },
  });

  const handleItemUpdate = (item: OrderItem) => { updateSingleItemMutation.mutate(item); };

  // Add new item mutation
  const addItemMutation = useMutation({
    mutationFn: async (item: OrderItem) => {
      const { error } = await supabase.from("order_items").insert({
        order_id: id!, name: item.name, description: item.description || null,
        quantity: item.quantity, status: item.status, position: item.position,
        supplier_id: item.supplier_id || null, purchase_price: item.purchase_price ?? 0,
        vat_rate: item.vat_rate ?? 22,
        is_paid: item.is_paid ?? false, paid_date: item.paid_date || null,
        payment_method: item.payment_method || null,
        deposit_amount: item.deposit_amount ?? 0, deposit_paid: item.deposit_paid ?? false,
        deposit_paid_date: item.deposit_paid_date || null,
        balance_amount: item.balance_amount ?? 0, balance_paid: item.balance_paid ?? false,
        balance_paid_date: item.balance_paid_date || null,
        balance_expected_date: item.balance_expected_date || null,
        deposit_expected_date: item.deposit_expected_date || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["order-items", id] });
      toast.success("Articolo aggiunto");
    },
    onError: () => { toast.error("Impossibile aggiungere l'articolo."); },
  });

  const handleStatusChange = (statusId: string) => {
    if (statusId === order?.current_status_id) return;
    const targetStatus = statuses.find((s) => s.id === statusId);
    setStatusChangeDialog({ open: true, targetStatusId: statusId, targetStatusName: targetStatus?.name || "" });
  };
  const confirmStatusChange = () => { if (statusChangeDialog.targetStatusId) updateStatusMutation.mutate(statusChangeDialog.targetStatusId); };
  const handleEditNotes = () => { setEditedNotes(order?.internal_notes || ""); setIsEditingNotes(true); };
  const handleSaveNotes = () => { updateNotesMutation.mutate(editedNotes); };

  const progressHistory: StatusHistoryItem[] = statusHistory.map((h) => ({ status_id: h.status_id, changed_at: h.changed_at }));

  const displayItems: OrderItem[] = orderItems.map(item => ({
    id: item.id, name: item.name, description: item.description || undefined,
    quantity: item.quantity, status: item.status as OrderItem['status'], position: item.position,
    supplier_id: item.supplier_id || undefined, purchase_price: item.purchase_price || undefined,
    vat_rate: item.vat_rate ?? undefined, stock_item_id: item.stock_item_id || undefined,
    unit_price: item.unit_price || undefined, discount_percent: item.discount_percent || undefined,
    standard_cost: item.standard_cost || undefined,
    is_paid: item.is_paid ?? undefined, paid_date: item.paid_date || undefined,
    payment_method: item.payment_method || undefined,
    deposit_amount: item.deposit_amount ?? undefined, deposit_paid: item.deposit_paid ?? undefined,
    deposit_paid_date: item.deposit_paid_date || undefined,
    balance_amount: item.balance_amount ?? undefined, balance_paid: item.balance_paid ?? undefined,
    balance_paid_date: item.balance_paid_date || undefined,
    balance_expected_date: item.balance_expected_date || undefined,
    deposit_expected_date: item.deposit_expected_date || undefined,
    attachments: attachments.filter(att => att.order_item_id === item.id).map(att => ({
      id: att.id, file_name: att.file_name, file_url: att.file_url, file_type: att.file_type, file_size: att.file_size,
    })),
  }));

  const economicsItems = displayItems.map(item => ({
    name: item.name, quantity: item.quantity, purchase_price: item.purchase_price,
    vat_rate: item.vat_rate, unit_price: item.unit_price,
    discount_percent: item.discount_percent, standard_cost: item.standard_cost,
  }));

  const orderAlerts = useMemo(() => {
    if (!order) return [];
    return getOrderAlerts(order, displayItems);
  }, [order, displayItems]);

  const handleAttachmentsRefresh = () => { refetchAttachments(); };

  if (orderLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10 rounded" />
          <div className="space-y-2"><Skeleton className="h-7 w-[250px]" /><Skeleton className="h-4 w-[150px]" /></div>
        </div>
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6"><Skeleton className="h-[200px] w-full rounded-lg" /><Skeleton className="h-[150px] w-full rounded-lg" /></div>
          <div className="space-y-6"><Skeleton className="h-[120px] w-full rounded-lg" /><Skeleton className="h-[200px] w-full rounded-lg" /></div>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Ordine non trovato</p>
        <Button className="mt-4" onClick={() => navigate("/azienda/ordini")}>Torna agli ordini</Button>
      </div>
    );
  }

  // Compute collected amount from installments for commissions
  const collectedAmount = displayInstallments
    .filter(i => i.is_paid && i.type !== 'financing')
    .reduce((sum, i) => sum + i.amount, 0);

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
              {order.order_code && <span className="text-lg text-muted-foreground font-medium">({order.order_code})</span>}
            </div>
            <p className="text-muted-foreground">Creato il {formatDate(order.created_at)}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setDuplicateDialogOpen(true)}>
            <Copy className="h-4 w-4 mr-2" />Duplica
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to={`/azienda/ordini/${id}/modifica`}><Pencil className="h-4 w-4 mr-2" />Modifica</Link>
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm"><Trash2 className="h-4 w-4 mr-2" />Elimina</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Eliminare l'ordine?</AlertDialogTitle>
                <AlertDialogDescription>Questa azione è irreversibile.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Annulla</AlertDialogCancel>
                <AlertDialogAction onClick={() => deleteOrderMutation.mutate()} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
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
            <Alert key={index} variant={alert.type === 'urgent' ? 'destructive' : 'default'}
              className={cn(
                alert.type === 'warning' && 'border-amber-500 bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-100 [&>svg]:text-amber-600',
                alert.type === 'info' && 'border-blue-500 bg-blue-50 text-blue-900 dark:bg-blue-950 dark:text-blue-100 [&>svg]:text-blue-600'
              )}>
              {alert.icon}
              <AlertTitle>{alert.title}</AlertTitle>
              <AlertDescription>{alert.description}</AlertDescription>
            </Alert>
          ))}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left Column */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5" />Descrizione Lavoro</CardTitle></CardHeader>
            <CardContent><p className="whitespace-pre-wrap">{order.description}</p></CardContent>
          </Card>

          <OrderItemsList
            items={displayItems}
            onItemsChange={(newItems) => {
              const newItem = newItems.find(ni => !ni.id);
              if (newItem) addItemMutation.mutate(newItem);
            }}
            editable={true} allowEdit={true} showStatusControls={true}
            onAttachmentsRefresh={handleAttachmentsRefresh}
            onItemUpdate={handleItemUpdate}
          />

          <OrderAttachments orderId={id!} editable={true} />

          <FinancialSummaryReadOnly
            totalAmount={order.total_amount}
            vatRate={order.vat_rate || 22}
            paymentType={(order.payment_type as PaymentType) || 'standard'}
            installments={displayInstallments}
            hasBuildingBonus={order.has_building_bonus}
            financingCost={order.financing_cost ?? undefined}
            onInstallmentPaidToggle={handleInstallmentPaidToggle}
          />

          <OrderEconomics
            orderId={id!}
            totalAmount={order.total_amount}
            vatRate={order.vat_rate || 22}
            items={economicsItems}
          />
        </div>

        {/* Right Column */}
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><User className="h-5 w-5" />Cliente</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {order.customer ? (
                <>
                  <Link to={`/azienda/clienti/${order.customer.id}`} className="font-medium text-primary hover:underline">
                    {order.customer.first_name} {order.customer.last_name}
                  </Link>
                  <p className="text-sm text-muted-foreground">{order.customer.email}</p>
                  {order.customer.phone && <p className="text-sm text-muted-foreground">{order.customer.phone}</p>}
                  {order.customer.address && <p className="text-sm text-muted-foreground">{order.customer.address}</p>}
                </>
              ) : <p className="text-muted-foreground">Cliente non disponibile</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Clock className="h-5 w-5" />Stato Ordine</CardTitle></CardHeader>
            <CardContent>
              <OrderProgressTracker statuses={statuses} currentStatusId={order.current_status_id}
                statusHistory={progressHistory} onStatusChange={handleStatusChange} interactive={true} size="sm" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Storico Stati</CardTitle></CardHeader>
            <CardContent>
              {statusHistory.length === 0 ? <p className="text-muted-foreground">Nessuno storico disponibile</p> : (
                <div className="space-y-4">
                  {statusHistory.map((entry) => (
                    <div key={entry.id} className="flex items-center justify-between border-b pb-3 last:border-0 last:pb-0">
                      <div className="flex items-center gap-3">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.status.color }} />
                        <span className="font-medium">{entry.status.name}</span>
                      </div>
                      <span className="text-sm text-muted-foreground">{formatDateTime(entry.changed_at)}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <SupplierPaymentsCard items={orderItems} companyId={effectiveCompany?.id || ""} />
          <OrderLaborCosts orderId={id!} editable={true} />
          <OrderCommissions
            orderId={id!}
            totalAmount={order.total_amount}
            collectedAmount={collectedAmount}
            vatRate={order.vat_rate || 22}
          />
          <OrderErrors orderId={id!} />
          <InlineEditableDatesCard
            orderId={order.id}
            expectedDate={order.expected_date}
            warehouseArrivalDate={order.warehouse_arrival_date}
            workStartDate={order.work_start_date}
            workEndDate={order.work_end_date}
          />

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Note Interne</CardTitle>
              {!isEditingNotes && <Button variant="ghost" size="sm" onClick={handleEditNotes}>Modifica</Button>}
            </CardHeader>
            <CardContent>
              {isEditingNotes ? (
                <div className="space-y-3">
                  <Textarea value={editedNotes} onChange={(e) => setEditedNotes(e.target.value)} rows={4} placeholder="Aggiungi note interne..." />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleSaveNotes} disabled={updateNotesMutation.isPending}>Salva</Button>
                    <Button size="sm" variant="outline" onClick={() => setIsEditingNotes(false)}>Annulla</Button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{order.internal_notes || "Nessuna nota interna"}</p>
              )}
            </CardContent>
          </Card>

          <LinkedTasks orderId={id} category="ordini" />
          <LinkedAppointments orderId={id!} />
        </div>
      </div>

      {/* Status Change Dialog */}
      <Dialog open={statusChangeDialog.open} onOpenChange={(open) => setStatusChangeDialog({ ...statusChangeDialog, open })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Conferma cambio stato</DialogTitle>
            <DialogDescription>Vuoi cambiare lo stato dell'ordine a "{statusChangeDialog.targetStatusName}"?</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStatusChangeDialog({ open: false, targetStatusId: null, targetStatusName: "" })}>Annulla</Button>
            <Button onClick={confirmStatusChange} disabled={updateStatusMutation.isPending}>
              {updateStatusMutation.isPending ? "Aggiornamento..." : "Conferma"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Duplicate Order Dialog */}
      <Dialog open={duplicateDialogOpen} onOpenChange={setDuplicateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Duplica ordine</DialogTitle>
            <DialogDescription>
              Duplicare l'ordine {order.order_code ? `#${order.order_code}` : ''}? Il nuovo ordine verrà creato come bozza senza pagamenti incassati.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDuplicateDialogOpen(false)}>Annulla</Button>
            <Button onClick={() => duplicateOrderMutation.mutate()} disabled={duplicateOrderMutation.isPending}>
              {duplicateOrderMutation.isPending ? "Duplicazione..." : "Duplica"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
