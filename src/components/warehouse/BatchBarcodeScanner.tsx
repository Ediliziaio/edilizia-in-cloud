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
 *
 * Convenzione: il caller raccoglie le entries via `onEntriesChange` e fa il
 * commit (RPC batch_carico_from_scans / receive_from_oda_via_scans) quando
 * l'utente conferma.
 */

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { BrowserMultiFormatReader } from "@zxing/library";
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
  Trash2,
  AlertCircle,
  Package,
  CheckCircle2,
  Plus,
  Minus,
  Loader2,
} from "lucide-react";
import {
  successFeedback,
  errorFeedback,
  impactFeedback,
} from "@/lib/mobile/native-haptics";
import { onNetworkChange } from "@/lib/mobile/native-network";
import { useBarcodeLookup } from "@/hooks/warehouse/useBarcodeLookup";
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

export type BatchScanMode = "carico" | "oda_receive";

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
  onEntriesChange: (entries: BatchScanEntry[]) => void;
  /** CTA finale (es. "Conferma carico"). */
  onConfirm: () => void;
  /** Etichetta del CTA finale. */
  confirmLabel?: string;
  /** True quando il commit è in corso. */
  isConfirming?: boolean;
}

const DUPLICATE_THROTTLE_MS = 2000;

// crypto.randomUUID() è disponibile in Safari iOS 15.4+, Chrome 92+.
// Fallback per browser più vecchi.
function newClientUuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
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
}: BatchBarcodeScannerProps) {
  const [entries, setEntries] = useState<BatchScanEntry[]>(initialEntries ?? []);
  const [manualMode, setManualMode] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [online, setOnline] = useState(navigator.onLine);

  const videoRef = useRef<HTMLVideoElement>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lastScanRef = useRef<{ code: string; ts: number } | null>(null);
  const manualInputRef = useRef<HTMLInputElement>(null);

  const lookup = useBarcodeLookup();

  // Sync iniziale al primo render quando initialEntries cambia.
  useEffect(() => {
    if (initialEntries && initialEntries.length > 0) {
      setEntries(initialEntries);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Network monitor: aggiorna online flag.
  useEffect(() => {
    const off = onNetworkChange((s) => setOnline(s.connected));
    return off;
  }, []);

  // Notifica caller di ogni cambio entries.
  useEffect(() => {
    onEntriesChange(entries);
  }, [entries, onEntriesChange]);

  // Avvio/teardown camera quando il sheet si apre/chiude o switch manualMode.
  useEffect(() => {
    if (!open || manualMode) {
      stopCamera();
      return;
    }
    startCamera();
    return stopCamera;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, manualMode]);

  // Auto-focus input manuale quando attivato.
  useEffect(() => {
    if (manualMode && open) {
      const t = setTimeout(() => manualInputRef.current?.focus(), 100);
      return () => clearTimeout(t);
    }
  }, [manualMode, open]);

  function stopCamera() {
    try {
      readerRef.current?.reset();
    } catch {
      /* noop */
    }
    readerRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setTorchOn(false);
    setTorchSupported(false);
  }

  async function startCamera() {
    setCameraError(null);
    try {
      const reader = new BrowserMultiFormatReader();
      readerRef.current = reader;

      const devices = await BrowserMultiFormatReader.listVideoInputDevices();
      if (devices.length === 0) {
        setCameraError("Nessuna fotocamera disponibile sul dispositivo.");
        return;
      }
      const back =
        devices.find((d) => /back|rear|environment/i.test(d.label)) ||
        devices[devices.length - 1];

      reader.decodeFromVideoDevice(back.deviceId, videoRef.current!, (result) => {
        if (!result) return;
        handleScan(result.getText(), result.getBarcodeFormat?.()?.toString());
      });

      // Salva lo stream del video element per torch toggle
      // (zxing crea il MediaStream e lo lega al <video>; lo recuperiamo da srcObject).
      const checkStream = setInterval(() => {
        const stream = videoRef.current?.srcObject as MediaStream | null;
        if (stream) {
          streamRef.current = stream;
          const track = stream.getVideoTracks()[0];
          // Feature detect torch
          // deno-lint-ignore no-explicit-any
          const caps = (track?.getCapabilities?.() as any) ?? {};
          if (caps.torch) setTorchSupported(true);
          clearInterval(checkStream);
        }
      }, 200);
      // safety: clear interval dopo 5s comunque
      setTimeout(() => clearInterval(checkStream), 5000);
    } catch (e) {
      setCameraError(e instanceof Error ? e.message : "Errore avvio fotocamera");
    }
  }

  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      // deno-lint-ignore no-explicit-any
      await track.applyConstraints({ advanced: [{ torch: !torchOn } as any] });
      setTorchOn((v) => !v);
      void impactFeedback();
    } catch {
      toast.error("Torcia non supportata su questo dispositivo");
      setTorchSupported(false);
    }
  }

  // ─── Handler scansione ───────────────────────────────────
  const handleScan = useCallback(
    async (rawCode: string, scanFormat?: string) => {
      const code = rawCode.trim();
      if (!code) return;

      // Throttle duplicati: stesso codice in <2s viene ignorato silenziosamente.
      const now = Date.now();
      if (
        lastScanRef.current &&
        lastScanRef.current.code === code &&
        now - lastScanRef.current.ts < DUPLICATE_THROTTLE_MS
      ) {
        return;
      }
      lastScanRef.current = { code, ts: now };

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
            description: `${code.slice(0, 32)} — verrà aggiunto come "no match"`,
          });
          // Aggiungi entry "no match" così il caller può proporre la creazione
          // dopo il batch (mostra in Review step).
          setEntries((prev) => [
            ...prev,
            {
              clientUuid: newClientUuid(),
              rawCode: code,
              scanFormat,
              stockItemId: null,
              itemName: null,
              trackingMode: null,
              quantity: 1,
              serialNumbers: [],
              scannedAt: now,
            },
          ]);
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
          }
        }

        // Auto-aggregation: se entry esistente ha stesso stockItemId E è fungibile,
        // incrementa quantity invece di duplicare la riga.
        setEntries((prev) => {
          if (resolvedTracking === "fungible") {
            const existingIdx = prev.findIndex(
              (e) => e.stockItemId === resolvedItemId && e.trackingMode === "fungible",
            );
            if (existingIdx >= 0) {
              const next = [...prev];
              next[existingIdx] = {
                ...next[existingIdx],
                quantity: next[existingIdx].quantity + 1,
                scannedAt: now,
              };
              return next;
            }
          }

          // Per serializzato, se entry esistente ha stesso item, append seriale.
          if (resolvedTracking === "serialized" && resolvedSerial) {
            const existingIdx = prev.findIndex(
              (e) => e.stockItemId === resolvedItemId && e.trackingMode === "serialized",
            );
            if (existingIdx >= 0) {
              if (prev[existingIdx].serialNumbers.includes(resolvedSerial)) {
                // Seriale già presente: ignora silenziosamente
                return prev;
              }
              const next = [...prev];
              const serials = [...next[existingIdx].serialNumbers, resolvedSerial];
              next[existingIdx] = {
                ...next[existingIdx],
                serialNumbers: serials,
                quantity: serials.length,
                scannedAt: now,
              };
              return next;
            }
          }

          // Nuova entry
          return [
            ...prev,
            {
              clientUuid: newClientUuid(),
              rawCode: code,
              scanFormat,
              stockItemId: resolvedItemId,
              itemName: resolvedItemName,
              trackingMode: resolvedTracking,
              quantity: resolvedSerial ? 1 : 1,
              serialNumbers: resolvedSerial ? [resolvedSerial] : [],
              odaItemId,
              scannedAt: now,
            },
          ];
        });

        await successFeedback();
      } catch (err) {
        await errorFeedback();
        toast.error("Errore lookup", {
          description: (err as Error)?.message ?? "Riprova",
        });
      }
    },
    [lookup, supplierId, supplierUsesGs1, mode, allowedOdaItems],
  );

  function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    const c = manualCode.trim();
    if (!c) return;
    setManualCode("");
    void handleScan(c);
  }

  function updateEntryQty(uuid: string, delta: number) {
    setEntries((prev) =>
      prev.map((e) =>
        e.clientUuid === uuid && e.trackingMode === "fungible"
          ? { ...e, quantity: Math.max(1, e.quantity + delta) }
          : e,
      ),
    );
  }

  function removeEntry(uuid: string) {
    setEntries((prev) => prev.filter((e) => e.clientUuid !== uuid));
  }

  const totalScans = useMemo(
    () => entries.reduce((sum, e) => sum + e.quantity, 0),
    [entries],
  );

  const noMatchCount = useMemo(
    () => entries.filter((e) => e.stockItemId === null).length,
    [entries],
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[90svh] flex flex-col p-0">
        <SheetHeader className="px-4 py-3 border-b shrink-0">
          <div className="flex items-center justify-between gap-2">
            <SheetTitle className="text-base flex items-center gap-2 min-w-0">
              <ScanLine className="h-5 w-5 text-primary shrink-0" />
              <span className="truncate">
                {mode === "oda_receive" ? "Ricezione da ODA" : "Carico rapido QR"}
              </span>
            </SheetTitle>
            <div className="flex items-center gap-1.5">
              {!online && (
                <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 gap-1">
                  <WifiOff className="h-3 w-3" />
                  Offline
                </Badge>
              )}
              <Badge variant="outline" className="font-mono">
                {entries.length} righe · {totalScans} pz
              </Badge>
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
                className="w-full aspect-video object-cover"
                playsInline
                muted
              />
              {/* Reticolo */}
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div className="w-3/4 max-w-xs h-32 border-2 border-white/60 rounded-lg shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
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
              className="bg-card p-4 flex items-end gap-2 border-b"
            >
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
              <Button type="submit" disabled={!manualCode.trim() || lookup.isPending}>
                <ScanLine className="h-4 w-4" />
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
            </form>
          )}
        </div>

        {/* Entries list */}
        <ScrollArea className="flex-1 min-h-0">
          <div className="p-4 space-y-2">
            {entries.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <ScanLine className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p className="text-sm">Inquadra il QR / barcode per iniziare.</p>
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
                  onRemove={() => removeEntry(entry.clientUuid)}
                />
              ))
            )}
          </div>
        </ScrollArea>

        {/* Footer with confirm CTA */}
        <div className="border-t p-3 space-y-2 shrink-0 bg-card">
          {noMatchCount > 0 && (
            <Alert>
              <Package className="h-4 w-4" />
              <AlertDescription className="text-xs">
                {noMatchCount} {noMatchCount === 1 ? "scansione" : "scansioni"} senza match in
                anagrafica. Prima di confermare crea l'articolo o rimuovi la riga.
              </AlertDescription>
            </Alert>
          )}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="flex-1"
            >
              <X className="h-4 w-4 mr-2" />
              Chiudi
            </Button>
            <Button
              type="button"
              onClick={onConfirm}
              disabled={entries.length === 0 || isConfirming || noMatchCount > 0}
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
      </SheetContent>
    </Sheet>
  );
}

// ────────────────────────────────────────────────────────────
// Riga entry: nome + qty controls / serial list + remove
// ────────────────────────────────────────────────────────────

function EntryRow({
  entry,
  onIncrement,
  onDecrement,
  onRemove,
}: {
  entry: BatchScanEntry;
  onIncrement: () => void;
  onDecrement: () => void;
  onRemove: () => void;
}) {
  const noMatch = entry.stockItemId === null;
  return (
    <div
      className={`rounded-lg border p-3 flex items-center gap-3 ${
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
      <div className="flex items-center gap-1.5">
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
