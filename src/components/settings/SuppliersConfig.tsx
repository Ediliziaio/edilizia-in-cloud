import { useState, useMemo, type FormEvent } from "react";
import { PAGAMENTI_FORNITORI as PAYMENT_METHODS, etichettaPagamentoFornitore } from "@/lib/impostazioni/pagamentiFornitori";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Truck, Plus, Pencil, Trash2, Loader2, Search, Check, ChevronsUpDown, QrCode, AlertCircle, Merge, ArrowUpDown } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { VAT_RATES, getVatRateLabel } from "@/lib/vatUtils";
import { logger } from "@/utils/logger";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { testoTecnico, userErrorMessage } from "@/lib/userErrorMessage";
import { useSettingsDraftGuard } from "@/hooks/useSettingsDraftGuard";

interface Supplier {
  id: string;
  name: string;
  vat_rate: number | null;
  is_foreign: boolean;
  address: string | null;
  city: string | null;
  province: string | null;
  postal_code: string | null;
  country: string | null;
  vat_number: string | null;
  fiscal_code: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  product_category: string | null;
  notes: string | null;
  payment_method: string | null;
  is_active: boolean;
  /** Il carico rapido del magazzino lo legge per decidere come interpretare i QR del fornitore. */
  uses_gs1?: boolean | null;
  created_at: string;
  company_id: string;
}

interface SupplierFormData {
  name: string;
  vat_rate: number;
  is_foreign: boolean;
  address: string;
  city: string;
  province: string;
  postal_code: string;
  country: string;
  vat_number: string;
  fiscal_code: string;
  email: string;
  phone: string;
  website: string;
  product_category: string;
  notes: string;
  payment_method: string;
  is_active: boolean;
  uses_gs1: boolean;
}

const emptyForm: SupplierFormData = {
  name: "",
  vat_rate: 22,
  is_foreign: false,
  address: "",
  city: "",
  province: "",
  postal_code: "",
  country: "Italia",
  vat_number: "",
  fiscal_code: "",
  email: "",
  phone: "",
  website: "",
  product_category: "",
  notes: "",
  payment_method: "",
  is_active: true,
  uses_gs1: false,
};

interface SupplierUsageCounts {
  articleTemplates: number;
  companyCosts: number;
  orderItems: number;
  purchaseOrders: number;
  scadenze: number;
  primaNota: number;
  warehouseStock: number;
}

const emptyUsageCounts: SupplierUsageCounts = {
  articleTemplates: 0,
  companyCosts: 0,
  orderItems: 0,
  purchaseOrders: 0,
  scadenze: 0,
  primaNota: 0,
  warehouseStock: 0,
};

const supplierUsageLabels: Record<keyof SupplierUsageCounts, string> = {
  articleTemplates: "Articoli/listino",
  companyCosts: "Costi aziendali",
  orderItems: "Righe ordine",
  purchaseOrders: "Ordini di acquisto",
  scadenze: "Scadenze/pagamenti",
  primaNota: "Prima nota",
  warehouseStock: "Magazzino",
};

function normalizeSupplierName(name: string) {
  return name.trim().replace(/\s+/g, " ");
}

function supplierNameKey(name: string) {
  return normalizeSupplierName(name).toLowerCase();
}

function normalizeVatNumber(value: string) {
  return value.trim().replace(/[\s.-]/g, "").toUpperCase();
}

function normalizeOptional(value: string) {
  const normalized = value.trim();
  return normalized || null;
}

