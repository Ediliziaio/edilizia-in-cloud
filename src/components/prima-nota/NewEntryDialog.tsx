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
import { logger } from "@/utils/logger";
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
// orders.customer_id → profiles (FK orders_customer_id_fkey): profiles non ha
// `company_name`, il nome cliente si compone da first_name + last_name.
interface OrderOption { id: string; order_code: string | null; customer?: { first_name: string | null; last_name: string | null } | null }
function orderCustName(o: OrderOption | null | undefined): string {
  const c = o?.customer;
  if (!c) return "";
  return `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim();
}

/** Fattura emessa con qualcosa ancora da incassare. */
interface FatturaAperta {
  id: string;
  invoice_number: string | null;
  issue_date: string | null;
  client_company_name: string | null;
  total: number | null;
  paid_amount: number | null;
  order_id: string | null;
}
const residuo = (f: FatturaAperta) => Math.max(0, Math.round(((f.total ?? 0) - (f.paid_amount ?? 0)) * 100) / 100);
const euro = (n: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(n);
const dataIt = (d: string | null) => (d ? d.split("-").reverse().join("/") : "");

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
    order_id?: string | null;
    invoice_id?: string | null;
    attachment_url?: string;
    attachment_name?: string;
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
  const [entryDate, setEntryDate] = useState(new Date().toLocaleDateString("en-CA"));
  const [method, setMethod] = useState("bonifico");
  const [reference, setReference] = useState("");
  const [accountLabel, setAccountLabel] = useState("banca");
  const [notes, setNotes] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [orderId, setOrderId] = useState("");
  const [invoiceId, setInvoiceId] = useState("");
  const [fatture, setFatture] = useState<FatturaAperta[]>([]);
  const [fatturaOpen, setFatturaOpen] = useState(false);
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Combobox data
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [orders, setOrders] = useState<OrderOption[]>([]);
  const [supplierOpen, setSupplierOpen] = useState(false);
  const [orderOpen, setOrderOpen] = useState(false);

  useEffect(() => {
    if (!open || !companyId) return;
    // v8.6.114 — race-condition safe: flag `alive` evita setState dopo unmount
    // o dopo cambio companyId. Prima 2 fetch in volo potevano scrivere sopra
    // entries di companyId diverso.
    let alive = true;
    supabase.from("suppliers").select("id, name").eq("company_id", companyId).order("name").then(({ data, error }) => {
      if (!alive) return;
      if (error) {
        console.warn("[NewEntryDialog] suppliers fetch error:", error.message);
        return;
      }
      if (data) setSuppliers(data);
    });
    supabase.from("orders").select("id, order_code, customer:profiles!orders_customer_id_fkey(first_name, last_name)").eq("company_id", companyId).order("created_at", { ascending: false }).limit(50).then(({ data, error }) => {
      if (!alive) return;
      if (error) {
        console.warn("[NewEntryDialog] orders fetch error:", error.message);
        return;
      }
      if (data) setOrders(data as unknown as OrderOption[]);
    });
    // Le fatture emesse ancora da incassare: dall'incasso si sceglie la fattura,
    // e la fattura porta con sé cliente, commessa e importo.
    supabase.from("invoices")
      .select("id, invoice_number, issue_date, client_company_name, total, paid_amount, order_id")
      .eq("company_id", companyId)
      .eq("document_type", "invoice")
      .not("status", "in", "(paid,cancelled,credited,draft)")
      .is("deleted_at", null)
      .order("issue_date", { ascending: false })
      .limit(1000)
      .then(({ data, error }) => {
        if (!alive) return;
        if (error) {
          console.warn("[NewEntryDialog] invoices fetch error:", error.message);
          return;
        }
        setFatture(((data ?? []) as FatturaAperta[]).filter((f) => residuo(f) > 0));
      });
    return () => { alive = false; };
  }, [open, companyId]);

  const reset = () => {
    setDirection("uscita");
    setCategory("altro");
    setDescription("");
    setAmount("");
    setEntryDate(new Date().toLocaleDateString("en-CA"));
    setMethod("bonifico");
    setReference("");
    setAccountLabel("banca");
    setNotes("");
    setSupplierId("");
    setOrderId("");
    setInvoiceId("");
    setAttachmentFile(null);
  };

  // La categoria decide il verso: un incasso entra, un pagamento esce.
  const scegliCategoria = (v: string) => {
    setCategory(v);
    if (v === "incasso") setDirection("entrata");
    else if (v === "fornitore") setDirection("uscita");
    if (v !== "incasso") setInvoiceId("");
  };

  const scegliFattura = (f: FatturaAperta) => {
    setInvoiceId(f.id);
    setAmount(String(residuo(f)));
    if (f.order_id) setOrderId(f.order_id);
    setDescription(`Incasso fattura ${f.invoice_number ?? ""}${f.client_company_name ? ` - ${f.client_company_name}` : ""}`.trim());
    setReference(`Fatt. ${f.invoice_number ?? ""}`.trim());
    setFatturaOpen(false);
  };

  // Reset all'APERTURA: con dialog controllato Radix non invoca onOpenChange quando il
  // parent setta open=true → il vecchio handleOpen non scattava e la registrazione
  // precedente restava nel form (rischio doppioni/valori sbagliati).
  useEffect(() => {
    if (open) reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const showSupplier = category === "fornitore";
  const showOrder = category === "incasso";

  const selectedSupplier = suppliers.find((s) => s.id === supplierId);
  const selectedOrder = orders.find((o) => o.id === orderId);
  const fatturaScelta = fatture.find((f) => f.id === invoiceId);
  // Più del residuo non si incassa: l'eccedenza farebbe risultare pagata una fattura
  // con un importo che non torna, e il cliente in credito senza che nessuno lo sappia.
  const oltreResiduo = !!fatturaScelta && Number(amount) > residuo(fatturaScelta) + 0.005;
  const isValid = description.trim() && Number(amount) > 0 && entryDate && !oltreResiduo
    && (!invoiceId || direction === "entrata");

  const handleConfirm = async () => {
    if (attachmentFile && !companyId) {
      toast.error("Azienda non disponibile: riapri la registrazione prima di caricare l’allegato.");
      return;
    }
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
        if (uploadErr) throw uploadErr;
        attachmentUrl = `prima-nota-attachments/${path}`;
        attachmentName = attachmentFile.name;
      } catch (error) {
        logger.warn("Upload allegato fallito", error);
        toast.error("Allegato non caricato: la registrazione non è stata salvata. Riprova o rimuovi il file.");
        return;
      } finally {
        setIsUploading(false);
      }
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
      order_id: orderId || null,
      invoice_id: invoiceId || null,
      attachment_url: attachmentUrl,
      attachment_name: attachmentName,
      notes: notes || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nuova Registrazione</DialogTitle>
        </DialogHeader>
        {/* Mobile: via riferimento e note; metodo accanto al conto. */}
        <div className="space-y-4 max-sm:space-y-3">
          <div className="grid grid-cols-2 gap-3 max-sm:gap-2">
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
              <Select value={category} onValueChange={scegliCategoria}>
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

          {/* Fattura da incassare: porta cliente, commessa e importo */}
          {showOrder && (
            <div className="space-y-2">
              <Label>Fattura incassata</Label>
              <Popover open={fatturaOpen} onOpenChange={setFatturaOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                    <span className="truncate">
                      {fatturaScelta
                        ? `${fatturaScelta.invoice_number ?? "—"} · ${fatturaScelta.client_company_name ?? "cliente non indicato"}`
                        : fatture.length > 0 ? "Scegli cliente e fattura..." : "Nessuna fattura da incassare"}
                    </span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[min(32rem,90vw)] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Cerca cliente o numero..." />
                    <CommandList>
                      <CommandEmpty>Nessuna fattura trovata.</CommandEmpty>
                      <CommandGroup>
                        {fatture.map((f) => (
                          <CommandItem key={f.id} value={`${f.invoice_number ?? ""} ${f.client_company_name ?? ""} ${f.id}`} onSelect={() => scegliFattura(f)}>
                            <Check className={cn("mr-2 h-4 w-4 shrink-0", invoiceId === f.id ? "opacity-100" : "opacity-0")} />
                            <span className="min-w-0 flex-1 truncate">
                              <span className="font-mono text-xs mr-2">{f.invoice_number}</span>
                              {f.client_company_name}
                              <span className="text-muted-foreground"> · {dataIt(f.issue_date)}</span>
                            </span>
                            <span className="ml-2 shrink-0 tabular-nums text-xs">{euro(residuo(f))}</span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {fatturaScelta ? (
                <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>Cliente: <span className="text-foreground">{fatturaScelta.client_company_name ?? "non indicato"}</span> · da incassare {euro(residuo(fatturaScelta))}</span>
                  <button type="button" className="underline" onClick={() => setInvoiceId("")}>Togli</button>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Senza fattura l'incasso resta solo in Prima nota: non chiude né la fattura né la scadenza.</p>
              )}
              {oltreResiduo && <p className="text-xs text-destructive">L'importo supera quanto resta da incassare su questa fattura.</p>}
              {invoiceId && direction !== "entrata" && <p className="text-xs text-destructive">L'incasso di una fattura è un'entrata.</p>}
            </div>
          )}

          {/* Order combobox */}
          {showOrder && (
            <div className="space-y-2">
              <Label>Collega a ordine (opzionale)</Label>
              <Popover open={orderOpen} onOpenChange={setOrderOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                    {selectedOrder ? `${selectedOrder.order_code || "—"}${orderCustName(selectedOrder) ? " - " + orderCustName(selectedOrder) : ""}` : "Seleziona ordine..."}
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
                          <CommandItem key={o.id} value={`${o.order_code || ""} ${orderCustName(o)}`} onSelect={() => { setOrderId(o.id); setOrderOpen(false); }}>
                            <Check className={cn("mr-2 h-4 w-4", orderId === o.id ? "opacity-100" : "opacity-0")} />
                            <span className="font-mono text-xs mr-2">{o.order_code}</span>
                            {orderCustName(o)}
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

          {/* 2 colonne su mobile: con 3 i campi scendevano a ~98px (data clippata) */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 max-sm:gap-2">
            <div className="space-y-2">
              <Label>Importo (€)</Label>
              <Input type="number" inputMode="decimal" step="0.01" min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Data</Label>
              <Input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} />
            </div>
            <div className="space-y-2 max-sm:hidden">
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

          <div className="grid grid-cols-2 gap-3 max-sm:gap-2">
            <div className="space-y-2 max-sm:hidden">
              <Label>Riferimento (opzionale)</Label>
              <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="es. Fatt. 2025/001" />
            </div>
            {/* Mobile: il metodo sta qui, accanto al conto (sopra resterebbe
                da solo su mezza riga). */}
            <div className="space-y-2 sm:hidden">
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
            <Label>Allegato<span className="max-sm:hidden"> (opzionale)</span></Label>
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

          <div className="space-y-2 max-sm:hidden">
            <Label>Note (opzionale)</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="max-sm:hidden">Annulla</Button>
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
