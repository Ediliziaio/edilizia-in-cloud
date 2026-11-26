/**
 * CaricoRapidoSheet — wizard 2-step per il carico merce rapido via scansione.
 *
 * Step 1 (Context): l'utente sceglie fornitore + magazzino destinazione +
 *                   eventuale DDT ricezione collegato.
 * Step 2 (Scan):    apre BatchBarcodeScanner che gestisce internamente la
 *                   coda di scansioni + review (auto-aggregation, qty edit,
 *                   remove, no-match). On confirm → invoca RPC
 *                   batch_carico_from_scans via useBatchCarico.
 *
 * Il wizard è collassato per ridurre i step "vuoti" e mantenere il flow
 * mobile fluido (un solo Sheet, scan continuo, niente passaggi inutili).
 */

import { lazy, Suspense, useCallback, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { edgeErrorMessage } from "@/lib/edgeFunctionError";
import { queryKeys } from "@/lib/queryKeys";
import { toast } from "sonner";
import { StockItemDialog } from "./StockItemDialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowLeft,
  ClipboardList,
  FileText,
  Info,
  Loader2,
  ExternalLink,
  Camera,
  CheckCircle2,
  X,
  Search,
  ChevronDown,
  ChevronUp,
  PackagePlus,
  Sparkles,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useMovementBalances } from "@/hooks/warehouse/useMovementBalances";
import type { StockItem } from "@/types/warehouse";
import { rigaMovimentoIniziale } from "@/lib/magazzino/righeMovimento";
import { useBatchCarico } from "@/hooks/warehouse/useBatchCarico";
import { validateWarehouseFile, WAREHOUSE_DOCUMENT_ACCEPT, WAREHOUSE_PHOTO_ACCEPT, MAX_WAREHOUSE_PHOTOS } from "@/lib/magazzino/allegatiMagazzino";
import { uploadWarehouseDDTToOrders, uploadWarehousePhotos } from "@/lib/warehousePhotoUpload";
import { deriveLottoFromSerials } from "@/lib/barcode/multiSerialParser";
import type { BatchScanEntry } from "./BatchBarcodeScanner";

const BatchBarcodeScanner = lazy(() =>
  import("./BatchBarcodeScanner").then((m) => ({ default: m.BatchBarcodeScanner })),
);
import { usePermissions } from "@/hooks/usePermissions";
import { validaRigheUscita } from "@/lib/magazzino/validaRigheUscita";
import { MovementReviewDialog } from "./MovementReviewDialog";
import { ManualArticleAdder } from "./ManualArticleAdder";
import { BOTTONE_NUOVO } from "@/components/orders/TestataScheda";
import { cn } from "@/lib/utils";
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";

interface CaricoRapidoSheetProps {
  open: boolean;
  initialWarehouseId?: string | null;
  initialStockItem?: StockItem;
  onOpenChange: (open: boolean) => void;
}

type Step = "context" | "scan" | "review";
type ReceiveMode = "manual" | "scan" | "ddt";

interface SupplierOption {
  id: string;
  name: string;
  uses_gs1?: boolean | null;
}

interface RelatedOrderOption {
  id: string;
  order_code: string;
  customer_name: string | null;
  description: string | null;
}

export function CaricoRapidoSheet(props: CaricoRapidoSheetProps) {
  const { effectiveCompany } = useAuth();
  // Ogni apertura e cambio azienda inizia un nuovo carico, senza residui del
  // documento precedente (lotto, ubicazione, foto e righe comprese).
  return props.open ? (
    <CaricoRapidoSession key={effectiveCompany?.id ?? "nessuna-azienda"} {...props} />
  ) : null;
}

