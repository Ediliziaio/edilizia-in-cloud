import { useEffect, useRef, useState, useCallback } from "react";
import { BrowserMultiFormatReader, NotFoundException } from "@zxing/library";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { ScanLine, X, Flashlight, FlashlightOff, Focus } from "lucide-react";
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
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);

  const stopScanner = useCallback(() => {
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
      return;
    }

    let active = true;
    setError(null);
    setScanning(true);

    const reader = new BrowserMultiFormatReader();
    readerRef.current = reader;

    (async () => {
      try {
        const stream = await openScannerStream();
        if (!active) {
          stopStream(stream);
          return;
        }
        streamRef.current = stream;

        const video = videoRef.current;
        if (!video) return;

        // Torch capability può richiedere un po' di tempo per popolarsi.
        // Polling 200ms × 5s.
        let attempts = 0;
        const torchPoll = setInterval(() => {
          attempts++;
          if (!active || isTorchSupported(streamRef.current) || attempts > 25) {
            if (isTorchSupported(streamRef.current)) setTorchAvailable(true);
            clearInterval(torchPoll);
          }
        }, 200);

        // decodeFromStream attacca il MediaStream al video element e fa play().
        await reader.decodeFromStream(stream, video, (result, err) => {
          if (!active) return;
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
        if (active) {
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
  }, [open, onScan, onOpenChange, stopScanner]);

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
