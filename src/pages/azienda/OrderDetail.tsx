import { useState, useMemo, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ErrorBoundary } from "@/components/error/ErrorBoundary";
import { AlertTriangle, AlertCircle, Package, Receipt, HardHat } from "lucide-react";
import { formatDateTime, formatCurrency } from "@/lib/formatters";
import { differenceInDays, parseISO, isBefore, startOfDay } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { OrderItem } from "@/components/orders/OrderItemsList";
import { PaymentType } from "@/components/orders/FinancialSummary";
import { OrderErrors } from "@/components/orders/OrderErrors";
import { LinkedTasks } from "@/components/tasks/LinkedTasks";
import { LinkedAppointments } from "@/components/appointments/LinkedAppointments";
import type { StatusHistoryItem } from "@/components/orders/OrderProgressTracker";
import { type OrderStatus, type OrderItemData, type Installment, deleteOrderCascading, buildInstallmentsFromLegacy } from "@/lib/orderUtils";
import { useFattureByOrdine } from "@/hooks/billing/useFatturaOrdineLink";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
// ── New sub-components ──────────────────────────────────────────
import { OrdineDetailHeader } from "@/components/orders/OrdineDetailHeader";
import { OrdineStatusStrip } from "@/components/orders/OrdineStatusStrip";
import { OrdineArticoli } from "@/components/orders/OrdineArticoli";
import { OrdineEconomico } from "@/components/orders/OrdineEconomico";
import { OrdineCliente } from "@/components/orders/OrdineCliente";
import { OrdineTempistiche } from "@/components/orders/OrdineTempistiche";
import { OrdineManodopera } from "@/components/orders/OrdineManodopera";
import { OrdineSAL } from "@/components/orders/OrdineSAL";
import { OrdineFirma } from "@/components/orders/OrdineFirma";
import { OrdineNote } from "@/components/orders/OrdineNote";
import { OrdineAcquisto } from "@/components/orders/OrdineAcquisto";
import { OrdineVariazione } from "@/components/orders/OrdineVariazione";
import { TimelineCantiere } from "@/components/orders/TimelineCantiere";
import { SubappaltatoriOrderCard } from "@/components/orders/SubappaltatoriOrderCard";
import { useOrdinePDF } from "@/hooks/useOrdinePDF";
import { OrdineAssegnazioniCampo } from "@/components/orders/OrdineAssegnazioniCampo";
import { OrdineRapportiniCampo } from "@/components/orders/OrdineRapportiniCampo";

// ── Giornale Tab Content ─────────────────────────────────────────

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

// ── Inner Component ───────────────────────────────────────────────

