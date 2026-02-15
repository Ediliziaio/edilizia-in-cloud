import { useState, useEffect, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CalendarIcon, Plus, Trash2, AlertTriangle } from "lucide-react";
import { useOrderDraft } from "@/hooks/useOrderDraft";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { CreateCustomerDialog } from "@/components/orders/CreateCustomerDialog";
import { OrderItemsList, OrderItem } from "@/components/orders/OrderItemsList";
import { FinancialSummary, PaymentType } from "@/components/orders/FinancialSummary";
import { OrderAttachments } from "@/components/orders/OrderAttachments";
import { SalespersonSelect } from "@/components/salespeople/SalespersonSelect";

interface Customer {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
}

interface OrderData {
  id: string;
  customer_id: string;
  order_code: string | null;
  description: string;
  total_amount: number;
  deposit_amount: number;
  deposit_2_amount: number;
  financing_amount: number;
  payment_type: string;
  balance_amount: number;
  expected_date: string | null;
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
}

export default function EditOrder() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, effectiveCompany } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [customerId, setCustomerId] = useState("");
  const [orderCode, setOrderCode] = useState("");
  const [description, setDescription] = useState("");
  const [expectedDate, setExpectedDate] = useState<Date | undefined>();
  const [internalNotes, setInternalNotes] = useState("");

  // Date per il cliente
  const [warehouseArrivalDate, setWarehouseArrivalDate] = useState<Date | undefined>();
  const [workStartDate, setWorkStartDate] = useState<Date | undefined>();
  const [workEndDate, setWorkEndDate] = useState<Date | undefined>();

  // Financial state
  const [paymentType, setPaymentType] = useState<PaymentType>('standard');
  const [totalAmount, setTotalAmount] = useState("");
  const [depositAmount, setDepositAmount] = useState("");
  const [deposit2Amount, setDeposit2Amount] = useState("");
  const [financingAmount, setFinancingAmount] = useState("");
  const [vatRate, setVatRate] = useState("22");

  // Payment status state
  const [depositPaid, setDepositPaid] = useState(false);
  const [depositPaidDate, setDepositPaidDate] = useState<Date | undefined>();
  const [depositExpectedDate, setDepositExpectedDate] = useState<Date | undefined>();
  const [deposit2Paid, setDeposit2Paid] = useState(false);
  const [deposit2PaidDate, setDeposit2PaidDate] = useState<Date | undefined>();
  const [deposit2ExpectedDate, setDeposit2ExpectedDate] = useState<Date | undefined>();
  const [balancePaid, setBalancePaid] = useState(false);
  const [balancePaidDate, setBalancePaidDate] = useState<Date | undefined>();
  const [balanceExpectedDate, setBalanceExpectedDate] = useState<Date | undefined>();

  // Order items state
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);

  // Customer creation dialog
  const [showCreateCustomer, setShowCreateCustomer] = useState(false);

  // Salesperson state
  const [salespersonId, setSalespersonId] = useState("");
  const [salespersonData, setSalespersonData] = useState<{
    commission_type: string;
    commission_value: number;
  } | null>(null);
  const [existingSalespersonRecordId, setExistingSalespersonRecordId] = useState<string | null>(null);

  // Draft auto-save for edit
  const { loadDraft, saveDraft, clearDraft, draftRestored, setDraftRestored, dateToIso, isoToDate } = useOrderDraft(effectiveCompany?.id, id);
  const [dataLoaded, setDataLoaded] = useState(false);

  // Calculate balance
  const total = parseFloat(totalAmount) || 0;
  const deposit = parseFloat(depositAmount) || 0;
  const deposit2 = parseFloat(deposit2Amount) || 0;
  const vat = parseFloat(vatRate) || 22;
  const totalWithVat = total * (1 + vat / 100);
  const balance = paymentType === 'standard' ? Math.max(0, totalWithVat - deposit - deposit2) : 0;

  // Fetch order data
  const { data: order, isLoading: orderLoading } = useQuery({
    queryKey: ["order", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .eq("id", id!)
        .single();

      if (error) throw error;
      return data as OrderData;
    },
    enabled: !!id && !!user,
  });

  // Fetch order items
  const { data: existingItems = [] } = useQuery({
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

  // Fetch existing salesperson for this order
  const { data: existingSalesperson } = useQuery({
    queryKey: ["order-salesperson", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_salespeople")
        .select(`
          id, salesperson_id, commission_type, commission_value,
          salesperson:salespeople(first_name, last_name, commission_type, commission_value)
        `)
        .eq("order_id", id!)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: !!id && !!user,
  });

  // Set salesperson when loaded
  useEffect(() => {
    if (existingSalesperson) {
      setSalespersonId(existingSalesperson.salesperson_id);
      setSalespersonData({
        commission_type: existingSalesperson.commission_type,
        commission_value: existingSalesperson.commission_value,
      });
      setExistingSalespersonRecordId(existingSalesperson.id);
    }
  }, [existingSalesperson]);

  // Populate form when order data is loaded — check draft first
  useEffect(() => {
    if (!order) return;

    // Try to restore draft
    const draft = loadDraft();
    if (draft) {
      setCustomerId(draft.customerId || order.customer_id);
      setOrderCode(draft.orderCode || "");
      setDescription(draft.description || "");
      setInternalNotes(draft.internalNotes || "");
      setSalespersonId(draft.salespersonId || "");
      setSalespersonData(draft.salespersonData || null);
      setExpectedDate(isoToDate(draft.expectedDate));
      setWarehouseArrivalDate(isoToDate(draft.warehouseArrivalDate));
      setWorkStartDate(isoToDate(draft.workStartDate));
      setWorkEndDate(isoToDate(draft.workEndDate));
      setPaymentType(draft.paymentType || "standard");
      setTotalAmount(draft.totalAmount || "");
      setDepositAmount(draft.depositAmount || "");
      setDeposit2Amount(draft.deposit2Amount || "");
      setFinancingAmount(draft.financingAmount || "");
      setVatRate(draft.vatRate || "22");
      setDepositPaid(draft.depositPaid || false);
      setDepositPaidDate(isoToDate(draft.depositPaidDate));
      setDepositExpectedDate(isoToDate(draft.depositExpectedDate));
      setDeposit2Paid(draft.deposit2Paid || false);
      setDeposit2PaidDate(isoToDate(draft.deposit2PaidDate));
      setDeposit2ExpectedDate(isoToDate(draft.deposit2ExpectedDate));
      setBalancePaid(draft.balancePaid || false);
      setBalancePaidDate(isoToDate(draft.balancePaidDate));
      setBalanceExpectedDate(isoToDate(draft.balanceExpectedDate));
      if (draft.orderItems?.length) setOrderItems(draft.orderItems);
      setDraftRestored(true);
      setDataLoaded(true);
      return;
    }

    // No draft — load from DB
    setCustomerId(order.customer_id);
    setOrderCode(order.order_code || "");
    setDescription(order.description);
    setTotalAmount(order.total_amount.toString());
    setDepositAmount(order.deposit_amount.toString());
    setDeposit2Amount((order.deposit_2_amount || 0).toString());
    setFinancingAmount((order.financing_amount || 0).toString());
    setPaymentType((order.payment_type as PaymentType) || 'standard');
    setInternalNotes(order.internal_notes || "");
    setVatRate((order.vat_rate || 22).toString());
    setDepositPaid(order.deposit_paid || false);
    setDeposit2Paid(order.deposit_2_paid || false);
    setBalancePaid(order.balance_paid || false);
    if (order.deposit_paid_date) setDepositPaidDate(new Date(order.deposit_paid_date));
    if (order.deposit_expected_date) setDepositExpectedDate(new Date(order.deposit_expected_date));
    if (order.deposit_2_paid_date) setDeposit2PaidDate(new Date(order.deposit_2_paid_date));
    if (order.deposit_2_expected_date) setDeposit2ExpectedDate(new Date(order.deposit_2_expected_date));
    if (order.balance_paid_date) setBalancePaidDate(new Date(order.balance_paid_date));
    if (order.balance_expected_date) setBalanceExpectedDate(new Date(order.balance_expected_date));
    if (order.expected_date) setExpectedDate(new Date(order.expected_date));
    if (order.warehouse_arrival_date) setWarehouseArrivalDate(new Date(order.warehouse_arrival_date));
    if (order.work_start_date) setWorkStartDate(new Date(order.work_start_date));
    if (order.work_end_date) setWorkEndDate(new Date(order.work_end_date));
    setDataLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order]);

  // Populate order items (only if no draft was restored)
  useEffect(() => {
    if (existingItems.length > 0 && !draftRestored) {
      setOrderItems(existingItems.map(item => ({
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
        is_paid: item.is_paid || false,
        paid_date: item.paid_date || undefined,
        payment_method: item.payment_method || undefined,
      })));
    }
  }, [existingItems, draftRestored]);

  // Auto-save draft on every change (debounced)
  useEffect(() => {
    if (!dataLoaded) return;
    saveDraft({
      customerId, orderCode, description, internalNotes, statusId: "",
      salespersonId, salespersonData,
      expectedDate: dateToIso(expectedDate),
      warehouseArrivalDate: dateToIso(warehouseArrivalDate),
      workStartDate: dateToIso(workStartDate),
      workEndDate: dateToIso(workEndDate),
      paymentType, totalAmount, depositAmount, deposit2Amount, financingAmount, vatRate,
      depositPaid, depositPaidDate: dateToIso(depositPaidDate), depositExpectedDate: dateToIso(depositExpectedDate),
      deposit2Paid, deposit2PaidDate: dateToIso(deposit2PaidDate), deposit2ExpectedDate: dateToIso(deposit2ExpectedDate),
      balancePaid, balancePaidDate: dateToIso(balancePaidDate), balanceExpectedDate: dateToIso(balanceExpectedDate),
      orderItems,
    });
  }, [customerId, orderCode, description, internalNotes, salespersonId, salespersonData,
      expectedDate, warehouseArrivalDate, workStartDate, workEndDate,
      paymentType, totalAmount, depositAmount, deposit2Amount, financingAmount, vatRate,
      depositPaid, depositPaidDate, depositExpectedDate,
      deposit2Paid, deposit2PaidDate, deposit2ExpectedDate,
      balancePaid, balancePaidDate, balanceExpectedDate,
      orderItems, dataLoaded, saveDraft, dateToIso]);

  const handleClearDraft = useCallback(() => {
    clearDraft();
    // Reload from DB
    if (order) {
      setCustomerId(order.customer_id);
      setOrderCode(order.order_code || "");
      setDescription(order.description);
      setTotalAmount(order.total_amount.toString());
      setDepositAmount(order.deposit_amount.toString());
      setDeposit2Amount((order.deposit_2_amount || 0).toString());
      setFinancingAmount((order.financing_amount || 0).toString());
      setPaymentType((order.payment_type as PaymentType) || 'standard');
      setInternalNotes(order.internal_notes || "");
      setVatRate((order.vat_rate || 22).toString());
      setDepositPaid(order.deposit_paid || false);
      setDeposit2Paid(order.deposit_2_paid || false);
      setBalancePaid(order.balance_paid || false);
      setDepositPaidDate(order.deposit_paid_date ? new Date(order.deposit_paid_date) : undefined);
      setDepositExpectedDate(order.deposit_expected_date ? new Date(order.deposit_expected_date) : undefined);
      setDeposit2PaidDate(order.deposit_2_paid_date ? new Date(order.deposit_2_paid_date) : undefined);
      setDeposit2ExpectedDate(order.deposit_2_expected_date ? new Date(order.deposit_2_expected_date) : undefined);
      setBalancePaidDate(order.balance_paid_date ? new Date(order.balance_paid_date) : undefined);
      setBalanceExpectedDate(order.balance_expected_date ? new Date(order.balance_expected_date) : undefined);
      setExpectedDate(order.expected_date ? new Date(order.expected_date) : undefined);
      setWarehouseArrivalDate(order.warehouse_arrival_date ? new Date(order.warehouse_arrival_date) : undefined);
      setWorkStartDate(order.work_start_date ? new Date(order.work_start_date) : undefined);
      setWorkEndDate(order.work_end_date ? new Date(order.work_end_date) : undefined);
    }
    if (existingItems.length > 0) {
      setOrderItems(existingItems.map(item => ({
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
        is_paid: item.is_paid || false,
        paid_date: item.paid_date || undefined,
        payment_method: item.payment_method || undefined,
      })));
    }
  }, [clearDraft, order, existingItems]);

  // Fetch customers for the company
  const { data: customers = [] } = useQuery({
    queryKey: ["customers", effectiveCompany?.id],
    queryFn: async () => {
      if (!effectiveCompany?.id) return [];
      
      const { data: customerRoles } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "customer");

      const customerIds = (customerRoles || []).map(r => r.user_id);
      if (customerIds.length === 0) return [];

      const { data, error } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, email")
        .eq("company_id", effectiveCompany.id)
        .in("id", customerIds)
        .order("last_name");

      if (error) throw error;
      return (data || []) as Customer[];
    },
    enabled: !!effectiveCompany?.id,
  });

  // Update order mutation
  const updateOrderMutation = useMutation({
    mutationFn: async () => {
      const financing = parseFloat(financingAmount) || 0;
      const vat = parseFloat(vatRate) || 22;

      // Update order
      const { error } = await supabase
        .from("orders")
        .update({
          customer_id: customerId,
          order_code: orderCode.trim() || null,
          description,
          total_amount: total,
          deposit_amount: deposit,
          deposit_2_amount: deposit2,
          financing_amount: financing,
          payment_type: paymentType,
          balance_amount: balance,
          expected_date: expectedDate?.toISOString().split("T")[0] || null,
          internal_notes: internalNotes || null,
          vat_rate: vat,
          warehouse_arrival_date: warehouseArrivalDate?.toISOString().split("T")[0] || null,
          work_start_date: workStartDate?.toISOString().split("T")[0] || null,
          work_end_date: workEndDate?.toISOString().split("T")[0] || null,
          deposit_paid: depositPaid,
          deposit_paid_date: depositPaidDate?.toISOString().split("T")[0] || null,
          deposit_2_paid: deposit2Paid,
          deposit_2_paid_date: deposit2PaidDate?.toISOString().split("T")[0] || null,
          balance_paid: balancePaid,
          balance_paid_date: balancePaidDate?.toISOString().split("T")[0] || null,
          balance_expected_date: balanceExpectedDate?.toISOString().split("T")[0] || null,
          deposit_expected_date: depositExpectedDate?.toISOString().split("T")[0] || null,
          deposit_2_expected_date: deposit2ExpectedDate?.toISOString().split("T")[0] || null,
        })
        .eq("id", id!);

      if (error) throw error;

      // Build maps of previous and new stock items for delta logic
      const previousStockItems = existingItems
        .filter(i => i.stock_item_id)
        .map(i => ({ stock_item_id: i.stock_item_id!, quantity: i.quantity }));

      const newStockItems = orderItems
        .filter(i => i.stock_item_id)
        .map(i => ({ stock_item_id: i.stock_item_id!, quantity: i.quantity }));

      // Count occurrences: { stock_item_id -> total_quantity }
      const prevMap = new Map<string, number>();
      for (const p of previousStockItems) {
        prevMap.set(p.stock_item_id, (prevMap.get(p.stock_item_id) || 0) + p.quantity);
      }
      const newMap = new Map<string, number>();
      for (const n of newStockItems) {
        newMap.set(n.stock_item_id, (newMap.get(n.stock_item_id) || 0) + n.quantity);
      }

      // Compute deltas: positive = need more scarico, negative = need ripristino (carico)
      const allStockIds = new Set([...prevMap.keys(), ...newMap.keys()]);
      const deltas: { stock_item_id: string; delta: number }[] = [];
      for (const sid of allStockIds) {
        const prev = prevMap.get(sid) || 0;
        const curr = newMap.get(sid) || 0;
        if (curr !== prev) {
          deltas.push({ stock_item_id: sid, delta: curr - prev });
        }
      }

      // --- Upsert + selective delete strategy ---
      const existingDbIds = new Set(existingItems.map(i => i.id));
      const formIds = new Set(orderItems.filter(i => i.id).map(i => i.id!));

      // Items removed by the user (in DB but not in form)
      const removedIds = [...existingDbIds].filter(dbId => !formIds.has(dbId));

      // Items to update (have an existing DB id)
      const itemsToUpdate = orderItems.filter(i => i.id && existingDbIds.has(i.id));

      // Items to insert (no id or id not in DB)
      const itemsToInsert = orderItems.filter(i => !i.id || !existingDbIds.has(i.id));

      // 1. Delete removed items (handle FK constraints)
      for (const removedId of removedIds) {
        await supabase.from("warehouse_movements").delete().eq("order_item_id", removedId);
        await supabase.from("order_item_attachments").delete().eq("order_item_id", removedId);
        const { error: delErr } = await supabase.from("order_items").delete().eq("id", removedId);
        if (delErr) throw delErr;
      }

      // 2. Update existing items
      for (let index = 0; index < orderItems.length; index++) {
        const item = orderItems[index];
        if (item.id && existingDbIds.has(item.id)) {
          const { error: updErr } = await supabase.from("order_items").update({
            name: item.name,
            description: item.description || null,
            quantity: item.quantity,
            status: item.status,
            position: index,
            supplier_id: item.supplier_id || null,
            purchase_price: item.purchase_price || 0,
            vat_rate: item.vat_rate ?? 22,
            stock_item_id: item.stock_item_id || null,
            unit_price: 0,
            discount_percent: 0,
            standard_cost: 0,
            is_paid: item.is_paid || false,
            paid_date: item.paid_date || null,
            payment_method: item.payment_method || null,
          }).eq("id", item.id);
          if (updErr) throw updErr;
        }
      }

      // 3. Insert new items
      if (itemsToInsert.length > 0) {
        const newItems = itemsToInsert.map((item, idx) => ({
          order_id: id!,
          name: item.name,
          description: item.description || null,
          quantity: item.quantity,
          status: item.status,
          position: itemsToUpdate.length + idx,
          supplier_id: item.supplier_id || null,
          purchase_price: item.purchase_price || 0,
          vat_rate: item.vat_rate ?? 22,
          stock_item_id: item.stock_item_id || null,
          unit_price: 0,
          discount_percent: 0,
          standard_cost: 0,
          is_paid: item.is_paid || false,
          paid_date: item.paid_date || null,
          payment_method: item.payment_method || null,
        }));

        const { error: insErr } = await supabase.from("order_items").insert(newItems);
        if (insErr) throw insErr;
      }

      // Apply stock deltas
      for (const { stock_item_id, delta } of deltas) {
        const { data: currentStock } = await supabase
          .from("warehouse_stock")
          .select("quantity")
          .eq("id", stock_item_id)
          .single();

        if (currentStock) {
          const newQty = Math.max(0, currentStock.quantity - delta);
          await supabase
            .from("warehouse_stock")
            .update({ quantity: newQty })
            .eq("id", stock_item_id);

          if (delta > 0) {
            // Additional scarico
            await supabase.from("warehouse_movements").insert({
              stock_item_id,
              movement_type: "scarico",
              quantity: delta,
              notes: `Scarico aggiuntivo per modifica ordine ${order?.order_code || id!.slice(0, 8)}`,
              performed_by: user!.id,
            });
          } else {
            // Ripristino (carico) - items removed from order
            await supabase.from("warehouse_movements").insert({
              stock_item_id,
              movement_type: "carico",
              quantity: Math.abs(delta),
              notes: `Ripristino automatico per modifica ordine ${order?.order_code || id!.slice(0, 8)}`,
              performed_by: user!.id,
            });
          }
        }
      }

      // Handle salesperson commission
      if (salespersonId && salespersonData) {
        let commissionAmount = 0;
        if (salespersonData.commission_type === "fixed") {
          commissionAmount = salespersonData.commission_value;
        } else {
          commissionAmount = total * (salespersonData.commission_value / 100);
        }

        if (existingSalespersonRecordId) {
          // Update existing record
          const { error: updateError } = await supabase
            .from("order_salespeople")
            .update({
              salesperson_id: salespersonId,
              commission_type: salespersonData.commission_type,
              commission_value: salespersonData.commission_value,
              commission_amount: commissionAmount,
            })
            .eq("id", existingSalespersonRecordId);

          if (updateError) throw updateError;
        } else {
          // Create new record
          const { error: insertError } = await supabase
            .from("order_salespeople")
            .insert({
              order_id: id!,
              salesperson_id: salespersonId,
              commission_type: salespersonData.commission_type,
              commission_value: salespersonData.commission_value,
              commission_amount: commissionAmount,
            });

          if (insertError) throw insertError;
        }
      } else if (existingSalespersonRecordId && !salespersonId) {
        // Remove salesperson from order
        const { error: deleteError } = await supabase
          .from("order_salespeople")
          .delete()
          .eq("id", existingSalespersonRecordId);

        if (deleteError) throw deleteError;
      }
    },
    onSuccess: () => {
      clearDraft();
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["order", id] });
      queryClient.invalidateQueries({ queryKey: ["order-items", id] });
      queryClient.invalidateQueries({ queryKey: ["order-salesperson", id] });
      toast({
        title: "Ordine aggiornato",
        description: "L'ordine è stato aggiornato con successo.",
      });
      navigate(`/azienda/ordini/${id}`);
    },
    onError: (error) => {
      toast({
        title: "Errore",
        description: "Si è verificato un errore durante l'aggiornamento dell'ordine.",
        variant: "destructive",
      });
      console.error("Update order error:", error);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!customerId) {
      toast({
        title: "Campo obbligatorio",
        description: "Seleziona un cliente.",
        variant: "destructive",
      });
      return;
    }

    if (!description.trim()) {
      toast({
        title: "Campo obbligatorio",
        description: "Inserisci una descrizione del lavoro.",
        variant: "destructive",
      });
      return;
    }

    if (total <= 0) {
      toast({
        title: "Importo non valido",
        description: "L'importo totale deve essere maggiore di zero.",
        variant: "destructive",
      });
      return;
    }

    // Validate order items
    if (orderItems.length > 0) {
      const invalidItems = orderItems.filter(
        (item) => !item.name.trim() || item.quantity < 1 || (item.purchase_price !== undefined && item.purchase_price < 0)
      );
      if (invalidItems.length > 0) {
        toast({
          title: "Articoli non validi",
          description: "Verifica che tutti gli articoli abbiano un nome, quantità ≥ 1 e prezzo d'acquisto non negativo.",
          variant: "destructive",
        });
        return;
      }
    }

    updateOrderMutation.mutate();
  };

  const handleCustomerCreated = (newCustomerId: string) => {
    setCustomerId(newCustomerId);
  };

  if (orderLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Caricamento ordine...</p>
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
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Modifica Ordine</h1>
          <p className="text-muted-foreground">
            Aggiorna i dettagli dell'ordine
          </p>
        </div>
      </div>

      {/* Draft restored banner */}
      {draftRestored && (
        <Alert className="border-yellow-500 bg-yellow-50 dark:bg-yellow-950/30">
          <AlertTriangle className="h-4 w-4 text-yellow-600" />
          <AlertDescription className="flex items-center justify-between">
            <span className="text-yellow-800 dark:text-yellow-200">
              Bozza recuperata — le modifiche non salvate sono state ripristinate.
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="ml-4 shrink-0"
              onClick={handleClearDraft}
            >
              <Trash2 className="h-3 w-3 mr-1" />
              Ripristina originale
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Main Form */}
          <Card>
            <CardHeader>
              <CardTitle>Dettagli Ordine</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Order Code */}
              <div className="space-y-2">
                <Label htmlFor="orderCode">Codice Ordine</Label>
                <Input
                  id="orderCode"
                  value={orderCode}
                  onChange={(e) => setOrderCode(e.target.value)}
                  placeholder="es. ORD-2026-001"
                />
              </div>

              {/* Customer with inline creation */}
              <div className="space-y-2">
                <Label htmlFor="customer">Cliente *</Label>
                <div className="flex gap-2">
                  <Select value={customerId} onValueChange={setCustomerId}>
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Seleziona un cliente" />
                    </SelectTrigger>
                    <SelectContent>
                      {customers.map((customer) => (
                        <SelectItem key={customer.id} value={customer.id}>
                          {customer.first_name} {customer.last_name} ({customer.email})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setShowCreateCustomer(true)}
                    title="Nuovo cliente"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Description */}
              <div className="space-y-2">
                <Label htmlFor="description">Descrizione Lavoro *</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Descrivi il lavoro da eseguire..."
                  rows={4}
                />
              </div>

              {/* Internal Notes */}
              <div className="space-y-2">
                <Label htmlFor="notes">Note Interne</Label>
                <Textarea
                  id="notes"
                  value={internalNotes}
                  onChange={(e) => setInternalNotes(e.target.value)}
                  placeholder="Note visibili solo all'azienda..."
                  rows={3}
                />
              </div>

              {/* Salesperson Select */}
              <SalespersonSelect
                value={salespersonId}
                onChange={(id, salesperson) => {
                  setSalespersonId(id);
                  setSalespersonData(salesperson ? {
                    commission_type: salesperson.commission_type,
                    commission_value: salesperson.commission_value,
                  } : null);
                }}
              />
            </CardContent>
          </Card>

          {/* Financial Summary */}
          <FinancialSummary
            totalAmount={totalAmount}
            depositAmount={depositAmount}
            deposit2Amount={deposit2Amount}
            financingAmount={financingAmount}
            paymentType={paymentType}
            vatRate={vatRate}
            onTotalAmountChange={setTotalAmount}
            onDepositAmountChange={setDepositAmount}
            onDeposit2AmountChange={setDeposit2Amount}
            onFinancingAmountChange={setFinancingAmount}
            onPaymentTypeChange={setPaymentType}
            onVatRateChange={setVatRate}
            balance={balance}
            depositPaid={depositPaid}
            depositPaidDate={depositPaidDate}
            depositExpectedDate={depositExpectedDate}
            deposit2Paid={deposit2Paid}
            deposit2PaidDate={deposit2PaidDate}
            deposit2ExpectedDate={deposit2ExpectedDate}
            balancePaid={balancePaid}
            balancePaidDate={balancePaidDate}
            balanceExpectedDate={balanceExpectedDate}
            onDepositPaidChange={setDepositPaid}
            onDepositPaidDateChange={setDepositPaidDate}
            onDepositExpectedDateChange={setDepositExpectedDate}
            onDeposit2PaidChange={setDeposit2Paid}
            onDeposit2PaidDateChange={setDeposit2PaidDate}
            onDeposit2ExpectedDateChange={setDeposit2ExpectedDate}
            onBalancePaidChange={setBalancePaid}
            onBalancePaidDateChange={setBalancePaidDate}
            onBalanceExpectedDateChange={setBalanceExpectedDate}
          />
        </div>

        {/* Customer Dates Card */}
        <Card>
          <CardHeader>
            <CardTitle>Tempistiche per il Cliente</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              {/* Warehouse Arrival Date */}
              <div className="space-y-2">
                <Label>Arrivo Merce in Magazzino</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !warehouseArrivalDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {warehouseArrivalDate ? (
                        format(warehouseArrivalDate, "d MMMM yyyy", { locale: it })
                      ) : (
                        <span>Seleziona data</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={warehouseArrivalDate}
                      onSelect={setWarehouseArrivalDate}
                      initialFocus
                      className="pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>

              {/* Work Start Date */}
              <div className="space-y-2">
                <Label>Inizio Lavori</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !workStartDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {workStartDate ? (
                        format(workStartDate, "d MMMM yyyy", { locale: it })
                      ) : (
                        <span>Seleziona data</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={workStartDate}
                      onSelect={setWorkStartDate}
                      initialFocus
                      className="pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>

              {/* Work End Date */}
              <div className="space-y-2">
                <Label>Fine Lavori</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !workEndDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {workEndDate ? (
                        format(workEndDate, "d MMMM yyyy", { locale: it })
                      ) : (
                        <span>Seleziona data</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={workEndDate}
                      onSelect={setWorkEndDate}
                      initialFocus
                      className="pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Order Items */}
        <OrderItemsList
          items={orderItems}
          onItemsChange={setOrderItems}
          editable={true}
          showStatusControls={true}
        />

        {/* Order Attachments */}
        <OrderAttachments orderId={id!} editable={true} />

        {/* Actions */}
        <div className="flex justify-end gap-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate(`/azienda/ordini/${id}`)}
          >
            Annulla
          </Button>
          <Button type="submit" disabled={updateOrderMutation.isPending}>
            {updateOrderMutation.isPending ? "Salvataggio..." : "Salva Modifiche"}
          </Button>
        </div>
      </form>

      {/* Create Customer Dialog */}
      <CreateCustomerDialog
        open={showCreateCustomer}
        onOpenChange={setShowCreateCustomer}
        onCustomerCreated={handleCustomerCreated}
      />
    </div>
  );
}
