import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CalendarIcon, Plus, Paperclip, Trash2, AlertTriangle } from "lucide-react";
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
import { SalespersonSelect } from "@/components/salespeople/SalespersonSelect";
import { AssignedToSelect } from "@/components/orders/AssignedToSelect";
import { usePermissions } from "@/hooks/usePermissions";
import { type OrderCustomer as Customer, type OrderStatus } from "@/lib/orderUtils";

export default function CreateOrder() {
  const navigate = useNavigate();
  const { user, effectiveCompany } = useAuth();
  
  const queryClient = useQueryClient();
  const { onlyAssigned } = usePermissions();

  const [customerId, setCustomerId] = useState("");
  const [orderCode, setOrderCode] = useState("");
  const [description, setDescription] = useState("");
  const [expectedDate, setExpectedDate] = useState<Date | undefined>();
  const [internalNotes, setInternalNotes] = useState("");
  const [statusId, setStatusId] = useState("");
  const [createdOrderId, setCreatedOrderId] = useState<string | null>(null);

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
  // Financing payment status
  const [financingPaid, setFinancingPaid] = useState(false);
  const [financingPaidDate, setFinancingPaidDate] = useState<Date | undefined>();
  const [financingExpectedDate, setFinancingExpectedDate] = useState<Date | undefined>();
  const [financingCost, setFinancingCost] = useState("");
  const [hasBuildingBonus, setHasBuildingBonus] = useState(false);

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

  // Assigned to state
  const [assignedTo, setAssignedTo] = useState("");

  // Auto-assign for staff with onlyAssigned
  useEffect(() => {
    if (onlyAssigned && user?.id) {
      setAssignedTo(user.id);
    }
  }, [onlyAssigned, user?.id]);

  // Draft auto-save
  const { loadDraft, saveDraft, clearDraft, draftRestored, setDraftRestored, dateToIso, isoToDate } = useOrderDraft(effectiveCompany?.id);

  // Load draft on mount
  useEffect(() => {
    const draft = loadDraft();
    if (!draft) return;
    setCustomerId(draft.customerId || "");
    setOrderCode(draft.orderCode || "");
    setDescription(draft.description || "");
    setInternalNotes(draft.internalNotes || "");
    if (draft.statusId) setStatusId(draft.statusId);
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
    setFinancingPaid(draft.financingPaid || false);
    setFinancingPaidDate(isoToDate(draft.financingPaidDate));
    setFinancingExpectedDate(isoToDate(draft.financingExpectedDate));
    setFinancingCost(draft.financingCost || "");
    setHasBuildingBonus(draft.hasBuildingBonus || false);
    setDraftRestored(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveCompany?.id]);

  // Auto-save draft on every change (debounced in hook)
  useEffect(() => {
    if (createdOrderId) return; // Don't save after order is created
    saveDraft({
      customerId, orderCode, description, internalNotes, statusId,
      salespersonId, salespersonData,
      expectedDate: dateToIso(expectedDate),
      warehouseArrivalDate: dateToIso(warehouseArrivalDate),
      workStartDate: dateToIso(workStartDate),
      workEndDate: dateToIso(workEndDate),
      paymentType, totalAmount, depositAmount, deposit2Amount, financingAmount, vatRate,
      depositPaid, depositPaidDate: dateToIso(depositPaidDate), depositExpectedDate: dateToIso(depositExpectedDate),
      deposit2Paid, deposit2PaidDate: dateToIso(deposit2PaidDate), deposit2ExpectedDate: dateToIso(deposit2ExpectedDate),
      balancePaid, balancePaidDate: dateToIso(balancePaidDate), balanceExpectedDate: dateToIso(balanceExpectedDate),
      financingPaid, financingPaidDate: dateToIso(financingPaidDate), financingExpectedDate: dateToIso(financingExpectedDate),
      financingCost,
      hasBuildingBonus,
      orderItems,
    });
  }, [customerId, orderCode, description, internalNotes, statusId, salespersonId, salespersonData,
      expectedDate, warehouseArrivalDate, workStartDate, workEndDate,
      paymentType, totalAmount, depositAmount, deposit2Amount, financingAmount, vatRate,
      depositPaid, depositPaidDate, depositExpectedDate,
      deposit2Paid, deposit2PaidDate, deposit2ExpectedDate,
      balancePaid, balancePaidDate, balanceExpectedDate,
      financingPaid, financingPaidDate, financingExpectedDate, financingCost,
      hasBuildingBonus,
      orderItems, createdOrderId, saveDraft, dateToIso]);

  const handleClearDraft = useCallback(() => {
    clearDraft();
    setCustomerId(""); setOrderCode(""); setDescription(""); setInternalNotes("");
    setStatusId(""); setSalespersonId(""); setSalespersonData(null);
    setExpectedDate(undefined); setWarehouseArrivalDate(undefined);
    setWorkStartDate(undefined); setWorkEndDate(undefined);
    setPaymentType("standard"); setTotalAmount(""); setDepositAmount("");
    setDeposit2Amount(""); setFinancingAmount(""); setVatRate("22");
    setDepositPaid(false); setDepositPaidDate(undefined); setDepositExpectedDate(undefined);
    setDeposit2Paid(false); setDeposit2PaidDate(undefined); setDeposit2ExpectedDate(undefined);
    setBalancePaid(false); setBalancePaidDate(undefined); setBalanceExpectedDate(undefined);
    setFinancingPaid(false); setFinancingPaidDate(undefined); setFinancingExpectedDate(undefined);
    setFinancingCost(""); setHasBuildingBonus(false);
    setOrderItems([]);
  }, [clearDraft]);

  // Calculate balance
  const total = parseFloat(totalAmount) || 0;
  const deposit = parseFloat(depositAmount) || 0;
  const deposit2 = parseFloat(deposit2Amount) || 0;
  const financing = parseFloat(financingAmount) || 0;
  const vat = parseFloat(vatRate) || 22;
  const totalWithVat = total * (1 + vat / 100);
  const balance = paymentType === 'standard'
    ? Math.max(0, totalWithVat - deposit - deposit2)
    : Math.max(0, totalWithVat - deposit - financing);

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

  // Fetch order statuses for the company (filtered by company_id)
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
      const firstStatus = statuses[0];
      setStatusId(firstStatus.id);
    }
  }, [statuses, statusId]);

  // Utility: converte Date | undefined in stringa ISO o null
  const toDateStr = (d: Date | undefined): string | null =>
    d ? d.toISOString().split("T")[0] : null;

  // Create order mutation — usa la funzione atomica lato DB:
  // tutto avviene in una singola transazione PostgreSQL, eliminando
  // race condition sul magazzino e stati inconsistenti in caso di errore.
  const createOrderMutation = useMutation({
    mutationFn: async () => {
      if (!effectiveCompany?.id) throw new Error("Company not found");

      const vatValue  = parseFloat(vatRate) || 22;
      const fCost     = parseFloat(financingCost) || 0;
      const financing = parseFloat(financingAmount) || 0;

      const orderData = {
        company_id:              effectiveCompany.id,
        customer_id:             customerId,
        order_code:              orderCode.trim() || null,
        description,
        total_amount:            total,
        deposit_amount:          deposit,
        deposit_2_amount:        deposit2,
        financing_amount:        financing,
        payment_type:            paymentType,
        balance_amount:          balance,
        expected_date:           toDateStr(expectedDate),
        internal_notes:          internalNotes || null,
        current_status_id:       statusId,
        vat_rate:                vatValue,
        warehouse_arrival_date:  toDateStr(warehouseArrivalDate),
        work_start_date:         toDateStr(workStartDate),
        work_end_date:           toDateStr(workEndDate),
        deposit_paid:            depositPaid,
        deposit_paid_date:       toDateStr(depositPaidDate),
        deposit_2_paid:          deposit2Paid,
        deposit_2_paid_date:     toDateStr(deposit2PaidDate),
        balance_paid:            balancePaid,
        balance_paid_date:       toDateStr(balancePaidDate),
        balance_expected_date:   toDateStr(balanceExpectedDate),
        deposit_expected_date:   toDateStr(depositExpectedDate),
        deposit_2_expected_date: toDateStr(deposit2ExpectedDate),
        financing_paid:          financingPaid,
        financing_paid_date:     toDateStr(financingPaidDate),
        financing_expected_date: toDateStr(financingExpectedDate),
        financing_cost:          fCost,
        has_building_bonus:      hasBuildingBonus,
        assigned_to:             assignedTo || null,
      };

      const itemsPayload = orderItems.map((item, index) => ({
        name:                  item.name,
        description:           item.description || null,
        quantity:              item.quantity,
        status:                item.status,
        position:              index,
        supplier_id:           item.supplier_id || null,
        purchase_price:        item.purchase_price || 0,
        vat_rate:              item.vat_rate ?? 22,
        stock_item_id:         item.stock_item_id || null,
        unit_price:            0,
        discount_percent:      0,
        standard_cost:         0,
        is_paid:               item.is_paid || false,
        paid_date:             item.paid_date || null,
        payment_method:        item.payment_method || null,
        deposit_amount:        item.deposit_amount || 0,
        deposit_paid:          item.deposit_paid || false,
        deposit_paid_date:     item.deposit_paid_date || null,
        balance_amount:        item.balance_amount || 0,
        balance_paid:          item.balance_paid || false,
        balance_paid_date:     item.balance_paid_date || null,
        balance_expected_date: item.balance_expected_date || null,
        deposit_expected_date: item.deposit_expected_date || null,
      }));

      const salespersonPayload = (salespersonId && salespersonData)
        ? {
            salesperson_id:   salespersonId,
            commission_type:  salespersonData.commission_type,
            commission_value: salespersonData.commission_value,
          }
        : null;

      const { data, error } = await supabase.rpc("create_order_atomic" as any, {
        p_order_data:  orderData,
        p_items:       itemsPayload,
        p_salesperson: salespersonPayload,
        p_user_id:     user!.id,
      });

      if (error) throw error;
      const result = data as unknown as { id: string; success: boolean };
      if (!result || !result.id) {
        throw new Error("Risposta inattesa dalla funzione atomica");
      }

      return result;
    },
    onSuccess: (order) => {
      clearDraft();
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      toast.success("Ordine creato", { description: "L'ordine è stato creato. Ora puoi caricare i documenti." });
      setCreatedOrderId(order.id);
    },
    onError: (error) => {
      toast.error("Errore", { description: "Si è verificato un errore durante la creazione dell'ordine." });
      console.error("Create order error:", error);
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

    if (total <= 0) {
      toast.error("Importo non valido", { description: "L'importo totale deve essere maggiore di zero." });
      return;
    }

    // Validate order items
    if (orderItems.length > 0) {
      const invalidItems = orderItems.filter(
        (item) => !item.name.trim() || item.quantity < 1 || (item.purchase_price !== undefined && item.purchase_price < 0)
      );
      if (invalidItems.length > 0) {
        toast.error("Articoli non validi", { description: "Verifica che tutti gli articoli abbiano un nome, quantità ≥ 1 e prezzo d'acquisto non negativo." });
        return;
      }
    }

    // Warning: payment dates before order creation
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    if (depositExpectedDate && depositExpectedDate < now) {
      toast.info("Attenzione", { description: "La data prevista dell'acconto 1 è nel passato." });
    }
    if (deposit2ExpectedDate && deposit2ExpectedDate < now) {
      toast.info("Attenzione", { description: "La data prevista dell'acconto 2 è nel passato." });
    }
    if (balanceExpectedDate && balanceExpectedDate < now) {
      toast.info("Attenzione", { description: "La data prevista del saldo è nel passato." });
    }

    createOrderMutation.mutate();
  };

  const handleCustomerCreated = (newCustomerId: string) => {
    setCustomerId(newCustomerId);
  };

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
              <Select value={customerId || undefined} onValueChange={setCustomerId}>
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

              {/* Status */}
              <div className="space-y-2">
                <Label>Stato Iniziale</Label>
              <Select value={statusId || undefined} onValueChange={setStatusId}>
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

              {/* Assigned To Select */}
              <AssignedToSelect value={assignedTo} onChange={setAssignedTo} disabled={onlyAssigned} />
            </CardContent>
          </Card>

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
            financingPaid={financingPaid}
            financingPaidDate={financingPaidDate}
            financingExpectedDate={financingExpectedDate}
            financingCost={financingCost}
            onFinancingPaidChange={setFinancingPaid}
            onFinancingPaidDateChange={setFinancingPaidDate}
            onFinancingExpectedDateChange={setFinancingExpectedDate}
            onFinancingCostChange={setFinancingCost}
            hasBuildingBonus={hasBuildingBonus}
            onHasBuildingBonusChange={setHasBuildingBonus}
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
          editable={!createdOrderId}
          showStatusControls={false}
        />

        {/* Order Attachments */}
        {createdOrderId ? (
          <OrderAttachments orderId={createdOrderId} editable={true} />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Paperclip className="h-5 w-5" />
                Documenti Ordine
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-4 text-muted-foreground">
                <p>I documenti potranno essere caricati dopo aver salvato l'ordine.</p>
              </div>
            </CardContent>
          </Card>
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
