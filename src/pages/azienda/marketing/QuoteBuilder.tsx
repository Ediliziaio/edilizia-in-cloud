import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/formatters";
import { queryKeys } from "@/lib/queryKeys";
import { useQuoteTemplates } from "@/hooks/useQuoteTemplates";
import { QuoteTemplatePreview } from "@/components/quotes/QuoteTemplatePreview";
import AIQuotePanel from "@/components/quotes/AIQuotePanel";
import type { QuoteTemplateLayout } from "@/types/quoteTemplate";
import type { QuoteItemPro } from "@/types/quoteItem";
import {
  usePreventivoCosti,
  calcolaMargine,
  semaforo,
  calcolaTotaliPreventivo,
  round2,
  espondiBundle,
} from "@/hooks/usePreventivoCosti";
import type { ArticlePro, TariffaPro, BundleConVoci } from "@/hooks/usePreventivoCosti";
import BundleSelector from "@/components/marketing/preventivi/BundleSelector";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronsUpDown, Check, GripVertical } from "lucide-react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ArrowLeft,
  ArrowRight,
  Plus,
  Trash2,
  Save,
  FileCheck,
  Loader2,
  User,
  Package,
  FileStack,
  Palette,
  ChevronDown,
  MoreVertical,
  StickyNote,
  Tag,
  Hash,
  Truck,
  Layers,
  TrendingUp,
  AlertTriangle,
  Settings2,
} from "lucide-react";

// ─── Helper components ────────────────────────────────────────────────────────

