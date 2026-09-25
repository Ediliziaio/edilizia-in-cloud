import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useNavigate, useParams, useSearchParams, Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { TablesUpdate, Json } from "@/integrations/supabase/types";
import { filtriRicercaContatti } from "@/lib/ricerca/ricercaContatti";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/formatters";
import { esitoUpdateConGuardia, isConflittoModifica } from "@/lib/concorrenza";
import { queryKeys } from "@/lib/queryKeys";
import { useQuoteTemplates } from "@/hooks/useQuoteTemplates";
import { useGovernanceThresholds } from "@/hooks/useGovernanceThresholds";
import { valutaApprovazionePreventivo } from "@/lib/governance/thresholds";
import {
  useQuoteFormHydration,
  type ExistingQuoteForHydration,
} from "@/hooks/useQuoteFormHydration";
import { QuoteLivePreviewPanel } from "@/components/quotes/QuoteLivePreviewPanel";
import { ScontoGlobaleField } from "@/components/preventivi/ScontoGlobaleField";
import { QuoteTemplatePreview } from "@/components/quotes/QuoteTemplatePreview";
import { resolveQuoteTemplatePreview } from "@/lib/quoteTemplatePreview";
import AIQuotePanel from "@/components/quotes/AIQuotePanel";
import { useListinoCliente } from "@/hooks/useListinoCliente";
import { QuoteAdvisorPanel } from "@/components/quotes/QuoteAdvisorPanel";
import { QuoteRenderPicker } from "@/components/render/QuoteRenderPicker";
import type { QuoteTemplateLayout } from "@/types/quoteTemplate";
import type { QuoteItemPro } from "@/types/quoteItem";
import {
  usePreventivoCosti,
  calcolaTotaliPreventivo,
  espondiBundle,
  useScontiQuantita,
  useBundleProdotti,
  calcolaScontoQuantita,
} from "@/hooks/usePreventivoCosti";
import type { ArticlePro, TariffaPro, BundleConVoci } from "@/hooks/usePreventivoCosti";
import ApplyBundleDialog from "@/components/marketing/preventivi/ApplyBundleDialog";
import { TariffePickerDialog } from "@/components/marketing/preventivi/TariffePickerDialog";
import { AddItemDialog } from "@/components/marketing/preventivi/AddItemDialog";
import { RilievoPosizioniDialog } from "@/components/marketing/preventivi/RilievoPosizioniDialog";
import { QuotePaymentTermsCard } from "@/components/marketing/preventivi/QuotePaymentTermsCard";
import { BonusLinesCard } from "@/components/orders/BonusLinesCard";
import { useBonusFiscaliFlags } from "@/hooks/useBonusFiscaliFlags";
import { type BonusLine, serializeBonusLines } from "@/lib/orders/bonusFiscali";
import { type QuotePaymentPhase, recalcPhaseAmounts, paymentPlanError } from "@/lib/preventivi/paymentTerms";
import { readQuoteDraft, serializeQuoteDraft, type QuoteDraft } from "@/lib/preventivi/quoteDraft";
import { assertSavedQuoteAmounts } from "@/lib/preventivi/quoteSaveValidation";
import { fetchQuotePdf } from "@/lib/preventivi/quotePdfDownload";
import { quoteWriteVersion } from "@/lib/preventivi/quoteWriteVersion";
// Refactor 2026-05-10: ProductSearchDialog estratto in file separato (-316 righe)
import { ProductSearchDialog } from "@/components/marketing/preventivi/ProductSearchDialog";
import { QuoteDiscountControl } from "@/components/preventivi/QuoteDiscountControl";
import { PrezzoPreventivoAMano } from "@/components/preventivi/PrezzoPreventivoAMano";
import { SceltaRenderDialog, type RenderScelto } from "@/components/preventivi/SceltaRenderDialog";
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
  DialogDescription,
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
  Eye,
  User,
  Package,
  FileStack,
  Palette,
  ChevronDown,
  MoreVertical,
  StickyNote,
  Ruler,
  Tag,
  Hash,
  Truck,
  Layers,
  TrendingUp,
  AlertTriangle,
  Settings2,
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

const CONTACT_SELECT =
  "id, first_name, last_name, email, phone, company_name, address, city, province, postal_code, country, fiscal_code, vat_number";

