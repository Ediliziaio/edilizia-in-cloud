import { useState, useEffect, useCallback } from "react";
import { logger } from "@/utils/logger";
import { parseDecimalIT } from "@/lib/parseDecimalIT";
import { ErrorBoundary } from "@/components/error/ErrorBoundary";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CalendarIcon, Plus, Trash2, AlertTriangle, ClipboardList, HardHat, MapPin, Package, FileText } from "lucide-react";
import { useOrderDraft } from "@/hooks/useOrderDraft";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCompanyCustomers } from "@/hooks/useCompanyCustomers";
import { toast } from "sonner";
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
import {
  QuotePageHeader,
  QuoteCard,
  QuotePrimaryButton,
} from "@/components/marketing/preventivi/ui/builderUI";
import { cn } from "@/lib/utils";
import { CreateCustomerDialog } from "@/components/orders/CreateCustomerDialog";
import { OrderItemsList, OrderItem } from "@/components/orders/OrderItemsList";
import { FinancialSummary, PaymentType } from "@/components/orders/FinancialSummary";
import { OrderAttachments } from "@/components/orders/OrderAttachments";
import { SalespersonSelect } from "@/components/salespeople/SalespersonSelect";
import { AssignedToSelect } from "@/components/orders/AssignedToSelect";
import { usePermissions } from "@/hooks/usePermissions";
import {
  type OrderCustomer as Customer,
  type OrderItemData,
  type Installment,
  mapDbItemToOrderItem,
  createDefaultInstallments,
  buildInstallmentsFromLegacy,
  installmentsToLegacyColumns,
} from "@/lib/orderUtils";
import { calculateCollectedNetFromInstallments, calculateCommissionGross } from "@/lib/commissions";

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
  // ── Modulo Appaltatori ─────────────────────────────────────────
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
  assigned_to: string | null;
}

