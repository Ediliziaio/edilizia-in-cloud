import { useState, useEffect, useCallback } from "react";
import { logger } from "@/utils/logger";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, CalendarIcon, Plus, Trash2, AlertTriangle } from "lucide-react";
import { useOrderDraft } from "@/hooks/useOrderDraft";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { CreateCustomerDialog } from "@/components/orders/CreateCustomerDialog";
import { OrderItemsList, OrderItem } from "@/components/orders/OrderItemsList";
import { FinancialSummary, PaymentType } from "@/components/orders/FinancialSummary";
import { OrderAttachments } from "@/components/orders/OrderAttachments";
import { PendingFilesUpload, type PendingFile } from "@/components/orders/PendingFilesUpload";
import { SalespersonSelect } from "@/components/salespeople/SalespersonSelect";
import { AssignedToSelect } from "@/components/orders/AssignedToSelect";
import { usePermissions } from "@/hooks/usePermissions";
import {
  type OrderCustomer as Customer,
  type OrderStatus,
  type Installment,
  createDefaultInstallments,
  installmentsToLegacyColumns,
} from "@/lib/orderUtils";
import { orderSchema, orderDefaultValues, type OrderFormValues } from "@/lib/orderSchema";

export default function CreateOrder() {
  const navigate = useNavigate();
  const { user, effectiveCompany } = useAuth();
  const queryClient = useQueryClient();
  const { onlyAssigned } = usePermissions();

  // ── react-hook-form ──────────────────────────────────────────
  const form = useForm<OrderFormValues>({
    resolver: zodResolver(orderSchema),
    defaultValues: orderDefaultValues,
  });

  const { control, watch, setValue, getValues, reset, handleSubmit: rhfHandleSubmit, formState: { errors } } = form;

  // Watch fields needed for computed values & effects
  const customerId = watch("customer_id");
  const paymentType = watch("payment_type") as PaymentType;
  const totalAmount = watch("total_amount");
  const vatRate = watch("vat_rate");
  const financingCost = watch("financing_cost");
  const hasBuildingBonus = watch("has_building_bonus");
  const salespersonId = watch("salesperson_id");
  const salespersonData = watch("salesperson_data");
  const statusId = watch("status_id");
  const expectedDate = watch("expected_date");
  const warehouseArrivalDate = watch("warehouse_arrival_date");
  const workStartDate = watch("work_start_date");
  const workEndDate = watch("work_end_date");
  const orderCode = watch("order_code");
  const description = watch("description");
  const internalNotes = watch("internal_notes");
  const assignedTo = watch("assigned_to");

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

  // Calculate balance
  const total = parseFloat(totalAmount) || 0;
  const vat = parseFloat(vatRate) || 22;
  const totalWithVat = total * (1 + vat / 100);
  const nonBalanceSum = installments
    .filter(i => i.type !== 'balance')
    .reduce((sum, i) => sum + i.amount, 0);
  const balance = Math.max(0, totalWithVat - nonBalanceSum);

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
      assigned_to: "",
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

  // Auto-save draft on every change (debounced in hook)
  useEffect(() => {
    if (createdOrderId) return;
    saveDraft({
      customerId: customerId || "",
      orderCode: orderCode || "",
      description: description || "",
      internalNotes: internalNotes || "",
      statusId: statusId || "",
      salespersonId: salespersonId || "",
      salespersonData: (salespersonData as { commission_type: string; commission_value: number } | null) || null,
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
  }, [customerId, orderCode, description, internalNotes, statusId, salespersonId, salespersonData,
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

  // Fetch order statuses for the company
  const { data: statuses = [] } = useQuery({
    queryKey: ["order-statuses", effectiveCompany?.id],
    queryFn: async () => {
      if (!effectiveCompany?.id) return [];
      
      const { data, error } = await supabase
        .from("order_statuses")
        .select("id, name, position")
        .eq("company_id", effectiveCompany.id)
        .order("position");

      if (error) throw error;
      return data as OrderStatus[];
    },
    enabled: !!effectiveCompany?.id,
  });

  // Set default status when statuses are loaded
  useEffect(() => {
    if (statuses.length > 0 && !statusId) {
      setValue("status_id", statuses[0].id);
    }
  }, [statuses, statusId, setValue]);

  const toDateStr = (d: Date | undefined): string | null =>
    d ? d.toISOString().split("T")[0] : null;

  // Create order mutation
  const createOrderMutation = useMutation({
    mutationFn: async () => {
      if (!effectiveCompany?.id) throw new Error("Company not found");

      const values = getValues();
      const totalVal = parseFloat(values.total_amount) || 0;
      const vatValue = parseFloat(values.vat_rate) || 22;
      const fCost = parseFloat(values.financing_cost || "") || 0;

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
        unit_price: 0,
        discount_percent: 0,
        standard_cost: 0,
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

      const { data, error } = await supabase.rpc("create_order_atomic" as any, {
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

      return result;
    },
    onSuccess: async (order) => {
      clearDraft();
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      setCreatedOrderId(order.id);

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
        if (uploaded > 0) {
          toast.success("Ordine creato", { description: `Ordine creato con ${uploaded} document${uploaded > 1 ? 'i' : 'o'}.` });
        }
      } else {
        toast.success("Ordine creato", { description: "L'ordine è stato creato con successo." });
      }
    },
    onError: (error) => {
      toast.error("Errore", { description: "Si è verificato un errore durante la creazione dell'ordine." });
     logger.rerror("Create order error:", error);
    },
  });

  const onSubmit = (values: OrderFormValues) => {
    const totalVal = parseFloat(values.total_amount) || 0;
    if (totalVal <= 0) {
      toast.error("Importo non valido", { description: "L'importo totale deve essere maggiore di zero." });
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
                  "w-full justify-start text-left font-normal",
                  !field.value && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Nuovo Ordine</h1>
          <p className="text-muted-foreground">
            Crea un nuovo ordine per un cliente
          </p>
        </div>
      </div>

      {/* Draft restored banner */}
      {draftRestored && !createdOrderId && (
        <Alert className="border-yellow-500 bg-yellow-50 dark:bg-yellow-950/30">
          <AlertTriangle className="h-4 w-4 text-yellow-600" />
          <AlertDescription className="flex items-center justify-between">
            <span className="text-yellow-800 dark:text-yellow-200">
              Bozza recuperata — i dati precedenti sono stati ripristinati.
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="ml-4 shrink-0"
              onClick={handleClearDraft}
            >
              <Trash2 className="h-3 w-3 mr-1" />
              Cancella bozza
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <form onSubmit={rhfHandleSubmit(onSubmit, onFormError)} className="space-y-6">
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Main Form */}
          <Card>
            <CardHeader>
              <CardTitle>Dettagli Ordine</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Order Code */}
              <Controller
                control={control}
                name="order_code"
                render={({ field }) => (
                  <div className="space-y-2">
                    <Label htmlFor="orderCode">Codice Ordine</Label>
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
                      <Select value={field.value || undefined} onValueChange={field.onChange}>
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
                    <Select value={field.value || undefined} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleziona stato" />
                      </SelectTrigger>
                      <SelectContent>
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
                  } : null);
                }}
              />

              {/* Assigned To Select */}
              <AssignedToSelect
                value={assignedTo || ""}
                onChange={(val) => setValue("assigned_to", val)}
                disabled={onlyAssigned}
              />
            </CardContent>
          </Card>

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
        <Card>
          <CardHeader>
            <CardTitle>Tempistiche per il Cliente</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <DatePickerField name="expected_date" label="Data Prevista" />
              <DatePickerField name="warehouse_arrival_date" label="Arrivo Merce in Magazzino" />
              <DatePickerField name="work_start_date" label="Inizio Lavori" />
              <DatePickerField name="work_end_date" label="Fine Lavori" />
            </div>
          </CardContent>
        </Card>

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
        <div className="flex justify-end gap-4">
          {createdOrderId ? (
            <Button onClick={() => navigate(`/azienda/ordini/${createdOrderId}`)}>
              Vai all'Ordine
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate("/azienda/ordini")}
              >
                Annulla
              </Button>
              <Button type="submit" disabled={createOrderMutation.isPending}>
                {createOrderMutation.isPending ? "Creazione..." : "Crea Ordine"}
              </Button>
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