function isValidEmail(value: string) {
  if (!value.trim()) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function isValidPhone(value: string) {
  if (!value.trim()) return true;
  return /^[+()0-9\s.-]{6,25}$/.test(value.trim());
}

function isValidItalianVat(value: string, isForeign: boolean) {
  const normalized = normalizeVatNumber(value);
  if (!normalized || isForeign) return true;
  return /^(IT)?\d{11}$/.test(normalized);
}

function getUsageTotal(usage: SupplierUsageCounts | undefined) {
  if (!usage) return 0;
  return Object.values(usage).reduce((sum, value) => sum + value, 0);
}

async function getSupplierUsageCounts(companyId: string, supplierId: string): Promise<SupplierUsageCounts> {
  const [
    articleTemplates,
    companyCosts,
    orderItems,
    purchaseOrders,
    scadenze,
    primaNota,
    warehouseStock,
  ] = await Promise.all([
    supabase.from("article_templates").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("supplier_id", supplierId),
    supabase.from("company_costs").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("supplier_id", supplierId),
    supabase.from("order_items").select("id", { count: "exact", head: true }).eq("supplier_id", supplierId),
    supabase.from("purchase_orders").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("supplier_id", supplierId),
    supabase.from("scadenze").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("supplier_id", supplierId),
    supabase.from("prima_nota_entries").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("supplier_id", supplierId),
    supabase.from("warehouse_stock").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("supplier_id", supplierId),
  ]);

  const errors = [articleTemplates, companyCosts, orderItems, purchaseOrders, scadenze, primaNota, warehouseStock]
    .map((result) => result.error)
    .filter(Boolean);
  if (errors.length > 0) {
    throw errors[0];
  }

  return {
    articleTemplates: articleTemplates.count ?? 0,
    companyCosts: companyCosts.count ?? 0,
    orderItems: orderItems.count ?? 0,
    purchaseOrders: purchaseOrders.count ?? 0,
    scadenze: scadenze.count ?? 0,
    primaNota: primaNota.count ?? 0,
    warehouseStock: warehouseStock.count ?? 0,
  };
}

function supplierToForm(s: Supplier): SupplierFormData {
  return {
    name: s.name,
    vat_rate: s.vat_rate || 22,
    is_foreign: s.is_foreign,
    address: s.address || "",
    city: s.city || "",
    province: s.province || "",
    postal_code: s.postal_code || "",
    country: s.country || "Italia",
    vat_number: s.vat_number || "",
    fiscal_code: s.fiscal_code || "",
    email: s.email || "",
    phone: s.phone || "",
    website: s.website || "",
    product_category: s.product_category || "",
    notes: s.notes || "",
    payment_method: s.payment_method || "",
    is_active: s.is_active ?? true,
    uses_gs1: !!s.uses_gs1,
  };
}

const getPaymentMethodLabel = (value: string | null) => {
  return etichettaPagamentoFornitore(value);
};

/** Un errore che la pagina ha già scritto in italiano: si mostra com'è. Tutto il resto passa da userErrorMessage. */
class ErroreFornitore extends Error {}

/** Il testo di un errore per chi usa la pagina: mai il messaggio del database così com'è. */
function descrizioneErrore(error: unknown, ripiego: string): string {
  if (error instanceof ErroreFornitore) return error.message;
  if (/duplicate|unique|already exists/i.test(testoTecnico(error))) return "Esiste già un fornitore con questa ragione sociale.";
  return userErrorMessage(error, ripiego);
}

function SupplierTable({
  suppliers,
  onEdit,
  onDelete,
  emptyMessage = "Nessun fornitore in questa categoria",
  productCounts = {},
  puoModificare = true,
}: {
  suppliers: Supplier[];
  onEdit: (s: Supplier) => void;
  onDelete: (s: Supplier) => void;
  emptyMessage?: string;
  productCounts?: Record<string, number>;
  /** Senza il permesso la tabella si legge soltanto: niente colonna «Azioni». */
  puoModificare?: boolean;
}) {
  if (suppliers.length === 0) {
    return (
      <div className="text-center py-10 text-muted-foreground border rounded-lg bg-muted/20">
        <Truck className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p className="font-medium text-foreground">Nessun fornitore trovato</p>
        <p className="text-sm mt-1">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          {/* Da 768 a 1536 meno colonne: a 1024 la tabella chiedeva 984px su
              638. Pagamento e P.IVA tornano da 1280, IVA e prodotti da 1536.
              Sul telefono restano tutte (la tabella scorre come prima). */}
          <TableHead>Nome del fornitore</TableHead>
          <TableHead>Categoria</TableHead>
          <TableHead className="md:max-xl:hidden">Pagamento</TableHead>
          <TableHead>Città</TableHead>
          <TableHead>Stato</TableHead>
          <TableHead className="md:max-xl:hidden">P.IVA</TableHead>
          <TableHead className="md:max-2xl:hidden">Aliquota IVA</TableHead>
          <TableHead className="md:max-2xl:hidden">Prodotti</TableHead>
          {puoModificare && <TableHead className="w-[100px]">Azioni</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {suppliers.map((supplier) => (
          <TableRow key={supplier.id}>
            <TableCell className="font-medium">{supplier.name}</TableCell>
            <TableCell>
              {supplier.product_category ? (
                <span className="inline-flex rounded-full border bg-muted/40 px-2 py-0.5 text-xs">
                  {supplier.product_category}
                </span>
              ) : "—"}
            </TableCell>
            <TableCell className="md:max-xl:hidden">{getPaymentMethodLabel(supplier.payment_method)}</TableCell>
            <TableCell>{supplier.city || "—"}</TableCell>
            <TableCell>
              <span className={`inline-flex rounded-full px-2 py-0.5 text-xs ${supplier.is_active ? "bg-emerald-50 text-emerald-700" : "bg-muted text-muted-foreground"}`}>
                {supplier.is_active ? "Attivo" : "Inattivo"}
              </span>
            </TableCell>
            <TableCell className="md:max-xl:hidden">{supplier.vat_number || "—"}</TableCell>
            <TableCell className="md:max-2xl:hidden">{getVatRateLabel(supplier.vat_rate || 22)}</TableCell>
            <TableCell className="md:max-2xl:hidden">
              {(productCounts[supplier.id] ?? 0) > 0 ? (
                <span className="inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700" title="Prodotti del listino collegati a questo fornitore">
                  {productCounts[supplier.id]} prod.
                </span>
              ) : <span className="text-xs text-muted-foreground">—</span>}
            </TableCell>
            {puoModificare && (
              <TableCell>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" onClick={() => onEdit(supplier)} aria-label={`Modifica ${supplier.name}`}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => onDelete(supplier)} aria-label={`Elimina ${supplier.name}`}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

// ─── Finestra del fornitore (nuovo / modifica) ──────────────────────────────

interface FornitoreDialogProps {
  /** Il fornitore da modificare; null = nuovo. */
  fornitore: Supplier | null;
  /** Per un fornitore nuovo: parte dalla scheda aperta (Italiani o Esteri). */
  esteroIniziale: boolean;
  fornitori: Supplier[];
  categorieEsistenti: string[];
  salvataggio: boolean;
  onChiudi: () => void;
  onSalva: (dati: SupplierFormData) => void;
}

/** Si monta solo da aperta: ogni apertura riparte dai dati del fornitore (o da vuota), senza un effetto che li ricopi. */
function FornitoreDialog({ aperta, ...resto }: FornitoreDialogProps & { aperta: boolean }) {
  if (!aperta) return null;
  return <FornitoreDialogAperta {...resto} />;
}

function FornitoreDialogAperta({ fornitore, esteroIniziale, fornitori, categorieEsistenti, salvataggio, onChiudi, onSalva }: FornitoreDialogProps) {
  const [formIniziale] = useState<SupplierFormData>(() => (fornitore ? supplierToForm(fornitore) : { ...emptyForm, is_foreign: esteroIniziale }));
  const [formData, setFormData] = useState<SupplierFormData>(formIniziale);
  const [categoryPopoverOpen, setCategoryPopoverOpen] = useState(false);
  const [categorySearch, setCategorySearch] = useState("");
  const modificato = JSON.stringify(formData) !== JSON.stringify(formIniziale);
  // Esc, clic fuori e «Annulla» chiedono conferma solo se si è scritto o cambiato qualcosa.
  const conferma = useSettingsDraftGuard(salvataggio || modificato);
  const chiudi = () => { if (!salvataggio && conferma()) onChiudi(); };
  const updateField = (field: keyof SupplierFormData, value: string | number | boolean) =>
    setFormData((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const safeName = normalizeSupplierName(formData.name);
    const safeNameKey = supplierNameKey(formData.name);
    const safeVatNumber = normalizeVatNumber(formData.vat_number);
    if (!safeName) {
      toast.error("Errore", { description: "Il nome è obbligatorio." });
      return;
    }
    if (fornitori.some((supplier) => supplier.id !== fornitore?.id && supplierNameKey(supplier.name) === safeNameKey)) {
      toast.error("Fornitore duplicato", { description: "Esiste già un fornitore con questa ragione sociale." });
      return;
    }
    if (safeVatNumber && fornitori.some((supplier) => supplier.id !== fornitore?.id && normalizeVatNumber(supplier.vat_number || "") === safeVatNumber)) {
      toast.error("P.IVA duplicata", { description: "Esiste già un fornitore con questa partita IVA." });
      return;
    }
    if (!isValidItalianVat(formData.vat_number, formData.is_foreign)) {
      toast.error("P.IVA non valida", { description: "Per fornitori italiani usa 11 cifre, con prefisso IT opzionale." });
      return;
    }
    if (!isValidEmail(formData.email)) {
      toast.error("Email non valida", { description: "Inserisci un indirizzo email valido." });
      return;
    }
    if (!isValidPhone(formData.phone)) {
      toast.error("Telefono non valido", { description: "Usa solo numeri, spazi, +, parentesi, punti o trattini." });
      return;
    }
    onSalva(formData);
  };

  return (
    <Dialog open onOpenChange={(aperta) => { if (!aperta) chiudi(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {fornitore ? "Modifica fornitore" : "Nuovo fornitore"}
          </DialogTitle>
          <DialogDescription>
            {fornitore ? "Modifica i dati del fornitore" : "Inserisci i dati del nuovo fornitore"}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Dati generali */}
          <div>
            <h3 className="text-sm font-semibold mb-3">Dati generali</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nome del fornitore *</Label>
                <Input id="name" value={formData.name} onChange={(e) => updateField("name", e.target.value)} placeholder="Es. ABC Serramenti Srl" maxLength={100} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="supplier-categoria">Categoria</Label>
                <Popover open={categoryPopoverOpen} onOpenChange={setCategoryPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      id="supplier-categoria"
                      variant="outline"
                      role="combobox"
                      aria-expanded={categoryPopoverOpen}
                      className="w-full justify-between font-normal"
                    >
                      {formData.product_category || "Seleziona categoria..."}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <Command shouldFilter={false}>
                       <CommandInput
                        placeholder="Cerca o crea categoria..."
                        value={categorySearch}
                        onValueChange={setCategorySearch}
                        maxLength={50}
                      />
                      <CommandList>
                        <CommandEmpty className="py-2 px-4 text-sm text-muted-foreground">
                          Nessuna categoria trovata
                        </CommandEmpty>
                        <CommandGroup>
                          {categorieEsistenti
                            .filter(cat => !categorySearch || cat.toLowerCase().includes(categorySearch.toLowerCase()))
                            .map((cat) => (
                              <CommandItem
                                key={cat}
                                value={cat}
                                onSelect={() => {
                                  updateField("product_category", cat);
                                  setCategoryPopoverOpen(false);
                                  setCategorySearch("");
                                }}
                              >
                                <Check className={cn("mr-2 h-4 w-4", formData.product_category === cat ? "opacity-100" : "opacity-0")} />
                                {cat}
                              </CommandItem>
                            ))}
                          {categorySearch.trim() && !categorieEsistenti.some(c => c.toLowerCase() === categorySearch.toLowerCase()) && (
                            <CommandItem
                              value={`create-${categorySearch}`}
                              onSelect={() => {
                                updateField("product_category", categorySearch.trim());
                                setCategoryPopoverOpen(false);
                                setCategorySearch("");
                              }}
                              className="text-primary"
                            >
                              <Plus className="mr-2 h-4 w-4" />
                              Crea "{categorySearch}"
                            </CommandItem>
                          )}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 mt-3">
              <div className="space-y-2">
                <Label htmlFor="supplier-pagamento">Modalità di pagamento</Label>
                <Select value={formData.payment_method || "none"} onValueChange={(v) => updateField("payment_method", v === "none" ? "" : v)}>
                  <SelectTrigger id="supplier-pagamento">
                    <SelectValue placeholder="Seleziona modalità..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nessuna</SelectItem>
                    {PAYMENT_METHODS.map((m) => (
                      <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="supplier-tipo">Tipo fornitore</Label>
                <Select value={formData.is_foreign ? "estero" : "italiano"} onValueChange={(v) => updateField("is_foreign", v === "estero")}>
                  <SelectTrigger id="supplier-tipo">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="italiano">Italiano</SelectItem>
                    <SelectItem value="estero">Estero</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-start gap-2 mt-4 rounded-md border p-3">
              <Checkbox
                id="supplier-active"
                checked={formData.is_active}
                onCheckedChange={(checked) => updateField("is_active", checked === true)}
              />
              <div>
                <Label htmlFor="supplier-active" className="cursor-pointer">Fornitore attivo</Label>
                <p className="text-[11px] text-muted-foreground">
                  I fornitori inattivi restano nello storico, ma non dovrebbero essere usati per nuovi acquisti.
                </p>
              </div>
            </div>
          </div>

          <Separator />

          {/* Dati fiscali */}
          <div>
            <h3 className="text-sm font-semibold mb-3">Dati fiscali</h3>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="vat_number">P.IVA</Label>
                <Input id="vat_number" value={formData.vat_number} onChange={(e) => updateField("vat_number", e.target.value)} placeholder="IT01234567890" maxLength={20} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fiscal_code">Codice fiscale</Label>
                <Input id="fiscal_code" value={formData.fiscal_code} onChange={(e) => updateField("fiscal_code", e.target.value)} maxLength={20} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="vat_rate">Aliquota IVA</Label>
                <Select value={formData.vat_rate.toString()} onValueChange={(v) => updateField("vat_rate", parseInt(v))}>
                  <SelectTrigger id="vat_rate">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {VAT_RATES.map((rate) => (
                      <SelectItem key={rate.value} value={rate.value.toString()}>
                        {rate.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <Separator />

          {/* Contatti */}
          <div>
            <h3 className="text-sm font-semibold mb-3">Contatti</h3>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={formData.email} onChange={(e) => updateField("email", e.target.value)} placeholder="info@fornitore.it" maxLength={100} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Telefono</Label>
                <Input id="phone" value={formData.phone} onChange={(e) => updateField("phone", e.target.value)} placeholder="+39 0123 456789" maxLength={20} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="website">Sito web</Label>
                <Input id="website" value={formData.website} onChange={(e) => updateField("website", e.target.value)} placeholder="www.fornitore.it" maxLength={100} />
              </div>
            </div>
          </div>

          <Separator />

          {/* Indirizzo */}
          <div>
            <h3 className="text-sm font-semibold mb-3">Indirizzo</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2 col-span-2">
                <Label htmlFor="address">Via / Indirizzo</Label>
                <Input id="address" value={formData.address} onChange={(e) => updateField("address", e.target.value)} placeholder="Via Roma 1" maxLength={200} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="city">Città</Label>
                <Input id="city" value={formData.city} onChange={(e) => updateField("city", e.target.value)} maxLength={50} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="province">Provincia</Label>
                <Input id="province" value={formData.province} onChange={(e) => updateField("province", e.target.value)} placeholder="MI" maxLength={5} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="postal_code">CAP</Label>
                <Input id="postal_code" value={formData.postal_code} onChange={(e) => updateField("postal_code", e.target.value)} placeholder="20100" maxLength={10} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="country">Paese</Label>
                <Input id="country" value={formData.country} onChange={(e) => updateField("country", e.target.value)} maxLength={50} />
              </div>
            </div>
          </div>

          <Separator />

          {/* Note */}
          <div className="space-y-2">
            <Label htmlFor="notes">Note</Label>
            <Textarea id="notes" value={formData.notes} onChange={(e) => updateField("notes", e.target.value)} placeholder="Note aggiuntive sul fornitore..." rows={3} maxLength={500} />
          </div>

          {/* Codici a barre: l'unica scelta che qualcuno legge è «usa GS1» (il carico rapido del magazzino).
              «Prefisso barcode» e «Formato QR» sono stati tolti: non li leggeva nessun codice. */}
          <Accordion type="single" collapsible className="border rounded-lg">
            <AccordionItem value="codici-a-barre" className="border-0">
              <AccordionTrigger className="px-3 py-2 hover:no-underline">
                <div className="flex items-center gap-2 text-left">
                  <QrCode className="h-4 w-4 text-muted-foreground" />
                  <div className="flex flex-col items-start">
                    <span className="text-sm font-medium">Codici a barre</span>
                    <span className="text-xs text-muted-foreground">
                      {formData.uses_gs1 ? "GS1 attivo" : "GS1 non attivo"}
                    </span>
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-3 pb-3">
                <div className="flex items-start gap-2 pt-1">
                  <Checkbox
                    id="uses-gs1"
                    checked={formData.uses_gs1}
                    onCheckedChange={(checked) => updateField("uses_gs1", checked === true)}
                  />
                  <div className="flex-1">
                    <Label htmlFor="uses-gs1" className="text-sm font-medium cursor-pointer">
                      Questo fornitore usa codici GS1
                    </Label>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Il lettore legge da solo lotto, seriale e scadenza dai QR di questo fornitore.
                    </p>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          <DialogFooter>
            <Button type="button" variant="outline" disabled={salvataggio} onClick={chiudi}>
              Annulla
            </Button>
            <Button type="submit" disabled={salvataggio}>
              {salvataggio && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {fornitore ? "Salva" : "Crea"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Finestra «Unisci due fornitori» ────────────────────────────────────────

interface UnisciDialogProps {
  fornitori: Supplier[];
  /** Quelli che sembrano doppioni (stesso nome o stessa partita IVA): solo un suggerimento. */
  candidati: Supplier[];
  salvataggio: boolean;
  onChiudi: () => void;
  onUnisci: (doppioneId: string, principaleId: string) => void;
}

/** Si monta solo da aperta: ogni apertura riparte con le due scelte vuote. */
function UnisciFornitoriDialog({ aperta, ...resto }: UnisciDialogProps & { aperta: boolean }) {
  if (!aperta) return null;
  return <UnisciFornitoriDialogAperta {...resto} />;
}

function UnisciFornitoriDialogAperta({ fornitori, candidati, salvataggio, onChiudi, onUnisci }: UnisciDialogProps) {
  const [doppioneId, setDoppioneId] = useState("");
  const [principaleId, setPrincipaleId] = useState("");
  // Chi ha già scelto qualcosa non lo perde con Esc o un clic fuori.
  const conferma = useSettingsDraftGuard(salvataggio || !!doppioneId || !!principaleId);
  const chiudi = () => { if (!salvataggio && conferma()) onChiudi(); };

  return (
    <Dialog open onOpenChange={(aperta) => { if (!aperta) chiudi(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Unisci due fornitori</DialogTitle>
          <DialogDescription>
            Sposta ordini, costi, scadenze, prima nota, listino e magazzino dal doppione al fornitore principale, poi elimina il doppione.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {candidati.length > 0 && (
            <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
              Possibili doppioni: {candidati.map((supplier) => supplier.name).join(", ")}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="unisci-doppione">Doppione da eliminare</Label>
            <Select value={doppioneId} onValueChange={setDoppioneId}>
              <SelectTrigger id="unisci-doppione"><SelectValue placeholder="Scegli il doppione..." /></SelectTrigger>
              <SelectContent>
                {fornitori.map((supplier) => (
                  <SelectItem key={supplier.id} value={supplier.id}>
                    {supplier.name}{supplier.vat_number ? ` · ${supplier.vat_number}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="unisci-principale">Fornitore da tenere</Label>
            <Select value={principaleId} onValueChange={setPrincipaleId}>
              <SelectTrigger id="unisci-principale"><SelectValue placeholder="Scegli il fornitore da tenere..." /></SelectTrigger>
              <SelectContent>
                {fornitori.filter((supplier) => supplier.id !== doppioneId).map((supplier) => (
                  <SelectItem key={supplier.id} value={supplier.id}>
                    {supplier.name}{supplier.vat_number ? ` · ${supplier.vat_number}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Non si può annullare</AlertTitle>
            <AlertDescription className="text-xs">
              Controlla bene quale tenere e quale eliminare prima di andare avanti.
            </AlertDescription>
          </Alert>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={salvataggio} onClick={chiudi}>
            Annulla
          </Button>
          <Button
            type="button"
            disabled={!doppioneId || !principaleId || doppioneId === principaleId || salvataggio}
            onClick={() => onUnisci(doppioneId, principaleId)}
          >
            {salvataggio && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Unisci i fornitori
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── La scheda «Anagrafica» ─────────────────────────────────────────────────

export function SuppliersConfig({ puoModificare = true }: { puoModificare?: boolean }) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState("italiani");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [provinceFilter, setProvinceFilter] = useState("all");
  const [sortBy, setSortBy] = useState("name");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [deletingSupplier, setDeletingSupplier] = useState<Supplier | null>(null);

  const { data: suppliers, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["suppliers-config", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("suppliers")
        .select("*")
        .eq("company_id", companyId)
        .order("name");
      if (error) throw error;
      return data as Supplier[];
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
  });

  // Conteggio prodotti del listino collegati a ciascun fornitore (correlazione
  // article_families.supplier_id → suppliers.id). Mostrato in colonna "Prodotti".
  const { data: productCounts = {} } = useQuery({
    queryKey: ["supplier-product-counts", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("article_families").select("supplier_id")
        .eq("company_id", companyId).is("deleted_at", null).not("supplier_id", "is", null);
      if (error) throw error;
      const m: Record<string, number> = {};
      for (const r of (data ?? []) as Array<{ supplier_id: string | null }>) {
        if (r.supplier_id) m[r.supplier_id] = (m[r.supplier_id] ?? 0) + 1;
      }
      return m;
    },
  });

  const existingCategories = useMemo(() => {
    if (!suppliers) return [];
    const cats = new Set(suppliers.map(s => s.product_category).filter(Boolean) as string[]);
    return Array.from(cats).sort();
  }, [suppliers]);

  const existingProvinces = useMemo(() => {
    if (!suppliers) return [];
    const provinces = new Set(suppliers.map((s) => s.province?.toUpperCase()).filter(Boolean) as string[]);
    return Array.from(provinces).sort();
  }, [suppliers]);

  const duplicateCandidates = useMemo(() => {
    const list = suppliers ?? [];
    return list.filter((supplier) => {
      const nameKey = supplierNameKey(supplier.name);
      const vatKey = normalizeVatNumber(supplier.vat_number || "");
      return list.some((other) => (
        other.id !== supplier.id &&
        (supplierNameKey(other.name) === nameKey ||
          (!!vatKey && normalizeVatNumber(other.vat_number || "") === vatKey))
      ));
    });
  }, [suppliers]);

  const applyFilters = (list: Supplier[]) => {
    const q = searchQuery.toLowerCase();
    const filtered = list.filter((s) => {
      const matchesSearch = !q.trim() ||
        s.name.toLowerCase().includes(q) ||
        (s.product_category && s.product_category.toLowerCase().includes(q)) ||
        (s.city && s.city.toLowerCase().includes(q)) ||
        (s.province && s.province.toLowerCase().includes(q)) ||
        (s.vat_number && s.vat_number.toLowerCase().includes(q));
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && s.is_active) ||
        (statusFilter === "inactive" && !s.is_active);
      const matchesCategory = categoryFilter === "all" || s.product_category === categoryFilter;
      const matchesProvince = provinceFilter === "all" || s.province?.toUpperCase() === provinceFilter;
      return matchesSearch && matchesStatus && matchesCategory && matchesProvince;
    });

    return [...filtered].sort((a, b) => {
      if (sortBy === "category") return (a.product_category || "").localeCompare(b.product_category || "") || a.name.localeCompare(b.name);
      if (sortBy === "city") return (a.city || "").localeCompare(b.city || "") || a.name.localeCompare(b.name);
      if (sortBy === "status") return Number(b.is_active) - Number(a.is_active) || a.name.localeCompare(b.name);
      return a.name.localeCompare(b.name);
    });
  };

  const italiani = applyFilters(suppliers?.filter((s) => !s.is_foreign) || []);
  const esteri = applyFilters(suppliers?.filter((s) => s.is_foreign) || []);

  const { data: deletingUsage = emptyUsageCounts, isFetching: deletingUsageLoading, isError: deletingUsageIsError } = useQuery({
    queryKey: ["supplier-delete-usage", companyId, deletingSupplier?.id],
    queryFn: async () => {
      if (!companyId || !deletingSupplier?.id) return emptyUsageCounts;
      return getSupplierUsageCounts(companyId, deletingSupplier.id);
    },
    enabled: !!companyId && !!deletingSupplier?.id && deleteDialogOpen,
  });

  const deletingUsageTotal = getUsageTotal(deletingUsage);

  const invalidateSuppliers = () => {
    queryClient.invalidateQueries({ queryKey: ["suppliers-config"] });
    queryClient.invalidateQueries({ queryKey: ["suppliers"] });
    queryClient.invalidateQueries({ queryKey: ["suppliers-export"] });
    queryClient.invalidateQueries({ queryKey: ["operational-suppliers"] });
  };

  const createMutation = useMutation({
    mutationFn: async (data: SupplierFormData) => {
      if (!puoModificare) throw new ErroreFornitore("Per creare un fornitore serve il permesso «Fornitori» in modifica.");
      if (!companyId) throw new ErroreFornitore("Azienda non selezionata");
      const safeName = normalizeSupplierName(data.name);
      if (!safeName) throw new ErroreFornitore("La ragione sociale è obbligatoria.");
      const { error } = await supabase.from("suppliers").insert({
        name: safeName,
        vat_rate: data.vat_rate,
        is_foreign: data.is_foreign,
        address: normalizeOptional(data.address),
        city: normalizeOptional(data.city),
        province: normalizeOptional(data.province)?.toUpperCase() ?? null,
        postal_code: normalizeOptional(data.postal_code),
        country: normalizeOptional(data.country),
        vat_number: normalizeOptional(normalizeVatNumber(data.vat_number)),
        fiscal_code: normalizeOptional(data.fiscal_code.toUpperCase()),
        email: normalizeOptional(data.email.toLowerCase()),
        phone: normalizeOptional(data.phone),
        website: normalizeOptional(data.website),
        product_category: normalizeOptional(data.product_category),
        notes: normalizeOptional(data.notes),
        payment_method: normalizeOptional(data.payment_method),
        is_active: data.is_active,
        company_id: companyId,
        // Prefisso barcode e formato QR non si scrivono più (nessuno li leggeva): nel database restano come sono.
        uses_gs1: data.uses_gs1,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateSuppliers();
      toast.success("Fornitore creato", { description: "Il fornitore è stato aggiunto con successo." });
      handleCloseDialog();
    },
    onError: (error) => {
      toast.error("Errore", { description: descrizioneErrore(error, "Impossibile creare il fornitore.") });
      logger.error("Errore creazione fornitore", error);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: SupplierFormData & { id: string }) => {
      if (!puoModificare) throw new ErroreFornitore("Per modificare un fornitore serve il permesso «Fornitori» in modifica.");
      if (!companyId) throw new ErroreFornitore("Azienda non selezionata");
      const safeName = normalizeSupplierName(data.name);
      if (!safeName) throw new ErroreFornitore("La ragione sociale è obbligatoria.");
      const { error } = await supabase
        .from("suppliers")
        .update({
          name: safeName,
          vat_rate: data.vat_rate,
          is_foreign: data.is_foreign,
          address: normalizeOptional(data.address),
          city: normalizeOptional(data.city),
          province: normalizeOptional(data.province)?.toUpperCase() ?? null,
          postal_code: normalizeOptional(data.postal_code),
          country: normalizeOptional(data.country),
          vat_number: normalizeOptional(normalizeVatNumber(data.vat_number)),
          fiscal_code: normalizeOptional(data.fiscal_code.toUpperCase()),
          email: normalizeOptional(data.email.toLowerCase()),
          phone: normalizeOptional(data.phone),
          website: normalizeOptional(data.website),
          product_category: normalizeOptional(data.product_category),
          notes: normalizeOptional(data.notes),
          payment_method: normalizeOptional(data.payment_method),
          is_active: data.is_active,
          // Prefisso barcode e formato QR non si toccano più: se un fornitore li ha, restano com'erano.
          uses_gs1: data.uses_gs1,
        })
        .eq("id", id)
        .eq("company_id", companyId!);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateSuppliers();
      toast.success("Fornitore aggiornato", { description: "Le modifiche sono state salvate." });
      handleCloseDialog();
    },
    onError: (error) => {
      toast.error("Errore", { description: descrizioneErrore(error, "Impossibile aggiornare il fornitore.") });
      logger.error("Errore aggiornamento fornitore", error);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!puoModificare) throw new ErroreFornitore("Per eliminare un fornitore serve il permesso «Fornitori» in modifica.");
      if (!companyId) throw new ErroreFornitore("Azienda non selezionata");
      const usage = await getSupplierUsageCounts(companyId, id);
      if (getUsageTotal(usage) > 0) {
        throw new ErroreFornitore("Fornitore già collegato a dati operativi: eliminazione bloccata per proteggere ordini, costi, pagamenti, magazzino e report.");
      }
      const { error } = await supabase.from("suppliers").delete().eq("id", id).eq("company_id", companyId!);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateSuppliers();
      toast.success("Fornitore eliminato", { description: "Il fornitore è stato rimosso." });
      setDeleteDialogOpen(false);
      setDeletingSupplier(null);
    },
    onError: (error: Error) => {
      if ((error as { code?: string }).code === "23503" || testoTecnico(error).includes("foreign key")) {
        toast.error("Impossibile eliminare", {
          description: "Il fornitore è associato a dati operativi e non può essere eliminato.",
        });
      } else {
        toast.error("Errore", { description: descrizioneErrore(error, "Impossibile eliminare il fornitore.") });
      }
      logger.error("Errore eliminazione fornitore", error);
    },
  });

  const mergeMutation = useMutation({
    mutationFn: async ({ sourceId, targetId }: { sourceId: string; targetId: string }) => {
      if (!puoModificare) throw new ErroreFornitore("Per unire due fornitori serve il permesso «Fornitori» in modifica.");
      if (!companyId) throw new ErroreFornitore("Azienda non selezionata");
      if (!sourceId || !targetId || sourceId === targetId) {
        throw new ErroreFornitore("Scegli due fornitori diversi.");
      }
      const source = suppliers?.find((supplier) => supplier.id === sourceId);
      const target = suppliers?.find((supplier) => supplier.id === targetId);
      if (!source || !target) throw new ErroreFornitore("Non trovo uno dei due fornitori: ricarica la pagina e riprova.");

      const operations = [
        supabase.from("article_templates").update({ supplier_id: targetId }).eq("company_id", companyId).eq("supplier_id", sourceId),
        supabase.from("company_costs").update({ supplier_id: targetId }).eq("company_id", companyId).eq("supplier_id", sourceId),
        supabase.from("order_items").update({ supplier_id: targetId }).eq("supplier_id", sourceId),
        supabase.from("purchase_orders").update({ supplier_id: targetId }).eq("company_id", companyId).eq("supplier_id", sourceId),
        supabase.from("scadenze").update({ supplier_id: targetId }).eq("company_id", companyId).eq("supplier_id", sourceId),
        supabase.from("prima_nota_entries").update({ supplier_id: targetId }).eq("company_id", companyId).eq("supplier_id", sourceId),
        supabase.from("warehouse_stock").update({ supplier_id: targetId }).eq("company_id", companyId).eq("supplier_id", sourceId),
      ];

      const results = await Promise.all(operations);
      const failed = results.find((result) => result.error);
      if (failed?.error) throw failed.error;

      const { error: deleteError } = await supabase
        .from("suppliers")
        .delete()
        .eq("id", sourceId)
        .eq("company_id", companyId);
      if (deleteError) throw deleteError;

      const user = (await supabase.auth.getUser()).data.user;
      if (user?.id) {
        await supabase.from("company_activity_log").insert({
          company_id: companyId,
          user_id: user.id,
          action: "merge",
          target_type: "supplier",
          target_id: targetId,
          details: {
            source_id: sourceId,
            source_name: source.name,
            target_name: target.name,
          },
        });
      }
    },
    onSuccess: () => {
      invalidateSuppliers();
      setMergeDialogOpen(false);
      toast.success("Fornitori uniti", { description: "Storico, costi, ordini e pagamenti sono passati al fornitore da tenere." });
    },
    onError: (error: Error) => {
      toast.error("Non sono riuscito a unire i fornitori.", { description: descrizioneErrore(error, "Riprova tra poco.") });
      logger.error("Errore unione fornitori", error);
    },
  });

  const handleOpenCreate = () => {
    if (!puoModificare) return;
    setEditingSupplier(null);
    setDialogOpen(true);
  };

  const handleOpenEdit = (supplier: Supplier) => {
    if (!puoModificare) return;
    setEditingSupplier(supplier);
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingSupplier(null);
  };

  const handleOpenDelete = (supplier: Supplier) => {
    if (!puoModificare) return;
    setDeletingSupplier(supplier);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = () => {
    if (deletingSupplier) deleteMutation.mutate(deletingSupplier.id);
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <Card>
      {puoModificare && (
        <CardHeader>
          {/* v8.6.74 — flex-wrap su mobile: prima i 2 button (Unisci doppioni +
              Nuovo fornitore) tagliavano fuori dal viewport iPhone 375px.
              Il titolo «Fornitori» lo mette già la testata delle Impostazioni:
              qui restano solo i bottoni, a destra. */}
          <div className="flex flex-wrap items-start justify-between gap-2 md:justify-end">
            <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
              <Button variant="outline" size="sm" className="flex-1 sm:flex-none" onClick={() => setMergeDialogOpen(true)}>
                <Merge className="h-4 w-4 mr-2" />
                Unisci doppioni
              </Button>
              <Button size="sm" className="flex-1 sm:flex-none" onClick={handleOpenCreate}>
                <Plus className="h-4 w-4 mr-2" />
                <span className="hidden sm:inline">Nuovo fornitore</span>
                <span className="sm:hidden">Nuovo</span>
              </Button>
            </div>
          </div>
        </CardHeader>
      )}
      <CardContent className={cn(!puoModificare && "pt-6")}>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : isError ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Impossibile caricare i fornitori</AlertTitle>
            <AlertDescription className="space-y-3">
              <p className="text-xs">{userErrorMessage(error, "Errore durante il caricamento dell'anagrafica fornitori.")}</p>
              <Button type="button" variant="outline" size="sm" onClick={() => void refetch()}>
                Riprova
              </Button>
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-4">
            {/* In una riga solo da 1536: prima da 1024 chiedeva 908px e il
                quarto menu usciva dalla card. Sotto, ricerca e quattro menu su
                due righe. */}
            <div className="grid gap-3 md:grid-cols-4 2xl:grid-cols-[minmax(220px,1fr)_160px_180px_140px_160px]">
              <div className="relative md:col-span-4 2xl:col-span-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Cerca nome, categoria, città, provincia o P.IVA..."
                  aria-label="Cerca un fornitore"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger aria-label="Filtra per stato"><SelectValue placeholder="Stato" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutti gli stati</SelectItem>
                  <SelectItem value="active">Solo attivi</SelectItem>
                  <SelectItem value="inactive">Solo inattivi</SelectItem>
                </SelectContent>
              </Select>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger aria-label="Filtra per categoria"><SelectValue placeholder="Categoria" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutte le categorie</SelectItem>
                  {existingCategories.map((category) => (
                    <SelectItem key={category} value={category}>{category}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={provinceFilter} onValueChange={setProvinceFilter}>
                <SelectTrigger aria-label="Filtra per provincia"><SelectValue placeholder="Provincia" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutte le province</SelectItem>
                  {existingProvinces.map((province) => (
                    <SelectItem key={province} value={province}>{province}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger aria-label="Ordina i fornitori">
                  <ArrowUpDown className="mr-2 h-4 w-4" />
                  <SelectValue placeholder="Ordina" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="name">Nome</SelectItem>
                  <SelectItem value="category">Categoria</SelectItem>
                  <SelectItem value="city">Città</SelectItem>
                  <SelectItem value="status">Stato</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {duplicateCandidates.length > 0 && (
              <Alert>
                <Merge className="h-4 w-4" />
                <AlertTitle>Possibili doppioni</AlertTitle>
                <AlertDescription className="text-xs">
                  {puoModificare
                    ? `${duplicateCandidates.length} fornitori hanno nome o partita IVA simili. Usa «Unisci doppioni» per portare lo storico sul fornitore giusto.`
                    : `${duplicateCandidates.length} fornitori hanno nome o partita IVA simili.`}
                </AlertDescription>
              </Alert>
            )}
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-2 max-w-xs">
                <TabsTrigger value="italiani">Italiani ({italiani.length})</TabsTrigger>
                <TabsTrigger value="esteri">Esteri ({esteri.length})</TabsTrigger>
              </TabsList>
              <TabsContent value="italiani">
                <SupplierTable suppliers={italiani} onEdit={handleOpenEdit} onDelete={handleOpenDelete} productCounts={productCounts} puoModificare={puoModificare} emptyMessage={puoModificare ? "Modifica ricerca o filtri, oppure crea un nuovo fornitore italiano." : "Modifica ricerca o filtri."} />
              </TabsContent>
              <TabsContent value="esteri">
                <SupplierTable suppliers={esteri} onEdit={handleOpenEdit} onDelete={handleOpenDelete} productCounts={productCounts} puoModificare={puoModificare} emptyMessage={puoModificare ? "Modifica ricerca o filtri, oppure crea un nuovo fornitore estero." : "Modifica ricerca o filtri."} />
              </TabsContent>
            </Tabs>
          </div>
        )}
      </CardContent>

      <FornitoreDialog
        aperta={puoModificare && dialogOpen}
        fornitore={editingSupplier}
        esteroIniziale={activeTab === "esteri"}
        fornitori={suppliers ?? []}
        categorieEsistenti={existingCategories}
        salvataggio={isSaving}
        onChiudi={handleCloseDialog}
        onSalva={(dati) => {
          if (editingSupplier) updateMutation.mutate({ id: editingSupplier.id, ...dati });
          else createMutation.mutate(dati);
        }}
      />

      <UnisciFornitoriDialog
        aperta={puoModificare && mergeDialogOpen}
        fornitori={suppliers ?? []}
        candidati={duplicateCandidates}
        salvataggio={mergeMutation.isPending}
        onChiudi={() => setMergeDialogOpen(false)}
        onUnisci={(sourceId, targetId) => mergeMutation.mutate({ sourceId, targetId })}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={puoModificare && deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare il fornitore?</AlertDialogTitle>
            <AlertDialogDescription>
              Stai per eliminare il fornitore "{deletingSupplier?.name}".
              {deletingUsageLoading ? (
                <> Verifico i collegamenti operativi prima di consentire l'eliminazione.</>
              ) : deletingUsageTotal > 0 ? (
                <>
                  {" "}Il fornitore è collegato a dati operativi e non può essere eliminato senza proteggere lo storico.
                  Usa lo stato inattivo se non deve essere più usato nei nuovi acquisti.
                </>
              ) : deletingUsageIsError ? (
                <> Non è stato possibile verificare tutti i collegamenti: l'eliminazione resta bloccata per sicurezza.</>
              ) : (
                <> Questa azione non può essere annullata.</>
              )}
            </AlertDialogDescription>
            {(deletingUsageTotal > 0 || deletingUsageIsError) && (
              <div className="mt-3 rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground space-y-1">
                {(Object.entries(deletingUsage) as Array<[keyof SupplierUsageCounts, number]>).map(([key, value]) => (
                  value > 0 ? <p key={key}>{supplierUsageLabels[key]} collegati: {value}</p> : null
                ))}
                {deletingUsageIsError && <p>Verifica collegamenti non riuscita.</p>}
              </div>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={deletingUsageLoading || deletingUsageTotal > 0 || deletingUsageIsError || deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {deletingUsageTotal > 0 || deletingUsageIsError ? "Bloccata" : "Elimina"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
