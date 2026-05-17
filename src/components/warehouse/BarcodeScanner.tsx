import { useEffect, useRef, useState, useCallback, type FormEvent } from "react";
import { BrowserMultiFormatReader, NotFoundException } from "@zxing/library";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { ScanLine, X, Flashlight, FlashlightOff, Focus, Keyboard, Camera, AlertCircle } from "lucide-react";
import {
  openScannerStream,
  pulseFocus,
  isTorchSupported,
  setTorch,
  stopStream,
} from "@/lib/scanner/cameraStream";

interface BarcodeScannerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onScan: (result: string) => void;
}

/**
 * Single-shot barcode scanner.
 *
 * Strategia camera (vedi src/lib/scanner/cameraStream.ts per il razionale):
 *  - Stream gestito a mano con focusMode/exposureMode/whiteBalanceMode
 *    "continuous" applicati post-init, NON via decodeFromVideoDevice.
 *  - facingMode ideal "environment" senza pin del deviceId → su iPhone
 *    si usa la smart camera virtuale che gestisce macro automaticamente.
 *  - Tap-to-focus: tap sul video → single-shot focus pulse.
 *  - Torch toggle se supportato.
 */
export function BarcodeScanner({ open, onOpenChange, onScan }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scannerRunRef = useRef(0);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const manualInputRef = useRef<HTMLInputElement>(null);

  const stopScanner = useCallback(() => {
    scannerRunRef.current += 1;
    try {
      readerRef.current?.reset();
    } catch {
      /* noop */
    }
    readerRef.current = null;
    stopStream(streamRef.current);
    streamRef.current = null;
    setScanning(false);
    setTorchOn(false);
    setTorchAvailable(false);
  }, []);

  useEffect(() => {
    if (!open) {
      stopScanner();
      setManualMode(false);
      setManualCode("");
      return;
    }
    if (manualMode) {
      stopScanner();
      return;
    }

    let active = true;
    const runId = scannerRunRef.current + 1;
    scannerRunRef.current = runId;
    setError(null);
    setScanning(true);

    const reader = new BrowserMultiFormatReader();
    readerRef.current = reader;

    (async () => {
      try {
        const stream = await openScannerStream();
        if (!active || scannerRunRef.current !== runId) {
          stopStream(stream);
          return;
        }
        streamRef.current = stream;

        const video = videoRef.current;
        if (!video) {
          stopStream(stream);
          return;
        }

        // Torch capability può richiedere un po' di tempo per popolarsi.
        // Polling 200ms × 5s.
        let attempts = 0;
        const torchPoll = setInterval(() => {
          attempts++;
          if (!active || scannerRunRef.current !== runId || isTorchSupported(streamRef.current) || attempts > 25) {
            if (isTorchSupported(streamRef.current)) setTorchAvailable(true);
            clearInterval(torchPoll);
          }
        }, 200);

        // decodeFromStream attacca il MediaStream al video element e fa play().
        await reader.decodeFromStream(stream, video, (result, err) => {
          if (!active || scannerRunRef.current !== runId) return;
          if (result) {
            const text = result.getText();
            stopScanner();
            onScan(text);
            onOpenChange(false);
          } else if (err && !(err instanceof NotFoundException)) {
            setError("Errore fotocamera: " + err.message);
            setScanning(false);
          }
        });
      } catch (e: unknown) {
        if (active && scannerRunRef.current === runId) {
          setError(
            (e instanceof Error ? e.message : null) ||
              "Impossibile accedere alla fotocamera.",
          );
          setScanning(false);
        }
      }
    })();

    return () => {
      active = false;
      stopScanner();
    };
  }, [manualMode, open, onScan, onOpenChange, stopScanner]);

  useEffect(() => {
    if (open && error && !manualMode) {
      setManualMode(true);
    }
  }, [error, manualMode, open]);

  useEffect(() => {
    if (manualMode && open) {
      const t = setTimeout(() => manualInputRef.current?.focus(), 100);
      return () => clearTimeout(t);
    }
  }, [manualMode, open]);

  const handleManualSubmit = useCallback(
    (event: FormEvent) => {
      event.preventDefault();
      const code = manualCode.trim();
      if (!code) return;
      onScan(code);
      setManualCode("");
      onOpenChange(false);
    },
    [manualCode, onOpenChange, onScan],
  );

  const handleTapFocus = useCallback(() => {
    if (streamRef.current) void pulseFocus(streamRef.current);
  }, []);

  const handleToggleTorch = useCallback(async () => {
    if (!streamRef.current) return;
    const ok = await setTorch(streamRef.current, !torchOn);
    if (ok) setTorchOn((v) => !v);
    else setTorchAvailable(false);
  }, [torchOn]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[90svh] flex flex-col p-0">
        <SheetHeader className="px-4 pt-4 pb-2">
          <SheetTitle className="flex items-center gap-2">
            <ScanLine className="h-5 w-5 text-primary" />
            Scansiona codice
          </SheetTitle>
          <SheetDescription>
            Inquadra un barcode o QR code. Tocca lo schermo per ri-focalizzare.
          </SheetDescription>
        </SheetHeader>

        {manualMode ? (
          <div className="flex-1 bg-card p-4">
            <form onSubmit={handleManualSubmit} className="space-y-3">
              {error && (
                <Alert className="border-amber-200 bg-amber-50 text-amber-900">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    Fotocamera non disponibile su questo dispositivo. Inserisci o incolla il codice qui sotto.
                  </AlertDescription>
                </Alert>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="barcode-manual" className="text-xs">
                  Codice manuale
                </Label>
                <Input
                  ref={manualInputRef}
                  id="barcode-manual"
                  value={manualCode}
                  onChange={(event) => setManualCode(event.target.value)}
                  placeholder="Digita o incolla QR/barcode..."
                  autoComplete="off"
                  className="font-mono"
                />
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={!manualCode.trim()} className="flex-1 gap-2">
                  <ScanLine className="h-4 w-4" />
                  Cerca codice
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setManualMode(false)}
                  aria-label="Torna alla fotocamera"
                >
                  <Camera className="h-4 w-4" />
                </Button>
              </div>
            </form>
          </div>
        ) : (
        <div className="flex-1 relative bg-black overflow-hidden">
          <video
            ref={videoRef}
            className="absolute inset-0 w-full h-full object-cover cursor-pointer"
            autoPlay
            muted
            playsInline
            onClick={handleTapFocus}
          />

          {/* Toolbar overlay (torch + manual focus) */}
          <div className="absolute top-3 right-3 flex gap-2 z-10">
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
            {torchAvailable && (
              <Button
                type="button"
                variant="secondary"
                size="icon"
                onClick={handleToggleTorch}
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
              onClick={handleTapFocus}
              aria-label="Ri-focalizza"
              className="h-9 w-9 bg-white/90 hover:bg-white"
            >
              <Focus className="h-4 w-4" />
            </Button>
          </div>

          {/* Scan overlay */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-64 h-64 relative">
              {/* Corner brackets */}
              <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-primary rounded-tl" />
              <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-primary rounded-tr" />
              <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-primary rounded-bl" />
              <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-primary rounded-br" />
              {scanning && (
                <div className="absolute inset-x-0 top-0 h-0.5 bg-primary animate-scan" />
              )}
            </div>
          </div>

          {/* Tap-to-focus hint */}
          {scanning && !error && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-white/80 text-[11px] bg-black/40 px-3 py-1 rounded-full pointer-events-none">
              Tocca lo schermo per mettere a fuoco
            </div>
          )}

          {error && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/70">
              <div className="text-center text-white p-6">
                <p className="text-sm">{error}</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4"
                  onClick={() => onOpenChange(false)}
                >
                  Chiudi
                </Button>
              </div>
            </div>
          )}
        </div>
        )}

        <div className="p-4 flex justify-center">
          <Button variant="destructive" size="sm" onClick={() => onOpenChange(false)} className="gap-2">
            <X className="h-4 w-4" />
            Annulla scansione
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
