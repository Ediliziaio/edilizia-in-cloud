/**
 * BatchBarcodeScanner — scanner continuo per carico/scarico/ODA.
 *
 * Differenza con BarcodeScanner (single-shot):
 *   - non chiude dopo 1 scan: dopo ogni risoluzione, riavvia camera
 *   - haptics native (success/error/impact) via @capacitor/haptics
 *   - torch toggle (Android Chrome) con feature detection
 *   - auto-aggregation: scan ripetuto dello stesso item fungibile incrementa qty
 *   - duplicate throttle: stesso codice < 2s viene ignorato silenziosamente
 *   - offline indicator: badge rosso quando navigator.onLine === false
 *   - counter live espandibile: tabella delle entries con edit qty / remove
 *   - manual input fallback: utile per cantieri con luce scarsa
 *   - clientUuid UUIDv4 per ogni entry: prerequisito per offline sync (MP3)
 *
 * Mode:
 *   "carico"      → scansioni libere, tutti i lookup proposti
 *   "oda_receive" → scansioni vincolate alle righe dell'ODA passata in props
 *   "lookup"      → ricerca single-shot articolo, senza accumulo batch
 *
 * Convenzione: il caller raccoglie le entries via `onEntriesChange` e fa il
 * commit (RPC batch_carico_from_scans / receive_from_oda_via_scans) quando
 * l'utente conferma.
 */

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Camera,
  Pause,
  Play,
  Flashlight,
  FlashlightOff,
  Keyboard,
  WifiOff,
  ScanLine,
  X,
  ArrowLeft,
  Trash2,
  AlertCircle,
  Package,
  CheckCircle2,
  Plus,
  Minus,
  Loader2,
  PackagePlus,
  Filter,
  Edit,
  Check,
} from "lucide-react";
import {
  successFeedback,
  errorFeedback,
} from "@/lib/mobile/native-haptics";
import { onNetworkChange } from "@/lib/mobile/native-network";
import { useBarcodeLookup } from "@/hooks/warehouse/useBarcodeLookup";
import { useBatchScannerCamera } from "@/hooks/warehouse/useBatchScannerCamera";
import {
  newBatchScanClientUuid,
  useBatchScannerEntries,
} from "@/hooks/warehouse/useBatchScannerEntries";
import { useBatchScannerSubmit } from "@/hooks/warehouse/useBatchScannerSubmit";
import { toast } from "sonner";
import { tryParseMultiSerial } from "@/lib/barcode/multiSerialParser";
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";

// ────────────────────────────────────────────────────────────
// Tipi pubblici
// ────────────────────────────────────────────────────────────

export interface BatchScanEntry {
  /** UUID v4 generato lato client; usato per idempotency offline sync (MP3). */
  clientUuid: string;
  /** Codice raw scansionato. */
  rawCode: string;
  /** Formato barcode rilevato da ZXing (es. EAN_13, QR_CODE). */
  scanFormat?: string;
  /** ID articolo risolto via RPC. NULL se nessun match (entry "create new"). */
  stockItemId: string | null;
  /** Nome articolo per UI. NULL se nessun match. */
  itemName: string | null;
  /** Tracking mode dell'articolo (per decidere se mostrare seriali). */
  trackingMode: "fungible" | "serialized" | null;
  /** Quantità aggregata. Per serializzati = serialNumbers.length. */
  quantity: number;
  /** Seriali raccolti (per serializzati). */
  serialNumbers: string[];
  /** Solo modalità oda_receive: ID della riga ODA matchata. */
  odaItemId?: string | null;
  /** Prezzo d'acquisto per unità (entrata merce): precompilato dal listino,
   *  modificabile col prezzo del DDT. Salvato come unit_cost/purchase_price. */
  purchasePrice?: number;
  /** Unità visualizzata nei riepiloghi, senza aggregare unità differenti. */
  unitOfMeasure?: string | null;
  /** Timestamp client per ordinamento UI. */
  scannedAt: number;
  /**
   * v8.6.121 — Match incerto (azione 'confirm_ambiguous'): è stato preso il 1°
   * candidato in automatico per non bloccare lo scan continuo. Solo hint UI
   * (badge "da verificare" in revisione), NON blocca la conferma.
   */
  ambiguous?: boolean;
}

export type BatchScanMode = "carico" | "oda_receive" | "lookup";

/** v8.6.121 — Tetto difensivo alla coda scansioni (in pratica resta ~0-1). */
const MAX_SCAN_QUEUE = 25;

interface BatchBarcodeScannerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Carico libero o ricezione vincolata a un'ODA. */
  mode: BatchScanMode;
  /** Etichetta di contesto mostrata in header (es. "Fornitore: ACME"). */
  contextLabel?: string;
  /** Supplier ID per disambiguare lookup (cascata pref. stesso supplier). */
  supplierId?: string;
  /** Forza GS1 parser anche senza euristica (suppliers.uses_gs1=true). */
  supplierUsesGs1?: boolean;
  /** Solo modalità oda_receive: filtra/valida scansioni contro queste righe. */
  allowedOdaItems?: Array<{ stockItemId: string | null; odaItemId: string; qtyPending: number }>;
  /**
   * mode='carico' (scarico verso ordine): valida che ogni scansione corrisponda
   * a un articolo presente nelle righe ordine, e che la qty residua non sia
   * gia completa. Se l'articolo non e in ordine -> toast warning + audio errore
   * (l'entry NON viene aggiunta). Se la qty e completa -> stop.
   * Quando questa prop e fornita, lo scanner si comporta come "vincolato".
   * Quando undefined -> comportamento permissivo (carico libero).
   */
  allowedOrderItems?: Array<{ stockItemId: string; orderItemId: string; itemName: string; qtyRequired: number }>;
  /** Entries iniziali (per riapertura sheet). */
  initialEntries?: BatchScanEntry[];
  /** Callback ad ogni cambio entries (caller mantiene state). */
  onEntriesChange?: (entries: BatchScanEntry[]) => void;
  /** CTA finale (es. "Conferma carico"). */
  onConfirm?: () => void;
  /** Etichetta del CTA finale. */
  confirmLabel?: string;
  /** True quando il commit è in corso. */
  isConfirming?: boolean;
  /** Torna allo step precedente senza chiudere tutto il flusso. */
  onBack?: () => void;
  /** Etichetta CTA secondaria quando onBack è presente. */
  backLabel?: string;
  /**
   * Quando una scansione restituisce "offer_create_new", il caller può
   * fornire questo callback per permettere all'utente di creare l'articolo
   * inline (apre un dialog StockItemDialog precompilato). Se non fornito,
   * la riga viene aggiunta come "no-match" e l'utente la deve creare
   * separatamente prima di confermare.
   *
   * Risolvendo con i dati dell'articolo creato, BatchBarcodeScanner
   * sostituisce la riga no-match con un'entry valida; risolvendo `null`
   * (utente ha annullato) la riga no-match viene rimossa.
   */
  /**
   * v8.6.111 — Accetta hint opzionale con la lista di seriali del QR pallet
   * (caso multi-seriale). Quando fornito: il dialog crea l'articolo con
   * tracking_mode='serialized', quantity=hint.serials.length, e i seriali
   * vengono creati come stock_units sotto il nuovo stock_item.
   */
  onRequestCreateItem?: (rawCode: string, hint?: { serials?: string[] }) => Promise<{
    stockItemId: string;
    itemName: string;
    trackingMode: "fungible" | "serialized";
  } | null>;
  /** mode='lookup': filtra la tabella sul risultato trovato. */
  onLookupFilter?: (stockItemId: string | undefined) => void;
  /** mode='lookup': apre il dialog modifica articolo. */
  onLookupEdit?: (stockItemId: string | undefined) => void;
  /** mode='lookup': apre il dialog crea articolo con barcode precompilato. */
  onLookupCreateNew?: (rawCode: string) => void;
  /**
   * Modalità "conferma a ogni scan": dopo ogni scansione lo scanner si mette in
   * pausa e mostra un popup di conferma (articolo trovato → associa, o non
   * trovato → crea) prima di aggiungere la riga. Riusa la macchina di pausa di
   * 'lookup'. Default off → comportamento batch rapido invariato.
   */
  confirmEachScan?: boolean;
}

