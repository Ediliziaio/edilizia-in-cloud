import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AllegatoPrimaNota } from "./AllegatoPrimaNota";
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
import type { DatiRegistrazione, PrimaNotaEntry } from "@/hooks/usePrimaNota";

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

const METODI = [
  { value: "bonifico", label: "Bonifico" },
  { value: "contanti", label: "Contanti" },
  { value: "carta", label: "Carta" },
  { value: "assegno", label: "Assegno" },
  { value: "ri.ba", label: "Ri.Ba." },
  { value: "altro", label: "Altro" },
];
/** Il verso del movimento tinge il segno e l'importo: si legge prima di leggere le parole. */
const VERSO = {
  entrata: { etichetta: "↓ Entrata", segno: "+", testo: "text-emerald-700", bordo: "border-emerald-300", pieno: "bg-emerald-600 text-white" },
  uscita: { etichetta: "↑ Uscita", segno: "−", testo: "text-rose-700", bordo: "border-rose-300", pieno: "bg-rose-600 text-white" },
} as const;

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onConfirm: (params: DatiRegistrazione) => void;
  isPending: boolean;
  /** La registrazione da modificare: il modulo si apre già compilato. Assente = nuova registrazione. */
  entry?: PrimaNotaEntry | null;
}

export default function NewEntryDialog({ open, onOpenChange, onConfirm, isPending, entry = null }: Props) {
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
  // Riferimento, note e allegato stanno piegati: si aprono da soli se la registrazione ne ha già.
  const [dettagliAperti, setDettagliAperti] = useState(false);

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
        const aperte = ((data ?? []) as FatturaAperta[]).filter((f) => residuo(f) > 0);
        // In modifica la fattura già collegata resta nell'elenco anche se risulta pagata: il
        // pagamento è proprio quello di questa registrazione.
        const collegata = entry?.invoice_id;
        if (!collegata || aperte.some((f) => f.id === collegata)) { setFatture(aperte); return; }
        supabase.from("invoices").select("id, invoice_number, issue_date, client_company_name, total, paid_amount, order_id")
          .eq("id", collegata).maybeSingle()
          .then(({ data: f }) => { if (alive) setFatture(f ? [f as FatturaAperta, ...aperte] : aperte); });
      });
    return () => { alive = false; };
  }, [open, companyId, entry?.invoice_id]);

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
    setDettagliAperti(false);
  };

  // In modifica, quello che questa registrazione ha già messo sulla sua fattura torna disponibile.
  const residuoPer = (f: FatturaAperta) =>
    Math.round((residuo(f) + (entry && entry.invoice_id === f.id ? Number(entry.amount) || 0 : 0)) * 100) / 100;

  // La categoria decide il verso: un incasso entra, un pagamento esce.
  const scegliCategoria = (v: string) => {
    setCategory(v);
    if (v === "incasso") setDirection("entrata");
    else if (v === "fornitore") setDirection("uscita");
    if (v !== "incasso") setInvoiceId("");
  };

  const scegliFattura = (f: FatturaAperta) => {
    setInvoiceId(f.id);
    setAmount(String(residuoPer(f)));
    if (f.order_id) setOrderId(f.order_id);
    setDescription(`Incasso fattura ${f.invoice_number ?? ""}${f.client_company_name ? ` - ${f.client_company_name}` : ""}`.trim());
    setReference(`Fatt. ${f.invoice_number ?? ""}`.trim());
    setFatturaOpen(false);
    // Scegliere la fattura riscrive anche il riferimento: si apre, così si vede cosa è cambiato.
    setDettagliAperti(true);
  };

  // Reset all'APERTURA: con dialog controllato Radix non invoca onOpenChange quando il
  // parent setta open=true → il vecchio handleOpen non scattava e la registrazione
  // precedente restava nel form (rischio doppioni/valori sbagliati).
  useEffect(() => {
    if (!open) return;
    reset();
    if (entry) {
      setDirection(entry.direction);
      setCategory(entry.category || "altro");
      setDescription(entry.description ?? "");
      setAmount(String(entry.amount ?? ""));
      setEntryDate(entry.entry_date);
      setMethod(entry.payment_method || "");
      setReference(entry.reference_number ?? "");
      setAccountLabel(entry.account_label || "banca");
      setNotes(entry.notes ?? "");
      setSupplierId(entry.supplier_id ?? "");
      setOrderId(entry.order_id ?? "");
      setInvoiceId(entry.invoice_id ?? "");
      // Quello che la registrazione ha già scritto non si nasconde dietro un «Altri dettagli».
      setDettagliAperti(Boolean(entry.notes || entry.reference_number || entry.attachment_url));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, entry?.id]);

  const showSupplier = category === "fornitore";
  const showOrder = category === "incasso";

  const selectedSupplier = suppliers.find((s) => s.id === supplierId);
  const selectedOrder = orders.find((o) => o.id === orderId);
  const fatturaScelta = fatture.find((f) => f.id === invoiceId);
  // Più del residuo non si incassa: l'eccedenza farebbe risultare pagata una fattura
  // con un importo che non torna, e il cliente in credito senza che nessuno lo sappia.
  const oltreResiduo = !!fatturaScelta && Number(amount) > residuoPer(fatturaScelta) + 0.005;
  // Un solo posto decide se si può salvare, e sa dire perché: il pulsante spento senza
  // motivo lasciava l'utente a indovinare quale campo mancasse.
  const blocco: { testo: string; errore: boolean } | null =
    oltreResiduo ? { testo: "L’importo supera quanto resta da incassare su questa fattura.", errore: true }
    : invoiceId && direction !== "entrata" ? { testo: "L’incasso di una fattura è un’entrata: cambia il verso o togli la fattura.", errore: true }
    : !description.trim() ? { testo: "Manca la descrizione.", errore: false }
    : !(Number(amount) > 0) ? { testo: "Manca l’importo.", errore: false }
    : !entryDate ? { testo: "Manca la data.", errore: false }
    : null;
  const isValid = !blocco;
  const verso = VERSO[direction];

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
      payment_method: method || undefined,
      reference_number: reference || undefined,
      account_label: accountLabel,
      supplier_id: supplierId || null,
      order_id: orderId || null,
      invoice_id: invoiceId || null,
      // In modifica, senza un file nuovo l'allegato resta quello di prima.
      ...(attachmentUrl ? { attachment_url: attachmentUrl, attachment_name: attachmentName } : {}),
      // In modifica le note si mandano anche vuote: è così che si cancellano.
      notes: entry ? notes : notes || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Un filo più largo di prima (lg): la descrizione e le voci delle tendine si leggono intere. */}
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{entry ? "Modifica registrazione" : "Nuova Registrazione"}</DialogTitle>
          <DialogDescription>
            {entry
              ? `Registrata il ${dataIt(entry.entry_date)}${entry.is_auto ? " dal programma" : " a mano"}. Le modifiche valgono subito in Prima nota.`
              : "Un movimento di cassa o banca scritto a mano."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 max-sm:space-y-3">
          {/* La categoria decide il verso e quali campi servono: viene prima. */}
          <div className="grid grid-cols-2 gap-3 max-sm:gap-2">
            <div className="space-y-2">
              <Label htmlFor="pn-categoria">Categoria</Label>
              <Select value={category} onValueChange={scegliCategoria}>
                <SelectTrigger id="pn-categoria"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label asChild><span>Entra o esce</span></Label>
              <div role="group" aria-label="Entra o esce" className="grid grid-cols-2 gap-1 rounded-md border bg-muted/40 p-1">
                {(["entrata", "uscita"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={direction === v}
                    onClick={() => setDirection(v)}
                    className={cn(
                      "h-8 rounded text-sm font-medium transition-colors",
                      direction === v ? VERSO[v].pieno : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {VERSO[v].etichetta}
                  </button>
                ))}
              </div>
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
                            <span className="ml-2 shrink-0 tabular-nums text-xs">{euro(residuoPer(f))}</span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {fatturaScelta ? (
                <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>Cliente: <span className="text-foreground">{fatturaScelta.client_company_name ?? "non indicato"}</span> · da incassare {euro(residuoPer(fatturaScelta))}</span>
                  <button type="button" className="underline" onClick={() => setInvoiceId("")}>Togli</button>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Senza fattura l'incasso resta solo in Prima nota: non chiude né la fattura né la scadenza.</p>
              )}
              {/* I due errori di questa fattura li dice una volta sola il messaggio sopra il pulsante. */}
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
            <Label htmlFor="pn-descrizione">Descrizione</Label>
            <Input id="pn-descrizione" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="es. Pagamento fornitore ABC" />
          </div>

          {/* L'importo è il dato che si legge per primo: grande, col segno del verso.
              Con la larghezza nuova data, metodo e conto gli stanno accanto su una riga sola. */}
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 max-sm:gap-2 sm:grid-cols-[minmax(11rem,1.1fr)_minmax(0,1fr)]">
            <div className="space-y-2">
              <Label htmlFor="pn-importo">Importo</Label>
              <div className={cn("flex h-12 items-center gap-2 rounded-md border bg-background px-3 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2", verso.bordo)}>
                <span aria-hidden className={cn("text-xl font-semibold tabular-nums", verso.testo)}>{verso.segno}</span>
                <Input
                  id="pn-importo"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  onWheel={(e) => e.currentTarget.blur()}
                  placeholder="0,00"
                  className={cn("h-full border-0 px-0 text-xl font-semibold tabular-nums shadow-none focus-visible:ring-0 focus-visible:ring-offset-0", verso.testo)}
                />
                <span aria-hidden className="text-base text-muted-foreground">€</span>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="pn-data">Data</Label>
              <Input id="pn-data" type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} className="h-12" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 max-sm:gap-2">
            <div className="space-y-2">
              <Label htmlFor="pn-metodo">Metodo</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger id="pn-metodo"><SelectValue placeholder="Non indicato" /></SelectTrigger>
                <SelectContent>
                  {METODI.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="pn-conto">Conto</Label>
              <Select value={accountLabel} onValueChange={setAccountLabel}>
                <SelectTrigger id="pn-conto"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="banca">Banca</SelectItem>
                  <SelectItem value="cassa">Cassa</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Riferimento, allegato e note: ci sono anche sul telefono, ma piegati. */}
          <details
            open={dettagliAperti}
            onToggle={(e) => setDettagliAperti(e.currentTarget.open)}
            className="rounded-lg border bg-muted/20 px-3 py-2"
          >
            <summary className="cursor-pointer text-sm font-medium">Riferimento, allegato e note</summary>
            <div className="mt-3 space-y-3">
              <div className="space-y-2">
                <Label htmlFor="pn-riferimento">Riferimento</Label>
                <Input id="pn-riferimento" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="es. Fatt. 2025/001" />
              </div>
              <div className="space-y-2">
                <Label asChild><span>Allegato</span></Label>
                {entry?.attachment_url && !attachmentFile && (
                  <div className="flex items-center justify-between gap-2 rounded-md border bg-background px-2 py-1">
                    <AllegatoPrimaNota url={entry.attachment_url} nome={entry.attachment_name} />
                    <span className="shrink-0 text-xs text-muted-foreground">già allegato</span>
                  </div>
                )}
                {attachmentFile ? (
                  <div className="flex items-center gap-2 rounded-md border bg-background p-2">
                    <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="flex-1 truncate text-sm">{attachmentFile.name}</span>
                    <Button variant="ghost" size="sm" className="h-6 w-6 shrink-0 p-0" aria-label="Togli il file scelto" onClick={() => setAttachmentFile(null)}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ) : (
                  <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed bg-background px-3 py-2 text-sm text-muted-foreground hover:bg-muted/40">
                    <Paperclip className="h-4 w-4 shrink-0" />
                    <span className="truncate">
                      {entry?.attachment_url ? "Scegli un file per sostituirlo" : "Scegli un file — PDF, immagine, Word o Excel, max 10 MB"}
                    </span>
                    <input
                      type="file"
                      className="sr-only"
                      accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        if (file.size > 10 * 1024 * 1024) {
                          toast.error("File troppo grande: il massimo è 10 MB.");
                          e.currentTarget.value = "";
                          return;
                        }
                        setAttachmentFile(file);
                      }}
                    />
                  </label>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="pn-note">Note</Label>
                <Textarea id="pn-note" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
              </div>
            </div>
          </details>
        </div>

        {/* Perché il pulsante è spento, sopra il pulsante stesso e su una riga sua. */}
        {blocco && (
          <p role={blocco.errore ? "alert" : undefined} className={cn("text-xs", blocco.errore ? "text-destructive" : "text-muted-foreground")}>
            {blocco.testo}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="max-sm:hidden">Annulla</Button>
          <Button
            disabled={isPending || isUploading || !isValid}
            onClick={handleConfirm}
          >
            {isPending || isUploading ? "Salvataggio..." : entry ? "Salva modifiche" : "Registra"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
