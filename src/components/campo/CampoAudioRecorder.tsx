/**
 * Registratore audio per rapportino vocale.
 * - MediaRecorder API, preferisce WebM/Opus (fallback MP4/AAC su iOS)
 * - Timer visibile, stop automatico a 2 minuti
 * - Player post-registrazione per riascoltare
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Square, Play, Pause, RotateCcw, Check, Loader2 } from "lucide-react";
import type { JSX } from "react";

const MAX_DURATION_SEC = 120;
const MIN_DURATION_SEC = 3;
// Per la voce bastano 64 kbit/s: metà del peso di prima da caricare con la rete del cantiere.
const BITRATE_BPS = 64_000;

type RecorderState = "idle" | "requesting" | "recording" | "stopped" | "error";

interface CampoAudioRecorderProps {
  onConfirm: (blob: Blob, durationSec: number, mimeType: string) => void | Promise<void>;
  disabled?: boolean;
}

function pickMimeType(): string {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4;codecs=mp4a.40.2",
    "audio/mp4",
  ];
  for (const c of candidates) {
    if (typeof MediaRecorder.isTypeSupported === "function" && MediaRecorder.isTypeSupported(c)) return c;
  }
  // Lascia scegliere al browser anziché imporre un formato non supportato.
  return "";
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
  const [confirming, setConfirming] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const mimeRef = useRef<string>("audio/webm");
  const mountedRef = useRef(false);
  const runRef = useRef(0);
  const stateRef = useRef<RecorderState>("idle");
  const audioUrlRef = useRef<string | null>(null);
  const startedAtRef = useRef(0);
  const durationRef = useRef(0);
  const confirmingRef = useRef(false);
  const playingRequestRef = useRef(false);
  const playRunRef = useRef(0);
  const playbackWantedRef = useRef(false);

  const stopTimer = useCallback((): void => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const stopStream = useCallback((): void => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  const releasePreview = useCallback((): void => {
    audioElRef.current?.pause();
    playRunRef.current += 1;
    playbackWantedRef.current = false;
    playingRequestRef.current = false;
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    audioUrlRef.current = null;
  }, []);

  const disposeRecording = useCallback((): void => {
    stopTimer();
    const recorder = mediaRecorderRef.current;
    mediaRecorderRef.current = null;
    if (recorder) {
      // stop() genera eventi asincroni: non devono ricreare un'anteprima dopo l'uscita.
      recorder.ondataavailable = null;
      recorder.onstop = null;
      recorder.onerror = null;
      if (recorder.state !== "inactive") {
        try { recorder.stop(); } catch { /* Le tracce vengono comunque fermate. */ }
      }
    }
    stopStream();
    chunksRef.current = [];
  }, [stopStream, stopTimer]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      runRef.current += 1;
      disposeRecording();
      releasePreview();
    };
  }, [disposeRecording, releasePreview]);

  // Monotono: una correzione dell'orologio del telefono non cambia le ore dell'audio.
  const readDuration = (): number => Math.max(0, Math.min(MAX_DURATION_SEC, Math.floor((performance.now() - startedAtRef.current) / 1000)));

  const startRecording = async (): Promise<void> => {
    if (disabled || confirmingRef.current || stateRef.current === "requesting" || stateRef.current === "recording") return;
    const run = ++runRef.current;
    const isCurrent = () => mountedRef.current && runRef.current === run;
    stateRef.current = "requesting";
    setErrorMsg(null);
    setState("requesting");

    if (typeof MediaRecorder === "undefined" || typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setErrorMsg("Registrazione audio non supportata su questo dispositivo");
      setState("error");
      stateRef.current = "error";
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!isCurrent()) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(stream, {
        ...(mimeType ? { mimeType } : {}),
        audioBitsPerSecond: BITRATE_BPS,
      });
      mediaRecorderRef.current = recorder;
      mimeRef.current = recorder.mimeType || mimeType;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (isCurrent() && e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        if (!isCurrent()) return;
        stopTimer();
        durationRef.current = readDuration();
        setElapsed(durationRef.current);
        mimeRef.current = recorder.mimeType || chunksRef.current[0]?.type || mimeRef.current;
        const blob = new Blob(chunksRef.current, { type: mimeRef.current });
        stopStream();
        if (!blob.size) {
          runRef.current += 1;
          disposeRecording();
          stateRef.current = "error";
          setErrorMsg("Registrazione vuota. Riprova.");
          setState("error");
          return;
        }
        releasePreview();
        setAudioBlob(blob);
        const url = URL.createObjectURL(blob);
        audioUrlRef.current = url;
        setAudioUrl(url);
        stateRef.current = "stopped";
        setState("stopped");
      };
      recorder.onerror = () => {
        if (!isCurrent()) return;
        runRef.current += 1;
        disposeRecording();
        setErrorMsg("Errore durante la registrazione");
        stateRef.current = "error";
        setState("error");
      };

      // eslint-disable-next-line react-hooks/purity -- Eseguito solo nel click asincrono di avvio, mai durante il render.
      startedAtRef.current = performance.now();
      durationRef.current = 0;
      recorder.start();
      if (!isCurrent()) return;
      setElapsed(0);
      stateRef.current = "recording";
      setState("recording");

      timerRef.current = window.setInterval(() => {
        if (!isCurrent()) return;
        durationRef.current = readDuration();
        setElapsed(durationRef.current);
        if (durationRef.current >= MAX_DURATION_SEC) stopRecording();
      }, 1000);
    } catch (err) {
      if (!isCurrent()) return;
      runRef.current += 1;
      disposeRecording();
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
      stateRef.current = "error";
    }
  };

  const stopRecording = (): void => {
    stopTimer();
    if (mediaRecorderRef.current?.state === "recording") {
      try { mediaRecorderRef.current.stop(); }
      catch {
        runRef.current += 1;
        disposeRecording();
        stateRef.current = "error";
        setState("error");
        setErrorMsg("Errore durante la registrazione. Riprova.");
      }
    }
  };

  const resetRecording = (): void => {
    if (disabled || confirmingRef.current) return;
    runRef.current += 1;
    disposeRecording();
    releasePreview();
    setAudioUrl(null);
    setAudioBlob(null);
    setElapsed(0);
    durationRef.current = 0;
    stateRef.current = "idle";
    setErrorMsg(null);
    setState("idle");
    setIsPlaying(false);
  };

  const togglePlay = async (): Promise<void> => {
    const audio = audioElRef.current;
    if (!audio || playingRequestRef.current) return;
    if (isPlaying) {
      playbackWantedRef.current = false;
      audio.pause();
      setIsPlaying(false);
    } else {
      const run = runRef.current;
      const playRun = ++playRunRef.current;
      playbackWantedRef.current = true;
      playingRequestRef.current = true;
      try {
        await audio.play();
        if (mountedRef.current && runRef.current === run && playRunRef.current === playRun) {
          setErrorMsg(null);
          setIsPlaying(true);
        } else if (!playbackWantedRef.current || audioElRef.current !== audio) audio.pause();
      } catch {
        if (mountedRef.current && runRef.current === run && playRunRef.current === playRun) {
          playbackWantedRef.current = false;
          setIsPlaying(false);
          setErrorMsg("Non riesco a riascoltare. Puoi usare l’audio o registrarlo di nuovo.");
        }
      } finally {
        if (playRunRef.current === playRun) playingRequestRef.current = false;
      }
    }
  };

  const handleConfirm = async (): Promise<void> => {
    if (disabled || confirmingRef.current || !audioBlob || durationRef.current < MIN_DURATION_SEC) return;
    confirmingRef.current = true;
    runRef.current += 1; // Annulla anche una richiesta di riascolto ancora in attesa.
    playRunRef.current += 1;
    playingRequestRef.current = false;
    playbackWantedRef.current = false;
    setConfirming(true);
    audioElRef.current?.pause();
    setIsPlaying(false);
    try {
      await onConfirm(audioBlob, durationRef.current, mimeRef.current);
    } catch {
      if (mountedRef.current) setErrorMsg("Non riesco a usare l’audio. Riprova.");
    } finally {
      confirmingRef.current = false;
      if (mountedRef.current) setConfirming(false);
    }
  };

  // ─── Render ──
  return (
    <div className="space-y-4">
      {errorMsg && (
        <div
          role="alert"
          className="rounded-xl bg-red-50 border border-red-300 p-3 text-sm text-red-800"
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
            disabled={disabled || confirming}
            aria-label="Inizia registrazione"
            className="w-24 h-24 rounded-full bg-red-500 text-white flex items-center justify-center shadow-2xl shadow-red-500/30 active:scale-95 transition-transform disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Mic className="w-10 h-10" strokeWidth={2.5} />
          </button>
          <p className="text-sm text-foreground font-medium">Tocca per registrare</p>
          <p className="text-xs text-muted-foreground">Max {MAX_DURATION_SEC / 60} minuti</p>
        </div>
      )}

      {/* Requesting */}
      {state === "requesting" && (
        <div className="flex flex-col items-center gap-3 py-4">
          <div className="w-24 h-24 rounded-full bg-muted flex items-center justify-center">
            <Loader2 className="w-10 h-10 text-amber-400 animate-spin" />
          </div>
          <p className="text-sm text-muted-foreground">Accesso al microfono…</p>
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
          <div className="font-mono text-3xl font-bold text-foreground tabular-nums">
            {formatTime(elapsed)}
          </div>
          <div className="w-48 h-1 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-red-500 transition-all duration-1000"
              style={{ width: `${(elapsed / MAX_DURATION_SEC) * 100}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground">Registrazione in corso… tocca stop per terminare</p>
        </div>
      )}

      {/* Stopped: player + azioni */}
      {state === "stopped" && audioUrl && (
        <div className="space-y-3">
          <div className="rounded-xl bg-muted/60 border p-4">
            <audio
              ref={audioElRef}
              src={audioUrl}
              onEnded={() => { playbackWantedRef.current = false; setIsPlaying(false); }}
              className="hidden"
            />
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={togglePlay}
                disabled={disabled || confirming}
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
                <p className="text-sm text-foreground font-medium">Registrazione pronta</p>
                <p className="text-xs text-muted-foreground font-mono">{formatTime(elapsed)}</p>
              </div>
            </div>
          </div>

          {elapsed < MIN_DURATION_SEC && <p role="status" className="text-sm text-muted-foreground">Registra almeno 3 secondi. Tocca Riprova.</p>}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={resetRecording}
              disabled={disabled || confirming}
              className="flex-1 h-12 rounded-xl bg-background border text-foreground font-medium flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-40"
            >
              <RotateCcw className="w-4 h-4" />
              Riprova
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={disabled || confirming || elapsed < MIN_DURATION_SEC}
              className="flex-1 h-12 rounded-xl bg-amber-500 text-slate-950 font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-40"
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