function CaricoRapidoSession({ open, onOpenChange, initialWarehouseId, initialStockItem }: CaricoRapidoSheetProps) {
  const t = useT();
  const { effectiveCompany, user } = useAuth();
  const companyId = effectiveCompany?.id;
  const permissions = usePermissions();
  const canWrite = !permissions.isLoading && permissions.canEditWarehouse;
  const canViewCosts = !permissions.isLoading && permissions.canViewCosts;
  const queryClient = useQueryClient();
  // BUG FIX (mobile UX): useWarehouses(true) faceva INNER JOIN con
  // warehouse_assignments -> utenti senza assignment vedevano dropdown vuoto e
  // non potevano registrare arrivo merce. Stesso pattern di ScaricoCantiereSheet:
  // query diretta su warehouses attivi della company, niente filtro per ruolo.
  // I permessi RBAC sui CRUD restano gestiti dalle RLS lato DB.
  const { data: warehouses = [], isLoading: warehousesLoading, isError: warehousesError, refetch: refetchWarehouses } = useQuery({
    queryKey: ["carico-rapido-warehouses", companyId],
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warehouses")
        .select("id, name, is_default")
        .eq("company_id", companyId!)
        .eq("is_active", true)
        .order("position", { ascending: true })
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; name: string; is_default: boolean }>;
    },
  });
  const { data: suppliers = [], isLoading: suppliersLoading } = useQuery<SupplierOption[]>({
    queryKey: queryKeys.suppliers.list(companyId),
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("suppliers")
        .select("id, name, uses_gs1")
        .eq("company_id", companyId)
        .order("name");
      if (error) throw error;
      return (data ?? []) as SupplierOption[];
    },
    enabled: !!companyId,
    staleTime: 10 * 60 * 1000,
  });
  const { data: relatedOrders = [], isLoading: relatedOrdersLoading } = useQuery<RelatedOrderOption[]>({
    queryKey: ["warehouse-arrival-related-orders", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("orders")
        .select("id, order_code, description, tipo_lavoro, customer:customer_id(first_name, last_name)")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(80);
      if (error) throw error;
      type RawOrder = {
        id: string;
        order_code: string | null;
        description?: string | null;
        tipo_lavoro?: string | null;
        customer?: { first_name?: string | null; last_name?: string | null } | null;
      };
      return ((data ?? []) as unknown as RawOrder[]).map((order) => ({
        id: order.id,
        order_code: order.order_code ?? "—",
        customer_name:
          order.customer?.first_name || order.customer?.last_name
            ? `${order.customer?.first_name ?? ""} ${order.customer?.last_name ?? ""}`.trim()
            : null,
        // Descrizione lavoro/commessa: prima `description`, poi `tipo_lavoro`.
        description: (order.description ?? order.tipo_lavoro ?? "").trim() || null,
      }));
    },
    enabled: !!companyId,
    staleTime: 60_000,
  });
  const batchCarico = useBatchCarico();

  const [step, setStep] = useState<Step>("context");
  // v8.6.111 — Sezione "DDT arrivo e ordini collegati" collassabile
  // (richiesta utente: es. azienda ceramica compra lotto SENZA ordine cliente).
  // Default CHIUSA su mobile per ridurre clutter (l'utente la apre solo se serve).
  const [ddtSectionOpen, setDdtSectionOpen] = useState(false);
  const [receiveMode, setReceiveMode] = useState<ReceiveMode>("manual");
  // Scansione "una alla volta": ogni scan apre un popup di conferma (trovato→associa,
  // non trovato→crea) prima di aggiungere. Default ON (richiesta utente).
  const [confirmEachScan, setConfirmEachScan] = useState(true);
  const [supplierId, setSupplierId] = useState<string | undefined>();
  const [selectedWarehouseId, setWarehouseId] = useState<string | undefined>(initialWarehouseId ?? undefined);
  const warehouseId = selectedWarehouseId
    ?? (warehouses.find((w) => w.is_default) ?? warehouses[0])?.id;
  const [relatedOrderIds, setRelatedOrderIds] = useState<string[]>([]);
  const [orderSearch, setOrderSearch] = useState("");
  const [ddtFile, setDdtFile] = useState<File | null>(null);
  // Analisi AI del DDT: legge foto/PDF, estrae righe prodotto e pre-compila il carico.
  const [ddtAiLoading, setDdtAiLoading] = useState(false);
  const [ddtAiDone, setDdtAiDone] = useState(false);
  const [notes, setNotes] = useState("");
  const [registerCost, setRegisterCost] = useState(false);
  const [costDate, setCostDate] = useState(() => new Date().toLocaleDateString("en-CA"));
  const [costPaid, setCostPaid] = useState(true);
  const [costCategory, setCostCategory] = useState("Magazzino");
  const [costVat, setCostVat] = useState("22");
  // Lotto opzionale: se l'utente compila il codice, dopo il carico tutti i
  // stock_units (serializzati) appena creati verranno raggruppati sotto questo
  // lotto. Caso d'uso fotovoltaico/impiantistica: 1 bancale = 1 lotto.
  const [lottoCode, setLottoCode] = useState("");
  // B3 — scadenza lotto + sezione di stoccaggio (entrata merce).
  const [lottoScadenza, setLottoScadenza] = useState("");
  const [sectionId, setSectionId] = useState<string | undefined>();
  // B3 — sezioni/ubicazioni del magazzino selezionato (per stoccaggio mirato).
  // NB: dichiarata DOPO warehouseId/sectionId — referenziarli prima causa TDZ
  // ("Cannot access before initialization") e fa crashare l'intera pagina.
  const { data: sections = [] } = useQuery({
    queryKey: ["carico-rapido-sections", companyId, warehouseId],
    enabled: !!companyId && !!warehouseId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warehouse_sections")
        .select("id, name")
        .eq("company_id", companyId!)
        .eq("warehouse_id", warehouseId)
        .order("position", { ascending: true })
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; name: string }>;
    },
  });
  const sectionName = sectionId ? sections.find((s) => s.id === sectionId)?.name ?? null : null;
  // "Incolla seriali bancale": alternativa alla camera quando il QR è denso/
  // difficile da inquadrare → incolli la lista, costruiamo le entry e si prosegue.
  const [serialPaste, setSerialPaste] = useState("");
  const [pasteSectionOpen, setPasteSectionOpen] = useState(false);
  // B1 — "Aggiungi a mano dal listino": entrata merce senza scansione
  // (es. arriva un bancale di articoli già a catalogo → li scegli + quantità + prezzo).
  const [manualSectionOpen, setManualSectionOpen] = useState(true);
  const [productPhotos, setProductPhotos] = useState<File[]>([]);
  const [entries, setEntries] = useState<BatchScanEntry[]>(() => initialStockItem ? [rigaMovimentoIniziale(initialStockItem, canViewCosts)] : []);
  const costAmount = entries.reduce((sum, entry) => sum + Math.round((entry.purchasePrice ?? 0) * entry.quantity * 100) / 100, 0);
  const costProblem = registerCost && (!canViewCosts ? t("Non hai il permesso di registrare costi.") : !/^\d{4}-\d{2}-\d{2}$/.test(costDate) ? t("Indica la data del costo.") : entries.some(e => e.purchasePrice == null || !Number.isFinite(e.purchasePrice) || e.purchasePrice < 0) ? t("Indica il prezzo d’acquisto di ogni articolo per registrare il costo.") : costAmount <= 0 && entries.length > 0 ? t("Il costo deve avere un imponibile maggiore di zero.") : null);
  const balances = useMovementBalances(companyId, entries.flatMap((entry) => entry.stockItemId ? [entry.stockItemId] : []), step === "review");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [partialResult, setPartialResult] = useState<import("@/hooks/warehouse/useBatchCarico").BatchCaricoResult | null>(null);
  const commitInFlight = useRef(false);
  const [insertedAt] = useState(() => new Date());
  const insertedBy = user?.email ?? "utente corrente";

  // ── Inline create-from-no-match ─────────────────────────────────
  // Quando lo scanner trova un codice non riconosciuto, chiama
  // `onRequestCreateItem(rawCode)` → noi apriamo StockItemDialog precompilato
  // e tratteniamo la promessa qui finché l'utente non salva o annulla.
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createPrefillBarcode, setCreatePrefillBarcode] = useState<string | undefined>();
  const [createPending, setCreatePending] = useState(false);
  const createResolverRef = useRef<
    | ((value: { stockItemId: string; itemName: string; trackingMode: "fungible" | "serialized" } | null) => void)
    | null
  >(null);

  const supplierObj = useMemo(
    () => suppliers.find((s) => s.id === supplierId),
    [suppliers, supplierId],
  );
  const warehouseObj = useMemo(
    () => warehouses.find((w) => w.id === warehouseId),
    [warehouses, warehouseId],
  );

  const supplierUsesGs1 = useMemo(() => {
    // Cast difensivo: useOperationalSuppliers potrebbe non includere uses_gs1
    // (dipende dalla rigenerazione dei types). Lo prendiamo via cast safe.
    return Boolean(supplierObj?.uses_gs1);
  }, [supplierObj]);

  // Il fornitore è facoltativo (11/11/2026): basta sapere in quale magazzino entra la merce.
  const canProceedToScan = canWrite && !warehousesError && warehouses.some((warehouse) => warehouse.id === warehouseId);
  const canContinueReceipt = canProceedToScan && (receiveMode !== "ddt" || !!ddtFile);
  const continueLabel = receiveMode === "ddt" ? t("Carica DDT e registra prodotti") : t("Inizia scansione");
  const selectedRelatedOrders = useMemo(
    () => relatedOrders.filter((order) => relatedOrderIds.includes(order.id)),
    [relatedOrderIds, relatedOrders],
  );
  const filteredRelatedOrders = useMemo(() => {
    const q = orderSearch.trim().toLowerCase();
    if (!q) return relatedOrders;
    return relatedOrders.filter((order) =>
      `${order.order_code} ${order.customer_name ?? ""} ${order.description ?? ""}`.toLowerCase().includes(q),
    );
  }, [orderSearch, relatedOrders]);
  const scannerContextLabel = useMemo(() => {
    const parts = [
      supplierObj ? `Fornitore: ${supplierObj.name}` : null,
      warehouseObj ? `Magazzino: ${warehouseObj.name}` : null,
      ddtFile ? `DDT: ${ddtFile.name}` : null,
      selectedRelatedOrders.length > 0
        ? `${selectedRelatedOrders.length} ordin${selectedRelatedOrders.length === 1 ? "e" : "i"} collegat${
            selectedRelatedOrders.length === 1 ? "o" : "i"
          }`
        : null,
    ];
    return parts.filter(Boolean).join(" · ");
  }, [ddtFile, selectedRelatedOrders.length, supplierObj, warehouseObj]);
  const progressItems = [
    { label: t("Fornitore facoltativo"), done: true },
    { label: t("DDT facoltativo"), done: receiveMode !== "ddt" || !!ddtFile },
    { label: t("Righe"), done: entries.length > 0 },
    { label: t("Magazzino"), done: !!warehouseId },
  ];
  const toggleRelatedOrder = (orderId: string) => {
    setRelatedOrderIds((current) =>
      current.includes(orderId)
        ? current.filter((id) => id !== orderId)
        : [...current, orderId],
    );
  };

  /**
   * Apre StockItemDialog precompilato con il barcode no-match e resta in
   * attesa che l'utente salvi (→ resolver con i dati del nuovo articolo)
   * oppure chiuda il dialog senza salvare (→ resolve null).
   */
  // v8.6.111 — Stato per i seriali da QR pallet (caso multi-seriale).
  // Passato al dialog per proporre il tracking serializzato. Le unità
  // vengono create dall’RPC soltanto alla conferma del carico.
  const [createPrefillSerials, setCreatePrefillSerials] = useState<string[] | undefined>();

  const handleRequestCreateItem = (rawCode: string, hint?: { serials?: string[] }) => {
    setCreatePrefillBarcode(rawCode);
    setCreatePrefillSerials(hint?.serials && hint.serials.length >= 2 ? hint.serials : undefined);
    setCreateDialogOpen(true);
    return new Promise<{
      stockItemId: string;
      itemName: string;
      trackingMode: "fungible" | "serialized";
    } | null>((resolve) => {
      createResolverRef.current = resolve;
    });
  };

  async function handleSaveNewItem(data: {
    name: string;
    description?: string;
    quantity: number;
    unit_cost: number;
    vat_rate: number;
    supplier_id?: string;
    section_id?: string;
    min_stock_level: number;
    barcode?: string | null;
    internal_code?: string | null;
    tracking_mode?: "fungible" | "serialized";
    requires_warranty?: boolean;
    default_warranty_months?: number | null;
  }) {
    if (!effectiveCompany?.id) return;
    setCreatePending(true);
    try {
      const { data: inserted, error } = await supabase
        .from("warehouse_stock")
        .insert({
          company_id: effectiveCompany.id,
          name: data.name,
          description: data.description ?? null,
          // quantity iniziale: 0 — il carico aggiungerà la qty scansionata.
          quantity: 0,
          unit_cost: data.unit_cost,
          vat_rate: data.vat_rate,
          supplier_id: data.supplier_id ?? null,
          section_id: data.section_id ?? null,
          min_stock_level: data.min_stock_level,
          barcode: data.barcode ?? null,
          internal_code: data.internal_code ?? null,
          tracking_mode: data.tracking_mode ?? "fungible",
          requires_warranty: !!data.requires_warranty,
          default_warranty_months: data.default_warranty_months ?? null,
        })
        .select("id, name, tracking_mode")
        .single();
      if (error) throw error;
      const trackingMode = (inserted.tracking_mode ?? "fungible") as "fungible" | "serialized";

      // I seriali vengono registrati una sola volta dall'RPC alla conferma
      // del carico. Crearli qui causava duplicate_serial e created_units=0,
      // saltando anche la successiva associazione al lotto.

      queryClient.invalidateQueries({ queryKey: queryKeys.warehouse.stockAll });
      createResolverRef.current?.({
        stockItemId: inserted.id,
        itemName: inserted.name,
        trackingMode,
      });
      createResolverRef.current = null;
      setCreateDialogOpen(false);
      setCreatePrefillBarcode(undefined);
      setCreatePrefillSerials(undefined);
    } catch (err) {
      toast.error(t("Errore creazione articolo"), {
        description: (err as Error)?.message ?? t("Riprova"),
      });
    } finally {
      setCreatePending(false);
    }
  }

  function handleCloseCreateDialog(open: boolean) {
    setCreateDialogOpen(open);
    if (!open) {
      // Utente ha chiuso senza salvare → risolvi null per riportare il
      // controllo allo scanner.
      createResolverRef.current?.(null);
      createResolverRef.current = null;
      setCreatePrefillBarcode(undefined);
      setCreatePrefillSerials(undefined);
    }
  }

  // Incolla/scansiona una lista di seriali (es. il contenuto del QR "SERIALS" di
  // un bancale): li trasformiamo in entry no-match e proseguiamo allo scanner,
  // dove con "Crea articolo unico" si collegano al prodotto e si conferma il carico
  // (il lotto viene poi derivato in automatico dal prefisso comune).
  const handleLoadPastedSerials = () => {
    const raw = serialPaste.trim();
    if (!raw) return;
    const serials = Array.from(
      new Set(raw.split(/[\s,;]+/).map((s) => s.trim()).filter((s) => s.length >= 4)),
    ).slice(0, 500);
    if (serials.length === 0) {
      toast.error(t("Nessun seriale valido nel testo incollato"));
      return;
    }
    const ts = Date.now();
    const pasted: BatchScanEntry[] = serials.map((serial) => ({
      clientUuid:
        typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${ts}-${serial}`,
      rawCode: serial,
      scanFormat: "paste/manual",
      stockItemId: null as null,
      itemName: null as null,
      trackingMode: null as null,
      quantity: 1,
      serialNumbers: [] as string[],
      scannedAt: ts,
    }));
    setEntries((prev) => [...prev, ...pasted]);
    toast.success(t("{n} seriali pronti", { n: serials.length }), {
      description: t("Collega l'articolo con \"Crea articolo unico\" e conferma il carico."),
    });
    setSerialPaste("");
    setPasteSectionOpen(false);
    setStep("scan");
  };

  // ── Analisi AI del DDT ──────────────────────────────────────────────
  // Manda foto/PDF del DDT all'edge function ai-ddt-analyzer: estrae le righe
  // prodotto, le matcha contro la giacenza e pre-compila `entries`. Stessa
  // funzione riusabile un domani da WhatsApp/Silvio (basta file + company).
  const handleAnalyzeDdt = useCallback(async () => {
    if (!ddtFile || !companyId) return;
    setDdtAiLoading(true);
    try {
      const fileBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const res = String(reader.result ?? "");
          const comma = res.indexOf(",");
          resolve(comma >= 0 ? res.slice(comma + 1) : res);
        };
        reader.onerror = () => reject(reader.error ?? new Error("Lettura file non riuscita"));
        reader.readAsDataURL(ddtFile);
      });

      const { data, error } = await supabase.functions.invoke("ai-ddt-analyzer", {
        body: {
          file_base64: fileBase64,
          file_name: ddtFile.name,
          mime: ddtFile.type || "image/jpeg",
          company_id: companyId,
          warehouse_id: warehouseId ?? null,
        },
      });
      if (error) throw new Error(await edgeErrorMessage(error, "Analisi DDT non riuscita"));
      const payload = data as {
        success?: boolean;
        error?: string;
        extracted?: {
          supplier_name?: string | null;
          items?: Array<{
            description?: string | null;
            quantity?: number | string | null;
            unit_price?: number | string | null;
            code?: string | null;
            barcode?: string | null;
          }>;
        };
        matches?: Array<{
          index: number;
          stock_item_id: string | null;
          matched_name: string | null;
          tracking_mode: string | null;
        }>;
      };
      if (!payload?.success) throw new Error(payload?.error ?? "Analisi non riuscita");

      const items = payload.extracted?.items ?? [];
      const matches = payload.matches ?? [];
      if (items.length === 0) {
        toast.warning(t("Nessun articolo rilevato nel DDT"), {
          description: t("Prova con una foto più nitida, oppure aggiungi a mano dal listino."),
        });
        return;
      }

      const ts = Date.now();
      const newEntries: BatchScanEntry[] = items.map((it, i) => {
        const m = matches.find((x) => x.index === i);
        const qtyNum = Number(it.quantity);
        const quantity = Number.isFinite(qtyNum) && qtyNum > 0 ? Math.round(qtyNum) : 1;
        const priceNum = it.unit_price != null ? Number(it.unit_price) : NaN;
        const purchasePrice = Number.isFinite(priceNum) && priceNum >= 0 ? priceNum : undefined;
        return {
          clientUuid:
            typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${ts}-${i}`,
          rawCode: String(it.barcode || it.code || it.description || `riga-${i + 1}`),
          scanFormat: "ai/ddt",
          stockItemId: m?.stock_item_id ?? null,
          itemName: m?.matched_name ?? (it.description ? String(it.description) : null),
          trackingMode:
            (m?.tracking_mode as "fungible" | "serialized" | null) ??
            (m?.stock_item_id ? "fungible" : null),
          quantity,
          serialNumbers: [] as string[],
          purchasePrice,
          scannedAt: ts + i,
        };
      });

      setEntries((prev) => [...prev, ...newEntries]);

      // Pre-seleziona il fornitore se l'AI lo riconosce e non è già scelto.
      const supName = payload.extracted?.supplier_name;
      if (supName && !supplierId) {
        const needle = String(supName).toLowerCase().slice(0, 12);
        const sup = suppliers.find((s) => (s.name ?? "").toLowerCase().includes(needle));
        if (sup) setSupplierId(sup.id);
      }

      const matchedCount = newEntries.filter((e) => e.stockItemId).length;
      setDdtAiDone(true);
      toast.success(t("DDT analizzato: {n} righe estratte", { n: items.length }), {
        description: t("{matchedCount} già a catalogo, {n} da creare. Prosegui per controllare e confermare.", { matchedCount: String(matchedCount ?? ""), n: items.length - matchedCount }),
      });
    } catch (e) {
      toast.error(t("Analisi DDT non riuscita"), {
        description: (e as Error)?.message ?? t("Riprova o aggiungi gli articoli a mano."),
      });
    } finally {
      setDdtAiLoading(false);
    }
  }, [ddtFile, companyId, warehouseId, suppliers, supplierId]);

  async function handleConfirm() {
    if (!warehouseId) return;
    if (!canWrite || commitInFlight.current || batchCarico.isPending) return;
    const invalid = validaRigheUscita(entries) || (entries.some((e) => e.purchasePrice != null && (!Number.isFinite(e.purchasePrice) || e.purchasePrice < 0)) ? t("Verifica i prezzi d’acquisto.") : null);
    if (invalid || costProblem) { setSubmitError(invalid || costProblem); return; }
    commitInFlight.current = true;
    setSubmitError(null);

    // v8.6.121 — Note costruite SENZA esito upload: foto e DDT si caricano DOPO
    // il commit dello stock, in background, così la conferma non resta appesa
    // sugli upload (prima era il collo di bottiglia con foto pesanti).
    const linkedOrdersNote =
      relatedOrderIds.length > 0
        ? `Ordini collegati al DDT: ${relatedOrders
            .filter((order) => relatedOrderIds.includes(order.id))
            .map((order) => `${order.order_code}${order.customer_name ? ` ${order.customer_name}` : ""}`)
            .join(", ")}`
        : "";
    const ddtNote = ddtFile
      ? `${relatedOrderIds.length ? "DDT selezionato per il collegamento alle commesse" : "DDT usato per preparare il carico; file non archiviato (nessuna commessa collegata)"}: ${ddtFile.name} alle ${insertedAt.toLocaleString("it-IT")} da ${insertedBy}`
      : "";
    const photoNote =
      productPhotos.length > 0
        ? `Foto prodotti arrivo: ${productPhotos.map((file) => file.name).join(", ")}`
        : "";
    const mergedNotes = [notes.trim(), ddtNote, linkedOrdersNote, photoNote].filter(Boolean).join("\n");

    // Cattura media + contesto PRIMA del commit: lo sheet si chiude subito dopo e
    // questi valori servono all'upload in background (lo state verrà resettato).
    const photosToUpload = productPhotos;
    const ddtToUpload = ddtFile;
    const linkedOrderIds = relatedOrderIds;
    const companyIdForUpload = effectiveCompany?.id;
    const userIdForUpload = user?.id;
    const supplierNameForUpload = supplierObj?.name;
    const warehouseNameForUpload = warehouseObj?.name;
    const insertedAtIso = insertedAt.toISOString();

    try {
      const result = await batchCarico.mutateAsync({
        warehouseId,
        supplierId: supplierId ?? null,
        entries,
        notes: mergedNotes || undefined,
        sectionId: sectionId ?? null,
        companyCost: registerCost && canViewCosts ? { date: costDate, category: costCategory, vat_rate: Number(costVat), is_paid: costPaid } : undefined,
      });

      if (result.errors.length > 0) {
        setPartialResult(result);
        return;
      }

      // ── Auto-create lotto se l'utente ha compilato lottoCode ────────────
      // I seriali appena creati (status='available', purchase_date=today)
      // vengono raggruppati sotto un nuovo stock_lotti. Best-effort: se la
      // creazione del lotto fallisce, il carico è già committato → non perdiamo
      // i seriali, l'utente può creare il lotto manualmente dopo.
      // Seriali appena inseriti dall'RPC in stock_units (entries serializzate).
      const scannedSerials = entries
        .filter((e) => e.trackingMode === "serialized")
        .flatMap((e) => e.serialNumbers ?? []);
      // Codice lotto: quello digitato OPPURE, se vuoto, derivato dal prefisso
      // comune dei seriali → scansionando il QR di un bancale (es. 36 pannelli)
      // il lotto si crea da solo, senza inserimento manuale.
      const trimmedLottoCode = lottoCode.trim() || deriveLottoFromSerials(scannedSerials) || "";
      if (trimmedLottoCode && result.created_units > 0 && effectiveCompany?.id) {
        try {
          if (scannedSerials.length > 0) {
            // Articolo: se tutte le entry serialized hanno lo stesso stockItemId,
            // useremo quello come stock_item_id del lotto (drill-down preciso).
            const serializedItems = entries.filter(
              (e) => e.trackingMode === "serialized" && e.stockItemId,
            );
            const uniqueStockItemIds = Array.from(
              new Set(serializedItems.map((e) => e.stockItemId!).filter(Boolean)),
            );
            const singleStockItemId =
              uniqueStockItemIds.length === 1 ? uniqueStockItemIds[0] : null;
            const articoloNome = singleStockItemId
              ? serializedItems.find((e) => e.stockItemId === singleStockItemId)?.itemName ?? null
              : null;

            const { data: lottoRow, error: lottoErr } = await supabase
              .from("stock_lotti")
              .insert({
                company_id: effectiveCompany.id,
                codice_lotto: trimmedLottoCode,
                articolo: articoloNome ?? trimmedLottoCode,
                descrizione: articoloNome ?? trimmedLottoCode,
                stock_item_id: singleStockItemId,
                supplier_id: supplierId ?? null,
                fornitore: supplierObj?.name ?? null,
                warehouse_id: warehouseId,
                quantita: scannedSerials.length,
                unita_misura: "pz",
                // B3 — scadenza + ubicazione di stoccaggio del lotto (entrata merce).
                data_scadenza: lottoScadenza || null,
                posizione: sectionName ?? null,
                note: `Creato da carico rapido il ${insertedAt.toLocaleString("it-IT")}`,
              })
              .select("id")
              .single();

            if (lottoErr) {
              toast.warning(t("Lotto NON creato"), {
                description: t("{message}. Seriali importati comunque.", { message: String(lottoErr.message ?? "") }),
              });
            } else if (lottoRow?.id) {
              // Lega i nuovi stock_units al lotto via UPDATE batch sui seriali
              // appena inseriti (filtro per company + supplier + serial IN).
              const { error: updErr } = await supabase
                .from("stock_units")
                .update({ lotto_id: lottoRow.id })
                .eq("company_id", effectiveCompany.id)
                .in("serial_number", scannedSerials)
                .is("lotto_id", null); // safety: aggiorna solo se non già in altro lotto
              if (updErr) {
                toast.warning(t("Lotto creato ma seriali non collegati"), {
                  description: updErr.message,
                });
              } else {
                toast.success(t("Lotto {trimmedLottoCode} creato con {n} seriali", { trimmedLottoCode: String(trimmedLottoCode ?? ""), n: scannedSerials.length }));
                queryClient.invalidateQueries({ queryKey: ["warehouse-lotti-list-full"] });
                queryClient.invalidateQueries({ queryKey: ["warehouse-lotti-list"] });
              }
            }
          }
        } catch (lottoCreationErr) {
          toast.warning(t("Errore creazione lotto"), {
            description: (lottoCreationErr as Error)?.message ?? t("Seriali importati comunque"),
          });
        }
      }

      // success → chiudi subito: lo stock è committato, l'utente è libero.
      onOpenChange(false);

      // v8.6.121 — Upload allegati in BACKGROUND (best-effort). Non bloccano più
      // la conferma; gli errori sono solo informativi (lo stock è già salvo).
      if ((photosToUpload.length > 0 || ddtToUpload) && companyIdForUpload && userIdForUpload) {
        void (async () => {
          try {
            if (photosToUpload.length > 0) {
              const targets = linkedOrderIds.length > 0 ? linkedOrderIds : [null];
              for (const targetOrderId of targets) {
                const uploadResult = await uploadWarehousePhotos({
                  files: photosToUpload,
                  companyId: companyIdForUpload,
                  userId: userIdForUpload,
                  orderId: targetOrderId,
                  context: "arrival_product",
                  description: `Foto prodotti ricevuti da ${supplierNameForUpload ?? "fornitore"} per ${warehouseNameForUpload ?? "magazzino"}`,
                });
                if (uploadResult.failed.length > 0) {
                  toast.warning(t("Alcune foto prodotto non sono state salvate"), {
                    description: uploadResult.failed.join(", "),
                  });
                }
              }
            }
            if (ddtToUpload && linkedOrderIds.length > 0) {
              const ddtUpload = await uploadWarehouseDDTToOrders({
                companyId: companyIdForUpload,
                file: ddtToUpload,
                orderIds: linkedOrderIds,
                userId: userIdForUpload,
                supplierName: supplierNameForUpload,
                insertedAt: insertedAtIso,
              });
              if (ddtUpload.failed.length > 0) {
                toast.warning(t("DDT non collegato a tutti gli ordini"), {
                  description: t("{n} collegamenti falliti.", { n: ddtUpload.failed.length }),
                });
              }
            }
          } catch (uploadErr) {
            toast.warning(t("Allegati non caricati in automatico"), {
              description: (uploadErr as Error)?.message ?? t("Riallegali dal dettaglio commessa"),
            });
          }
        })();
      }
    } catch (error) {
      setSubmitError((error as Error).message || t("Carico non confermato. Verifica il registro movimenti prima di riprovare se la connessione si è interrotta."));
    } finally { commitInFlight.current = false; }
  }

  if (partialResult) return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-w-xl"><DialogHeader><DialogTitle>{t("Esito del carico")}</DialogTitle><DialogDescription>{t("{created_movements} movimenti registrati · {n} segnalazioni. Il carico non va ripetuto per intero.", { created_movements: String(partialResult.created_movements ?? ""), n: partialResult.errors.length })}</DialogDescription></DialogHeader><ul className="max-h-[45vh] space-y-2 overflow-auto">{partialResult.errors.map((e, i) => <li key={i} className="rounded-lg border p-3 text-sm">{entries.find((entry) => entry.stockItemId === e.stock_item_id)?.itemName || e.serial_number || t("Articolo")}: {e.error}</li>)}</ul><p className="text-sm text-muted-foreground">{t("Verifica i movimenti già registrati e correggi soltanto gli articoli mancanti.")}</p><DialogFooter><Button onClick={() => onOpenChange(false)}>{t("Chiudi esito")}</Button></DialogFooter></DialogContent></Dialog>;

  if (step === "review") return <MovementReviewDialog open={open} operation="carico" balances={balances.data} balancesLoading={balances.isFetching} balancesUnavailable={balances.isError} warehouse={warehouseObj?.name ?? t("Magazzino")} counterpart={supplierObj?.name} entries={entries} onBack={() => setStep("context")} onConfirm={() => void handleConfirm()} onOpenChange={onOpenChange} pending={batchCarico.isPending} additionalSummary={registerCost && canViewCosts ? <div className="rounded-xl border bg-blue-50 p-3 text-sm"><p className="font-semibold">{t("Costo aziendale da registrare")}</p><p>{t("Imponibile {costAmount} · IVA {costVat}% · {costCategory}", { costAmount: costAmount.toLocaleString(intlCampo(), {style:"currency",currency:"EUR"}), costVat: String(costVat ?? ""), costCategory: String(costCategory ?? "") })}</p><p>{costPaid ? t("Pagato il {data}", { data: new Date(`${costDate}T12:00:00`).toLocaleDateString(intlCampo()) }) : t("Scadenza {data}", { data: new Date(`${costDate}T12:00:00`).toLocaleDateString(intlCampo()) })}</p><p className="mt-1 text-xs text-muted-foreground">{t("Carico e costo vengono salvati insieme una sola volta.")}</p></div> : undefined} blocked={!canProceedToScan ? t("Verifica il magazzino e i permessi.") : costProblem || validaRigheUscita(entries)} error={submitError} />;

  // Step "scan" è gestito dal BatchBarcodeScanner sheet, non dal nostro Sheet
  // (il BatchBarcodeScanner usa il proprio Sheet bottom h-90svh).
  if (step === "scan") {
    return (
      <>
        <Suspense fallback={null}>
          <BatchBarcodeScanner
            open={open}
            onOpenChange={(v) => {
              if (!v) {
                // Chiudi tutto se l'utente chiude lo scanner sheet
                onOpenChange(false);
              }
            }}
            mode="carico"
            contextLabel={
              scannerContextLabel
            }
            supplierId={supplierId}
            supplierUsesGs1={supplierUsesGs1}
            initialEntries={entries}
            onEntriesChange={setEntries}
            onConfirm={() => setStep("review")}
            confirmLabel={t("Controlla carico")}
            isConfirming={batchCarico.isPending}
            onRequestCreateItem={handleRequestCreateItem}
            confirmEachScan={confirmEachScan}
            onBack={() => setStep("context")}
            backLabel="Indietro"
          />
        </Suspense>
        {/* Dialog inline per creare un articolo da scansione no-match. */}
        <StockItemDialog
          open={createDialogOpen}
          onOpenChange={handleCloseCreateDialog}
          onSave={handleSaveNewItem}
          isPending={createPending}
          canViewCosts={canViewCosts}
          prefillBarcode={createPrefillBarcode}
          prefillSupplierId={supplierId}
          prefillSerials={createPrefillSerials}
        />
      </>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!fixed !inset-0 !flex !flex-col !w-auto !max-w-none !translate-x-0 !translate-y-0 gap-0 overflow-hidden rounded-none border-0 p-0 sm:!inset-auto sm:!left-[50%] sm:!top-[50%] sm:!w-full sm:!max-w-3xl sm:!max-h-[90svh] sm:!translate-x-[-50%] sm:!translate-y-[-50%] sm:rounded-lg sm:border">
        <DialogHeader className="shrink-0 border-b px-4 py-3 pr-12 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-5 sm:py-4 sm:pt-4">
          <DialogTitle className="flex items-center gap-2 text-base">
            <ArrowDownToLine className="h-5 w-5 text-primary" />
            {t("Registra arrivo merce")}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {t("Scegli gli articoli, controlla le quantità e conferma. Puoi usare elenco, scanner o documento di arrivo.")}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3 space-y-3">
          {/* 26/11/2026: i passi come pillole su una riga (erano quattro riquadri alti 80px). */}
          <div className="flex flex-wrap gap-1.5">
            {progressItems.map((item) => (
              <span
                key={item.label}
                className={`inline-flex h-6 items-center gap-1 rounded-full border px-2 text-[11px] font-medium ${
                  item.done
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                    : "border-border bg-muted/30 text-muted-foreground"
                }`}
              >
                {item.done ? (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                ) : (
                  <span className="h-3 w-3 rounded-full border-2 border-current opacity-40" />
                )}
                {item.label}
              </span>
            ))}
          </div>

          {/* Modalità — scelta principale: bottoni grandi e tap-friendly (icona+
              testo impilati su mobile, inline su desktop). */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">
              {t("Come registri l'arrivo?")}
            </p>
            {/* Scelta in arancio tenue come i filtri del resto dell'app (era blu pieno), bottoni da 36px. */}
            <div className="grid grid-cols-3 gap-2 [&>button]:font-medium [&>button[aria-pressed=true]]:border-orange-300 [&>button[aria-pressed=true]]:bg-orange-50 [&>button[aria-pressed=true]]:text-orange-700">
              <Button type="button" variant="outline" aria-pressed={receiveMode === "manual"} className="h-auto min-h-[3.25rem] flex-col gap-1 py-2.5 sm:h-9 sm:min-h-0 sm:flex-row sm:gap-2 sm:py-0" onClick={() => { setReceiveMode("manual"); setManualSectionOpen(true); }}><PackagePlus className="h-5 w-5 sm:h-4 sm:w-4" /><span className="text-sm">{t("Da elenco")}</span></Button>
              <Button
                type="button"
                variant="outline"
                aria-pressed={receiveMode === "scan"}
                onClick={() => setReceiveMode("scan")}
                className="h-auto min-h-[3.25rem] flex-col gap-1 py-2.5 sm:h-9 sm:min-h-0 sm:flex-row sm:gap-2 sm:py-0"
              >
                <ClipboardList className="h-5 w-5 sm:h-4 sm:w-4" />
                <span className="text-sm">{t("Scannerizza")}</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                aria-pressed={receiveMode === "ddt"}
                onClick={() => { setReceiveMode("ddt"); setDdtSectionOpen(true); }}
                className="h-auto min-h-[3.25rem] flex-col gap-1 py-2.5 sm:h-9 sm:min-h-0 sm:flex-row sm:gap-2 sm:py-0"
              >
                <FileText className="h-5 w-5 sm:h-4 sm:w-4" />
                <span className="text-sm">{t("Carica DDT")}</span>
              </Button>
            </div>
            {receiveMode === "scan" && (
              <button
                type="button"
                onClick={() => setConfirmEachScan((v) => !v)}
                className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg border bg-muted/20 px-3 py-2 text-left"
                aria-pressed={confirmEachScan}
              >
                <span className="min-w-0 text-xs">
                  <span className="font-medium">{t("Conferma una alla volta")}</span>
                  <span className="block text-muted-foreground">{t("Popup di conferma a ogni scansione (associa o crea)")}</span>
                </span>
                <span className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${confirmEachScan ? "bg-primary" : "bg-muted-foreground/30"}`}>
                  <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${confirmEachScan ? "left-[22px]" : "left-0.5"}`} />
                </span>
              </button>
            )}
            <p className="text-[11px] text-muted-foreground">{t("Inserimento {insertedAt} · {insertedBy}", { insertedAt: insertedAt.toLocaleString(intlCampo()), insertedBy: String(insertedBy ?? "") })}</p>
          </div>

          {warehousesError && <Alert variant="destructive"><AlertDescription>{t("Magazzini non disponibili.")} <Button variant="link" onClick={() => void refetchWarehouses()}>{t("Riprova magazzini")}</Button></AlertDescription></Alert>}
          {entries.length > 0 && <p className="text-xs text-muted-foreground">{t("Il magazzino resta fissato alle righe inserite. Rimuovi le righe prima di cambiarlo.")}</p>}

          {/* Fornitore e magazzino affiancati da 640px (26/11/2026). */}
          <div className="grid gap-3 sm:grid-cols-2">
          {/* Fornitore */}
          <div className="space-y-2">
            <Label htmlFor="cr-supplier">{t("Fornitore (facoltativo)")}</Label>
            {suppliersLoading ? (
              <div className="h-10 border rounded-md flex items-center justify-center text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin mr-2" />
                {t("Caricamento...")}
              </div>
            ) : (
              <Select value={supplierId} onValueChange={setSupplierId}>
                <SelectTrigger id="cr-supplier" className="h-11 sm:h-9">
                  <SelectValue placeholder={t("Scegli un fornitore...")} />
                </SelectTrigger>
                <SelectContent>
                  {suppliers.length === 0 ? (
                    <div className="p-2 text-xs text-muted-foreground">
                      {t("Nessun fornitore configurato.")}
                    </div>
                  ) : (
                    suppliers.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            )}
            {!suppliersLoading && suppliers.length === 0 && (
              <Link
                to="/azienda/impostazioni/fornitori"
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                onClick={() => onOpenChange(false)}
              >
                <ExternalLink className="h-3 w-3" />
                {t("Aggiungi un fornitore (facoltativo)")}
              </Link>
            )}
          </div>

          {/* Magazzino */}
          <div className="space-y-2">
            <Label htmlFor="cr-warehouse">{t("Magazzino destinazione *")}</Label>
            {warehousesLoading ? (
              <div className="h-10 border rounded-md flex items-center justify-center text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin mr-2" />
                {t("Caricamento...")}
              </div>
            ) : (
              <Select
                value={warehouseId}
                onValueChange={(v) => {
                  setWarehouseId(v);
                  setSectionId(undefined); // sezioni dipendono dal magazzino
                }}
              >
                <SelectTrigger id="cr-warehouse" className="h-11 sm:h-9">
                  <SelectValue placeholder={t("Scegli un magazzino...")} />
                </SelectTrigger>
                <SelectContent>
                  {warehouses.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      <div className="flex items-center gap-2">
                        {w.name}
                        {w.is_default && (
                          <span className="text-[9px] uppercase bg-muted px-1.5 py-0.5 rounded">
                            {t("default")}
                          </span>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          </div>

          {/* B1 — Aggiungi a mano dal listino (senza scansione) */}
          <div className="rounded-lg border bg-muted/20">
            <button
              type="button"
              onClick={() => setManualSectionOpen((v) => !v)}
              className="w-full flex items-center gap-2 p-3 hover:bg-muted/30 transition-colors rounded-lg"
              aria-expanded={manualSectionOpen}
            >
              <PackagePlus className="h-4 w-4 text-primary shrink-0" aria-hidden="true" />
              <div className="flex-1 text-left min-w-0">
                <p className="text-sm font-medium">{t("Aggiungi a mano dal listino")}</p>
                <p className="text-[11px] text-muted-foreground">
                  {t("Niente codice a barre? Scegli l'articolo dal listino/giacenza, quantità e prezzo d'acquisto.")}
                </p>
              </div>
              {manualSectionOpen ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
              )}
            </button>
            {manualSectionOpen && (
              <div className="px-3 pb-3 border-t border-muted-foreground/10 pt-3">
                {!canProceedToScan ? (
                  <p className="text-[11px] text-amber-600">
                    {t("Scegli prima il magazzino qui sopra.")}
                  </p>
                ) : (
                  <ManualArticleAdder
                    key={`${companyId}:${warehouseId}`}
                    mode="carico"
                    companyId={companyId}
                    warehouseId={warehouseId}
                    entries={entries}
                    onEntriesChange={setEntries}
                    showPurchasePrice={canViewCosts}
                  />
                )}
              </div>
            )}
          </div>

          {/* v8.6.111 — Sezione DDT/ordini collassabile. Default chiusa: la
              maggioranza dei carichi sono "lotto magazzino" senza ordine
              cliente specifico (es. azienda ceramica). Mostra contatore se
              l'utente ha già selezionato ordini/DDT (così sa che c'è qualcosa). */}
          <div className="rounded-lg border bg-muted/20">
            <button
              type="button"
              onClick={() => setDdtSectionOpen((v) => !v)}
              className="w-full flex items-center gap-2 p-3 hover:bg-muted/30 transition-colors rounded-lg"
              aria-expanded={ddtSectionOpen}
            >
              <FileText className="h-4 w-4 text-primary shrink-0" aria-hidden="true" />
              <div className="flex-1 text-left min-w-0">
                <p className="text-sm font-medium">
                  {t("DDT arrivo e ordini collegati")}
                  {(ddtFile || relatedOrderIds.length > 0) && (
                    <span className="ml-2 inline-flex items-center gap-1 text-[10px] font-normal bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 px-1.5 py-0.5 rounded-full">
                      {ddtFile && t("DDT ✓")}
                      {ddtFile && relatedOrderIds.length > 0 && " · "}
                      {relatedOrderIds.length > 0 && `${relatedOrderIds.length} ordin${relatedOrderIds.length === 1 ? "e" : "i"}`}
                    </span>
                  )}
                </p>
                <p className="text-[11px] text-muted-foreground truncate">
                  {ddtSectionOpen
                    ? t("Opzionale — usa se il fornitore consegna su ordine cliente specifico")
                    : t("Apri se la merce è già destinata a un ordine cliente (opzionale)")}
                </p>
              </div>
              {ddtSectionOpen ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
              )}
            </button>
            {ddtSectionOpen && (
            <div className="px-3 pb-3 space-y-3 border-t border-muted-foreground/10 pt-3">
            <div className="rounded-md border bg-background p-2">
              <p className="mb-2 text-xs text-muted-foreground">{t("Foto o PDF fino a 10 MB. SVG non ammessi.")}</p>
              <p role="note" className="mb-2 text-xs text-muted-foreground">{t("Il file DDT viene archiviato nelle commesse collegate. Senza una commessa puoi usarlo per preparare il carico, ma il file non viene conservato: mantieni l’originale.")}</p>
              <Input
                id="cr-ddt-file"
                type="file"
                accept={WAREHOUSE_DOCUMENT_ACCEPT}
                capture="environment"
                className="sr-only"
                onChange={async (event) => {
                  const file=event.target.files?.[0];event.currentTarget.value="";
                  if(!file)return;
                  try {await validateWarehouseFile(file);setDdtFile(file);setDdtAiDone(false);} catch(error){toast.error(error instanceof Error?error.message:t("File non valido."));}
                }}
              />
              {ddtFile ? (
                <div className="space-y-2">
                  <div className="flex min-w-0 items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        {t("DDT allegato")}
                      </p>
                      <p className="truncate text-xs font-medium">{ddtFile.name}</p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 min-h-8 min-w-8 shrink-0"
                      onClick={() => {
                        setDdtFile(null);
                        setDdtAiDone(false);
                      }}
                      aria-label={t("Rimuovi DDT {name}", { name: String(ddtFile.name ?? "") })}
                    >
                      <X className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                  </div>
                  {/* Analisi AI del DDT: estrae le righe e pre-compila il carico */}
                  <Button
                    type="button"
                    variant={ddtAiDone ? "outline" : "default"}
                    size="sm"
                    className="w-full gap-2"
                    disabled={ddtAiLoading || !companyId}
                    onClick={handleAnalyzeDdt}
                  >
                    {ddtAiLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {t("Analisi in corso…")}
                      </>
                    ) : ddtAiDone ? (
                      <>
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        {t("Analizzato — rianalizza")}
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4" />
                        {t("Analizza DDT con AI")}
                      </>
                    )}
                  </Button>
                  <p className="text-[10px] text-muted-foreground">
                    {t("L'AI legge il DDT, estrae gli articoli e pre-compila il carico (li potrai controllare prima di confermare).")}
                  </p>
                </div>
              ) : (
                <label
                  htmlFor="cr-ddt-file"
                  className="flex min-h-10 cursor-pointer items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm transition hover:bg-muted"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <FileText className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                    <span className="truncate font-medium">{t("Allega DDT")}</span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">{t("Foto o PDF")}</span>
                </label>
              )}
            </div>
            {receiveMode === "ddt" && !ddtFile && (
              <Alert className="border-amber-200 bg-amber-50/70 text-amber-900">
                <Info className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  {t("Hai scelto “Carica DDT”: allega il DDT prima di continuare, poi registrerai i prodotti ricevuti.")}
                </AlertDescription>
              </Alert>
            )}
            <div className="rounded-md border bg-background">
              <div className="flex items-center justify-between gap-2 border-b px-3 py-2 text-xs font-medium text-muted-foreground">
                <span>{t("Ordini da collegare")}</span>
                <div className="flex items-center gap-2">
                  {relatedOrderIds.length > 0 && (
                    <>
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">
                        {t(relatedOrderIds.length === 1 ? "{n} selezionato" : "{n} selezionati", { n: relatedOrderIds.length })}
                      </span>
                      <button
                        type="button"
                        className="text-[11px] text-primary hover:underline"
                        onClick={() => setRelatedOrderIds([])}
                      >
                        {t("Azzera")}
                      </button>
                    </>
                  )}
                </div>
              </div>
              <div className="border-b p-1.5">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={orderSearch}
                    onChange={(event) => setOrderSearch(event.target.value)}
                    placeholder={t("Cerca ordine o cliente...")}
                    className="h-8 pl-8 text-xs"
                  />
                </div>
              </div>
              <div className="max-h-36 space-y-1 overflow-y-auto p-1.5 sm:max-h-44">
                {relatedOrdersLoading ? (
                  <div className="flex items-center justify-center py-4 text-xs text-muted-foreground">
                    <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                    {t("Caricamento ordini...")}
                  </div>
                ) : filteredRelatedOrders.length === 0 ? (
                  <p className="px-2 py-3 text-xs text-muted-foreground">
                    {orderSearch ? t("Nessun ordine trovato con questa ricerca.") : t("Nessun ordine disponibile.")}
                  </p>
                ) : (
                  filteredRelatedOrders.map((order) => {
                    const selected = relatedOrderIds.includes(order.id);

                    return (
                      <label
                        key={order.id}
                        className={`flex min-h-11 cursor-pointer items-start gap-2 rounded-md border px-2.5 py-2 text-sm transition ${
                          selected
                            ? "border-primary/35 bg-primary/5"
                            : "border-transparent hover:border-border hover:bg-muted/70"
                        }`}
                      >
                        <Checkbox
                          checked={selected}
                          onCheckedChange={() => toggleRelatedOrder(order.id)}
                          className="mt-0.5 !h-4 !w-4 !min-h-4 !min-w-4 rounded border-muted-foreground/50 data-[state=checked]:border-primary"
                        />
                        <span className="min-w-0 flex-1 leading-tight">
                          <span className="flex items-center gap-1.5">
                            <span className="truncate font-semibold text-foreground">{order.order_code}</span>
                            {order.customer_name && (
                              <span className="truncate text-xs font-medium text-foreground/80">
                                · {order.customer_name}
                              </span>
                            )}
                          </span>
                          {order.description && (
                            <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                              {order.description}
                            </span>
                          )}
                        </span>
                      </label>
                    );
                  })
                )}
              </div>
            </div>
            </div>
            )}
          </div>

          <details className="rounded-lg border p-3"><summary className="cursor-pointer text-sm font-medium">{t("Lotti, ubicazione e seriali (facoltativi)")}</summary><div className="mt-3 space-y-4">
          {/* B3 — Sezione di stoccaggio + scadenza lotto (entrata merce) */}
          {sections.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="cr-section" className="text-xs">
                {t("Sezione / ubicazione di stoccaggio (opzionale)")}
              </Label>
              <Select
                value={sectionId ?? "__none__"}
                onValueChange={(v) => setSectionId(v === "__none__" ? undefined : v)}
              >
                <SelectTrigger id="cr-section" className="h-11 sm:h-10">
                  <SelectValue placeholder={t("Nessuna sezione")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">{t("Nessuna sezione")}</SelectItem>
                  {sections.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground">
                {t("Applica scaffale/area a tutte le righe di questo carico (giacenza + seriali).")}
              </p>
            </div>
          )}

          {/* Codice lotto opzionale */}
          <div className="space-y-2">
            <Label htmlFor="cr-lotto" className="text-xs">
              {t("Codice lotto / bancale (opzionale)")}
            </Label>
            <Input
              id="cr-lotto"
              value={lottoCode}
              onChange={(e) => setLottoCode(e.target.value)}
              placeholder={t("LOT-2026-001 — utile per fotovoltaico/impiantistica")}
              className="font-mono text-xs"
              maxLength={80}
            />
            <p className="text-[10px] text-muted-foreground">
              {t("Se compilato, tutti i seriali scansionati verranno raggruppati sotto questo lotto. Se lo lasci vuoto e scansioni il QR \"SERIALS\" di un bancale, il codice lotto viene rilevato in automatico dal prefisso comune dei seriali (es. 36 pannelli → 1 lotto).")}
            </p>
            <div className="space-y-1.5 pt-1">
              <Label htmlFor="cr-lotto-scadenza" className="text-xs">
                {t("Scadenza lotto (opzionale)")}
              </Label>
              <Input
                id="cr-lotto-scadenza"
                type="date"
                value={lottoScadenza}
                onChange={(e) => setLottoScadenza(e.target.value)}
                className="text-xs"
              />
              <p className="text-[10px] text-muted-foreground">
                {t("Utile per materiali deperibili o con garanzia a termine (sigillanti, collanti, additivi).")}
              </p>
            </div>
          </div>

          {/* Incolla seriali bancale — alternativa alla camera (QR denso/difficile) */}
          <div className="rounded-lg border bg-muted/20">
            <button
              type="button"
              onClick={() => setPasteSectionOpen((v) => !v)}
              className="w-full flex items-center gap-2 p-3 hover:bg-muted/30 transition-colors rounded-lg"
              aria-expanded={pasteSectionOpen}
            >
              <ClipboardList className="h-4 w-4 text-primary shrink-0" aria-hidden="true" />
              <div className="flex-1 text-left min-w-0">
                <p className="text-sm font-medium">{t("Incolla seriali del bancale")}</p>
                <p className="text-[11px] text-muted-foreground">
                  {t("Se il QR è difficile da inquadrare: scansionalo col telefono e incolla qui la lista.")}
                </p>
              </div>
              {pasteSectionOpen ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
              )}
            </button>
            {pasteSectionOpen && (
              <div className="px-3 pb-3 space-y-2 border-t border-muted-foreground/10 pt-3">
                <Textarea
                  value={serialPaste}
                  onChange={(e) => setSerialPaste(e.target.value)}
                  placeholder={t("Seriali separati da spazio, virgola o a-capo\nes. V13H10002035 V13H10002023 V13H10001689 ...")}
                  rows={4}
                  className="font-mono text-xs"
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="w-full"
                  disabled={!serialPaste.trim() || !canProceedToScan}
                  onClick={handleLoadPastedSerials}
                >
                  {t("Carica seriali e prosegui")}
                </Button>
                {!canProceedToScan && (
                  <p className="text-[10px] text-amber-600">{t("Scegli prima il magazzino qui sopra.")}</p>
                )}
              </div>
            )}
          </div>

          </div></details>

          {/* Note opzionali */}
          <div className="space-y-2">
            <Label htmlFor="cr-notes" className="text-xs">
              {t("Note (opzionali)")}
            </Label>
            <Input
              id="cr-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t("Es. DDT 1234, ricezione mattina")}
              maxLength={200}
            />
          </div>

          <div className="rounded-lg border bg-muted/20 p-3 space-y-3">
            <div className="flex items-start gap-2">
              <Camera className="h-4 w-4 mt-0.5 text-primary" aria-hidden="true" />
              <div>
                <p className="text-sm font-medium">{t("Foto prodotti ricevuti")}</p>
                <p className="text-xs text-muted-foreground">
                  {t("Foto fino a 10 MB ciascuna, massimo 10 foto. SVG non ammessi.")}
                </p>
              </div>
            </div>
            <Input
              id="cr-product-photos"
              type="file"
              accept={WAREHOUSE_PHOTO_ACCEPT}
              capture="environment"
              multiple
              onChange={async (event) => {
                const files=Array.from(event.target.files??[]);event.currentTarget.value="";
                const valid:File[]=[];
                for(const file of files){try{await validateWarehouseFile(file,true);valid.push(file);}catch(error){toast.error(`${file.name}: ${error instanceof Error?error.message:"File non valido."}`);}}
                setProductPhotos(current=>{if(current.length+valid.length>MAX_WAREHOUSE_PHOTOS){toast.error(t("Carica al massimo 10 foto alla volta."));return current;}return [...current,...valid];});
              }}
            />
            {productPhotos.length > 0 && (
              <div className="space-y-2">
                {productPhotos.map((file, index) => (
                  <div key={`${file.name}-${index}`} className="flex items-center justify-between gap-2 rounded-md bg-background px-3 py-2 text-xs">
                    <span className="truncate">{file.name}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0"
                      onClick={() => setProductPhotos((current) => current.filter((_, i) => i !== index))}
                      aria-label={t("Rimuovi foto {name}", { name: String(file.name ?? "") })}
                    >
                      <X className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {supplierUsesGs1 && (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription className="text-xs">
                {t("Questo fornitore usa GS1: il parser estrarrà GTIN, lotto, seriale e scadenza automaticamente.")}
              </AlertDescription>
            </Alert>
          )}

        {entries.length > 0 && validaRigheUscita(entries) && <p role="alert" className="border-t px-4 py-2 text-xs text-destructive">{validaRigheUscita(entries)}</p>}
        {canViewCosts && <section className="rounded-xl border bg-muted/20 p-3 space-y-3" aria-label={t("Costo aziendale del carico")}>
        <div className="flex items-center gap-2"><Checkbox id="carico-register-cost" checked={registerCost} onCheckedChange={v => setRegisterCost(v === true)} /><Label htmlFor="carico-register-cost">{t("Registra costo acquisto nei Costi Aziendali")}</Label></div>
        <p className="text-xs text-muted-foreground">{t("Facoltativo per il carico libero. Attivalo solo se questo acquisto non è già registrato da un ordine, una fattura o un altro costo.")}</p>
        {registerCost && <><div className="grid gap-3 sm:grid-cols-2">
          <div><Label htmlFor="carico-cost-date">{costPaid ? t("Data pagamento") : t("Data scadenza")}</Label><Input id="carico-cost-date" type="date" value={costDate} onChange={e => setCostDate(e.target.value)} /></div>
          <div><Label htmlFor="carico-cost-category">{t("Categoria costo")}</Label><Select value={costCategory} onValueChange={setCostCategory}><SelectTrigger id="carico-cost-category"><SelectValue /></SelectTrigger><SelectContent>{["Magazzino","Materiali","Attrezzature","Consumabili","Altro"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></div>
          <div><Label htmlFor="carico-cost-vat">{t("IVA del costo")}</Label><Select value={costVat} onValueChange={setCostVat}><SelectTrigger id="carico-cost-vat"><SelectValue /></SelectTrigger><SelectContent>{["0","4","5","10","22"].map(v => <SelectItem key={v} value={v}>{v}%</SelectItem>)}</SelectContent></Select></div>
          <div className="flex items-center gap-2"><Checkbox id="carico-cost-paid" checked={costPaid} onCheckedChange={v => setCostPaid(v === true)} /><Label htmlFor="carico-cost-paid">{t("Acquisto già pagato")}</Label></div>
        </div><p className="text-sm font-medium">{t("Imponibile: {costAmount}", { costAmount: costAmount.toLocaleString(intlCampo(), {style:"currency",currency:"EUR"}) })}</p>{costProblem && <p role="alert" className="text-sm text-destructive">{costProblem}</p>}</>}
      </section>}
        </div>
      <DialogFooter className="shrink-0 flex-row gap-2 border-t bg-card p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:pb-3">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="h-12 flex-1 sm:h-9"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t("Annulla")}
          </Button>
          <Button
            onClick={() => setStep(entries.length > 0 ? "review" : "scan")}
            disabled={!canContinueReceipt || (receiveMode === "manual" && entries.length === 0) || (entries.length > 0 && !!validaRigheUscita(entries))}
            className={cn(BOTTONE_NUOVO, "h-12 min-w-0 flex-[2] whitespace-normal text-[15px] leading-tight sm:h-9 sm:text-sm")}
          >
            {entries.length > 0 ? t("Controlla carico") : receiveMode === "manual" ? t("Aggiungi articoli") : continueLabel}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
