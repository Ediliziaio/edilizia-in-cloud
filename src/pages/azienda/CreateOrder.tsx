import { useState, useEffect, useCallback, useRef } from "react";
import { logger } from "@/utils/logger";
import { friendlyPostgresError } from "@/lib/postgresErrors";
import { parseDecimalIT } from "@/lib/parseDecimalIT";
import { ErrorBoundary } from "@/components/error/ErrorBoundary";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, ArrowRight, CalendarIcon, Plus, Trash2, AlertTriangle, ClipboardList, CheckCircle2, Sparkles } from "lucide-react";
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
import { PendingFilesUpload, type PendingFile } from "@/components/orders/PendingFilesUpload";
import { SalespersonSelect } from "@/components/salespeople/SalespersonSelect";
import { useSubscriptionLimits } from "@/hooks/useSubscriptionLimits";
import { useTrack, ANALYTICS_EVENTS } from "@/hooks/useTrack";
import { UpgradeScopriWall } from "@/components/subscription/UpgradeScopriBanner";
import { AssignedToSelect } from "@/components/orders/AssignedToSelect";
import { usePermissions } from "@/hooks/usePermissions";
import {
  type OrderStatus,
  type Installment,
  createDefaultInstallments,
  installmentsToLegacyColumns,
} from "@/lib/orderUtils";
import { orderSchema, orderDefaultValues, type OrderFormValues } from "@/lib/orderSchema";
import { WarehouseSelect } from "@/components/warehouse/WarehouseSelect";
import { SedeSelect } from "@/components/sedi/SedeSelect";

