import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CalendarIcon, Plus } from "lucide-react";
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
}

export default function EditOrder() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
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

  // Populate form when order data is loaded
  useEffect(() => {
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
      if (order.deposit_paid_date) {
        setDepositPaidDate(new Date(order.deposit_paid_date));
      }
      if (order.deposit_expected_date) {
        setDepositExpectedDate(new Date(order.deposit_expected_date));
      }
      if (order.deposit_2_paid_date) {
        setDeposit2PaidDate(new Date(order.deposit_2_paid_date));
      }
      if (order.deposit_2_expected_date) {
        setDeposit2ExpectedDate(new Date(order.deposit_2_expected_date));
      }
      if (order.balance_paid_date) {
        setBalancePaidDate(new Date(order.balance_paid_date));
      }
      if (order.balance_expected_date) {
        setBalanceExpectedDate(new Date(order.balance_expected_date));
      }
      // Dates
      if (order.expected_date) {
        setExpectedDate(new Date(order.expected_date));
      }
      if (order.warehouse_arrival_date) {
        setWarehouseArrivalDate(new Date(order.warehouse_arrival_date));
      }
      if (order.work_start_date) {
        setWorkStartDate(new Date(order.work_start_date));
      }
      if (order.work_end_date) {
        setWorkEndDate(new Date(order.work_end_date));
      }
    }
  }, [order]);

  // Populate order items
  useEffect(() => {
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
      })));
    }
  }, [existingItems]);

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

      // Delete existing items and recreate
      await supabase
        .from("order_items")
        .delete()
        .eq("order_id", id!);

      // Insert updated items
      if (orderItems.length > 0) {
        const itemsToInsert = orderItems.map((item, index) => ({
          order_id: id!,
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
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["order", id] });
      queryClient.invalidateQueries({ queryKey: ["order-items", id] });
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
