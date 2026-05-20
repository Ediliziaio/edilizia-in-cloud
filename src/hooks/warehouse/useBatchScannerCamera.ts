/**
 * useBatchScannerCamera — v8.6.102 (rev. 2026-05-20)
 *
 * Hook gestione camera + decoding barcode/QR per BatchBarcodeScanner.
 *
 * Strategia multi-engine (in ordine di preferenza):
 *   1. BarcodeDetector NATIVO — disponibile su Chrome/Edge desktop+mobile e
 *      Android WebView. Veloce (~10ms/frame), accurato, niente JS bundle
 *      extra. Supporta EAN_13, UPC_A, QR, Code128, Code39, ITF, PDF417,
 *      DataMatrix, Codabar.
 *   2. ZXing fallback — per Safari iOS (BarcodeDetector NON disponibile) e
 *      per i pochi browser senza supporto. @zxing/library decodeFromStream.
 *
 * Fix v8.6.102 (problemi segnalati su mobile):
 *   - `video.play()` esplicito DOPO srcObject: alcuni browser mobile non
 *     auto-playano anche con muted+playsInline se lo stream e' assegnato
 *     fuori da una user gesture (es. open ritardato del sheet)
 *   - waitForMetadata: aspetta `loadedmetadata` prima di iniziare il decode
 *     altrimenti BarcodeDetector lancia "InvalidStateError"
 *   - Logging diagnostico mirato sui failure mode comuni (NotAllowedError,
 *     NotReadableError, OverconstrainedError) per capire da Sentry da
 *     remoto cosa rompe sui device degli utenti
 *   - Fallback graceful: se BarcodeDetector fallisce in runtime, retry
 *     automatico con ZXing senza chiudere il sheet
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/library";
import {
  openScannerStream,
  pulseFocus,
  isTorchSupported,
  setTorch as applyTorch,
  stopStream,
} from "@/lib/scanner/cameraStream";
import { impactFeedback } from "@/lib/mobile/native-haptics";
import { toast } from "sonner";

interface UseBatchScannerCameraOptions {
  open: boolean;
  manualMode: boolean;
  paused?: boolean;
  onScan: (rawCode: string, scanFormat?: string) => void;
}

// ─── Tipi BarcodeDetector (non ancora in TS lib standard) ───────────────────
interface BarcodeDetectorResult {
  rawValue: string;
  format: string;
  boundingBox: DOMRectReadOnly;
}
interface BarcodeDetectorLike {
  detect(source: HTMLVideoElement | ImageBitmap): Promise<BarcodeDetectorResult[]>;
}
interface BarcodeDetectorConstructor {
  new (opts?: { formats?: string[] }): BarcodeDetectorLike;
  getSupportedFormats?: () => Promise<string[]>;
}
const NativeBarcodeDetector: BarcodeDetectorConstructor | undefined =
  typeof window !== "undefined"
    ? (window as unknown as { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector
    : undefined;

const NATIVE_FORMATS = [
  "ean_13", "ean_8", "upc_a", "upc_e",
  "code_128", "code_39", "code_93", "codabar",
  "qr_code", "data_matrix", "pdf417", "itf", "aztec",
];

/** Aspetta `loadedmetadata` del video element (timeout 3s per non bloccare per sempre). */
function waitForMetadata(video: HTMLVideoElement): Promise<void> {
  return new Promise((resolve) => {
    if (video.readyState >= 1) return resolve();
    const onMeta = () => {
      video.removeEventListener("loadedmetadata", onMeta);
      resolve();
    };
    video.addEventListener("loadedmetadata", onMeta, { once: true });
    setTimeout(() => {
      video.removeEventListener("loadedmetadata", onMeta);
      resolve(); // procedi anche se non arriva (degradiamo grazia)
    }, 3000);
  });
}

/** Tenta `video.play()` con catch silenzioso (alcuni browser rifiutano se gia in play). */
async function playVideoSafe(video: HTMLVideoElement): Promise<void> {
  try {
    await video.play();
  } catch (e) {
    // AbortError o NotAllowedError: ricaderemo sul decode comunque, il
    // problema vero (no user gesture) viene loggato dal chiamante.
    const name = (e as Error)?.name;
    if (name && name !== "AbortError") {
      console.warn("[scanner] video.play() failed:", name, (e as Error).message);
    }
  }
}

