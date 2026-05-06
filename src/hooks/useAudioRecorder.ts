/**
 * useAudioRecorder — hook condiviso per registrazione audio cross-browser
 *
 * FIX 19 (M6) Sprint AI Hardening 1
 *
 * Centralizza la logica di MediaRecorder con fallback Safari/iOS robusti
 * (mp4/aac quando webm non supportato). Espone una state machine semplice
 * e callback `onComplete` quando l'utente conferma.
 *
 * Consumer attuali (TODO: migrare al hook):
 *   - src/components/silvio/SilvioChatSheet.tsx (Silvio chat)
 *   - src/components/quotes/AIQuotePanel.tsx (preventivi AI)
 *   - src/components/campo/CampoAudioRecorder.tsx (rapportino vocale)
 *
 * Esempio:
 *
 *   const { state, elapsedMs, start, stop, blob, error } = useAudioRecorder({
 *     maxDurationSec: 120,
 *     onComplete: (blob, mimeType, durationSec) => transcribeAudio(blob),
 *   });
 *
 *   <button onClick={state === "recording" ? stop : start}>
 *     {state === "recording" ? "Stop" : "Record"}
 *   </button>
 */
import { useCallback, useEffect, useRef, useState } from "react";

export type AudioRecorderState =
  | "idle"
  | "requesting"
  | "recording"
  | "stopped"
  | "error";

export interface UseAudioRecorderOptions {
  /** Durata massima in secondi prima di stop automatico. Default 120 (2min). */
  maxDurationSec?: number;
  /** Bitrate in bps. Default 128_000. */
  bitrateBps?: number;
  /** Chiamato quando la registrazione termina con successo. */
  onComplete?: (blob: Blob, mimeType: string, durationSec: number) => void;
  /** Chiamato in caso di errore (incluso permesso negato). */
  onError?: (errorMessage: string, errorKind: AudioRecorderErrorKind) => void;
}

export type AudioRecorderErrorKind =
  | "unsupported"
  | "permission_denied"
  | "no_device"
  | "device_busy"
  | "construct_failed"
  | "recording_error"
  | "unknown";

export interface UseAudioRecorderResult {
  state: AudioRecorderState;
  elapsedMs: number;
  /** Disponibile dopo stop. */
  blob: Blob | null;
  /** MIME effettivamente usato dal recorder. Disponibile dopo start. */
  mimeType: string | null;
  /** Errore in formato leggibile, presente quando state==="error". */
  error: string | null;
  errorKind: AudioRecorderErrorKind | null;
  start: () => Promise<void>;
  stop: () => void;
  /** Pulisce stato + blob (per registrare di nuovo). */
  reset: () => void;
}

const DEFAULT_MAX_DURATION_SEC = 120;
const DEFAULT_BITRATE_BPS = 128_000;

/**
 * Sceglie il MIME audio supportato dal browser corrente.
 * Ordina dal più desiderabile (webm/opus) al fallback Safari (mp4/aac).
 */
export function pickBestAudioMime(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4;codecs=mp4a.40.2",
    "audio/mp4",
    "audio/aac",
    "audio/ogg;codecs=opus",
    "audio/ogg",
  ];
  for (const c of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(c)) return c;
    } catch {
      /* continue */
    }
  }
  return undefined;
}

/**
 * Estensione file appropriata per il MIME audio.
 * Utile per dare al backend un nome di file coerente (FFmpeg/Whisper-friendly).
 */
export function extFromAudioMime(mime: string): string {
  if (!mime) return "audio";
  if (mime.includes("webm")) return "webm";
  if (mime.includes("mp4") || mime.includes("aac")) return "m4a";
  if (mime.includes("ogg")) return "ogg";
  return "audio";
}

/**
 * Mappa l'errore getUserMedia/MediaRecorder a un kind enumerato + messaggio utente-friendly.
 */
function classifyError(err: unknown): { kind: AudioRecorderErrorKind; msg: string } {
  const raw = err instanceof Error ? err.message : String(err);
  const lower = raw.toLowerCase();
  if (lower.includes("notallowed") || lower.includes("permission")) {
    return { kind: "permission_denied", msg: "Permesso microfono negato. Abilita l'accesso nelle impostazioni del browser." };
  }
  if (lower.includes("notfound") || lower.includes("devicesnotfound")) {
    return { kind: "no_device", msg: "Nessun microfono rilevato. Collega un microfono e riprova." };
  }
  if (lower.includes("notreadable") || lower.includes("trackstart")) {
    return { kind: "device_busy", msg: "Microfono occupato da un'altra app. Chiudila e riprova." };
  }
  return { kind: "unknown", msg: raw };
}