function CreateOrderInner() {
  const navigate = useNavigate();
  const { user, effectiveCompany } = useAuth();
  const queryClient = useQueryClient();
  const { onlyAssigned } = usePermissions();
  const { canCreateOrder, isScopriPlan, currentPlan, remainingOrders } = useSubscriptionLimits();
  const track = useTrack();

  // ── react-hook-form ──────────────────────────────────────────
  const form = useForm<OrderFormValues>({
    resolver: zodResolver(orderSchema),
    defaultValues: orderDefaultValues,
  });

  const { control, watch, setValue, getValues, reset, handleSubmit: rhfHandleSubmit, formState: { errors } } = form;

  // Watch fields needed for computed values & effects — single call to avoid 13 subscriptions
  const {
    customer_id: customerId,
    payment_type: _paymentTypeRaw,
    total_amount: totalAmount,
    vat_rate: vatRate,
    financing_cost: financingCost,
    has_building_bonus: hasBuildingBonus,
    salesperson_id: salespersonId,
    salesperson_data: salespersonData,
    status_id: statusId,
    expected_date: expectedDate,
    warehouse_arrival_date: warehouseArrivalDate,
    work_start_date: workStartDate,
    work_end_date: workEndDate,
    order_code: orderCode,
    description,
    internal_notes: internalNotes,
    assigned_to: assignedTo,
    destination_warehouse_id: destinationWarehouseId,
    sede_id: sedeId,
  } = watch();
  const paymentType = _paymentTypeRaw as PaymentType;

  // ── Non-form state (arrays / UI) ────────────────────────────
  const [installments, setInstallments] = useState<Installment[]>(
    createDefaultInstallments('standard', 2)
  );
  const [numInstallments, setNumInstallments] = useState(2);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [showCreateCustomer, setShowCreateCustomer] = useState(false);
  const [createdOrderId, setCreatedOrderId] = useState<string | null>(null);

  // Auto-assign for staff with onlyAssigned
  useEffect(() => {
    if (onlyAssigned && user?.id) {
      setValue("assigned_to", user.id);
    }
  }, [onlyAssigned, user?.id, setValue]);

  // Calculate balance (deduct financing_cost for financing payment type)
  const total = parseDecimalIT(totalAmount);
  const vat = (parseDecimalIT(vatRate) || 22);
  const fCostForBalance = paymentType === 'financing' ? (parseDecimalIT(financingCost || "")) : 0;
  const totalWithVat = total * (1 + vat / 100);
  const nonBalanceSum = installments
    .filter(i => i.type !== 'balance')
    .reduce((sum, i) => sum + i.amount, 0);
  const balance = Math.max(0, totalWithVat - nonBalanceSum - fCostForBalance);
  const overAllocatedPayments = nonBalanceSum + fCostForBalance > totalWithVat + 0.01;
  const invalidOrderItems = orderItems.filter(
    (item) =>
      !item.name.trim() ||
      !Number.isFinite(item.quantity) ||
      item.quantity <= 0 ||
      (item.purchase_price !== undefined && (!Number.isFinite(item.purchase_price) || item.purchase_price < 0)) ||
      (item.vat_rate !== undefined && (!Number.isFinite(item.vat_rate) || item.vat_rate < 0 || item.vat_rate > 100))
  );
  const completionChecks = [
    { label: "Cliente selezionato", done: !!customerId },
    { label: "Descrizione lavoro", done: !!description?.trim() && description.trim().length >= 3 },
    { label: "Importo valido", done: total > 0 && !overAllocatedPayments },
    { label: "Stato iniziale", done: !!statusId },
    { label: "Righe ordine coerenti", done: invalidOrderItems.length === 0 },
  ];

  // Payment type change handler
  const handlePaymentTypeChange = (type: PaymentType) => {
    setValue("payment_type", type);
    const defaultNum = type === 'financing' ? 3 : 2;
    setNumInstallments(defaultNum);
    setInstallments(createDefaultInstallments(type, defaultNum));
  };

  // Number of installments change handler
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

  // ── Draft auto-save ─────────────────────────────────────────
  const { loadDraft, saveDraft, clearDraft, draftRestored, setDraftRestored, dateToIso, isoToDate } = useOrderDraft(effectiveCompany?.id);
  const draftSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load draft on mount
  useEffect(() => {
    const draft = loadDraft();
    if (!draft) return;
    reset({
      customer_id: draft.customerId || "",
      order_code: draft.orderCode || "",
      description: draft.description || "",
      internal_notes: draft.internalNotes || "",
      status_id: draft.statusId || "",
      salesperson_id: draft.salespersonId || "",
      salesperson_data: draft.salespersonData || null,
      assigned_to: draft.assignedTo || "",
      destination_warehouse_id: draft.destinationWarehouseId || null,
      sede_id: draft.sedeId ?? null,
      expected_date: isoToDate(draft.expectedDate),
      warehouse_arrival_date: isoToDate(draft.warehouseArrivalDate),
      work_start_date: isoToDate(draft.workStartDate),
      work_end_date: isoToDate(draft.workEndDate),
      payment_type: draft.paymentType || "standard",
      total_amount: draft.totalAmount || "",
      vat_rate: draft.vatRate || "22",
      financing_cost: draft.financingCost || "",
      has_building_bonus: draft.hasBuildingBonus || false,
    });
    if (draft.installments?.length) {
      setInstallments(draft.installments);
      setNumInstallments(draft.installments.length);
    }
    if (draft.orderItems?.length) setOrderItems(draft.orderItems);
    setDraftRestored(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveCompany?.id]);

  // Auto-save draft on every change — debounced 800ms to avoid firing on every keystroke
  useEffect(() => {
    if (createdOrderId) return;
    if (draftSaveTimer.current) clearTimeout(draftSaveTimer.current);
    draftSaveTimer.current = setTimeout(() => {
      saveDraft({
        customerId: customerId || "",
        orderCode: orderCode || "",
        description: description || "",
        internalNotes: internalNotes || "",
        statusId: statusId || "",
        salespersonId: salespersonId || "",
        salespersonData: (salespersonData as { commission_type: string; commission_value: number; compensation_mode?: string | null } | null) || null,
        assignedTo: assignedTo || "",
        destinationWarehouseId: destinationWarehouseId || null,
        sedeId: sedeId ?? null,
        expectedDate: dateToIso(expectedDate),
        warehouseArrivalDate: dateToIso(warehouseArrivalDate),
        workStartDate: dateToIso(workStartDate),
        workEndDate: dateToIso(workEndDate),
        paymentType: paymentType,
        totalAmount: totalAmount || "",
        vatRate: vatRate || "22",
        financingCost: financingCost || "",
        hasBuildingBonus: hasBuildingBonus || false,
        orderItems,
        installments,
      });
    }, 800);
    return () => {
      if (draftSaveTimer.current) clearTimeout(draftSaveTimer.current);
    };
  }, [customerId, orderCode, description, internalNotes, statusId, salespersonId, salespersonData,
      assignedTo, destinationWarehouseId, sedeId,
      expectedDate, warehouseArrivalDate, workStartDate, workEndDate,
      paymentType, totalAmount, vatRate,
      installments, financingCost,
      hasBuildingBonus,
      orderItems, createdOrderId, saveDraft, dateToIso]);

  const handleClearDraft = useCallback(() => {
    clearDraft();
    reset(orderDefaultValues);
    setInstallments(createDefaultInstallments('standard', 2));
    setNumInstallments(2);
    setOrderItems([]);
  }, [clearDraft, reset]);

  const { data: customers = [] } = useCompanyCustomers(effectiveCompany?.id);

  // Fetch order statuses for the company
  const { data: statuses = [] } = useQuery({
    queryKey: ["order-statuses", effectiveCompany?.id],
    queryFn: async () => {
      if (!effectiveCompany?.id) return [];

      const { data, error } = await supabase
        .from("order_statuses")
        .select("id, name, color, position, is_default")
        .eq("company_id", effectiveCompany.id)
        .order("position");

      if (error) throw error;
      return data as OrderStatus[];
    },
    enabled: !!effectiveCompany?.id,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  // Set default status when statuses are loaded
  useEffect(() => {
    if (statuses.length > 0 && !statusId) {
      setValue("status_id", statuses.find((status) => status.is_default)?.id ?? statuses[0].id);
    }
  }, [statuses, statusId, setValue]);

  // 2026-05-26 (audit fix P0): timezone bug.
  // PRIMA: `d.toISOString().split("T")[0]` convertiva una Date locale in UTC.
  // Utente italiano (CET/CEST) che selezionava "30 ottobre" alle 23:30 →
  // toISOString → "2026-10-29T22:00:00Z" → DB salvava expected_date="2026-10-29".
  // La data si "spostava indietro di un giorno" per scelte fatte a fine giornata.
  // ORA: format(d, "yyyy-MM-dd") da date-fns usa fuso orario locale.
  const toDateStr = (d: Date | undefined): string | null =>
    d ? format(d, "yyyy-MM-dd") : null;

  // Create order mutation
  const createOrderMutation = useMutation({
    mutationFn: async () => {
      if (!effectiveCompany?.id) throw new Error("Company not found");

      const values = getValues();
      const totalVal = parseDecimalIT(values.total_amount);
      const vatValue = (parseDecimalIT(values.vat_rate) || 22);
      const fCost = parseDecimalIT(values.financing_cost || "");

      // Compute legacy columns from installments for backward compat
      const installmentsForSave = installments.map(i =>
        i.type === 'balance' ? { ...i, amount: balance } : i
      );
      const legacy = installmentsToLegacyColumns(installmentsForSave);

      const orderData = {
        company_id: effectiveCompany.id,
        customer_id: values.customer_id,
        order_code: (values.order_code || "").trim() || null,
        description: values.description,
        total_amount: totalVal,
        ...legacy,
        payment_type: values.payment_type,
        balance_amount: balance,
        expected_date: toDateStr(values.expected_date),
        internal_notes: values.internal_notes || null,
        current_status_id: values.status_id,
        vat_rate: vatValue,
        warehouse_arrival_date: toDateStr(values.warehouse_arrival_date),
        work_start_date: toDateStr(values.work_start_date),
        work_end_date: toDateStr(values.work_end_date),
        financing_cost: fCost,
        has_building_bonus: values.has_building_bonus,
        assigned_to: values.assigned_to || null,
        destination_warehouse_id: values.destination_warehouse_id || null,
        sede_id: values.sede_id || null,
      };

      const itemsPayload = orderItems.map((item, index) => ({
        name: item.name,
        description: item.description || null,
        quantity: item.quantity,
        status: item.status,
        position: index,
        supplier_id: item.supplier_id || null,
        purchase_price: item.purchase_price || 0,
        vat_rate: item.vat_rate ?? 22,
        stock_item_id: item.stock_item_id || null,
        unit_price: item.unit_price ?? 0,
        discount_percent: item.discount_percent ?? 0,
        standard_cost: item.standard_cost ?? 0,
        is_paid: item.is_paid || false,
        paid_date: item.paid_date || null,
        payment_method: item.payment_method || null,
        deposit_amount: item.deposit_amount || 0,
        deposit_paid: item.deposit_paid || false,
        deposit_paid_date: item.deposit_paid_date || null,
        balance_amount: item.balance_amount || 0,
        balance_paid: item.balance_paid || false,
        balance_paid_date: item.balance_paid_date || null,
        balance_expected_date: item.balance_expected_date || null,
        deposit_expected_date: item.deposit_expected_date || null,
      }));

      const salespersonPayload = (values.salesperson_id && values.salesperson_data)
        ? {
            salesperson_id: values.salesperson_id,
            commission_type: values.salesperson_data.commission_type,
            commission_value: values.salesperson_data.commission_value,
            compensation_mode: values.salesperson_data.compensation_mode || null,
          }
        : null;

      // Installments payload for the new table
      const installmentsPayload = installmentsForSave.map(i => ({
        position: i.position,
        label: i.label,
        type: i.type,
        amount: i.amount,
        is_paid: i.is_paid,
        paid_date: i.paid_date || null,
        expected_date: i.expected_date || null,
      }));

      const createOrderAtomic = supabase.rpc as unknown as (
        fn: "create_order_atomic",
        args: Record<string, unknown>
      ) => Promise<{ data: { order_id: string } | null; error: { message: string } | null }>;
      const { data, error } = await createOrderAtomic("create_order_atomic", {
        p_order_data: orderData,
        p_items: itemsPayload,
        p_salesperson: salespersonPayload,
        p_user_id: user!.id,
        p_installments: installmentsPayload,
      });

      if (error) throw error;
      const result = data as unknown as { id: string; success: boolean };
      if (!result || !result.id) {
        throw new Error("Risposta inattesa dalla funzione atomica");
      }

      // v8.6.42 — sede_id non è nel RPC create_order_atomic, viene
      // settato con un UPDATE follow-up (best-effort, non blocca l'ordine).
      // La colonna orders.sede_id è FK opzionale (vedi migration create_sedi_system).
      if (values.sede_id) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: sedeErr } = await (supabase as any)
          .from("orders")
          .update({ sede_id: values.sede_id })
          .eq("id", result.id);
        if (sedeErr) {
          console.warn("[CreateOrder] update sede_id fallito (ordine creato comunque):", sedeErr.message);
        }
      }

      return result;
    },
    onSuccess: async (order) => {
      clearDraft();
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["margin"] });
      queryClient.invalidateQueries({ queryKey: ["break-even"] });
      queryClient.invalidateQueries({ queryKey: ["cruscotto"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["cashflow"] });
      setCreatedOrderId(order.id);

      // v8.6.89 — analytics
      // 2026-05-26 (audit fix P0): `values` non è in scope qui (era una const
      // della mutationFn). Inoltre le chiavi erano in italiano (importo_totale,
      // cliente_id) mentre il form schema usa nomi inglesi (total_amount,
      // customer_id). Risultato: ReferenceError silenzioso interrompeva
      // onSuccess → niente navigate, niente upload allegati, niente toast.
      // FIX: leggo i values direttamente dal form via getValues(), e wrap
      // in try/catch così un fail analytics non rompe il flow utente.
      try {
        const formValues = getValues();
        track(ANALYTICS_EVENTS.ORDER_CREATED, {
          order_id: order.id,
          order_value: parseDecimalIT(formValues.total_amount),
          has_customer: !!formValues.customer_id,
          plan_slug: currentPlan?.slug,
        });
      } catch (analyticsErr) {
        // Non-blocking: i log analytics non devono fermare il salvataggio
        logger.warn("[CreateOrder] analytics track failed", analyticsErr);
      }

      // Upload pending files
      if (pendingFiles.length > 0) {
        let uploaded = 0;
        for (const pf of pendingFiles) {
          try {
            const timestamp = Date.now();
            const sanitizedName = pf.file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
            const filePath = `orders/${order.id}/${timestamp}-${sanitizedName}`;

            const { error: uploadError } = await supabase.storage
              .from("order-attachments")
              .upload(filePath, pf.file);
            if (uploadError) throw uploadError;

            const { error: dbError } = await supabase
              .from("order_attachments")
              .insert({
                order_id: order.id,
                file_name: pf.file.name,
                file_url: filePath,
                file_type: pf.file.type,
                file_size: pf.file.size,
                uploaded_by: user!.id,
                visible_to_customer: pf.visibleToCustomer,
              });
            if (dbError) throw dbError;
            uploaded++;
          } catch (err) {
            logger.error("File upload error:", err);
            toast.error("Errore caricamento", { description: `Errore nel caricare "${pf.file.name}".` });
          }
        }
        setPendingFiles([]);
        queryClient.invalidateQueries({ queryKey: ["order-attachments", order.id] });
        toast.success("Commessa creata", { description: `Commessa creata con ${uploaded} document${uploaded > 1 ? 'i' : 'o'}.` });
      } else {
        toast.success("Commessa creata", { description: "La commessa è stata creata con successo." });
      }

      // Auto-navigate to the new order detail
      navigate(`/azienda/ordini/${order.id}`);
    },
    onError: (error) => {
      // 2026-05-27 (audit fix P1): mapping errori postgres → messaggi
      // italiani user-friendly. Prima l'utente edile vedeva stringhe come
      // "duplicate key value violates unique constraint orders_order_code_key"
      // senza capire cosa fare.
      const { title, description } = friendlyPostgresError(error, {
        operation: "creazione commessa",
      });
      toast.error(title, { description });
      logger.error("Create order error:", error);
    },
  });

  const onSubmit = (values: OrderFormValues) => {
    const totalVal = parseDecimalIT(values.total_amount);
    if (totalVal <= 0) {
      toast.error("Importo non valido", { description: "L'importo totale deve essere maggiore di zero." });
      return;
    }

    if (invalidOrderItems.length > 0) {
      toast.error("Articoli non validi", { description: "Verifica nome, quantità, costo d'acquisto e IVA di tutte le righe." });
      return;
    }

    if (overAllocatedPayments) {
      toast.error("Scadenze non coerenti", { description: "Acconti, finanziamento e costi finanziaria superano il totale IVA inclusa." });
      return;
    }

    // Warning: expected dates in the past
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    installments.forEach(inst => {
      if (inst.expected_date && new Date(inst.expected_date) < now) {
        toast.info("Attenzione", { description: `La data prevista di "${inst.label}" è nel passato.` });
      }
    });

    createOrderMutation.mutate();
  };

  const onFormError = () => {
    // Show first Zod validation error as toast
    const firstError = Object.values(errors)[0];
    if (firstError?.message) {
      toast.error("Campo obbligatorio", { description: String(firstError.message) });
    }
  };

  const handleCustomerCreated = (newCustomerId: string) => {
    setValue("customer_id", newCustomerId);
  };

  // ── Date picker helper ──────────────────────────────────────
  const DatePickerField = ({ name, label: fieldLabel }: { name: "expected_date" | "warehouse_arrival_date" | "work_start_date" | "work_end_date"; label: string }) => (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <div className="space-y-2">
          <Label>{fieldLabel}</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "w-full justify-start text-left font-normal border-slate-200 hover:border-orange-300 hover:bg-orange-50/40",
                  !field.value && "text-slate-400"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4 text-orange-500" />
                {field.value ? format(field.value, "d MMMM yyyy", { locale: it }) : <span>Seleziona data</span>}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus className="pointer-events-auto" />
            </PopoverContent>
          </Popover>
        </div>
      )}
    />
  );

  // v8.6.84 — Wall di blocco creazione ordini esteso a TUTTI i piani limitati
  // (non solo Scopri). Esempio: render-only / render-serramenti con max_orders=3.
  if (!canCreateOrder) {
    return (
      <div className="max-w-lg mx-auto mt-12 px-4">
        {isScopriPlan ? (
          <UpgradeScopriWall type="max_orders" inline />
        ) : (
          <div className="rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 p-6 text-center space-y-4">
            <div className="text-4xl">🏗️</div>
            <div>
              <h3 className="font-semibold text-base text-gray-900 mb-1">
                Hai raggiunto il limite di commesse attive
              </h3>
              <p className="text-sm text-gray-600 max-w-md mx-auto leading-relaxed">
                Il piano <strong>{currentPlan?.name ?? "corrente"}</strong> include un massimo
                di <strong>{currentPlan?.max_orders ?? 3} commesse attive</strong> contemporaneamente.
                Completa o archivia una commessa esistente per crearne di nuove,
                oppure passa a un piano superiore.
              </p>
            </div>
            <div className="flex items-center justify-center gap-3 flex-wrap">
              <Button
                onClick={() => navigate("/azienda/impostazioni/abbonamento")}
                className="gap-2 bg-[#E8521A] hover:bg-[#d44714] text-white"
              >
                <Sparkles className="h-4 w-4" />
                Gestisci abbonamento
                <ArrowRight className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                onClick={() => navigate("/azienda/ordini")}
              >
                Vai alle commesse
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {remainingOrders <= 0
                ? "0 commesse rimanenti su questo piano"
                : `${remainingOrders} commesse rimanenti`}
            </p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <QuotePageHeader
        icon={<ClipboardList className="h-5 w-5" />}
        title="Nuova Commessa"
        subtitle="Crea una nuova commessa per un cliente"
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
      {draftRestored && !createdOrderId && (
        <Alert className="border-amber-300 bg-gradient-to-br from-amber-50 to-orange-50">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertDescription className="flex items-center justify-between">
            <span className="text-amber-900 font-medium">
              Bozza recuperata — i dati precedenti sono stati ripristinati.
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="ml-4 shrink-0 border-amber-300 hover:bg-amber-100"
              onClick={handleClearDraft}
            >
              <Trash2 className="h-3 w-3 mr-1" />
              Cancella bozza
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <Alert className="border-slate-200 bg-white">
        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
        <AlertDescription>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium text-slate-900">Checklist ordine</p>
              <p className="text-xs text-slate-500">Controlli minimi prima del salvataggio.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {completionChecks.map((check) => (
                <span
                  key={check.label}
                  className={cn(
                    "rounded-full border px-2 py-1 text-xs font-medium",
                    check.done
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-amber-200 bg-amber-50 text-amber-700"
                  )}
                >
                  {check.done ? "OK" : "Da fare"} · {check.label}
                </span>
              ))}
            </div>
          </div>
        </AlertDescription>
      </Alert>

      <form onSubmit={rhfHandleSubmit(onSubmit, onFormError)} className="space-y-6">
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Main Form */}
          <QuoteCard title="Dettagli Commessa" icon={<ClipboardList className="h-4 w-4" />}>
            <div className="space-y-4">
              {/* Order Code */}
              <Controller
                control={control}
                name="order_code"
                render={({ field }) => (
                  <div className="space-y-2">
                    <Label htmlFor="orderCode">Codice Commessa</Label>
                    <Input
                      id="orderCode"
                      {...field}
                      placeholder="es. ORD-2026-001"
                      maxLength={50}
                    />
                  </div>
                )}
              />

              {/* Customer with inline creation */}
              <div className="space-y-2">
                <Label htmlFor="customer">Cliente *</Label>
                <div className="flex gap-2">
                  <Controller
                    control={control}
                    name="customer_id"
                    render={({ field }) => (
                      <Select value={field.value || "__none__"} onValueChange={(value) => field.onChange(value === "__none__" ? "" : value)}>
                        <SelectTrigger className="flex-1">
                          <SelectValue placeholder="Seleziona un cliente" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__" disabled>Seleziona un cliente</SelectItem>
                          {customers.map((customer) => (
                            <SelectItem key={customer.id} value={customer.id}>
                              {customer.first_name} {customer.last_name} ({customer.email})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
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
                {errors.customer_id && (
                  <p className="text-sm text-destructive">{errors.customer_id.message}</p>
                )}
              </div>

              {/* Description */}
              <Controller
                control={control}
                name="description"
                render={({ field }) => (
                  <div className="space-y-2">
                    <Label htmlFor="description">Descrizione Lavoro *</Label>
                    <Textarea
                      id="description"
                      {...field}
                      placeholder="Descrivi il lavoro da eseguire..."
                      rows={4}
                      maxLength={1000}
                    />
                    {errors.description && (
                      <p className="text-sm text-destructive">{errors.description.message}</p>
                    )}
                  </div>
                )}
              />

              {/* Status */}
              <Controller
                control={control}
                name="status_id"
                render={({ field }) => (
                  <div className="space-y-2">
                    <Label>Stato Iniziale</Label>
                    <Select value={field.value || "__none__"} onValueChange={(value) => field.onChange(value === "__none__" ? "" : value)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleziona stato" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__" disabled>Seleziona stato</SelectItem>
                        {statuses.map((status) => (
                          <SelectItem key={status.id} value={status.id}>
                            {status.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              />

              {/* Internal Notes */}
              <Controller
                control={control}
                name="internal_notes"
                render={({ field }) => (
                  <div className="space-y-2">
                    <Label htmlFor="notes">Note Interne</Label>
                    <Textarea
                      id="notes"
                      {...field}
                      placeholder="Note visibili solo all'azienda..."
                      rows={3}
                      maxLength={1000}
                    />
                  </div>
                )}
              />

              {/* Salesperson Select */}
              <SalespersonSelect
                value={salespersonId || ""}
                onChange={(id, salesperson) => {
                  setValue("salesperson_id", id);
                  setValue("salesperson_data", salesperson ? {
                    commission_type: salesperson.commission_type,
                    commission_value: salesperson.commission_value,
                    compensation_mode: salesperson.compensation_mode || null,
                  } : null);
                }}
              />

              {/* Assigned To Select */}
              <AssignedToSelect
                value={assignedTo || ""}
                onChange={(val) => setValue("assigned_to", val)}
                disabled={onlyAssigned}
              />

              {/* Magazzino destinazione materiali */}
              <div className="space-y-2">
                <Label>Magazzino Destinazione Materiali</Label>
                <WarehouseSelect
                  value={destinationWarehouseId}
                  onChange={(id) => setValue("destination_warehouse_id", id)}
                  nullable
                  placeholder="Magazzino predefinito"
                />
              </div>

              {/* v8.6.42 — Sede operativa (showroom/magazzino/ufficio) per
                  analytics disaggregati su cruscotto e marginalità. */}
              <SedeSelect
                label="Sede operativa"
                placeholder="Sede operativa (opzionale)"
                value={sedeId}
                onChange={(id) => setValue("sede_id", id)}
                className="space-y-2"
              />
            </div>
          </QuoteCard>

          <FinancialSummary
            totalAmount={totalAmount || ""}
            vatRate={vatRate || "22"}
            paymentType={paymentType}
            installments={installments}
            onInstallmentsChange={setInstallments}
            numInstallments={numInstallments}
            onNumInstallmentsChange={handleNumInstallmentsChange}
            onTotalAmountChange={(val) => setValue("total_amount", val)}
            onVatRateChange={(val) => setValue("vat_rate", val)}
            onPaymentTypeChange={handlePaymentTypeChange}
            balance={balance}
            hasBuildingBonus={hasBuildingBonus}
            onHasBuildingBonusChange={(val) => setValue("has_building_bonus", val)}
            financingCost={financingCost || ""}
            onFinancingCostChange={(val) => setValue("financing_cost", val)}
          />
        </div>

        {/* Customer Dates Card */}
        <QuoteCard
          title="Tempistiche per il Cliente"
          icon={<CalendarIcon className="h-4 w-4" />}
        >
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <DatePickerField name="expected_date" label="Data Prevista" />
            <DatePickerField name="warehouse_arrival_date" label="Arrivo Merce in Magazzino" />
            <DatePickerField name="work_start_date" label="Inizio Lavori" />
            <DatePickerField name="work_end_date" label="Fine Lavori" />
          </div>
        </QuoteCard>

        {/* Order Items */}
        <OrderItemsList
          items={orderItems}
          onItemsChange={setOrderItems}
          editable={!createdOrderId}
          showStatusControls={false}
        />

        {/* Order Attachments */}
        {createdOrderId ? (
          <OrderAttachments orderId={createdOrderId} editable={true} />
        ) : (
          <PendingFilesUpload files={pendingFiles} onFilesChange={setPendingFiles} />
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3 sticky bottom-0 bg-gradient-to-t from-slate-50 via-slate-50 to-transparent pt-4 pb-2 -mx-4 px-4 sm:mx-0 sm:px-0">
          {createdOrderId ? (
            <QuotePrimaryButton onClick={() => navigate(`/azienda/ordini/${createdOrderId}`)}>
              Vai alla Commessa
            </QuotePrimaryButton>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate("/azienda/ordini")}
              >
                Annulla
              </Button>
              <QuotePrimaryButton type="submit" disabled={createOrderMutation.isPending}>
                {createOrderMutation.isPending ? "Creazione..." : "Crea Commessa"}
              </QuotePrimaryButton>
            </>
          )}
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

export default function CreateOrder() {
  return (
    <ErrorBoundary title="Errore nella creazione commessa">
      <CreateOrderInner />
    </ErrorBoundary>
  );
}