export function useBatchScannerCamera({
  open,
  manualMode,
  paused = false,
  onScan,
}: UseBatchScannerCameraOptions) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const torchPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onScanRef = useRef(onScan);
  const cameraRunRef = useRef(0);
  // Per BarcodeDetector loop: cancellation flag oltre al runId
  const detectorLoopRef = useRef<{ stop: () => void } | null>(null);

  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  const stopCamera = useCallback(() => {
    cameraRunRef.current += 1;
    if (torchPollRef.current) {
      clearInterval(torchPollRef.current);
      torchPollRef.current = null;
    }
    if (detectorLoopRef.current) {
      detectorLoopRef.current.stop();
      detectorLoopRef.current = null;
    }
    try {
      readerRef.current?.reset();
    } catch {
      /* noop */
    }
    readerRef.current = null;
    stopStream(streamRef.current);
    streamRef.current = null;
    setTorchOn(false);
    setTorchSupported(false);
  }, []);

  /**
   * Decode loop con BarcodeDetector nativo (path veloce). Loop manuale
   * via requestAnimationFrame per non bloccare il main thread.
   */
  const startNativeDecodeLoop = useCallback(
    (video: HTMLVideoElement, runId: number) => {
      if (!NativeBarcodeDetector) return false;
      let detector: BarcodeDetectorLike;
      try {
        detector = new NativeBarcodeDetector({ formats: NATIVE_FORMATS });
      } catch (e) {
        console.warn("[scanner] BarcodeDetector init failed, fallback ZXing:", e);
        return false;
      }
      let cancelled = false;
      let rafId = 0;
      // Throttle: detect a ~10fps invece di 60fps (~100ms ample per camera AF)
      let lastDetect = 0;
      const TICK_MS = 100;

      const tick = async (now: number) => {
        if (cancelled || cameraRunRef.current !== runId) return;
        if (now - lastDetect >= TICK_MS && video.readyState >= 2 && !video.paused) {
          lastDetect = now;
          try {
            const results = await detector.detect(video);
            if (cancelled || cameraRunRef.current !== runId) return;
            if (results.length > 0) {
              const first = results[0];
              onScanRef.current(first.rawValue, first.format?.toUpperCase());
            }
          } catch (e) {
            // Errori transitori (video frame non leggibile): ignora.
            // Errori permanenti: log e fallback ZXing.
            const msg = (e as Error)?.message ?? "";
            if (msg.toLowerCase().includes("not implemented")) {
              cancelled = true;
              console.warn("[scanner] BarcodeDetector runtime fail, fallback ZXing");
              // Trigger fallback: avvia ZXing su questo runId
              startZxingDecodeLoop(video, runId);
              return;
            }
          }
        }
        rafId = requestAnimationFrame(tick);
      };
      rafId = requestAnimationFrame(tick);

      detectorLoopRef.current = {
        stop: () => {
          cancelled = true;
          cancelAnimationFrame(rafId);
        },
      };
      return true;
    },
    // startZxingDecodeLoop e' stable (useCallback con deps []); evitiamo
    // di metterlo come dep per non rischiare loop re-creation reciproci.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  /**
   * Decode loop con ZXing legacy (path fallback per Safari iOS).
   */
  const startZxingDecodeLoop = useCallback(
    (video: HTMLVideoElement, runId: number) => {
      const stream = streamRef.current;
      if (!stream) return;
      const reader = new BrowserMultiFormatReader();
      readerRef.current = reader;
      try {
        reader.decodeFromStream(stream, video, (result, err) => {
          if (cameraRunRef.current !== runId) return;
          if (result) {
            onScanRef.current(
              result.getText(),
              result.getBarcodeFormat?.()?.toString(),
            );
            return;
          }
          // err puo essere NotFoundException ad ogni frame senza codice: ignora.
          // Logghiamo solo errori "veri" (raro).
          if (err && err.name && err.name !== "NotFoundException" && err.name !== "ChecksumException" && err.name !== "FormatException") {
            console.warn("[scanner] ZXing decode error:", err.name, err.message);
          }
        });
      } catch (e) {
        console.error("[scanner] ZXing decodeFromStream failed:", e);
        setCameraError("Decoder barcode non disponibile su questo browser. Usa input manuale.");
      }
    },
    [],
  );

  const startCamera = useCallback(async () => {
    const runId = cameraRunRef.current + 1;
    cameraRunRef.current = runId;
    setCameraError(null);
    try {
      const stream = await openScannerStream();
      if (cameraRunRef.current !== runId) {
        stopStream(stream);
        return;
      }
      streamRef.current = stream;

      const video = videoRef.current;
      if (!video) {
        stopStream(stream);
        console.warn("[scanner] videoRef.current null after stream open — DOM non pronto");
        return;
      }

      // Setta srcObject + force play. ZXing internamente lo fa con il legacy
      // path, ma il path nativo BarcodeDetector richiede che siamo noi a
      // gestire il video element.
      video.srcObject = stream;
      await waitForMetadata(video);
      if (cameraRunRef.current !== runId) {
        stopStream(stream);
        return;
      }
      await playVideoSafe(video);

      // Torch polling (resta uguale)
      let attempts = 0;
      torchPollRef.current = setInterval(() => {
        if (cameraRunRef.current !== runId) {
          if (torchPollRef.current) {
            clearInterval(torchPollRef.current);
            torchPollRef.current = null;
          }
          return;
        }
        attempts++;
        if (isTorchSupported(streamRef.current)) {
          setTorchSupported(true);
          if (torchPollRef.current) {
            clearInterval(torchPollRef.current);
            torchPollRef.current = null;
          }
        } else if (attempts > 25 && torchPollRef.current) {
          clearInterval(torchPollRef.current);
          torchPollRef.current = null;
        }
      }, 200);

      // Engine selection: nativo se possibile, altrimenti ZXing
      const usedNative = startNativeDecodeLoop(video, runId);
      if (!usedNative) {
        startZxingDecodeLoop(video, runId);
      }
    } catch (e) {
      if (cameraRunRef.current !== runId) return;
      const err = e as Error;
      const name = err?.name ?? "";
      let userMessage = err?.message || "Errore avvio fotocamera";
      // Mapping diagnostico errori comuni mobile
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        userMessage = "Permesso fotocamera negato. Concedi l'accesso dalle impostazioni del browser.";
      } else if (name === "NotFoundError" || name === "DevicesNotFoundError") {
        userMessage = "Nessuna fotocamera trovata su questo dispositivo.";
      } else if (name === "NotReadableError" || name === "TrackStartError") {
        userMessage = "Fotocamera occupata da un'altra app. Chiudi le altre app che la usano e riprova.";
      } else if (name === "OverconstrainedError" || name === "ConstraintNotSatisfiedError") {
        userMessage = "Fotocamera non supporta le risoluzioni richieste. Prova un dispositivo diverso.";
      } else if (name === "AbortError") {
        userMessage = "Avvio fotocamera interrotto. Riprova.";
      } else if (name === "SecurityError") {
        userMessage = "Fotocamera bloccata: connessione non sicura (serve HTTPS).";
      }
      console.error("[scanner] startCamera failed:", name, err?.message);
      setCameraError(userMessage);
    }
  }, [startNativeDecodeLoop, startZxingDecodeLoop]);

  useEffect(() => {
    if (!open || manualMode || paused) {
      stopCamera();
      return;
    }
    void startCamera();
    return stopCamera;
  }, [manualMode, open, paused, startCamera, stopCamera]);

  const toggleTorch = useCallback(async () => {
    const ok = await applyTorch(streamRef.current, !torchOn);
    if (ok) {
      setTorchOn((v) => !v);
      void impactFeedback();
    } else {
      toast.error("Torcia non supportata su questo dispositivo");
      setTorchSupported(false);
    }
  }, [torchOn]);

  const handleTapFocus = useCallback(() => {
    if (streamRef.current) void pulseFocus(streamRef.current);
  }, []);

  return {
    videoRef,
    cameraError,
    torchOn,
    torchSupported,
    toggleTorch,
    handleTapFocus,
    stopCamera,
  };
}
