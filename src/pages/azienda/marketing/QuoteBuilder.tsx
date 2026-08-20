import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate, useParams, useSearchParams, Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/formatters";
import { queryKeys } from "@/lib/queryKeys";
import { useQuoteTemplates } from "@/hooks/useQuoteTemplates";
import { useGovernanceThresholds } from "@/hooks/useGovernanceThresholds";
import { valutaApprovazionePreventivo } from "@/lib/governance/thresholds";
import {
  useQuoteFormHydration,
  type ExistingQuoteForHydration,
} from "@/hooks/useQuoteFormHydration";
import { QuoteTemplatePreview } from "@/components/quotes/QuoteTemplatePreview";
import AIQuotePanel from "@/components/quotes/AIQuotePanel";
import { useListinoCliente } from "@/hooks/useListinoCliente";
import { QuoteAdvisorPanel } from "@/components/quotes/QuoteAdvisorPanel";
import { QuoteRenderPicker } from "@/components/render/QuoteRenderPicker";
import type { QuoteTemplateLayout } from "@/types/quoteTemplate";
import type { QuoteItemPro } from "@/types/quoteItem";
import {
  usePreventivoCosti,
  calcolaMargine,
  semaforo,
  calcolaTotaliPreventivo,
  calcolaMargineAtteso,
  round2,
  espondiBundle,
  useScontiQuantita,
  useBundleProdotti,
  calcolaScontoQuantita,
} from "@/hooks/usePreventivoCosti";
import type { ArticlePro, TariffaPro, BundleConVoci } from "@/hooks/usePreventivoCosti";
import ApplyBundleDialog from "@/components/marketing/preventivi/ApplyBundleDialog";
import { AddItemDialog } from "@/components/marketing/preventivi/AddItemDialog";
import { QuotePaymentTermsCard } from "@/components/marketing/preventivi/QuotePaymentTermsCard";
import { type QuotePaymentPhase, recalcPhaseAmounts } from "@/lib/preventivi/paymentTerms";
// Refactor 2026-05-10: ProductSearchDialog estratto in file separato (-316 righe)
import { ProductSearchDialog } from "@/components/marketing/preventivi/ProductSearchDialog";
import { QuoteDiscountControl } from "@/components/preventivi/QuoteDiscountControl";
// mp-preventivi-v2: slider sconto limitato integrato nello step 1 per preventivi esistenti
import { isPreventivatoreUnifiedOn } from "@/lib/featureFlags";
import type { ConfiguredItem } from "@/types/catalogItem";
import { useFamilies } from "@/hooks/useFamilies";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
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

// MP-MKT-001: templateAssetUrl estratto in ./QuoteBuilder/helpers.ts
import { templateAssetUrl } from "./QuoteBuilder/helpers";
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
  Wallet,
  Percent,
  Lock,
  Sparkles,
} from "lucide-react";
import {
  QuotePageHeader,
  QuoteCard,
  QuoteStepper,
  type QuoteStep,
} from "@/components/marketing/preventivi/ui/builderUI";
import {
  QuoteFinancingPanel,
  type FinancingProposal,
} from "@/components/marketing/preventivi/QuoteFinancingPanel";

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
  index,
  children,
}: {
  id: string;
  index?: number;
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
    zIndex: isDragging ? 10 : undefined,
  };

  // Drag handle più visibile: numero ordine + grip icon in pill rounded
  const handle = (
    <button
      {...attributes}
      {...listeners}
      className="group/grip cursor-grab active:cursor-grabbing inline-flex items-center gap-1 h-7 px-1.5 rounded-md text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors touch-none shrink-0"
      tabIndex={-1}
      aria-label="Riordina riga"
      title="Trascina per riordinare"
    >
      <GripVertical className="h-3.5 w-3.5 opacity-60 group-hover/grip:opacity-100" />
      {typeof index === "number" && (
        <span className="text-[10px] font-mono font-semibold tabular-nums">
          {index + 1}
        </span>
      )}
    </button>
  );

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={isDragging ? "shadow-2xl ring-2 ring-primary/40 rounded-lg" : ""}
    >
      {children(handle)}
    </div>
  );
}

// MP-MKT-001: ContactOption + ListinoCategoria estratti in ./QuoteBuilder/types.ts
import type { ContactOption } from "./QuoteBuilder/types";

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

// ─────────────────────────────────────────────────────────────────────────────
// PRODUCTSEARCHDIALOG (~316 righe) estratto in:
//   src/components/marketing/preventivi/ProductSearchDialog.tsx
// Refactor 2026-05-10 — comportamento identico, solo extract di sub-component.
// ─────────────────────────────────────────────────────────────────────────────
// ─── STEPS ────────────────────────────────────────────────────────────────────

// MP-MKT-001: STEPS estratto in ./QuoteBuilder/constants.ts
import { STEPS } from "./QuoteBuilder/constants";
import { SedeSelect } from "@/components/sedi/SedeSelect";

// ─── Main component ───────────────────────────────────────────────────────────

