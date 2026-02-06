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
  description: string;
  total_amount: number;
  deposit_amount: number;
  deposit_2_amount: number;
  financing_amount: number;
  payment_type: string;
  balance_amount: number;
  expected_date: string | null;
  internal_notes: string | null;
}

interface OrderItemData {
  id: string;
  name: string;
  description: string | null;
  quantity: number;
  status: string;
  position: number;
}

export default function EditOrder() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [customerId, setCustomerId] = useState("");
  const [description, setDescription] = useState("");
  const [expectedDate, setExpectedDate] = useState<Date | undefined>();
  const [internalNotes, setInternalNotes] = useState("");

  // Financial state
  const [paymentType, setPaymentType] = useState<PaymentType>('standard');
  const [totalAmount, setTotalAmount] = useState("");
  const [depositAmount, setDepositAmount] = useState("");
  const [deposit2Amount, setDeposit2Amount] = useState("");
  const [financingAmount, setFinancingAmount] = useState("");

  // Order items state
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);

  // Customer creation dialog
  const [showCreateCustomer, setShowCreateCustomer] = useState(false);

  // Calculate balance
  const total = parseFloat(totalAmount) || 0;
  const deposit = parseFloat(depositAmount) || 0;
  const deposit2 = parseFloat(deposit2Amount) || 0;
  const balance = paymentType === 'standard' ? Math.max(0, total - deposit - deposit2) : 0;

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
      setDescription(order.description);
      setTotalAmount(order.total_amount.toString());
      setDepositAmount(order.deposit_amount.toString());
      setDeposit2Amount((order.deposit_2_amount || 0).toString());
      setFinancingAmount((order.financing_amount || 0).toString());
      setPaymentType((order.payment_type as PaymentType) || 'standard');
      setInternalNotes(order.internal_notes || "");
      if (order.expected_date) {
        setExpectedDate(new Date(order.expected_date));
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

      // Update order
      const { error } = await supabase
        .from("orders")
        .update({
          customer_id: customerId,
          description,
          total_amount: total,
          deposit_amount: deposit,
          deposit_2_amount: deposit2,
          financing_amount: financing,
          payment_type: paymentType,
          balance_amount: balance,
          expected_date: expectedDate?.toISOString().split("T")[0] || null,
          internal_notes: internalNotes || null,
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

              {/* Expected Date */}
              <div className="space-y-2">
                <Label>Data Prevista Consegna</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !expectedDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {expectedDate ? (
                        format(expectedDate, "d MMMM yyyy", { locale: it })
                      ) : (
                        <span>Seleziona data</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={expectedDate}
                      onSelect={setExpectedDate}
                      initialFocus
                      className="pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
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
            onTotalAmountChange={setTotalAmount}
            onDepositAmountChange={setDepositAmount}
            onDeposit2AmountChange={setDeposit2Amount}
            onFinancingAmountChange={setFinancingAmount}
            onPaymentTypeChange={setPaymentType}
            balance={balance}
          />
        </div>

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
