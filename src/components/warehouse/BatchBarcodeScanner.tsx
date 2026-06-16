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
  /** Timestamp client per ordinamento UI. */
  scannedAt: number;
}

export type BatchScanMode = "carico" | "oda_receive" | "lookup";

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
}

// ────────────────────────────────────────────────────────────
// Componente principale
// ────────────────────────────────────────────────────────────

export function BatchBarcodeScanner({
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
}: BatchBarcodeScannerProps) {
  const [lookupResult, setLookupResult] = useState<BatchScanEntry | null>(null);
  const [manualMode, setManualMode] = useState(false);
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

  const lookup = useBarcodeLookup();
  const {
    entries,
    appendEntry,
    mergeResolvedEntry,
    updateEntryQty,
    removeEntry,
    promoteNoMatch,
    trackDuplicate,
    totalScans,
    noMatchCount,
  } = useBatchScannerEntries({ initialEntries, onEntriesChange });
  const scannerPaused = mode === "lookup" && !!lookupResult;
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

  // Reset lookup single-shot quando il foglio viene chiuso.
  useEffect(() => {
    if (!open) {
      setLookupResult(null);
      setManualMode(false);
      setManualCode("");
    }
  }, [open]);

  // Auto-focus input manuale quando attivato.
  useEffect(() => {
    if (manualMode && open) {
      const t = setTimeout(() => manualInputRef.current?.focus(), 100);
      return () => clearTimeout(t);
    }
  }, [manualMode, open]);

  // ─── Handler scansione ───────────────────────────────────
  const handleScan = useCallback(
    async (rawCode: string, scanFormat?: string) => {
      const code = rawCode.trim();
      if (!code) return;
      if (mode === "lookup" && lookupResult) return;
      if (lookupInFlightRef.current) return;

      // Throttle duplicati: stesso codice in <2s viene ignorato silenziosamente.
      const now = Date.now();
      if (trackDuplicate(code, now)) return;

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
          toast.success(`${multi.serials.length} seriali estratti dal lotto`, {
            description: multi.gtin
              ? `Formato ${multi.format} · GTIN ${multi.gtin} rilevato`
              : `Formato ${multi.format}. Usa "Crea articolo unico" per collegarli a un prodotto.`,
            duration: 4000,
          });
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
            toast.warning("Codice non riconosciuto", {
              description: "Puoi creare subito un nuovo articolo con questo codice.",
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
          if (mode === "lookup") {
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
              toast.warning("Quantita gia completa", {
                description: `Hai gia scansionato ${alreadyScannedQty}/${allowed.qtyRequired} per ${allowed.itemName}.`,
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
            toast.warning("Articolo non incluso in questa ODA", {
              description: "Aggiunto come extra (oda_item_id=null)",
            });
            // proseguiamo comunque ma con odaItemId=null (extra)
          } else {
            odaItemId = allowed.odaItemId;
            const alreadyScanned = entries
              .filter((entry) => entry.odaItemId === allowed.odaItemId)
              .reduce((sum, entry) => sum + entry.quantity, 0);
            if (alreadyScanned >= allowed.qtyPending) {
              await errorFeedback(); triggerFlash("red");
              toast.warning("Quantità ODA già completa", {
                description: "Questa riga ha già raggiunto il residuo da ricevere.",
              });
              return;
            }
          }
        }

        mergeResolvedEntry(nextEntry, odaItemId);

        await successFeedback(); triggerFlash("green");
      } catch (err) {
        await errorFeedback(); triggerFlash("red");
        toast.error("Errore lookup", {
          description: (err as Error)?.message ?? "Riprova",
        });
      } finally {
        lookupInFlightRef.current = false;
      }
    },
    [
      allowedOdaItems,
      allowedOrderItems,
      appendEntry,
      entries,
      lookup,
      lookupResult,
      mergeResolvedEntry,
      mode,
      supplierId,
      supplierUsesGs1,
      trackDuplicate,
      triggerFlash,
    ],
  );

  const {
    videoRef,
    cameraError,
    torchOn,
    torchSupported,
    toggleTorch,
    handleTapFocus,
  } = useBatchScannerCamera({
    open,
    manualMode,
    paused: scannerPaused,
    onScan: handleScan,
  });

  useEffect(() => {
    if (open && cameraError && !manualMode) {
      setManualMode(true);
    }
  }, [cameraError, manualMode, open]);

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
    if (!c) return;
    setManualCode("");
    void handleScan(c);
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
        toast.success("Articolo creato e collegato alla scansione");
      } catch (err) {
        toast.error("Errore creazione articolo", {
          description: (err as Error)?.message ?? "Riprova",
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
      // Il dialog imposta tracking_mode='serialized' + quantity=N + crea
      // N stock_units sotto il nuovo articolo (vedi CaricoRapidoSheet.handleSaveNewItem).
      const allSerials = noMatchEntries.map((e) => e.rawCode);
      const result = await onRequestCreateItem(pilot.rawCode, { serials: allSerials });
      if (!result) return; // utente ha annullato
      // Promuovi TUTTE le entry no-match al nuovo articolo. Ognuna mantiene
      // il suo rawCode come serial (se il tracking e' serialized).
      for (const entry of noMatchEntries) {
        promoteNoMatch(entry.clientUuid, result);
      }
      await successFeedback(); triggerFlash("green");
      toast.success(`${noMatchEntries.length} scansioni collegate a "${result.itemName}"`);
    } catch (err) {
      toast.error("Errore creazione articolo", {
        description: (err as Error)?.message ?? "Riprova",
      });
    } finally {
      setCreatingForUuid(null);
    }
  }, [entries, onRequestCreateItem, promoteNoMatch, triggerFlash]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {/* v8.6.118 — Sheet full-screen su mobile (h-[100svh]) per dare massimo
          spazio alla camera. Su desktop resta 90svh come prima. */}
      <SheetContent side="bottom" className="h-[100svh] sm:h-[90svh] flex flex-col p-0">
        {/* Header compatto: padding ridotto su mobile per piu spazio camera */}
        <SheetHeader className="px-3 py-2 sm:px-4 sm:py-3 border-b shrink-0">
          <div className="flex items-center justify-between gap-2">
            <SheetTitle className="text-sm sm:text-base flex items-center gap-2 min-w-0">
              <ScanLine className="h-4 w-4 sm:h-5 sm:w-5 text-primary shrink-0" />
              <span className="truncate">
                {mode === "lookup"
                  ? "Cerca articolo"
                  : mode === "oda_receive"
                    ? "Ricezione da ODA"
                    : "Carico rapido QR"}
              </span>
            </SheetTitle>
            <div className="flex items-center gap-1.5">
              {!online && (
                <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 gap-1">
                  <WifiOff className="h-3 w-3" />
                  Offline
                </Badge>
              )}
              {mode !== "lookup" && (
                <Badge variant="outline" className="font-mono text-xs">
                  {entries.length}·{totalScans}pz
                </Badge>
              )}
            </div>
          </div>
          {contextLabel && (
            <SheetDescription className="text-xs truncate">{contextLabel}</SheetDescription>
          )}
        </SheetHeader>

        {/* v8.6.119 — Camera area FULL-VIEWPORT su mobile (flex-1) per
            massimizzare lo spazio scanner. Su desktop torna ad aspect-video. */}
        <div className="flex-1 sm:shrink-0 relative bg-black overflow-hidden">
          {!manualMode ? (
            <div className="relative h-full">
              <video
                ref={videoRef}
                className="w-full h-full sm:h-auto sm:aspect-video object-cover cursor-pointer"
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
              {/* v8.6.119 — Counter GROSSO + ultimo articolo scansionato.
                  Mostra al magazziniere cosa ha appena scansionato senza
                  guardare la lista in basso. */}
              {mode !== "lookup" && totalScans > 0 && (
                <div className="absolute top-3 left-3 right-auto max-w-[58%] sm:max-w-none bg-emerald-600/95 text-white rounded-xl px-4 py-2.5 sm:px-3 sm:py-1.5 shadow-xl pointer-events-none backdrop-blur-sm">
                  <div className="flex items-center gap-3 sm:block">
                    <div>
                      <div className="text-3xl sm:text-2xl font-bold tabular-nums leading-none">{totalScans}</div>
                      <div className="text-[10px] sm:text-[9px] uppercase tracking-wider opacity-90 leading-tight mt-0.5">scansionati</div>
                    </div>
                    {/* v8.6.119 — Ultimo articolo (solo mobile) */}
                    {(() => {
                      const lastEntry = entries[entries.length - 1];
                      if (!lastEntry || !lastEntry.itemName) return null;
                      return (
                        <div className="sm:hidden flex-1 min-w-0 border-l border-white/30 pl-3">
                          <div className="text-[10px] uppercase tracking-wider opacity-80">Ultimo</div>
                          <div className="text-sm font-medium truncate">{lastEntry.itemName}</div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              )}
              {/* v8.6.119 — Reticolo grande con SCAN LINE animata (laser effect)
                  + corner brackets pi&ugrave; pro */}
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div className="relative w-[88%] max-w-md h-48 sm:h-32 sm:w-3/4 sm:max-w-xs">
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
                    <div className="absolute inset-x-0 h-0.5 bg-gradient-to-r from-transparent via-emerald-400 to-transparent shadow-[0_0_12px_2px_rgba(52,211,153,0.8)] animate-scan" />
                  </div>
                </div>
              </div>
              {/* Hint tap-to-focus */}
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-white text-xs bg-black/60 px-3 py-1.5 rounded-full pointer-events-none font-medium">
                Tocca per mettere a fuoco
              </div>
              {/* v8.6.120 — Controlli con ETICHETTA: il magazziniere capisce a
                  colpo d'occhio cosa fanno (prima erano sole icone bianche).
                  Stack verticale stretto in alto a destra → non collide col
                  contatore verde in alto a sinistra. */}
              <div className="absolute top-3 right-3 flex flex-col items-end gap-2">
                {torchSupported && (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={toggleTorch}
                    aria-label={torchOn ? "Spegni torcia" : "Accendi torcia"}
                    aria-pressed={torchOn}
                    className={`h-11 sm:h-9 gap-2 px-3 shadow-lg ${
                      torchOn
                        ? "bg-amber-400 hover:bg-amber-400 text-amber-950"
                        : "bg-white/95 hover:bg-white text-slate-700"
                    }`}
                  >
                    {torchOn ? (
                      <FlashlightOff className="h-5 w-5 sm:h-4 sm:w-4" />
                    ) : (
                      <Flashlight className="h-5 w-5 sm:h-4 sm:w-4" />
                    )}
                    <span className="text-sm font-medium">{torchOn ? "Luce accesa" : "Luce"}</span>
                  </Button>
                )}
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setManualMode(true)}
                  aria-label="Inserimento manuale"
                  className="h-11 sm:h-9 gap-2 px-3 bg-white/95 hover:bg-white text-slate-700 shadow-lg"
                >
                  <Keyboard className="h-5 w-5 sm:h-4 sm:w-4" />
                  <span className="text-sm font-medium">Digita codice</span>
                </Button>
              </div>
              {lookup.isPending && (
                <div className="absolute bottom-14 sm:bottom-2 left-1/2 -translate-x-1/2 bg-black/80 text-white text-sm sm:text-xs px-3 py-1.5 sm:px-2 sm:py-1 rounded-full flex items-center gap-2">
                  <Loader2 className="h-4 w-4 sm:h-3 sm:w-3 animate-spin" />
                  Risolvo...
                </div>
              )}
              {cameraError && (
                <div className="absolute inset-0 bg-black/85 flex items-center justify-center p-4">
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription className="text-xs">
                      {cameraError}. Usa l'inserimento manuale.
                    </AlertDescription>
                  </Alert>
                </div>
              )}
            </div>
          ) : (
            <form
              onSubmit={handleManualSubmit}
              className="bg-card p-4 border-b space-y-3"
            >
              {cameraError && (
                <Alert className="border-amber-200 bg-amber-50 text-amber-900">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    Fotocamera non disponibile su questo dispositivo. Inserisci o incolla il codice qui sotto.
                  </AlertDescription>
                </Alert>
              )}
              <div className="flex items-end gap-2">
                <div className="flex-1 space-y-1">
                  <Label htmlFor="bs-manual" className="text-xs">
                    Codice manuale
                  </Label>
                  <Input
                    ref={manualInputRef}
                    id="bs-manual"
                    value={manualCode}
                    onChange={(e) => setManualCode(e.target.value)}
                    placeholder="Digita o incolla..."
                    autoComplete="off"
                    className="font-mono"
                  />
                </div>
                <Button
                  type="submit"
                  disabled={!manualCode.trim() || lookup.isPending}
                  className="shrink-0 gap-1.5"
                  aria-label="Cerca codice manuale"
                >
                  <ScanLine className="h-4 w-4" />
                  <span>Cerca</span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setManualMode(false)}
                  aria-label="Torna alla camera"
                >
                  <Camera className="h-4 w-4" />
                </Button>
              </div>
            </form>
          )}
        </div>

        {/* Progress bar ordine — visibile solo se allowedOrderItems fornito.
            Mostra a colpo d'occhio quante unita restano da scansionare per
            ogni articolo della commessa. Update live ad ogni scan. */}
        {mode === "carico" && allowedOrderItems && allowedOrderItems.length > 0 && (
          <div className="shrink-0 border-b bg-muted/30 px-3 py-2 space-y-1.5 max-h-[35vh] overflow-y-auto">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
              Avanzamento ordine
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
        <ScrollArea className="flex-1 min-h-0">
          <div className="p-4 space-y-2">
            {mode === "lookup" && lookupResult ? (
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
                    ? "Inquadra il QR / barcode per cercare un articolo."
                    : "Inquadra il QR / barcode per iniziare."}
                </p>
                {mode === "oda_receive" && (
                  <p className="text-[11px] mt-1">
                    Solo articoli inclusi nell'ODA verranno accettati direttamente.
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
                    <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">
                      {noMatchCount} scansioni non riconosciute
                    </p>
                    <p className="text-xs text-amber-800 dark:text-amber-200 mt-0.5">
                      Probabilmente sono tutti seriali dello stesso modello (es. pannelli SPR-P7).
                      Crea 1 articolo unico → li collego tutti.
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleCreateUnicoFromAllNoMatch}
                      disabled={creatingForUuid !== null}
                      className="mt-2 h-8 gap-2 bg-amber-600 hover:bg-amber-700 text-white"
                    >
                      {creatingForUuid !== null ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <PackagePlus className="h-3.5 w-3.5" />
                      )}
                      Crea articolo unico per {noMatchCount} scansioni
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
                  canIncrement = entry.quantity < max;
                } else if (mode === "carico" && allowedOrderItems) {
                  const allowed = allowedOrderItems.find((a) => a.stockItemId === entry.stockItemId);
                  if (allowed) {
                    // Conto le quantita gia presenti su questo stockItemId
                    // (non sommo tutte le entries, sommo le entries dello
                    // stesso articolo - puo esserci una sola entry aggregata).
                    const totalForItem = entries
                      .filter((e) => e.stockItemId === entry.stockItemId)
                      .reduce((sum, e) => sum + e.quantity, 0);
                    canIncrement = totalForItem < allowed.qtyRequired;
                  }
                }
                return (
                <EntryRow
                  key={entry.clientUuid}
                  entry={entry}
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
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-md border bg-muted/30 px-2 py-1.5 text-center">
                  <p className="text-sm font-bold leading-tight">{entries.length}</p>
                  <p className="text-[10px] text-muted-foreground">righe</p>
                </div>
                <div className="rounded-md border bg-muted/30 px-2 py-1.5 text-center">
                  <p className="text-sm font-bold leading-tight">{totalScans}</p>
                  <p className="text-[10px] text-muted-foreground">pezzi</p>
                </div>
                <div
                  className={`rounded-md border px-2 py-1.5 text-center ${
                    noMatchCount > 0 || invalidSerializedCount > 0
                      ? "border-amber-200 bg-amber-50 text-amber-800"
                      : "bg-emerald-50 text-emerald-700 border-emerald-200"
                  }`}
                >
                  <p className="text-sm font-bold leading-tight">{noMatchCount + invalidSerializedCount}</p>
                  <p className="text-[10px]">da sistemare</p>
                </div>
              </div>
            )}
            {noMatchCount > 0 && (
              <Alert>
                <Package className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  {noMatchCount} {noMatchCount === 1 ? "scansione" : "scansioni"} senza match in
                  anagrafica.{" "}
                  {onRequestCreateItem
                    ? "Tocca \"Crea\" sulla riga per registrare l'articolo, oppure rimuovila."
                    : "Prima di confermare crea l'articolo o rimuovi la riga."}
                </AlertDescription>
              </Alert>
            )}
            {invalidSerializedCount > 0 && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  {invalidSerializedCount} articolo serializzato senza seriale. Scansiona il QR/seriale
                  dell'unità oppure rimuovi la riga prima di confermare.
                </AlertDescription>
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
                className="flex-1 h-14 sm:h-10 text-base sm:text-sm font-medium"
              >
                {onBack ? (
                  <ArrowLeft className="h-5 w-5 sm:h-4 sm:w-4 mr-2" />
                ) : (
                  <X className="h-5 w-5 sm:h-4 sm:w-4 mr-2" />
                )}
                {onBack ? backLabel : "Chiudi"}
              </Button>
              <Button
                type="button"
                onClick={handleConfirm}
                disabled={!canConfirm}
                className="flex-[2] h-14 sm:h-10 text-base sm:text-sm font-semibold shadow-lg"
              >
                {isConfirming ? (
                  <>
                    <Loader2 className="h-5 w-5 sm:h-4 sm:w-4 mr-2 animate-spin" />
                    Salvataggio...
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
                  <div className="text-xs text-muted-foreground font-mono">
                    SN: {result.serialNumbers.join(", ")}
                  </div>
                )}
                {result.trackingMode && (
                  <Badge variant="outline" className="mt-2 text-[10px]">
                    {result.trackingMode === "serialized" ? "Serializzato" : "Fungibile"}
                  </Badge>
                )}
              </>
            ) : (
              <>
                <div className="font-semibold text-base">Articolo non trovato</div>
                <div className="text-xs text-muted-foreground font-mono break-all mt-1">
                  Codice scansionato: {result.rawCode}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2">
        {matched ? (
          <>
            <Button onClick={onFilterInTable} className="w-full justify-start">
              <Filter className="h-4 w-4 mr-2" />
              Filtra in tabella
            </Button>
            <Button onClick={onEditItem} variant="outline" className="w-full justify-start">
              <Edit className="h-4 w-4 mr-2" />
              Modifica articolo
            </Button>
          </>
        ) : (
          <Button onClick={onCreateNew} className="w-full justify-start">
            <Plus className="h-4 w-4 mr-2" />
            Crea nuovo articolo con questo codice
          </Button>
        )}
        <Button onClick={onScanAgain} variant="ghost" className="w-full justify-start">
          <ScanLine className="h-4 w-4 mr-2" />
          Scansiona di nuovo
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
  onIncrement,
  onDecrement,
  canIncrement = true,
  onRemove,
  onCreateFromNoMatch,
  creating,
}: {
  entry: BatchScanEntry;
  onIncrement: () => void;
  onDecrement: () => void;
  canIncrement?: boolean;
  onRemove: () => void;
  onCreateFromNoMatch?: () => void;
  creating?: boolean;
}) {
  const noMatch = entry.stockItemId === null;
  return (
    <div
      className={`rounded-lg border p-3 flex flex-col sm:flex-row sm:items-center gap-3 ${
        noMatch ? "border-amber-300 bg-amber-50/40 dark:bg-amber-950/20" : "bg-card"
      }`}
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">
          {entry.itemName ?? <span className="text-amber-700">Codice non riconosciuto</span>}
        </p>
        <p className="text-[11px] text-muted-foreground font-mono truncate">
          {entry.rawCode}
        </p>
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
            className="h-8 gap-1.5 bg-amber-600 hover:bg-amber-700 text-white"
          >
            {creating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <PackagePlus className="h-3.5 w-3.5" />
            )}
            <span className="text-xs">Crea</span>
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
              className="h-8 w-8"
              aria-label="Decrementa"
            >
              <Minus className="h-3.5 w-3.5" />
            </Button>
            <span className="w-8 text-center text-sm font-medium">{entry.quantity}</span>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={onIncrement}
              disabled={!canIncrement}
              className="h-8 w-8"
              aria-label="Incrementa"
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </>
        )}
        {entry.trackingMode === "serialized" && (
          <Badge variant="outline" className="font-mono">
            {entry.quantity} sn
          </Badge>
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
          className="h-8 w-8 text-muted-foreground hover:text-destructive"
          aria-label="Rimuovi"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