function MargineSemaforo({
  pct,
  sogliaMin = 15,
  target = 25,
}: {
  pct: number;
  sogliaMin?: number;
  target?: number;
}) {
  const s = semaforo(pct, sogliaMin, target);
  const colors = {
    green: "bg-green-100 text-green-700",
    yellow: "bg-yellow-100 text-yellow-700",
    red: "bg-red-100 text-red-700",
  };
  const icons = { green: "🟢", yellow: "🟡", red: "🔴" };
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${colors[s]}`}
    >
      {icons[s]} {pct.toFixed(1)}%
    </span>
  );
}

function SortableItem({
  id,
  children,
}: {
  id: string;
  children: (dragHandle: React.ReactNode) => React.ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const handle = (
    <button
      {...attributes}
      {...listeners}
      className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground p-1 touch-none shrink-0"
      tabIndex={-1}
    >
      <GripVertical className="h-4 w-4" />
    </button>
  );

  return (
    <div ref={setNodeRef} style={style}>
      {children(handle)}
    </div>
  );
}

interface ContactOption {
  id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  company_name: string | null;
  address: string | null;
  city: string | null;
  province: string | null;
  postal_code: string | null;
  fiscal_code: string | null;
  vat_number: string | null;
}

interface ListinoCategoria {
  id: string;
  nome: string;
  margine_target_percentuale?: number | null;
}

interface QuotePdfMaterial {
  id: string;
  name: string;
  category: string | null;
  file_size_bytes: number;
}

function ContactCombobox({
  contacts,
  value,
  onChange,
}: {
  contacts: ContactOption[];
  value: string | null;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = contacts.find((c) => c.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          {selected
            ? `${selected.first_name} ${selected.last_name}${selected.company_name ? ` (${selected.company_name})` : ""}`
            : "Cerca contatto..."}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full p-0" align="start">
        <Command>
          <CommandInput placeholder="Cerca per nome, azienda, email..." />
          <CommandList>
            <CommandEmpty>Nessun contatto trovato</CommandEmpty>
            <CommandGroup>
              {contacts.map((c) => (
                <CommandItem
                  key={c.id}
                  value={`${c.first_name} ${c.last_name} ${c.company_name || ""} ${c.email || ""}`}
                  onSelect={() => { onChange(c.id); setOpen(false); }}
                >
                  <Check className={`mr-2 h-4 w-4 ${value === c.id ? "opacity-100" : "opacity-0"}`} />
                  <div>
                    <div className="font-medium text-sm">
                      {c.first_name} {c.last_name}
                    </div>
                    {c.company_name && (
                      <div className="text-xs text-muted-foreground">{c.company_name}</div>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function ProductSearchDialog({
  open,
  onClose,
  articoli,
  categorie,
  pianoInstallazione,
  calcolaPrezzoProdotto,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  articoli: ArticlePro[];
  categorie: ListinoCategoria[];
  pianoInstallazione: number;
  calcolaPrezzoProdotto: (
    prodotto: ArticlePro,
    qty: number,
    x?: number,
    y?: number
  ) => Promise<{ prezzo_vendita: number; prezzo_acquisto: number; trovato_in_griglia?: boolean }>;
  onConfirm: (p: ArticlePro, qty: number, x?: number, y?: number) => void;
}) {
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState("all");
  const [pending, setPending] = useState<ArticlePro | null>(null);
  const [qty, setQty] = useState("1");
  const [mx, setMx] = useState("");
  const [my, setMy] = useState("");
  const [preview, setPreview] = useState<{ pv: number; trovato: boolean } | null>(null);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setCat("all");
      setPending(null);
      setQty("1");
      setMx("");
      setMy("");
      setPreview(null);
    }
  }, [open]);

  useEffect(() => {
    if (!pending || pending.modalita_prezzo !== "griglia") {
      setPreview(null);
      return;
    }
    const x = parseFloat(mx),
      y = parseFloat(my);
    if (isNaN(x) || isNaN(y) || x <= 0 || y <= 0) {
      setPreview(null);
      return;
    }
    calcolaPrezzoProdotto(pending, parseFloat(qty) || 1, x, y)
      .then((r) => setPreview({ pv: r.prezzo_vendita, trovato: r.trovato_in_griglia ?? false }))
      .catch(() => setPreview(null));
  }, [mx, my, qty, pending]);

  const mqPreview =
    pending?.modalita_prezzo === "mq" && mx && my
      ? parseFloat(mx) * parseFloat(my)
      : null;

  const queryLower = query.toLowerCase();
  const filtered = articoli.filter(
    (a) =>
      (cat === "all" || a.categoria_id === cat) &&
      (query === "" ||
        a.name.toLowerCase().includes(queryLower) ||
        (a.sku || "").toLowerCase().includes(queryLower) ||
        (a.marca || "").toLowerCase().includes(queryLower) ||
        (a.description || "").toLowerCase().includes(queryLower))
  );

  const handleSelect = (a: ArticlePro) => {
    if (a.modalita_prezzo === "pz" || a.modalita_prezzo === "misura_libera") {
      onConfirm(a, parseFloat(qty) || 1);
      return;
    }
    setPending(a);
  };

  const handleConfirm = () => {
    if (!pending) return;
    const x =
      pending.modalita_prezzo === "mq"
        ? parseFloat(mx) * 1000
        : parseFloat(mx);
    const y =
      pending.modalita_prezzo === "mq"
        ? parseFloat(my) * 1000
        : parseFloat(my);
    onConfirm(pending, parseFloat(qty) || 1, x || undefined, y || undefined);
    setPending(null);
    setMx("");
    setMy("");
  };

  const modalitaBadge = (m: string) => {
    const map: Record<string, { label: string; className: string }> = {
      pz: { label: "A pezzo", className: "bg-gray-100 text-gray-700" },
      mq: { label: "Al mq", className: "bg-blue-100 text-blue-700" },
      misura_libera: {
        label: "Misura libera",
        className: "bg-purple-100 text-purple-700",
      },
      griglia: { label: "Griglia", className: "bg-orange-100 text-orange-700" },
    };
    const b = map[m] || { label: m, className: "bg-gray-100 text-gray-700" };
    return (
      <span className={`text-xs px-2 py-0.5 rounded-full ${b.className}`}>
        {b.label}
      </span>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Aggiungi dal listino</DialogTitle>
        </DialogHeader>
        {!pending ? (
          <>
            <div className="flex gap-2">
              <Input
                placeholder="Cerca per nome o SKU..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="flex-1"
              />
              <Select value={cat} onValueChange={setCat}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Categoria" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutte</SelectItem>
                  {categorie.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <ScrollArea className="flex-1 min-h-0">
              <div className="space-y-2 pr-2">
                {filtered.length === 0 ? (
                  <p className="text-center text-sm text-muted-foreground py-8">
                    Nessun prodotto trovato
                  </p>
                ) : (
                  filtered.map((a) => (
                    <button
                      key={a.id}
                      onClick={() => handleSelect(a)}
                      className="w-full flex items-center gap-3 p-3 border rounded-lg hover:bg-muted/50 text-left transition-colors"
                    >
                      {a.immagine_url ? (
                        <img
                          src={a.immagine_url}
                          alt=""
                          className="h-10 w-10 object-cover rounded shrink-0"
                        />
                      ) : (
                        <div className="h-10 w-10 bg-muted rounded flex items-center justify-center shrink-0">
                          <Package className="h-5 w-5 text-muted-foreground" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">
                          {a.name}
                        </div>
                        {a.sku && (
                          <div className="text-xs text-muted-foreground">
                            {a.sku}
                            {a.marca ? ` · ${a.marca}` : ""}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        {modalitaBadge(a.modalita_prezzo || "pz")}
                        {a.prezzo_vendita ? (
                          <span className="text-sm font-medium">
                            €{a.prezzo_vendita.toFixed(2)}
                          </span>
                        ) : null}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </ScrollArea>
          </>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg">
              <button
                onClick={() => setPending(null)}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                ← Torna
              </button>
              <span className="font-medium">{pending.name}</span>
              {modalitaBadge(pending.modalita_prezzo || "pz")}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Quantità</Label>
                <Input
                  type="number"
                  min="1"
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                />
              </div>
            </div>
            {(pending.modalita_prezzo === "griglia" ||
              pending.modalita_prezzo === "mq") && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>
                    {pending.modalita_prezzo === "mq"
                      ? "Larghezza (m)"
                      : "Larghezza (mm)"}
                  </Label>
                  <Input
                    type="number"
                    value={mx}
                    onChange={(e) => setMx(e.target.value)}
                    placeholder={
                      pending.modalita_prezzo === "mq" ? "1.20" : "1200"
                    }
                  />
                </div>
                <div>
                  <Label>
                    {pending.modalita_prezzo === "mq"
                      ? "Altezza (m)"
                      : "Altezza (mm)"}
                  </Label>
                  <Input
                    type="number"
                    value={my}
                    onChange={(e) => setMy(e.target.value)}
                    placeholder={
                      pending.modalita_prezzo === "mq" ? "2.10" : "2100"
                    }
                  />
                </div>
              </div>
            )}
            {pending.modalita_prezzo === "mq" && mqPreview != null && (
              <div className="text-sm text-muted-foreground bg-blue-50 rounded p-3">
                Superficie: <b>{mqPreview.toFixed(2)} mq</b> — Prezzo:{" "}
                <b>
                  €
                  {(
                    (pending.prezzo_vendita || 0) *
                    mqPreview *
                    (parseFloat(qty) || 1)
                  ).toFixed(2)}
                </b>
              </div>
            )}
            {pending.modalita_prezzo === "griglia" && preview && (
              <div
                className={`text-sm rounded p-3 ${
                  preview.trovato
                    ? "bg-green-50 text-green-700"
                    : "bg-amber-50 text-amber-700"
                }`}
              >
                {preview.trovato ? (
                  <>
                    Prezzo trovato in griglia:{" "}
                    <b>€{preview.pv.toFixed(2)}</b>
                  </>
                ) : (
                  "Dimensioni non trovate in griglia — verrà usata la cella più vicina"
                )}
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setPending(null)}>
                Indietro
              </Button>
              <Button
                onClick={handleConfirm}
                disabled={
                  pending.modalita_prezzo === "griglia" && (!mx || !my)
                }
              >
                Conferma e aggiungi
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── STEPS ────────────────────────────────────────────────────────────────────

const STEPS = [
  { key: "cliente", label: "Cliente", icon: User },
  { key: "prodotti", label: "Prodotti", icon: Package },
  { key: "documenti", label: "Documenti", icon: FileStack },
  { key: "riepilogo", label: "Riepilogo", icon: FileCheck },
];

// ─── Main component ───────────────────────────────────────────────────────────

export default function QuoteBuilder() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const isEdit = !!id;
  const { effectiveCompany, user, role } = useAuth();
  const companyId = effectiveCompany?.id;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isAdmin = role === "company_admin" || role === "super_admin";

  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  // Step 0: Client
  const [contactId, setContactId] = useState<string | null>(null);
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [clientCompany, setClientCompany] = useState("");
  const [clientAddress, setClientAddress] = useState("");
  const [clientFiscalCode, setClientFiscalCode] = useState("");
  const [clientVatNumber, setClientVatNumber] = useState("");
  const [title, setTitle] = useState("Preventivo");
  const [description, setDescription] = useState("");
  const [validityDays, setValidityDays] = useState(30);
  const [notes, setNotes] = useState("");
  const [internalNotes, setInternalNotes] = useState("");

  // P03: Step 0 extras
  const [tipoLavoro, setTipoLavoro] = useState("");
  const [indirizzoLavori, setIndirizzoLavori] = useState("");
  const [pianoInstallazione, setPianoInstallazione] = useState(0);
  const [kmCantiere, setKmCantiere] = useState(0);

  // Step 1: Items
  const [items, setItems] = useState<QuoteItemPro[]>([]);
  const [discountPercent, setDiscountPercent] = useState(0);

  // P03: Search dialog
  const [searchOpen, setSearchOpen] = useState(false);
  const [smaltimentoAsk, setSmaltimentoAsk] = useState<{ parentIdx: number } | null>(null);

  // IMP09: Bundle dialog
  const [bundleOpen, setBundleOpen] = useState(false);

  // Step 2: Documents + PDF settings
  const [selectedMaterials, setSelectedMaterials] = useState<string[]>([]);
  const [pdfPrezziRiga, setPdfPrezziRiga] = useState(true);
  const [pdfSoloTotale, setPdfSoloTotale] = useState(false);
  const [pdfSconti, setPdfSconti] = useState(false);
  const [pdfImmagini, setPdfImmagini] = useState(true);
  const [pdfSchedeTecniche, setPdfSchedeTecniche] = useState(false);
  const [pdfFirma, setPdfFirma] = useState(true);

  // Template
  const { templates, defaultTemplate } = useQuoteTemplates();
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);

  useEffect(() => {
    if (defaultTemplate && !selectedTemplateId && !isEdit) {
      setSelectedTemplateId(defaultTemplate.id);
    }
  }, [defaultTemplate]);

  const selectedTemplate =
    templates.find((t) => t.id === selectedTemplateId) ?? defaultTemplate;
  const [layoutOverride, setLayoutOverride] = useState<QuoteTemplateLayout | null>(null);
  const effectiveTemplate = layoutOverride
    ? { ...selectedTemplate, layout: layoutOverride }
    : selectedTemplate;

  // P03: load impostazioni, tariffe, articoli, categorie
  const {
    impostazioni,
    tariffe,
    articoli,
    categorie,
    calcolaPrezzoProdotto,
    calcolaTariffaAutomatica,
  } = usePreventivoCosti(companyId);

  // Sync PDF impostazioni for new quote
  useEffect(() => {
    if (impostazioni && Object.keys(impostazioni).length > 0 && !isEdit) {
      setPdfPrezziRiga(impostazioni.pdf_mostra_prezzi_per_riga ?? true);
      setPdfSoloTotale(impostazioni.pdf_mostra_solo_totale ?? false);
      setPdfSconti(impostazioni.pdf_mostra_sconti ?? false);
      setPdfImmagini(impostazioni.pdf_mostra_immagini ?? true);
      setPdfSchedeTecniche(impostazioni.pdf_includi_schede_tecniche ?? false);
      setPdfFirma(impostazioni.firma_digitale_abilitata ?? true);
    }
  }, [impostazioni, isEdit]);

  // Load contacts
  const { data: contacts = [] } = useQuery({
    queryKey: ["marketing-contacts", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("marketing_contacts")
        .select(
          "id, first_name, last_name, email, phone, company_name, address, city, province, postal_code, country, fiscal_code, vat_number"
        )
        .eq("company_id", companyId!)
        .order("last_name");
      if (error) throw error;
      return data;
    },
  });

  // Load PDF materials
  const { data: materials = [] } = useQuery({
    queryKey: ["quote-pdf-materials", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quote_pdf_materials")
        .select("*")
        .eq("company_id", companyId!)
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  // Load existing quote if editing
  const { data: existingQuote } = useQuery({
    queryKey: queryKeys.quotes.detail(id),
    enabled: isEdit && !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quotes")
        .select("*")
        .eq("id", id!)
        .eq("company_id", companyId!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: existingItems = [] } = useQuery({
    queryKey: queryKeys.quotes.items(id),
    enabled: isEdit,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quote_items")
        .select("*")
        .eq("quote_id", id!)
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const { data: existingAttachments = [] } = useQuery({
    queryKey: queryKeys.quotes.attachments(id),
    enabled: isEdit,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quote_pdf_attachments")
        .select("material_id")
        .eq("quote_id", id!);
      if (error) throw error;
      return data.map((a) => a.material_id);
    },
  });

  // Populate form when editing
  useEffect(() => {
    if (existingQuote) {
      setContactId(existingQuote.contact_id);
      setClientName(existingQuote.client_name || "");
      setClientEmail(existingQuote.client_email || "");
      setClientPhone(existingQuote.client_phone || "");
      setClientCompany(existingQuote.client_company || "");
      setClientAddress(existingQuote.client_address || "");
      setClientFiscalCode(existingQuote.client_fiscal_code || "");
      setClientVatNumber(existingQuote.client_vat_number || "");
      setTitle(existingQuote.title || "Preventivo");
      setDescription(existingQuote.description || "");
      setValidityDays(existingQuote.validity_days || 30);
      setNotes(existingQuote.notes || "");
      setInternalNotes(existingQuote.internal_notes || "");
      setDiscountPercent(existingQuote.discount_percent || 0);
      if (existingQuote.template_id) {
        setSelectedTemplateId(existingQuote.template_id);
      }
      // P03 extras — these fields are not in the generated types (TODO IMP10: complex type)
      const q = existingQuote as any;
      setTipoLavoro(q.tipo_lavoro || "");
      setIndirizzoLavori(q.indirizzo_lavori || "");
      setPianoInstallazione(q.piano_installazione || 0);
      setKmCantiere(q.km_cantiere || 0);
      setPdfPrezziRiga(q.pdf_mostra_prezzi_per_riga ?? true);
      setPdfSoloTotale(q.pdf_mostra_solo_totale ?? false);
      setPdfSconti(q.pdf_mostra_sconti ?? false);
      setPdfImmagini(q.pdf_mostra_immagini ?? true);
      setPdfSchedeTecniche(q.pdf_includi_schede_tecniche ?? false);
      setPdfFirma(q.firma_digitale_abilitata ?? true);
      // Ripristina override layout template salvato
      setLayoutOverride(q.template_layout_override ?? null);
    }
  }, [existingQuote]);

  useEffect(() => {
    if (existingItems.length > 0) {
      setItems(
        existingItems.map((i) => ({
          id: i.id,
          item_type: i.item_type,
          item_category: i.item_category || "prodotto",
          name: i.name,
          description: i.description || "",
          quantity: i.quantity,
          unit_price: i.unit_price,
          discount_percent: i.discount_percent || 0,
          vat_rate: i.vat_rate,
          unit_of_measure: i.unit_of_measure || "pz",
          sort_order: i.sort_order,
          article_template_id: i.article_template_id,
          tariffa_id: i.tariffa_id || null,
          prezzo_acquisto: i.prezzo_acquisto ?? 0,
          mostra_nel_pdf: i.mostra_nel_pdf ?? true,
          is_optional: i.is_optional ?? false,
          misura_x: i.misura_x ?? null,
          misura_y: i.misura_y ?? null,
        }))
      );
    }
  }, [existingItems]);

  useEffect(() => {
    if (existingAttachments.length > 0) {
      setSelectedMaterials(existingAttachments);
    }
  }, [existingAttachments]);

  // Auto-select contact from URL param
  useEffect(() => {
    if (!isEdit && contacts.length > 0 && !contactId) {
      const urlContactId = searchParams.get("contact_id");
      if (urlContactId) {
        handleContactSelect(urlContactId);
      }
    }
  }, [contacts, isEdit, searchParams]);

  // Contact selection
  const handleContactSelect = (cId: string) => {
    setContactId(cId);
    const c = contacts.find((x) => x.id === cId);
    if (c) {
      setClientName(`${c.first_name || ""} ${c.last_name || ""}`.trim());
      setClientEmail(c.email || "");
      setClientPhone(c.phone || "");
      setClientCompany(c.company_name || "");
      setClientFiscalCode(c.fiscal_code || "");
      setClientVatNumber(c.vat_number || "");
      const addressParts = [c.address, c.postal_code, c.city, c.province].filter(Boolean);
      if (addressParts.length > 0) {
        setClientAddress(addressParts.join(", "));
      }
    }
  };

  // Items management
  const addItem = (type: string = "product") => {
    setItems([
      ...items,
      {
        item_type: type,
        name: "",
        description: "",
        quantity: 1,
        unit_price: 0,
        discount_percent: 0,
        vat_rate: 22,
        unit_of_measure: "pz",
        sort_order: items.length,
        // P03 defaults
        item_category: "prodotto" as QuoteItemPro["item_category"],
        prezzo_acquisto: 0,
        mostra_nel_pdf: true,
        is_optional: false,
      } as QuoteItemPro,
    ]);
  };

  const addItemPro = (category: string) => {
    setItems((prev) => [
      ...prev,
      {
        item_type: category === "prodotto" ? "product" : "service",
        item_category: category,
        name: "",
        description: "",
        quantity: 1,
        unit_price: 0,
        discount_percent: 0,
        vat_rate: 22,
        unit_of_measure: "pz",
        sort_order: prev.length,
        prezzo_acquisto: 0,
        mostra_nel_pdf: true,
        is_optional: false,
      } as QuoteItemPro,
    ]);
  };

  const addTariffa = (tariffa: TariffaPro, category: string) => {
    const { prezzo_vendita, prezzo_acquisto } = calcolaTariffaAutomatica(
      tariffa,
      1,
      pianoInstallazione
    );
    setItems((prev) => [
      ...prev,
      {
        item_type: "service",
        item_category: category,
        name: tariffa.nome,
        description: "",
        quantity: 1,
        unit_price: prezzo_vendita,
        discount_percent: 0,
        vat_rate: 22,
        unit_of_measure: tariffa.unita,
        sort_order: prev.length,
        article_template_id: null,
        tariffa_id: tariffa.id,
        prezzo_acquisto,
        mostra_nel_pdf: true,
        is_optional: false,
      } as QuoteItemPro,
    ]);
  };

  const addSmaltimento = (parentIdx: number) => {
    const tariffa = tariffe.find((t) => t.tipo === "smaltimento");
    if (tariffa) {
      const { prezzo_vendita, prezzo_acquisto } = calcolaTariffaAutomatica(
        tariffa,
        1,
        pianoInstallazione
      );
      setItems((prev) => [
        ...prev,
        {
          item_type: "service",
          item_category: "smaltimento",
          name: tariffa.nome,
          description: "",
          quantity: 1,
          unit_price: prezzo_vendita,
          discount_percent: 0,
          vat_rate: 22,
          unit_of_measure: tariffa.unita,
          sort_order: prev.length,
          article_template_id: null,
          tariffa_id: tariffa.id,
          prezzo_acquisto,
          mostra_nel_pdf: true,
          is_optional: false,
          _parentIdx: parentIdx,
        } as QuoteItemPro,
      ]);
    }
    setSmaltimentoAsk(null);
  };

  // Aggiunge righe generate dall'AI nel preventivo
  const aggiungiSezione = async (
    _nomeSezione: string,
    righe: Array<{
      item_category: string;
      nome: string;
      descrizione: string;
      quantita: number;
      unita_misura: string;
      article_template_id: string | null;
      tariffa_id: string | null;
      misure_x_mm: number | null;
      misure_y_mm: number | null;
      unit_price?: number;
      is_posa_di?: string | null;
    }>
  ) => {
    // Resolve cost prices and VAT for every row before updating state
    const resolved: QuoteItemPro[] = [];

    for (const r of righe) {
      let upv = r.unit_price ?? 0;
      let upa = 0;
      let vat_rate = 22;

      if (r.article_template_id) {
        const art = articoli.find((a) => a.id === r.article_template_id);
        if (art) {
          vat_rate = art.vat_rate ?? 22;
          const mx = r.misure_x_mm ?? undefined;
          const my = r.misure_y_mm ?? undefined;
          const calc = await calcolaPrezzoProdotto(art, r.quantita, mx, my);
          const qty = r.quantita || 1;
          if (upv === 0) upv = qty > 0 ? calc.prezzo_vendita / qty : calc.prezzo_vendita;
          upa = qty > 0 ? calc.prezzo_acquisto / qty : calc.prezzo_acquisto;
        }
      } else if (r.tariffa_id) {
        const tar = tariffe.find((t) => t.id === r.tariffa_id);
        if (tar) {
          const qty = r.quantita || 1;
          const calc = calcolaTariffaAutomatica(tar, qty, pianoInstallazione);
          if (upv === 0) upv = qty > 0 ? calc.prezzo_vendita / qty : calc.prezzo_vendita;
          upa = qty > 0 ? calc.prezzo_acquisto / qty : calc.prezzo_acquisto;
        }
      }

      resolved.push({
        item_type: r.item_category === "prodotto" ? "product" : "service",
        item_category: r.item_category,
        name: r.nome,
        description: r.descrizione ?? "",
        quantity: r.quantita,
        unit_price: upv,
        discount_percent: 0,
        vat_rate,
        unit_of_measure: r.unita_misura || "pz",
        sort_order: 0,
        article_template_id: r.article_template_id ?? null,
        tariffa_id: r.tariffa_id ?? null,
        prezzo_acquisto: upa,
        mostra_nel_pdf: true,
        is_optional: false,
        misura_x: r.misure_x_mm ?? null,
        misura_y: r.misure_y_mm ?? null,
      } as QuoteItemPro);
    }

    setItems((prev) => {
      const base = [...(prev as QuoteItemPro[])];
      resolved.forEach((item, idx) => {
        base.push({ ...item, sort_order: base.length + idx });
      });
      return base;
    });
  };

  const addProductFromCatalog = async (
    prodotto: ArticlePro,
    qty = 1,
    mx?: number,
    my?: number
  ) => {
    const { prezzo_vendita, prezzo_acquisto } = await calcolaPrezzoProdotto(
      prodotto,
      qty,
      mx,
      my
    );
    const upv = qty > 0 ? prezzo_vendita / qty : prezzo_vendita;
    const upa = qty > 0 ? prezzo_acquisto / qty : prezzo_acquisto;
    const newItems: QuoteItemPro[] = [...items];
    const newItem: QuoteItemPro = {
      item_type: "product",
      item_category: "prodotto",
      name: prodotto.name,
      description: "",
      quantity: qty,
      unit_price: upv,
      discount_percent: 0,
      vat_rate: prodotto.vat_rate ?? 22,
      unit_of_measure: prodotto.unit_of_measure || "pz",
      sort_order: newItems.length,
      article_template_id: prodotto.id,
      prezzo_acquisto: upa,
      mostra_nel_pdf: true,
      is_optional: false,
      misura_x: mx ?? null,
      misura_y: my ?? null,
    };
    newItems.push(newItem);
    const prodIdx = newItems.length - 1;

    // Auto-posa
    if (
      prodotto.ha_montaggio &&
      prodotto.montaggio_tipo === "separato" &&
      impostazioni.aggiungi_posa_automatica
    ) {
      const tariffa =
        tariffe.find((t) => t.id === prodotto.montaggio_tariffa_id) ??
        tariffe.find((t) => t.tipo === "posa");
      if (tariffa) {
        const { prezzo_vendita: pvP, prezzo_acquisto: paP } =
          calcolaTariffaAutomatica(tariffa, qty, pianoInstallazione);
        const upvP = qty > 0 ? pvP / qty : pvP;
        const upaP = qty > 0 ? paP / qty : paP;
        newItems.push({
          item_type: "service",
          item_category: "posa",
          name: tariffa.nome,
          description: "",
          quantity: qty,
          unit_price: upvP,
          discount_percent: 0,
          vat_rate: 22,
          unit_of_measure: tariffa.unita,
          sort_order: newItems.length,
          article_template_id: null,
          tariffa_id: tariffa.id,
          prezzo_acquisto: upaP,
          mostra_nel_pdf: true,
          is_optional: false,
          _parentIdx: prodIdx,
        });
      }
    }
    setItems(newItems);
    if (impostazioni.chiedi_smaltimento) setSmaltimentoAsk({ parentIdx: prodIdx });
    setSearchOpen(false);
  };

  // IMP09: Add bundle items
  const handleSelectBundle = (bundle: BundleConVoci, voci: BundleConVoci["bundle_voci"]) => {
    const newItems = espondiBundle(
      bundle,
      voci,
      impostazioni.overhead_percentuale ?? 0
    );
    setItems((prev) => {
      const base = [...(prev as typeof prev)];
      newItems.forEach((item, idx) => {
        base.push({ ...item, sort_order: base.length + idx });
      });
      return base;
    });
    setBundleOpen(false);
  };

  const updateItem = (index: number, field: keyof QuoteItemPro, value: QuoteItemPro[keyof QuoteItemPro]) => {
    setItems(items.map((it, i) => (i === index ? { ...it, [field]: value } : it)));
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setItems((prev) => {
      const arr = prev as QuoteItemPro[];
      const oldIdx = arr.findIndex((_, i) => `item-${i}` === active.id);
      const newIdx = arr.findIndex((_, i) => `item-${i}` === over.id);
      return arrayMove(arr, oldIdx, newIdx).map((it, i) => ({ ...it, sort_order: i }));
    });
  };

  // Autosave bozza silenzioso con indicatore di errore
  const lastSavedHashRef = useRef<string>("");
  const autosaveRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [autosaveFailed, setAutosaveFailed] = useState(false);

  const autosaveDraft = useCallback(async () => {
    // Guard: non sovrascrivere preventivi già inviati/accettati/rifiutati/scaduti
    const STATI_BLOCCATI = ['inviata', 'accettata', 'rifiutata', 'scaduta'];
    if (STATI_BLOCCATI.includes(existingQuote?.status || '')) return;
    if (!companyId || !user || !clientName.trim() || saving || !isEdit) return;
    const hash = JSON.stringify({ clientName, itemsLen: items.length, discountPercent });
    if (hash === lastSavedHashRef.current) return;
    try {
      await supabase.from("quotes").update({
        client_name: clientName,
        discount_percent: discountPercent,
        updated_at: new Date().toISOString(),
      }).eq("id", id!);
      lastSavedHashRef.current = hash;
      setAutosaveFailed(false);
    } catch {
      setAutosaveFailed(true);
    }
  }, [clientName, items.length, discountPercent, companyId, user, saving, isEdit, id]);

  useEffect(() => {
    if (!isEdit) return;
    autosaveRef.current = setInterval(autosaveDraft, 60_000);
    return () => { if (autosaveRef.current) clearInterval(autosaveRef.current); };
  }, [autosaveDraft, isEdit]);

  // Avvisa prima di uscire con modifiche non salvate
  const isDirty = !saving && (items.length > 0 || clientName.trim() !== "");
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  // Step validation
  const validateStep = (currentStep: number): boolean => {
    switch (currentStep) {
      case 0: {
        if (!clientName.trim()) {
          toast.error("Inserisci il nome del cliente prima di procedere");
          return false;
        }
        return true;
      }
      case 1: {
        const activeItems = items.filter(
          (i) => !["nota", "subtotale"].includes(i.item_category)
        );
        if (activeItems.length === 0) {
          toast.error("Aggiungi almeno un prodotto o servizio");
          return false;
        }
        const vuoti = activeItems.filter((i) => !i.name.trim());
        if (vuoti.length > 0) {
          toast.error(`${vuoti.length} riga/e senza nome — completale prima di procedere`);
          return false;
        }
        return true;
      }
      default:
        return true;
    }
  };

  const handleNext = () => {
    if (validateStep(step)) setStep(step + 1);
  };

  // Calculations — sconto globale passato a calcolaTotaliPreventivo
  // in modo che margine_totale_pct sia calcolato sul ricavo netto reale (B2)
  const totaliPro = calcolaTotaliPreventivo(
    items,
    impostazioni.overhead_percentuale ?? 0,
    discountPercent
  );
  const subtotal = totaliPro.subtotale;
  const discountAmt = subtotal * (discountPercent / 100);
  const vatAmount = Object.values(totaliPro.iva_breakdown).reduce((s, v) => s + v, 0) * (1 - discountPercent / 100);
  const total = totaliPro.subtotale_netto + vatAmount;

  // Save
  const handleSave = async (status: string = "bozza") => {
    if (!companyId || !user) return;
    setSaving(true);
    try {
      // TODO IMP10: complex type — quoteData includes P03 fields not in generated types
      const quoteData: Record<string, unknown> = {
        company_id: companyId,
        status,
        contact_id: contactId,
        client_name: clientName || null,
        client_email: clientEmail || null,
        client_phone: clientPhone || null,
        client_company: clientCompany || null,
        client_address: clientAddress || null,
        client_fiscal_code: clientFiscalCode || null,
        client_vat_number: clientVatNumber || null,
        title,
        description: description || null,
        notes: notes || null,
        internal_notes: internalNotes || null,
        validity_days: validityDays,
        discount_percent: discountPercent,
        created_by: user.id,
        template_id: selectedTemplateId || null,
        tipo_lavoro: tipoLavoro || null,
        indirizzo_lavori: indirizzoLavori || null,
        piano_installazione: pianoInstallazione || null,
        km_cantiere: kmCantiere || null,
        totale_costo_interno: totaliPro.costo_totale || null,
        totale_overhead: totaliPro.overhead_totale || null,
        margine_totale_percentuale: totaliPro.margine_totale_pct || null,
        firma_digitale_abilitata: pdfFirma,
        template_layout_override: layoutOverride || null,
        subtotal: subtotal - discountAmt,
        discount_amount: discountAmt,
        vat_amount: vatAmount,
        total,
      };

      let quoteId = id;

      if (isEdit) {
        const { error } = await supabase
          .from("quotes")
          .update(quoteData)
          .eq("id", id!);
        if (error) throw error;
      } else {
        const { data: numData } = await supabase.rpc("generate_quote_number", {
          p_company_id: companyId,
        });
        quoteData.quote_number = numData || `OFF-${new Date().getFullYear()}-001`;
        const { data, error } = await supabase
          .from("quotes")
          .insert(quoteData)
          .select("id")
          .single();
        if (error) throw error;
        quoteId = data.id;
      }

      // Delete existing items and re-insert
      if (isEdit) {
        await supabase.from("quote_items").delete().eq("quote_id", quoteId!);
      }
      if (items.length > 0) {
        const { error: itemsErr } = await supabase.from("quote_items").insert(
          items.map((it, idx) => ({
            quote_id: quoteId!,
            company_id: companyId,
            item_type: it.item_type,
            name: it.name,
            description: it.description || null,
            quantity: it.quantity,
            unit_price: it.unit_price,
            discount_percent: it.discount_percent,
            vat_rate: it.vat_rate,
            unit_of_measure: it.unit_of_measure,
            sort_order: idx,
            article_template_id: it.article_template_id || null,
            // P03
            item_category: it.item_category || "prodotto",
            tariffa_id: it.tariffa_id || null,
            prezzo_acquisto: it.prezzo_acquisto ?? 0,
            mostra_nel_pdf: it.mostra_nel_pdf ?? true,
            is_optional: it.is_optional ?? false,
            misura_x: it.misura_x ?? null,
            misura_y: it.misura_y ?? null,
            // line_total è GENERATED ALWAYS dal DB — non va inserito esplicitamente
          }))
        );
        if (itemsErr) throw itemsErr;
      }

      // Attachments
      if (isEdit) {
        await supabase
          .from("quote_pdf_attachments")
          .delete()
          .eq("quote_id", quoteId!);
      }
      if (selectedMaterials.length > 0) {
        await supabase.from("quote_pdf_attachments").insert(
          selectedMaterials.map((mId, idx) => ({
            quote_id: quoteId!,
            material_id: mId,
            sort_order: idx,
          }))
        );
      }

      queryClient.invalidateQueries({ queryKey: queryKeys.quotes.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.quotes.detail(quoteId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.quotes.items(quoteId) });
      toast.success(isEdit ? "Preventivo aggiornato" : "Preventivo creato");
      navigate(`/azienda/marketing/preventivi/${quoteId}`);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : "Errore salvataggio";
      toast.error(errMsg);
    } finally {
      setSaving(false);
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          className="hidden md:inline-flex"
          onClick={() => navigate("/azienda/marketing/preventivi")}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight">
            {isEdit ? "Modifica Preventivo" : "Nuovo Preventivo"}
          </h1>
          {autosaveFailed && (
            <p className="text-xs text-destructive flex items-center gap-1 mt-0.5">
              <AlertTriangle className="h-3 w-3" />
              Salvataggio automatico fallito — salva manualmente
            </p>
          )}
        </div>
      </div>

      {/* Stepper */}
      <div className="flex items-center gap-2">
        {STEPS.map((s, i) => (
          <button
            key={s.key}
            onClick={() => setStep(i)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              i === step
                ? "bg-primary text-primary-foreground"
                : i < step
                ? "bg-muted text-foreground"
                : "bg-muted/50 text-muted-foreground"
            }`}
          >
            <s.icon className="h-4 w-4" />
            <span className="hidden sm:inline">{s.label}</span>
            <span className="sm:hidden">{i + 1}</span>
          </button>
        ))}
      </div>

      {/* ── STEP 0: Cliente ── */}
      {step === 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Dati Cliente</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Seleziona contatto esistente</Label>
              <ContactCombobox
                contacts={contacts}
                value={contactId}
                onChange={handleContactSelect}
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Nome cliente *</Label>
                <Input
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                />
              </div>
              <div>
                <Label>Email</Label>
                <Input
                  type="email"
                  value={clientEmail}
                  onChange={(e) => setClientEmail(e.target.value)}
                />
              </div>
              <div>
                <Label>Telefono</Label>
                <Input
                  value={clientPhone}
                  onChange={(e) => setClientPhone(e.target.value)}
                />
              </div>
              <div>
                <Label>Azienda</Label>
                <Input
                  value={clientCompany}
                  onChange={(e) => setClientCompany(e.target.value)}
                />
              </div>
              <div>
                <Label>Codice Fiscale</Label>
                <Input
                  value={clientFiscalCode}
                  onChange={(e) => setClientFiscalCode(e.target.value)}
                />
              </div>
              <div>
                <Label>P.IVA</Label>
                <Input
                  value={clientVatNumber}
                  onChange={(e) => setClientVatNumber(e.target.value)}
                />
              </div>
              <div className="md:col-span-2">
                <Label>Indirizzo</Label>
                <Input
                  value={clientAddress}
                  onChange={(e) => setClientAddress(e.target.value)}
                />
              </div>
            </div>
            <hr />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Titolo offerta</Label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>
              <div>
                <Label>Validità (giorni)</Label>
                <Input
                  type="number"
                  value={validityDays}
                  onChange={(e) =>
                    setValidityDays(parseInt(e.target.value) || 30)
                  }
                />
              </div>
              <div className="md:col-span-2">
                <Label>Descrizione</Label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                />
              </div>
              <div>
                <Label>Note (visibili al cliente)</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                />
              </div>
              <div>
                <Label>Note interne</Label>
                <Textarea
                  value={internalNotes}
                  onChange={(e) => setInternalNotes(e.target.value)}
                  rows={2}
                />
              </div>
            </div>

            {/* P03: Dettagli lavoro */}
            <hr className="my-2" />
            <h4 className="font-medium text-sm text-muted-foreground">
              Dettagli lavoro
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <Label>Tipo di lavoro</Label>
                <Select value={tipoLavoro || "__none__"} onValueChange={(v) => setTipoLavoro(v === "__none__" ? "" : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleziona tipo..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Nessuno specificato</SelectItem>
                    {categorie.map((c) => (
                      <SelectItem key={c.id} value={c.nome}>
                        {c.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="md:col-span-2">
                <Label>Indirizzo lavori (se diverso da cliente)</Label>
                <Input
                  value={indirizzoLavori}
                  onChange={(e) => setIndirizzoLavori(e.target.value)}
                  placeholder="Via, Città"
                />
              </div>
              {impostazioni.chiedi_piano_installazione && (
                <div className="md:col-span-2">
                  <Label>Piano di installazione</Label>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {[
                      { v: 0, l: "Piano Terra" },
                      { v: 1, l: "1° Piano" },
                      { v: 2, l: "2° Piano" },
                      { v: 3, l: "3° Piano" },
                      { v: 4, l: "4° Piano" },
                      { v: 5, l: "5°+" },
                    ].map(({ v, l }) => (
                      <button
                        key={v}
                        onClick={() => setPianoInstallazione(v)}
                        className={`px-3 py-1 rounded-full text-sm border transition-colors ${
                          pianoInstallazione === v
                            ? "bg-primary text-primary-foreground border-primary"
                            : "border-border hover:bg-muted"
                        }`}
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {impostazioni.chiedi_trasporto && (
                <div>
                  <Label>Distanza cantiere (km)</Label>
                  <Input
                    type="number"
                    value={kmCantiere}
                    onChange={(e) =>
                      setKmCantiere(parseFloat(e.target.value) || 0)
                    }
                    placeholder="0"
                  />
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── STEP 1: Prodotti ── */}
      {step === 1 && (
        <div className="flex gap-6 items-start">
          {/* Left: items list */}
          <div className="flex-1 min-w-0 space-y-4">
            {/* AI Quote Panel */}
            {companyId && (
              <AIQuotePanel
                companyId={companyId}
                tipoLavoro={tipoLavoro}
                pianoInstallazione={pianoInstallazione}
                onRigheGenerate={(sezioni) => {
                  sezioni.forEach((sez) => aggiungiSezione(sez.nome, sez.righe));
                }}
              />
            )}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <CardTitle>Prodotti e Servizi</CardTitle>
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={() => setSearchOpen(true)} size="sm">
                      <Plus className="h-4 w-4 mr-1" /> Dal listino
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setBundleOpen(true)}
                    >
                      <Layers className="h-4 w-4 mr-1" /> Bundle
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => addItem("product")}
                    >
                      <Plus className="h-4 w-4 mr-1" /> Riga libera
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm">
                          <ChevronDown className="h-4 w-4 mr-1" /> Altro
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        <DropdownMenuItem onClick={() => addItemPro("nota")}>
                          <StickyNote className="h-4 w-4 mr-2" /> Nota
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => addItemPro("sconto")}>
                          <Tag className="h-4 w-4 mr-2" /> Sconto
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => addItemPro("subtotale")}
                        >
                          <Hash className="h-4 w-4 mr-2" /> Subtotale
                        </DropdownMenuItem>
                        {tariffe.filter((t) => t.tipo === "trasporto").length >
                          0 && (
                          <DropdownMenuItem
                            onClick={() => {
                              const t = tariffe.find(
                                (x) => x.tipo === "trasporto"
                              );
                              if (t) addTariffa(t, "trasporto");
                            }}
                          >
                            <Truck className="h-4 w-4 mr-2" /> Trasporto
                          </DropdownMenuItem>
                        )}
                        {tariffe.filter((t) => t.tipo === "nolo").length >
                          0 && (
                          <DropdownMenuItem
                            onClick={() => {
                              const t = tariffe.find((x) => x.tipo === "nolo");
                              if (t) addTariffa(t, "nolo");
                            }}
                          >
                            <Layers className="h-4 w-4 mr-2" /> Nolo
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {items.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Package className="h-12 w-12 mx-auto mb-3 opacity-30" />
                    <p className="font-medium">Nessun prodotto</p>
                    <p className="text-sm">
                      Aggiungi dal listino o crea una riga libera
                    </p>
                  </div>
                ) : (
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                  >
                    <SortableContext
                      items={items.map((_, i) => `item-${i}`)}
                      strategy={verticalListSortingStrategy}
                    >
                  <div className="space-y-2">
                    {items.map((item, idx) => {
                      const isChild =
                        item._parentIdx != null ||
                        ["posa", "smaltimento", "trasporto", "nolo"].includes(
                          item.item_category
                        );
                      const isNota = item.item_category === "nota";
                      const isSubtotale = item.item_category === "subtotale";
                      const isSconto = item.item_category === "sconto";
                      const margine = calcolaMargine(
                        item.unit_price * item.quantity,
                        item.prezzo_acquisto * item.quantity,
                        impostazioni.overhead_percentuale ?? 0
                      );

                      return (
                        <SortableItem key={`item-${idx}`} id={`item-${idx}`}>
                          {(dragHandle) => (
                        <div
                          className={`border rounded-lg p-3 flex gap-1 items-start ${
                            isChild
                              ? "ml-6 bg-muted/20 border-dashed"
                              : ""
                          } ${isNota ? "bg-amber-50/50" : ""} ${
                            isSubtotale ? "border-t-2 border-t-border" : ""
                          }`}
                        >
                          {!isChild && dragHandle}
                          {isChild && (
                            <span className="text-muted-foreground text-xs mr-2">
                              └
                            </span>
                          )}
                          {isSubtotale ? (
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-sm">
                                Subtotale
                              </span>
                              <span className="font-bold">
                                {formatCurrency(
                                  items
                                    .slice(0, idx)
                                    .reduce(
                                      (s, i) =>
                                        s +
                                        i.quantity *
                                          i.unit_price *
                                          (1 - i.discount_percent / 100),
                                      0
                                    )
                                )}
                              </span>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-destructive"
                                onClick={() => removeItem(idx)}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          ) : isNota ? (
                            <div className="flex items-center gap-2">
                              <StickyNote className="h-4 w-4 text-amber-500 shrink-0" />
                              <Input
                                value={item.name}
                                onChange={(e) =>
                                  updateItem(idx, "name", e.target.value)
                                }
                                placeholder="Testo nota..."
                                className="flex-1 border-0 bg-transparent p-0 h-auto text-sm focus-visible:ring-0"
                              />
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-destructive"
                                onClick={() => removeItem(idx)}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          ) : (
                            <div className="space-y-2">
                              <div className="grid grid-cols-12 gap-2 items-end">
                                <div className="col-span-12 sm:col-span-4">
                                  <Label className="text-xs">
                                    Nome{" "}
                                    {isSconto && (
                                      <span className="text-red-500">
                                        (sconto)
                                      </span>
                                    )}
                                  </Label>
                                  <Input
                                    value={item.name}
                                    onChange={(e) =>
                                      updateItem(idx, "name", e.target.value)
                                    }
                                    placeholder="Nome prodotto/servizio"
                                    className={isSconto ? "text-red-600" : ""}
                                  />
                                </div>
                                <div className="col-span-4 sm:col-span-2">
                                  <Label className="text-xs">Quantità</Label>
                                  <Input
                                    type="number"
                                    min={0}
                                    step={0.01}
                                    value={item.quantity}
                                    onChange={(e) =>
                                      updateItem(
                                        idx,
                                        "quantity",
                                        parseFloat(e.target.value) || 0
                                      )
                                    }
                                  />
                                </div>
                                <div className="col-span-4 sm:col-span-2">
                                  <Label className="text-xs">€/unit</Label>
                                  <Input
                                    type="number"
                                    min={0}
                                    step={0.01}
                                    value={item.unit_price}
                                    onChange={(e) =>
                                      updateItem(
                                        idx,
                                        "unit_price",
                                        parseFloat(e.target.value) || 0
                                      )
                                    }
                                    className={isSconto ? "text-red-600" : ""}
                                  />
                                </div>
                                <div className="col-span-4 sm:col-span-1">
                                  <Label className="text-xs">Sc%</Label>
                                  <Input
                                    type="number"
                                    min={0}
                                    max={100}
                                    value={item.discount_percent}
                                    onChange={(e) =>
                                      updateItem(
                                        idx,
                                        "discount_percent",
                                        parseFloat(e.target.value) || 0
                                      )
                                    }
                                  />
                                </div>
                                <div className="col-span-4 sm:col-span-1">
                                  <Label className="text-xs">IVA%</Label>
                                  <Input
                                    type="number"
                                    value={item.vat_rate}
                                    onChange={(e) =>
                                      updateItem(
                                        idx,
                                        "vat_rate",
                                        parseFloat(e.target.value) || 0
                                      )
                                    }
                                  />
                                </div>
                                <div className="col-span-6 sm:col-span-2 flex items-end justify-end gap-1">
                                  <p
                                    className={`font-medium text-sm py-2 ${
                                      isSconto ? "text-red-600" : ""
                                    }`}
                                  >
                                    {formatCurrency(
                                      item.quantity *
                                        item.unit_price *
                                        (1 - item.discount_percent / 100)
                                    )}
                                  </p>
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8"
                                      >
                                        <MoreVertical className="h-4 w-4" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                      <DropdownMenuItem
                                        onClick={() => {
                                          const copy = {
                                            ...items[idx],
                                            id: undefined,
                                            sort_order: items.length,
                                          };
                                          setItems([...items, copy]);
                                        }}
                                      >
                                        Duplica
                                      </DropdownMenuItem>
                                      <DropdownMenuItem
                                        onClick={() =>
                                          updateItem(
                                            idx,
                                            "is_optional",
                                            !item.is_optional
                                          )
                                        }
                                      >
                                        {item.is_optional
                                          ? "Rimuovi optional"
                                          : "Rendi opzionale"}
                                      </DropdownMenuItem>
                                      <DropdownMenuItem
                                        onClick={() =>
                                          updateItem(
                                            idx,
                                            "mostra_nel_pdf",
                                            !item.mostra_nel_pdf
                                          )
                                        }
                                      >
                                        {item.mostra_nel_pdf
                                          ? "Nascondi nel PDF"
                                          : "Mostra nel PDF"}
                                      </DropdownMenuItem>
                                      <DropdownMenuItem
                                        onClick={() => removeItem(idx)}
                                        className="text-destructive"
                                      >
                                        Elimina
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </div>
                              </div>
                              {/* Badges visibili a tutti */}
                              {(item.is_optional || !item.mostra_nel_pdf) && (
                                <div className="flex items-center gap-2 mt-1">
                                  {item.is_optional && (
                                    <Badge variant="outline" className="text-xs">
                                      Opzionale
                                    </Badge>
                                  )}
                                  {!item.mostra_nel_pdf && (
                                    <Badge variant="secondary" className="text-xs">
                                      Nascosto PDF
                                    </Badge>
                                  )}
                                </div>
                              )}
                              {/* Admin: margine per tutte le categorie con costo noto */}
                              {isAdmin &&
                                item.prezzo_acquisto > 0 &&
                                !["nota", "subtotale", "sconto"].includes(item.item_category) && (
                                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                                    <span>
                                      Costo:{" "}
                                      {formatCurrency(
                                        item.prezzo_acquisto * item.quantity
                                      )}
                                    </span>
                                    <MargineSemaforo pct={margine.margine_percentuale} sogliaMin={impostazioni.margine_minimo_percentuale ?? 15} target={impostazioni.margine_target_percentuale ?? 25} />
                                  </div>
                                )}
                            </div>
                          )}
                        </div>
                          )}
                        </SortableItem>
                      );
                    })}
                  </div>
                    </SortableContext>
                  </DndContext>
                )}

                {/* Totals in step 1 */}
                {items.length > 0 && (
                  <div className="mt-6 flex justify-end">
                    <div className="w-full max-w-xs space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Subtotale</span>
                        <span>{formatCurrency(subtotal)}</span>
                      </div>
                      <div className="flex justify-between items-center gap-2">
                        <span className="text-muted-foreground">
                          Sconto globale %
                        </span>
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          className="w-20 h-8 text-right"
                          value={discountPercent}
                          onChange={(e) =>
                            setDiscountPercent(
                              parseFloat(e.target.value) || 0
                            )
                          }
                        />
                      </div>
                      {discountPercent > 0 && (
                        <div className="flex justify-between text-destructive">
                          <span>Sconto</span>
                          <span>-{formatCurrency(discountAmt)}</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">IVA</span>
                        <span>{formatCurrency(vatAmount)}</span>
                      </div>
                      <hr />
                      <div className="flex justify-between font-bold text-base">
                        <span>Totale</span>
                        <span>{formatCurrency(total)}</span>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right: summary panel (hidden on mobile) */}
          <div className="hidden lg:block w-72 shrink-0 sticky top-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Riepilogo</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {["prodotto", "posa", "trasporto", "smaltimento", "nolo"].map(
                  (cat) => {
                    const catItems = items.filter(
                      (i) => i.item_category === cat && !i.is_optional
                    );
                    if (catItems.length === 0) return null;
                    const tot = catItems.reduce(
                      (s, i) =>
                        s +
                        i.quantity *
                          i.unit_price *
                          (1 - i.discount_percent / 100),
                      0
                    );
                    const labels: Record<string, string> = {
                      prodotto: "Prodotti",
                      posa: "Posa",
                      trasporto: "Trasporto",
                      smaltimento: "Smaltimento",
                      nolo: "Nolo",
                    };
                    return (
                      <div key={cat} className="flex justify-between">
                        <span className="text-muted-foreground">
                          {labels[cat]}
                        </span>
                        <span>{formatCurrency(tot)}</span>
                      </div>
                    );
                  }
                )}
                <Separator />
                {Object.entries(totaliPro.iva_breakdown).map(([rate, amt]) => (
                  <div
                    key={rate}
                    className="flex justify-between text-muted-foreground"
                  >
                    <span>IVA {rate}%</span>
                    <span>{formatCurrency(amt)}</span>
                  </div>
                ))}
                <Separator />
                <div className="flex justify-between font-bold text-base">
                  <span>Totale</span>
                  <span>{formatCurrency(total)}</span>
                </div>
                {/* Admin block */}
                {isAdmin && totaliPro.costo_totale > 0 && (
                  <>
                    <Separator />
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between text-muted-foreground">
                        <span>Costo totale</span>
                        <span>{formatCurrency(totaliPro.costo_totale)}</span>
                      </div>
                      <div className="flex justify-between text-muted-foreground">
                        <span>
                          Overhead ({impostazioni.overhead_percentuale ?? 0}%)
                        </span>
                        <span>
                          {formatCurrency(totaliPro.overhead_totale)}
                        </span>
                      </div>
                      <div className="flex justify-between items-center font-medium">
                        <span>Margine</span>
                        <MargineSemaforo pct={totaliPro.margine_totale_pct} sogliaMin={impostazioni.margine_minimo_percentuale ?? 15} target={impostazioni.margine_target_percentuale ?? 25} />
                      </div>
                      {tipoLavoro &&
                        (() => {
                          const catData = categorie.find(
                            (c) => c.nome === tipoLavoro
                          );
                          const target =
                            catData?.margine_target_percentuale ??
                            impostazioni.margine_target_percentuale ??
                            25;
                          if (totaliPro.margine_totale_pct < target)
                            return (
                              <div className="flex items-center gap-1 text-amber-600">
                                <AlertTriangle className="h-3 w-3" />
                                <span>
                                  Target {tipoLavoro}: {target}%
                                </span>
                              </div>
                            );
                          return null;
                        })()}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* ── STEP 2: Documenti + PDF settings ── */}
      {step === 2 && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings2 className="h-4 w-4" />
                Impostazioni PDF (override per questo preventivo)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                {
                  k: "pdfPrezziRiga",
                  v: pdfPrezziRiga,
                  s: setPdfPrezziRiga,
                  l: "Mostra prezzo per ogni riga",
                },
                {
                  k: "pdfSoloTotale",
                  v: pdfSoloTotale,
                  s: setPdfSoloTotale,
                  l: "Solo totale finale (senza dettaglio righe)",
                },
                {
                  k: "pdfSconti",
                  v: pdfSconti,
                  s: setPdfSconti,
                  l: "Mostra sconti applicati",
                },
                {
                  k: "pdfImmagini",
                  v: pdfImmagini,
                  s: setPdfImmagini,
                  l: "Includi immagini prodotti",
                },
                {
                  k: "pdfSchedeTecniche",
                  v: pdfSchedeTecniche,
                  s: setPdfSchedeTecniche,
                  l: "Allega schede tecniche PDF",
                },
                {
                  k: "pdfFirma",
                  v: pdfFirma,
                  s: setPdfFirma,
                  l: "Firma digitale abilitata",
                },
              ].map(({ k, v, s, l }) => (
                <div
                  key={k}
                  className="flex items-center justify-between py-1"
                >
                  <Label className="font-normal">{l}</Label>
                  <Switch checked={v} onCheckedChange={s} />
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Documenti Allegati</CardTitle>
            </CardHeader>
            <CardContent>
              {materials.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <FileStack className="h-10 w-10 mx-auto mb-2 opacity-50" />
                  <p>Nessun materiale disponibile.</p>
                  <p className="text-sm">
                    Vai in Impostazioni → Materiali Preventivi per caricare PDF.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {materials.map((m) => (
                    <div
                      key={m.id}
                      className="flex items-center gap-3 p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <Checkbox
                        checked={selectedMaterials.includes(m.id)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedMaterials([...selectedMaterials, m.id]);
                          } else {
                            setSelectedMaterials(
                              selectedMaterials.filter((x) => x !== m.id)
                            );
                          }
                        }}
                      />
                      <FileStack className="h-5 w-5 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{m.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {m.category} — {(m.file_size_bytes / 1024).toFixed(0)}{" "}
                          KB
                        </p>
                      </div>
                    </div>
                  ))}
                  <p className="text-sm text-muted-foreground mt-2">
                    {selectedMaterials.length} documenti selezionati
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── STEP 3: Riepilogo ── */}
      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle>Riepilogo Preventivo</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Client summary */}
            <div>
              <h3 className="font-medium mb-2">Cliente</h3>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-muted-foreground">Nome:</span>{" "}
                  {clientName || "—"}
                </div>
                <div>
                  <span className="text-muted-foreground">Email:</span>{" "}
                  {clientEmail || "—"}
                </div>
                <div>
                  <span className="text-muted-foreground">Azienda:</span>{" "}
                  {clientCompany || "—"}
                </div>
                <div>
                  <span className="text-muted-foreground">Telefono:</span>{" "}
                  {clientPhone || "—"}
                </div>
                {tipoLavoro && (
                  <div className="col-span-2">
                    <span className="text-muted-foreground">
                      Tipo di lavoro:
                    </span>{" "}
                    {tipoLavoro}
                  </div>
                )}
                {indirizzoLavori && (
                  <div className="col-span-2">
                    <span className="text-muted-foreground">
                      Indirizzo lavori:
                    </span>{" "}
                    {indirizzoLavori}
                  </div>
                )}
              </div>
            </div>

            {/* Items summary */}
            <div>
              <h3 className="font-medium mb-2">Prodotti ({items.length})</h3>
              {items.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Prodotto</TableHead>
                      <TableHead className="text-right">Qtà</TableHead>
                      <TableHead className="text-right">Prezzo</TableHead>
                      <TableHead className="text-right">Totale</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((it) => (
                      <TableRow key={it.id}>
                        <TableCell>
                          {it.name || "—"}
                          {it.is_optional && (
                            <Badge variant="outline" className="ml-2 text-xs">
                              Opzionale
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {it.quantity}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(it.unit_price)}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(
                            it.quantity *
                              it.unit_price *
                              (1 - it.discount_percent / 100)
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-sm text-muted-foreground">Nessun prodotto</p>
              )}
            </div>

            {/* Totals */}
            <div className="flex justify-end">
              <div className="w-full max-w-xs space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotale</span>
                  <span>{formatCurrency(subtotal)}</span>
                </div>
                {discountPercent > 0 && (
                  <div className="flex justify-between text-destructive">
                    <span>Sconto {discountPercent}%</span>
                    <span>-{formatCurrency(discountAmt)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">IVA</span>
                  <span>{formatCurrency(vatAmount)}</span>
                </div>
                <hr />
                <div className="flex justify-between font-bold text-lg">
                  <span>Totale</span>
                  <span>{formatCurrency(total)}</span>
                </div>
              </div>
            </div>

            {/* Admin cost block */}
            {isAdmin && totaliPro.costo_totale > 0 && (
              <div className="border rounded-lg p-4 bg-blue-50/50 space-y-3 text-sm">
                <h3 className="font-semibold text-sm flex items-center gap-2 text-blue-900">
                  <TrendingUp className="h-4 w-4" />
                  Analisi costi (solo admin)
                </h3>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                  <span className="text-muted-foreground">
                    Costo prodotti/servizi
                  </span>
                  <span className="text-right">
                    {formatCurrency(totaliPro.costo_totale)}
                  </span>
                  <span className="text-muted-foreground">
                    Overhead ({impostazioni.overhead_percentuale ?? 0}%)
                  </span>
                  <span className="text-right">
                    {formatCurrency(totaliPro.overhead_totale)}
                  </span>
                  <hr className="col-span-2" />
                  <span className="font-medium">Margine netto</span>
                  <span className="text-right font-medium flex justify-end gap-2">
                    {formatCurrency(
                      round2(totaliPro.subtotale_netto - totaliPro.costo_totale - totaliPro.overhead_totale)
                    )}
                    <MargineSemaforo pct={totaliPro.margine_totale_pct} sogliaMin={impostazioni.margine_minimo_percentuale ?? 15} target={impostazioni.margine_target_percentuale ?? 25} />
                  </span>
                </div>

                {/* Margine per categoria */}
                {(() => {
                  const CATS = ["prodotto", "posa", "trasporto", "smaltimento", "nolo"] as const;
                  const catRows = CATS.flatMap((cat) => {
                    const catItems = items.filter((i) => i.item_category === cat && !i.is_optional);
                    if (catItems.length === 0) return [];
                    const ricavo = round2(catItems.reduce((s, i) => s + i.quantity * i.unit_price * (1 - (i.discount_percent || 0) / 100), 0) * (1 - discountPercent / 100));
                    const costo = round2(catItems.reduce((s, i) => s + (i.prezzo_acquisto ?? 0) * i.quantity, 0));
                    const overhead = round2(costo * ((impostazioni.overhead_percentuale ?? 0) / 100));
                    const margine = round2(ricavo - costo - overhead);
                    const margine_pct = ricavo > 0 ? round2((margine / ricavo) * 100) : 0;
                    const labels: Record<string, string> = { prodotto: "Prodotti", posa: "Posa", trasporto: "Trasporto", smaltimento: "Smaltimento", nolo: "Nolo" };
                    return [{ cat, label: labels[cat], ricavo, margine, margine_pct }];
                  });
                  if (catRows.length < 2) return null;
                  return (
                    <div className="border-t pt-2 space-y-1">
                      <p className="text-xs font-medium text-blue-800">Margine per categoria</p>
                      {catRows.map(({ cat, label, ricavo, margine, margine_pct }) => (
                        <div key={cat} className="grid grid-cols-3 gap-x-2 text-xs">
                          <span className="text-muted-foreground">{label}</span>
                          <span className="text-right">{formatCurrency(ricavo)}</span>
                          <span className="text-right">
                            <MargineSemaforo pct={margine_pct} sogliaMin={impostazioni.margine_minimo_percentuale ?? 15} target={impostazioni.margine_target_percentuale ?? 25} />
                          </span>
                        </div>
                      ))}
                    </div>
                  );
                })()}

                {tipoLavoro &&
                  (() => {
                    const catData = categorie.find(
                      (c) => c.nome === tipoLavoro
                    );
                    const target =
                      catData?.margine_target_percentuale ??
                      impostazioni.margine_target_default ??
                      25;
                    return totaliPro.margine_totale_pct < target ? (
                      <div className="flex items-center gap-2 text-amber-700 bg-amber-50 rounded p-2 text-xs">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                        Margine {totaliPro.margine_totale_pct.toFixed(1)}% sotto
                        target per "{tipoLavoro}": {target}%
                      </div>
                    ) : null;
                  })()}
              </div>
            )}

            {/* Documents */}
            {selectedMaterials.length > 0 && (
              <div>
                <h3 className="font-medium mb-2">
                  Documenti allegati ({selectedMaterials.length})
                </h3>
                <div className="flex flex-wrap gap-2">
                  {selectedMaterials.map((mId) => {
                    const m = materials.find((x) => x.id === mId);
                    return m ? (
                      <Badge key={mId} variant="secondary">
                        {m.name}
                      </Badge>
                    ) : null;
                  })}
                </div>
              </div>
            )}

            {/* Template / Aspetto Documento */}
            {templates.length > 0 && (
              <div className="border-t pt-4">
                <h3 className="font-medium mb-3 flex items-center gap-2">
                  <Palette className="h-4 w-4" />
                  Aspetto del Documento
                </h3>
                <div className="space-y-4">
                  <div>
                    <Label className="text-sm">Template</Label>
                    <Select
                      value={selectedTemplateId || ""}
                      onValueChange={setSelectedTemplateId}
                    >
                      <SelectTrigger className="w-full max-w-xs mt-1">
                        <SelectValue placeholder="Seleziona template" />
                      </SelectTrigger>
                      <SelectContent>
                        {templates.map((tmpl) => (
                          <SelectItem key={tmpl.id} value={tmpl.id}>
                            {tmpl.name} {tmpl.is_default ? "(Default)" : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {/* Layout quick-select */}
                  <div className="grid grid-cols-4 gap-2">
                    {(
                      ["classic", "modern", "minimal", "bold"] as QuoteTemplateLayout[]
                    ).map((layout) => (
                      <button
                        key={layout}
                        onClick={() => setLayoutOverride(layout)}
                        className={`border rounded-lg p-2 text-center text-xs transition-all ${
                          (layoutOverride ?? selectedTemplate?.layout) === layout
                            ? "border-primary ring-1 ring-primary/30 bg-primary/5"
                            : "border-border opacity-60"
                        }`}
                      >
                        <QuoteTemplatePreview
                          template={{ ...selectedTemplate, layout }}
                          companyName={effectiveCompany?.name}
                          scale={0.06}
                        />
                        <span className="capitalize mt-1 block">{layout}</span>
                      </button>
                    ))}
                  </div>
                  {/* Mini preview */}
                  {effectiveTemplate && (
                    <div className="flex justify-center">
                      <QuoteTemplatePreview
                        template={effectiveTemplate}
                        companyName={effectiveCompany?.name}
                        scale={0.25}
                      />
                    </div>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between pt-2">
        <Button
          variant="outline"
          onClick={() => setStep(Math.max(0, step - 1))}
          disabled={step === 0}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Indietro
        </Button>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => handleSave("bozza")}
            disabled={saving}
          >
            {saving ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Salva Bozza
          </Button>
          {step < STEPS.length - 1 ? (
            <Button onClick={handleNext}>
              Avanti
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          ) : (
            <Button
              onClick={() => handleSave("bozza")}
              disabled={saving || !clientName}
            >
              {saving ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <FileCheck className="h-4 w-4 mr-2" />
              )}
              Salva Preventivo
            </Button>
          )}
        </div>
      </div>

      {/* ── Dialogs ── */}
      <ProductSearchDialog
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        articoli={articoli}
        categorie={categorie}
        pianoInstallazione={pianoInstallazione}
        calcolaPrezzoProdotto={calcolaPrezzoProdotto}
        onConfirm={addProductFromCatalog}
      />

      {smaltimentoAsk && (
        <Dialog open={true} onOpenChange={() => setSmaltimentoAsk(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Smaltimento materiale vecchio?</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              Aggiungere una riga per lo smaltimento del materiale esistente?
            </p>
            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                onClick={() => setSmaltimentoAsk(null)}
              >
                No grazie
              </Button>
              <Button onClick={() => addSmaltimento(smaltimentoAsk.parentIdx)}>
                Sì, aggiungi
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* IMP09: Bundle dialog */}
      <Dialog open={bundleOpen} onOpenChange={setBundleOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Aggiungi Bundle</DialogTitle>
          </DialogHeader>
          {companyId && (
            <BundleSelector
              companyId={companyId}
              onSelectBundle={handleSelectBundle}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
