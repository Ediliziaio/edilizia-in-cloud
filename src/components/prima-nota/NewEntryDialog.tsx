import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronsUpDown, Check, Paperclip, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

const CATEGORIES = [
  { value: "incasso", label: "Incasso cliente" },
  { value: "fornitore", label: "Pagamento fornitore" },
  { value: "costo", label: "Costo aziendale" },
  { value: "fiscale", label: "Tasse / Fiscale" },
  { value: "stipendi", label: "Stipendi" },
  { value: "utenze", label: "Utenze" },
  { value: "affitto", label: "Affitto" },
  { value: "altro", label: "Altro" },
];

interface SupplierOption { id: string; name: string }
interface OrderOption { id: string; order_code: string | null; customers?: { company_name: string | null } | null }

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onConfirm: (params: {
    direction: "entrata" | "uscita";
    category: string;
    description: string;
    amount: number;
    entry_date: string;
    payment_method?: string;
    reference_number?: string;
    account_label?: string;
    supplier_id?: string | null;
    notes?: string;
  }) => void;
  isPending: boolean;
}

export default function NewEntryDialog({ open, onOpenChange, onConfirm, isPending }: Props) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  const [direction, setDirection] = useState<"entrata" | "uscita">("uscita");
  const [category, setCategory] = useState("altro");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [entryDate, setEntryDate] = useState(new Date().toISOString().split("T")[0]);
  const [method, setMethod] = useState("bonifico");
  const [reference, setReference] = useState("");
  const [accountLabel, setAccountLabel] = useState("banca");
  const [notes, setNotes] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [orderId, setOrderId] = useState("");
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

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
    setDirection("uscita");
    setCategory("altro");
    setDescription("");
    setAmount("");
    setEntryDate(new Date().toISOString().split("T")[0]);
    setMethod("bonifico");
    setReference("");
    setAccountLabel("banca");
    setNotes("");
    setSupplierId("");
    setOrderId("");
    setAttachmentFile(null);
  };

  const handleOpen = (o: boolean) => {
    if (o) reset();
    onOpenChange(o);
  };

  const isValid = description.trim() && Number(amount) > 0 && entryDate;
  const showSupplier = category === "fornitore";
  const showOrder = category === "incasso";

  const selectedSupplier = suppliers.find((s) => s.id === supplierId);
  const selectedOrder = orders.find((o) => o.id === orderId);

  const handleConfirm = async () => {
    // Upload attachment if present
    let attachmentUrl: string | undefined;
    let attachmentName: string | undefined;

    if (attachmentFile && companyId) {
      setIsUploading(true);
      try {
        const ext = attachmentFile.name.split(".").pop();
        const path = `${companyId}/${Date.now()}.${ext}`;
        const { error: uploadErr } = await supabase.storage
          .from("prima-nota-attachments")
          .upload(path, attachmentFile);
        if (uploadErr) {
          // Bucket might not exist, just warn
          console.warn("Upload failed:", uploadErr.message);
          toast.warning("Allegato non caricato", { description: uploadErr.message });
        } else {
          const { data: urlData } = supabase.storage
            .from("prima-nota-attachments")
            .getPublicUrl(path);
          attachmentUrl = urlData.publicUrl;
          attachmentName = attachmentFile.name;
        }
      } catch (e) {
        console.warn("Upload error:", e);
      }
      setIsUploading(false);
    }

    onConfirm({
      direction,
      category,
      description: description.trim(),
      amount: Number(amount),
      entry_date: entryDate,
      payment_method: method,
      reference_number: reference || undefined,
      account_label: accountLabel,
      supplier_id: supplierId || null,
      notes: notes || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nuova Registrazione</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Direzione</Label>
              <Select value={direction} onValueChange={(v) => setDirection(v as "entrata" | "uscita")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="entrata">↓ Entrata</SelectItem>
                  <SelectItem value="uscita">↑ Uscita</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Categoria</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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
                          <CommandItem key={o.id} value={`${o.order_code || ""} ${o.customers?.company_name || ""}`} onSelect={() => { setOrderId(o.id); setOrderOpen(false); }}>
                            <Check className={cn("mr-2 h-4 w-4", orderId === o.id ? "opacity-100" : "opacity-0")} />
                            <span className="font-mono text-xs mr-2">{o.order_code}</span>
                            {o.customers?.company_name}
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
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="es. Pagamento fornitore ABC" />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label>Importo (€)</Label>
              <Input type="number" step="0.01" min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Data</Label>
              <Input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Metodo</Label>
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
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Riferimento (opzionale)</Label>
              <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="es. Fatt. 2025/001" />
            </div>
            <div className="space-y-2">
              <Label>Conto</Label>
              <Select value={accountLabel} onValueChange={setAccountLabel}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="banca">Banca</SelectItem>
                  <SelectItem value="cassa">Cassa</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Attachment */}
          <div className="space-y-2">
            <Label>Allegato (opzionale)</Label>
            {attachmentFile ? (
              <div className="flex items-center gap-2 p-2 rounded-lg border bg-muted/30">
                <Paperclip className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm truncate flex-1">{attachmentFile.name}</span>
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setAttachmentFile(null)}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ) : (
              <div className="relative">
                <Input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      if (file.size > 10 * 1024 * 1024) {
                        toast.error("File troppo grande (max 10MB)");
                        return;
                      }
                      setAttachmentFile(file);
                    }
                  }}
                  className="text-sm"
                />
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>Note (opzionale)</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button>
          <Button
            disabled={isPending || isUploading || !isValid}
            onClick={handleConfirm}
          >
            {isPending || isUploading ? "Salvataggio..." : "Registra"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
