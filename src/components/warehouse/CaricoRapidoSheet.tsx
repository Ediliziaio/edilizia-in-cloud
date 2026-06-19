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

import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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
} from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useBatchCarico } from "@/hooks/warehouse/useBatchCarico";
import { uploadWarehouseDDTToOrders, uploadWarehousePhotos } from "@/lib/warehousePhotoUpload";
import { deriveLottoFromSerials } from "@/lib/barcode/multiSerialParser";
import type { BatchScanEntry } from "./BatchBarcodeScanner";

const BatchBarcodeScanner = lazy(() =>
  import("./BatchBarcodeScanner").then((m) => ({ default: m.BatchBarcodeScanner })),
);

interface CaricoRapidoSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Step = "context" | "scan";
type ReceiveMode = "scan" | "ddt";

interface SupplierOption {
  id: string;
  name: string;
  uses_gs1?: boolean | null;
}

interface RelatedOrderOption {
  id: string;
  order_code: string;
  customer_name: string | null;
}

export function CaricoRapidoSheet({ open, onOpenChange }: CaricoRapidoSheetProps) {
  const { effectiveCompany, user } = useAuth();
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();
  // BUG FIX (mobile UX): useWarehouses(true) faceva INNER JOIN con
  // warehouse_assignments -> utenti senza assignment vedevano dropdown vuoto e
  // non potevano registrare arrivo merce. Stesso pattern di ScaricoCantiereSheet:
  // query diretta su warehouses attivi della company, niente filtro per ruolo.
  // I permessi RBAC sui CRUD restano gestiti dalle RLS lato DB.
  const { data: warehouses = [], isLoading: warehousesLoading } = useQuery({
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
        .select("id, order_code, customer:customer_id(first_name, last_name)")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(80);
      if (error) throw error;
      type RawOrder = {
        id: string;
        order_code: string | null;
        customer?: { first_name?: string | null; last_name?: string | null } | null;
      };
      return ((data ?? []) as unknown as RawOrder[]).map((order) => ({
        id: order.id,
        order_code: order.order_code ?? "—",
        customer_name:
          order.customer?.first_name || order.customer?.last_name
            ? `${order.customer?.first_name ?? ""} ${order.customer?.last_name ?? ""}`.trim()
            : null,
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
  const [receiveMode, setReceiveMode] = useState<ReceiveMode>("scan");
  const [supplierId, setSupplierId] = useState<string | undefined>();
  const [warehouseId, setWarehouseId] = useState<string | undefined>();
  const [relatedOrderIds, setRelatedOrderIds] = useState<string[]>([]);
  const [orderSearch, setOrderSearch] = useState("");
  const [ddtFile, setDdtFile] = useState<File | null>(null);
  const [notes, setNotes] = useState("");
  // Lotto opzionale: se l'utente compila il codice, dopo il carico tutti i
  // stock_units (serializzati) appena creati verranno raggruppati sotto questo
  // lotto. Caso d'uso fotovoltaico/impiantistica: 1 bancale = 1 lotto.
  const [lottoCode, setLottoCode] = useState("");
  // "Incolla seriali bancale": alternativa alla camera quando il QR è denso/
  // difficile da inquadrare → incolli la lista, costruiamo le entry e si prosegue.
  const [serialPaste, setSerialPaste] = useState("");
  const [pasteSectionOpen, setPasteSectionOpen] = useState(false);
  const [productPhotos, setProductPhotos] = useState<File[]>([]);
  const [entries, setEntries] = useState<BatchScanEntry[]>([]);
  const [insertedAt, setInsertedAt] = useState(() => new Date());
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

  // Default warehouse: il primo `is_default` o il primo della lista.
  useEffect(() => {
    if (!warehouseId && warehouses.length > 0) {
      const def = warehouses.find((w) => w.is_default) ?? warehouses[0];
      setWarehouseId(def.id);
    }
  }, [warehouses, warehouseId]);

  // Reset state quando si chiude lo sheet.
  useEffect(() => {
    if (open) {
      setInsertedAt(new Date());
    }
    if (!open) {
      setStep("context");
      setReceiveMode("scan");
      setSupplierId(undefined);
      setRelatedOrderIds([]);
      setOrderSearch("");
      setDdtFile(null);
      setNotes("");
      setProductPhotos([]);
      setEntries([]);
      batchCarico.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

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

  const canProceedToScan = !!supplierId && !!warehouseId;
  const canContinueReceipt = canProceedToScan && (receiveMode === "scan" || !!ddtFile);
  const continueLabel = receiveMode === "ddt" ? "Carica DDT e registra prodotti" : "Inizia scansione";
  const selectedRelatedOrders = useMemo(
    () => relatedOrders.filter((order) => relatedOrderIds.includes(order.id)),
    [relatedOrderIds, relatedOrders],
  );
  const filteredRelatedOrders = useMemo(() => {
    const q = orderSearch.trim().toLowerCase();
    if (!q) return relatedOrders;
    return relatedOrders.filter((order) =>
      `${order.order_code} ${order.customer_name ?? ""}`.toLowerCase().includes(q),
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
    { label: "Fornitore", done: !!supplierId },
    { label: "DDT", done: receiveMode === "scan" || !!ddtFile },
    { label: "Ordini", done: relatedOrderIds.length > 0 },
    { label: "Magazzino", done: !!warehouseId },
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
  // Passato al StockItemDialog come prefillSerials e usato in handleSaveNewItem
  // per creare stock_units in batch dopo la creazione dello stock_item.
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

      // v8.6.111 — Multi-serial creation: se il dialog e' stato aperto con
      // prefillSerials (es. da QR pallet con 36 codici), creiamo N stock_units
      // sotto il nuovo stock_item in 1 batch insert.
      // Skippa se tracking != serialized (caso edge: l'utente ha cambiato manualmente).
      if (
        createPrefillSerials &&
        createPrefillSerials.length >= 2 &&
        trackingMode === "serialized" &&
        warehouseId
      ) {
        try {
          const unitsToInsert = createPrefillSerials.map((sn) => ({
            company_id: effectiveCompany.id,
            stock_item_id: inserted.id,
            serial_number: sn,
            status: "available" as const,
            warehouse_id: warehouseId,
            supplier_id: data.supplier_id ?? null,
            purchase_price: data.unit_cost ?? null,
            purchase_date: new Date().toISOString().slice(0, 10),
          }));
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error: unitsErr } = await (supabase as any)
            .from("stock_units")
            .insert(unitsToInsert);
          if (unitsErr) {
            console.warn("[CaricoRapido] stock_units batch insert error:", unitsErr);
            toast.warning(`Articolo creato ma ${createPrefillSerials.length} seriali non collegati`, {
              description: unitsErr.message,
            });
          } else {
            toast.success(`Articolo "${inserted.name}" creato con ${createPrefillSerials.length} seriali collegati`);
          }
        } catch (unitsErr) {
          // 2026-05-27 (audit error handling): prima silent → l'utente vedeva
          // toast success "Articolo creato" ma i seriali non erano stati
          // salvati. Magazzino disallineato dal cantiere reale.
          console.error("[CaricoRapido] stock_units creation failed:", unitsErr);
          toast.warning(`Articolo creato ma ${createPrefillSerials.length} seriali non collegati`, {
            description: unitsErr instanceof Error ? unitsErr.message : "Riprova a registrare i seriali",
          });
        }
      }

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
      toast.error("Errore creazione articolo", {
        description: (err as Error)?.message ?? "Riprova",
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
      toast.error("Nessun seriale valido nel testo incollato");
      return;
    }
    const ts = Date.now();
    const pasted: BatchScanEntry[] = serials.map((serial) => ({
      clientUuid:
        typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${ts}-${serial}`,
      rawCode: serial,
      scanFormat: "paste/manual",
      stockItemId: null,
      itemName: null,
      trackingMode: null,
      quantity: 1,
      serialNumbers: [],
      scannedAt: ts,
    }));
    setEntries((prev) => [...prev, ...pasted]);
    toast.success(`${serials.length} seriali pronti`, {
      description: 'Collega l\'articolo con "Crea articolo unico" e conferma il carico.',
    });
    setSerialPaste("");
    setPasteSectionOpen(false);
    setStep("scan");
  };

  async function handleConfirm() {
    if (!warehouseId || !supplierId) return;

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
      ? `DDT arrivo caricato: ${ddtFile.name} alle ${insertedAt.toLocaleString("it-IT")} da ${insertedBy}`
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
        supplierId,
        entries,
        notes: mergedNotes || undefined,
      });

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
                supplier_id: supplierId,
                fornitore: supplierObj?.name ?? null,
                warehouse_id: warehouseId,
                quantita: scannedSerials.length,
                unita_misura: "pz",
                note: `Creato da carico rapido il ${insertedAt.toLocaleString("it-IT")}`,
              })
              .select("id")
              .single();

            if (lottoErr) {
              toast.warning("Lotto NON creato", {
                description: `${lottoErr.message}. Seriali importati comunque.`,
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
                toast.warning("Lotto creato ma seriali non collegati", {
                  description: updErr.message,
                });
              } else {
                toast.success(`Lotto ${trimmedLottoCode} creato con ${scannedSerials.length} seriali`);
                queryClient.invalidateQueries({ queryKey: ["warehouse-lotti-list-full"] });
                queryClient.invalidateQueries({ queryKey: ["warehouse-lotti-list"] });
              }
            }
          }
        } catch (lottoCreationErr) {
          toast.warning("Errore creazione lotto", {
            description: (lottoCreationErr as Error)?.message ?? "Seriali importati comunque",
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
                  toast.warning("Alcune foto prodotto non sono state salvate", {
                    description: uploadResult.failed.join(", "),
                  });
                }
              }
            }
            if (ddtToUpload && linkedOrderIds.length > 0) {
              const ddtUpload = await uploadWarehouseDDTToOrders({
                file: ddtToUpload,
                orderIds: linkedOrderIds,
                userId: userIdForUpload,
                supplierName: supplierNameForUpload,
                insertedAt: insertedAtIso,
              });
              if (ddtUpload.failed.length > 0) {
                toast.warning("DDT non collegato a tutti gli ordini", {
                  description: `${ddtUpload.failed.length} collegamenti falliti.`,
                });
              }
            }
          } catch (uploadErr) {
            toast.warning("Allegati non caricati in automatico", {
              description: (uploadErr as Error)?.message ?? "Riallegali dal dettaglio commessa",
            });
          }
        })();
      }
    } catch {
      // error toast già emesso dal hook
    }
  }

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
            onConfirm={handleConfirm}
            confirmLabel="Conferma carico"
            isConfirming={batchCarico.isPending}
            onRequestCreateItem={handleRequestCreateItem}
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
          prefillBarcode={createPrefillBarcode}
          prefillSupplierId={supplierId}
          prefillSerials={createPrefillSerials}
        />
      </>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!fixed !left-3 !right-3 !top-3 !bottom-[calc(5.25rem+env(safe-area-inset-bottom))] !flex !flex-col !w-auto !max-w-none !translate-x-0 !translate-y-0 gap-0 overflow-hidden p-0 sm:!left-[50%] sm:!right-auto sm:!top-[50%] sm:!bottom-auto sm:!w-full sm:!max-w-3xl sm:!max-h-[90svh] sm:!translate-x-[-50%] sm:!translate-y-[-50%]">
        <DialogHeader className="shrink-0 px-5 py-4 border-b">
          <DialogTitle className="flex items-center gap-2 text-base">
            <ArrowDownToLine className="h-5 w-5 text-primary" />
            Registra arrivo merce
          </DialogTitle>
          <DialogDescription className="text-xs">
            Scegli se partire dalla scansione o dal DDT: il flusso resta collegato a fornitore, magazzino, ordini e foto di arrivo.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div className="grid grid-cols-4 gap-1.5">
            {progressItems.map((item) => (
              <div
                key={item.label}
                className={`rounded-md border px-2 py-1.5 text-center text-[10px] font-medium ${
                  item.done
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-border bg-muted/30 text-muted-foreground"
                }`}
              >
                <CheckCircle2 className={`mx-auto mb-0.5 h-3.5 w-3.5 ${item.done ? "" : "opacity-35"}`} />
                <span className="block truncate">{item.label}</span>
              </div>
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border bg-muted/20 p-3">
              <p className="text-xs font-medium uppercase text-muted-foreground">Inserimento</p>
              <p className="text-sm font-semibold">{insertedAt.toLocaleString("it-IT")}</p>
              <p className="text-xs text-muted-foreground">Da: {insertedBy}</p>
            </div>
            <div className="rounded-lg border bg-muted/20 p-3">
              <p className="text-xs font-medium uppercase text-muted-foreground">Modalità</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={receiveMode === "scan" ? "default" : "outline"}
                  onClick={() => setReceiveMode("scan")}
                  className="justify-start"
                >
                  <ClipboardList className="mr-2 h-4 w-4" />
                  Scannerizza
                </Button>
                <Button
                  type="button"
                  variant={receiveMode === "ddt" ? "default" : "outline"}
                  onClick={() => setReceiveMode("ddt")}
                  className="justify-start"
                >
                  <FileText className="mr-2 h-4 w-4" />
                  Carica DDT
                </Button>
              </div>
            </div>
          </div>

          {/* Fornitore */}
          <div className="space-y-2">
            <Label htmlFor="cr-supplier">Fornitore *</Label>
            {suppliersLoading ? (
              <div className="h-10 border rounded-md flex items-center justify-center text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin mr-2" />
                Caricamento...
              </div>
            ) : (
              <Select value={supplierId} onValueChange={setSupplierId}>
                <SelectTrigger id="cr-supplier">
                  <SelectValue placeholder="Scegli un fornitore..." />
                </SelectTrigger>
                <SelectContent>
                  {suppliers.length === 0 ? (
                    <div className="p-2 text-xs text-muted-foreground">
                      Nessun fornitore configurato.
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
                Aggiungi un fornitore prima di continuare
              </Link>
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
                  DDT arrivo e ordini collegati
                  {(ddtFile || relatedOrderIds.length > 0) && (
                    <span className="ml-2 inline-flex items-center gap-1 text-[10px] font-normal bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 px-1.5 py-0.5 rounded-full">
                      {ddtFile && "DDT ✓"}
                      {ddtFile && relatedOrderIds.length > 0 && " · "}
                      {relatedOrderIds.length > 0 && `${relatedOrderIds.length} ordin${relatedOrderIds.length === 1 ? "e" : "i"}`}
                    </span>
                  )}
                </p>
                <p className="text-[11px] text-muted-foreground truncate">
                  {ddtSectionOpen
                    ? "Opzionale — usa se il fornitore consegna su ordine cliente specifico"
                    : "Apri se la merce è già destinata a un ordine cliente (opzionale)"}
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
              <Input
                id="cr-ddt-file"
                type="file"
                accept="image/*,.pdf"
                capture="environment"
                className="sr-only"
                onChange={(event) => {
                  setDdtFile(event.target.files?.[0] ?? null);
                  event.currentTarget.value = "";
                }}
              />
              {ddtFile ? (
                <div className="flex min-w-0 items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      DDT allegato
                    </p>
                    <p className="truncate text-xs font-medium">{ddtFile.name}</p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 min-h-8 min-w-8 shrink-0"
                    onClick={() => setDdtFile(null)}
                    aria-label={`Rimuovi DDT ${ddtFile.name}`}
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                  </Button>
                </div>
              ) : (
                <label
                  htmlFor="cr-ddt-file"
                  className="flex min-h-10 cursor-pointer items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm transition hover:bg-muted"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <FileText className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                    <span className="truncate font-medium">Allega DDT</span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">Foto o PDF</span>
                </label>
              )}
            </div>
            {receiveMode === "ddt" && !ddtFile && (
              <Alert className="border-amber-200 bg-amber-50/70 text-amber-900">
                <Info className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  Hai scelto “Carica DDT”: allega il DDT prima di continuare, poi registrerai i prodotti ricevuti.
                </AlertDescription>
              </Alert>
            )}
            <div className="rounded-md border bg-background">
              <div className="flex items-center justify-between gap-2 border-b px-3 py-2 text-xs font-medium text-muted-foreground">
                <span>Ordini da collegare</span>
                <div className="flex items-center gap-2">
                  {relatedOrderIds.length > 0 && (
                    <>
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">
                        {relatedOrderIds.length} selezionat{relatedOrderIds.length === 1 ? "o" : "i"}
                      </span>
                      <button
                        type="button"
                        className="text-[11px] text-primary hover:underline"
                        onClick={() => setRelatedOrderIds([])}
                      >
                        Azzera
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
                    placeholder="Cerca ordine o cliente..."
                    className="h-8 pl-8 text-xs"
                  />
                </div>
              </div>
              <div className="max-h-36 space-y-1 overflow-y-auto p-1.5 sm:max-h-44">
                {relatedOrdersLoading ? (
                  <div className="flex items-center justify-center py-4 text-xs text-muted-foreground">
                    <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                    Caricamento ordini...
                  </div>
                ) : filteredRelatedOrders.length === 0 ? (
                  <p className="px-2 py-3 text-xs text-muted-foreground">
                    {orderSearch ? "Nessun ordine trovato con questa ricerca." : "Nessun ordine disponibile."}
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
                          <span className="block truncate font-semibold text-foreground">{order.order_code}</span>
                          {order.customer_name && (
                            <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                              {order.customer_name}
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

          {/* Magazzino */}
          <div className="space-y-2">
            <Label htmlFor="cr-warehouse">Magazzino destinazione *</Label>
            {warehousesLoading ? (
              <div className="h-10 border rounded-md flex items-center justify-center text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin mr-2" />
                Caricamento...
              </div>
            ) : (
              <Select value={warehouseId} onValueChange={setWarehouseId}>
                <SelectTrigger id="cr-warehouse">
                  <SelectValue placeholder="Scegli un magazzino..." />
                </SelectTrigger>
                <SelectContent>
                  {warehouses.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      <div className="flex items-center gap-2">
                        {w.name}
                        {w.is_default && (
                          <span className="text-[9px] uppercase bg-muted px-1.5 py-0.5 rounded">
                            default
                          </span>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Codice lotto opzionale */}
          <div className="space-y-2">
            <Label htmlFor="cr-lotto" className="text-xs">
              Codice lotto / bancale (opzionale)
            </Label>
            <Input
              id="cr-lotto"
              value={lottoCode}
              onChange={(e) => setLottoCode(e.target.value)}
              placeholder="LOT-2026-001 — utile per fotovoltaico/impiantistica"
              className="font-mono text-xs"
              maxLength={80}
            />
            <p className="text-[10px] text-muted-foreground">
              Se compilato, tutti i seriali scansionati verranno raggruppati sotto questo lotto.
              Se lo lasci vuoto e scansioni il QR "SERIALS" di un bancale, il codice lotto viene
              rilevato in automatico dal prefisso comune dei seriali (es. 36 pannelli → 1 lotto).
            </p>
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
                <p className="text-sm font-medium">Incolla seriali del bancale</p>
                <p className="text-[11px] text-muted-foreground">
                  Se il QR è difficile da inquadrare: scansionalo col telefono e incolla qui la lista.
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
                  placeholder={"Seriali separati da spazio, virgola o a-capo\nes. V13H10002035 V13H10002023 V13H10001689 ..."}
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
                  Carica seriali e prosegui
                </Button>
                {!canProceedToScan && (
                  <p className="text-[10px] text-amber-600">Scegli prima fornitore e magazzino qui sopra.</p>
                )}
              </div>
            )}
          </div>

          {/* Note opzionali */}
          <div className="space-y-2">
            <Label htmlFor="cr-notes" className="text-xs">
              Note (opzionali)
            </Label>
            <Input
              id="cr-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Es. DDT 1234, ricezione mattina"
              maxLength={200}
            />
          </div>

          <div className="rounded-lg border bg-muted/20 p-3 space-y-3">
            <div className="flex items-start gap-2">
              <Camera className="h-4 w-4 mt-0.5 text-primary" aria-hidden="true" />
              <div>
                <p className="text-sm font-medium">Foto prodotti ricevuti</p>
                <p className="text-xs text-muted-foreground">
                  Scatta foto a bancali, colli, prodotti danneggiati o etichette prima della scansione.
                </p>
              </div>
            </div>
            <Input
              id="cr-product-photos"
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              onChange={(event) => {
                const files = Array.from(event.target.files ?? []);
                if (files.length > 0) {
                  setProductPhotos((current) => [...current, ...files]);
                }
                event.currentTarget.value = "";
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
                      aria-label={`Rimuovi foto ${file.name}`}
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
                Questo fornitore usa GS1: il parser estrarrà GTIN, lotto, seriale e scadenza
                automaticamente.
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter className="shrink-0 border-t p-3 flex-row gap-2 bg-card">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Annulla
          </Button>
          <Button
            onClick={() => setStep("scan")}
            disabled={!canContinueReceipt}
            className="flex-[2]"
          >
            {continueLabel}
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
