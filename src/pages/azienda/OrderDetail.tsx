import { useState, useMemo, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ErrorBoundary } from "@/components/error/ErrorBoundary";
import { AlertTriangle, AlertCircle, Package, Receipt, HardHat, Truck, FileText, FileWarning, Download, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { OrderSurveysCard } from "@/components/orders/OrderSurveysCard";
import { OrderMeasureControl } from "@/components/orders/OrderMeasureControl";
import { OrderSupplierOrders } from "@/components/orders/OrderSupplierOrders";
import { OrderEconomicsSummary } from "@/components/orders/OrderEconomicsSummary";
import { RitenuteTab } from "@/components/ritenute/RitenuteTab";
import { formatDateTime, formatCurrency } from "@/lib/formatters";
import { differenceInDays, parseISO, isBefore, startOfDay, format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { QuoteCard } from "@/components/marketing/preventivi/ui/builderUI";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { OrderItem } from "@/components/orders/OrderItemsList";
import { OrderSerialsTrackingCard } from "@/components/orders/OrderSerialsTrackingCard";
import { PaymentType } from "@/components/orders/FinancialSummary";
import { OrderErrors } from "@/components/orders/OrderErrors";
import { ContrattoAIDialog } from "@/components/orders/ContrattoAIDialog";
import { AllocazioneOperaiAIDialog } from "@/components/orders/AllocazioneOperaiAIDialog";
import { LinkedTasks } from "@/components/tasks/LinkedTasks";
import { LinkedAppointments } from "@/components/appointments/LinkedAppointments";
import type { StatusHistoryItem } from "@/components/orders/OrderProgressTracker";
import { type OrderStatus, type OrderItemData, type Installment, deleteOrderCascading, buildInstallmentsFromLegacy } from "@/lib/orderUtils";
import { useFattureByOrdine } from "@/hooks/billing/useFatturaOrdineLink";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
// ── New sub-components ──────────────────────────────────────────
import { OrdineDetailHeader } from "@/components/orders/OrdineDetailHeader";
import { ChiediASilvio } from "@/components/silvio/ChiediASilvio";
import { OrdineStatusStrip } from "@/components/orders/OrdineStatusStrip";
import { OrdineArticoli } from "@/components/orders/OrdineArticoli";
import { OrdineEconomico } from "@/components/orders/OrdineEconomico";
import { OrdineCliente } from "@/components/orders/OrdineCliente";
import { OrdineTempistiche } from "@/components/orders/OrdineTempistiche";
import { OrdineAppaltatoreLavoroCard } from "@/components/orders/OrdineAppaltatoreLavoroCard";
import { OrderLaborCosts } from "@/components/orders/OrderLaborCosts";
import { OrdineSAL } from "@/components/orders/OrdineSAL";
import { OrdineFirma } from "@/components/orders/OrdineFirma";
import { OrdineNote } from "@/components/orders/OrdineNote";
import { LinkedPurchaseOrdersCard } from "@/components/orders/LinkedPurchaseOrdersCard";
import { OrdineVariazione } from "@/components/orders/OrdineVariazione";
import { TimelineCantiere } from "@/components/orders/TimelineCantiere";

import { useOrdinePDF } from "@/hooks/useOrdinePDF";

import { OrdineRapportiniCampo } from "@/components/orders/OrdineRapportiniCampo";
import { WhatsAppActivityFeed } from "@/components/whatsapp/WhatsAppActivityFeed";
import { CreaFatturaDialog } from "@/components/orders/CreaFatturaDialog";
import { CreaDDTDialog } from "@/components/orders/CreaDDTDialog";
import { CreaProformaDialog } from "@/components/orders/CreaProformaDialog";
import { CreaNotaCreditoDialog } from "@/components/orders/CreaNotaCreditoDialog";
import { downloadNativePDF } from "@/lib/fatturazione/generatePDF";
import { calculateCollectedNetFromInstallments } from "@/lib/commissions";

// ── Giornale Tab Content ─────────────────────────────────────────

// ── Order Alert logic ────────────────────────────────────────────

interface OrderAlert {
  type: 'urgent' | 'warning' | 'info';
  title: string;
  description: string;
  icon: React.ReactNode;
}

function parseValidOrderDate(value: string | null): Date | null {
  if (!value) return null;
  const parsed = parseISO(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getOrderAlerts(
  order: { expected_date: string | null; warehouse_arrival_date: string | null },
  items: { name: string; status: string }[],
  installments: { label: string; amount: number; is_paid: boolean; expected_date?: string | null }[] = []
): OrderAlert[] {
  const alerts: OrderAlert[] = [];
  const today = startOfDay(new Date());

  // "Prossima azione" incassi: la rata scaduta (urgente) o il prossimo
  // incasso atteso — così la cosa più importante si legge in testata senza
  // scendere fino al tab Finanza.
  const nonPagateConData = installments
    .filter(i => !i.is_paid && i.amount > 0 && i.expected_date)
    .sort((a, b) => (a.expected_date! < b.expected_date! ? -1 : 1));
  if (nonPagateConData.length > 0) {
    const prossima = nonPagateConData[0];
    const dataRata = parseValidOrderDate(prossima.expected_date!);
    if (dataRata) {
      const giorni = differenceInDays(startOfDay(dataRata), today);
      if (giorni < 0) {
        alerts.push({
          type: 'urgent',
          title: `Rata scaduta da ${Math.abs(giorni)} giorn${Math.abs(giorni) === 1 ? 'o' : 'i'}`,
          description: `${prossima.label} di ${formatCurrency(prossima.amount)} era previsto il ${format(dataRata, "dd/MM/yyyy")} — sollecita l'incasso.`,
          icon: <AlertTriangle className="h-4 w-4" />,
        });
      } else if (giorni <= 14) {
        alerts.push({
          type: 'info',
          title: giorni === 0 ? 'Incasso previsto oggi' : `Prossimo incasso tra ${giorni} giorn${giorni === 1 ? 'o' : 'i'}`,
          description: `${prossima.label} di ${formatCurrency(prossima.amount)} previsto il ${format(dataRata, "dd/MM/yyyy")}.`,
          icon: <AlertCircle className="h-4 w-4" />,
        });
      }
    }
  }

  const itemsDaOrdinare = items.filter(i => i.status === 'da_ordinare');
  const itemsOrdinati = items.filter(i => i.status === 'ordinato');
  const itemsNonPronti = items.filter(i => i.status === 'da_ordinare' || i.status === 'ordinato');

  if (order.expected_date && itemsNonPronti.length > 0) {
    const parsedExpectedDate = parseValidOrderDate(order.expected_date);
    if (parsedExpectedDate) {
      const expectedDate = startOfDay(parsedExpectedDate);
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
  }

  if (order.warehouse_arrival_date && itemsOrdinati.length > 0) {
    const parsedArrivalDate = parseValidOrderDate(order.warehouse_arrival_date);
    if (parsedArrivalDate) {
      const arrivalDate = startOfDay(parsedArrivalDate);
      if (isBefore(arrivalDate, today)) {
        alerts.push({
          type: 'warning',
          title: 'Merce in ritardo',
          description: `${itemsOrdinati.length} articol${itemsOrdinati.length > 1 ? 'i' : 'o'} dovrebbe${itemsOrdinati.length > 1 ? 'ro' : ''} essere già arrivat${itemsOrdinati.length > 1 ? 'i' : 'o'} in magazzino`,
          icon: <AlertCircle className="h-4 w-4" />,
        });
      }
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
  // ── Modulo Appaltatori (default: order_type='cliente') ─────────────
  order_type: "cliente" | "appaltatore_lavoro" | null;
  work_address: string | null;
  work_description: string | null;
  materials_location: string | null;
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

interface OrderDocumentSummary {
  id: string;
  file_name: string;
  file_url: string;
  file_type: string;
  file_size: number;
  visible_to_customer: boolean;
  created_at: string;
}

interface LinkedFiscalDocument {
  id: string;
  numero: string;
  data_emissione: string;
  stato: string;
  tipo: string;
  totale_da_pagare: number;
}

// ── Inner Component ───────────────────────────────────────────────

function OrderDetailInner() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, effectiveCompany } = useAuth();
  const permissions = usePermissions();
  const companyId = effectiveCompany?.id;
  const isNativeBilling = (effectiveCompany as { billing_mode?: string } | null | undefined)?.billing_mode === "native";
  const queryClient = useQueryClient();

  const { downloadPDF, isGenerating: isGeneratingPDF } = useOrdinePDF();

  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [editedNotes, setEditedNotes] = useState("");
  const [duplicateDialogOpen, setDuplicateDialogOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [mobileTab, setMobileTab] = useState<string>("stato");
  const [creaFatturaOpen, setCreaFatturaOpen] = useState(false);
  const [creaDDTOpen, setCreaDDTOpen] = useState(false);
  const [creaProformaOpen, setCreaProformaOpen] = useState(false);
  const [creaNotaCreditoOpen, setCreaNotaCreditoOpen] = useState(false);
  const [statusChangeDialog, setStatusChangeDialog] = useState<{
    open: boolean; targetStatusId: string | null; targetStatusName: string;
  }>({ open: false, targetStatusId: null, targetStatusName: "" });

  // Fetch order details
  const { data: order, isLoading: orderLoading } = useQuery({
    queryKey: queryKeys.orders.detail(id),
    queryFn: async () => {
      if (!effectiveCompany?.id) throw new Error("Azienda non trovata");
      const { data, error } = await supabase
        .from("orders")
        .select(`*, customer:profiles!orders_customer_id_fkey(id, first_name, last_name, email, phone, address)`)
        .eq("id", id!)
        .eq("company_id", effectiveCompany.id)
        .single();
      if (error) throw error;
      return data as OrderDetail;
    },
    enabled: !!id && !!user && !!effectiveCompany?.id,
    staleTime: 120_000,
    gcTime: 10 * 60 * 1000,
  });

  // Fetch order installments from DB
  const { data: dbInstallments = [] } = useQuery({
    queryKey: queryKeys.orders.installments(id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_installments" as never)
        .select("*")
        .eq("order_id", id!)
        .order("position");
      if (error) throw error;
      return (data || []) as unknown as (Installment & { id: string })[];
    },
    enabled: !!id && !!user && !!order?.id,
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
  const { data: orderItems = [], isPending: orderItemsPending } = useQuery({
    queryKey: ["order-items", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_items").select("*").eq("order_id", id!).order("position");
      if (error) throw error;
      return data as OrderItemData[];
    },
    enabled: !!id && !!user && !!order?.id,
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

  const { data: documentiCommessa = [] } = useQuery<OrderDocumentSummary[]>({
    queryKey: ["order-documents-summary", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_attachments")
        .select("id, file_name, file_url, file_type, file_size, visible_to_customer, created_at")
        .eq("order_id", id!)
        .order("created_at", { ascending: false })
        .limit(8);
      if (error) throw error;
      return (data ?? []) as OrderDocumentSummary[];
    },
    enabled: !!id && !!user,
    staleTime: 120_000,
    gcTime: 10 * 60 * 1000,
  });

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

  // Fetch salespeople for PDF
  const { data: pdfSalespeople = [] } = useQuery({
    queryKey: ["order-salespeople-pdf", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_salespeople")
        .select("*, salesperson:salespeople(first_name, last_name)")
        .eq("order_id", id!);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!id && !!user,
    staleTime: 120_000,
  });

  // Fetch purchase orders for PDF
  const { data: pdfPurchaseOrders = [] } = useQuery({
    queryKey: ["linked-purchase-orders-pdf", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_orders")
        .select("id, oda_number, status, total, suppliers(name)")
        .eq("order_id", id!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!id && !!user,
    staleTime: 120_000,
  });

  // Fetch campo assignments for PDF
  const { data: pdfCampoAssignments = [] } = useQuery({
    queryKey: ["order-campo-assignments-pdf", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_campo_assignments")
        .select("*, user:profiles(first_name, last_name), subappaltatore:external_teams(name)")
        .eq("order_id", id!);
      if (error) throw error;
      return ((data ?? []) as Array<{ subappaltatore?: { name?: string } | null }>).map((d) => ({
        ...d,
        subappaltatore: d.subappaltatore ? { nome: d.subappaltatore.name } : null,
      }));
    },
    enabled: !!id && !!user,
    staleTime: 120_000,
  });

  // Fetch giornale lavori for PDF
  const { data: pdfGiornaleLavori = [] } = useQuery({
    queryKey: ["giornale-lavori-pdf", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("giornale_lavori")
        .select("*, giornale_foto(id, url, caption)")
        .eq("order_id", id!)
        .order("data_lavori", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!id && !!user,
    staleTime: 120_000,
  });

  // Fetch varianti for PDF (both OdV and varianti_cliente)
  const { data: pdfVarianti = [] } = useQuery({
    queryKey: ["varianti-pdf", id],
    queryFn: async () => {
      const [odv, vc] = await Promise.all([
        supabase.from("ordini_variazione").select("*").eq("order_id", id!).order("created_at", { ascending: false }),
        supabase.from("varianti_cliente").select("*").eq("order_id", id!).order("created_at", { ascending: false }),
      ]);
      return [...(odv.data ?? []), ...(vc.data ?? [])];
    },
    enabled: !!id && !!user,
    staleTime: 120_000,
  });

  // Fetch diary events + messages for PDF
  const { data: pdfDiaryEvents = [] } = useQuery({
    queryKey: ["diary-events-pdf", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_events")
        .select("id, event_type, payload, actor_name, created_at")
        .eq("order_id", id!)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!id && !!user,
    staleTime: 120_000,
  });

  const { data: pdfDiaryMessages = [] } = useQuery({
    queryKey: ["diary-messages-pdf", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_messages")
        .select("id, channel, direction, subject, body, to_name, status, sent_by_name, created_at")
        .eq("order_id", id!)
        .order("created_at", { ascending: false })
        .limit(100);
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
      const { error } = await supabase
        .from("orders")
        .update({ internal_notes: notes || null })
        .eq("id", id!)
        .eq("company_id", effectiveCompany!.id);
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
    mutationFn: () => {
      const companyId = effectiveCompany?.id;
      if (!companyId) throw new Error("Nessuna azienda selezionata.");
      return deleteOrderCascading(id!, companyId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.calendarOrders.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.margin.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.breakEven.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.cruscotto.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.cashflow.all });
      toast.success("Commessa eliminata");
      navigate("/azienda/ordini");
    },
    onError: (error) => {
      toast.error("Errore nell'eliminazione della commessa.", {
        description: error instanceof Error ? error.message : undefined,
      });
    },
  });

  // Duplicate order mutation
  const duplicateOrderMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("duplicate-order", {
        body: { source_order_id: id },
      });
      if (error) {
        let errBody: { error?: string; message?: string } | null = null;
        try {
          const ctx = (error as { context?: unknown }).context;
          if (ctx instanceof Response) {
            errBody = (await ctx.json()) as { error?: string; message?: string };
          }
        } catch {
          errBody = null;
        }
        throw new Error(errBody?.error ?? errBody?.message ?? error.message ?? "Errore");
      }
      if (data?.error) throw new Error(data.error);
      return data as { id: string; order_code: string };
    },
    onSuccess: (data) => {
      setDuplicateDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.all });
      toast.success(`Commessa duplicata con codice ${data.order_code}`);
      navigate(`/azienda/ordini/${data.id}`);
    },
    onError: () => {
      toast.error("Errore nella duplicazione della commessa.");
    },
  });

  // Payment toggle mutation — unified: always writes to order_installments.
  // For legacy orders without DB installments, auto-migrates them on first toggle.
  const updatePaymentMutation = useMutation({
    mutationFn: async ({ installment, paid }: { installment: Installment; paid: boolean }) => {
      // Data LOCALE (en-CA → YYYY-MM-DD): evita di registrare il pagamento al
      // giorno UTC (a notte fonda, in Italia, sarebbe ieri).
      const today = new Date().toLocaleDateString("en-CA");

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
        const { count } = await supabase
          .from("order_installments" as never)
          .select("id", { count: "exact", head: true })
          .eq("order_id", id!);
        if (count && count > 0) {
          // Installments were already migrated (race condition / double-click).
          // Reload and update the target one by position+type.
          const { data: existing } = await supabase
            .from("order_installments" as never)
            .select("id, position, type")
            .eq("order_id", id!);
          const match = ((existing || []) as Array<{ id: string; position: number; type: string }>).find(
            (r) => r.position === installment.position && r.type === installment.type
          );
          if (match) {
            const { error } = await supabase
              .from("order_installments" as never)
              .update({ is_paid: paid, paid_date: paid ? today : null } as never)
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
          const { error } = await supabase.from("order_installments" as never).insert(rows as never);
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
    onError: (error) => {
      toast.error("Errore", {
        description: error instanceof Error ? error.message : "Impossibile aggiornare lo stato del pagamento.",
      });
    },
  });

  const handleInstallmentPaidToggle = (installment: Installment, paid: boolean) => {
    updatePaymentMutation.mutate({ installment, paid });
  };

  // SAL semplificato: data incasso/prevista modificabile direttamente dal
  // dettaglio (solo rate già su DB — id presente). Scrittura immediata.
  const updateInstallmentDateMutation = useMutation({
    mutationFn: async ({ installment, field, date }: { installment: Installment; field: 'paid_date' | 'expected_date'; date?: Date }) => {
      if (!installment.id) throw new Error("Rata non ancora salvata");
      // en-CA = YYYY-MM-DD locale (mai toISOString: bug UTC serale)
      const value = date ? date.toLocaleDateString('en-CA') : null;
      const { error } = await supabase
        .from("order_installments")
        .update({ [field]: value })
        .eq("id", installment.id);
      if (error) throw error;
    },
    onSuccess: (_, { field }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.installments(id) });
      toast.success(field === 'paid_date' ? "Data incasso aggiornata" : "Data prevista aggiornata");
    },
    onError: (error) => {
      toast.error("Errore", {
        description: error instanceof Error ? error.message : "Impossibile aggiornare la data.",
      });
    },
  });

  const handleInstallmentDateChange = (installment: Installment, field: 'paid_date' | 'expected_date', date?: Date) => {
    updateInstallmentDateMutation.mutate({ installment, field, date });
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
        // v8.6.35 — Tracking & ODA
        delivery_date: item.delivery_date || null,
        // Magazzino: persiste il legame con la giacenza, altrimenti un articolo
        // "Da Giacenza" salvato dalla commessa torna silenziosamente "Da Fornitore".
        stock_item_id: item.stock_item_id || null,
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
    onError: (error) => {
      toast.error("Errore", {
        description: error instanceof Error ? error.message : "Errore nell'aggiornamento dell'articolo.",
      });
    },
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
        // v8.6.35 — Tracking & ODA
        delivery_date: item.delivery_date || null,
        // Magazzino: persiste il legame con la giacenza (vedi updateSingleItemMutation).
        stock_item_id: item.stock_item_id || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["order-items", id] });
      queryClient.invalidateQueries({ queryKey: queryKeys.warehouse.itemsAll });
      queryClient.invalidateQueries({ queryKey: queryKeys.warehouse.badgeCountsAll });
      toast.success("Articolo aggiunto");
    },
    onError: (error) => {
      toast.error("Errore", {
        description: error instanceof Error ? error.message : "Impossibile aggiungere l'articolo.",
      });
    },
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
    // v8.6.35 — Tracking
    delivery_date: item.delivery_date || undefined,
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
    return getOrderAlerts(order, displayItems, displayInstallments);
  }, [order, displayItems, displayInstallments]);

  const handleAttachmentsRefresh = () => { refetchAttachments(); };

  const linkedDocumentsCount = fattureCollegate.length + documentiCommessa.length;

  const formatFiscalType = (tipo: string) => {
    const labels: Record<string, string> = {
      fattura: "Fattura",
      fattura_pa: "Fattura PA",
      nota_credito: "Nota credito",
      nota_debito: "Nota debito",
      ddt: "DDT",
      proforma: "Proforma",
      preventivo: "Preventivo",
      parcella: "Parcella",
      fattura_accompagnatoria: "Fattura accompagnatoria",
    };
    return labels[tipo] ?? tipo;
  };

  const formatAttachmentType = (documento: OrderDocumentSummary) => {
    const name = documento.file_name.toLowerCase();
    if (name.includes("collaudo") || name.includes("verbale")) return "Collaudo";
    if (name.includes("contratto")) return "Contratto";
    if (name.includes("ddt")) return "DDT";
    if (documento.file_type.includes("image")) return "Foto";
    return "Documento";
  };

  const handleDownloadFiscalDocument = async (documento: LinkedFiscalDocument) => {
    try {
      await downloadNativePDF(documento.id, documento.numero || "documento");
      toast.success("Documento scaricato");
    } catch (error) {
      toast.error("Download non riuscito", {
        description: error instanceof Error ? error.message : "Apri il documento e riprova dal dettaglio.",
      });
    }
  };

  const handleOpenOrderDocument = async (documento: OrderDocumentSummary) => {
    const { data, error } = await supabase.storage
      .from("order-attachments")
      .createSignedUrl(documento.file_url, 3600);

    if (error || !data?.signedUrl) {
      toast.error("Documento non scaricabile", {
        description: "Il file potrebbe essere stato spostato o eliminato.",
      });
      return;
    }

    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const handleDownloadPDF = useCallback(() => {
    if (!order) return;
    downloadPDF({
      order,
      items: orderItems,
      laborEmployees: pdfLaborEmployees,
      laborTeams: pdfLaborTeams,
      salList: pdfSalList,
      salespeople: pdfSalespeople,
      purchaseOrders: pdfPurchaseOrders,
      campoAssignments: pdfCampoAssignments,
      installments: displayInstallments,
      giornaleLavori: pdfGiornaleLavori,
      varianti: pdfVarianti,
      diaryEvents: pdfDiaryEvents,
      diaryMessages: pdfDiaryMessages,
      statuses,
      companyName: effectiveCompany?.name,
    });
  }, [order, orderItems, pdfLaborEmployees, pdfLaborTeams, pdfSalList, pdfSalespeople, pdfPurchaseOrders, pdfCampoAssignments, displayInstallments, pdfGiornaleLavori, pdfVarianti, pdfDiaryEvents, pdfDiaryMessages, statuses, effectiveCompany, downloadPDF]);

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
        <p className="text-muted-foreground">Commessa non trovata</p>
        <Button className="mt-4" onClick={() => navigate("/azienda/ordini")}>Torna alle commesse</Button>
      </div>
    );
  }

  const collectedAmount = calculateCollectedNetFromInstallments({
    installments: displayInstallments,
    totalAmount: order.total_amount,
    vatRate: order.vat_rate || 22,
    financingCost: order.financing_cost ?? 0,
  });

  return (
    <div className="min-h-screen bg-slate-50">
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
        orderType={order.order_type}
        onDuplica={() => setDuplicateDialogOpen(true)}
        onModifica={() => navigate(`/azienda/ordini/${id}/modifica`)}
        onNuovoSAL={() => {
          // Su mobile: cambia tab Tabs a "sal" + scroll in cima
          // Su desktop: scroll to #section-sal (desktop layout)
          const isMobile = typeof window !== "undefined" && window.matchMedia("(max-width: 639px)").matches;
          if (isMobile) {
            setMobileTab("sal");
            // Aspetta che il tab si renderizzi prima dello scroll
            setTimeout(() => {
              const mobileSalContent = document.querySelector('[data-state="active"][data-radix-collection-item][role="tabpanel"], [role="tabpanel"][data-state="active"]');
              const target = mobileSalContent || document.querySelector('[role="tablist"]');
              if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 50);
          } else {
            const salEl = document.getElementById('section-sal');
            if (salEl) salEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }}
        onElimina={() => setDeleteConfirmOpen(true)}
        onDownloadPDF={handleDownloadPDF}
        isGeneratingPDF={isGeneratingPDF}
        canEdit={permissions.canEditOrders}
        canDelete={permissions.canEditOrders}
      />

      {/* ── Chiedi a Silvio (contestuale alla commessa) ───────── */}
      <div className="bg-white border-b border-gray-100 px-3 sm:px-6 py-2 flex justify-end">
        <ChiediASilvio
          ask={`Analizza la commessa ${order.order_code ? `"${order.order_code}" ` : ""}${
            order.customer ? `del cliente ${order.customer.first_name} ${order.customer.last_name} ` : ""
          }(${order.description || "senza descrizione"}): stato avanzamento, costi vs preventivo, scadenze, margine e criticità. Cosa devo sapere e quali sono le prossime mosse?`}
        />
      </div>

      {/* ── Status strip ──────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-100 px-3 sm:px-6 py-3">
        <OrdineStatusStrip
          statuses={statuses}
          currentStatusId={order.current_status_id}
          statusHistory={progressHistory}
          onStatusChange={handleStatusChange}
        />
      </div>

      <div className="px-3 sm:px-6 py-4 sm:py-6 space-y-4 sm:space-y-6">
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

        {/* ── Card commessa: ognuna isolata in ErrorBoundary (fallback vuoto) così
               un errore in una NON può buttare giù il dettaglio commessa. ── */}
        {/* Conto economico: riepilogo a colpo d'occhio, sempre in cima */}
        <ErrorBoundary fallback={<></>}>
          <OrderEconomicsSummary
            orderId={id!}
            totalAmount={order.total_amount}
            vatRate={order.vat_rate || 22}
            items={economicsItems}
            collectedAmount={collectedAmount}
            itemsLoading={orderItemsPending}
          />
        </ErrorBoundary>

        {/* Sopralluoghi collegati (rilievo misure) */}
        <ErrorBoundary fallback={<></>}>
          <OrderSurveysCard orderId={id!} quoteId={order.quote_id} quoteNumber={order.quote_number} />
        </ErrorBoundary>

        {/* Controllo misure: solo se ci sono articoli su misura (altrimenti null) */}
        <ErrorBoundary fallback={<></>}>
          <OrderMeasureControl orderId={id!} />
        </ErrorBoundary>

        {/* Ordini fornitore (bridge procurement): bozza ODA da misure confermate */}
        <ErrorBoundary fallback={<></>}>
          <OrderSupplierOrders orderId={id!} />
        </ErrorBoundary>

        {/* ── MOBILE: tab layout ──────────────────────────────── */}
        <div className="sm:hidden">
          <Tabs value={mobileTab} onValueChange={setMobileTab}>
            <TabsList className="w-full flex overflow-x-auto scrollbar-hide h-auto gap-0.5 bg-white border border-slate-200 rounded-lg p-1">
              <TabsTrigger value="stato" className="text-xs py-2 px-3 shrink-0 data-[state=active]:bg-gradient-to-br data-[state=active]:from-orange-500 data-[state=active]:to-amber-400 data-[state=active]:text-white data-[state=active]:shadow-sm">Stato</TabsTrigger>
              <TabsTrigger value="articoli" className="text-xs py-2 px-3 shrink-0 data-[state=active]:bg-gradient-to-br data-[state=active]:from-orange-500 data-[state=active]:to-amber-400 data-[state=active]:text-white data-[state=active]:shadow-sm">Articoli</TabsTrigger>
              <TabsTrigger value="finanza" className="text-xs py-2 px-3 shrink-0 data-[state=active]:bg-gradient-to-br data-[state=active]:from-orange-500 data-[state=active]:to-amber-400 data-[state=active]:text-white data-[state=active]:shadow-sm">Finanza</TabsTrigger>
              <TabsTrigger value="sal" className="text-xs py-2 px-3 shrink-0 data-[state=active]:bg-gradient-to-br data-[state=active]:from-orange-500 data-[state=active]:to-amber-400 data-[state=active]:text-white data-[state=active]:shadow-sm">SAL</TabsTrigger>
              <TabsTrigger value="cantiere" className="text-xs py-2 px-3 shrink-0 data-[state=active]:bg-gradient-to-br data-[state=active]:from-orange-500 data-[state=active]:to-amber-400 data-[state=active]:text-white data-[state=active]:shadow-sm">Cantiere</TabsTrigger>
              <TabsTrigger value="campo" className="text-xs py-2 px-3 shrink-0 data-[state=active]:bg-gradient-to-br data-[state=active]:from-orange-500 data-[state=active]:to-amber-400 data-[state=active]:text-white data-[state=active]:shadow-sm">
                <div className="flex items-center gap-1">
                  <HardHat className="w-3 h-3" />
                  Campo
                </div>
              </TabsTrigger>
              <TabsTrigger value="altro" className="text-xs py-2 px-3 shrink-0 data-[state=active]:bg-gradient-to-br data-[state=active]:from-orange-500 data-[state=active]:to-amber-400 data-[state=active]:text-white data-[state=active]:shadow-sm">Altro</TabsTrigger>
              <TabsTrigger value="ritenute" className="text-xs py-2 px-3 shrink-0 data-[state=active]:bg-gradient-to-br data-[state=active]:from-orange-500 data-[state=active]:to-amber-400 data-[state=active]:text-white data-[state=active]:shadow-sm">Ritenute</TabsTrigger>
            </TabsList>

            {/* Tab 1: Stato + Cliente + Date */}
            <TabsContent value="stato" className="space-y-4 mt-4">
              {order.order_type === "appaltatore_lavoro" && (
                <OrdineAppaltatoreLavoroCard
                  workAddress={order.work_address}
                  workDescription={order.work_description}
                  materialsLocation={order.materials_location}
                  workStartDate={order.work_start_date}
                  workEndDate={order.work_end_date}
                />
              )}
              <OrdineCliente customer={order.customer} />
              <QuoteCard title="Storico Stati">
                {statusHistory.length === 0 ? (
                  <p className="text-slate-500 text-sm">Nessuno storico</p>
                ) : (
                  <div className="space-y-3">
                    {statusHistory.map((entry) => (
                      <div
                        key={entry.id}
                        className="flex items-center justify-between border-b border-slate-100 pb-2 last:border-0 last:pb-0"
                      >
                        <div className="flex items-center gap-2">
                          <div
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: entry.status.color }}
                          />
                          <span className="text-sm font-medium text-slate-900">{entry.status.name}</span>
                        </div>
                        <span className="text-xs text-slate-500">
                          {formatDateTime(entry.changed_at)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </QuoteCard>
              <OrdineTempistiche
                orderId={order.id}
                expectedDate={order.expected_date}
                warehouseArrivalDate={order.warehouse_arrival_date}
                workStartDate={order.work_start_date}
                workEndDate={order.work_end_date}
                orderCode={order.order_code}
                orderDescription={order.description}
                defaultAddress={order.work_address || order.customer?.address}
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
              <OrderSerialsTrackingCard orderId={id!} orderItems={orderItems} />
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
                onInstallmentDateChange={handleInstallmentDateChange}
              />
              {/* Fatturazione e documenti */}
              <QuoteCard
                title={
                  <span className="flex items-center gap-2">
                    Fatturazione e Documenti
                    {linkedDocumentsCount > 0 && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700">{linkedDocumentsCount}</span>
                    )}
                  </span>
                }
                icon={<Receipt className="h-4 w-4" />}
              >
                <div className="space-y-3">
                  {fattureCollegate.length > 0 ? (
                    <div className="space-y-2">
                      {fattureCollegate.map((f: LinkedFiscalDocument) => (
                        <div
                          key={f.id}
                          className="flex items-center justify-between gap-2 p-2 rounded-md border bg-white text-sm"
                        >
                          <Link to={`/azienda/documenti/${f.id}`} className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium truncate">{f.numero}</span>
                              <span className="text-[11px] text-muted-foreground">{formatFiscalType(f.tipo)}</span>
                            </div>
                            <Badge
                              variant="outline"
                              className={`mt-1 text-xs ${
                                f.stato === "pagata" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                                f.stato === "emessa" || f.stato === "consegnata" ? "bg-blue-50 text-blue-700 border-blue-200" :
                                f.stato === "rifiutata" || f.stato === "scaduta" ? "bg-red-50 text-red-700 border-red-200" :
                                ""
                              }`}
                            >
                              {f.stato === "bozza" ? "Bozza" :
                               f.stato === "emessa" ? "Emessa" :
                               f.stato === "pagata" ? "Pagata" :
                               f.stato === "consegnata" ? "Consegnata" :
                               f.stato === "inviata_sdi" ? "Inviata SDI" :
                               f.stato === "rifiutata" ? "Rifiutata" :
                               f.stato === "scaduta" ? "Scaduta" :
                               f.stato}
                            </Badge>
                          </Link>
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground whitespace-nowrap">
                              {formatCurrency(f.totale_da_pagare)}
                            </span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              aria-label={`Scarica ${f.numero}`}
                              onClick={() => handleDownloadFiscalDocument(f)}
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-2">
                      Nessun documento fiscale collegato
                    </p>
                  )}
                  {documentiCommessa.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Allegati commessa
                      </div>
                      {documentiCommessa.map((documento) => (
                        <button
                          key={documento.id}
                          type="button"
                          onClick={() => handleOpenOrderDocument(documento)}
                          className="flex w-full items-center justify-between gap-2 rounded-md border p-2 text-left text-sm transition-colors hover:bg-accent"
                        >
                          <div className="min-w-0">
                            <div className="font-medium truncate">{documento.file_name}</div>
                            <div className="text-xs text-muted-foreground">{formatAttachmentType(documento)}</div>
                          </div>
                          <Download className="h-4 w-4 shrink-0 text-muted-foreground" />
                        </button>
                      ))}
                    </div>
                  )}
                  {/* 2 colonne su mobile: con 4, "Proforma"/"N. Credito" (whitespace-nowrap) strabordavano a 375px */}
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (isNativeBilling) {
                          setCreaFatturaOpen(true);
                        } else {
                          toast.info("Per creare fatture dal sistema, attiva la fatturazione nativa nelle Impostazioni > Fatturazione.");
                        }
                      }}
                    >
                      <Receipt className="h-3.5 w-3.5 mr-1" />
                      Fattura
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (isNativeBilling) {
                          setCreaProformaOpen(true);
                        } else {
                          toast.info("Per creare proforma dal sistema, attiva la fatturazione nativa nelle Impostazioni > Fatturazione.");
                        }
                      }}
                    >
                      <FileText className="h-3.5 w-3.5 mr-1" />
                      Proforma
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (isNativeBilling) {
                          setCreaDDTOpen(true);
                        } else {
                          toast.info("Per creare DDT dal sistema, attiva la fatturazione nativa nelle Impostazioni > Fatturazione.");
                        }
                      }}
                    >
                      <Truck className="h-3.5 w-3.5 mr-1" />
                      DDT
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (isNativeBilling) {
                          setCreaNotaCreditoOpen(true);
                        } else {
                          toast.info("Per creare note di credito dal sistema, attiva la fatturazione nativa nelle Impostazioni > Fatturazione.");
                        }
                      }}
                    >
                      <FileWarning className="h-3.5 w-3.5 mr-1" />
                      N. Credito
                    </Button>
                  </div>
                </div>
              </QuoteCard>
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

            {/* Tab Campo: rapportini + whatsapp */}
            <TabsContent value="campo" className="space-y-4 mt-4">
              <OrdineRapportiniCampo orderId={id!} />
              <WhatsAppActivityFeed cantiereId={id!} />
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
              <OrderLaborCosts orderId={id!} editable={true} />
              <OrderErrors orderId={id!} />
              <LinkedTasks orderId={id} category="ordini" />
              <LinkedAppointments orderId={id!} />
              <LinkedPurchaseOrdersCard
                orderId={id!}
                orderCode={order.order_code}
                items={displayItems.map((i) => ({
                  id: i.id,
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
              {effectiveCompany?.id && id && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Sparkles className="h-4 w-4 text-violet-600" />
                      Documenti AI
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Genera contratti d'appalto con l'AI a partire dai dati di questo ordine.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-wrap gap-2">
                    <ContrattoAIDialog orderId={id} companyId={effectiveCompany.id} />
                    <AllocazioneOperaiAIDialog orderId={id} companyId={effectiveCompany.id} />
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* Tab 7: Ritenute di Garanzia */}
            <TabsContent value="ritenute" className="space-y-4 mt-4">
              <RitenuteTab orderId={id!} />
            </TabsContent>
          </Tabs>
        </div>

        {/* ── DESKTOP: 2-column layout ─────────────────────────── */}
        <div className="hidden sm:grid gap-6 lg:grid-cols-3">
          {/* ── Left Column (2/3) ──────────────────────────────── */}
          <div className="lg:col-span-2 space-y-6">
            {/* Modulo Appaltatori — pannello dedicato per lavori di sola
                manodopera. Non viene montato per ordini cliente standard. */}
            {order.order_type === "appaltatore_lavoro" && (
              <OrdineAppaltatoreLavoroCard
                workAddress={order.work_address}
                workDescription={order.work_description}
                materialsLocation={order.materials_location}
                workStartDate={order.work_start_date}
                workEndDate={order.work_end_date}
              />
            )}

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

            {/* Economico (dettaglio) — esteso: bilancia l'altezza con la lunga
                sidebar (evita lo spazio vuoto in basso). Il sommario è in cima. */}
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
              onInstallmentDateChange={handleInstallmentDateChange}
            />
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
              orderCode={order.order_code}
              orderDescription={order.description}
              defaultAddress={order.work_address || order.customer?.address}
            />

            {/* Storico stati */}
            <QuoteCard title="Storico Stati">
              {statusHistory.length === 0 ? (
                <p className="text-sm text-slate-500">
                  Nessuno storico disponibile
                </p>
              ) : (
                <div className="space-y-3">
                  {statusHistory.map((entry) => (
                    <div
                      key={entry.id}
                      className="flex items-center justify-between border-b border-slate-100 pb-2 last:border-0 last:pb-0"
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: entry.status.color }}
                        />
                        <span className="text-sm font-medium text-slate-900">{entry.status.name}</span>
                      </div>
                      <span className="text-xs text-slate-500">
                        {formatDateTime(entry.changed_at)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </QuoteCard>

            {/* Fatturazione e documenti */}
            <QuoteCard
              title={
                <span className="flex items-center gap-2">
                  Fatturazione e Documenti
                  {linkedDocumentsCount > 0 && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700">{linkedDocumentsCount}</span>
                  )}
                </span>
              }
              icon={<Receipt className="h-4 w-4" />}
            >
              <div className="space-y-3">
                {fattureCollegate.length > 0 ? (
                  <div className="space-y-2">
                    {fattureCollegate.map((f: LinkedFiscalDocument) => (
                      <div
                        key={f.id}
                        className="flex items-center justify-between gap-2 p-2 rounded-md border bg-white text-sm"
                      >
                        <Link to={`/azienda/documenti/${f.id}`} className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium truncate">{f.numero}</span>
                            <span className="text-[11px] text-muted-foreground">{formatFiscalType(f.tipo)}</span>
                          </div>
                          <Badge variant="outline" className="text-xs">
                            {f.stato}
                          </Badge>
                        </Link>
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground whitespace-nowrap">
                            {formatCurrency(f.totale_da_pagare)}
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            aria-label={`Scarica ${f.numero}`}
                            onClick={() => handleDownloadFiscalDocument(f)}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                    <div className="pt-1 border-t flex justify-between text-sm">
                      <span className="text-muted-foreground">Totale fatturato</span>
                      <span className="font-medium">
                        {formatCurrency(
                          fattureCollegate.reduce(
                            (s: number, f: LinkedFiscalDocument) => s + (f.totale_da_pagare ?? 0),
                            0
                          )
                        )}
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-2">
                    Nessun documento fiscale collegato
                  </p>
                )}
                {documentiCommessa.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Allegati commessa
                    </div>
                    {documentiCommessa.map((documento) => (
                      <button
                        key={documento.id}
                        type="button"
                        onClick={() => handleOpenOrderDocument(documento)}
                        className="flex w-full items-center justify-between gap-2 rounded-md border p-2 text-left text-sm transition-colors hover:bg-accent"
                      >
                        <div className="min-w-0">
                          <div className="font-medium truncate">{documento.file_name}</div>
                          <div className="text-xs text-muted-foreground">{formatAttachmentType(documento)}</div>
                        </div>
                        <Download className="h-4 w-4 shrink-0 text-muted-foreground" />
                      </button>
                    ))}
                  </div>
                )}
                <div className="grid grid-cols-4 gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (isNativeBilling) {
                        setCreaFatturaOpen(true);
                      } else {
                        toast.info("Per creare fatture dal sistema, attiva la fatturazione nativa nelle Impostazioni > Fatturazione.");
                      }
                    }}
                  >
                    <Receipt className="h-3.5 w-3.5 mr-1" />
                    Fattura
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (isNativeBilling) {
                        setCreaProformaOpen(true);
                      } else {
                        toast.info("Per creare proforma dal sistema, attiva la fatturazione nativa nelle Impostazioni > Fatturazione.");
                      }
                    }}
                  >
                    <FileText className="h-3.5 w-3.5 mr-1" />
                    Proforma
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (isNativeBilling) {
                        setCreaDDTOpen(true);
                      } else {
                        toast.info("Per creare DDT dal sistema, attiva la fatturazione nativa nelle Impostazioni > Fatturazione.");
                      }
                    }}
                  >
                    <Truck className="h-3.5 w-3.5 mr-1" />
                    DDT
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (isNativeBilling) {
                        setCreaNotaCreditoOpen(true);
                      } else {
                        toast.info("Per creare note di credito dal sistema, attiva la fatturazione nativa nelle Impostazioni > Fatturazione.");
                      }
                    }}
                  >
                    <FileWarning className="h-3.5 w-3.5 mr-1" />
                    N. Credito
                  </Button>
                </div>
              </div>
            </QuoteCard>

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
            <OrderLaborCosts orderId={id!} editable={true} />

            {/* Errori */}
            <OrderErrors orderId={id!} />

            {/* Ordini di acquisto */}
            <LinkedPurchaseOrdersCard
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

            {/* Ritenute di Garanzia */}
            <RitenuteTab orderId={id!} />
          </div>
        </div>

        {/* ── Sezioni secondarie a tutta larghezza (solo desktop), sotto la griglia:
            riempiono la larghezza → niente spazio vuoto a lato della sidebar. ── */}
        <div className="hidden sm:block space-y-6">
          <div id="section-sal">
            {companyId && (
              <OrdineSAL
                orderId={id!}
                companyId={companyId}
                orderTotalAmount={order.total_amount ?? undefined}
              />
            )}
          </div>
          {effectiveCompany?.id && (
            <OrdineVariazione orderId={id!} companyId={effectiveCompany.id} />
          )}
          {effectiveCompany?.id && (
            <div className="space-y-2">
              <div>
                <h2 className="text-base font-semibold">Timeline Cantiere</h2>
                <p className="text-sm text-muted-foreground">
                  Tutti gli aggiornamenti: stati, lavori, SAL e varianti.
                </p>
              </div>
              <TimelineCantiere orderId={id!} companyId={effectiveCompany.id} adminView={true} />
            </div>
          )}
          {effectiveCompany?.id && (
            <>
              <OrdineRapportiniCampo orderId={id!} />
              <WhatsAppActivityFeed cantiereId={id!} />
            </>
          )}
        </div>
      </div>

      {/* ── Dialogs ──────────────────────────────────────────── */}

      {/* Delete confirm (triggered by OrdineDetailHeader) */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare la commessa?</AlertDialogTitle>
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
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Conferma cambio stato</DialogTitle>
            <DialogDescription>
              Vuoi cambiare lo stato della commessa a "{statusChangeDialog.targetStatusName}"?
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
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Duplica commessa</DialogTitle>
            <DialogDescription>
              Duplicare la commessa {order.order_code ? `#${order.order_code}` : ""}? La nuova commessa
              verrà creata come bozza senza pagamenti incassati.
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

      {/* Crea Fattura Dialog — smart prefill from order installments */}
      <CreaFatturaDialog
        open={creaFatturaOpen}
        onOpenChange={setCreaFatturaOpen}
        orderId={id!}
        orderCode={order.order_code}
        orderDescription={order.description}
        totalAmount={order.total_amount}
        vatRate={order.vat_rate ?? 22}
        customerId={order.customer?.id ?? null}
        customerName={
          order.customer
            ? `${order.customer.first_name} ${order.customer.last_name}`
            : "Cliente sconosciuto"
        }
        installments={displayInstallments}
      />

      {/* Crea DDT Dialog — prefill from order items */}
      <CreaDDTDialog
        open={creaDDTOpen}
        onOpenChange={setCreaDDTOpen}
        orderId={id!}
        orderCode={order.order_code}
        orderDescription={order.description}
        totalAmount={order.total_amount}
        vatRate={order.vat_rate ?? 22}
        customerId={order.customer?.id ?? null}
        customerName={
          order.customer
            ? `${order.customer.first_name} ${order.customer.last_name}`
            : "Cliente sconosciuto"
        }
      />

      {/* Crea Proforma Dialog — prefill from order items */}
      <CreaProformaDialog
        open={creaProformaOpen}
        onOpenChange={setCreaProformaOpen}
        orderId={id!}
        orderCode={order.order_code}
        orderDescription={order.description}
        totalAmount={order.total_amount}
        vatRate={order.vat_rate ?? 22}
        customerId={order.customer?.id ?? null}
        customerName={
          order.customer
            ? `${order.customer.first_name} ${order.customer.last_name}`
            : "Cliente sconosciuto"
        }
      />

      {/* Crea Nota di Credito Dialog — prefill from order items */}
      <CreaNotaCreditoDialog
        open={creaNotaCreditoOpen}
        onOpenChange={setCreaNotaCreditoOpen}
        orderId={id!}
        orderCode={order.order_code}
        orderDescription={order.description}
        totalAmount={order.total_amount}
        vatRate={order.vat_rate ?? 22}
        customerId={order.customer?.id ?? null}
        customerName={
          order.customer
            ? `${order.customer.first_name} ${order.customer.last_name}`
            : "Cliente sconosciuto"
        }
      />
    </div>
  );
}

export default function OrderDetail() {
  return (
    <ErrorBoundary title="Errore nel dettaglio commessa">
      <OrderDetailInner />
    </ErrorBoundary>
  );
}
