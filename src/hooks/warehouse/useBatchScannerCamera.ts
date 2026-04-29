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

  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  const stopCamera = useCallback(() => {
    if (torchPollRef.current) {
      clearInterval(torchPollRef.current);
      torchPollRef.current = null;
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

  const startCamera = useCallback(async () => {
    setCameraError(null);
    try {
      const stream = await openScannerStream();
      streamRef.current = stream;

      const reader = new BrowserMultiFormatReader();
      readerRef.current = reader;

      const video = videoRef.current;
      if (!video) {
        stopStream(stream);
        return;
      }

      // Alcuni browser espongono la torcia solo qualche frame dopo getUserMedia.
      let attempts = 0;
      torchPollRef.current = setInterval(() => {
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

      reader.decodeFromStream(stream, video, (result) => {
        if (!result) return;
        onScanRef.current(result.getText(), result.getBarcodeFormat?.()?.toString());
      });
    } catch (e) {
      setCameraError(e instanceof Error ? e.message : "Errore avvio fotocamera");
    }
  }, []);

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