function EditOrderInner() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, effectiveCompany } = useAuth();
  const queryClient = useQueryClient();
  const { onlyAssigned } = usePermissions();

  const [customerId, setCustomerId] = useState("");
  const [orderCode, setOrderCode] = useState("");
  const [description, setDescription] = useState("");
  const [expectedDate, setExpectedDate] = useState<Date | undefined>();
  const [internalNotes, setInternalNotes] = useState("");

  const [warehouseArrivalDate, setWarehouseArrivalDate] = useState<Date | undefined>();
  const [workStartDate, setWorkStartDate] = useState<Date | undefined>();
  const [workEndDate, setWorkEndDate] = useState<Date | undefined>();

  // ── Modulo Appaltatori (visibili solo se order_type='appaltatore_lavoro') ──
  const [workAddress, setWorkAddress] = useState("");
  const [workDescription, setWorkDescription] = useState("");
  const [materialsLocation, setMaterialsLocation] = useState("");
  const [orderTypeState, setOrderTypeState] = useState<"cliente" | "appaltatore_lavoro">("cliente");

  // Financial state
  const [paymentType, setPaymentType] = useState<PaymentType>('standard');
  const [totalAmount, setTotalAmount] = useState("");
  const [vatRate, setVatRate] = useState("22");
  const [financingCost, setFinancingCost] = useState("");
  const [hasBuildingBonus, setHasBuildingBonus] = useState(false);

  // Dynamic installments
  const [installments, setInstallments] = useState<Installment[]>(
    createDefaultInstallments('standard', 2)
  );
  const [numInstallments, setNumInstallments] = useState(2);

  // Order items state
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);

  const [showCreateCustomer, setShowCreateCustomer] = useState(false);

  const [salespersonId, setSalespersonId] = useState("");
  const [salespersonData, setSalespersonData] = useState<{
    commission_type: string;
    commission_value: number;
    compensation_mode?: string | null;
  } | null>(null);
  const [existingSalespersonRecordId, setExistingSalespersonRecordId] = useState<string | null>(null);

  const [assignedTo, setAssignedTo] = useState("");

  const { loadDraft, saveDraft, clearDraft, draftRestored, setDraftRestored, dateToIso, isoToDate } = useOrderDraft(effectiveCompany?.id, id);
  const [dataLoaded, setDataLoaded] = useState(false);

  // Calculate balance
  const total = parseDecimalIT(totalAmount);
  const vat = parseDecimalIT(vatRate) || 22;
  const fCostForBalance = paymentType === "financing" ? (parseDecimalIT(financingCost)) : 0;
  const totalWithVat = total * (1 + vat / 100);
  const nonBalanceSum = installments
    .filter(i => i.type !== 'balance')
    .reduce((sum, i) => sum + i.amount, 0);
  const balance = Math.max(0, totalWithVat - nonBalanceSum - fCostForBalance);

  // Payment type change handler
  const handlePaymentTypeChange = (type: PaymentType) => {
    setPaymentType(type);
    const defaultNum = type === 'financing' ? 3 : 2;
    setNumInstallments(defaultNum);
    setInstallments(createDefaultInstallments(type, defaultNum));
  };

  const handleNumInstallmentsChange = (num: number) => {
    setNumInstallments(num);
    const newInstallments = createDefaultInstallments(paymentType, num);
    const existingDeposits = installments.filter(i => i.type === 'deposit');
    const existingFinancing = installments.find(i => i.type === 'financing');
    const existingBalance = installments.find(i => i.type === 'balance');
    
    newInstallments.forEach((inst, idx) => {
      if (inst.type === 'deposit' && existingDeposits[idx]) {
        newInstallments[idx] = { ...inst, amount: existingDeposits[idx].amount, is_paid: existingDeposits[idx].is_paid, paid_date: existingDeposits[idx].paid_date, expected_date: existingDeposits[idx].expected_date };
      } else if (inst.type === 'financing' && existingFinancing) {
        newInstallments[idx] = { ...inst, amount: existingFinancing.amount, is_paid: existingFinancing.is_paid, paid_date: existingFinancing.paid_date, expected_date: existingFinancing.expected_date };
      } else if (inst.type === 'balance' && existingBalance) {
        newInstallments[idx] = { ...inst, is_paid: existingBalance.is_paid, paid_date: existingBalance.paid_date, expected_date: existingBalance.expected_date };
      }
    });
    setInstallments(newInstallments);
  };

  // Fetch order data
  const { data: order, isLoading: orderLoading } = useQuery({
    queryKey: ["order", id],
    queryFn: async () => {
      if (!effectiveCompany?.id) throw new Error("Azienda non trovata");
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .eq("id", id!)
        .eq("company_id", effectiveCompany.id)
        .single();
      if (error) throw error;
      return data as OrderData;
    },
    enabled: !!id && !!user && !!effectiveCompany?.id,
  });

  // Fetch order installments
  const { data: dbInstallments = [] } = useQuery({
    queryKey: ["order-installments", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_installments")
        .select("*")
        .eq("order_id", id!)
        .order("position");
      if (error) throw error;
      return (data || []) as unknown as (Installment & { id: string })[];
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

  // Fetch existing salesperson
  const { data: existingSalesperson } = useQuery({
    queryKey: ["order-salesperson", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_salespeople")
        .select(`
          id, salesperson_id, commission_type, commission_value,
          salesperson:salespeople(first_name, last_name, commission_type, commission_value, compensation_mode)
        `)
        .eq("order_id", id!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!id && !!user,
  });

  useEffect(() => {
    if (existingSalesperson) {
      setSalespersonId(existingSalesperson.salesperson_id);
      setSalespersonData({
        commission_type: existingSalesperson.commission_type,
        commission_value: existingSalesperson.commission_value,
        compensation_mode: existingSalesperson.salesperson?.compensation_mode || null,
      });
      setExistingSalespersonRecordId(existingSalesperson.id);
    }
  }, [existingSalesperson]);

  // Populate form when order data is loaded
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
      setVatRate(draft.vatRate || "22");
      setFinancingCost(draft.financingCost || "");
      setHasBuildingBonus(draft.hasBuildingBonus || false);
      if (draft.installments?.length) {
        setInstallments(draft.installments);
        setNumInstallments(draft.installments.length);
      }
      if (draft.orderItems?.length) setOrderItems(draft.orderItems);
      // Campi non sempre presenti nella bozza → ripristina da bozza o dal record DB,
      // altrimenti al salvataggio verrebbero azzerati (assegnazione persa, tipo→cliente).
      setAssignedTo(draft.assignedTo || order.assigned_to || "");
      setOrderTypeState(order.order_type === "appaltatore_lavoro" ? "appaltatore_lavoro" : "cliente");
      setWorkAddress(order.work_address || "");
      setWorkDescription(order.work_description || "");
      setMaterialsLocation(order.materials_location || "");
      setDraftRestored(true);
      setDataLoaded(true);
      return;
    }

    // No draft — load from DB
    setCustomerId(order.customer_id);
    setOrderCode(order.order_code || "");
    setDescription(order.description);
    setTotalAmount(order.total_amount.toString());
    setPaymentType((order.payment_type as PaymentType) || 'standard');
    setInternalNotes(order.internal_notes || "");
    setVatRate((order.vat_rate || 22).toString());
    if (order.expected_date) setExpectedDate(new Date(order.expected_date));
    if (order.warehouse_arrival_date) setWarehouseArrivalDate(new Date(order.warehouse_arrival_date));
    if (order.work_start_date) setWorkStartDate(new Date(order.work_start_date));
    if (order.work_end_date) setWorkEndDate(new Date(order.work_end_date));
    setFinancingCost((order.financing_cost || 0).toString());
    setHasBuildingBonus(order.has_building_bonus || false);
    setAssignedTo(order.assigned_to || "");
    // Modulo Appaltatori
    setOrderTypeState(order.order_type === "appaltatore_lavoro" ? "appaltatore_lavoro" : "cliente");
    setWorkAddress(order.work_address || "");
    setWorkDescription(order.work_description || "");
    setMaterialsLocation(order.materials_location || "");

    // Load installments from DB table, or build from legacy
    if (dbInstallments.length > 0) {
      setInstallments(dbInstallments.map(i => ({
        id: i.id,
        position: i.position,
        label: i.label,
        type: i.type as Installment['type'],
        amount: i.amount,
        is_paid: i.is_paid,
        paid_date: i.paid_date,
        expected_date: i.expected_date,
      })));
      setNumInstallments(dbInstallments.length);
    } else {
      const legacyInstallments = buildInstallmentsFromLegacy(order);
      setInstallments(legacyInstallments);
      setNumInstallments(legacyInstallments.length);
    }

    setDataLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order, dbInstallments]);

  // Populate order items
  useEffect(() => {
    if (existingItems.length > 0 && !draftRestored) {
      setOrderItems(existingItems.map(mapDbItemToOrderItem));
    }
  }, [existingItems, draftRestored]);

  // Auto-save draft
  useEffect(() => {
    if (!dataLoaded) return;
    if (customerId === "" && order?.customer_id) return;
    saveDraft({
      customerId, orderCode, description, internalNotes, statusId: "",
      assignedTo,
      salespersonId, salespersonData,
      expectedDate: dateToIso(expectedDate),
      warehouseArrivalDate: dateToIso(warehouseArrivalDate),
      workStartDate: dateToIso(workStartDate),
      workEndDate: dateToIso(workEndDate),
      paymentType, totalAmount, vatRate,
      financingCost,
      hasBuildingBonus,
      orderItems,
      installments,
    });
  }, [customerId, orderCode, description, internalNotes, salespersonId, salespersonData,
      expectedDate, warehouseArrivalDate, workStartDate, workEndDate,
      paymentType, totalAmount, vatRate,
      installments, financingCost,
      hasBuildingBonus,
      orderItems, dataLoaded, saveDraft, dateToIso, order?.customer_id]);

  const handleClearDraft = useCallback(() => {
    clearDraft();
    if (order) {
      setCustomerId(order.customer_id);
      setOrderCode(order.order_code || "");
      setDescription(order.description);
      setTotalAmount(order.total_amount.toString());
      setPaymentType((order.payment_type as PaymentType) || 'standard');
      setInternalNotes(order.internal_notes || "");
      setVatRate((order.vat_rate || 22).toString());
      setExpectedDate(order.expected_date ? new Date(order.expected_date) : undefined);
      setWarehouseArrivalDate(order.warehouse_arrival_date ? new Date(order.warehouse_arrival_date) : undefined);
      setWorkStartDate(order.work_start_date ? new Date(order.work_start_date) : undefined);
      setWorkEndDate(order.work_end_date ? new Date(order.work_end_date) : undefined);
      setFinancingCost((order.financing_cost || 0).toString());
      setHasBuildingBonus(order.has_building_bonus || false);
      // Restore installments from DB or legacy
      if (dbInstallments.length > 0) {
        setInstallments(dbInstallments.map(i => ({
          id: i.id, position: i.position, label: i.label,
          type: i.type as Installment['type'], amount: i.amount,
          is_paid: i.is_paid, paid_date: i.paid_date, expected_date: i.expected_date,
        })));
        setNumInstallments(dbInstallments.length);
      } else {
        const legacyInstallments = buildInstallmentsFromLegacy(order);
        setInstallments(legacyInstallments);
        setNumInstallments(legacyInstallments.length);
      }
    }
    if (existingItems.length > 0) {
      setOrderItems(existingItems.map(mapDbItemToOrderItem));
    }
  }, [clearDraft, order, existingItems, dbInstallments]);

  const { data: customers = [], isLoading: isLoadingCustomers } = useCompanyCustomers(effectiveCompany?.id);

  // Fetch the order's customer directly
  const { data: orderCustomer } = useQuery({
    queryKey: ["order-customer", order?.customer_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, email")
        .eq("id", order!.customer_id)
        .eq("company_id", effectiveCompany!.id)
        .maybeSingle();
      if (error) throw error;
      return data as Customer | null;
    },
    enabled: !!order?.customer_id && !!effectiveCompany?.id,
    staleTime: 5 * 60 * 1000,
  });

  const allCustomers = (() => {
    if (orderCustomer && !customers.find(c => c.id === orderCustomer.id)) {
      return [orderCustomer, ...customers];
    }
    return customers;
  })();

  // Update order mutation
  const updateOrderMutation = useMutation({
    mutationFn: async () => {
      if (!effectiveCompany?.id) throw new Error("Azienda non trovata");
      const installmentsForSave = installments.map(i =>
        i.type === 'balance' ? { ...i, amount: balance } : i
      );
      const legacy = installmentsToLegacyColumns(installmentsForSave);

      const { error } = await supabase
        .from("orders")
        .update({
          customer_id: customerId,
          order_code: orderCode.trim() || null,
          description,
          total_amount: total,
          ...legacy,
          payment_type: paymentType,
          balance_amount: balance,
          expected_date: expectedDate?.toISOString().split("T")[0] || null,
          internal_notes: internalNotes || null,
          vat_rate: vat,
          warehouse_arrival_date: warehouseArrivalDate?.toISOString().split("T")[0] || null,
          work_start_date: workStartDate?.toISOString().split("T")[0] || null,
          work_end_date: workEndDate?.toISOString().split("T")[0] || null,
          financing_cost: parseDecimalIT(financingCost),
          has_building_bonus: hasBuildingBonus,
          assigned_to: assignedTo || null,
          // Modulo Appaltatori — persistiamo solo se l'ordine è già di tipo
          // appaltatore_lavoro: per ordini cliente standard manteniamo i campi
          // a NULL (no-op silenzioso anche se l'utente li avesse riempiti).
          ...(orderTypeState === "appaltatore_lavoro"
            ? {
                work_address: workAddress.trim() || null,
                work_description: workDescription.trim() || null,
                materials_location: materialsLocation.trim() || null,
              }
            : {}),
        } as never)
        .eq("id", id!)
        .eq("company_id", effectiveCompany.id);

      if (error) throw error;

      // Upsert installments: delete old, insert new
      {
        const { error: delInstErr } = await supabase.from("order_installments").delete().eq("order_id", id!);
        if (delInstErr) throw delInstErr;
      }
      if (installmentsForSave.length > 0) {
        const instRows = installmentsForSave.map(i => ({
          order_id: id!,
          position: i.position,
          label: i.label,
          type: i.type,
          amount: i.amount,
          is_paid: i.is_paid,
          paid_date: i.paid_date || null,
          expected_date: i.expected_date || null,
        }));
        await supabase.from("order_installments").insert(instRows);
      }

      // Handle order items (same logic as before)
      const previousStockItems = existingItems
        .filter(i => i.stock_item_id)
        .map(i => ({ stock_item_id: i.stock_item_id!, quantity: i.quantity }));
      const newStockItems = orderItems
        .filter(i => i.stock_item_id)
        .map(i => ({ stock_item_id: i.stock_item_id!, quantity: i.quantity }));

      const prevMap = new Map<string, number>();
      for (const p of previousStockItems) {
        prevMap.set(p.stock_item_id, (prevMap.get(p.stock_item_id) || 0) + p.quantity);
      }
      const newMap = new Map<string, number>();
      for (const n of newStockItems) {
        newMap.set(n.stock_item_id, (newMap.get(n.stock_item_id) || 0) + n.quantity);
      }

      const allStockIds = new Set([...prevMap.keys(), ...newMap.keys()]);
      const deltas: { stock_item_id: string; delta: number }[] = [];
      for (const sid of allStockIds) {
        const prev = prevMap.get(sid) || 0;
        const curr = newMap.get(sid) || 0;
        if (curr !== prev) deltas.push({ stock_item_id: sid, delta: curr - prev });
      }

      const existingDbIds = new Set(existingItems.map(i => i.id));
      const formIds = new Set(orderItems.filter(i => i.id).map(i => i.id!));
      const removedIds = [...existingDbIds].filter(dbId => !formIds.has(dbId));
      const itemsToUpdate = orderItems.filter(i => i.id && existingDbIds.has(i.id));
      const itemsToInsert = orderItems.filter(i => !i.id || !existingDbIds.has(i.id));

      for (const removedId of removedIds) {
        const { error: delMovErr } = await supabase.from("warehouse_movements").delete().eq("order_item_id", removedId);
        if (delMovErr) throw delMovErr;
        const { error: delAttErr } = await supabase.from("order_item_attachments").delete().eq("order_item_id", removedId);
        if (delAttErr) throw delAttErr;
        const { error: delItemErr } = await supabase.from("order_items").delete().eq("id", removedId);
        if (delItemErr) throw delItemErr;
      }

      for (let index = 0; index < orderItems.length; index++) {
        const item = orderItems[index];
        if (item.id && existingDbIds.has(item.id)) {
          await supabase.from("order_items").update({
            name: item.name, description: item.description || null,
            quantity: item.quantity, status: item.status, position: index,
            supplier_id: item.supplier_id || null, purchase_price: item.purchase_price || 0,
            vat_rate: item.vat_rate ?? 22, stock_item_id: item.stock_item_id || null,
            unit_price: 0, discount_percent: 0, standard_cost: 0,
            is_paid: item.is_paid || false, paid_date: item.paid_date || null,
            payment_method: item.payment_method || null,
            deposit_amount: item.deposit_amount || 0, deposit_paid: item.deposit_paid || false,
            deposit_paid_date: item.deposit_paid_date || null,
            balance_amount: item.balance_amount || 0, balance_paid: item.balance_paid || false,
            balance_paid_date: item.balance_paid_date || null,
            balance_expected_date: item.balance_expected_date || null,
            deposit_expected_date: item.deposit_expected_date || null,
          }).eq("id", item.id);
        }
      }

      if (itemsToInsert.length > 0) {
        const newItems = itemsToInsert.map((item, idx) => ({
          order_id: id!, name: item.name, description: item.description || null,
          quantity: item.quantity, status: item.status, position: itemsToUpdate.length + idx,
          supplier_id: item.supplier_id || null, purchase_price: item.purchase_price || 0,
          vat_rate: item.vat_rate ?? 22, stock_item_id: item.stock_item_id || null,
          unit_price: 0, discount_percent: 0, standard_cost: 0,
          is_paid: item.is_paid || false, paid_date: item.paid_date || null,
          payment_method: item.payment_method || null,
          deposit_amount: item.deposit_amount || 0, deposit_paid: item.deposit_paid || false,
          deposit_paid_date: item.deposit_paid_date || null,
          balance_amount: item.balance_amount || 0, balance_paid: item.balance_paid || false,
          balance_paid_date: item.balance_paid_date || null,
          balance_expected_date: item.balance_expected_date || null,
          deposit_expected_date: item.deposit_expected_date || null,
        }));
        await supabase.from("order_items").insert(newItems);
      }

      for (const { stock_item_id, delta } of deltas) {
        const { data: currentStock } = await supabase
          .from("warehouse_stock").select("quantity").eq("id", stock_item_id).single();
        if (currentStock) {
          const newQty = Math.max(0, currentStock.quantity - delta);
          await supabase.from("warehouse_stock").update({ quantity: newQty }).eq("id", stock_item_id);
          if (delta > 0) {
            await supabase.from("warehouse_movements").insert({
              stock_item_id, movement_type: "scarico", quantity: delta,
              notes: `Scarico aggiuntivo per modifica commessa ${order?.order_code || id!.slice(0, 8)}`,
              performed_by: user!.id,
            });
          } else {
            await supabase.from("warehouse_movements").insert({
              stock_item_id, movement_type: "carico", quantity: Math.abs(delta),
              notes: `Ripristino automatico per modifica commessa ${order?.order_code || id!.slice(0, 8)}`,
              performed_by: user!.id,
            });
          }
        }
      }

      // Handle salesperson
      if (salespersonId && salespersonData) {
        const collectedNet = calculateCollectedNetFromInstallments({
          installments: installmentsForSave,
          totalAmount: total,
          vatRate: vat,
          financingCost: parseDecimalIT(financingCost),
        });
        const commissionAmount = calculateCommissionGross({
          commissionType: salespersonData.commission_type,
          commissionValue: salespersonData.commission_value,
          compensationMode: salespersonData.compensation_mode,
          totalAmount: total,
          collectedAmount: collectedNet,
        });

        if (existingSalespersonRecordId) {
          await supabase.from("order_salespeople").update({
            salesperson_id: salespersonId,
            commission_type: salespersonData.commission_type,
            commission_value: salespersonData.commission_value,
            commission_amount: commissionAmount,
          }).eq("id", existingSalespersonRecordId);
        } else {
          await supabase.from("order_salespeople").insert({
            order_id: id!,
            salesperson_id: salespersonId,
            commission_type: salespersonData.commission_type,
            commission_value: salespersonData.commission_value,
            commission_amount: commissionAmount,
          });
        }
      } else if (existingSalespersonRecordId && !salespersonId) {
        const { error: delSalesErr } = await supabase.from("order_salespeople").delete().eq("id", existingSalespersonRecordId);
        if (delSalesErr) throw delSalesErr;
      }
    },
    onSuccess: () => {
      clearDraft();
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["order", id] });
      queryClient.invalidateQueries({ queryKey: ["order-items", id] });
      queryClient.invalidateQueries({ queryKey: ["order-salesperson", id] });
      queryClient.invalidateQueries({ queryKey: ["order-installments", id] });
      queryClient.invalidateQueries({ queryKey: ["margin"] });
      queryClient.invalidateQueries({ queryKey: ["break-even"] });
      queryClient.invalidateQueries({ queryKey: ["cruscotto"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["cashflow"] });
      toast.success("Commessa aggiornata", { description: "La commessa è stata aggiornata con successo." });
      navigate(`/azienda/ordini/${id}`);
    },
    onError: (error) => {
      toast.error("Errore", {
        description: error instanceof Error ? error.message : "Si è verificato un errore durante l'aggiornamento della commessa.",
      });
      logger.error("Update order error:", error);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!customerId) {
      toast.error("Campo obbligatorio", { description: "Seleziona un cliente." });
      return;
    }
    if (!description.trim()) {
      toast.error("Campo obbligatorio", { description: "Inserisci una descrizione del lavoro." });
      return;
    }
    // Per i lavori per appaltatore (sola manodopera) l'importo può essere 0
    // perché spesso il compenso è gestito a SAL/contratto separato.
    if (orderTypeState !== "appaltatore_lavoro" && total <= 0) {
      toast.error("Importo non valido", { description: "L'importo totale deve essere maggiore di zero." });
      return;
    }
    if (vat < 0 || vat > 100) {
      toast.error("IVA non valida", { description: "L'IVA deve essere un valore tra 0 e 100." });
      return;
    }
    if ((parseDecimalIT(financingCost)) < 0) {
      toast.error("Costo finanziaria non valido", { description: "Il costo finanziaria non può essere negativo." });
      return;
    }
    if (workStartDate && workEndDate && workEndDate < workStartDate) {
      toast.error("Date lavori non valide", {
        description: "La data di fine lavori non può precedere quella di inizio.",
      });
      return;
    }
    if (orderItems.length > 0) {
      const invalidItems = orderItems.filter(
        (item) => !item.name.trim() || item.quantity < 1 || (item.purchase_price !== undefined && item.purchase_price < 0)
      );
      if (invalidItems.length > 0) {
        toast.error("Articoli non validi", { description: "Verifica che tutti gli articoli abbiano un nome, quantità ≥ 1 e prezzo d'acquisto non negativo." });
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
        <p className="text-muted-foreground">Caricamento commessa...</p>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Commessa non trovata</p>
        <Button className="mt-4" onClick={() => navigate("/azienda/ordini")}>
          Torna alle commesse
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <QuotePageHeader
        icon={<ClipboardList className="h-5 w-5" />}
        title="Modifica Commessa"
        subtitle="Aggiorna i dettagli della commessa"
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(-1)}
            className="text-xs"
          >
            <ArrowLeft className="h-3.5 w-3.5 mr-1" />
            Indietro
          </Button>
        }
      />

      {/* Draft restored banner */}
      {draftRestored && (
        <Alert className="border-amber-300 bg-gradient-to-br from-amber-50 to-orange-50">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertDescription className="flex items-center justify-between">
            <span className="text-amber-900 font-medium">
              Bozza recuperata — le modifiche non salvate sono state ripristinate.
            </span>
            <Button type="button" variant="outline" size="sm" className="ml-4 shrink-0 border-amber-300 hover:bg-amber-100" onClick={handleClearDraft}>
              <Trash2 className="h-3 w-3 mr-1" />
              Ripristina originale
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Main Form */}
          <QuoteCard title="Dettagli Commessa" icon={<ClipboardList className="h-4 w-4" />}>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="orderCode">Codice Commessa</Label>
                <Input id="orderCode" value={orderCode} onChange={(e) => setOrderCode(e.target.value)} placeholder="es. ORD-2026-001" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="customer">Cliente *</Label>
                <div className="flex gap-2">
                  <Select
                    value={customerId && allCustomers.some(c => c.id === customerId) ? customerId : "__none__"}
                    onValueChange={(value) => setCustomerId(value === "__none__" ? "" : value)}
                  >
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder={isLoadingCustomers ? "Caricamento..." : "Seleziona un cliente"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__" disabled>Seleziona un cliente</SelectItem>
                      {allCustomers.map((customer) => (
                        <SelectItem key={customer.id} value={customer.id}>
                          {customer.first_name} {customer.last_name} ({customer.email})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button type="button" variant="outline" size="icon" onClick={() => setShowCreateCustomer(true)} title="Nuovo cliente">
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Descrizione Lavoro *</Label>
                <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descrivi il lavoro da eseguire..." rows={4} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Note Interne</Label>
                <Textarea id="notes" value={internalNotes} onChange={(e) => setInternalNotes(e.target.value)} placeholder="Note visibili solo all'azienda..." rows={3} />
              </div>

              <SalespersonSelect
                value={salespersonId}
                onChange={(sid, salesperson) => {
                  setSalespersonId(sid);
                  setSalespersonData(salesperson ? {
                    commission_type: salesperson.commission_type,
                    commission_value: salesperson.commission_value,
                    compensation_mode: salesperson.compensation_mode || null,
                  } : null);
                }}
              />

              <AssignedToSelect value={assignedTo} onChange={setAssignedTo} disabled={onlyAssigned} />
            </div>
          </QuoteCard>

          <FinancialSummary
            totalAmount={totalAmount}
            vatRate={vatRate}
            paymentType={paymentType}
            installments={installments}
            onInstallmentsChange={setInstallments}
            numInstallments={numInstallments}
            onNumInstallmentsChange={handleNumInstallmentsChange}
            onTotalAmountChange={setTotalAmount}
            onVatRateChange={setVatRate}
            onPaymentTypeChange={handlePaymentTypeChange}
            balance={balance}
            hasBuildingBonus={hasBuildingBonus}
            onHasBuildingBonusChange={setHasBuildingBonus}
            financingCost={financingCost}
            onFinancingCostChange={setFinancingCost}
          />
        </div>

        {/* Customer Dates Card */}
        <QuoteCard
          title="Tempistiche per il Cliente"
          icon={<CalendarIcon className="h-4 w-4" />}
        >
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-2">
                <Label>Data Prevista</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal border-slate-200 hover:border-orange-300 hover:bg-orange-50/40", !expectedDate && "text-slate-400")}>
                      <CalendarIcon className="mr-2 h-4 w-4 text-orange-500" />
                      {expectedDate ? format(expectedDate, "d MMMM yyyy", { locale: it }) : <span>Seleziona data</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={expectedDate} onSelect={setExpectedDate} initialFocus className="pointer-events-auto" />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-2">
                <Label>Arrivo Merce in Magazzino</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal border-slate-200 hover:border-orange-300 hover:bg-orange-50/40", !warehouseArrivalDate && "text-slate-400")}>
                      <CalendarIcon className="mr-2 h-4 w-4 text-orange-500" />
                      {warehouseArrivalDate ? format(warehouseArrivalDate, "d MMMM yyyy", { locale: it }) : <span>Seleziona data</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={warehouseArrivalDate} onSelect={setWarehouseArrivalDate} initialFocus className="pointer-events-auto" />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-2">
                <Label>Inizio Lavori</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal border-slate-200 hover:border-orange-300 hover:bg-orange-50/40", !workStartDate && "text-slate-400")}>
                      <CalendarIcon className="mr-2 h-4 w-4 text-orange-500" />
                      {workStartDate ? format(workStartDate, "d MMMM yyyy", { locale: it }) : <span>Seleziona data</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={workStartDate} onSelect={setWorkStartDate} initialFocus className="pointer-events-auto" />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-2">
                <Label>Fine Lavori</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal border-slate-200 hover:border-orange-300 hover:bg-orange-50/40", !workEndDate && "text-slate-400")}>
                      <CalendarIcon className="mr-2 h-4 w-4 text-orange-500" />
                      {workEndDate ? format(workEndDate, "d MMMM yyyy", { locale: it }) : <span>Seleziona data</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={workEndDate} onSelect={setWorkEndDate} initialFocus className="pointer-events-auto" />
                  </PopoverContent>
                </Popover>
              </div>
          </div>
        </QuoteCard>

        {/* ── Modulo Appaltatori — campi specifici per lavoro manodopera ── */}
        {orderTypeState === "appaltatore_lavoro" && (
          <QuoteCard
            title="Lavoro per appaltatore"
            icon={<HardHat className="h-4 w-4" />}
            subtitle="Sola manodopera — dettagli operativi del cantiere."
          >
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="workAddress" className="flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5" />
                  Indirizzo cantiere
                </Label>
                <Input
                  id="workAddress"
                  value={workAddress}
                  onChange={(e) => setWorkAddress(e.target.value)}
                  placeholder="Via del cantiere, 5 — 20100 Milano"
                  maxLength={250}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="workDescription" className="flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5" />
                  Cosa va fatto (briefing operativo)
                </Label>
                <Textarea
                  id="workDescription"
                  value={workDescription}
                  onChange={(e) => setWorkDescription(e.target.value)}
                  placeholder="Smontaggio infissi, posa, sigillature, ripristino imbotti..."
                  rows={4}
                  maxLength={2000}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="materialsLocation" className="flex items-center gap-1.5">
                  <Package className="h-3.5 w-3.5" />
                  Posizione materiali
                </Label>
                <Input
                  id="materialsLocation"
                  value={materialsLocation}
                  onChange={(e) => setMaterialsLocation(e.target.value)}
                  placeholder="Magazzino appaltatore / cantiere stesso / deposito X"
                  maxLength={200}
                />
              </div>
            </div>
          </QuoteCard>
        )}

        {/* Order Items */}
        <OrderItemsList
          items={orderItems}
          onItemsChange={setOrderItems}
          editable={true}
          showStatusControls={false}
        />

        {/* Order Attachments */}
        <OrderAttachments orderId={id!} editable={true} />

        {/* Actions */}
        <div className="flex justify-end gap-3 sticky bottom-0 bg-gradient-to-t from-slate-50 via-slate-50 to-transparent pt-4 pb-2 -mx-4 px-4 sm:mx-0 sm:px-0">
          <Button type="button" variant="outline" onClick={() => navigate(`/azienda/ordini/${id}`)}>
            Annulla
          </Button>
          <QuotePrimaryButton type="submit" disabled={updateOrderMutation.isPending}>
            {updateOrderMutation.isPending ? "Salvataggio..." : "Salva Modifiche"}
          </QuotePrimaryButton>
        </div>
      </form>

      <CreateCustomerDialog
        open={showCreateCustomer}
        onOpenChange={setShowCreateCustomer}
        onCustomerCreated={handleCustomerCreated}
      />
    </div>
  );
}

export default function EditOrder() {
  return (
    <ErrorBoundary title="Errore nella modifica commessa">
      <EditOrderInner />
    </ErrorBoundary>
  );
}