function OrderDetailInner() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();

  const { downloadPDF, isGenerating: isGeneratingPDF } = useOrdinePDF();

  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [editedNotes, setEditedNotes] = useState("");
  const [duplicateDialogOpen, setDuplicateDialogOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [statusChangeDialog, setStatusChangeDialog] = useState<{
    open: boolean; targetStatusId: string | null; targetStatusName: string;
  }>({ open: false, targetStatusId: null, targetStatusName: "" });

  // Fetch order details
  const { data: order, isLoading: orderLoading } = useQuery({
    queryKey: queryKeys.orders.detail(id),
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
    staleTime: 120_000,
    gcTime: 10 * 60 * 1000,
  });

  // Fetch order installments from DB
  const { data: dbInstallments = [] } = useQuery({
    queryKey: queryKeys.orders.installments(id),
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
    staleTime: 120_000,
    gcTime: 10 * 60 * 1000,
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
    staleTime: 120_000,
    gcTime: 10 * 60 * 1000,
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
    staleTime: 120_000,
    gcTime: 10 * 60 * 1000,
  });

  // Fetch order statuses
  const { data: statuses = [] } = useQuery({
    queryKey: queryKeys.orders.statuses(effectiveCompany?.id),
    queryFn: async () => {
      if (!effectiveCompany?.id) return [];
      const { data, error } = await supabase
        .from("order_statuses").select("id, name, icon, color, position")
        .eq("company_id", effectiveCompany.id).order("position");
      if (error) throw error;
      return data as OrderStatus[];
    },
    enabled: !!effectiveCompany?.id,
    staleTime: 600_000,
    gcTime: 30 * 60 * 1000,
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
    staleTime: 120_000,
    gcTime: 10 * 60 * 1000,
  });

  // Fetch linked fatture
  const { data: fattureCollegate = [] } = useFattureByOrdine(id);

  // Fetch labor costs for PDF
  const { data: pdfLaborEmployees = [] } = useQuery({
    queryKey: ["order-employees-pdf", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_employees")
        .select("*, employee:employees(first_name, last_name)")
        .eq("order_id", id!);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!id && !!user,
    staleTime: 120_000,
  });

  const { data: pdfLaborTeams = [] } = useQuery({
    queryKey: ["order-external-teams-pdf", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_external_teams")
        .select("*, external_team:external_teams(name)")
        .eq("order_id", id!);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!id && !!user,
    staleTime: 120_000,
  });

  const { data: pdfSalList = [] } = useQuery({
    queryKey: ["sal-list-pdf", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sal_records")
        .select("*, sal_voci(*)")
        .eq("order_id", id!)
        .order("numero_sal");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!id && !!user,
    staleTime: 120_000,
  });

  // Update status mutation
  const updateStatusMutation = useMutation({
    mutationFn: async (newStatusId: string) => {
      const { error } = await supabase.rpc("change_order_status", {
        p_order_id: id!,
        p_new_status_id: newStatusId,
        p_changed_by: user!.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.detail(id) });
      queryClient.invalidateQueries({ queryKey: ["order-status-history", id] });
      queryClient.invalidateQueries({ queryKey: queryKeys.calendarOrders.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.all });
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
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.detail(id) });
      toast.success("Note salvate");
      setIsEditingNotes(false);
    },
    onError: () => { toast.error("Errore nel salvataggio delle note."); },
  });

  // Delete order mutation
  const deleteOrderMutation = useMutation({
    mutationFn: () => deleteOrderCascading(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.calendarOrders.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.margin.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.breakEven.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.cruscotto.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.cashflow.all });
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
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.all });
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
          .from("order_installments")
          .update({ is_paid: paid, paid_date: paid ? today : null })
          .eq("id", installment.id);
        if (error) throw error;
      } else {
        // @deprecated Legacy path: order has no installments in DB yet.
        // Auto-migrate all legacy installments to order_installments table,
        // then update the target one.
        // Idempotency check: verify no installments already exist (prevents duplicates on double-click)
        const { count } = await (supabase as any)
          .from("order_installments")
          .select("id", { count: "exact", head: true })
          .eq("order_id", id!);
        if (count && count > 0) {
          // Installments were already migrated (race condition / double-click).
          // Reload and update the target one by position+type.
          const { data: existing } = await (supabase as any)
            .from("order_installments")
            .select("id, position, type")
            .eq("order_id", id!);
          const match = (existing || []).find((r: any) => r.position === installment.position && r.type === installment.type);
          if (match) {
            const { error } = await (supabase as any)
              .from("order_installments")
              .update({ is_paid: paid, paid_date: paid ? today : null })
              .eq("id", match.id);
            if (error) throw error;
          }
        } else {
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
      }
    },
    onSuccess: (_, { paid, installment }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.detail(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.installments(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.all });
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
      queryClient.invalidateQueries({ queryKey: queryKeys.warehouse.itemsAll });
      queryClient.invalidateQueries({ queryKey: queryKeys.warehouse.badgeCountsAll });
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
      queryClient.invalidateQueries({ queryKey: queryKeys.warehouse.itemsAll });
      queryClient.invalidateQueries({ queryKey: queryKeys.warehouse.badgeCountsAll });
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

  const handleDownloadPDF = useCallback(() => {
    if (!order) return;
    downloadPDF({
      order,
      items: orderItems,
      laborEmployees: pdfLaborEmployees,
      laborTeams: pdfLaborTeams,
      salList: pdfSalList,
      statuses,
      companyName: effectiveCompany?.name,
    });
  }, [order, orderItems, pdfLaborEmployees, pdfLaborTeams, pdfSalList, statuses, effectiveCompany, downloadPDF]);

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
    <div className="min-h-screen bg-gray-50">
      {/* ── New Header (breadcrumb + title + actions) ──────────── */}
      <OrdineDetailHeader
        ordineId={id!}
        orderCode={order.order_code || "—"}
        descrizione={order.description}
        dataCreazione={order.created_at}
        nomeCliente={
          order.customer
            ? `${order.customer.first_name} ${order.customer.last_name}`
            : "Cliente non disponibile"
        }
        onDuplica={() => setDuplicateDialogOpen(true)}
        onModifica={() => navigate(`/azienda/ordini/${id}/modifica`)}
        onNuovoSAL={() => {/* SAL creation is handled inside SalTab */}}
        onElimina={() => setDeleteConfirmOpen(true)}
        onDownloadPDF={handleDownloadPDF}
        isGeneratingPDF={isGeneratingPDF}
      />

      {/* ── Status strip ──────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-100 px-6 py-3">
        <OrdineStatusStrip
          statuses={statuses}
          currentStatusId={order.current_status_id}
          statusHistory={progressHistory}
          onStatusChange={handleStatusChange}
        />
      </div>

      <div className="px-6 py-6 space-y-6">
        {/* ── Alerts ──────────────────────────────────────────── */}
        {orderAlerts.length > 0 && (
          <div className="space-y-3">
            {orderAlerts.map((alert) => (
              <Alert
                key={`${alert.type}-${alert.title}`}
                variant={alert.type === "urgent" ? "destructive" : "default"}
                className={cn(
                  alert.type === "warning" &&
                    "border-amber-500 bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-100 [&>svg]:text-amber-600",
                  alert.type === "info" &&
                    "border-blue-500 bg-blue-50 text-blue-900 dark:bg-blue-950 dark:text-blue-100 [&>svg]:text-blue-600"
                )}
              >
                {alert.icon}
                <AlertTitle>{alert.title}</AlertTitle>
                <AlertDescription>{alert.description}</AlertDescription>
              </Alert>
            ))}
          </div>
        )}

        {/* ── MOBILE: tab layout ──────────────────────────────── */}
        <div className="sm:hidden">
          <Tabs defaultValue="stato">
            <TabsList className="w-full grid grid-cols-7 h-auto">
              <TabsTrigger value="stato" className="text-xs py-2">Stato</TabsTrigger>
              <TabsTrigger value="articoli" className="text-xs py-2">Articoli</TabsTrigger>
              <TabsTrigger value="finanza" className="text-xs py-2">Finanza</TabsTrigger>
              <TabsTrigger value="sal" className="text-xs py-2">SAL</TabsTrigger>
              <TabsTrigger value="cantiere" className="text-xs py-2">Cantiere</TabsTrigger>
              <TabsTrigger value="campo" className="text-xs py-2">
                <div className="flex items-center gap-1">
                  <HardHat className="w-3 h-3" />
                  Campo
                </div>
              </TabsTrigger>
              <TabsTrigger value="altro" className="text-xs py-2">Altro</TabsTrigger>
            </TabsList>

            {/* Tab 1: Stato + Cliente + Date */}
            <TabsContent value="stato" className="space-y-4 mt-4">
              <OrdineCliente customer={order.customer} />
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Storico Stati</CardTitle>
                </CardHeader>
                <CardContent>
                  {statusHistory.length === 0 ? (
                    <p className="text-muted-foreground text-sm">Nessuno storico</p>
                  ) : (
                    <div className="space-y-3">
                      {statusHistory.map((entry) => (
                        <div
                          key={entry.id}
                          className="flex items-center justify-between border-b pb-2 last:border-0 last:pb-0"
                        >
                          <div className="flex items-center gap-2">
                            <div
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: entry.status.color }}
                            />
                            <span className="text-sm font-medium">{entry.status.name}</span>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {formatDateTime(entry.changed_at)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
              <OrdineTempistiche
                orderId={order.id}
                expectedDate={order.expected_date}
                warehouseArrivalDate={order.warehouse_arrival_date}
                workStartDate={order.work_start_date}
                workEndDate={order.work_end_date}
              />
            </TabsContent>

            {/* Tab 2: Articoli */}
            <TabsContent value="articoli" className="space-y-4 mt-4">
              <OrdineArticoli
                orderId={id!}
                displayItems={displayItems}
                orderItems={orderItems}
                companyId={effectiveCompany?.id || ""}
                onItemsChange={(newItems) => {
                  const newItem = newItems.find((ni) => !ni.id);
                  if (newItem) addItemMutation.mutate(newItem);
                }}
                onItemUpdate={handleItemUpdate}
                onAttachmentsRefresh={handleAttachmentsRefresh}
              />
            </TabsContent>

            {/* Tab 3: Finanza */}
            <TabsContent value="finanza" className="space-y-4 mt-4">
              <OrdineEconomico
                orderId={id!}
                totalAmount={order.total_amount}
                vatRate={order.vat_rate || 22}
                paymentType={(order.payment_type as PaymentType) || "standard"}
                installments={displayInstallments}
                hasBuildingBonus={order.has_building_bonus}
                financingCost={order.financing_cost ?? undefined}
                items={economicsItems}
                collectedAmount={collectedAmount}
                onInstallmentPaidToggle={handleInstallmentPaidToggle}
              />
              {/* Fatturazione */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Receipt className="h-4 w-4" />
                    Fatturazione
                    {fattureCollegate.length > 0 && (
                      <Badge variant="secondary" className="ml-auto text-xs">
                        {fattureCollegate.length}
                      </Badge>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {fattureCollegate.length > 0 ? (
                    <div className="space-y-2">
                      {fattureCollegate.map((f: any) => (
                        <Link
                          key={f.id}
                          to={`/azienda/documenti/${f.id}`}
                          className="flex items-center justify-between p-2 rounded-md border hover:bg-accent transition-colors text-sm"
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{f.numero}</span>
                            <Badge variant="outline" className="text-xs">
                              {f.stato}
                            </Badge>
                          </div>
                          <span className="text-muted-foreground">
                            {formatCurrency(f.totale_da_pagare)}
                          </span>
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-2">
                      Nessuna fattura collegata
                    </p>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() =>
                      navigate(`/azienda/documenti/nuovo?tipo=fattura&ordine=${id}`)
                    }
                  >
                    <Receipt className="h-3.5 w-3.5 mr-1.5" />
                    Crea fattura
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Tab 4: SAL */}
            <TabsContent value="sal" className="space-y-4 mt-4">
              {companyId && (
                <OrdineSAL
                  orderId={id!}
                  companyId={companyId}
                  orderTotalAmount={order.total_amount ?? undefined}
                />
              )}
            </TabsContent>

            {/* Tab 5: Cantiere */}
            <TabsContent value="cantiere" className="space-y-4 mt-4">
              <div className="space-y-2">
                <div>
                  <h2 className="text-base font-semibold">Timeline Cantiere</h2>
                  <p className="text-sm text-muted-foreground">
                    Tutti gli aggiornamenti: stati, lavori, SAL e varianti.
                  </p>
                </div>
                <TimelineCantiere
                  orderId={id!}
                  companyId={effectiveCompany?.id || ""}
                  adminView={true}
                />
              </div>
            </TabsContent>

            {/* Tab Campo: assegnazioni operai + rapportini */}
            <TabsContent value="campo" className="space-y-4 mt-4">
              <OrdineAssegnazioniCampo orderId={id!} companyId={effectiveCompany?.id ?? ""} />
              <OrdineRapportiniCampo orderId={id!} />
            </TabsContent>

            {/* Tab 6: Altro */}
            <TabsContent value="altro" className="space-y-4 mt-4">
              <OrdineNote
                notes={order.internal_notes}
                isEditing={isEditingNotes}
                editedNotes={editedNotes}
                isSaving={updateNotesMutation.isPending}
                onEdit={handleEditNotes}
                onSave={handleSaveNotes}
                onCancel={() => setIsEditingNotes(false)}
                onNotesChange={setEditedNotes}
              />
              <OrdineManodopera orderId={id!} editable={true} />
              <OrderErrors orderId={id!} />
              {effectiveCompany?.id && (
                <SubappaltatoriOrderCard orderId={id!} companyId={effectiveCompany.id} />
              )}
              <LinkedTasks orderId={id} category="ordini" />
              <LinkedAppointments orderId={id!} />
              <OrdineAcquisto
                orderId={id!}
                orderCode={order.order_code}
                items={displayItems.map((i) => ({
                  name: i.name,
                  quantity: i.quantity,
                  purchase_price: i.purchase_price,
                  supplier_id: i.supplier_id,
                  vat_rate: i.vat_rate,
                }))}
              />
              <OrdineFirma
                orderId={id!}
                customerEmail={order.customer?.email}
                customerName={
                  order.customer
                    ? `${order.customer.first_name} ${order.customer.last_name}`
                    : undefined
                }
              />
              {effectiveCompany?.id && (
                <OrdineVariazione orderId={id!} companyId={effectiveCompany.id} />
              )}
            </TabsContent>
          </Tabs>
        </div>

        {/* ── DESKTOP: 2-column layout ─────────────────────────── */}
        <div className="hidden sm:grid gap-6 lg:grid-cols-3">
          {/* ── Left Column (2/3) ──────────────────────────────── */}
          <div className="lg:col-span-2 space-y-6">
            {/* Articoli */}
            <OrdineArticoli
              orderId={id!}
              displayItems={displayItems}
              orderItems={orderItems}
              companyId={effectiveCompany?.id || ""}
              onItemsChange={(newItems) => {
                const newItem = newItems.find((ni) => !ni.id);
                if (newItem) addItemMutation.mutate(newItem);
              }}
              onItemUpdate={handleItemUpdate}
              onAttachmentsRefresh={handleAttachmentsRefresh}
            />

            {/* Economico */}
            <OrdineEconomico
              orderId={id!}
              totalAmount={order.total_amount}
              vatRate={order.vat_rate || 22}
              paymentType={(order.payment_type as PaymentType) || "standard"}
              installments={displayInstallments}
              hasBuildingBonus={order.has_building_bonus}
              financingCost={order.financing_cost ?? undefined}
              items={economicsItems}
              collectedAmount={collectedAmount}
              onInstallmentPaidToggle={handleInstallmentPaidToggle}
            />

            {/* SAL */}
            {companyId && (
              <OrdineSAL
                orderId={id!}
                companyId={companyId}
                orderTotalAmount={order.total_amount ?? undefined}
              />
            )}

            {/* Variazioni + OdV */}
            {effectiveCompany?.id && (
              <OrdineVariazione orderId={id!} companyId={effectiveCompany.id} />
            )}
          </div>

          {/* ── Right Column (1/3) ──────────────────────────────── */}
          <div className="space-y-5">
            {/* Cliente */}
            <OrdineCliente customer={order.customer} />

            {/* Tempistiche */}
            <OrdineTempistiche
              orderId={order.id}
              expectedDate={order.expected_date}
              warehouseArrivalDate={order.warehouse_arrival_date}
              workStartDate={order.work_start_date}
              workEndDate={order.work_end_date}
            />

            {/* Storico stati */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">
                  Storico Stati
                </CardTitle>
              </CardHeader>
              <CardContent>
                {statusHistory.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Nessuno storico disponibile
                  </p>
                ) : (
                  <div className="space-y-3">
                    {statusHistory.map((entry) => (
                      <div
                        key={entry.id}
                        className="flex items-center justify-between border-b pb-2 last:border-0 last:pb-0"
                      >
                        <div className="flex items-center gap-2">
                          <div
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: entry.status.color }}
                          />
                          <span className="text-sm font-medium">{entry.status.name}</span>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {formatDateTime(entry.changed_at)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Fatturazione */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-medium text-gray-600">
                  <Receipt className="h-4 w-4" />
                  Fatturazione
                  {fattureCollegate.length > 0 && (
                    <Badge variant="secondary" className="ml-auto text-xs">
                      {fattureCollegate.length}
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {fattureCollegate.length > 0 ? (
                  <div className="space-y-2">
                    {fattureCollegate.map((f: any) => (
                      <Link
                        key={f.id}
                        to={`/azienda/documenti/${f.id}`}
                        className="flex items-center justify-between p-2 rounded-md border hover:bg-accent transition-colors text-sm"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{f.numero}</span>
                          <Badge variant="outline" className="text-xs">
                            {f.stato}
                          </Badge>
                        </div>
                        <span className="text-muted-foreground">
                          {formatCurrency(f.totale_da_pagare)}
                        </span>
                      </Link>
                    ))}
                    <div className="pt-1 border-t flex justify-between text-sm">
                      <span className="text-muted-foreground">Totale fatturato</span>
                      <span className="font-medium">
                        {formatCurrency(
                          fattureCollegate.reduce(
                            (s: number, f: any) => s + (f.totale_da_pagare ?? 0),
                            0
                          )
                        )}
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-2">
                    Nessuna fattura collegata
                  </p>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() =>
                    navigate(`/azienda/documenti/nuovo?tipo=fattura&ordine=${id}`)
                  }
                >
                  <Receipt className="h-3.5 w-3.5 mr-1.5" />
                  Crea fattura
                </Button>
              </CardContent>
            </Card>

            {/* Note */}
            <OrdineNote
              notes={order.internal_notes}
              isEditing={isEditingNotes}
              editedNotes={editedNotes}
              isSaving={updateNotesMutation.isPending}
              onEdit={handleEditNotes}
              onSave={handleSaveNotes}
              onCancel={() => setIsEditingNotes(false)}
              onNotesChange={setEditedNotes}
            />

            {/* Manodopera */}
            <OrdineManodopera orderId={id!} editable={true} />

            {/* Errori */}
            <OrderErrors orderId={id!} />

            {/* Ordini di acquisto */}
            <OrdineAcquisto
              orderId={id!}
              orderCode={order.order_code}
              items={displayItems.map((i) => ({
                name: i.name,
                quantity: i.quantity,
                purchase_price: i.purchase_price,
                supplier_id: i.supplier_id,
                vat_rate: i.vat_rate,
              }))}
            />

            {/* Firma */}
            <OrdineFirma
              orderId={id!}
              customerEmail={order.customer?.email}
              customerName={
                order.customer
                  ? `${order.customer.first_name} ${order.customer.last_name}`
                  : undefined
              }
            />

            {/* Task e appuntamenti */}
            <LinkedTasks orderId={id} category="ordini" />
            <LinkedAppointments orderId={id!} />
          </div>
        </div>
      </div>

      {/* ── Dialogs ──────────────────────────────────────────── */}

      {/* Delete confirm (triggered by OrdineDetailHeader) */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare l'ordine?</AlertDialogTitle>
            <AlertDialogDescription>Questa azione è irreversibile.</AlertDialogDescription>
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

      {/* Status Change Dialog */}
      <Dialog
        open={statusChangeDialog.open}
        onOpenChange={(open) => setStatusChangeDialog({ ...statusChangeDialog, open })}
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
                setStatusChangeDialog({ open: false, targetStatusId: null, targetStatusName: "" })
              }
            >
              Annulla
            </Button>
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
              Duplicare l'ordine {order.order_code ? `#${order.order_code}` : ""}? Il nuovo ordine
              verrà creato come bozza senza pagamenti incassati.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDuplicateDialogOpen(false)}>
              Annulla
            </Button>
            <Button
              onClick={() => duplicateOrderMutation.mutate()}
              disabled={duplicateOrderMutation.isPending}
            >
              {duplicateOrderMutation.isPending ? "Duplicazione..." : "Duplica"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function OrderDetail() {
  return (
    <ErrorBoundary title="Errore nel dettaglio ordine">
      <OrderDetailInner />
    </ErrorBoundary>
  );
}