// ────────────────────────────────────────────────────────────
// Componente principale
// ────────────────────────────────────────────────────────────

export function BatchBarcodeScanner(props: BatchBarcodeScannerProps) {
  return props.open ? <BatchBarcodeScannerSession {...props} /> : null;
}

function BatchBarcodeScannerSession({
  open,
  onOpenChange,
  mode,
  contextLabel,
  supplierId,
  supplierUsesGs1,
  allowedOdaItems,
  allowedOrderItems,
  initialEntries,
  onEntriesChange,
  onConfirm,
  confirmLabel = "Conferma",
  isConfirming = false,
  onBack,
  backLabel = "Indietro",
  onRequestCreateItem,
  onLookupFilter,
  onLookupEdit,
  onLookupCreateNew,
  confirmEachScan = false,
}: BatchBarcodeScannerProps) {
  const tr = useT();
  const lookupResultRef = useRef<BatchScanEntry | null>(null);
  const [lookupResult, setLookupResultState] = useState<BatchScanEntry | null>(null);
  const setLookupResult = useCallback((value: BatchScanEntry | null) => { lookupResultRef.current = value; setLookupResultState(value); }, []);
  // confirmEachScan: oda_item_id della scansione in attesa di conferma.
  const [pendingOda, setPendingOda] = useState<string | null>(null);
  const [manualMode, setManualMode] = useState(false);
  const [userPaused, setUserPaused] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [online, setOnline] = useState(navigator.onLine);
  // v8.6.108 — GLS-style flash overlay: lampeggio verde/rosso 300ms su scan
  const [flashFx, setFlashFx] = useState<"green" | "red" | null>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerFlash = useCallback((kind: "green" | "red") => {
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    setFlashFx(kind);
    flashTimerRef.current = setTimeout(() => setFlashFx(null), 300);
  }, []);
  useEffect(() => () => {
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
  }, []);

  const manualInputRef = useRef<HTMLInputElement>(null);
  const lookupInFlightRef = useRef(false);
  // v8.6.121 — Coda FIFO: se un lookup è già in corso, le nuove scansioni
  // vengono accodate (non scartate) e drenate quando il lookup finisce. Gli
  // articoli restano risolti UNO alla volta (nessuna race), ma niente scan persi.
  const scanQueueRef = useRef<Array<{ code: string; scanFormat?: string }>>([]);
  const scanSessionRef = useRef(0);
  const scanActiveRef = useRef(false);
  useEffect(() => { scanActiveRef.current = open && !userPaused && !isConfirming; }, [open, userPaused, isConfirming]);
  useEffect(() => {
    lookupInFlightRef.current = false;
    return () => { scanSessionRef.current += 1; scanQueueRef.current = []; };
  }, [open]);
  const handleScanRef = useRef<(code: string, scanFormat?: string, fromQueue?: boolean) => void>(
    () => {},
  );

  const lookup = useBarcodeLookup();
  const {
    entries,
    appendEntry,
    mergeResolvedEntry,
    updateEntryQty,
    updateEntryPrice,
    removeEntry,
    promoteNoMatch,
    trackDuplicate,
    noMatchCount,
  } = useBatchScannerEntries({ initialEntries, onEntriesChange });
  const scannerPaused = userPaused || isConfirming || ((mode === "lookup" || confirmEachScan) && !!lookupResult);
  const latestEntry = entries.reduce<BatchScanEntry | null>((last, entry) => !last || entry.scannedAt >= last.scannedAt ? entry : last, null);
  const pendingMaxQuantity = useMemo(() => {
    if (!lookupResult?.stockItemId) return Infinity;
    if (mode === "oda_receive" && pendingOda) {
      const max = allowedOdaItems?.find(row => row.odaItemId === pendingOda)?.qtyPending ?? Infinity;
      return Math.max(0, max - entries.filter(entry => entry.odaItemId === pendingOda).reduce((sum, entry) => sum + entry.quantity, 0));
    }
    if (mode === "carico" && allowedOrderItems) {
      const max = allowedOrderItems.find(row => row.stockItemId === lookupResult.stockItemId)?.qtyRequired ?? Infinity;
      return Math.max(0, max - entries.filter(entry => entry.stockItemId === lookupResult.stockItemId).reduce((sum, entry) => sum + entry.quantity, 0));
    }
    return Infinity;
  }, [allowedOdaItems, allowedOrderItems, entries, lookupResult, mode, pendingOda]);
  const invalidSerializedCount = useMemo(
    () =>
      entries.filter(
        (entry) =>
          entry.stockItemId !== null &&
          entry.trackingMode === "serialized" &&
          entry.serialNumbers.length === 0,
      ).length,
    [entries],
  );

  // Network monitor: aggiorna online flag.
  useEffect(() => {
    const off = onNetworkChange((s) => setOnline(s.connected));
    return off;
  }, []);

  // Auto-focus input manuale quando attivato.
  useEffect(() => {
    if (manualMode && open) {
      const t = setTimeout(() => manualInputRef.current?.focus(), 100);
      return () => clearTimeout(t);
    }
  }, [manualMode, open]);

  // v8.6.121 — Drena la prossima scansione accodata (FIFO). Chiamata sia nel
  // finally del lookup sia sul ramo multi-seriale (che esce prima del try).
  const drainQueue = useCallback(() => {
    if (!scanActiveRef.current || lookupResultRef.current || lookupInFlightRef.current) return;
    const queued = scanQueueRef.current.shift();
    if (queued) void handleScanRef.current(queued.code, queued.scanFormat, true);
  }, []);

  // ─── Handler scansione ───────────────────────────────────
  const handleScan = useCallback(
    async (rawCode: string, scanFormat?: string, fromQueue = false) => {
      const code = rawCode.trim();
      if (!code || !open || userPaused || isConfirming) return;
      if ((mode === "lookup" || confirmEachScan) && lookupResultRef.current) return;
      const scanSession = scanSessionRef.current;

      // Throttle duplicati: stesso codice in <2s viene ignorato silenziosamente.
      // Saltato per le scansioni drenate dalla coda (già passate dal throttle).
      const now = Date.now();
      if (!fromQueue && scanFormat !== "MANUAL" && trackDuplicate(code, now)) return;

      // Se un lookup è già in corso: ACCODA invece di scartare (no scan persi).
      // La coda viene drenata uno-alla-volta → i lookup restano serializzati.
      if (lookupInFlightRef.current) {
        if (scanQueueRef.current.length < MAX_SCAN_QUEUE) {
          scanQueueRef.current.push({ code, scanFormat });
        } else {
          console.warn("[scanner] coda scansioni piena (>", MAX_SCAN_QUEUE, "), scarto", code);
        }
        return;
      }

      // v8.6.106 — MULTI-SERIAL: rileva QR/barcode che contengono LISTA di
      // seriali (es. QR pallet fotovoltaico con 30 seriali dentro). In quel
      // caso espandiamo in N entries no-match in 1 colpo. Il banner "Crea
      // articolo unico per N scansioni" gestisce poi il collegamento.
      // NB: skip in mode='lookup' (single-shot search) - irrilevante li.
      if (mode !== "lookup") {
        const multi = tryParseMultiSerial(code);
        if (multi && multi.serials.length >= 2) {
          await successFeedback(); triggerFlash("green");
          // Crea N entries no-match (una per ogni serial estratto)
          for (const serial of multi.serials) {
            const entry: BatchScanEntry = {
              clientUuid: newBatchScanClientUuid(),
              rawCode: serial,
              scanFormat: `multi/${multi.format}`,
              stockItemId: null,
              itemName: null,
              trackingMode: null,
              quantity: 1,
              serialNumbers: [],
              scannedAt: now,
            };
            appendEntry(entry);
          }
          // Toast informativo (unico, NON N volte)
          toast.success(tr("{n} seriali estratti dal lotto", { n: multi.serials.length }), {
            description: multi.gtin
              ? tr("Formato {format} · GTIN {gtin} rilevato", { format: String(multi.format ?? ""), gtin: String(multi.gtin ?? "") })
              : tr("Formato {format}. Usa \"Crea articolo unico\" per collegarli a un prodotto.", { format: String(multi.format ?? "") }),
            duration: 4000,
          });
          drainQueue();
          return;
        }
      }

      lookupInFlightRef.current = true;
      try {
        const result = await lookup.mutateAsync({
          rawScan: code,
          supplierId,
          supplierUsesGs1,
        });

        if (scanSessionRef.current !== scanSession) return;
        const action = result.action;

        if (action.kind === "offer_create_new") {
          // v8.6.104 — GLS-STYLE: NIENTE toast warning durante scan continuo.
          // L'utente vede il codice in lista come 'no match' e lo gestisce
          // a fine sessione (review step). Solo audio errore per feedback
          // tattile, niente popup che interrompono il flusso.
          await errorFeedback(); triggerFlash("red");
          if (mode === "lookup") {
            // In lookup mode (single-shot) un toast informativo serve:
            // l'utente ha cercato esplicitamente.
            toast.warning(tr("Codice non riconosciuto"), {
              description: tr("Puoi creare subito un nuovo articolo con questo codice."),
            });
          }
          const noMatchEntry: BatchScanEntry = {
            clientUuid: newBatchScanClientUuid(),
            rawCode: code,
            scanFormat,
            stockItemId: null,
            itemName: null,
            trackingMode: null,
            quantity: 1,
            serialNumbers: [],
            scannedAt: now,
          };
          if (mode === "lookup" || confirmEachScan) {
            setLookupResult(noMatchEntry);
            return;
          }
          // Aggiungi entry "no match" così il caller può proporre la creazione
          // dopo il batch (mostra in Review step).
          appendEntry(noMatchEntry);
          return;
        }

        // Per "confirm_ambiguous": prendiamo il primo candidato per ora.
        // Una versione più avanzata mostrerebbe un dialog di scelta — ma
        // nello scanner continuo blocchi il flow. Compromesso: si seleziona
        // il primo candidato (preferred supplier), l'utente può modificarlo
        // dalla review list o cancellare e riscansionare.
        let resolvedItemId: string | null = null;
        let resolvedItemName: string | null = null;
        let resolvedTracking: "fungible" | "serialized" | null = null;
        let resolvedSerial: string | null = null;
        let resolvedAmbiguous = false;

        if (action.kind === "accept_unit") {
          resolvedItemId = action.itemId;
          const row = result.rows.find((r) => r.match_type === "unit");
          resolvedItemName = row?.item_name ?? null;
          resolvedTracking = row?.item_tracking_mode ?? "serialized";
          resolvedSerial = result.parsedPrimary;
        } else if (action.kind === "accept_item" || action.kind === "confirm_ambiguous") {
          const itemId =
            action.kind === "accept_item" ? action.itemId : action.rows[0]?.stock_item_id;
          if (!itemId) {
            await errorFeedback(); triggerFlash("red");
            return;
          }
          resolvedItemId = itemId;
          // v8.6.121 — match incerto: marca la riga per la revisione.
          resolvedAmbiguous = action.kind === "confirm_ambiguous";
          const row = result.rows.find((r) => r.stock_item_id === itemId);
          resolvedItemName = row?.item_name ?? null;
          resolvedTracking = row?.item_tracking_mode ?? "fungible";
          // Se GS1 ha estratto un seriale (AI 21), usalo per pre-popolare
          // serial_numbers anche se il match è di tipo "item".
          if (result.gs1?.serialNumber && resolvedTracking === "serialized") {
            resolvedSerial = result.gs1.serialNumber;
          }
        }

        if (!resolvedItemId) return;

        const nextEntry: BatchScanEntry = {
          clientUuid: newBatchScanClientUuid(),
          rawCode: code,
          scanFormat,
          stockItemId: resolvedItemId,
          itemName: resolvedItemName,
          trackingMode: resolvedTracking,
          quantity: 1,
          serialNumbers: resolvedSerial ? [resolvedSerial] : [],
          odaItemId: null,
          scannedAt: now,
          ambiguous: resolvedAmbiguous || undefined,
          unitOfMeasure: entries.find(entry => entry.stockItemId === resolvedItemId)?.unitOfMeasure ?? (resolvedTracking === "serialized" ? "pz" : null),
        };

        if (mode === "lookup") {
          setLookupResult(nextEntry);
          await successFeedback(); triggerFlash("green");
          return;
        }

        // Validazione mode='carico' (scarico verso ordine): se allowedOrderItems
        // e fornito, controlliamo il match con le righe ordine.
        // Pattern uguale a oda_receive (linea sotto): warning + accept-as-extra.
        // Non bloccante perche righe ordine possono avere stock_item_id NULL
        // (non ancora linkate a magazzino) -> falso negativo possibile.
        // Il magazziniere ha sempre l'ultima parola.
        if (mode === "carico" && allowedOrderItems) {
          const allowed = allowedOrderItems.find((a) => a.stockItemId === resolvedItemId);
          if (!allowed) {
            // v8.6.104 — GLS-STYLE: niente toast intermedio. Solo audio + entry
            // marked come extra. Review a fine sessione mostrera 'X extra'.
            await errorFeedback(); triggerFlash("red");
          } else {
            const alreadyScannedQty = entries
              .filter((entry) => entry.stockItemId === allowed.stockItemId)
              .reduce((sum, entry) => sum + entry.quantity, 0);
            if (alreadyScannedQty >= allowed.qtyRequired) {
              await errorFeedback(); triggerFlash("red");
              toast.warning(tr("Quantita gia completa"), {
                description: tr("Hai gia scansionato {alreadyScannedQty}/{qtyRequired} per {itemName}.", { alreadyScannedQty: String(alreadyScannedQty ?? ""), qtyRequired: String(allowed.qtyRequired ?? ""), itemName: String(allowed.itemName ?? "") }),
              });
              return;
            }
          }
        }

        // Validazione mode='oda_receive': l'articolo deve essere in allowedOdaItems.
        let odaItemId: string | null = null;
        if (mode === "oda_receive" && allowedOdaItems) {
          const allowed = allowedOdaItems.find((a) => a.stockItemId === resolvedItemId);
          if (!allowed) {
            await errorFeedback(); triggerFlash("red");
            toast.warning(tr("Articolo non incluso in questa ODA"), {
              description: tr("Aggiunto come extra (oda_item_id=null)"),
            });
            // proseguiamo comunque ma con odaItemId=null (extra)
          } else {
            odaItemId = allowed.odaItemId;
            const alreadyScanned = entries
              .filter((entry) => entry.odaItemId === allowed.odaItemId)
              .reduce((sum, entry) => sum + entry.quantity, 0);
            if (alreadyScanned >= allowed.qtyPending) {
              await errorFeedback(); triggerFlash("red");
              toast.warning(tr("Quantità ODA già completa"), {
                description: tr("Questa riga ha già raggiunto il residuo da ricevere."),
              });
              return;
            }
          }
        }

        // confirmEachScan: non aggiungere subito — metti in pausa e chiedi conferma
        // (l'articolo è stato trovato; il popup mostra nome+codice).
        if (confirmEachScan) {
          setPendingOda(odaItemId);
          setLookupResult(nextEntry);
          await successFeedback(); triggerFlash("green");
          return;
        }

        mergeResolvedEntry(nextEntry, odaItemId);

        await successFeedback(); triggerFlash("green");
      } catch (err) {
        if (scanSessionRef.current !== scanSession) return;
        await errorFeedback(); triggerFlash("red");
        toast.error(tr("Errore lookup"), {
          description: (err as Error)?.message ?? tr("Riprova"),
        });
      } finally {
        if (scanSessionRef.current === scanSession) {
          lookupInFlightRef.current = false;
          drainQueue();
        }
      }
    },
    [
      open,
      userPaused,
      isConfirming,
      allowedOdaItems,
      allowedOrderItems,
      appendEntry,
      confirmEachScan,
      drainQueue,
      entries,
      lookup,
      mergeResolvedEntry,
      mode,
      supplierId,
      supplierUsesGs1,
      trackDuplicate,
      triggerFlash,
      setLookupResult,
    ],
  );

  // v8.6.121 — Tiene `handleScanRef` allineato all'ultima closure di handleScan,
  // così `drainQueue` può re-invocarlo senza creare una dipendenza ciclica.
  useEffect(() => {
    handleScanRef.current = handleScan;
  }, [handleScan]);
  useEffect(() => { if (open && !scannerPaused) drainQueue(); }, [drainQueue, open, scannerPaused]);

  const {
    videoRef,
    cameraError,
    isStarting,
    cameraReady,
    torchOn,
    torchSupported,
    toggleTorch,
    handleTapFocus,
  } = useBatchScannerCamera({
    open,
    manualMode,
    paused: scannerPaused,
    onScan: handleScan,
    onCameraError: () => setManualMode(true),
  });

  const { canConfirm, handleConfirm } = useBatchScannerSubmit({
    mode,
    entries,
    noMatchCount,
    invalidSerializedCount,
    isConfirming,
    onConfirm,
  });

  function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    const c = manualCode.trim();
    if (!c || lookupInFlightRef.current || lookupResult || isConfirming) return;
    void handleScan(c, "MANUAL");
  }

  // ID dell'entry attualmente in corso di creazione (per disabilitare il
  // bottone e mostrare lo spinner solo su quella riga).
  const [creatingForUuid, setCreatingForUuid] = useState<string | null>(null);

  /**
   * Inline create: il caller apre un StockItemDialog precompilato, e quando
   * l'utente salva risolve la promessa con l'item creato. La riga no-match
   * viene "promossa" a entry valida con stockItemId/itemName/trackingMode.
   */
  const handleCreateFromNoMatch = useCallback(
    async (uuid: string) => {
      if (!onRequestCreateItem) return;
      const target = entries.find((e) => e.clientUuid === uuid);
      if (!target) return;
      setCreatingForUuid(uuid);
      try {
        const result = await onRequestCreateItem(target.rawCode);
        if (!result) return; // utente ha annullato il dialog
        promoteNoMatch(uuid, result);
        await successFeedback(); triggerFlash("green");
        toast.success(tr("Articolo creato e collegato alla scansione"));
      } catch (err) {
        toast.error(tr("Errore creazione articolo"), {
          description: (err as Error)?.message ?? tr("Riprova"),
        });
      } finally {
        setCreatingForUuid(null);
      }
    },
    [entries, onRequestCreateItem, promoteNoMatch, triggerFlash],
  );

  /**
   * v8.6.104 — BATCH create articolo per TUTTI i no-match in 1 colpo.
   * Caso d'uso fotovoltaico: arrivano 30 pannelli nuovi -> 30 'no match' (perche
   * il modello non e mai stato a listino) -> apri 30 dialog 'crea articolo'?
   * No grazie. Apri 1 solo dialog, crei l'articolo, e tutti i 30 codici scansionati
   * vengono promossi come SERIALI di quel singolo articolo.
   *
   * Logica: prendiamo il primo no-match come 'pilot' per l'apertura del dialog,
   * poi su success promuoviamo TUTTE le entry no-match al nuovo stockItemId
   * (con il rawCode di ognuna come serial number).
   */
  const handleCreateUnicoFromAllNoMatch = useCallback(async () => {
    if (!onRequestCreateItem) return;
    const noMatchEntries = entries.filter((e) => e.stockItemId === null);
    if (noMatchEntries.length === 0) return;
    const pilot = noMatchEntries[0];
    setCreatingForUuid(pilot.clientUuid);
    try {
      // v8.6.111 — Passa tutti i rawCode al dialog come 'serials' hint.
      // Il dialog propone tracking serializzato; le unità vengono registrate
      // dal carico, dopo la conferma dello scanner.
      const allSerials = noMatchEntries.map((e) => e.rawCode);
      const result = await onRequestCreateItem(pilot.rawCode, { serials: allSerials });
      if (!result) return; // utente ha annullato
      // Promuovi TUTTE le entry no-match al nuovo articolo. Ognuna mantiene
      // il suo rawCode come serial (se il tracking e' serialized).
      for (const entry of noMatchEntries) {
        promoteNoMatch(entry.clientUuid, result);
      }
      await successFeedback(); triggerFlash("green");
      toast.success(tr("{n} scansioni collegate a \"{itemName}\"", { n: noMatchEntries.length, itemName: String(result.itemName ?? "") }));
    } catch (err) {
      toast.error(tr("Errore creazione articolo"), {
        description: (err as Error)?.message ?? tr("Riprova"),
      });
    } finally {
      setCreatingForUuid(null);
    }
  }, [entries, onRequestCreateItem, promoteNoMatch, triggerFlash]);

  const cameraSizeClass = manualMode ? "shrink-0" : scannerPaused ? "h-28 sm:h-40 shrink-0 [@media(max-height:600px)]:!h-24" : "h-[clamp(120px,31dvh,300px)] sm:h-64 shrink-0 [@media(max-height:600px)]:!h-24";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {/* v8.6.118 — Sheet full-screen su mobile (h-[100svh]) per dare massimo
          spazio alla camera. Su desktop resta 90svh come prima. */}
      <SheetContent side="bottom" className="h-[100dvh] max-h-[100dvh] sm:h-[90dvh] sm:max-h-[90dvh] flex flex-col gap-0 overflow-hidden p-0 [&>div[aria-hidden=true]]:hidden [&>button]:min-h-11 [&>button]:min-w-11 [&>button]:top-1 [&>button]:right-1 [&>button]:text-white">
        {/* Header compatto: padding ridotto su mobile per piu spazio camera */}
        <SheetHeader className="bg-[#193b64] text-white pl-4 pr-14 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 border-b shrink-0 text-left">
          <div className="flex items-center justify-between gap-2">
            <SheetTitle className="text-white text-sm sm:text-base flex items-center gap-2 min-w-0">
              <ScanLine className="h-4 w-4 sm:h-5 sm:w-5 text-amber-400 shrink-0" />
              <span className="truncate">
                {mode === "lookup"
                  ? tr("Cerca articolo")
                  : mode === "oda_receive"
                    ? tr("Ricezione da ODA")
                    : allowedOrderItems ? tr("Prelievo per commessa") : tr("Carico con scanner")}
              </span>
            </SheetTitle>
            <div className="flex items-center gap-1.5">
              {!online && (
                <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 gap-1">
                  <WifiOff className="h-3 w-3" />
                  {tr("Offline")}
                </Badge>
              )}
              {mode !== "lookup" && (
                <Badge variant="outline" className="border-white/30 text-white text-xs">
                  {entries.length} {entries.length === 1 ? tr("riga") : tr("righe")}
                </Badge>
              )}
            </div>
          </div>
          <SheetDescription className="text-xs text-blue-100 break-words">{contextLabel || tr("Inquadra il codice e controlla l’articolo prima di continuare.")}</SheetDescription>
        </SheetHeader>

        {/* v8.6.119 — Camera area FULL-VIEWPORT su mobile (flex-1) per
            massimizzare lo spazio scanner. Su desktop torna ad aspect-video. */}
        <div className={`${cameraSizeClass} relative bg-slate-950 overflow-hidden`}>
          {!manualMode ? (
            <div className="relative h-full">
              <video
                ref={videoRef}
                className="w-full h-full object-cover cursor-pointer"
                aria-label={tr("Anteprima fotocamera scanner")}
                playsInline
                muted
                autoPlay
                onClick={handleTapFocus}
              />
              {/* v8.6.108 — Flash overlay GLS-style: lampeggio verde/rosso 300ms */}
              <div
                className={`absolute inset-0 pointer-events-none transition-opacity duration-150 ${
                  flashFx === "green"
                    ? "bg-emerald-500/50 opacity-100"
                    : flashFx === "red"
                    ? "bg-red-500/50 opacity-100"
                    : "opacity-0"
                }`}
              />
              {(isStarting || scannerPaused || (!cameraReady && !cameraError)) && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-slate-950/90 text-white px-4 text-center" role="status">
                  {isStarting ? <Loader2 className="h-7 w-7 animate-spin" /> : <ScanLine className="h-7 w-7 text-amber-400" />}
                  <p className="text-sm font-medium">{isStarting ? tr("Avvio fotocamera…") : lookupResult ? tr("Codice letto: verifica i dettagli sotto") : userPaused ? tr("Scansione in pausa") : tr("Preparazione fotocamera…")}</p>
                </div>
              )}
              {/* v8.6.119 — Reticolo grande con SCAN LINE animata (laser effect)
                  + corner brackets pi&ugrave; pro */}
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div className="relative w-[88%] max-w-md h-[55%] max-h-48 sm:h-32 sm:w-3/4 sm:max-w-xs">
                  {/* Dim background outside the reticule */}
                  <div className="absolute inset-0 rounded-xl shadow-[0_0_0_9999px_rgba(0,0,0,0.55)] sm:shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
                  {/* Corner brackets (4 corners) — solo mobile */}
                  <div className="absolute -top-1 -left-1 w-7 h-7 border-t-[4px] border-l-[4px] border-emerald-400 rounded-tl-lg sm:hidden" />
                  <div className="absolute -top-1 -right-1 w-7 h-7 border-t-[4px] border-r-[4px] border-emerald-400 rounded-tr-lg sm:hidden" />
                  <div className="absolute -bottom-1 -left-1 w-7 h-7 border-b-[4px] border-l-[4px] border-emerald-400 rounded-bl-lg sm:hidden" />
                  <div className="absolute -bottom-1 -right-1 w-7 h-7 border-b-[4px] border-r-[4px] border-emerald-400 rounded-br-lg sm:hidden" />
                  {/* Fallback border per desktop */}
                  <div className="absolute inset-0 border-2 border-white/70 rounded-xl hidden sm:block" />
                  {/* SCAN LINE animata (effetto laser) */}
                  <div className="absolute inset-x-2 top-2 bottom-2 overflow-hidden rounded-lg">
                    <div className="absolute inset-x-0 h-0.5 bg-gradient-to-r from-transparent via-emerald-400 to-transparent shadow-[0_0_12px_2px_rgba(52,211,153,0.8)] motion-safe:animate-scan" />
                  </div>
                </div>
              </div>
              {/* Hint tap-to-focus */}
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-white text-xs bg-black/60 px-3 py-1.5 rounded-full pointer-events-none font-medium">
                {tr("Tocca per mettere a fuoco")}
              </div>
              {lookup.isPending && (
                <div className="absolute bottom-14 sm:bottom-2 left-1/2 -translate-x-1/2 bg-black/80 text-white text-sm sm:text-xs px-3 py-1.5 sm:px-2 sm:py-1 rounded-full flex items-center gap-2">
                  <Loader2 className="h-4 w-4 sm:h-3 sm:w-3 animate-spin" />
                  {tr("Cerco l’articolo…")}
                </div>
              )}
              {cameraError && (
                <div className="absolute inset-0 bg-black/85 flex items-center justify-center p-4">
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription className="text-xs">{tr("{cameraError}. Usa l'inserimento manuale.", { cameraError: String(cameraError ?? "") })}</AlertDescription>
                  </Alert>
                </div>
              )}
            </div>
          ) : (
            <form
              onSubmit={handleManualSubmit}
              className="bg-card p-4 border-b space-y-3"
              aria-label={tr("Inserimento codice scanner")}
            >
              {cameraError && (
                <Alert className="border-amber-200 bg-amber-50 text-amber-900">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription className="text-xs">{tr("{cameraError} Puoi riprovare la fotocamera o inserire il codice.", { cameraError: String(cameraError ?? "") })}</AlertDescription>
                </Alert>
              )}
              <div className="flex items-end gap-2">
                <div className="flex-1 space-y-1">
                  <Label htmlFor="bs-manual" className="text-xs">
                    {tr("Codice manuale")}
                  </Label>
                  <Input
                    ref={manualInputRef}
                    id="bs-manual"
                    value={manualCode}
                    onChange={(e) => setManualCode(e.target.value)}
                    placeholder={tr("Digita o incolla...")}
                    autoComplete="off"
                    className="h-12 text-base font-mono"
                    autoCapitalize="off"
                    spellCheck={false}
                    enterKeyHint="search"
                  />
                </div>
                <Button
                  type="submit"
                  disabled={!manualCode.trim() || lookup.isPending || scannerPaused}
                  className="shrink-0 h-12 gap-1.5"
                  aria-label={tr("Cerca codice manuale")}
                >
                  <ScanLine className="h-4 w-4" />
                  <span>{tr("Cerca")}</span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => {setUserPaused(false);setManualMode(false);}}
                  className="h-12 w-12 shrink-0"
                  aria-label={cameraError ? tr("Riprova fotocamera") : tr("Torna alla camera")}
                >
                  <Camera className="h-4 w-4" />
                </Button>
              </div>
            </form>
          )}
        </div>

        {!manualMode && (
          <div className="grid grid-cols-3 gap-2 border-b bg-card px-3 py-2 shrink-0" aria-label={tr("Comandi scanner")}>
            <Button type="button" variant="outline" onClick={() => {setUserPaused(false);setManualMode(true);}} className="h-12 gap-1.5 px-2 text-xs" aria-label={tr("Inserimento manuale")}><Keyboard className="h-4 w-4 shrink-0" />{tr("Digita codice")}</Button>
            <Button type="button" variant="outline" onClick={toggleTorch} disabled={!torchSupported || scannerPaused || isStarting} aria-pressed={torchOn} aria-label={torchOn ? tr("Spegni torcia") : tr("Accendi torcia")} className="h-12 gap-1.5 px-2 text-xs">{torchOn ? <FlashlightOff className="h-4 w-4 shrink-0" /> : <Flashlight className="h-4 w-4 shrink-0" />}{tr("Luce")}{!torchSupported && <span className="sr-only"> {tr("non disponibile")}</span>}</Button>
            <Button type="button" variant={userPaused ? "default" : "outline"} onClick={() => setUserPaused(value => !value)} disabled={!!lookupResult || isConfirming} aria-pressed={userPaused} className="h-12 gap-1.5 px-2 text-xs">{userPaused ? <Play className="h-4 w-4 shrink-0" /> : <Pause className="h-4 w-4 shrink-0" />}{userPaused ? tr("Riprendi") : tr("Pausa")}</Button>
          </div>
        )}
        <div className="shrink-0 border-b bg-slate-50 px-4 py-2 text-xs" role="status" aria-live="polite">
          {lookup.isPending ? tr("Ricerca articolo in corso…") : lookupResult ? tr("Controlla il codice e conferma l’articolo.") : latestEntry ? <>{tr("Ultimo aggiunto:")} <strong>{latestEntry.itemName || latestEntry.rawCode}</strong></> : tr("Inquadra un codice alla volta, a circa 15–25 cm.")}
        </div>

        {/* Progress bar ordine — visibile solo se allowedOrderItems fornito.
            Mostra a colpo d'occhio quante unita restano da scansionare per
            ogni articolo della commessa. Update live ad ogni scan. */}
        {mode === "carico" && allowedOrderItems && allowedOrderItems.length > 0 && (
          <div className="shrink-0 border-b bg-muted/30 px-3 py-2 space-y-1.5 max-h-[35vh] overflow-y-auto">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
              {tr("Avanzamento ordine")}
            </p>
            {allowedOrderItems.map((row) => {
              const scanned = entries
                .filter((e) => e.stockItemId === row.stockItemId)
                .reduce((sum, e) => sum + e.quantity, 0);
              const pct = row.qtyRequired > 0
                ? Math.min(100, (scanned / row.qtyRequired) * 100)
                : 0;
              const done = scanned >= row.qtyRequired;
              return (
                <div key={row.orderItemId} className="space-y-0.5">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className={`truncate ${done ? "text-emerald-700 dark:text-emerald-400 font-medium" : ""}`}>
                      {done ? "✅" : "🟡"} {row.itemName}
                    </span>
                    <span className={`tabular-nums shrink-0 ${done ? "text-emerald-700 dark:text-emerald-400 font-semibold" : "text-muted-foreground"}`}>
                      {scanned}/{row.qtyRequired}
                    </span>
                  </div>
                  <div className="h-1 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full transition-all ${done ? "bg-emerald-500" : "bg-violet-500"}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Risultato lookup single-shot / Entries list batch */}
        <ScrollArea className="flex-1 min-h-0" role="region" aria-label={tr("Articoli scansionati")}>
          <div className="p-4 space-y-2">
            {confirmEachScan && lookupResult ? (
              <ConfirmAddPanel
                result={lookupResult}
                canCreate={!!onRequestCreateItem}
                maxQuantity={pendingMaxQuantity}
                onConfirmAdd={(qty) => {
                  if (!Number.isFinite(qty) || qty <= 0 || qty > pendingMaxQuantity) { toast.error(tr("La quantità supera il residuo da registrare.")); return; }
                  if (lookupResult.stockItemId) {
                    mergeResolvedEntry({ ...lookupResult, quantity: qty }, pendingOda);
                  }
                  setPendingOda(null);
                  setLookupResult(null);
                }}
                onCreate={async () => {
                  if (!onRequestCreateItem) return;
                  const created = await onRequestCreateItem(lookupResult.rawCode);
                  if (created) {
                    mergeResolvedEntry({
                      ...lookupResult,
                      stockItemId: created.stockItemId,
                      itemName: created.itemName,
                      trackingMode: created.trackingMode,
                    }, pendingOda);
                  }
                  setPendingOda(null);
                  setLookupResult(null);
                }}
                onCancel={() => { setPendingOda(null); setLookupResult(null); }}
              />
            ) : mode === "lookup" && lookupResult ? (
              <LookupResultPanel
                result={lookupResult}
                onFilterInTable={() => {
                  onLookupFilter?.(lookupResult.stockItemId ?? undefined);
                  onOpenChange(false);
                }}
                onEditItem={() => {
                  onLookupEdit?.(lookupResult.stockItemId ?? undefined);
                  onOpenChange(false);
                }}
                onCreateNew={() => {
                  onLookupCreateNew?.(lookupResult.rawCode);
                  onOpenChange(false);
                }}
                onScanAgain={() => setLookupResult(null)}
              />
            ) : entries.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <ScanLine className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p className="text-sm">
                  {mode === "lookup"
                    ? tr("Inquadra il QR / barcode per cercare un articolo.")
                    : tr("Inquadra il QR / barcode per iniziare.")}
                </p>
                {mode === "oda_receive" && (
                  <p className="text-[11px] mt-1">
                    {tr("Solo articoli inclusi nell'ODA verranno accettati direttamente.")}
                  </p>
                )}
              </div>
            ) : (
              <>
              {/* v8.6.104 — BATCH banner: se ci sono no-match e supportiamo
                  inline create, proponi 1 sola creazione articolo per TUTTI.
                  Caso d'uso: 30 pannelli fotovoltaici nuovi -> 1 click invece
                  di 30 dialog 'crea articolo'. */}
              {noMatchCount >= 2 && onRequestCreateItem && (
                <div className="rounded-lg border-2 border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700 p-3 mb-2 flex items-start gap-3">
                  <PackagePlus className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">{tr("{noMatchCount} scansioni non riconosciute", { noMatchCount: String(noMatchCount ?? "") })}</p>
                    <p className="text-xs text-amber-800 dark:text-amber-200 mt-0.5">
                      {tr("Probabilmente sono tutti seriali dello stesso modello (es. pannelli SPR-P7). Crea 1 articolo unico → li collego tutti.")}
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleCreateUnicoFromAllNoMatch}
                      disabled={creatingForUuid !== null}
                      className="mt-2 min-h-11 h-auto py-2 whitespace-normal gap-2 bg-amber-600 hover:bg-amber-700 text-white"
                    >
                      {creatingForUuid !== null ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <PackagePlus className="h-3.5 w-3.5" />
                      )}
                      {tr("Crea articolo unico per {noMatchCount} scansioni", { noMatchCount })}
                    </Button>
                  </div>
                </div>
              )}
              {entries.map((entry) => {
                // BUG FIX (audit v8.6.103): l'incremento manuale [+] bypassava
                // la validation allowedOrderItems per mode='carico'. Ora il
                // check tiene conto della qty residua sia per oda_receive sia
                // per carico verso ordine.
                let canIncrement = true;
                if (mode === "oda_receive" && entry.odaItemId && allowedOdaItems) {
                  const max = allowedOdaItems.find((item) => item.odaItemId === entry.odaItemId)?.qtyPending ?? Infinity;
                  canIncrement = entry.quantity + 1 <= max;
                } else if (mode === "carico" && allowedOrderItems) {
                  const allowed = allowedOrderItems.find((a) => a.stockItemId === entry.stockItemId);
                  if (allowed) {
                    // Conto le quantita gia presenti su questo stockItemId
                    // (non sommo tutte le entries, sommo le entries dello
                    // stesso articolo - puo esserci una sola entry aggregata).
                    const totalForItem = entries
                      .filter((e) => e.stockItemId === entry.stockItemId)
                      .reduce((sum, e) => sum + e.quantity, 0);
                    canIncrement = totalForItem + 1 <= allowed.qtyRequired;
                  }
                }
                return (
                <EntryRow
                  key={entry.clientUuid}
                  entry={entry}
                  showPrice={mode === "carico"}
                  onPriceChange={(p) => updateEntryPrice(entry.clientUuid, p)}
                  onIncrement={() => updateEntryQty(entry.clientUuid, +1)}
                  onDecrement={() => updateEntryQty(entry.clientUuid, -1)}
                  canIncrement={canIncrement}
                  onRemove={() => removeEntry(entry.clientUuid)}
                  onCreateFromNoMatch={
                    onRequestCreateItem
                      ? () => handleCreateFromNoMatch(entry.clientUuid)
                      : undefined
                  }
                  creating={creatingForUuid === entry.clientUuid}
                />
                );
              })}
              </>
            )}
          </div>
        </ScrollArea>

        {/* Footer with confirm CTA */}
        {mode !== "lookup" && (
          <div className="border-t p-3 space-y-2 shrink-0 bg-card">
            {entries.length > 0 && (
              <div className="grid grid-cols-2 gap-2 [@media(max-height:600px)]:hidden">
                <div className="rounded-md border bg-muted/30 px-2 py-1.5 text-center">
                  <p className="text-sm font-bold leading-tight">{entries.length}</p>
                  <p className="text-[10px] text-muted-foreground">{tr("righe")}</p>
                </div>
                <div
                  className={`rounded-md border px-2 py-1.5 text-center ${
                    noMatchCount > 0 || invalidSerializedCount > 0
                      ? "border-amber-200 bg-amber-50 text-amber-800"
                      : "bg-emerald-50 text-emerald-700 border-emerald-200"
                  }`}
                >
                  <p className="text-sm font-bold leading-tight">{noMatchCount + invalidSerializedCount}</p>
                  <p className="text-[10px]">{tr("da sistemare")}</p>
                </div>
              </div>
            )}
            {noMatchCount > 0 && (
              <Alert>
                <Package className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  {tr(noMatchCount === 1 ? "{noMatchCount} scansione senza match in anagrafica." : "{noMatchCount} scansioni senza match in anagrafica.", { noMatchCount })}{" "}
                  {onRequestCreateItem
                    ? tr("Tocca \"Crea\" sulla riga per registrare l'articolo, oppure rimuovila.")
                    : tr("Prima di confermare crea l'articolo o rimuovi la riga.")}
                </AlertDescription>
              </Alert>
            )}
            {invalidSerializedCount > 0 && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-xs">{tr("{invalidSerializedCount} articolo serializzato senza seriale. Scansiona il QR/seriale dell'unità oppure rimuovi la riga prima di confermare.", { invalidSerializedCount: String(invalidSerializedCount ?? "") })}</AlertDescription>
              </Alert>
            )}
            {/* v8.6.119 — Footer CTA GROSSI su mobile (h-14 vs h-10) per
                touch target generoso + visibilita sticky bottom.
                safe-area-inset-bottom rispetta home indicator iPhone. */}
            <div className="flex gap-2 pb-[env(safe-area-inset-bottom)]">
              <Button
                type="button"
                variant="outline"
                onClick={onBack ?? (() => onOpenChange(false))}
                className="min-w-0 flex-1 h-14 sm:h-11 text-sm font-medium whitespace-normal leading-tight"
              >
                {onBack ? (
                  <ArrowLeft className="h-5 w-5 sm:h-4 sm:w-4 mr-2" />
                ) : (
                  <X className="h-5 w-5 sm:h-4 sm:w-4 mr-2" />
                )}
                {onBack ? backLabel : tr("Chiudi")}
              </Button>
              <Button
                type="button"
                onClick={() => { if (!lookupResultRef.current && !lookupInFlightRef.current && !scanQueueRef.current.length && creatingForUuid === null) handleConfirm(); }}
                disabled={!canConfirm || !!lookupResult || lookup.isPending || creatingForUuid !== null}
                className="min-w-0 flex-[2] h-14 sm:h-11 text-sm font-semibold whitespace-normal leading-tight shadow-lg"
              >
                {isConfirming ? (
                  <>
                    <Loader2 className="h-5 w-5 sm:h-4 sm:w-4 mr-2 animate-spin" />
                    {tr("Salvataggio...")}
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-5 w-5 sm:h-4 sm:w-4 mr-2" />
                    {confirmLabel} ({entries.length})
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ────────────────────────────────────────────────────────────
// ConfirmAddPanel — popup di conferma "una alla volta" (confirmEachScan).
// Articolo trovato → associa (+ quantità per i non-serializzati);
// non trovato → crea articolo. Sostituisce l'aggiunta automatica.
// ────────────────────────────────────────────────────────────
function ConfirmAddPanel({
  result,
  canCreate,
  onConfirmAdd,
  maxQuantity,
  onCreate,
  onCancel,
}: {
  result: BatchScanEntry;
  canCreate: boolean;
  onConfirmAdd: (qty: number) => void;
  maxQuantity: number;
  onCreate: () => void | Promise<void>;
  onCancel: () => void;
}) {
  const t = useT();
  const matched = !!result.stockItemId;
  const serialized = result.trackingMode === "serialized";
  const [quantityText, setQuantityText] = useState(String(Math.min(1, maxQuantity)));
  const qty = Number(quantityText.trim().replace(",", "."));
  const quantityValid = Number.isFinite(qty) && qty > 0 && qty <= maxQuantity && (result.unitOfMeasure !== "pz" || Number.isInteger(qty));
  const [creating, setCreating] = useState(false);

  return (
    <div className="rounded-xl border-2 border-primary/40 bg-primary/5 p-4 space-y-4">
      <div className="flex items-start gap-3">
        <div className={`rounded-full p-2 shrink-0 ${matched ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
          {matched ? <Package className="h-5 w-5" /> : <PackagePlus className="h-5 w-5" />}
        </div>
        <div className="min-w-0 flex-1">
          {matched ? (
            <>
              <p className="font-semibold text-sm leading-tight">{result.itemName || t("Articolo")}</p>
              <p className="text-xs text-emerald-700 mt-0.5">{t("✓ Trovato a sistema")}</p>
            </>
          ) : (
            <>
              <p className="font-semibold text-sm leading-tight">{t("Articolo non trovato")}</p>
              <p className="text-xs text-amber-700 mt-0.5">{t("Crealo per associarlo a questo codice")}</p>
            </>
          )}
          <p className="text-[11px] font-mono text-muted-foreground mt-1 truncate">{result.rawCode}</p>
          {serialized && result.serialNumbers[0] && (
            <p className="text-[11px] text-muted-foreground">{t("Seriale: {valore}", { valore: String(result.serialNumbers[0] ?? "") })}</p>
          )}
        </div>
      </div>

      {matched && !serialized && (
        <div className="space-y-2">
          <Label htmlFor="scanner-confirm-quantity" className="text-sm">{t("Quantità")}{result.unitOfMeasure ? ` (${result.unitOfMeasure})` : ""}</Label>
          <div className="flex items-center gap-2">
            <Button type="button" size="icon" variant="outline" className="h-12 w-12 shrink-0" aria-label={t("Riduci quantità da aggiungere")} disabled={!quantityValid || qty <= 1} onClick={() => setQuantityText(String(Math.max(0, qty - 1)))}>−</Button>
            <Input id="scanner-confirm-quantity" type="text" inputMode="decimal" value={quantityText} onChange={event => setQuantityText(event.target.value)} aria-invalid={!quantityValid} aria-describedby={!quantityValid ? "scanner-quantity-error" : undefined} className="h-12 min-w-0 flex-1 text-base text-center font-semibold tabular-nums" />
            <Button type="button" size="icon" variant="outline" className="h-12 w-12 shrink-0" aria-label={t("Aumenta quantità da aggiungere")} disabled={!quantityValid || qty + 1 > maxQuantity} onClick={() => setQuantityText(String(qty + 1))}>+</Button>
          </div>
          {Number.isFinite(maxQuantity) && <p className="text-xs text-muted-foreground">{t("Residuo disponibile: {maxQuantity}", { maxQuantity: maxQuantity.toLocaleString(intlCampo()) })}</p>}
          {!quantityValid && <p id="scanner-quantity-error" role="alert" className="text-xs text-destructive">{t("Inserisci una quantità positiva entro il residuo")}{result.unitOfMeasure === "pz" ? t(", senza decimali") : ""}.</p>}
        </div>
      )}

      <div className="flex gap-2">
        <Button type="button" variant="ghost" onClick={onCancel} className="min-h-12 flex-1">
          <X className="h-4 w-4 mr-1" /> {t("Annulla")}
        </Button>
        {matched ? (
          <Button type="button" disabled={!serialized && !quantityValid} onClick={() => onConfirmAdd(serialized ? Math.max(1, result.serialNumbers.length || 1) : qty)} className="min-h-12 min-w-0 flex-[2] whitespace-normal leading-tight">
            <Check className="h-4 w-4 mr-1" /> {t("Conferma e aggiungi")}
          </Button>
        ) : (
          <Button type="button" disabled={!canCreate || creating}
            onClick={async () => { setCreating(true); try { await onCreate(); } finally { setCreating(false); } }}
            className="min-h-12 min-w-0 flex-[2] whitespace-normal leading-tight">
            {creating ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <PackagePlus className="h-4 w-4 mr-1" />} {t("Crea articolo")}
          </Button>
        )}
      </div>
    </div>
  );
}

function LookupResultPanel({
  result,
  onFilterInTable,
  onEditItem,
  onCreateNew,
  onScanAgain,
}: {
  result: BatchScanEntry;
  onFilterInTable: () => void;
  onEditItem: () => void;
  onCreateNew: () => void;
  onScanAgain: () => void;
}) {
  const t = useT();
  const matched = !!result.stockItemId;

  return (
    <div className="space-y-3">
      <div className={`rounded-lg border p-4 ${matched ? "bg-emerald-50 border-emerald-200" : "bg-amber-50 border-amber-200"}`}>
        <div className="flex items-start gap-3">
          {matched ? (
            <CheckCircle2 className="h-5 w-5 text-emerald-600 mt-0.5 shrink-0" />
          ) : (
            <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            {matched ? (
              <>
                <div className="font-semibold text-base truncate">{result.itemName}</div>
                {result.serialNumbers.length > 0 && (
                  <div className="text-xs text-muted-foreground font-mono">{t("SN: {serialNumbers}", { serialNumbers: result.serialNumbers.join(", ") })}</div>
                )}
                {result.trackingMode && (
                  <Badge variant="outline" className="mt-2 text-[10px]">
                    {result.trackingMode === "serialized" ? t("Serializzato") : t("Fungibile")}
                  </Badge>
                )}
              </>
            ) : (
              <>
                <div className="font-semibold text-base">{t("Articolo non trovato")}</div>
                <div className="text-xs text-muted-foreground font-mono break-all mt-1">{t("Codice scansionato: {rawCode}", { rawCode: String(result.rawCode ?? "") })}</div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2">
        {matched ? (
          <>
            <Button onClick={onFilterInTable} className="min-h-12 w-full justify-start whitespace-normal text-left">
              <Filter className="h-4 w-4 mr-2" />
              {t("Filtra in tabella")}
            </Button>
            <Button onClick={onEditItem} variant="outline" className="min-h-12 w-full justify-start whitespace-normal text-left">
              <Edit className="h-4 w-4 mr-2" />
              {t("Modifica articolo")}
            </Button>
          </>
        ) : (
          <Button onClick={onCreateNew} className="min-h-12 w-full justify-start whitespace-normal text-left">
            <Plus className="h-4 w-4 mr-2" />
            {t("Crea nuovo articolo con questo codice")}
          </Button>
        )}
        <Button onClick={onScanAgain} variant="ghost" className="min-h-12 w-full justify-start whitespace-normal text-left">
          <ScanLine className="h-4 w-4 mr-2" />
          {t("Scansiona di nuovo")}
        </Button>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Riga entry: nome + qty controls / serial list + remove
// ────────────────────────────────────────────────────────────

function EntryRow({
  entry,
  showPrice = false,
  onPriceChange,
  onIncrement,
  onDecrement,
  canIncrement = true,
  onRemove,
  onCreateFromNoMatch,
  creating,
}: {
  entry: BatchScanEntry;
  showPrice?: boolean;
  onPriceChange?: (price: number | undefined) => void;
  onIncrement: () => void;
  onDecrement: () => void;
  canIncrement?: boolean;
  onRemove: () => void;
  onCreateFromNoMatch?: () => void;
  creating?: boolean;
}) {
  const t = useT();
  const noMatch = entry.stockItemId === null;
  return (
    <div
      className={`rounded-lg border p-3 flex flex-col sm:flex-row sm:items-center gap-3 ${
        noMatch ? "border-amber-300 bg-amber-50/40 dark:bg-amber-950/20" : "bg-card"
      }`}
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">
          {entry.itemName ?? <span className="text-amber-700">{t("Codice non riconosciuto")}</span>}
        </p>
        <p className="text-[11px] text-muted-foreground font-mono truncate">
          {entry.rawCode}
        </p>
        {showPrice && (
          <div className="mt-1.5 flex items-center gap-1.5">
            <span className="shrink-0 text-[11px] text-muted-foreground">{t("Prezzo acq.")}</span>
            <div className="relative">
              <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                €
              </span>
              <Input
                type="text"
                inputMode="decimal"
                defaultValue={entry.purchasePrice != null ? String(entry.purchasePrice) : ""}
                onChange={(e) => {
                  const raw = e.target.value.trim().replace(",", ".");
                  if (raw === "") {
                    onPriceChange?.(undefined);
                    return;
                  }
                  const n = parseFloat(raw);
                  onPriceChange?.(Number.isFinite(n) && n >= 0 ? n : undefined);
                }}
                placeholder="—"
                className="h-11 w-24 pl-5 text-base tabular-nums"
                aria-label={t("Prezzo d'acquisto per {articolo}", { articolo: String(entry.itemName ?? entry.rawCode ?? "") })}
              />
            </div>
          </div>
        )}
        {entry.ambiguous && !noMatch && (
          <Badge
            variant="outline"
            className="mt-1 gap-1 border-amber-300 bg-amber-50 text-amber-700 text-[10px] dark:bg-amber-950/30 dark:text-amber-300"
          >
            <AlertCircle className="h-3 w-3" />
            {t("Da verificare")}
          </Badge>
        )}
        {entry.trackingMode === "serialized" && entry.serialNumbers.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {entry.serialNumbers.slice(0, 4).map((sn) => (
              <Badge key={sn} variant="outline" className="text-[9px] font-mono">
                {sn.length > 14 ? `${sn.slice(0, 14)}…` : sn}
              </Badge>
            ))}
            {entry.serialNumbers.length > 4 && (
              <Badge variant="outline" className="text-[9px]">
                +{entry.serialNumbers.length - 4}
              </Badge>
            )}
          </div>
        )}
      </div>
      <div className="flex items-center gap-1.5 flex-wrap justify-end">
        {noMatch && onCreateFromNoMatch && (
          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={onCreateFromNoMatch}
            disabled={creating}
            className="h-11 gap-1.5 bg-amber-600 hover:bg-amber-700 text-white"
          >
            {creating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <PackagePlus className="h-3.5 w-3.5" />
            )}
            <span className="text-xs">{t("Crea")}</span>
          </Button>
        )}
        {entry.trackingMode === "fungible" && (
          <>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={onDecrement}
              disabled={entry.quantity <= 1}
              className="h-11 w-11"
              aria-label={t("Decrementa")}
            >
              <Minus className="h-3.5 w-3.5" />
            </Button>
            <span className="min-w-8 text-center text-sm font-medium tabular-nums">{entry.quantity.toLocaleString(intlCampo())} {entry.unitOfMeasure || ""}</span>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={onIncrement}
              disabled={!canIncrement}
              className="h-11 w-11"
              aria-label={t("Incrementa")}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </>
        )}
        {entry.trackingMode === "serialized" && (
          <Badge variant="outline" className="font-mono">{t("{quantity} sn", { quantity: String(entry.quantity ?? "") })}</Badge>
        )}
        {noMatch && (
          <Badge variant="outline" className="font-mono bg-white">
            ×{entry.quantity}
          </Badge>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onRemove}
          className="h-11 w-11 text-muted-foreground hover:text-destructive"
          aria-label={t("Rimuovi")}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
