/**
 * Registratore audio per rapportino vocale.
 * - MediaRecorder API, preferisce WebM/Opus (fallback MP4/AAC su iOS)
 * - Timer visibile, stop automatico a 2 minuti
 * - Player post-registrazione per riascoltare
 */
import { useEffect, useRef, useState } from "react";
import { Mic, Square, Play, Pause, RotateCcw, Check, Loader2 } from "lucide-react";
import type { JSX } from "react";

const MAX_DURATION_SEC = 120;
const BITRATE_BPS = 128_000;

type RecorderState = "idle" | "requesting" | "recording" | "stopped" | "error";

interface CampoAudioRecorderProps {
  onConfirm: (blob: Blob, durationSec: number, mimeType: string) => void;
  disabled?: boolean;
}

function pickMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "audio/webm";
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4;codecs=mp4a.40.2",
    "audio/mp4",
  ];
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c)) return c;
  }
  return "audio/webm";
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function CampoAudioRecorder({
  onConfirm,
  disabled,
}: CampoAudioRecorderProps): JSX.Element {
  const [state, setState] = useState<RecorderState>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const mimeRef = useRef<string>("audio/webm");

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopTimer();
      stopStream();
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopTimer = (): void => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const stopStream = (): void => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  };

  const startRecording = async (): Promise<void> => {
    setErrorMsg(null);
    setState("requesting");

    if (typeof navigator === "undefined" || !navigator.mediaDevices) {
      setErrorMsg("Registrazione audio non supportata su questo dispositivo");
      setState("error");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = pickMimeType();
      mimeRef.current = mimeType;
      const recorder = new MediaRecorder(stream, {
        mimeType,
        audioBitsPerSecond: BITRATE_BPS,
      });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeRef.current });
        setAudioBlob(blob);
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        stopStream();
        setState("stopped");
      };
      recorder.onerror = () => {
        setErrorMsg("Errore durante la registrazione");
        setState("error");
        stopStream();
      };

      recorder.start();
      setElapsed(0);
      setState("recording");

      timerRef.current = window.setInterval(() => {
        setElapsed((prev) => {
          const next = prev + 1;
          if (next >= MAX_DURATION_SEC) {
            // Stop automatico
            if (mediaRecorderRef.current?.state === "recording") {
              mediaRecorderRef.current.stop();
            }
            stopTimer();
          }
          return next;
        });
      }, 1000);
    } catch (err) {
      const error = err as DOMException;
      if (error.name === "NotAllowedError") {
        setErrorMsg(
          "Permesso microfono negato. Attiva il microfono nelle impostazioni del browser.",
        );
      } else if (error.name === "NotFoundError") {
        setErrorMsg("Microfono non trovato sul dispositivo.");
      } else {
        setErrorMsg("Impossibile accedere al microfono");
      }
      setState("error");
      stopStream();
    }
  };

  const stopRecording = (): void => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    stopTimer();
  };

  const resetRecording = (): void => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(null);
    setAudioBlob(null);
    setElapsed(0);
    setState("idle");
    setIsPlaying(false);
  };

  const togglePlay = (): void => {
    if (!audioElRef.current) return;
    if (isPlaying) {
      audioElRef.current.pause();
      setIsPlaying(false);
    } else {
      void audioElRef.current.play();
      setIsPlaying(true);
    }
  };

  const handleConfirm = (): void => {
    if (audioBlob) {
      onConfirm(audioBlob, elapsed, mimeRef.current);
    }
  };

  // ─── Render ──
  return (
    <div className="space-y-4">
      {errorMsg && (
        <div
          role="alert"
          className="rounded-xl bg-red-950/60 border border-red-500 p-3 text-sm text-red-200"
        >
          {errorMsg}
        </div>
      )}

      {/* Idle: bottone record */}
      {(state === "idle" || state === "error") && (
        <div className="flex flex-col items-center gap-3 py-4">
          <button
            type="button"
            onClick={startRecording}
            disabled={disabled}
            aria-label="Inizia registrazione"
            className="w-24 h-24 rounded-full bg-red-500 text-white flex items-center justify-center shadow-2xl shadow-red-500/30 active:scale-95 transition-transform disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Mic className="w-10 h-10" strokeWidth={2.5} />
          </button>
          <p className="text-sm text-slate-300 font-medium">Tocca per registrare</p>
          <p className="text-xs text-slate-500">Max {MAX_DURATION_SEC / 60} minuti</p>
        </div>
      )}

      {/* Requesting */}
      {state === "requesting" && (
        <div className="flex flex-col items-center gap-3 py-4">
          <div className="w-24 h-24 rounded-full bg-slate-800 flex items-center justify-center">
            <Loader2 className="w-10 h-10 text-amber-400 animate-spin" />
          </div>
          <p className="text-sm text-slate-300">Accesso al microfono…</p>
        </div>
      )}

      {/* Recording */}
      {state === "recording" && (
        <div className="flex flex-col items-center gap-3 py-4">
          <button
            type="button"
            onClick={stopRecording}
            aria-label="Ferma registrazione"
            className="relative w-24 h-24 rounded-full bg-red-600 text-white flex items-center justify-center shadow-2xl shadow-red-500/50 active:scale-95 transition-transform"
          >
            <span className="absolute inset-0 rounded-full bg-red-500 animate-ping opacity-40" />
            <Square className="w-9 h-9 fill-white relative" strokeWidth={0} />
          </button>
          <div className="font-mono text-3xl font-bold text-white tabular-nums">
            {formatTime(elapsed)}
          </div>
          <div className="w-48 h-1 rounded-full bg-slate-800 overflow-hidden">
            <div
              className="h-full bg-red-500 transition-all duration-1000"
              style={{ width: `${(elapsed / MAX_DURATION_SEC) * 100}%` }}
            />
          </div>
          <p className="text-xs text-slate-500">Registrazione in corso… tocca stop per terminare</p>
        </div>
      )}

      {/* Stopped: player + azioni */}
      {state === "stopped" && audioUrl && (
        <div className="space-y-3">
          <div className="rounded-xl bg-slate-900 border border-slate-800 p-4">
            <audio
              ref={audioElRef}
              src={audioUrl}
              onEnded={() => setIsPlaying(false)}
              className="hidden"
            />
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={togglePlay}
                aria-label={isPlaying ? "Pausa" : "Riproduci"}
                className="w-12 h-12 rounded-full bg-amber-500 text-slate-950 flex items-center justify-center active:scale-95 transition-transform"
              >
                {isPlaying ? (
                  <Pause className="w-6 h-6" />
                ) : (
                  <Play className="w-6 h-6 ml-0.5" />
                )}
              </button>
              <div className="flex-1">
                <p className="text-sm text-white font-medium">Registrazione pronta</p>
                <p className="text-xs text-slate-500 font-mono">{formatTime(elapsed)}</p>
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={resetRecording}
              className="flex-1 h-12 rounded-xl bg-slate-800 border border-slate-700 text-white font-medium flex items-center justify-center gap-2 active:scale-95 transition-transform"
            >
              <RotateCcw className="w-4 h-4" />
              Riprova
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              className="flex-1 h-12 rounded-xl bg-amber-500 text-slate-950 font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform"
            >
              <Check className="w-5 h-5" />
              Usa questo
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
