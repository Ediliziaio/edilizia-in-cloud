import { useEffect, useRef, useState, useCallback } from "react";
import { BrowserMultiFormatReader, NotFoundException } from "@zxing/library";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { ScanLine, X } from "lucide-react";

interface BarcodeScannerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onScan: (result: string) => void;
}

export function BarcodeScanner({ open, onOpenChange, onScan }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);

  const stopScanner = useCallback(() => {
    readerRef.current?.reset();
    readerRef.current = null;
    setScanning(false);
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
        // Standard browser API — funziona ovunque (Safari iOS, Chrome, Firefox).
        // BrowserMultiFormatReader.listVideoInputDevices() è solo statico in
        // alcune versioni di @zxing/library e undefined su Safari → bug noto.
        // navigator.mediaDevices.enumerateDevices() è W3C standard.
        if (!navigator.mediaDevices?.enumerateDevices) {
          setError("Fotocamera non disponibile su questo browser.");
          setScanning(false);
          return;
        }
        // Su iOS Safari enumerateDevices() ritorna labels vuote finché non si
        // chiama getUserMedia almeno una volta. Lo facciamo qui per avere i label.
        try {
          const probeStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: "environment" } },
          });
          probeStream.getTracks().forEach((t) => t.stop());
        } catch { /* permessi negati gestiti sotto */ }

        const allDevices = await navigator.mediaDevices.enumerateDevices();
        const devices = allDevices.filter((d) => d.kind === "videoinput");
        if (devices.length === 0) {
          setError("Nessuna fotocamera disponibile.");
          setScanning(false);
          return;
        }
        // Prefer back camera
        const back = devices.find(d => /back|rear|environment/i.test(d.label)) || devices[devices.length - 1];

        reader.decodeFromVideoDevice(back.deviceId, videoRef.current!, (result, err) => {
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
          setError((e instanceof Error ? e.message : null) || "Impossibile accedere alla fotocamera.");
          setScanning(false);
        }
      }
    })();

    return () => {
      active = false;
      reader.reset();
    };
  }, [open, onScan, onOpenChange, stopScanner]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[90svh] flex flex-col p-0">
        <SheetHeader className="px-4 pt-4 pb-2">
          <SheetTitle className="flex items-center gap-2">
            <ScanLine className="h-5 w-5 text-primary" />
            Scansiona codice
          </SheetTitle>
          <SheetDescription>
            Inquadra un barcode o QR code per cercare l'articolo in magazzino.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 relative bg-black overflow-hidden">
          <video
            ref={videoRef}
            className="absolute inset-0 w-full h-full object-cover"
            autoPlay
            muted
            playsInline
          />
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