export function useAudioRecorder(opts: UseAudioRecorderOptions = {}): UseAudioRecorderResult {
  const maxDurationSec = opts.maxDurationSec ?? DEFAULT_MAX_DURATION_SEC;
  const bitrateBps = opts.bitrateBps ?? DEFAULT_BITRATE_BPS;
  const onComplete = opts.onComplete;
  const onError = opts.onError;

  const [state, setState] = useState<AudioRecorderState>("idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [mimeType, setMimeType] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<AudioRecorderErrorKind | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const startTsRef = useRef<number>(0);

  const stopTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopTimer();
      stopStream();
      try {
        if (recorderRef.current && recorderRef.current.state !== "inactive") {
          recorderRef.current.stop();
        }
      } catch {
        /* ignore */
      }
    };
  }, [stopTimer, stopStream]);

  const start = useCallback(async () => {
    setError(null);
    setErrorKind(null);
    setBlob(null);
    setElapsedMs(0);

    if (typeof MediaRecorder === "undefined") {
      const msg = "Browser non supporta la registrazione audio.";
      setError(msg);
      setErrorKind("unsupported");
      setState("error");
      onError?.(msg, "unsupported");
      return;
    }
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      const msg = "Microfono non disponibile (richiede HTTPS o browser moderno).";
      setError(msg);
      setErrorKind("unsupported");
      setState("error");
      onError?.(msg, "unsupported");
      return;
    }

    setState("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const picked = pickBestAudioMime();
      let recorder: MediaRecorder;
      try {
        recorder = new MediaRecorder(stream, picked
          ? { mimeType: picked, audioBitsPerSecond: bitrateBps }
          : { audioBitsPerSecond: bitrateBps });
      } catch (constructErr) {
        // Safari pre-15 può rifiutare anche audioBitsPerSecond → ultimo tentativo nudo
        console.warn("[useAudioRecorder] MediaRecorder construct fallito, fallback default:", constructErr);
        try {
          recorder = new MediaRecorder(stream);
        } catch (innerErr) {
          const { kind, msg } = classifyError(innerErr);
          setError(msg);
          setErrorKind("construct_failed");
          setState("error");
          stopStream();
          onError?.(msg, kind);
          return;
        }
      }

      const finalMime = recorder.mimeType || picked || "audio/webm";
      setMimeType(finalMime);
      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data);
      };
      recorder.onerror = (ev) => {
        console.error("[useAudioRecorder] MediaRecorder error:", ev);
        const msg = "Errore durante la registrazione audio.";
        setError(msg);
        setErrorKind("recording_error");
        setState("error");
        stopTimer();
        stopStream();
        onError?.(msg, "recording_error");
      };
      recorder.onstop = () => {
        stopStream();
        stopTimer();
        const out = new Blob(chunksRef.current, { type: finalMime });
        setBlob(out);
        const durationSec = Math.max(0, Math.floor((Date.now() - startTsRef.current) / 1000));
        setState("stopped");
        if (out.size > 0) {
          onComplete?.(out, finalMime, durationSec);
        }
      };

      recorder.start();
      startTsRef.current = Date.now();
      setState("recording");
      timerRef.current = window.setInterval(() => {
        setElapsedMs((prev) => {
          const next = prev + 100;
          if (next >= maxDurationSec * 1000) {
            try {
              if (recorderRef.current && recorderRef.current.state === "recording") {
                recorderRef.current.stop();
              }
            } catch {
              /* ignore */
            }
          }
          return next;
        });
      }, 100);
    } catch (err) {
      const { kind, msg } = classifyError(err);
      setError(msg);
      setErrorKind(kind);
      setState("error");
      stopStream();
      onError?.(msg, kind);
    }
  }, [bitrateBps, maxDurationSec, onComplete, onError, stopStream, stopTimer]);

  const stop = useCallback(() => {
    try {
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        recorderRef.current.stop();
      }
    } catch {
      /* ignore — state già finale */
    }
  }, []);

  const reset = useCallback(() => {
    setState("idle");
    setElapsedMs(0);
    setBlob(null);
    setError(null);
    setErrorKind(null);
    setMimeType(null);
    chunksRef.current = [];
  }, []);

  return {
    state,
    elapsedMs,
    blob,
    mimeType,
    error,
    errorKind,
    start,
    stop,
    reset,
  };
}