export default function QuoteBuilder() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const isEdit = !!id;
  const { effectiveCompany, user } = useAuth();
  const permissions = usePermissions();
  const companyId = effectiveCompany?.id;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  // Gate PER-AZIENDA. Vista margini (link "Margini", margini inline legacy) →
  // canViewMargins/Costs; azioni sul preventivo (override PDF) → canEditPreventivi.
  // Prima usava il ruolo GLOBALE, che non cambia con lo switch azienda → un admin
  // multi-azienda vedeva i margini anche dove è solo staff marketing.
  const canViewImpresa = permissions.canViewMargins || permissions.canViewCosts;
  const canEditPreventivi = permissions.canEditPreventivi;
  // #40 Governance — soglie per-azienda (fallback a default su errore/tabella assente).
  const { data: governanceCfg } = useGovernanceThresholds(companyId);
  /**
   * Sprint B — Varianti Costo Manodopera.
   * Flag legacy: le analisi margine inline (per-riga + totali admin + provvigione)
   * sono state spostate nella pagina dedicata /margini, accessibile tramite il badge
   * "Margini & pianificazione" in alto. In questo builder tutti i ruoli (anche admin)
   * vedono SOLO prezzi di vendita — evita screenshot condivisi con commerciali.
   *
   * Settare a `true` per ripristinare temporaneamente i blocchi inline.
   */
  const QUOTE_BUILDER_INLINE_MARGINS_LEGACY = false;
  const showInlineMargins = canViewImpresa && QUOTE_BUILDER_INLINE_MARGINS_LEGACY;

  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  // Step 3 (Riepilogo): Finanziamento opzionale
  // Persistito su quotes.financing_* (5 campi nullable, snapshot calcolo in JSON).
  const [financingProposal, setFinancingProposal] = useState<FinancingProposal | null>(null);

  // Step 0: Client
  const [contactId, setContactId] = useState<string | null>(null);
  // Sconto concordato col cliente (scheda contatto CRM): si PROPONE, si
  // applica solo al clic. Lettura tollerante: senza tabella, niente banner.
  const { listino: listinoCliente } = useListinoCliente(contactId);
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
  const [paymentMethod, setPaymentMethod] = useState("");
  const [paymentPhases, setPaymentPhases] = useState<QuotePaymentPhase[]>([]);
  const [selectedRenders, setSelectedRenders] = useState<{ id: string; result_url: string | null; render_type: string; session_table: string }[]>([]);

  // P03: Step 0 extras
  const [tipoLavoro, setTipoLavoro] = useState("");
  const [indirizzoLavori, setIndirizzoLavori] = useState("");
  const [pianoInstallazione, setPianoInstallazione] = useState(0);
  const [kmCantiere, setKmCantiere] = useState(0);

  // Commerciale assegnato al preventivo (per provvigioni e regole sconto)
  const [salespersonId, setSalespersonId] = useState<string | null>(null);
  // v8.6.42 — sede operativa per analytics disaggregati
  const [sedeId, setSedeId] = useState<string | null>(null);
  const [approvalStatus, setApprovalStatus] = useState<"not_required" | "pending" | "approved" | "rejected" | "counter_proposed">("not_required");

  // Step 1: Items
  const [items, setItems] = useState<QuoteItemPro[]>([]);
  const [discountPercent, setDiscountPercent] = useState(0);
  // FASE 11 Serramentisti — Margine Lordo Atteso:
  // provvigione commerciale (%) da sottrarre al margine in preview.
  // Sessione-only, non persistita in DB (preview calcolo per il venditore).
  const [provvigionePct, setProvvigionePct] = useState<number>(0);

  // P03: Search dialog
  const [searchOpen, setSearchOpen] = useState(false);
  const [smaltimentoAsk, setSmaltimentoAsk] = useState<{ parentIdx: number } | null>(null);

  // IMP09: Bundle dialog
  const [bundleOpen, setBundleOpen] = useState(false);
  // Sprint A — Preventivatore Unificato: dialog a 3 stadi dietro feature flag
  // `PREVENTIVATORE_UNIFIED_V1`. Quando ON sostituisce il cluster di 5 bottoni
  // (Listino / Bundle / Serramento / Riga libera / Altro) con un unico
  // entry point "+ Aggiungi voce" che apre la macchina a stati
  // Macrocategoria → Prodotto → Configura.
  const [addItemOpen, setAddItemOpen] = useState(false);
  const preventivatoreUnifiedOn = isPreventivatoreUnifiedOn();

  // Step 2: Documents + PDF settings
  const [selectedMaterials, setSelectedMaterials] = useState<string[]>([]);
  // Ponte render→preventivo: arriva da `?render_url=…` (wizard render) o dal
  // preventivo esistente. Se presente, il PDF esce con la pagina finale
  // "Anteprima render AI".
  const [renderUrl, setRenderUrl] = useState<string | null>(null);
  const [renderSessionId, setRenderSessionId] = useState<string | null>(null);
  const [pdfPrezziRiga, setPdfPrezziRiga] = useState(true);
  const [pdfSoloTotale, setPdfSoloTotale] = useState(false);
  const [pdfSconti, setPdfSconti] = useState(false);
  const [pdfImmagini, setPdfImmagini] = useState(true);
  const [pdfSchedeTecniche, setPdfSchedeTecniche] = useState(false);
  const [pdfFirma, setPdfFirma] = useState(true);
  // MP-preventivi-v2: nuovi flag PDF (misure, attributi, note, condizioni, watermark, copia).
  const [pdfMisure, setPdfMisure] = useState(true);
  const [pdfAttributi, setPdfAttributi] = useState(true);
  const [pdfNoteCliente, setPdfNoteCliente] = useState(true);
  const [pdfCondizioni, setPdfCondizioni] = useState(true);
  const [pdfWatermarkText, setPdfWatermarkText] = useState<string>("");
  const [pdfCopiaDestinatario, setPdfCopiaDestinatario] = useState<string>("cliente");

  // Template
  const { templates, defaultTemplate } = useQuoteTemplates();
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);

  useEffect(() => {
    if (defaultTemplate && !selectedTemplateId && !isEdit) {
      setSelectedTemplateId(defaultTemplate.id);
    }
    // Intenzionale: pre-selezione template SOLO al primo caricamento di `defaultTemplate`.
    // `isEdit` e `selectedTemplateId` non devono ri-triggerare: la selezione manuale
    // dell'utente non va sovrascritta, e in modalità edit il template viene impostato
    // altrove da `existingQuote.template_id`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // FASE 7.3: sconti quantità e bundle suggestions
  const { data: scontiQuantita = [] } = useScontiQuantita(companyId);
  const { data: bundles = [] } = useBundleProdotti(companyId);
  const [dismissedSuggestions, setDismissedSuggestions] = useState<Set<string>>(new Set());

  // Listino prodotti: usato per le mappe lookup immagini/thumbnail riga (sotto).
  const { families: articleFamilies } = useFamilies();

  // MP-preventivi-v2: mappe lookup immagini prodotto (thumbnail riga).
  // Le foto vengono lette dinamicamente dal listino, cosi` se aggiorni
  // l'immagine del prodotto si riflette su tutti i preventivi.
  const articleImageMap = useMemo(() => {
    const m = new Map<string, string | null>();
    articoli.forEach((a) => m.set(a.id, (a as { immagine_url?: string | null }).immagine_url ?? null));
    return m;
  }, [articoli]);
  const familyImageMap = useMemo(() => {
    const m = new Map<string, string | null>();
    articleFamilies.forEach((f) => m.set(f.id, (f as { immagine_url?: string | null }).immagine_url ?? null));
    return m;
  }, [articleFamilies]);
  const resolveItemImage = useCallback(
    (it: QuoteItemPro): string | null => {
      if (it.image_url) return it.image_url;
      if (it.article_template_id) return articleImageMap.get(it.article_template_id) ?? null;
      if (it.family_id) return familyImageMap.get(it.family_id) ?? null;
      return null;
    },
    [articleImageMap, familyImageMap],
  );
  // Lookup assi famiglia: { familyId → { axisCode → { label, valueMap: { valueId → label } } } }
  const familyAxesMap = useMemo(() => {
    const m = new Map<string, Map<string, { label: string; valueMap: Map<string, string> }>>();
    articleFamilies.forEach((f) => {
      const axesMap = new Map<string, { label: string; valueMap: Map<string, string> }>();
      const axes = (f as { axes?: Array<{ codice: string; nome: string; values?: Array<{ id: string; label: string }> }> }).axes ?? [];
      axes.forEach((ax) => {
        const valueMap = new Map<string, string>();
        (ax.values ?? []).forEach((v) => valueMap.set(v.id, v.label));
        axesMap.set(ax.codice, { label: ax.nome, valueMap });
      });
      m.set(f.id, axesMap);
    });
    return m;
  }, [articleFamilies]);
  const formatAxisEntry = useCallback(
    (familyId: string | null | undefined, code: string, valueId: string): { label: string; value: string } => {
      if (!familyId) return { label: code, value: valueId };
      const axes = familyAxesMap.get(familyId);
      const axis = axes?.get(code);
      if (!axis) return { label: code, value: valueId };
      return { label: axis.label, value: axis.valueMap.get(valueId) ?? valueId };
    },
    [familyAxesMap],
  );

  // Sync PDF impostazioni for new quote (company-level defaults → form state)
  useEffect(() => {
    if (impostazioni && Object.keys(impostazioni).length > 0 && !isEdit) {
      setPdfPrezziRiga(impostazioni.pdf_mostra_prezzi_per_riga ?? true);
      setPdfSoloTotale(impostazioni.pdf_mostra_solo_totale ?? false);
      setPdfSconti(impostazioni.pdf_mostra_sconti ?? false);
      setPdfImmagini(impostazioni.pdf_mostra_immagini ?? true);
      setPdfSchedeTecniche(impostazioni.pdf_includi_schede_tecniche ?? false);
      setPdfFirma(impostazioni.firma_digitale_abilitata ?? true);
      // MP-preventivi-v2: nuovi flag (default da preventivo_impostazioni)
      const imp = impostazioni as Record<string, unknown>;
      setPdfMisure((imp.pdf_mostra_misure as boolean | undefined) ?? true);
      setPdfAttributi((imp.pdf_mostra_attributi as boolean | undefined) ?? true);
      setPdfNoteCliente((imp.pdf_mostra_note_cliente as boolean | undefined) ?? true);
      setPdfCondizioni((imp.pdf_mostra_condizioni as boolean | undefined) ?? true);
      setPdfWatermarkText((imp.pdf_watermark_text as string | undefined) ?? "");
      setPdfCopiaDestinatario((imp.pdf_copia_destinatario as string | undefined) ?? "cliente");
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
  const { data: existingQuote, isLoading: quoteLoading, isError: quoteError } = useQuery({
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

  // P1-4: idratazione form delegata a useQuoteFormHydration hook.
  // Prima era un blocco inline di ~50 righe con cast `as unknown as {...}`.
  // Il cast era necessario perché i campi extra (tipo_lavoro, km_cantiere,
  // opzioni PDF, template_layout_override — migration
  // 20260324200*_preventivo_pro_v2) non sono nei types generated Supabase.
  // Ora il tipo QuoteExtraFields è esplicito nel hook e testabile.
  useQuoteFormHydration(existingQuote as ExistingQuoteForHydration | null | undefined, {
    setContactId,
    setClientName,
    setClientEmail,
    setClientPhone,
    setClientCompany,
    setClientAddress,
    setClientFiscalCode,
    setClientVatNumber,
    setTitle,
    setDescription,
    setValidityDays,
    setNotes,
    setInternalNotes,
    setDiscountPercent,
    setSelectedTemplateId,
    setTipoLavoro,
    setIndirizzoLavori,
    setPianoInstallazione,
    setKmCantiere,
    setPdfPrezziRiga,
    setPdfSoloTotale,
    setPdfSconti,
    setPdfImmagini,
    setPdfSchedeTecniche,
    setPdfFirma,
    setLayoutOverride,
    setPaymentMethod,
    setPaymentPhases,
  });

  // Preventivi V2 — hydrate salesperson + approval status (fuori dal hook legacy)
  useEffect(() => {
    if (!existingQuote) return;
    const q = existingQuote as unknown as {
      salesperson_id: string | null;
      approval_status: "not_required" | "pending" | "approved" | "rejected" | "counter_proposed" | null;
      sede_id?: string | null;
    };
    if (q.salesperson_id !== undefined) setSalespersonId(q.salesperson_id);
    if (q.approval_status) setApprovalStatus(q.approval_status);
    // v8.6.42 — hydrate sede_id (analytics per sede)
    if (q.sede_id !== undefined) setSedeId(q.sede_id);
  }, [existingQuote]);

  // MP-preventivi-v2: hydrate PDF override da quote esistente (edit mode)
  useEffect(() => {
    if (!existingQuote || !isEdit) return;
    const q = existingQuote as unknown as Record<string, unknown>;
    if (q.pdf_mostra_prezzi_per_riga != null) setPdfPrezziRiga(q.pdf_mostra_prezzi_per_riga as boolean);
    if (q.pdf_mostra_solo_totale != null) setPdfSoloTotale(q.pdf_mostra_solo_totale as boolean);
    if (q.pdf_mostra_sconti != null) setPdfSconti(q.pdf_mostra_sconti as boolean);
    if (q.pdf_mostra_immagini != null) setPdfImmagini(q.pdf_mostra_immagini as boolean);
    if (q.pdf_includi_schede_tecniche != null) setPdfSchedeTecniche(q.pdf_includi_schede_tecniche as boolean);
    if (q.pdf_mostra_misure != null) setPdfMisure(q.pdf_mostra_misure as boolean);
    if (q.pdf_mostra_attributi != null) setPdfAttributi(q.pdf_mostra_attributi as boolean);
    if (q.pdf_mostra_note_cliente != null) setPdfNoteCliente(q.pdf_mostra_note_cliente as boolean);
    if (q.pdf_mostra_condizioni != null) setPdfCondizioni(q.pdf_mostra_condizioni as boolean);
    if (typeof q.pdf_watermark_text === "string") setPdfWatermarkText(q.pdf_watermark_text);
    if (typeof q.pdf_copia_destinatario === "string") setPdfCopiaDestinatario(q.pdf_copia_destinatario);
    if (typeof q.render_url === "string" && q.render_url) {
      setRenderUrl(q.render_url);
      setRenderSessionId((q.render_session_id as string | null) ?? null);
    }

    // Hydrate finanziamento se presente
    if (q.financing_table_id && q.financing_num_installments && q.financing_monthly_rate != null) {
      setFinancingProposal({
        table_id: q.financing_table_id as string,
        amount: Number(q.financing_amount ?? 0),
        num_installments: Number(q.financing_num_installments),
        monthly_rate: Number(q.financing_monthly_rate),
        total_due: Number(q.financing_total_due ?? 0),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        calculation: (q.financing_calculation_json as any) ?? {
          importo_richiesto: Number(q.financing_amount ?? 0),
          numero_rate: Number(q.financing_num_installments),
          modalita: "esatto",
          importo_rata: Number(q.financing_monthly_rate),
          importo_totale_dovuto: Number(q.financing_total_due ?? 0),
        },
      });
    }
  }, [existingQuote, isEdit]);

  // Edit mode: se il preventivo non si carica (id errato / RLS), non lasciare un form
  // vuoto "fantasma" → avvisa l'utente e torna alla lista (niente dead-end silenzioso).
  useEffect(() => {
    if (isEdit && quoteError) {
      toast.error("Preventivo non trovato o non più accessibile.");
      navigate("/azienda/marketing/preventivi");
    }
  }, [isEdit, quoteError, navigate]);

  // Fetch lista commerciali attivi (per picker)
  const { data: salespeople = [] } = useQuery({
    queryKey: ["salespeople-active-for-quote", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("salespeople")
        .select("id, first_name, last_name, compensation_mode")
        .eq("company_id", companyId!)
        .eq("is_active", true)
        .order("last_name");
      if (error) throw error;
      return data as Array<{ id: string; first_name: string; last_name: string; compensation_mode: string | null }>;
    },
  });

  useEffect(() => {
    if (existingItems.length > 0) {
      setItems(
        existingItems.map((i) => {
          return {
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
            family_id: i.family_id ?? null,
            axis_selections: (i.axis_selections as Record<string, string> | null) ?? null,
            // STEP 6 Serramenti Avanzati
            supplier_catalog_id: i.supplier_catalog_id ?? null,
            supplier_product_line_id: i.supplier_product_line_id ?? null,
            // Sprint A §4.9 — Preventivatore Unificato (posa legata).
            // Rileggiamo `parent_item_id` persistito per riabilitare il
            // DELETE cascade + QUANTITY sync anche in modalità edit.
            // `client_temp_id`/`parent_temp_id` restano null: sono vivi solo
            // tra l'aggiunta e il primo SAVE.
            parent_item_id: (i as { parent_item_id?: string | null }).parent_item_id ?? null,
            client_temp_id: null,
            parent_temp_id: null,
          };
        })
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
    // Intenzionale: pre-compila contatto da `?contact_id=...` SOLO al primo render con
    // contacts caricati. `contactId` e `handleContactSelect` fuori dalle deps perché
    // includere `contactId` ri-triggererebbe ad ogni selezione, e `handleContactSelect`
    // è definita dopo l'effect (hoisting function → stabile per render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contacts, isEdit, searchParams]);

  // Ponte render→preventivo: solo alla creazione (in edit si idrata dal DB).
  useEffect(() => {
    if (isEdit) return;
    const url = searchParams.get("render_url");
    if (url) {
      setRenderUrl(url);
      setRenderSessionId(searchParams.get("render_session_id"));
    }
    // Intenzionale: run-once al mount, come il prefill contatto sopra.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      // Addendum P2-04: se l'AI ha scelto una famiglia+config, propaga
      // al quote_items per persistenza.
      family_id?: string | null;
      axis_selections?: Record<string, string> | null;
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
          // Addendum P1-02: per modalità che dipendono da misure/listino dinamico
          // (mq/griglia) il calc client è autoritativo; l'upv eventualmente mandato
          // dall'AI potrebbe essere stale o inaccurato (nearest-neighbor vs exact).
          // Per pz/misura_libera invece l'upv AI è la volontà dell'utente.
          const modalita = art.modalita_prezzo ?? "pz";
          const forceRecalc = modalita === "mq" || modalita === "griglia";
          if (forceRecalc || upv === 0) {
            upv = qty > 0 ? calc.prezzo_vendita / qty : calc.prezzo_vendita;
          }
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
        // Vincolo DB (migration 20260917000012): family_id e article_template_id
        // mutualmente esclusivi. Se AI ha scelto famiglia, zeramo article id.
        article_template_id: r.family_id ? null : (r.article_template_id ?? null),
        tariffa_id: r.tariffa_id ?? null,
        prezzo_acquisto: upa,
        mostra_nel_pdf: true,
        is_optional: false,
        misura_x: r.misure_x_mm ?? null,
        misura_y: r.misure_y_mm ?? null,
        // Addendum P2-04: preserva config famiglia scelta dall'AI.
        family_id: r.family_id ?? null,
        axis_selections: r.axis_selections ?? null,
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

  const updateItem = (index: number, field: keyof QuoteItemPro, value: QuoteItemPro[keyof QuoteItemPro]) => {
    // Sprint A §4.9 — QUANTITY SYNC posa legata.
    // Se modifichiamo la `quantity` di un item parent (posa_linked), ricalcoliamo
    // in proporzione la quantità di ogni figlio. Rapporto preso dallo stato
    // corrente: `newChild = oldChild × (newParent / oldParent)`. Così la
    // posa resta coerente anche dopo modifiche manuali del figlio.
    const current = items[index];
    // Identifica il parent sia per riga non ancora persistita (client_temp_id)
    // sia per riga riletta dal DB (id). Prima la cascade scattava solo con
    // client_temp_id → modificando la quantità di un parent caricato da un
    // preventivo esistente, i figli posa restavano con la quantità vecchia
    // (incoerente con removeItem, che già gestiva entrambi).
    const parentTempId = current?.client_temp_id ?? null;
    const parentDbId = current?.id ?? null;
    if (
      field === "quantity" &&
      current &&
      (parentTempId || parentDbId) &&
      typeof value === "number" &&
      current.quantity > 0 &&
      value !== current.quantity
    ) {
      const ratio = value / current.quantity;
      setItems(
        items.map((it, i) => {
          if (i === index) return { ...it, [field]: value };
          const isChildByTemp = !!parentTempId && it.parent_temp_id === parentTempId;
          const isChildByDb = !!parentDbId && it.parent_item_id === parentDbId;
          if (isChildByTemp || isChildByDb) {
            return { ...it, quantity: Math.max(0, it.quantity * ratio) };
          }
          return it;
        }),
      );
      return;
    }
    setItems(items.map((it, i) => (i === index ? { ...it, [field]: value } : it)));
  };

  const removeItem = (index: number) => {
    // Sprint A §4.9 — DELETE CASCADE posa legata (lato client).
    // Se l'item rimosso è un parent (posa_linked), elimino anche i figli.
    // Matching sia su `client_temp_id` (righe non ancora persistite) che su
    // `parent_item_id` (righe che vengono da un quote riletto dal DB).
    const removed = items[index];
    const parentTempId = removed?.client_temp_id ?? null;
    const parentDbId = removed?.id ?? null;
    setItems(
      items.filter((it, i) => {
        if (i === index) return false;
        if (parentTempId && it.parent_temp_id === parentTempId) return false;
        if (parentDbId && it.parent_item_id === parentDbId) return false;
        return true;
      }),
    );
  };

  // FASE 7.3: compute suggestions (sconti quantità applicabili + bundle che contengono prodotti già presenti)
  type ScontoSuggestion = {
    key: string;
    kind: "sconto";
    itemIdx: number;
    productName: string;
    scontoPct: number;
    daQuantita: number;
  };
  type BundleSuggestion = {
    key: string;
    kind: "bundle";
    bundle: BundleConVoci;
    matchedCount: number;
    totalCount: number;
  };
  type Suggestion = ScontoSuggestion | BundleSuggestion;

  const suggestions = useMemo<Suggestion[]>(() => {
    const out: Suggestion[] = [];

    // Sconti quantità: per ogni riga prodotto con article_template_id verifica se c'è una regola applicabile
    // e se lo sconto suggerito è maggiore di quello già sulla riga.
    if (scontiQuantita.length > 0) {
      items.forEach((it, idx) => {
        if (it.item_category !== "prodotto") return;
        if (!it.article_template_id) return;
        const scontoPct = calcolaScontoQuantita(
          it.article_template_id,
          it.quantity,
          scontiQuantita,
        );
        if (scontoPct > (it.discount_percent ?? 0)) {
          // trova la regola migliore per mostrare da_quantita
          const applic = scontiQuantita.filter(
            (r) =>
              r.attivo &&
              r.da_quantita <= it.quantity &&
              (r.prodotto_id === it.article_template_id || r.prodotto_id === null),
          );
          const specific = applic.filter((r) => r.prodotto_id === it.article_template_id);
          const toUse = specific.length > 0 ? specific : applic;
          const best = toUse.reduce((a, b) => (a.sconto_pct >= b.sconto_pct ? a : b));
          const key = `sconto-${idx}-${it.article_template_id}-${scontoPct}`;
          if (!dismissedSuggestions.has(key)) {
            out.push({
              key,
              kind: "sconto",
              itemIdx: idx,
              productName: it.name,
              scontoPct,
              daQuantita: best.da_quantita,
            });
          }
        }
      });
    }

    // Bundle: se ALMENO un prodotto del quote è in un bundle, suggerisci l'intero bundle.
    // Mostra solo se il bundle ha ≥2 voci e non sono tutte già presenti.
    if (bundles.length > 0) {
      const quoteArticleIds = new Set(
        items.map((it) => it.article_template_id).filter((x): x is string => !!x),
      );
      if (quoteArticleIds.size > 0) {
        for (const bundle of bundles) {
          if (!bundle.bundle_voci || bundle.bundle_voci.length < 2) continue;
          const bundleArticleIds = bundle.bundle_voci
            .map((v) => v.prodotto_id)
            .filter((x): x is string => !!x);
          if (bundleArticleIds.length === 0) continue;
          const matched = bundleArticleIds.filter((id) => quoteArticleIds.has(id)).length;
          if (matched >= 1 && matched < bundleArticleIds.length) {
            const key = `bundle-${bundle.id}-${matched}`;
            if (!dismissedSuggestions.has(key)) {
              out.push({
                key,
                kind: "bundle",
                bundle,
                matchedCount: matched,
                totalCount: bundleArticleIds.length,
              });
            }
          }
        }
      }
    }

    return out;
  }, [items, scontiQuantita, bundles, dismissedSuggestions]);

  const applicaScontoSuggestion = (s: ScontoSuggestion) => {
    setItems((prev) =>
      prev.map((it, i) =>
        i === s.itemIdx ? { ...it, discount_percent: s.scontoPct } : it,
      ),
    );
    setDismissedSuggestions((prev) => {
      const next = new Set(prev);
      next.add(s.key);
      return next;
    });
    toast.success(`Sconto -${s.scontoPct}% applicato a ${s.productName}`);
  };

  const applicaBundleSuggestion = (s: BundleSuggestion) => {
    // Aggiungi SOLO le voci non ancora presenti nel quote
    const quoteArticleIds = new Set(
      items.map((it) => it.article_template_id).filter((x): x is string => !!x),
    );
    const vociDaAggiungere = s.bundle.bundle_voci.filter(
      (v) => v.prodotto_id && !quoteArticleIds.has(v.prodotto_id),
    );
    if (vociDaAggiungere.length === 0) {
      toast.info("Tutte le voci del bundle sono già presenti");
      return;
    }
    const newItems = espondiBundle(
      { id: s.bundle.id, nome: s.bundle.nome, sconto_bundle_pct: s.bundle.sconto_bundle_pct },
      vociDaAggiungere,
      impostazioni.overhead_percentuale ?? 0,
    );
    setItems((prev) => {
      const base = [...prev];
      newItems.forEach((item, idx) => {
        base.push({ ...item, sort_order: base.length + idx });
      });
      return base;
    });
    setDismissedSuggestions((prev) => {
      const next = new Set(prev);
      next.add(s.key);
      return next;
    });
    toast.success(`Bundle '${s.bundle.nome}' applicato (-${s.bundle.sconto_bundle_pct}%)`);
  };

  const ignoraSuggestion = (key: string) => {
    setDismissedSuggestions((prev) => {
      const next = new Set(prev);
      next.add(key);
      return next;
    });
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
    // P2 FIX: hash completo su items invece di solo items.length, altrimenti
    // modifiche a quantità/prezzo/sconto riga NON triggerano autosave —
    // l'utente crede di essere salvato ma perde dati al refresh.
    // Serializziamo solo i campi che contano per rilevare una modifica.
    const itemsSignature = items
      .map((i) => `${i.name}|${i.quantity}|${i.unit_price}|${i.discount_percent}|${i.item_category}`)
      .join("·");
    const hash = JSON.stringify({ clientName, itemsSignature, discountPercent });
    if (hash === lastSavedHashRef.current) return;
    try {
      await supabase.from("quotes").update({
        client_name: clientName,
        discount_percent: discountPercent,
        updated_at: new Date().toISOString(),
      }).eq("id", id!).eq("company_id", companyId);
      // P2 FIX (2026-07): l'autosave ora persiste ANCHE le righe. Prima
      // scriveva solo client_name+discount ma l'hash includeva le righe →
      // l'indicatore "Salvataggio automatico" diventava verde pur NON avendo
      // salvato le modifiche a quantità/prezzo/righe, perse poi al refresh.
      // Stessa RPC atomica del salvataggio manuale (transazione: nessuna
      // perdita parziale). L'UI non ri-legge le righe dopo, quindi il
      // delete+insert lato DB non tocca lo stato locale. Payload allineato a
      // quello di handleSave — modificarli insieme.
      if (items.length > 0) {
        const payload = items.map((it, idx) => ({
          sort_order: idx,
          client_temp_id: it.client_temp_id ?? null,
          parent_temp_id: it.parent_temp_id ?? null,
          item_type: it.item_type,
          name: it.name,
          description: it.description ?? null,
          quantity: it.quantity,
          unit_price: it.unit_price,
          discount_percent: it.discount_percent ?? 0,
          vat_rate: it.vat_rate ?? 22,
          unit_of_measure: it.unit_of_measure,
          article_template_id: it.article_template_id ?? null,
          item_category: it.item_category ?? "prodotto",
          tariffa_id: it.tariffa_id ?? null,
          prezzo_acquisto: it.prezzo_acquisto ?? 0,
          mostra_nel_pdf: it.mostra_nel_pdf ?? true,
          is_optional: it.is_optional ?? false,
          misura_x: it.misura_x ?? null,
          misura_y: it.misura_y ?? null,
          family_id: it.family_id ?? null,
          axis_selections: it.axis_selections ?? null,
          supplier_catalog_id: it.supplier_catalog_id ?? null,
          supplier_product_line_id: it.supplier_product_line_id ?? null,
        }));
        const { error: rpcErr } = await supabase.rpc("save_quote_items_atomic", {
          p_quote_id: id!,
          p_company_id: companyId,
          p_items: payload,
        });
        if (rpcErr) throw rpcErr;
      }
      lastSavedHashRef.current = hash;
      setAutosaveFailed(false);
    } catch {
      setAutosaveFailed(true);
    }
    // `existingQuote?.status` volutamente fuori dalle deps: l'autosave scatta su cambi
    // utente (clientName/items/discount), non sul carico di existingQuote. Leggere status
    // dentro la funzione è sufficiente (closure chiama la query refetch se ID cambia).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientName, items, discountPercent, companyId, user, saving, isEdit, id]);

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

  // ── Recupero bozza locale per preventivo NUOVO (P2) ──────────────────────
  // I preventivi in EDIT hanno l'autosave su DB; quelli NUOVI vivevano solo in
  // useState → persi al refresh/crash. Salviamo una bozza curata in localStorage
  // e la riproponiamo con un banner (ripristino ESPLICITO: nessun auto-overwrite).
  // Allineato al pattern useOrderDraft di CreateOrder.
  const quoteDraftKey = companyId ? `quote-draft-${companyId}` : null;
  const [recoverableDraft, setRecoverableDraft] = useState<Record<string, any> | null>(null);
  const draftCheckedRef = useRef(false);

  useEffect(() => {
    if (isEdit || !quoteDraftKey || draftCheckedRef.current) return;
    draftCheckedRef.current = true;
    try {
      const raw = localStorage.getItem(quoteDraftKey);
      if (raw) setRecoverableDraft(JSON.parse(raw));
    } catch { /* localStorage non disponibile */ }
  }, [isEdit, quoteDraftKey]);

  useEffect(() => {
    if (isEdit || !quoteDraftKey || saving) return;
    if (!clientName.trim() && items.length === 0) return;
    const t = setTimeout(() => {
      try {
        localStorage.setItem(quoteDraftKey, JSON.stringify({
          savedAt: new Date().toISOString(),
          contactId, clientName, clientEmail, clientPhone, clientCompany,
          clientAddress, clientFiscalCode, clientVatNumber,
          title, description, validityDays, notes, internalNotes,
          tipoLavoro, indirizzoLavori, pianoInstallazione, kmCantiere,
          salespersonId, sedeId, discountPercent, provvigionePct, items,
        }));
      } catch { /* localStorage pieno/non disponibile */ }
    }, 1000);
    return () => clearTimeout(t);
  }, [isEdit, quoteDraftKey, saving, contactId, clientName, clientEmail, clientPhone,
      clientCompany, clientAddress, clientFiscalCode, clientVatNumber, title, description,
      validityDays, notes, internalNotes, tipoLavoro, indirizzoLavori, pianoInstallazione,
      kmCantiere, salespersonId, sedeId, discountPercent, provvigionePct, items]);

  const clearQuoteDraft = useCallback(() => {
    if (!quoteDraftKey) return;
    try { localStorage.removeItem(quoteDraftKey); } catch { /* ignore */ }
  }, [quoteDraftKey]);

  const restoreQuoteDraft = () => {
    const d = recoverableDraft;
    if (!d) return;
    setContactId(d.contactId ?? null);
    setClientName(d.clientName ?? "");
    setClientEmail(d.clientEmail ?? "");
    setClientPhone(d.clientPhone ?? "");
    setClientCompany(d.clientCompany ?? "");
    setClientAddress(d.clientAddress ?? "");
    setClientFiscalCode(d.clientFiscalCode ?? "");
    setClientVatNumber(d.clientVatNumber ?? "");
    setTitle(d.title ?? "Preventivo");
    setDescription(d.description ?? "");
    setValidityDays(d.validityDays ?? 30);
    setNotes(d.notes ?? "");
    setInternalNotes(d.internalNotes ?? "");
    setTipoLavoro(d.tipoLavoro ?? "");
    setIndirizzoLavori(d.indirizzoLavori ?? "");
    setPianoInstallazione(d.pianoInstallazione ?? 0);
    setKmCantiere(d.kmCantiere ?? 0);
    setSalespersonId(d.salespersonId ?? null);
    setSedeId(d.sedeId ?? null);
    setDiscountPercent(d.discountPercent ?? 0);
    setProvvigionePct(d.provvigionePct ?? 0);
    if (Array.isArray(d.items)) setItems(d.items);
    setRecoverableDraft(null);
    toast.success("Bozza ripristinata");
  };

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
  // ⚠️ IVA: `totaliPro.iva_breakdown` è GIÀ al netto dello sconto globale
  // (calcolaTotaliPreventivo ritorna iva_breakdown_netto = iva × (1 - sconto%)).
  // Prima qui la si ri-moltiplicava per (1 - discountPercent/100) → IVA scontata
  // DUE volte (IVA e totale sottostimati, e persistiti a DB). Usare i valori
  // autoritativi della funzione: total = totaliPro.totale, vatAmount = total - netto.
  const total = totaliPro.totale;
  const vatAmount = Math.round((total - totaliPro.subtotale_netto) * 100) / 100;

  // #40 Governance — valutazione (non bloccante) doppia approvazione sul netto.
  const approvazioneEsito = useMemo(
    () =>
      governanceCfg
        ? valutaApprovazionePreventivo(governanceCfg, totaliPro.subtotale_netto)
        : null,
    [governanceCfg, totaliPro.subtotale_netto],
  );

  // FASE 11 Serramentisti — breakdown margine atteso (materiali + manodopera +
  // altri + overhead + provvigione commerciale). Visibile solo agli admin.
  const margineAtteso = useMemo(
    () =>
      calcolaMargineAtteso(
        items,
        impostazioni.overhead_percentuale ?? 0,
        discountPercent,
        provvigionePct,
      ),
    [items, impostazioni.overhead_percentuale, discountPercent, provvigionePct],
  );

  // Save
  const handleSave = async (status: string = "bozza") => {
    if (!companyId || !user) return;
    // P2 FIX: blocca double-click / submit concorrente.
    // Se c'è già un save in progress ignora chiamata duplicata per evitare
    // la race condition DELETE→INSERT che può perdere righe preventivo.
    if (saving) return;
    setSaving(true);
    try {
      // TODO IMP10: complex type — quoteData includes P03 fields not in generated types
      // Linka all'opportunità se siamo arrivati con ?opportunity_id=…
      // così il preventivo appare anche nella tab Preventivi dell'opp.
      const urlOpportunityId = isEdit ? null : (searchParams.get("opportunity_id") || null);
      const quoteData: Record<string, unknown> = {
        company_id: companyId,
        status,
        contact_id: contactId,
        opportunity_id: urlOpportunityId,
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
        payment_method: paymentMethod || null,
        payment_phases: paymentPhases.length ? recalcPhaseAmounts(paymentPhases, total) : null,
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
        // Preventivi V2
        salesperson_id: salespersonId,
        sede_id: sedeId,
        render_url: renderUrl,
        render_session_id: renderSessionId,
        margine_pct_snapshot: totaliPro.margine_totale_pct ?? null,
        firma_digitale_abilitata: pdfFirma,
        template_layout_override: layoutOverride || null,
        // MP-preventivi-v2: persistenza completa flag PDF (admin-only input).
        pdf_mostra_prezzi_per_riga: pdfPrezziRiga,
        pdf_mostra_solo_totale: pdfSoloTotale,
        pdf_mostra_sconti: pdfSconti,
        pdf_mostra_immagini: pdfImmagini,
        pdf_includi_schede_tecniche: pdfSchedeTecniche,
        pdf_mostra_misure: pdfMisure,
        pdf_mostra_attributi: pdfAttributi,
        pdf_mostra_note_cliente: pdfNoteCliente,
        pdf_mostra_condizioni: pdfCondizioni,
        pdf_watermark_text: pdfWatermarkText || null,
        pdf_copia_destinatario: pdfCopiaDestinatario || null,
        // P1 FIX wave 4: subtotal ora è il LORDO coerente con la UI che mostra:
        //   Subtotale (lordo) - Sconto - IVA = Totale.
        //   Prima salvavamo `subtotal - discountAmt` (netto) causando incoerenza
        //   visiva per l'utente. `total` rimane la grandezza autoritativa per
        //   aggregati/report; i preventivi vecchi continueranno a mostrare il
        //   subtotale "netto" storico ma total è comunque corretto.
        subtotal,
        discount_amount: discountAmt,
        vat_amount: vatAmount,
        total,
        // ── Finanziamento (opzionale) ──
        // Se l'utente disattiva il toggle, financingProposal e' null e tutti
        // i campi vanno a null (rimuove il finanziamento da un preventivo
        // esistente in edit).
        financing_table_id: financingProposal?.table_id ?? null,
        financing_amount: financingProposal?.amount ?? null,
        financing_num_installments: financingProposal?.num_installments ?? null,
        financing_monthly_rate: financingProposal?.monthly_rate ?? null,
        financing_total_due: financingProposal?.total_due ?? null,
        financing_calculation_json: financingProposal?.calculation ?? null,
      };

      let quoteId = id;

      if (isEdit) {
        const { error } = await supabase
          .from("quotes")
          .update(quoteData)
          .eq("id", id!)
          .eq("company_id", companyId);
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

      // P0-1: salvataggio atomico delle righe preventivo.
      // DELETE + INSERT + UPDATE parent_item_id girano tutti dentro la stessa
      // transazione PL/pgSQL della RPC: se un qualsiasi step fallisce viene
      // effettuato rollback totale e nessuna riga del preventivo viene persa.
      // Prima era possibile che la DELETE committasse e l'INSERT fallisse,
      // svuotando il preventivo.
      // Migration: supabase/migrations/20260423120001_quote_items_atomic_save.sql
      if (items.length > 0) {
        const payload = items.map((it, idx) => ({
          sort_order: idx,
          client_temp_id: it.client_temp_id ?? null,
          parent_temp_id: it.parent_temp_id ?? null,
          item_type: it.item_type,
          name: it.name,
          description: it.description ?? null,
          quantity: it.quantity,
          unit_price: it.unit_price,
          discount_percent: it.discount_percent ?? 0,
          vat_rate: it.vat_rate ?? 22,
          unit_of_measure: it.unit_of_measure,
          article_template_id: it.article_template_id ?? null,
          item_category: it.item_category ?? "prodotto",
          tariffa_id: it.tariffa_id ?? null,
          prezzo_acquisto: it.prezzo_acquisto ?? 0,
          mostra_nel_pdf: it.mostra_nel_pdf ?? true,
          is_optional: it.is_optional ?? false,
          misura_x: it.misura_x ?? null,
          misura_y: it.misura_y ?? null,
          family_id: it.family_id ?? null,
          axis_selections: it.axis_selections ?? null,
          supplier_catalog_id: it.supplier_catalog_id ?? null,
          supplier_product_line_id: it.supplier_product_line_id ?? null,
        }));
        const { error: rpcErr } = await supabase.rpc("save_quote_items_atomic", {
          p_quote_id: quoteId!,
          p_company_id: companyId,
          p_items: payload,
        });
        if (rpcErr) throw rpcErr;
      } else if (isEdit) {
        // Preventivo svuotato completamente dall'utente: nulla da inserire,
        // cancelliamo esplicitamente le righe residue.
        await supabase.from("quote_items").delete().eq("quote_id", quoteId!);
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

      // Preventivi V2 — calcolo provvigione teorica (non-blocking)
      if (quoteId && salespersonId) {
        try {
          await supabase.rpc("compute_quote_commission", { p_quote_id: quoteId });
        } catch (commErr) {
          console.warn("compute_quote_commission failed (non-critical):", commErr);
        }
      }

      queryClient.invalidateQueries({ queryKey: queryKeys.quotes.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.quotes.detail(quoteId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.quotes.items(quoteId) });
      toast.success(isEdit ? "Preventivo aggiornato" : "Preventivo creato");
      clearQuoteDraft(); // salvato a DB → la bozza locale non serve più
      navigate(`/azienda/marketing/preventivi/${quoteId}`);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : "Errore salvataggio";
      toast.error(errMsg);
    } finally {
      setSaving(false);
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  // Step config per QuoteStepper (replica look wizard FV)
  const stepperSteps: QuoteStep[] = STEPS.map((s) => ({
    key: s.key,
    label: s.label,
    icon: <s.icon className="h-4 w-4" />,
  }));

  // Edit mode: mostra un loader mentre il preventivo esistente viene caricato,
  // così l'utente non vede per un istante un form "vuoto" (che sembra nuovo).
  if (isEdit && quoteLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center" aria-busy="true">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
          <p>Caricamento preventivo…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-24 [&_label]:text-xs sm:[&_label]:text-sm">
      {/* Recupero bozza locale (solo preventivo NUOVO) */}
      {!isEdit && recoverableDraft && (
        <div className="flex flex-col gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2 text-sm text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Hai una <strong>bozza non salvata</strong> di un preventivo
              {recoverableDraft.savedAt ? ` del ${new Date(recoverableDraft.savedAt).toLocaleString("it-IT")}` : ""}. Vuoi riprenderla?
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button size="sm" variant="outline" className="h-8 bg-white" onClick={restoreQuoteDraft}>
              Ripristina
            </Button>
            <Button size="sm" variant="ghost" className="h-8" onClick={() => { setRecoverableDraft(null); clearQuoteDraft(); }}>
              Ignora
            </Button>
          </div>
        </div>
      )}
      {/* Header (replica FvPageHeader) */}
      <QuotePageHeader
        title={isEdit ? "Modifica preventivo" : "Nuovo preventivo"}
        subtitle={
          autosaveFailed ? (
            <span className="flex items-center gap-1 font-medium text-red-600">
              <AlertTriangle className="h-3 w-3" />
              salvataggio auto fallito
            </span>
          ) : undefined
        }
        icon={<FileCheck className="h-5 w-5" />}
        actions={
          <>
            <Button
              variant="ghost"
              size="sm"
              className="h-9"
              onClick={() => navigate("/azienda/marketing/preventivi")}
              title="Torna alla lista"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Lista
            </Button>
            {/* Live totals badge */}
            {total > 0 && (
              <div className="hidden md:flex items-center gap-3 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-xs">
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">Subtotale</p>
                  <p className="font-semibold tabular-nums text-slate-900">{formatCurrency(subtotal)}</p>
                </div>
                {discountAmt > 0 && (
                  <>
                    <div className="h-6 w-px bg-slate-200" />
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">Sconto</p>
                      <p className="font-semibold tabular-nums text-orange-600">-{formatCurrency(discountAmt)}</p>
                    </div>
                  </>
                )}
                <div className="h-6 w-px bg-slate-200" />
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">Totale</p>
                  <p className="font-bold tabular-nums text-orange-600">{formatCurrency(total)}</p>
                </div>
              </div>
            )}
            {canViewImpresa && isEdit && id && (
              <Link
                to={`/azienda/marketing/preventivi/${id}/margini`}
                className="inline-flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100 transition-colors h-9"
              >
                <TrendingUp className="h-3.5 w-3.5" />
                Margini
              </Link>
            )}
          </>
        }
      />

      {/* Stepper (replica FvTabBar) */}
      <QuoteStepper
        steps={stepperSteps}
        current={step}
        onSelect={setStep}
        allowJumpForward
      />

      {/* ── STEP 0: Cliente ── */}
      {step === 0 && (
        <QuoteCard
          title="Dati cliente"
          icon={<User className="h-4 w-4" />}
        >
          <div className="space-y-5">
            {/* Blocco 1: Selezione rapida da contatto */}
            <div className="rounded-lg border bg-muted/30 p-3">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Seleziona contatto esistente</Label>
              <div className="mt-1.5">
                <ContactCombobox
                  contacts={contacts}
                  value={contactId}
                  onChange={handleContactSelect}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1.5">
                Seleziona un contatto CRM per compilare automaticamente i campi sotto.
              </p>
            </div>

            {/* Blocco 2: Anagrafica cliente */}
            <div className="space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Anagrafica cliente
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Nome cliente *</Label>
                  <Input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Mario Rossi" />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input type="email" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} placeholder="mario@example.com" />
                </div>
                <div>
                  <Label>Telefono</Label>
                  <Input value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} placeholder="+39 333 1234567" />
                </div>
                <div>
                  <Label>Azienda</Label>
                  <Input value={clientCompany} onChange={(e) => setClientCompany(e.target.value)} placeholder="Rossi Srl" />
                </div>
                <div>
                  <Label>Codice Fiscale</Label>
                  <Input value={clientFiscalCode} onChange={(e) => setClientFiscalCode(e.target.value)} className="uppercase" />
                </div>
                <div>
                  <Label>P.IVA</Label>
                  <Input value={clientVatNumber} onChange={(e) => setClientVatNumber(e.target.value)} />
                </div>
                <div className="md:col-span-2">
                  <Label>Indirizzo</Label>
                  <Input value={clientAddress} onChange={(e) => setClientAddress(e.target.value)} placeholder="Via Roma 1, 20100 Milano (MI)" />
                </div>
              </div>
            </div>

            {/* Blocco 3: Offerta */}
            <div className="space-y-3 border-t pt-4">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Offerta
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2">
                  <Label>Titolo offerta</Label>
                  <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="es. Fornitura e posa serramenti PVC" />
                </div>
                <div>
                  <Label>Validità (giorni)</Label>
                  <Input type="number" value={validityDays} onChange={(e) => setValidityDays(parseInt(e.target.value) || 30)} />
                </div>
                <div className="md:col-span-3">
                  <Label>Descrizione</Label>
                  <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2}
                    placeholder="Breve descrizione dei lavori (appare sul PDF)" />
                </div>
                <div className="md:col-span-3 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Note visibili al cliente</Label>
                    <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
                      placeholder="Pagamento, tempi consegna, garanzia..." />
                  </div>
                  <div>
                    <Label>Note interne <span className="text-muted-foreground font-normal">(non mostrate al cliente)</span></Label>
                    <Textarea value={internalNotes} onChange={(e) => setInternalNotes(e.target.value)} rows={2}
                      placeholder="Info riservate per il team" />
                  </div>
                </div>
              </div>
            </div>

            {/* Blocco 3b: Modalità e fasi di pagamento (firmate dal cliente, riportate in commessa) */}
            <div className="border-t pt-4">
              <QuotePaymentTermsCard
                total={total}
                method={paymentMethod}
                phases={paymentPhases}
                onMethodChange={setPaymentMethod}
                onPhasesChange={setPaymentPhases}
              />
            </div>

            {/* Blocco 4: Dettagli lavoro */}
            <div className="space-y-3 border-t pt-4">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Dettagli lavoro e assegnazione
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
                <Label>Commerciale assegnato</Label>
                <Select
                  value={salespersonId ?? "__none__"}
                  onValueChange={(v) => setSalespersonId(v === "__none__" ? null : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleziona commerciale" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Nessuno (provvigione non calcolata)</SelectItem>
                    {salespeople.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.first_name} {s.last_name}
                        {s.compensation_mode === "fixed_only" && " — solo fisso"}
                        {s.compensation_mode === "fixed_plus_commission" && " — fisso+provv"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  La provvigione teorica viene calcolata automaticamente in base alla configurazione del commerciale.
                </p>
              </div>
              {/* v8.6.42 — Sede operativa del preventivo (analytics MV) */}
              <div className="md:col-span-2">
                <SedeSelect
                  label="Sede operativa"
                  placeholder="Sede operativa (opzionale)"
                  value={sedeId}
                  onChange={setSedeId}
                />
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
            </div>
          </div>
        </QuoteCard>
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
                  {preventivatoreUnifiedOn ? (
                    // Sprint A: entry point unificato. Le azioni secondarie
                    // (Riga libera/Sconto/Subtotale) sono dentro il dialog
                    // stesso; Nota/Trasporto/Nolo restano accessibili dal
                    // menu "Altro" sottostante per non rompere il flusso
                    // avanzato degli utenti abituati.
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" onClick={() => setAddItemOpen(true)}>
                        <Plus className="h-4 w-4 mr-1" /> Aggiungi voce
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
                          {tariffe.filter((t) => t.tipo === "trasporto")
                            .length > 0 && (
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
                                const t = tariffe.find(
                                  (x) => x.tipo === "nolo"
                                );
                                if (t) addTariffa(t, "nolo");
                              }}
                            >
                              <Layers className="h-4 w-4 mr-2" /> Nolo
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  ) : (
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
                      {/* MP-preventivi-v2: bottone "Serramento" top-level rimosso.
                          Il wizard serramenti e` ora accessibile tramite "Dal listino"
                          → selezione famiglia con assi, cosi` il tool resta generico
                          per tutte le tipologie di aziende. */}
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
                          <DropdownMenuItem
                            onClick={() => addItemPro("sconto")}
                          >
                            <Tag className="h-4 w-4 mr-2" /> Sconto
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => addItemPro("subtotale")}
                          >
                            <Hash className="h-4 w-4 mr-2" /> Subtotale
                          </DropdownMenuItem>
                          {tariffe.filter((t) => t.tipo === "trasporto")
                            .length > 0 && (
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
                                const t = tariffe.find(
                                  (x) => x.tipo === "nolo"
                                );
                                if (t) addTariffa(t, "nolo");
                              }}
                            >
                              <Layers className="h-4 w-4 mr-2" /> Nolo
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {/* FASE 7.3: banner suggerimenti sconti quantità + bundle */}
                {suggestions.length > 0 && (
                  <div className="mb-4 space-y-2">
                    {suggestions.map((s) => (
                      <div
                        key={s.key}
                        className="flex items-center justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm dark:border-amber-900/50 dark:bg-amber-950/30"
                      >
                        <div className="flex-1">
                          {s.kind === "sconto" ? (
                            <>
                              <span className="font-medium text-amber-900 dark:text-amber-200">
                                Sconto quantità applicabile: -{s.scontoPct}%
                              </span>
                              <span className="text-amber-800 dark:text-amber-300">
                                {" "}su <b>{s.productName}</b> (da {s.daQuantita} pz)
                              </span>
                            </>
                          ) : (
                            <>
                              <span className="font-medium text-amber-900 dark:text-amber-200">
                                Bundle suggerito: {s.bundle.nome} (-{s.bundle.sconto_bundle_pct}%)
                              </span>
                              <span className="text-amber-800 dark:text-amber-300">
                                {" "}({s.matchedCount}/{s.totalCount} prodotti già presenti)
                              </span>
                            </>
                          )}
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() =>
                              s.kind === "sconto"
                                ? applicaScontoSuggestion(s)
                                : applicaBundleSuggestion(s)
                            }
                          >
                            Applica
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => ignoraSuggestion(s.key)}
                          >
                            Ignora
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
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
                        <SortableItem
                          key={`item-${idx}`}
                          id={`item-${idx}`}
                          index={!isChild && !isNota && !isSubtotale && !isSconto ? idx : undefined}
                        >
                          {(dragHandle) => (
                        <div
                          className={`group/row border rounded-lg p-2.5 flex gap-1.5 items-start transition-all hover:border-primary/40 hover:shadow-sm ${
                            isChild
                              ? "ml-6 bg-muted/20 border-dashed"
                              : "bg-card"
                          } ${
                            isNota
                              ? "bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/50"
                              : ""
                          } ${
                            isSubtotale
                              ? "border-t-2 border-t-primary/30 bg-muted/30"
                              : ""
                          } ${
                            isSconto
                              ? "bg-orange-50/50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-900/50"
                              : ""
                          }`}
                        >
                          {!isChild && dragHandle}
                          {isChild && (
                            <span className="text-muted-foreground/60 text-xs mr-2 mt-2 shrink-0">
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
                                className="h-9 w-9 md:h-7 md:w-7 text-destructive"
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
                                className="h-9 w-9 md:h-7 md:w-7 text-destructive"
                                onClick={() => removeItem(idx)}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          ) : (
                            <div className="space-y-2 flex-1">
                              <div className="flex gap-3 items-start">
                                {/* MP-preventivi-v2: thumbnail 48x48 per prodotti con foto */}
                                {!isSconto && !isSubtotale && !isNota && (() => {
                                  const img = resolveItemImage(item);
                                  return (
                                    <div className="h-12 w-12 shrink-0 overflow-hidden rounded-md bg-muted border">
                                      {img ? (
                                        <img
                                          src={img}
                                          alt={item.name}
                                          loading="lazy"
                                          className="h-full w-full object-cover"
                                        />
                                      ) : (
                                        <div className="flex h-full w-full items-center justify-center">
                                          <Package className="h-5 w-5 text-muted-foreground/50" />
                                        </div>
                                      )}
                                    </div>
                                  );
                                })()}
                                <div className="flex-1">
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
                              {/* MP-preventivi-v2: dettagli riga (misure + assi + descrizione) */}
                              {!isSconto && !isNota && (item.misura_x || item.misura_y || item.description || (item.axis_selections && Object.keys(item.axis_selections).length > 0)) && (
                                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                                  {(item.misura_x || item.misura_y) && (
                                    <div className="flex items-center gap-1.5">
                                      <span className="font-medium text-foreground/70">Misure:</span>
                                      <Input
                                        type="number"
                                        value={item.misura_x ?? ""}
                                        onChange={(e) => updateItem(idx, "misura_x", e.target.value === "" ? null : parseFloat(e.target.value))}
                                        className="h-7 w-20 text-xs"
                                        placeholder="L"
                                      />
                                      <span>×</span>
                                      <Input
                                        type="number"
                                        value={item.misura_y ?? ""}
                                        onChange={(e) => updateItem(idx, "misura_y", e.target.value === "" ? null : parseFloat(e.target.value))}
                                        className="h-7 w-20 text-xs"
                                        placeholder="H"
                                      />
                                      <span>mm</span>
                                    </div>
                                  )}
                                  {item.axis_selections && Object.entries(item.axis_selections).length > 0 && (
                                    <div className="flex items-center gap-1 flex-wrap">
                                      {Object.entries(item.axis_selections).map(([k, v]) => {
                                        const formatted = formatAxisEntry(item.family_id, k, v);
                                        return (
                                          <Badge key={k} variant="outline" className="text-[10px] font-normal">
                                            {formatted.label}: {formatted.value}
                                          </Badge>
                                        );
                                      })}
                                    </div>
                                  )}
                                  {item.description && (
                                    <span className="italic line-clamp-1 flex-1 min-w-[120px]">
                                      {item.description}
                                    </span>
                                  )}
                                </div>
                              )}
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
                              {/* Admin: margine per tutte le categorie con costo noto — legacy (vedi /margini) */}
                              {showInlineMargins &&
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
                  <div className="mt-6 space-y-4">
                    {isEdit && id && (
                      <QuoteDiscountControl
                        quoteId={id}
                        currentDiscount={discountPercent}
                        approvalStatus={approvalStatus}
                        onDiscountChange={setDiscountPercent}
                      />
                    )}
                    <div className="flex justify-end">
                      <div className="w-full max-w-sm rounded-lg border bg-gradient-to-br from-muted/30 to-muted/10 p-4 space-y-2.5 text-sm">
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground text-xs uppercase tracking-wide">
                            Subtotale
                          </span>
                          <span className="tabular-nums font-medium">
                            {formatCurrency(subtotal)}
                          </span>
                        </div>
                        {!isEdit && listinoCliente?.attivo &&
                          (listinoCliente.sconto_globale_pct ?? 0) > 0 &&
                          discountPercent !== listinoCliente.sconto_globale_pct && (
                          <div className="flex justify-between items-center gap-2 rounded-md bg-primary/5 border border-primary/20 px-2 py-1.5">
                            <span className="text-xs">
                              Listino cliente: sconto concordato{" "}
                              <span className="font-semibold">{listinoCliente.sconto_globale_pct}%</span>
                            </span>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-6 text-xs"
                              onClick={() => setDiscountPercent(listinoCliente.sconto_globale_pct)}
                            >
                              Applica
                            </Button>
                          </div>
                        )}
                        {!isEdit && (
                          <div className="flex justify-between items-center gap-2 py-1 border-t border-dashed">
                            <span className="text-muted-foreground text-xs uppercase tracking-wide">
                              Sconto globale
                            </span>
                            <div className="flex items-center gap-1">
                              <Input
                                type="number"
                                min={0}
                                max={100}
                                step={0.5}
                                className="w-16 h-7 text-right text-xs"
                                value={discountPercent}
                                onChange={(e) =>
                                  setDiscountPercent(
                                    parseFloat(e.target.value) || 0
                                  )
                                }
                              />
                              <span className="text-xs text-muted-foreground">%</span>
                            </div>
                          </div>
                        )}
                        {discountPercent > 0 && (
                          <div className="flex justify-between items-center text-orange-600 dark:text-orange-400">
                            <span className="text-xs uppercase tracking-wide">
                              Sconto applicato
                            </span>
                            <span className="tabular-nums font-medium">
                              -{formatCurrency(discountAmt)}
                            </span>
                          </div>
                        )}
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground text-xs uppercase tracking-wide">
                            IVA
                          </span>
                          <span className="tabular-nums text-muted-foreground">
                            {formatCurrency(vatAmount)}
                          </span>
                        </div>
                        <div className="h-px bg-border" />
                        <div className="flex justify-between items-baseline">
                          <span className="font-semibold text-base">
                            Totale
                          </span>
                          <span className="font-bold text-xl text-primary tabular-nums">
                            {formatCurrency(total)}
                          </span>
                        </div>
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
                {/* Admin block — legacy (vedi /margini) */}
                {showInlineMargins && totaliPro.costo_totale > 0 && (
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

            {/* Advisor commerciale AI: storico margini cliente + prezzo target
                (ai-quote-supreme, on-demand — ha un costo AI per chiamata). */}
            <div className="mt-4">
              <QuoteAdvisorPanel
                contactId={contactId}
                clientName={clientName}
                projectDescription={description || title}
                projectType={tipoLavoro}
                proposedLines={items
                  .filter(
                    (i) =>
                      !["nota", "subtotale", "sconto"].includes(i.item_category) &&
                      !i.is_optional
                  )
                  .map((i) => ({
                    descrizione: i.name,
                    quantita: i.quantity,
                    prezzo_unitario: i.unit_price,
                    importo:
                      Math.round(
                        i.quantity *
                          i.unit_price *
                          (1 - (i.discount_percent || 0) / 100) *
                          100
                      ) / 100,
                  }))}
                proposedTotal={total}
                proposedMarginPct={
                  totaliPro.costo_totale > 0 ? totaliPro.margine_totale_pct : null
                }
              />
            </div>
          </div>
        </div>
      )}

      {/* ── STEP 2: Documenti + PDF settings ── */}
      {step === 2 && (
        <div className="space-y-4">
          {canEditPreventivi ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings2 className="h-4 w-4" />
                Impostazioni PDF (override per questo preventivo)
                <Badge variant="secondary" className="ml-2 text-[10px]">Admin</Badge>
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Le modifiche qui valgono solo per questo preventivo. I valori di default si configurano in{" "}
                <Link to="/azienda/impostazioni/margini" className="underline">Impostazioni → Preventivi & margini</Link>.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Struttura tabella</h4>
                {[
                  { k: "pdfPrezziRiga", v: pdfPrezziRiga, s: setPdfPrezziRiga, l: "Mostra prezzo per ogni riga", h: "Colonne Prezzo/Sconto/IVA sulla riga. Se off: solo Nome+Q.tà+Totale." },
                  { k: "pdfSoloTotale", v: pdfSoloTotale, s: setPdfSoloTotale, l: "Solo totale finale (senza dettaglio righe)", h: "Omette del tutto la tabella prodotti." },
                  { k: "pdfSconti", v: pdfSconti, s: setPdfSconti, l: "Mostra sconti applicati", h: "Colonna sconto e riga sconto globale." },
                ].map(({ k, v, s, l, h }) => (
                  <div key={k} className="flex items-start justify-between gap-4 py-1.5">
                    <div className="flex-1">
                      <Label className="font-normal">{l}</Label>
                      <p className="text-xs text-muted-foreground">{h}</p>
                    </div>
                    <Switch checked={v} onCheckedChange={s} />
                  </div>
                ))}
              </div>

              <div className="space-y-2 border-t pt-3">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Dettagli prodotto</h4>
                {[
                  { k: "pdfImmagini", v: pdfImmagini, s: setPdfImmagini, l: "Includi miniature prodotti", h: "Foto 40x40 nella riga (se disponibili in listino)." },
                  { k: "pdfMisure", v: pdfMisure, s: setPdfMisure, l: "Mostra misure (L × H mm)", h: "Sotto al nome per prodotti configurati con misure." },
                  { k: "pdfAttributi", v: pdfAttributi, s: setPdfAttributi, l: "Mostra attributi / varianti", h: 'Es. "Colore: Bianco · Vetro: Doppio".' },
                  { k: "pdfSchedeTecniche", v: pdfSchedeTecniche, s: setPdfSchedeTecniche, l: "Allega schede tecniche PDF", h: "Documenti prodotto selezionati sotto." },
                ].map(({ k, v, s, l, h }) => (
                  <div key={k} className="flex items-start justify-between gap-4 py-1.5">
                    <div className="flex-1">
                      <Label className="font-normal">{l}</Label>
                      <p className="text-xs text-muted-foreground">{h}</p>
                    </div>
                    <Switch checked={v} onCheckedChange={s} />
                  </div>
                ))}
              </div>

              <div className="space-y-2 border-t pt-3">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Note & condizioni</h4>
                {[
                  { k: "pdfNoteCliente", v: pdfNoteCliente, s: setPdfNoteCliente, l: "Stampa note cliente", h: "Le note compilate nello Step 0 (visibili al cliente)." },
                  { k: "pdfCondizioni", v: pdfCondizioni, s: setPdfCondizioni, l: "Stampa condizioni contrattuali", h: "Termini e condizioni in pagina finale." },
                ].map(({ k, v, s, l, h }) => (
                  <div key={k} className="flex items-start justify-between gap-4 py-1.5">
                    <div className="flex-1">
                      <Label className="font-normal">{l}</Label>
                      <p className="text-xs text-muted-foreground">{h}</p>
                    </div>
                    <Switch checked={v} onCheckedChange={s} />
                  </div>
                ))}
              </div>

              <div className="space-y-2 border-t pt-3">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Firma & presentazione</h4>
                <div className="flex items-start justify-between gap-4 py-1.5">
                  <div className="flex-1">
                    <Label className="font-normal">Firma digitale abilitata</Label>
                    <p className="text-xs text-muted-foreground">Aggiunge QR code e link "Accetta preventivo" al PDF.</p>
                  </div>
                  <Switch checked={pdfFirma} onCheckedChange={setPdfFirma} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-1.5">
                  <div>
                    <Label className="font-normal text-sm">Watermark (opzionale)</Label>
                    <Input
                      value={pdfWatermarkText}
                      onChange={(e) => setPdfWatermarkText(e.target.value)}
                      placeholder='es. "BOZZA", "RISERVATO"'
                      className="mt-1 h-9"
                    />
                    <p className="text-xs text-muted-foreground mt-1">Vuoto = nessun watermark.</p>
                  </div>
                  <div>
                    <Label className="font-normal text-sm">Destinatario copia</Label>
                    <Select value={pdfCopiaDestinatario || "cliente"} onValueChange={setPdfCopiaDestinatario}>
                      <SelectTrigger className="mt-1 h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cliente">Copia cliente</SelectItem>
                        <SelectItem value="archivio">Copia archivio</SelectItem>
                        <SelectItem value="commerciale">Copia commerciale</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground mt-1">Intestazione visibile nel PDF.</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
          ) : (
            <Card>
              <CardContent className="p-4 flex items-start gap-3 text-sm text-muted-foreground">
                <Lock className="h-4 w-4 mt-0.5 shrink-0" />
                <div>
                  Le impostazioni di generazione PDF sono gestite dall'amministratore. I valori
                  correnti verranno applicati automaticamente al salvataggio.
                </div>
              </CardContent>
            </Card>
          )}

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

          {renderUrl && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  Render AI allegato
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-start gap-4">
                  <img
                    src={renderUrl}
                    alt="Anteprima render AI allegato al preventivo"
                    loading="lazy"
                    className="w-40 h-28 object-cover rounded-lg border shrink-0"
                  />
                  <div className="flex-1 min-w-0 space-y-2">
                    <p className="text-sm text-muted-foreground">
                      Il PDF del preventivo includerà una pagina finale
                      "Anteprima render AI" con questa immagine e il
                      disclaimer di legge.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setRenderUrl(null);
                        setRenderSessionId(null);
                      }}
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      Rimuovi dal preventivo
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ── STEP 3: Riepilogo ── */}
      {step === 3 && (
        <QuoteCard
          title="Riepilogo Preventivo"
          icon={<FileCheck className="h-4 w-4" />}
        >
          <div className="space-y-6">
            {/* Client summary */}
            <div>
              <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1.5">
                <User className="h-3.5 w-3.5 text-orange-500" /> Cliente
              </h4>
              <div className="grid grid-cols-2 gap-2 text-sm rounded-lg border border-slate-200 bg-slate-50/50 p-3">
                <div>
                  <span className="text-slate-500">Nome:</span>{" "}
                  <span className="font-medium">{clientName || "—"}</span>
                </div>
                <div>
                  <span className="text-slate-500">Email:</span>{" "}
                  <span className="font-medium">{clientEmail || "—"}</span>
                </div>
                <div>
                  <span className="text-slate-500">Azienda:</span>{" "}
                  <span className="font-medium">{clientCompany || "—"}</span>
                </div>
                <div>
                  <span className="text-slate-500">Telefono:</span>{" "}
                  <span className="font-medium">{clientPhone || "—"}</span>
                </div>
                {tipoLavoro && (
                  <div className="col-span-2">
                    <span className="text-slate-500">Tipo di lavoro:</span>{" "}
                    <span className="font-medium">{tipoLavoro}</span>
                  </div>
                )}
                {indirizzoLavori && (
                  <div className="col-span-2">
                    <span className="text-slate-500">Indirizzo lavori:</span>{" "}
                    <span className="font-medium">{indirizzoLavori}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Items summary */}
            <div>
              <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1.5">
                <Package className="h-3.5 w-3.5 text-orange-500" /> Prodotti ({items.length})
              </h4>
              {items.length > 0 ? (
                <>
                  {/* Desktop: tabella a 4 colonne */}
                  <div className="hidden md:block">
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
                  </div>

                  {/* Mobile: card per riga (niente tabella schiacciata) */}
                  <div className="md:hidden space-y-2">
                    {items.map((it) => (
                      <div key={it.id} className="rounded-lg border border-slate-200 bg-white p-3">
                        <div className="flex items-start justify-between gap-3">
                          <p className="min-w-0 font-medium text-sm leading-snug">
                            {it.name || "—"}
                            {it.is_optional && (
                              <Badge variant="outline" className="ml-1.5 text-[10px]">
                                Opzionale
                              </Badge>
                            )}
                          </p>
                          <p className="shrink-0 font-semibold text-sm tabular-nums text-slate-900">
                            {formatCurrency(it.quantity * it.unit_price * (1 - it.discount_percent / 100))}
                          </p>
                        </div>
                        <div className="mt-1.5 text-xs text-muted-foreground tabular-nums">
                          {it.quantity} × {formatCurrency(it.unit_price)}
                          {it.discount_percent > 0 ? ` · −${it.discount_percent}%` : ""}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Nessun prodotto</p>
              )}
            </div>

            {/* Totals (replica look hero FV) */}
            <div className="flex justify-end">
              <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-4 space-y-1.5 text-sm shadow-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Subtotale</span>
                  <span className="font-medium tabular-nums">{formatCurrency(subtotal)}</span>
                </div>
                {discountPercent > 0 && (
                  <div className="flex justify-between text-orange-600">
                    <span>Sconto {discountPercent}%</span>
                    <span className="tabular-nums">-{formatCurrency(discountAmt)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-slate-500">IVA</span>
                  <span className="font-medium tabular-nums">{formatCurrency(vatAmount)}</span>
                </div>
                <div className="border-t border-slate-200 my-2" />
                <div className="flex justify-between items-center font-bold">
                  <span className="text-base">Totale</span>
                  <span className="text-2xl tabular-nums text-orange-600">{formatCurrency(total)}</span>
                </div>
              </div>
            </div>

            {/* #40 Governance — avviso NON bloccante doppia approvazione */}
            {approvazioneEsito?.richiedeApprovazione && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" />
                <div>
                  <p className="font-medium">Richiede doppia approvazione</p>
                  <p className="text-xs mt-0.5">
                    {approvazioneEsito.motivo} Puoi comunque salvare e inviare: è un controllo di
                    governance, non un blocco.
                  </p>
                </div>
              </div>
            )}

            {/* Admin cost block — legacy (vedi /margini) */}
            {showInlineMargins && totaliPro.costo_totale > 0 && (
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
                    const margine_euro = round2(ricavo - costo - overhead);
                    const margine_pct = ricavo > 0 ? round2((margine_euro / ricavo) * 100) : 0;
                    const labels: Record<string, string> = { prodotto: "Prodotti", posa: "Posa", trasporto: "Trasporto", smaltimento: "Smaltimento", nolo: "Nolo" };
                    // `margine_euro` consumato solo per il calcolo di `margine_pct`; la UI mostra ricavo + semaforo
                    return [{ cat, label: labels[cat], ricavo, margine_pct }];
                  });
                  if (catRows.length < 2) return null;
                  return (
                    <div className="border-t pt-2 space-y-1">
                      <p className="text-xs font-medium text-blue-800">Margine per categoria</p>
                      {catRows.map(({ cat, label, ricavo, margine_pct }) => (
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

            {/* FASE 11 Serramentisti — Margine Lordo Atteso (solo admin) — legacy (vedi /margini) */}
            {showInlineMargins && margineAtteso.ricavo_netto > 0 && (
              <div className="border rounded-lg p-4 bg-emerald-50/50 space-y-3 text-sm">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <h3 className="font-semibold text-sm flex items-center gap-2 text-emerald-900">
                    <Wallet className="h-4 w-4" />
                    Margine lordo atteso
                  </h3>
                  <div className="flex items-center gap-2">
                    <Label
                      htmlFor="provvigione-pct"
                      className="text-xs text-muted-foreground whitespace-nowrap flex items-center gap-1"
                    >
                      <Percent className="h-3 w-3" />
                      Provvigione venditore
                    </Label>
                    <Input
                      id="provvigione-pct"
                      type="number"
                      min={0}
                      max={100}
                      step={0.5}
                      value={provvigionePct}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        setProvvigionePct(
                          Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : 0,
                        );
                      }}
                      className="w-20 h-8 text-right text-xs"
                      aria-label="Percentuale provvigione commerciale"
                    />
                    <span className="text-xs text-muted-foreground">%</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  <span className="text-muted-foreground">Ricavo netto (IVA esclusa)</span>
                  <span className="text-right font-medium">
                    {formatCurrency(margineAtteso.ricavo_netto)}
                  </span>

                  {margineAtteso.costo_materiali > 0 && (
                    <>
                      <span className="text-muted-foreground">− Costo materiali</span>
                      <span className="text-right text-destructive">
                        -{formatCurrency(margineAtteso.costo_materiali)}
                      </span>
                    </>
                  )}
                  {margineAtteso.costo_manodopera > 0 && (
                    <>
                      <span className="text-muted-foreground">− Costo manodopera/posa</span>
                      <span className="text-right text-destructive">
                        -{formatCurrency(margineAtteso.costo_manodopera)}
                      </span>
                    </>
                  )}
                  {margineAtteso.costo_altri > 0 && (
                    <>
                      <span className="text-muted-foreground">
                        − Trasporto / smaltimento / nolo
                      </span>
                      <span className="text-right text-destructive">
                        -{formatCurrency(margineAtteso.costo_altri)}
                      </span>
                    </>
                  )}

                  {margineAtteso.overhead_euro > 0 && (
                    <>
                      <span className="text-muted-foreground">
                        − Overhead aziendale ({impostazioni.overhead_percentuale ?? 0}%)
                      </span>
                      <span className="text-right text-destructive">
                        -{formatCurrency(margineAtteso.overhead_euro)}
                      </span>
                    </>
                  )}

                  {margineAtteso.provvigione_euro > 0 && (
                    <>
                      <span className="text-muted-foreground">
                        − Provvigione commerciale ({provvigionePct}%)
                      </span>
                      <span className="text-right text-destructive">
                        -{formatCurrency(margineAtteso.provvigione_euro)}
                      </span>
                    </>
                  )}

                  <hr className="col-span-2 my-1" />

                  <span className="font-semibold text-emerald-900">= Margine atteso</span>
                  <span className="text-right font-semibold text-emerald-900 flex justify-end gap-2">
                    {formatCurrency(margineAtteso.margine_atteso_euro)}
                    <MargineSemaforo
                      pct={margineAtteso.margine_atteso_pct}
                      sogliaMin={impostazioni.margine_minimo_percentuale ?? 15}
                      target={impostazioni.margine_target_percentuale ?? 25}
                    />
                  </span>
                </div>

                <p className="text-[11px] text-muted-foreground border-t pt-2 leading-relaxed">
                  Proiezione pre-ordine. IVA esclusa (passthrough). Non viene
                  persistito in DB: serve solo come stima al venditore.
                </p>
              </div>
            )}

            {/* Documents */}
            {/* Render AI allegati */}
            <QuoteRenderPicker
              contactId={contactId}
              selectedRenderIds={selectedRenders.map(r => r.id)}
              onSelectionChange={(renders) => setSelectedRenders(renders)}
            />

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
                          logoSrc={templateAssetUrl(selectedTemplate?.logo_url)}
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
                        logoSrc={templateAssetUrl(effectiveTemplate.logo_url)}
                        scale={0.25}
                      />
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </QuoteCard>
      )}

      {/* ── Pannello Finanziamento (Step 3 — Riepilogo) ──────────────────
          Mostrato dopo i totali del preventivo. Toggle off di default per
          backward-compat. Quando attivo, calcola la rata reale dalle
          tabelle finanziarie configurate (eic_tabelle_finanziamento). */}
      {step === 3 && (
        <div className="mt-4">
          <QuoteFinancingPanel
            quoteTotal={total}
            value={financingProposal}
            onChange={setFinancingProposal}
          />
        </div>
      )}

      {/* Sticky action bar (replica FvFooter) */}
      {/* md:pr-36 riserva lo spazio del FAB Silvio (fixed bottom-6 right-6, z-40):
          senza, il pulsante primario (Avanti/Salva) finiva SOTTO il FAB e il
          click sul 50-80% del CTA apriva Silvio invece di salvare. Su mobile il
          FAB desktop è hidden, quindi il padding è solo md+. */}
      {/* bottom-[84px] su mobile: la bottom-nav mobile (MobileBottomNav, pill
          flottante 80px, md:hidden, z-40) copriva la parte bassa dell'action
          bar — incluso il CTA "Avanti/Salva" → non tappabile su telefono. Da md
          in su la nav non c'è e l'action bar torna a bottom-0. */}
      <div className="fixed bottom-[84px] md:bottom-0 left-0 right-0 lg:left-[280px] z-30 bg-white/95 backdrop-blur-md border-t border-slate-200 shadow-[0_-4px_12px_rgba(15,23,42,0.06)]">
        <div className="max-w-[1600px] mx-auto px-4 md:pr-36 py-2.5 sm:py-3 flex items-center justify-between gap-2 sm:gap-3">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            {/* Stato salvataggio: solo da sm (su mobile è rumore, sotto c'è il totale) */}
            <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-500">
              {saving ? (
                <span className="flex items-center gap-1.5 text-blue-600 font-medium">
                  <Loader2 className="h-3 w-3 animate-spin" /> Salvataggio…
                </span>
              ) : autosaveFailed ? (
                <span className="flex items-center gap-1.5 text-red-600 font-medium">
                  <span className="w-2 h-2 rounded-full bg-red-500" /> Errore salvataggio
                </span>
              ) : isEdit ? (
                <span className="flex items-center gap-1.5 text-emerald-600 font-medium">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  Salvataggio automatico
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-slate-400">
                  <span className="w-2 h-2 rounded-full bg-slate-300" /> Pronto
                </span>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setStep(Math.max(0, step - 1))}
              disabled={step === 0}
              className="h-9 shrink-0"
            >
              <ArrowLeft className="h-4 w-4 mr-1.5" />
              Indietro
            </Button>
          </div>

          {/* Totale live per mobile (desktop è nell'header): compatto, non spinge il wrap */}
          {total > 0 && (
            <div className="md:hidden flex items-center shrink-0 text-xs">
              <span className="font-bold text-orange-600 tabular-nums text-sm">
                {formatCurrency(total)}
              </span>
            </div>
          )}

          <div className="flex gap-2 items-center shrink-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleSave("bozza")}
              disabled={saving}
              className="h-9 text-slate-600"
              aria-label="Salva bozza"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 sm:mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 sm:mr-2" />
              )}
              <span className="hidden sm:inline">Bozza</span>
            </Button>
            {step < STEPS.length - 1 ? (
              <button
                type="button"
                onClick={handleNext}
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-3.5 sm:px-5 py-2 text-sm font-bold rounded-lg text-white transition-all bg-gradient-to-br from-orange-500 to-amber-400 shadow-[0_4px_12px_rgba(249,115,22,0.3)] hover:-translate-y-px hover:shadow-[0_6px_16px_rgba(249,115,22,0.4)] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 h-9"
              >
                Avanti<span className="hidden sm:inline"> · {STEPS[step + 1]?.label}</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleSave("bozza")}
                disabled={saving || !clientName}
                className="inline-flex items-center gap-1.5 px-3.5 sm:px-5 py-2 text-sm font-bold rounded-lg text-white transition-all bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-[0_4px_12px_rgba(16,185,129,0.3)] hover:-translate-y-px hover:shadow-[0_6px_16px_rgba(16,185,129,0.4)] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 h-9"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FileCheck className="h-4 w-4" />
                )}
                <span className="hidden sm:inline">Salva preventivo</span>
                <span className="sm:hidden">Salva</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Dialogs ── */}
      <ProductSearchDialog
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        articoli={articoli}
        categorie={categorie}
        calcolaPrezzoProdotto={calcolaPrezzoProdotto}
        onConfirm={addProductFromCatalog}
      />

      {smaltimentoAsk && (
        <Dialog open={true} onOpenChange={() => setSmaltimentoAsk(null)}>
          <DialogContent className="max-w-sm max-h-[90vh] overflow-y-auto">
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

      {/* FASE 10.4: Apply bundle dialog (famiglie + prodotti + tariffe) */}
      <ApplyBundleDialog
        open={bundleOpen}
        onClose={() => setBundleOpen(false)}
        currentSortOrder={items.length}
        tariffe={tariffe}
        onAddItems={(newItems) => {
          setItems((prev) => {
            const base = [...prev];
            newItems.forEach((item, idx) => {
              base.push({ ...item, sort_order: base.length + idx });
            });
            return base;
          });
        }}
      />


      {/* Sprint A — Preventivatore Unificato: dialog 3-stadi dietro feature flag. */}
      {preventivatoreUnifiedOn && (
        <AddItemDialog
          open={addItemOpen}
          onClose={() => setAddItemOpen(false)}
          tariffe={tariffe}
          currentSortOrder={items.length}
          onAddItems={(configured: ConfiguredItem[]) => {
            // I ConfiguredItem portano già `client_temp_id`/`parent_temp_id`
            // nel loro `quote_item`: li preserviamo as-is in `items` per poi
            // farne il mapping in SAVE (Step 9 — persist `parent_item_id`).
            // Qui ricalcoliamo solo il sort_order in base alla lunghezza
            // corrente, così evitiamo collisioni se il dialog è stato aperto
            // quando `items.length` era diversa.
            setItems((prev) => {
              const base = [...prev];
              configured.forEach((c, idx) => {
                base.push({ ...c.quote_item, sort_order: base.length + idx });
              });
              return base;
            });
          }}
          onAddFreeLine={() => addItem("product")}
          onAddDiscount={() => addItemPro("sconto")}
          onAddSubtotal={() => addItemPro("subtotale")}
        />
      )}
    </div>
  );
}
