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

interface OrderStatus {
  id: string;
  name: string;
  position: number;
}

export default function CreateOrder() {
  const navigate = useNavigate();
  const { user, effectiveCompany } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

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
      orderItems,
    });
  }, [customerId, orderCode, description, internalNotes, statusId, salespersonId, salespersonData,
      expectedDate, warehouseArrivalDate, workStartDate, workEndDate,
      paymentType, totalAmount, depositAmount, deposit2Amount, financingAmount, vatRate,
      depositPaid, depositPaidDate, depositExpectedDate,
      deposit2Paid, deposit2PaidDate, deposit2ExpectedDate,
      balancePaid, balancePaidDate, balanceExpectedDate,
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
    setOrderItems([]);
  }, [clearDraft]);

  // Calculate balance
  const total = parseFloat(totalAmount) || 0;
  const deposit = parseFloat(depositAmount) || 0;
  const deposit2 = parseFloat(deposit2Amount) || 0;
  const vat = parseFloat(vatRate) || 22;
  const totalWithVat = total * (1 + vat / 100);
  const balance = paymentType === 'standard' ? Math.max(0, totalWithVat - deposit - deposit2) : 0;

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

  // Create order mutation
  const createOrderMutation = useMutation({
    mutationFn: async () => {
      if (!effectiveCompany?.id) throw new Error("Company not found");

      const financing = parseFloat(financingAmount) || 0;
      const vatValue = parseFloat(vatRate) || 22;

      // Create the order
      const { data: order, error: orderError } = await supabase
        .from("orders")
        .insert({
          company_id: effectiveCompany.id,
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
          current_status_id: statusId,
          vat_rate: vatValue,
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
        .select()
        .single();

      if (orderError) throw orderError;

      // Create initial status history entry
      const { error: historyError } = await supabase
        .from("order_status_history")
        .insert({
          order_id: order.id,
          status_id: statusId,
          changed_by: user!.id,
        });

      if (historyError) throw historyError;

      // Create order items if any
      if (orderItems.length > 0) {
        const itemsToInsert = orderItems.map((item, index) => ({
          order_id: order.id,
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
        }));

        const { data: insertedItems, error: itemsError } = await supabase
          .from("order_items")
          .insert(itemsToInsert)
          .select();

        if (itemsError) throw itemsError;

        // Auto stock decrement for items picked from warehouse
        if (insertedItems) {
          for (const inserted of insertedItems) {
            if (inserted.stock_item_id) {
              // Get current stock quantity
              const { data: currentStock } = await supabase
                .from("warehouse_stock")
                .select("quantity")
                .eq("id", inserted.stock_item_id)
                .single();

              if (currentStock) {
                // Decrement stock
                await supabase
                  .from("warehouse_stock")
                  .update({ quantity: Math.max(0, currentStock.quantity - (inserted.quantity || 1)) })
                  .eq("id", inserted.stock_item_id);

                // Create movement record
                await supabase.from("warehouse_movements").insert({
                  stock_item_id: inserted.stock_item_id,
                  order_item_id: inserted.id,
                  movement_type: "scarico",
                  quantity: inserted.quantity || 1,
                  notes: `Prelievo automatico per ordine ${orderCode.trim() || order.id.slice(0, 8)}`,
                  performed_by: user!.id,
                });
              }
            }
          }
        }
      }

      // Create salesperson commission if selected
      if (salespersonId && salespersonData) {
        let commissionAmount = 0;
        if (salespersonData.commission_type === "fixed") {
          commissionAmount = salespersonData.commission_value;
        } else {
          // percentage_sold or percentage_collected - calculate on taxable amount
          commissionAmount = total * (salespersonData.commission_value / 100);
        }

        const { error: salespersonError } = await supabase
          .from("order_salespeople")
          .insert({
            order_id: order.id,
            salesperson_id: salespersonId,
            commission_type: salespersonData.commission_type,
            commission_value: salespersonData.commission_value,
            commission_amount: commissionAmount,
          });

        if (salespersonError) throw salespersonError;
      }

      return order;
    },
    onSuccess: (order) => {
      clearDraft();
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      toast({
        title: "Ordine creato",
        description: "L'ordine è stato creato. Ora puoi caricare i documenti.",
      });
      setCreatedOrderId(order.id);
    },
    onError: (error) => {
      toast({
        title: "Errore",
        description: "Si è verificato un errore durante la creazione dell'ordine.",
        variant: "destructive",
      });
      console.error("Create order error:", error);
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

    // Warning: payment dates before order creation
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    if (depositExpectedDate && depositExpectedDate < now) {
      toast({
        title: "Attenzione",
        description: "La data prevista dell'acconto 1 è nel passato.",
      });
    }
    if (deposit2ExpectedDate && deposit2ExpectedDate < now) {
      toast({
        title: "Attenzione",
        description: "La data prevista dell'acconto 2 è nel passato.",
      });
    }
    if (balanceExpectedDate && balanceExpectedDate < now) {
      toast({
        title: "Attenzione",
        description: "La data prevista del saldo è nel passato.",
      });
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

              {/* Status */}
              <div className="space-y-2">
                <Label>Stato Iniziale</Label>
                <Select value={statusId} onValueChange={setStatusId}>
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
