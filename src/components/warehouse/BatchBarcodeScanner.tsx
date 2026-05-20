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
  onRequestCreateItem?: (rawCode: string) => Promise<{
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

      lookupInFlightRef.current = true;
      try {
        const result = await lookup.mutateAsync({
          rawScan: code,
          supplierId,
          supplierUsesGs1,
        });

        const action = result.action;

        if (action.kind === "offer_create_new") {
          await errorFeedback();
          toast.warning("Codice non riconosciuto", {
            description:
              mode === "lookup"
                ? "Puoi creare subito un nuovo articolo con questo codice."
                : `${code.slice(0, 32)} — verrà aggiunto come "no match"`,
          });
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
            await errorFeedback();
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
          await successFeedback();
          return;
        }

        // Validazione mode='oda_receive': l'articolo deve essere in allowedOdaItems.
        let odaItemId: string | null = null;
        if (mode === "oda_receive" && allowedOdaItems) {
          const allowed = allowedOdaItems.find((a) => a.stockItemId === resolvedItemId);
          if (!allowed) {
            await errorFeedback();
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
              await errorFeedback();
              toast.warning("Quantità ODA già completa", {
                description: "Questa riga ha già raggiunto il residuo da ricevere.",
              });
              return;
            }
          }
        }

        mergeResolvedEntry(nextEntry, odaItemId);

        await successFeedback();
      } catch (err) {
        await errorFeedback();
        toast.error("Errore lookup", {
          description: (err as Error)?.message ?? "Riprova",
        });
      } finally {
        lookupInFlightRef.current = false;
      }
    },
    [
      allowedOdaItems,
      appendEntry,
      entries,
      lookup,
      lookupResult,
      mergeResolvedEntry,
      mode,
      supplierId,
      supplierUsesGs1,
      trackDuplicate,
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
        await successFeedback();
        toast.success("Articolo creato e collegato alla scansione");
      } catch (err) {
        toast.error("Errore creazione articolo", {
          description: (err as Error)?.message ?? "Riprova",
        });
      } finally {
        setCreatingForUuid(null);
      }
    },
    [entries, onRequestCreateItem, promoteNoMatch],
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[90svh] flex flex-col p-0">
        <SheetHeader className="px-4 py-3 border-b shrink-0">
          <div className="flex items-center justify-between gap-2">
            <SheetTitle className="text-base flex items-center gap-2 min-w-0">
              <ScanLine className="h-5 w-5 text-primary shrink-0" />
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
                <Badge variant="outline" className="font-mono">
                  {entries.length} righe · {totalScans} pz
                </Badge>
              )}
            </div>
          </div>
          {contextLabel && (
            <SheetDescription className="text-xs truncate">{contextLabel}</SheetDescription>
          )}
        </SheetHeader>

        {/* Camera / Manual area */}
        <div className="shrink-0 relative bg-black">
          {!manualMode ? (
            <div className="relative">
              <video
                ref={videoRef}
                className="w-full aspect-video object-cover cursor-pointer"
                playsInline
                muted
                autoPlay
                onClick={handleTapFocus}
              />
              {/* Reticolo */}
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div className="w-3/4 max-w-xs h-32 border-2 border-white/60 rounded-lg shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
              </div>
              {/* Hint tap-to-focus */}
              <div className="absolute bottom-1 left-1/2 -translate-x-1/2 text-white/80 text-[10px] bg-black/40 px-2 py-0.5 rounded-full pointer-events-none">
                Tocca per mettere a fuoco
              </div>
              {/* Toolbar overlay */}
              <div className="absolute top-2 right-2 flex gap-2">
                {torchSupported && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="icon"
                    onClick={toggleTorch}
                    aria-label={torchOn ? "Spegni torcia" : "Accendi torcia"}
                    className="h-9 w-9 bg-white/90 hover:bg-white"
                  >
                    {torchOn ? (
                      <FlashlightOff className="h-4 w-4" />
                    ) : (
                      <Flashlight className="h-4 w-4" />
                    )}
                  </Button>
                )}
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  onClick={() => setManualMode(true)}
                  aria-label="Inserimento manuale"
                  className="h-9 w-9 bg-white/90 hover:bg-white"
                >
                  <Keyboard className="h-4 w-4" />
                </Button>
              </div>
              {lookup.isPending && (
                <div className="absolute bottom-2 left-2 bg-black/70 text-white text-xs px-2 py-1 rounded flex items-center gap-1.5">
                  <Loader2 className="h-3 w-3 animate-spin" />
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
              entries.map((entry) => (
                <EntryRow
                  key={entry.clientUuid}
                  entry={entry}
                  onIncrement={() => updateEntryQty(entry.clientUuid, +1)}
                  onDecrement={() => updateEntryQty(entry.clientUuid, -1)}
                  canIncrement={
                    mode !== "oda_receive" ||
                    !entry.odaItemId ||
                    entry.quantity <
                      (allowedOdaItems?.find((item) => item.odaItemId === entry.odaItemId)?.qtyPending ?? Infinity)
                  }
                  onRemove={() => removeEntry(entry.clientUuid)}
                  onCreateFromNoMatch={
                    onRequestCreateItem
                      ? () => handleCreateFromNoMatch(entry.clientUuid)
                      : undefined
                  }
                  creating={creatingForUuid === entry.clientUuid}
                />
              ))
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
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={onBack ?? (() => onOpenChange(false))}
                className="flex-1"
              >
                {onBack ? (
                  <ArrowLeft className="h-4 w-4 mr-2" />
                ) : (
                  <X className="h-4 w-4 mr-2" />
                )}
                {onBack ? backLabel : "Chiudi"}
              </Button>
              <Button
                type="button"
                onClick={handleConfirm}
                disabled={!canConfirm}
                className="flex-[2]"
              >
                {isConfirming ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Salvataggio...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4 mr-2" />
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
