import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CalendarIcon, Plus, Paperclip } from "lucide-react";
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

  // Calculate balance
  const total = parseFloat(totalAmount) || 0;
  const deposit = parseFloat(depositAmount) || 0;
  const deposit2 = parseFloat(deposit2Amount) || 0;
  const vat = parseFloat(vatRate) || 22;
  const totalWithVat = total * (1 + vat / 100);
  const balance = paymentType === 'standard' ? Math.max(0, totalWithVat - deposit - deposit2) : 0;

  // Fetch customers for the company
  const { data: customers = [] } = useQuery({
    queryKey: ["customers", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, email")
        .order("last_name");

      if (error) throw error;
      return data as Customer[];
    },
    enabled: !!user,
  });

  // Fetch order statuses for the company
  const { data: statuses = [] } = useQuery({
    queryKey: ["order-statuses", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_statuses")
        .select("id, name, position")
        .order("position");

      if (error) throw error;
      return data as OrderStatus[];
    },
    enabled: !!user,
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
        }));

        const { error: itemsError } = await supabase
          .from("order_items")
          .insert(itemsToInsert);

        if (itemsError) throw itemsError;
      }

      return order;
    },
    onSuccess: (order) => {
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