function ContactCombobox({
  contacts,
  companyId,
  value,
  onChange,
}: {
  contacts: ContactOption[];
  companyId: string | null | undefined;
  value: string | null;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [ricerca, setRicerca] = useState("");
  const [ricercaDebounced, setRicercaDebounced] = useState("");
  useEffect(() => {
    const t = window.setTimeout(() => setRicercaDebounced(ricerca.trim()), 250);
    return () => window.clearTimeout(t);
  }, [ricerca]);

  // Prima caricava TUTTI i contatti dell'azienda e li filtrava «fuzzy» nel
  // browser: scrivendo «Nicola» uscivano anche Silvia e Sara, e su un CRM
  // grande la lista pesava. Ora cerca sul server per nome, azienda, email.
  const { data: risultati = [], isFetching: cercando } = useQuery({
    queryKey: ["marketing-contacts-cerca", companyId, ricercaDebounced],
    enabled: !!companyId && ricercaDebounced.length >= 2,
    queryFn: async () => {
      let query = supabase
        .from("marketing_contacts")
        .select(CONTACT_SELECT)
        .eq("company_id", companyId!)
        .is("deleted_at", null);
      for (const filtro of filtriRicercaContatti(ricercaDebounced)) query = query.or(filtro);
      const { data, error } = await query.order("last_name").limit(30);
      if (error) throw error;
      return (data ?? []) as ContactOption[];
    },
  });

  // Il contatto scelto potrebbe non essere nella lista corta (es. in modifica):
  // lo si carica a parte per mostrarne il nome.
  const inLista = [...contacts, ...risultati].find((c) => c.id === value);
  const { data: scelto } = useQuery({
    queryKey: ["marketing-contact-scelto", value],
    enabled: !!value && !inLista,
    queryFn: async () => {
      const { data } = await supabase.from("marketing_contacts").select(CONTACT_SELECT).eq("id", value!).maybeSingle();
      return (data as ContactOption | null) ?? null;
    },
  });
  const selected = inLista ?? scelto ?? undefined;
  const lista = ricercaDebounced.length >= 2 ? risultati : contacts;

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
        <Command shouldFilter={false}>
          <CommandInput placeholder="Cerca per nome, azienda, email..." value={ricerca} onValueChange={setRicerca} />
          <CommandList>
            <CommandEmpty>
              {cercando ? "Cerco…" : ricercaDebounced.length >= 2 ? "Nessun contatto trovato" : "Scrivi almeno due lettere per cercare"}
            </CommandEmpty>
            <CommandGroup>
              {lista.map((c) => (
                <CommandItem
                  key={c.id}
                  value={c.id}
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
  // Telefono (<768px): la scelta del modello PDF compare solo se ce n'è più d'uno.
  const isMobile = useIsMobile();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const isEdit = !!id;
  const { effectiveCompany, user } = useAuth();
  const permissions = usePermissions();
  const companyId = effectiveCompany?.id;
  const { bonusMultipli: bonusMultipliEnabled } = useBonusFiscaliFlags();
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
  // Ripartizione bonus decisa già in preventivo: la commessa la eredita.
  const [bonusLines, setBonusLines] = useState<BonusLine[]>([]);
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
  // Prezzo scritto a mano (21/09/2026): sostituisce la somma delle righe per
  // chi usa il builder per il documento ma non carica il listino. L'IVA qui è
  // per riga (aliquote miste): serve un'aliquota esplicita solo per questo caso.
  const [prezzoManuale, setPrezzoManuale] = useState<number | null>(null);
  const [prezzoManualeIvaPct, setPrezzoManualeIvaPct] = useState<number | null>(null);
  // FASE 11 Serramentisti — Margine Lordo Atteso:
  // provvigione commerciale (%) da sottrarre al margine in preview.
  // Sessione-only, non persistita in DB (preview calcolo per il venditore).
  const [provvigionePct, setProvvigionePct] = useState<number>(0);

  // P03: Search dialog
  const [searchOpen, setSearchOpen] = useState(false);
  const [smaltimentoAsk, setSmaltimentoAsk] = useState<{ parentIdx: number } | null>(null);

  // IMP09: Bundle dialog
  const [bundleOpen, setBundleOpen] = useState(false);
  const [tariffePickerOpen, setTariffePickerOpen] = useState(false);
  // Anteprima del PDF VERO (edge generate-quote-pdf), non del mock statico.
  const [anteprimaUrl, setAnteprimaUrl] = useState<string | null>(null);
  const [anteprimaLoading, setAnteprimaLoading] = useState(false);
  // Dopo l'anteprima di un preventivo NUOVO si passa in modifica: un secondo
  // salvataggio dalla rotta /nuovo creerebbe un doppione.
  const [pendingEditNavId, setPendingEditNavId] = useState<string | null>(null);
  const [partialQuoteId, setPartialQuoteId] = useState<string | null>(null);
  const newQuoteCompletedRef = useRef(false);
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
  // Foto di partenza del render scelto: serve al confronto prima/dopo, che è
  // la cosa che convince il cliente più del render da solo.
  const [renderOriginalUrl, setRenderOriginalUrl] = useState<string | null>(null);
  const [sceltaRenderOpen, setSceltaRenderOpen] = useState(false);

  // Riaprendo un preventivo salvato si conosce la sessione del render ma non la
  // foto di partenza: si recupera, così il confronto prima/dopo c'è anche qui e
  // non solo appena scelto.
  const { data: fotoPartenza } = useQuery({
    queryKey: ["render-foto-partenza", renderSessionId],
    enabled: !!renderSessionId && !renderOriginalUrl,
    staleTime: 60 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase
        .from("render_sessions")
        .select("original_photo_url")
        .eq("id", renderSessionId!)
        .maybeSingle();
      return (data?.original_photo_url as string | null) ?? null;
    },
  });
  const fotoPrima = renderOriginalUrl ?? fotoPartenza ?? null;
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
  // Il preventivatore standard deve proporre solo offerte complete. I template
  // di tipo copertina/condizioni/prodotto/sezione sono componenti avanzati e
  // non devono poter diventare, per errore, l'aspetto dell'intero PDF.
  const offerTemplates = useMemo(
    () => templates.filter((template) => ((template.kind as string | undefined) ?? "offerta") === "offerta"),
    [templates],
  );
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  // Mobile: lo step Cliente aveva 18 campi in colonna. Pagamento e dettagli lavoro
  // restano disponibili, ma chiusi finché non servono.
  const [dettagliLavoroAperti, setDettagliLavoroAperti] = useState(false);

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

  const effectiveSelectedTemplateId = offerTemplates.some((template) => template.id === selectedTemplateId)
    ? selectedTemplateId
    : (defaultTemplate?.id ?? offerTemplates[0]?.id ?? null);
  const selectedTemplate =
    offerTemplates.find((t) => t.id === effectiveSelectedTemplateId) ?? defaultTemplate;
  const [layoutOverride, setLayoutOverride] = useState<QuoteTemplateLayout | null>(null);
  const effectiveTemplate = resolveQuoteTemplatePreview(layoutOverride
    ? { ...selectedTemplate, layout: layoutOverride }
    : (selectedTemplate ?? {}), templates);

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
  // Il rilievo per posizioni ha senso solo per chi vende serramenti.
  const haSerramenti = useMemo(
    () => articleFamilies.some((f) => (f.vertical ?? "").startsWith("serrament")),
    [articleFamilies],
  );
  const [rilievoOpen, setRilievoOpen] = useState(false);

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

  // Applicare i default una sola volta: un refetch non deve cancellare le scelte.
  const pdfDefaultsAppliedRef = useRef(false);
  useEffect(() => {
    if (!pdfDefaultsAppliedRef.current && impostazioni && Object.keys(impostazioni).length > 0 && !isEdit) {
      pdfDefaultsAppliedRef.current = true;
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
        .select(CONTACT_SELECT)
        .eq("company_id", companyId!)
        .is("deleted_at", null)
        // Lista d'apertura: i contatti toccati di recente. Il resto si trova
        // scrivendo nel campo (ricerca sul server).
        .order("last_activity_at", { ascending: false, nullsFirst: false })
        .limit(40);
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
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
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

  const { data: existingItems = [], isSuccess: existingItemsLoaded } = useQuery({
    queryKey: queryKeys.quotes.items(id),
    enabled: isEdit,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
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

  const { data: existingAttachments = [], isSuccess: existingAttachmentsLoaded } = useQuery({
    queryKey: queryKeys.quotes.attachments(id),
    enabled: isEdit,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quote_pdf_attachments")
        .select("material_id")
        .eq("quote_id", id!)
        .order("sort_order");
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
    setPrezzoManuale,
    setPrezzoManualeIvaPct,
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
    setLayoutOverride: (value) => setLayoutOverride(
      value === "classic" || value === "modern" || value === "minimal" || value === "bold" ? value : null,
    ),
    setPaymentMethod,
    setPaymentPhases,
    setBonusLines,
  });

  /**
   * La versione del preventivo che questa pagina ha davanti.
   *
   * Serve a non sovrascrivere il lavoro di un collega: due venditori sullo
   * stesso preventivo è la norma, non un caso limite. Si fissa al primo
   * caricamento e si aggiorna a ogni salvataggio riuscito.
   */
  const versioneCaricataRef = useRef<string | null>(null);

  // Preventivi V2 — hydrate salesperson + approval status (fuori dal hook legacy)
  useEffect(() => {
    if (!existingQuote) return;
    if (versioneCaricataRef.current === null) {
      versioneCaricataRef.current = (existingQuote as { updated_at?: string | null }).updated_at ?? null;
    }
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
        existingItems.map((i): QuoteItemPro => {
          return {
            id: i.id,
            item_type: i.item_type === "service" ? "service" : "product",
            item_category: (i.item_category || "prodotto") as QuoteItemPro["item_category"],
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
            // DELETE cascade + QUANTITY sync anche in modalità edit. Al
            // salvataggio la RPC ricostruisce i legami SOLO dai temp id: dalle
            // righe rilette si rifanno dagli id, o la posa perdeva il prodotto.
            parent_item_id: (i as { parent_item_id?: string | null }).parent_item_id ?? null,
            client_temp_id: i.id,
            parent_temp_id: (i as { parent_item_id?: string | null }).parent_item_id ?? null,
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

  // ── Cliente passato dalla scheda cliente (?customer_id) ───────────────────
  // "Nuovo preventivo" dalla scheda cliente passava l'identificativo del cliente
  // e questa pagina leggeva solo `contact_id`: si arrivava al preventivo vuoto e
  // si ridigitava il cliente da cui si era appena usciti.
  // Un cliente d'anagrafica può avere un contatto marketing collegato
  // (`profiles.marketing_contact_id`) oppure no: nel primo caso selezioniamo
  // quello, nel secondo compiliamo i campi cliente coi suoi dati.
  const customerIdDaUrl = searchParams.get("customer_id");
  const { data: clienteDaUrl } = useQuery({
    queryKey: ["quote-prefill-customer", customerIdDaUrl, companyId],
    enabled: !isEdit && !!customerIdDaUrl && !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select(
          "id, first_name, last_name, email, phone, business_name, address, city, province, postal_code, fiscal_code, vat_number, marketing_contact_id"
        )
        .eq("id", customerIdDaUrl!)
        .eq("company_id", companyId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Auto-select contact from URL param
  const contattoDaUrlApplicatoRef = useRef(false);
  useEffect(() => {
    if (!isEdit && companyId && !contactId && !contattoDaUrlApplicatoRef.current) {
      const urlContactId = searchParams.get("contact_id");
      if (urlContactId) {
        contattoDaUrlApplicatoRef.current = true;
        void handleContactSelect(urlContactId);
      }
    }
    // Intenzionale: pre-compila contatto da `?contact_id=...` SOLO al primo render con
    // contacts caricati. `contactId` e `handleContactSelect` fuori dalle deps perché
    // includere `contactId` ri-triggererebbe ad ogni selezione, e `handleContactSelect`
    // è definita dopo l'effect (hoisting function → stabile per render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, isEdit, searchParams]);

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
  const handleContactSelect = async (cId: string) => {
    setContactId(cId);
    let c: ContactOption | undefined = contacts.find((x) => x.id === cId);
    if (!c && companyId) {
      const { data } = await supabase
        .from("marketing_contacts")
        .select(CONTACT_SELECT)
        .eq("id", cId)
        .eq("company_id", companyId)
        .maybeSingle();
      c = (data as ContactOption | null) ?? undefined;
    }
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

  const clienteDaUrlApplicatoRef = useRef(false);
  useEffect(() => {
    if (isEdit || !clienteDaUrl || clienteDaUrlApplicatoRef.current) return;
    if (contactId) return; // scelta già fatta: non la sovrascriviamo
    const collegato = clienteDaUrl.marketing_contact_id;
    if (collegato) {
      clienteDaUrlApplicatoRef.current = true;
      void handleContactSelect(collegato);
      return;
    }
    // Nessun contatto collegato: i dati del cliente riempiono comunque il preventivo.
    clienteDaUrlApplicatoRef.current = true;
    const nome = `${clienteDaUrl.first_name || ""} ${clienteDaUrl.last_name || ""}`.trim();
    if (nome) setClientName(nome);
    if (clienteDaUrl.email) setClientEmail(clienteDaUrl.email);
    if (clienteDaUrl.phone) setClientPhone(clienteDaUrl.phone);
    if (clienteDaUrl.business_name) setClientCompany(clienteDaUrl.business_name);
    if (clienteDaUrl.fiscal_code) setClientFiscalCode(clienteDaUrl.fiscal_code);
    if (clienteDaUrl.vat_number) setClientVatNumber(clienteDaUrl.vat_number);
    const indirizzo = [clienteDaUrl.address, clienteDaUrl.postal_code, clienteDaUrl.city, clienteDaUrl.province]
      .filter(Boolean)
      .join(", ");
    if (indirizzo) setClientAddress(indirizzo);
    // `handleContactSelect` è dichiarata più sotto nel corpo: l'effect gira dopo
    // il render, quindi al momento della chiamata esiste.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteDaUrl, contacts, contactId, isEdit]);


  // Items management
  // IVA per le righe nuove: quella più usata nelle righe già presenti (un
  // preventivo al 10% non deve nascere con una riga al 22% in mezzo); 22 solo
  // se il preventivo è ancora vuoto.
  const ivaPredefinita = (): number => {
    const conteggio = new Map<number, number>();
    for (const it of items) {
      if (["nota", "subtotale", "sconto"].includes(String(it.item_category))) continue;
      const iva = Number(it.vat_rate);
      if (!Number.isFinite(iva)) continue;
      conteggio.set(iva, (conteggio.get(iva) ?? 0) + 1);
    }
    let scelta = 22, max = 0;
    for (const [iva, n] of conteggio) if (n > max) { max = n; scelta = iva; }
    return scelta;
  };

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
        vat_rate: ivaPredefinita(),
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
        vat_rate: ivaPredefinita(),
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
      pianoInstallazione,
      kmCantiere,
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
        vat_rate: ivaPredefinita(),
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
        pianoInstallazione,
        kmCantiere,
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
          vat_rate: ivaPredefinita(),
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
      let vat_rate = ivaPredefinita();

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
          const calc = calcolaTariffaAutomatica(tar, qty, pianoInstallazione, kmCantiere);
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
          calcolaTariffaAutomatica(tariffa, qty, pianoInstallazione, kmCantiere);
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
          vat_rate: ivaPredefinita(),
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

  /**
   * La versione del preventivo dopo le scritture di questa pagina: righe (trigger
   * dei totali), commissioni e PDF cambiano updated_at. Senza rileggerla il
   * «Salva» successivo si fermava con «Qualcun altro ha salvato».
   */
  const rileggiVersione = useCallback(async (quoteId: string) => {
    const { data, error } = await supabase.from("quotes").select("updated_at").eq("id", quoteId).eq("company_id", companyId!).single();
    if (error) throw error;
    const versione = (data as { updated_at?: string | null } | null)?.updated_at;
    if (versione) versioneCaricataRef.current = versione;
  }, [companyId]);

  // Un solo percorso per salvataggio manuale e automatico.
  const saveInFlightRef = useRef(false);
  const [lastSavedHash, setLastSavedHash] = useState("");
  const [autosaveFailed, setAutosaveFailed] = useState(false);

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

  // Bozza completa: nessuna scrittura remota per un preventivo nuovo.
  const quoteDraftKey = companyId ? `quote-draft-${companyId}` : null;
  const [recoverableDraft, setRecoverableDraft] = useState<QuoteDraft | null>(null);
  const [localDraftFailed, setLocalDraftFailed] = useState(false);
  const [localDraftSaved, setLocalDraftSaved] = useState(false);
  const draftCheckedRef = useRef<string | null>(null);
  const draftReadFailedRef = useRef(false);
  const draftSnapshot: QuoteDraft = {
    partialQuoteId,
    step, contactId, clientName, clientEmail, clientPhone, clientCompany,
    clientAddress, clientFiscalCode, clientVatNumber, title, description, validityDays,
    notes, internalNotes, tipoLavoro, indirizzoLavori, pianoInstallazione, kmCantiere,
    salespersonId, sedeId, discountPercent, prezzoManuale, prezzoManualeIvaPct, provvigionePct,
    items, paymentMethod, paymentPhases, bonusLines, selectedRenders, selectedMaterials,
    renderUrl, renderSessionId, renderOriginalUrl, selectedTemplateId, layoutOverride, financingProposal,
    pdfPrezziRiga, pdfSoloTotale, pdfSconti, pdfImmagini, pdfSchedeTecniche, pdfFirma,
    pdfMisure, pdfAttributi, pdfNoteCliente, pdfCondizioni, pdfWatermarkText, pdfCopiaDestinatario,
  };
  const draftSerialized = JSON.stringify(draftSnapshot);

  useEffect(() => {
    if (isEdit || !quoteDraftKey || draftCheckedRef.current === quoteDraftKey) return;
    draftCheckedRef.current = quoteDraftKey;
    try {
      const raw = localStorage.getItem(quoteDraftKey);
      if (raw) setRecoverableDraft(readQuoteDraft(raw));
    } catch {
      draftReadFailedRef.current = true;
      setLocalDraftFailed(true);
      toast.error("Impossibile leggere la bozza locale", { description: "I dati non vengono cancellati. Conserva questa pagina aperta e salva il preventivo prima di uscire." });
    }
  }, [isEdit, quoteDraftKey]);

  const persistLocalDraft = useCallback(() => {
    if (isEdit || newQuoteCompletedRef.current || !quoteDraftKey || recoverableDraft || draftReadFailedRef.current || draftCheckedRef.current !== quoteDraftKey) return;
    const snapshot = JSON.parse(draftSerialized) as QuoteDraft;
    if (!snapshot.clientName?.trim() && !snapshot.items?.length && !snapshot.description && !snapshot.notes) return;
    try {
      localStorage.setItem(quoteDraftKey, serializeQuoteDraft(snapshot));
      setLocalDraftSaved(true);
      setLocalDraftFailed(false);
    } catch { setLocalDraftFailed(true); }
  }, [isEdit, quoteDraftKey, recoverableDraft, draftSerialized]);

  useEffect(() => {
    if (saving) return;
    const timer = setTimeout(persistLocalDraft, 500);
    window.addEventListener("pagehide", persistLocalDraft);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("pagehide", persistLocalDraft);
    };
  }, [persistLocalDraft, saving]);

  const clearQuoteDraft = useCallback(() => {
    if (!quoteDraftKey) return;
    try { localStorage.removeItem(quoteDraftKey); setLocalDraftSaved(false); }
    catch { setLocalDraftFailed(true); }
  }, [quoteDraftKey]);

  const restoreQuoteDraft = () => {
    const d = recoverableDraft;
    if (!d) return;
    if (d.pdfPrezziRiga !== undefined) pdfDefaultsAppliedRef.current = true;
    if (d.partialQuoteId !== undefined) setPartialQuoteId(d.partialQuoteId);
    if (d.step !== undefined) setStep(d.step);
    if (d.contactId !== undefined) setContactId(d.contactId);
    if (d.clientName !== undefined) setClientName(d.clientName);
    if (d.clientEmail !== undefined) setClientEmail(d.clientEmail);
    if (d.clientPhone !== undefined) setClientPhone(d.clientPhone);
    if (d.clientCompany !== undefined) setClientCompany(d.clientCompany);
    if (d.clientAddress !== undefined) setClientAddress(d.clientAddress);
    if (d.clientFiscalCode !== undefined) setClientFiscalCode(d.clientFiscalCode);
    if (d.clientVatNumber !== undefined) setClientVatNumber(d.clientVatNumber);
    if (d.title !== undefined) setTitle(d.title);
    if (d.description !== undefined) setDescription(d.description);
    if (d.validityDays !== undefined) setValidityDays(d.validityDays);
    if (d.notes !== undefined) setNotes(d.notes);
    if (d.internalNotes !== undefined) setInternalNotes(d.internalNotes);
    if (d.tipoLavoro !== undefined) setTipoLavoro(d.tipoLavoro);
    if (d.indirizzoLavori !== undefined) setIndirizzoLavori(d.indirizzoLavori);
    if (d.pianoInstallazione !== undefined) setPianoInstallazione(d.pianoInstallazione);
    if (d.kmCantiere !== undefined) setKmCantiere(d.kmCantiere);
    if (d.salespersonId !== undefined) setSalespersonId(d.salespersonId);
    if (d.sedeId !== undefined) setSedeId(d.sedeId);
    if (d.discountPercent !== undefined) setDiscountPercent(d.discountPercent);
    if (d.prezzoManuale !== undefined) setPrezzoManuale(d.prezzoManuale);
    if (d.prezzoManualeIvaPct !== undefined) setPrezzoManualeIvaPct(d.prezzoManualeIvaPct);
    if (d.provvigionePct !== undefined) setProvvigionePct(d.provvigionePct);
    if (d.items !== undefined) setItems(d.items);
    if (d.paymentMethod !== undefined) setPaymentMethod(d.paymentMethod);
    if (d.paymentPhases !== undefined) setPaymentPhases(d.paymentPhases);
    if (d.bonusLines !== undefined) setBonusLines(d.bonusLines);
    if (d.selectedRenders !== undefined) setSelectedRenders(d.selectedRenders);
    if (d.selectedMaterials !== undefined) setSelectedMaterials(d.selectedMaterials);
    if (d.renderUrl !== undefined) setRenderUrl(d.renderUrl);
    if (d.renderSessionId !== undefined) setRenderSessionId(d.renderSessionId);
    if (d.renderOriginalUrl !== undefined) setRenderOriginalUrl(d.renderOriginalUrl);
    if (d.selectedTemplateId !== undefined) setSelectedTemplateId(d.selectedTemplateId);
    if (d.layoutOverride !== undefined) setLayoutOverride(d.layoutOverride);
    if (d.financingProposal !== undefined) setFinancingProposal(d.financingProposal as FinancingProposal | null);
    if (d.pdfPrezziRiga !== undefined) setPdfPrezziRiga(d.pdfPrezziRiga);
    if (d.pdfSoloTotale !== undefined) setPdfSoloTotale(d.pdfSoloTotale);
    if (d.pdfSconti !== undefined) setPdfSconti(d.pdfSconti);
    if (d.pdfImmagini !== undefined) setPdfImmagini(d.pdfImmagini);
    if (d.pdfSchedeTecniche !== undefined) setPdfSchedeTecniche(d.pdfSchedeTecniche);
    if (d.pdfFirma !== undefined) setPdfFirma(d.pdfFirma);
    if (d.pdfMisure !== undefined) setPdfMisure(d.pdfMisure);
    if (d.pdfAttributi !== undefined) setPdfAttributi(d.pdfAttributi);
    if (d.pdfNoteCliente !== undefined) setPdfNoteCliente(d.pdfNoteCliente);
    if (d.pdfCondizioni !== undefined) setPdfCondizioni(d.pdfCondizioni);
    if (d.pdfWatermarkText !== undefined) setPdfWatermarkText(d.pdfWatermarkText);
    if (d.pdfCopiaDestinatario !== undefined) setPdfCopiaDestinatario(d.pdfCopiaDestinatario);
    setRecoverableDraft(null);
    toast.success("Bozza ripristinata", { description: "Ripresi anche modello, pagamenti e impostazioni PDF, se presenti nella bozza." });
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
          (i) => !["nota", "subtotale", "sconto"].includes(i.item_category)
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
    discountPercent,
    prezzoManuale,
    prezzoManualeIvaPct
  );
  const subtotal = totaliPro.subtotale;
  const discountAmt = Math.round((subtotal - totaliPro.subtotale_netto) * 100) / 100;
  // ⚠️ IVA: `totaliPro.iva_breakdown` è GIÀ al netto dello sconto globale
  // (calcolaTotaliPreventivo ritorna iva_breakdown_netto = iva × (1 - sconto%)).
  // Prima qui la si ri-moltiplicava per (1 - discountPercent/100) → IVA scontata
  // DUE volte (IVA e totale sottostimati, e persistiti a DB). Usare i valori
  // autoritativi della funzione: total = totaliPro.totale, vatAmount = total - netto.
  const total = totaliPro.totale;
  const vatAmount = Math.round((total - totaliPro.subtotale_netto) * 100) / 100;
  // La ripartizione bonus ragiona sull'IMPONIBILE (come orders.total_amount).
  // Le righe del preventivo possono avere aliquote diverse: qui serve solo una
  // media per stimare il lordo dei bonifici, non un dato fiscale.
  const imponibilePreventivo = totaliPro.subtotale_netto;
  const aliquotaMediaPreventivo =
    imponibilePreventivo > 0 ? ((total / imponibilePreventivo) - 1) * 100 : 22;

  // #40 Governance — valutazione (non bloccante) doppia approvazione sul netto.
  const approvazioneEsito = useMemo(
    () =>
      governanceCfg
        ? valutaApprovazionePreventivo(governanceCfg, totaliPro.subtotale_netto)
        : null,
    [governanceCfg, totaliPro.subtotale_netto],
  );

  // Save
  const handleSave = async (status: string = "bozza", opts?: { anteprima?: boolean; autosave?: boolean; complete?: boolean }) => {
    if (!companyId || !user) return;
    if (isEdit && (!existingQuote || !existingItemsLoaded || !existingAttachmentsLoaded)) {
      if (!opts?.autosave) toast.error("Caricamento incompleto", {
        description: "Attendi il caricamento di righe e allegati. Se il problema continua, ricarica la pagina prima di salvare.",
      });
      return;
    }
    if (!isEdit && (partialQuoteId || pendingEditNavId)) {
      toast.error("Questo preventivo è già stato creato", {
        description: "Apri la versione salvata per completarla senza creare un duplicato.",
        action: { label: "Apri preventivo", onClick: () => navigate(`/azienda/marketing/preventivi/${partialQuoteId || pendingEditNavId}`) },
      });
      return;
    }
    // P2 FIX: blocca double-click / submit concorrente.
    // Se c'è già un save in progress ignora chiamata duplicata per evitare
    // la race condition DELETE→INSERT che può perdere righe preventivo.
    if (saveInFlightRef.current) return;
    if (paymentPlanError(paymentPhases)) {
      toast.error(paymentPlanError(paymentPhases)!);
      return;
    }
    persistLocalDraft();
    saveInFlightRef.current = true;
    setSaving(true);
    try {
      // Linka all'opportunità se siamo arrivati con ?opportunity_id=…
      // così il preventivo appare anche nella tab Preventivi dell'opp.
      // In MODIFICA il campo NON si tocca: prima l'update scriveva null e
      // ogni salvataggio cancellava il legame col deal (0 preventivi
      // agganciati in tutto il DB, verificato 2026-08-21).
      const urlOpportunityId = searchParams.get("opportunity_id") || null;
      const quoteData: TablesUpdate<"quotes"> = {
        company_id: companyId,
        // Su un preventivo esistente lo stato non si tocca se non è una bozza: i
        // pulsanti salvano sempre «bozza», e da /modifica un preventivo inviato
        // o accettato tornava bozza.
        ...(isEdit && existingQuote?.status && existingQuote.status !== "bozza" ? {} : { status }),
        contact_id: contactId,
        ...(isEdit ? {} : { opportunity_id: urlOpportunityId }),
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
        payment_phases: paymentPhases.length ? recalcPhaseAmounts(paymentPhases, total).map(phase => ({ ...phase })) : null,
        bonus_lines: bonusLines.length ? serializeBonusLines(bonusLines) : null,
        validity_days: validityDays,
        discount_percent: discountPercent,
        prezzo_manuale: prezzoManuale,
        prezzo_manuale_iva_pct: prezzoManualeIvaPct,
        // L'autore resta chi l'ha creato: le notifiche di firma e scadenza vanno a lui.
        ...(isEdit ? {} : { created_by: user.id }),
        template_id: effectiveSelectedTemplateId || null,
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
        financing_calculation_json: financingProposal ? JSON.parse(JSON.stringify(financingProposal.calculation)) as Json : null,
      };

      let quoteId = id;

      // La RPC è atomica per le righe, NON per testata + allegati.
      // Controllare ogni risultato: nessun falso successo dopo errori parziali.
      const salvaRigheAtomiche = async (idPreventivo: string) => {
        {
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
          const { data: rpcData, error: rpcErr } = await supabase.rpc("save_quote_items_atomic", {
            p_quote_id: idPreventivo,
            p_company_id: companyId,
            p_items: payload,
          });
          if (rpcErr) throw rpcErr;
          versioneCaricataRef.current = await quoteWriteVersion(rpcData, async () => {
            const { data: written, error: versionError } = await supabase.from("quotes")
              .select("updated_at").eq("id", idPreventivo).eq("company_id", companyId).single();
            if (versionError) throw versionError;
            return written.updated_at;
          });
        }
      };

      if (isEdit) {
        // L'ordine conta: la testata si aggiorna PRIMA delle righe.
        // `salvaRigheAtomiche` cancella e riscrive tutte le righe, quindi
        // farlo per primo distruggeva il lavoro del collega anche quando poi
        // ci si accorgeva del conflitto. Se la guardia scatta qui, le sue
        // righe sono ancora al loro posto.
        const { data: righeTestata, error } = await supabase
          .from("quotes")
          .update(quoteData)
          .eq("id", id!)
          .eq("company_id", companyId)
          // Se un collega ha salvato mentre questa pagina era aperta,
          // `updated_at` non combacia più e la UPDATE tocca zero righe.
          .eq("updated_at", versioneCaricataRef.current ?? "")
          .select("updated_at");
        if (error) throw error;
        versioneCaricataRef.current = esitoUpdateConGuardia(
          righeTestata as Array<{ updated_at?: string | null }> | null,
          "preventivo",
        );
        await salvaRigheAtomiche(id!);
      } else {
        const { data: numData, error: numErr } = await supabase.rpc("generate_quote_number", {
          p_company_id: companyId,
        });
        // Il numero lo dà solo il database (contatore sotto lock + indice univoco).
        // Prima, se la RPC falliva, qui nasceva un «OFF-<anno>-001» a prescindere:
        // un doppione garantito. Meglio fermarsi e dirlo.
        if (numErr || !numData) throw new Error(numErr?.message || "Impossibile assegnare il numero al preventivo: riprova.");
        const { data, error } = await supabase
          .from("quotes")
          .insert({ ...quoteData, company_id: companyId, quote_number: numData, created_by: user.id })
          .select("id")
          .single();
        if (error) throw error;
        quoteId = data.id;
        setPartialQuoteId(quoteId!);
        try {
          await salvaRigheAtomiche(quoteId!);
        } catch (eRighe) {
          // Compensazione: la testata appena nata senza le sue righe sarebbe
          // un mezzo preventivo coi totali sbagliati — meglio nessuno.
          const { error: cleanupError } = await supabase.from("quotes").delete().eq("id", quoteId!).eq("company_id", companyId);
          if (cleanupError) {
            setPendingEditNavId(quoteId!);
            throw new Error("Salvataggio parziale: il preventivo è stato creato, ma le righe non sono state salvate. Aprilo dalla lista prima di riprovare.", { cause: eRighe });
          }
          setPartialQuoteId(null);
          throw eRighe;
        }
      }

      // Inserire i nuovi allegati prima di rimuovere i vecchi: un errore di
      // caricamento non deve cancellare quelli già collegati al preventivo.
      const { data: currentAttachments, error: attachmentsReadError } = await supabase
        .from("quote_pdf_attachments").select("material_id").eq("quote_id", quoteId!);
      if (attachmentsReadError) throw attachmentsReadError;
      const currentMaterialIds = new Set(currentAttachments.map((a) => a.material_id));
      const materialsToAdd = [...new Set(selectedMaterials)].filter((mId) => !currentMaterialIds.has(mId));
      if (materialsToAdd.length > 0) {
        const { error: attachmentsInsertError } = await supabase.from("quote_pdf_attachments").insert(
          materialsToAdd.map((mId) => ({
            quote_id: quoteId!,
            material_id: mId,
            sort_order: selectedMaterials.indexOf(mId),
          }))
        );
        if (attachmentsInsertError) throw attachmentsInsertError;
      }
      const materialsToRemove = [...currentMaterialIds].filter((mId) => !selectedMaterials.includes(mId));
      if (materialsToRemove.length > 0) {
        const { error: attachmentsDeleteError } = await supabase.from("quote_pdf_attachments")
          .delete().eq("quote_id", quoteId!).in("material_id", materialsToRemove);
        if (attachmentsDeleteError) throw attachmentsDeleteError;
      }

      // Preventivi V2 — calcolo provvigione teorica (non-blocking)
      if (quoteId && salespersonId) {
        try {
          const { error: commissionError } = await supabase.rpc("compute_quote_commission", { p_quote_id: quoteId });
          if (commissionError) throw commissionError;
        } catch (commErr) {
          console.warn("compute_quote_commission failed (non-critical):", commErr);
        }
      }

      const { data: savedQuote, error: savedQuoteError } = await supabase.from("quotes")
        .select("subtotal, discount_amount, vat_amount, total, updated_at")
        .eq("id", quoteId!).eq("company_id", companyId).single();
      if (savedQuoteError) throw savedQuoteError;
      assertSavedQuoteAmounts(savedQuote, { subtotal, discount_amount: discountAmt, vat_amount: vatAmount, total });
      versioneCaricataRef.current = savedQuote.updated_at;
      setLastSavedHash(draftSerialized);
      setAutosaveFailed(false);
      if (opts?.autosave) return; // Nessun refetch che possa cancellare input in corso.
      if (!isEdit) newQuoteCompletedRef.current = true;
      queryClient.invalidateQueries({ queryKey: queryKeys.quotes.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.quotes.detail(quoteId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.quotes.items(quoteId) });
      toast.success(isEdit ? "Preventivo aggiornato" : "Preventivo creato");
      clearQuoteDraft(); // salvato a DB → la bozza locale non serve più
      if (opts?.anteprima && quoteId) {
        setAnteprimaLoading(true);
        try {
          const { data: pdf, error: ePdf } = await supabase.functions.invoke(
            "generate-quote-pdf",
            { body: { quote_id: quoteId } },
          );
          if (ePdf) throw ePdf;
          const blob = await fetchQuotePdf(pdf?.signed_url);
          setAnteprimaUrl(URL.createObjectURL(blob));
          // Anche il PDF aggiorna il preventivo (percorso e data del file).
          await rileggiVersione(quoteId);
          if (!isEdit) setPendingEditNavId(quoteId);
        } catch (ePrev: unknown) {
          toast.error("Anteprima non riuscita", {
            description: ePrev instanceof Error ? ePrev.message : String(ePrev),
          });
          navigate(`/azienda/marketing/preventivi/${quoteId}`);
        } finally {
          setAnteprimaLoading(false);
        }
      } else {
        navigate(`/azienda/marketing/preventivi/${quoteId}`);
      }
    } catch (err: unknown) {
      setAutosaveFailed(true);
      if (opts?.autosave) return;
      if (isConflittoModifica(err)) {
        // Non è un guasto: è una persona che ha salvato prima di te. Quello
        // che hai scritto resta sullo schermo, così non va perso.
        toast.error("Qualcun altro ha salvato questo preventivo", {
          description: err.message,
          duration: 10000,
          action: { label: "Ricarica", onClick: () => window.location.reload() },
        });
        return;
      }
      const errMsg = err instanceof Error ? err.message : (err as { message?: string })?.message || "Errore salvataggio";
      toast.error("Salvataggio non completato", { description: `${errMsg} I dati inseriti restano in questa pagina.`, duration: 10000 });
    } finally {
      saveInFlightRef.current = false;
      setSaving(false);
    }
  };

  // Payload completo e guardia di versione condivisi con il salvataggio manuale.
  useEffect(() => {
    if (!isEdit || !existingQuote || !existingItemsLoaded || !existingAttachmentsLoaded ||
        autosaveFailed || saving || !clientName.trim() ||
        !["bozza", "draft"].includes(existingQuote.status || "") ||
        lastSavedHash === draftSerialized) return;
    const timer = setTimeout(() => { void handleSave("bozza", { autosave: true }); }, 60_000);
    return () => clearTimeout(timer);
    // handleSave usa lo snapshot di questo render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftSerialized, lastSavedHash, isEdit, existingQuote, existingItemsLoaded, existingAttachmentsLoaded, autosaveFailed, saving, companyId]);

  // ─── Render ───────────────────────────────────────────────────────────────

  const clientReady = !!clientName.trim();
  const productLines = items.filter((item) => !["nota", "subtotale", "sconto"].includes(item.item_category));
  const productsReady = productLines.length > 0 && productLines.every((item) => !!item.name.trim());
  const paymentError = paymentPlanError(paymentPhases);
  const quoteReady = clientReady && productsReady && !paymentError;

  // Prima le voci, poi la definizione del prezzo: stessa sequenza in modifica e riepilogo.
  const priceAndDiscountPanel = productLines.length > 0 ? (
        <Card className="border-orange-200">
          <CardHeader className="pb-3 max-sm:p-3 max-sm:pb-2">
            <CardTitle className="text-base">Prezzo e sconto</CardTitle>
            {/* Telefono no: la spiegazione sotto il titolo. */}
            <p className="text-sm text-muted-foreground max-sm:hidden">Usa i prezzi dei prodotti oppure concorda un prezzo unico. L'anteprima si aggiorna con i valori applicati.</p>
          </CardHeader>
          <CardContent className="space-y-4 max-sm:space-y-3 max-sm:p-3 max-sm:pt-0">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                {isEdit && id ? <QuoteDiscountControl quoteId={id} currentDiscount={discountPercent} approvalStatus={approvalStatus} onDiscountChange={setDiscountPercent} />
                  : <ScontoGlobaleField id="quote-sconto-globale" value={discountPercent} onCommit={setDiscountPercent} imponibileLordo={subtotal} tipoLavoro={tipoLavoro || "classico"} />}
                {!isEdit && listinoCliente?.attivo && (listinoCliente.sconto_globale_pct ?? 0) > 0 && <p className="text-xs text-muted-foreground">Sconto concordato nel listino cliente: {listinoCliente.sconto_globale_pct}%. Inseriscilo qui per verificarlo con le regole aziendali.</p>}
                {discountPercent > 0 && <p className="text-xs font-medium text-emerald-700">Risparmio sul prezzo IVA esclusa: {formatCurrency(discountAmt)}</p>}
              </div>
              <div className="space-y-2">
                <PrezzoPreventivoAMano id="quote-prezzo-manuale" companyId={companyId} value={prezzoManuale} sommaVoci={totaliPro.somma_voci} showDisabledHint onCommit={(v) => {
                  setPrezzoManuale(v);
                  if (v && prezzoManualeIvaPct == null) setPrezzoManualeIvaPct(ivaPredefinita());
                  if (!v) setPrezzoManualeIvaPct(null);
                }} />
                {totaliPro.prezzo_manuale && <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="quote-prezzo-manuale-iva">IVA sul prezzo manuale (%)</Label>
                  <Input id="quote-prezzo-manuale-iva" type="number" min={0} max={100} step={0.5} className="w-20" value={prezzoManualeIvaPct ?? 0} onChange={(e) => setPrezzoManualeIvaPct(Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)))} />
                </div>}
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-50 p-3 text-sm max-sm:gap-1 max-sm:px-3 max-sm:py-2 max-sm:text-xs">
              <span className="text-slate-500">Imponibile {formatCurrency(imponibilePreventivo)} + IVA {formatCurrency(vatAmount)}</span>
              <span className="font-semibold">Totale IVA inclusa <strong className="ml-2 text-lg text-primary">{formatCurrency(total)}</strong></span>
            </div>
          </CardContent>
        </Card>
  ) : null;

  // Step config per QuoteStepper (replica look wizard FV)
  const stepperSteps: QuoteStep[] = STEPS.map((s) => ({
    key: s.key,
    label: s.label,
    labelBreve: s.labelBreve,
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
      {paymentError && step === 2 && <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{paymentError} Correggi il piano prima di salvare o aprire il PDF. Le modifiche restano nella pagina.</div>}
      {!isEdit && recoverableDraft && (
        // Telefono: una riga («Bozza non salvata» + Ripristina / Ignora).
        <div className="flex flex-col gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 sm:flex-row sm:items-center sm:justify-between max-sm:flex-row max-sm:items-center max-sm:gap-2 max-sm:px-3 max-sm:py-2">
          <div className="flex items-start gap-2 text-sm text-amber-900 max-sm:min-w-0 max-sm:flex-1 max-sm:items-center max-sm:text-xs">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 max-sm:mt-0" />
            <span className="max-sm:hidden">
              Hai una <strong>bozza non salvata</strong> di un preventivo
              {recoverableDraft.savedAt ? ` del ${new Date(recoverableDraft.savedAt).toLocaleString("it-IT")}` : ""}. Vuoi riprenderla?
            </span>
            <span className="truncate font-medium sm:hidden">Bozza non salvata</span>
          </div>
          <div className="flex shrink-0 items-center gap-2 max-sm:gap-1">
            <Button size="sm" variant="outline" className="tap-compact h-8 bg-white" onClick={restoreQuoteDraft}>
              Ripristina
            </Button>
            <Button size="sm" variant="ghost" className="tap-compact h-8 max-sm:px-2" onClick={() => { setRecoverableDraft(null); clearQuoteDraft(); }}>
              Ignora
            </Button>
          </div>
        </div>
      )}
      {/* Header (replica FvPageHeader) — telefono: senza riquadro né icona. */}
      <QuotePageHeader
        className="testata-pagina"
        title={isEdit ? "Modifica preventivo" : "Nuovo preventivo"}
        subtitle={
          autosaveFailed || localDraftFailed ? (
            <span className="flex items-center gap-1 font-medium text-red-600">
              <AlertTriangle className="h-3 w-3" />
              {localDraftFailed ? "Bozza locale non protetta: salva prima di uscire" : "Salvataggio non completato: controlla prima di uscire"}
            </span>
          ) : undefined
        }
        icon={<FileCheck className="h-5 w-5" />}
        actions={
          <>
            {/* Telefono no: la freccia per tornare c'è già nella barra in alto. */}
            <Button
              variant="ghost"
              size="sm"
              className="h-9 max-sm:hidden"
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
                className="inline-flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100 transition-colors h-9 max-sm:hidden"
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
        completedSteps={[
          clientReady,
          productsReady,
          quoteReady,
        ]}
        onSelect={setStep}
        allowJumpForward
      />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_380px] 2xl:grid-cols-[minmax(0,1fr)_420px]">
      <div className="min-w-0 space-y-4">

      {/* ── STEP 0: Cliente ── */}
      {step === 0 && (
        <QuoteCard
          title="Dati cliente"
          icon={<User className="h-4 w-4" />}
          className="max-sm:p-3"
        >
          <div className="space-y-5 max-sm:space-y-4">
            {/* Blocco 1: Selezione rapida da contatto — telefono: senza riquadro
                e senza la riga di spiegazione, è il primo campo e basta. */}
            <div className="rounded-lg border bg-muted/30 p-3 max-sm:border-0 max-sm:bg-transparent max-sm:p-0">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Seleziona contatto esistente</Label>
              <div className="mt-1.5">
                <ContactCombobox companyId={companyId}
                  contacts={contacts}
                  value={contactId}
                  onChange={handleContactSelect}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1.5 max-sm:hidden">
                Seleziona un contatto CRM per compilare automaticamente i campi sotto.
              </p>
            </div>

            {/* Blocco 2: Anagrafica cliente */}
            <div className="space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Anagrafica cliente
              </h4>
              {/* Telefono: email e telefono affiancati, il resto a tutta riga. */}
              <div className="grid grid-cols-2 gap-4 max-sm:gap-3">
                <div className="max-md:col-span-2">
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
                <details className="col-span-2 rounded-lg border p-3">
                  <summary className="cursor-pointer text-sm font-medium">Dati fiscali e azienda <span className="font-normal text-muted-foreground">· facoltativi</span></summary>
                  <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-3">
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
                  </div>
                </details>
                <div className="col-span-2">
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
              {/* Telefono: titolo e validità sulla stessa riga. */}
              <div className="grid grid-cols-3 gap-4 max-sm:gap-3">
                <div className="col-span-2">
                  <Label>Titolo offerta</Label>
                  <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="es. Fornitura e posa serramenti PVC" />
                </div>
                <div>
                  <Label><span className="max-sm:hidden">Validità (giorni)</span><span className="sm:hidden">Validità gg</span></Label>
                  <Input
                    type="number"
                    min={1}
                    value={validityDays || ""}
                    onChange={(e) => setValidityDays(Math.max(0, parseInt(e.target.value) || 0))}
                    onBlur={() => { if (!validityDays) setValidityDays(30); }}
                  />
                </div>
                <div className="col-span-3">
                  <Label>Descrizione</Label>
                  <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2}
                    placeholder="Breve descrizione dei lavori (appare sul PDF)" />
                </div>
                <details className="col-span-3 rounded-lg border p-3">
                  <summary className="cursor-pointer text-sm font-medium">Note per il cliente e per il team</summary>
                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
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
                </details>
              </div>
            </div>

            {/* Blocco 3b: Modalità e fasi di pagamento (firmate dal cliente, riportate in commessa) */}

            {/* Blocco 3c: ripartizione tra bonus edilizi (opt-in azienda). Si decide
                qui perché è quello che il cliente firma; la commessa la eredita. */}
            {bonusMultipliEnabled && (
              <div className="border-t pt-4">
                <BonusLinesCard
                  lines={bonusLines}
                  onChange={setBonusLines}
                  totaleCommessa={imponibilePreventivo}
                  vatRate={aliquotaMediaPreventivo}
                  datiCausale={{
                    cfBeneficiario: clientFiscalCode || null,
                    pivaImpresa: effectiveCompany?.vat_number ?? null,
                  }}
                />
              </div>
            )}

            {/* Blocco 4: Dettagli lavoro */}
            <div className="space-y-3 border-t pt-4">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Dettagli lavoro e assegnazione
              </h4>
            {!dettagliLavoroAperti ? (
              <button
                type="button"
                onClick={() => setDettagliLavoroAperti(true)}
                className="flex w-full items-center justify-between rounded-lg border border-dashed px-3 py-3 text-left text-sm max-sm:border-border"
              >
                <span>
                  <span className="font-medium">Tipo di lavoro, commerciale, sede, indirizzo</span>
                  <span className="block text-xs text-muted-foreground">{tipoLavoro || salespersonId || sedeId || indirizzoLavori ? "Compilati: tocca per vedere" : "Facoltativi: tocca per compilare"}</span>
                </span>
                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
            ) : (
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
            )}
            </div>
          </div>
        </QuoteCard>
      )}

      {/* ── STEP 1: Prodotti ── */}
      {step === 1 && (
        <div className="flex gap-6 items-start">
          {/* Left: items list */}
          <div className="flex-1 min-w-0 space-y-4">
            {/* AI Quote Panel — anche su telefono (testo, voce, foto): generare le
                righe con l'AI dal cantiere è il caso d'uso; lì è compatto. */}
            {companyId && (
              <div>
              <AIQuotePanel
                companyId={companyId}
                tipoLavoro={tipoLavoro}
                pianoInstallazione={pianoInstallazione}
                onRigheGenerate={(sezioni) => {
                  sezioni.forEach((sez) => aggiungiSezione(sez.nome, sez.righe));
                }}
              />
              </div>
            )}
            <Card>
              <CardHeader className="max-sm:p-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <CardTitle className="max-sm:text-base">Prodotti e Servizi</CardTitle>
                  {preventivatoreUnifiedOn ? (
                    // Sprint A: entry point unificato. Le azioni secondarie
                    // (Riga libera/Sconto/Subtotale) sono dentro il dialog
                    // stesso; Nota/Trasporto/Nolo restano accessibili dal
                    // menu "Altro" sottostante per non rompere il flusso
                    // avanzato degli utenti abituati.
                    // Telefono: i tre bottoni su una riga, «Aggiungi prodotti» a riempire.
                    <div className="flex flex-wrap gap-2 max-sm:w-full max-sm:flex-nowrap">
                      <Button size="sm" variant="brand" className="max-sm:min-w-0 max-sm:flex-1" onClick={() => setAddItemOpen(true)}>
                        <Plus className="h-4 w-4 mr-1" /> <span className="max-sm:hidden">Cerca e aggiungi prodotti</span><span className="sm:hidden">Aggiungi prodotti</span>
                      </Button>
                      <Button type="button" size="sm" variant="outline" className="max-sm:shrink-0" onClick={() => addItem("product")}>
                        <Plus className="h-4 w-4 mr-1 max-sm:hidden" /> <span className="max-sm:hidden">Aggiungi voce manuale</span><span className="sm:hidden">Voce libera</span>
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" size="sm" className="max-sm:w-9 max-sm:shrink-0 max-sm:px-0" aria-label="Altro">
                            <ChevronDown className="h-4 w-4 mr-1 max-sm:mr-0" /> <span className="max-sm:hidden">Altro</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuItem onClick={() => setTariffePickerOpen(true)}>
                            <Plus className="h-4 w-4 mr-2" /> Voce dal listino tariffe
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setBundleOpen(true)}>
                            <Layers className="h-4 w-4 mr-2" /> Bundle
                          </DropdownMenuItem>
                          {haSerramenti && (
                            <DropdownMenuItem onClick={() => setRilievoOpen(true)}>
                              <Ruler className="h-4 w-4 mr-2" /> Rilievo per posizioni
                            </DropdownMenuItem>
                          )}
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
              <CardContent className="max-sm:p-3 max-sm:pt-0">
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
                  <div className="text-center py-12 text-muted-foreground max-sm:py-5">
                    <Package className="h-12 w-12 mx-auto mb-3 opacity-30 max-sm:hidden" />
                    <p className="font-medium max-sm:text-[13px]">Nessun prodotto</p>
                    <p className="text-sm max-sm:hidden">
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
                          {/* Telefono no: niente trascinamento. */}
                          {!isChild && <span className="contents max-sm:hidden">{dragHandle}</span>}
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
                                    <div className={`h-12 w-12 shrink-0 overflow-hidden rounded-md bg-muted border ${img ? "" : "hidden sm:block"}`}>
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
                              {/* Nome a larghezza piena: i campi numerici restano leggibili anche con l'anteprima a destra. */}
                              <div className="grid grid-cols-12 gap-2 items-end">
                                <div className="col-span-12">
                                  <Label className="text-xs max-sm:flex max-sm:items-baseline max-sm:justify-between">
                                    <span>
                                    Nome{" "}
                                    {isSconto && (
                                      <span className="text-red-500">
                                        (sconto)
                                      </span>
                                    )}
                                    </span>
                                    {/* Telefono: il totale della riga sta qui, sotto c'è posto per i campi. */}
                                    <span className={`sm:hidden text-[13px] font-semibold tabular-nums ${isSconto ? "text-red-600" : "text-foreground"}`}>
                                      {formatCurrency(item.quantity * item.unit_price * (1 - item.discount_percent / 100))}
                                    </span>
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
                                <div className="col-span-6 2xl:col-span-3 max-sm:col-span-3">
                                  <Label className="text-xs"><span className="max-sm:hidden">Quantità</span><span className="sm:hidden">Q.tà</span></Label>
                                  <Input
                                    type="number"
                                    min={0}
                                    step={0.01}
                                    aria-label={`Quantità: ${item.name || "riga"}`}
                                    value={item.quantity}
                                    onChange={(e) =>
                                      updateItem(
                                        idx,
                                        "quantity",
                                        Math.max(0, parseFloat(e.target.value) || 0)
                                      )
                                    }
                                  />
                                </div>
                                <div className="col-span-6 2xl:col-span-3 max-sm:col-span-4">
                                  <Label className="text-xs"><span className="max-sm:hidden">Prezzo unitario €</span><span className="sm:hidden">Prezzo €</span></Label>
                                  <Input
                                    type="number"
                                    min={0}
                                    step={0.01}
                                    aria-label={`Prezzo unitario: ${item.name || "riga"}`}
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
                                {/* Telefono no: lo sconto di riga (c'è lo sconto del preventivo). */}
                                <div className="col-span-4 2xl:col-span-2 max-sm:hidden">
                                  <Label className="text-xs">Sconto %</Label>
                                  <Input
                                    type="number"
                                    min={0}
                                    max={100}
                                    aria-label={`Sconto riga: ${item.name || "riga"}`}
                                    value={item.discount_percent}
                                    onChange={(e) =>
                                      updateItem(
                                        idx,
                                        "discount_percent",
                                        Math.min(100, Math.max(0, parseFloat(e.target.value) || 0))
                                      )
                                    }
                                  />
                                </div>
                                <div className="col-span-4 2xl:col-span-2 max-sm:col-span-3">
                                  <Label className="text-xs">IVA%</Label>
                                  <Input
                                    type="number"
                                    aria-label={`IVA riga: ${item.name || "riga"}`}
                                    value={item.vat_rate}
                                    onChange={(e) =>
                                      updateItem(
                                        idx,
                                        "vat_rate",
                                        Math.min(100, Math.max(0, parseFloat(e.target.value) || 0))
                                      )
                                    }
                                  />
                                </div>
                                <div className="col-span-4 2xl:col-span-2 flex items-end justify-end gap-1 max-sm:col-span-2">
                                  <p
                                    className={`font-medium text-sm py-2 max-sm:hidden ${
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
                                          const copy: QuoteItemPro = {
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


              </CardContent>
            </Card>
          </div>


        </div>
      )}


      {step === 1 && priceAndDiscountPanel}

      {/* Advisor AI facoltativo: richieste solo su azione esplicita. */}
      {step === 1 && (
            // Telefono no: niente assistenti AI dentro il modulo.
            <details className="rounded-xl border p-4 max-sm:hidden"><summary className="cursor-pointer text-sm font-medium">Consigli commerciali AI (facoltativi)</summary>
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
            </details>
      )}

      {/* ── STEP 3: Riepilogo ── */}
      {step === 2 && (
        <QuoteCard
          title="Controlla la tua offerta"
          icon={<FileCheck className="h-4 w-4" />}
          className="max-sm:p-3"
        >
          <div className="space-y-6 max-sm:space-y-4">
            {(!clientReady || !productsReady) && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 max-sm:gap-2 max-sm:p-2.5 max-sm:text-xs">
                <span>{!clientReady ? "Inserisci il nome del cliente per preparare il PDF." : "Aggiungi almeno un prodotto o servizio e completa i nomi delle righe."}</span>
                <Button size="sm" variant="outline" onClick={() => setStep(!clientReady ? 0 : 1)}>{!clientReady ? "Completa cliente" : "Completa prodotti"}</Button>
              </div>
            )}
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
                        {items.map((it, index) => (
                          <TableRow key={it.id ?? it.client_temp_id ?? index}>
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
                    {items.map((it, index) => (
                      <div key={it.id ?? it.client_temp_id ?? index} className="rounded-lg border border-slate-200 bg-white p-3">
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

            {priceAndDiscountPanel}


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

            {/* Documents */}
            {/* Render AI allegati */}

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

            {/* Template / Aspetto Documento — telefono: solo se c'è da scegliere
                (con un modello solo è una sezione senza decisioni), a righe
                senza miniature. */}
            {offerTemplates.length > (isMobile ? 1 : 0) && (
              <div className="border-t pt-4">
                <h3 className="font-medium mb-3 flex items-center gap-2">
                  <Palette className="h-4 w-4" />
                  Aspetto del Documento
                </h3>
                <div className="space-y-4">
                  <div>
                    <Label className="text-sm">Offerta completa</Label>
                    <p className="mt-1 text-xs text-muted-foreground max-sm:hidden">
                      Copertina, testi, condizioni e stile sono inclusi nello stesso modello.
                    </p>
                    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        {offerTemplates.map((tmpl) => {
                          const preview = resolveQuoteTemplatePreview(tmpl, templates);
                          return (
                          <button type="button" key={tmpl.id} aria-pressed={effectiveSelectedTemplateId === tmpl.id}
                            onClick={() => { setSelectedTemplateId(tmpl.id); setLayoutOverride(null); }}
                            className={`flex flex-col items-center gap-3 rounded-xl border-2 p-4 text-left transition max-sm:gap-1 max-sm:p-3 ${effectiveSelectedTemplateId === tmpl.id ? "border-orange-500 bg-orange-50/50" : "border-slate-200 bg-slate-50 hover:border-orange-300"}`}>
                            <div className="pointer-events-none max-sm:hidden" aria-hidden="true"><QuoteTemplatePreview template={preview} companyName={effectiveCompany?.name} logoSrc={templateAssetUrl(tmpl.logo_url)} coverSrc={templateAssetUrl(preview.cover_image_url)} scale={0.25} /></div>
                            <span className="w-full text-sm font-semibold">{tmpl.name}{tmpl.is_default ? " · Predefinito" : ""}</span>
                            {tmpl.description && <span className="line-clamp-2 w-full text-xs text-muted-foreground max-sm:hidden">{tmpl.description}</span>}
                          </button>
                          );
                        })}
                    </div>
                  </div>
                  {/* Layout quick-select — su telefono 2 per riga: a 4 le anteprime erano francobolli */}
                  {/* Telefono no: l'impaginazione si ritocca dal computer. */}
                  <details className="rounded-lg border p-3 max-sm:hidden">
                    <summary className="cursor-pointer text-sm">Cambia solo l'impaginazione</summary>
                  <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
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
                          page="detail"
                          scale={0.16}
                        />
                        <span className="capitalize mt-1 block">{layout}</span>
                      </button>
                    ))}
                  </div>
                  </details>

                </div>
              </div>
            )}
          </div>
        </QuoteCard>
      )}

      {/* Opzioni e allegati nello stesso passaggio della revisione finale. */}
      {step === 2 && (
        // Telefono no: opzioni del PDF, render e allegati sono da scrivania.
        <details className="rounded-xl border border-slate-200 bg-white p-4 max-sm:hidden">
          <summary className="cursor-pointer font-medium">Personalizza PDF e allegati <span className="text-xs font-normal text-muted-foreground">· facoltativo{selectedMaterials.length ? ` · ${selectedMaterials.length} allegati` : ""}</span></summary>
        <div className="mt-4 space-y-4">
            <QuoteRenderPicker
              contactId={contactId}
              selectedRenderIds={selectedRenders.map(r => r.id)}
              onSelectionChange={(renders) => setSelectedRenders(renders)}
            />
          {canEditPreventivi ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings2 className="h-4 w-4" />
                Contenuto del documento
                <Badge variant="secondary" className="ml-2 text-[10px]">Admin</Badge>
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Le modifiche qui valgono solo per questo preventivo. I valori di default si configurano in{" "}
                <Link to="/azienda/impostazioni/margini" className="underline">Impostazioni → Margini e sconti</Link>.
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
                    Carica i PDF in Contenuti Multimediali, poi selezionali qui.
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

          {/* Render nella proposta: prima ci si arrivava SOLO dal wizard render,
              con l'immagine passata nell'indirizzo. Chi apriva un preventivo
              normale non aveva modo di attaccarci un render già fatto. */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                Render nella proposta
              </CardTitle>
            </CardHeader>
            <CardContent>
              {renderUrl ? (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    {fotoPrima && (
                      <>
                        <figure className="space-y-1">
                          <img
                            src={fotoPrima}
                            alt="Come è adesso"
                            loading="lazy"
                            className="h-28 w-40 rounded-lg border object-cover"
                          />
                          <figcaption className="text-center text-[11px] text-muted-foreground">Adesso</figcaption>
                        </figure>
                        <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                      </>
                    )}
                    <figure className="space-y-1">
                      <img
                        src={renderUrl}
                        alt="Anteprima render AI allegato al preventivo"
                        loading="lazy"
                        className="h-28 w-40 rounded-lg border object-cover"
                      />
                      <figcaption className="text-center text-[11px] text-muted-foreground">Dopo il lavoro</figcaption>
                    </figure>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Il PDF del preventivo includerà una pagina finale "Anteprima
                    render AI" con questa immagine e il disclaimer di legge.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => setSceltaRenderOpen(true)}>
                      <Sparkles className="mr-1 h-4 w-4" />
                      Cambia render
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setRenderUrl(null);
                        setRenderSessionId(null);
                        setRenderOriginalUrl(null);
                      }}
                    >
                      <Trash2 className="mr-1 h-4 w-4" />
                      Rimuovi dal preventivo
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Un render di come verrà il lavoro, accanto ai numeri. Puoi
                    sceglierne uno fra quelli già fatti, di qualunque verticale.
                  </p>
                  <Button type="button" variant="outline" size="sm" onClick={() => setSceltaRenderOpen(true)}>
                    <Sparkles className="mr-1 h-4 w-4" />
                    Scegli un render
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <SceltaRenderDialog
            open={sceltaRenderOpen}
            onOpenChange={setSceltaRenderOpen}
            contactId={contactId}
            onScegli={(r: RenderScelto) => {
              setRenderUrl(r.url);
              setRenderSessionId(r.sessionId);
              setRenderOriginalUrl(r.originalUrl);
            }}
          />
        </div>
        </details>
      )}

      {/* ── Pannello Finanziamento (Step 3 — Riepilogo) ──────────────────
          Mostrato dopo i totali del preventivo. Toggle off di default per
          backward-compat. Quando attivo, calcola la rata reale dalle
          tabelle finanziarie configurate (eic_tabelle_finanziamento). */}
      {step === 2 && (
        <div className="mt-4">
          <QuotePaymentTermsCard
            total={total}
            method={paymentMethod}
            phases={paymentPhases}
            onMethodChange={setPaymentMethod}
            onPhasesChange={setPaymentPhases}
          />
          <QuoteFinancingPanel
            quoteTotal={total}
            value={financingProposal}
            onChange={setFinancingProposal}
          />
        </div>
      )}

      </div>
      {/* Telefono: vuota (anteprima nel passo «Conferma»), ma lasciava una riga di 24px. */}
      <aside className="order-first min-w-0 lg:order-last lg:sticky lg:top-4 max-sm:hidden">
        <div className="hidden lg:block"><QuoteLivePreviewPanel
              template={effectiveTemplate}
              companyName={effectiveCompany?.name || "La tua azienda"}
              clientName={clientName} clientAddress={clientAddress}
              title={title} description={description} siteAddress={indirizzoLavori}
              validityDays={validityDays} items={items}
              showImages={pdfImmagini} imageForItem={resolveItemImage} showMeasurements={pdfMisure}
              subtotal={subtotal} net={imponibilePreventivo} total={total}
              vatBreakdown={totaliPro.iva_breakdown} discountPercent={discountPercent}
              manualPrice={totaliPro.prezzo_manuale}
              showPrices={pdfPrezziRiga} onlyTotal={pdfSoloTotale} showDiscounts={pdfSconti}
              notes={notes} showNotes={pdfNoteCliente} showConditions={pdfCondizioni} showSignature={pdfFirma}
              paymentMethod={paymentMethod} paymentPhases={paymentPhases}
              logoSrc={templateAssetUrl(effectiveTemplate.logo_url)}
              coverSrc={templateAssetUrl(effectiveTemplate.cover_image_url)}
            /></div>
        {/* Telefono no: l'anteprima è il passo «Conferma», il totale sta nella barra in basso. */}
        <details className="rounded-xl border bg-white p-3 lg:hidden max-sm:hidden">
          <summary className="cursor-pointer text-sm font-semibold">Mostra anteprima live · {formatCurrency(total)}</summary>
          <div className="mt-3"><QuoteLivePreviewPanel
              template={effectiveTemplate}
              companyName={effectiveCompany?.name || "La tua azienda"}
              clientName={clientName} clientAddress={clientAddress}
              title={title} description={description} siteAddress={indirizzoLavori}
              validityDays={validityDays} items={items}
              showImages={pdfImmagini} imageForItem={resolveItemImage} showMeasurements={pdfMisure}
              subtotal={subtotal} net={imponibilePreventivo} total={total}
              vatBreakdown={totaliPro.iva_breakdown} discountPercent={discountPercent}
              manualPrice={totaliPro.prezzo_manuale}
              showPrices={pdfPrezziRiga} onlyTotal={pdfSoloTotale} showDiscounts={pdfSconti}
              notes={notes} showNotes={pdfNoteCliente} showConditions={pdfCondizioni} showSignature={pdfFirma}
              paymentMethod={paymentMethod} paymentPhases={paymentPhases}
              logoSrc={templateAssetUrl(effectiveTemplate.logo_url)}
              coverSrc={templateAssetUrl(effectiveTemplate.cover_image_url)}
            /></div>
        </details>
      </aside>
      </div>

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
              ) : autosaveFailed || localDraftFailed ? (
                <span className="flex items-center gap-1.5 text-red-600 font-medium">
                  <span className="w-2 h-2 rounded-full bg-red-500" /> Errore salvataggio
                </span>
              ) : isEdit ? (
                <span className="flex items-center gap-1.5 text-emerald-600 font-medium">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  {lastSavedHash === draftSerialized ? "Modifiche salvate" : "Modifiche da salvare"}
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-slate-400">
                  <span className="w-2 h-2 rounded-full bg-slate-300" /> {recoverableDraft ? "Bozza da recuperare" : localDraftSaved ? "Bozza su questo dispositivo" : "Non ancora salvato"}
                </span>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setStep(Math.max(0, step - 1))}
              disabled={step === 0}
              className="h-9 shrink-0"
              aria-label="Indietro"
            >
              <ArrowLeft className="h-4 w-4 sm:mr-1.5" />
              <span className="hidden sm:inline">Indietro</span>
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
            {step === STEPS.length - 1 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleSave("bozza", { anteprima: true })}
                disabled={saving || anteprimaLoading || !quoteReady}
                className="h-9"
                aria-label="Salva e apri PDF"
              >
                {anteprimaLoading ? (
                  <Loader2 className="h-4 w-4 sm:mr-2 animate-spin" />
                ) : (
                  <Eye className="h-4 w-4 sm:mr-2" />
                )}
                <span className="hidden sm:inline">Salva e apri PDF</span>
              </Button>
            )}
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
                onClick={() => handleSave("bozza", { complete: true })}
                disabled={saving || !quoteReady}
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
      <Dialog
        open={!!anteprimaUrl}
        onOpenChange={(o) => {
          if (!o && anteprimaUrl) {
            URL.revokeObjectURL(anteprimaUrl);
            setAnteprimaUrl(null);
            if (pendingEditNavId) {
              navigate(`/azienda/marketing/preventivi/${pendingEditNavId}/modifica`, { replace: true });
              setPendingEditNavId(null);
            }
          }
        }}
      >
        <DialogContent className="max-w-4xl h-[85vh] flex flex-col p-4">
          <DialogHeader className="shrink-0">
            <DialogTitle>Anteprima PDF</DialogTitle>
            <DialogDescription>
              Questo è il PDF vero che riceverà il cliente, col template scelto.
            </DialogDescription>
          </DialogHeader>
          {anteprimaUrl && (
            <iframe title="Anteprima preventivo" src={anteprimaUrl} className="flex-1 w-full rounded-md border" />
          )}
        </DialogContent>
      </Dialog>

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
      <TariffePickerDialog
        open={tariffePickerOpen}
        onClose={() => setTariffePickerOpen(false)}
        tariffe={tariffe}
        onPick={(t) => {
          // La CHECK su quote_items.item_category ammette solo queste voci:
          // tutto il resto (manodopera, tipi custom) viaggia come "posa".
          const ammesse = new Set(["posa", "trasporto", "tiro_piano", "smaltimento", "nolo", "pratica"]);
          addTariffa(t, ammesse.has(t.tipo) ? t.tipo : "posa");
        }}
      />
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


      {/* Il rilievo: venti finestre in una schermata invece di venti wizard.
          Compare solo se l'azienda ha serramenti a listino. */}
      {haSerramenti && (
        <RilievoPosizioniDialog
          open={rilievoOpen}
          onClose={() => setRilievoOpen(false)}
          currentSortOrder={items.length}
          famiglie={articleFamilies}
          onAddItems={(nuovi) => {
            setItems((prev) => {
              const base = [...prev];
              nuovi.forEach((item, idx) => {
                base.push({ ...item, sort_order: base.length + idx });
              });
              return base;
            });
          }}
        />
      )}

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
              configured.forEach((c) => {
                base.push({ ...c.quote_item, sort_order: base.length });
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
