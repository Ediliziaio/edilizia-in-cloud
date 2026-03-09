import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronsUpDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (params: {
    tipo: string;
    description: string;
    amount: number;
    due_date: string;
    notes?: string;
    payment_method?: string;
    alert_days_before?: number;
    supplier_id?: string | null;
    order_id?: string | null;
  }) => void;
  isPending: boolean;
}

interface SupplierOption { id: string; name: string }
interface OrderOption { id: string; order_code: string | null; customers?: { company_name: string | null } | null }

export default function NewScadenzaDialog({ open, onOpenChange, onConfirm, isPending }: Props) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  const [tipo, setTipo] = useState("incasso_cliente");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [method, setMethod] = useState("bonifico");
  const [notes, setNotes] = useState("");
  const [alertDays, setAlertDays] = useState("7");
  const [supplierId, setSupplierId] = useState("");
  const [orderId, setOrderId] = useState("");

  // Combobox data
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [orders, setOrders] = useState<OrderOption[]>([]);
  const [supplierOpen, setSupplierOpen] = useState(false);
  const [orderOpen, setOrderOpen] = useState(false);

  useEffect(() => {
    if (!open || !companyId) return;
    supabase.from("suppliers").select("id, name").eq("company_id", companyId).order("name").then(({ data }) => {
      if (data) setSuppliers(data);
    });
    supabase.from("orders").select("id, order_code, customers(company_name)").eq("company_id", companyId).order("created_at", { ascending: false }).limit(50).then(({ data }) => {
      if (data) setOrders(data as unknown as OrderOption[]);
    });
  }, [open, companyId]);

  const reset = () => {
    setTipo("incasso_cliente");
    setDescription("");
    setAmount("");
    setDueDate("");
    setMethod("bonifico");
    setNotes("");
    setAlertDays("7");
    setSupplierId("");
    setOrderId("");
  };

  const handleOpen = (o: boolean) => {
    if (o) reset();
    onOpenChange(o);
  };

  const isValid = description.trim() && Number(amount) > 0 && dueDate;
  const showSupplier = tipo === "pagamento_fornitore";
  const showOrder = tipo === "incasso_cliente";

  const selectedSupplier = suppliers.find((s) => s.id === supplierId);
  const selectedOrder = orders.find((o) => o.id === orderId);

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nuova Scadenza</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Tipo</Label>
            <Select value={tipo} onValueChange={setTipo}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="incasso_cliente">Incasso cliente</SelectItem>
                <SelectItem value="pagamento_fornitore">Pagamento fornitore</SelectItem>
                <SelectItem value="costo_aziendale">Costo aziendale</SelectItem>
                <SelectItem value="scadenza_fiscale">Scadenza fiscale</SelectItem>
                <SelectItem value="altro">Altro</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Supplier combobox */}
          {showSupplier && (
            <div className="space-y-2">
              <Label>Fornitore</Label>
              <Popover open={supplierOpen} onOpenChange={setSupplierOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                    {selectedSupplier?.name || "Seleziona fornitore..."}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-full p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Cerca fornitore..." />
                    <CommandList>
                      <CommandEmpty>Nessun fornitore trovato.</CommandEmpty>
                      <CommandGroup>
                        {suppliers.map((s) => (
                          <CommandItem key={s.id} value={s.name} onSelect={() => { setSupplierId(s.id); setSupplierOpen(false); }}>
                            <Check className={cn("mr-2 h-4 w-4", supplierId === s.id ? "opacity-100" : "opacity-0")} />
                            {s.name}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          )}

          {/* Order combobox */}
          {showOrder && (
            <div className="space-y-2">
              <Label>Collega a ordine (opzionale)</Label>
              <Popover open={orderOpen} onOpenChange={setOrderOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                    {selectedOrder ? `${selectedOrder.order_code || "—"} - ${selectedOrder.customers?.company_name || ""}` : "Seleziona ordine..."}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-full p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Cerca ordine..." />
                    <CommandList>
                      <CommandEmpty>Nessun ordine trovato.</CommandEmpty>
                      <CommandGroup>
                        {orders.map((o) => (
                          <CommandItem key={o.id} value={`${o.order_number} ${o.client_company_name || ""}`} onSelect={() => { setOrderId(o.id); setOrderOpen(false); }}>
                            <Check className={cn("mr-2 h-4 w-4", orderId === o.id ? "opacity-100" : "opacity-0")} />
                            <span className="font-mono text-xs mr-2">{o.order_number}</span>
                            {o.client_company_name}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          )}

          <div className="space-y-2">
            <Label>Descrizione</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="es. Fattura n. 123 - Cliente XYZ" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Importo (€)</Label>
              <Input type="number" step="0.01" min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Scadenza</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Metodo pagamento</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bonifico">Bonifico</SelectItem>
                  <SelectItem value="contanti">Contanti</SelectItem>
                  <SelectItem value="carta">Carta</SelectItem>
                  <SelectItem value="assegno">Assegno</SelectItem>
                  <SelectItem value="ri.ba">Ri.Ba.</SelectItem>
                  <SelectItem value="altro">Altro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Alert (giorni prima)</Label>
              <Input type="number" min="0" max="90" value={alertDays} onChange={(e) => setAlertDays(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Note (opzionale)</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button>
          <Button
            disabled={isPending || !isValid}
            onClick={() => onConfirm({
              tipo,
              description: description.trim(),
              amount: Number(amount),
              due_date: dueDate,
              notes: notes || undefined,
              payment_method: method,
              alert_days_before: Number(alertDays) || 7,
              supplier_id: supplierId || null,
              order_id: orderId || null,
            })}
          >
            {isPending ? "Salvataggio..." : "Crea Scadenza"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
