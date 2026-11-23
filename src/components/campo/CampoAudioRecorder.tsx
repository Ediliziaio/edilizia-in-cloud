/**
 * Registratore audio per rapportino vocale.
 * - MediaRecorder API, preferisce WebM/Opus (fallback MP4/AAC su iOS)
 * - Timer visibile, stop automatico a 3 minuti (stesso limite di «Compila parlando» e della dettatura)
 * - Player post-registrazione per riascoltare
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Square, Play, Pause, RotateCcw, Check, Loader2 } from "lucide-react";
import type { JSX } from "react";
import { CAMPO_AUDIO_MAX_SECONDI, CAMPO_AUDIO_MIN_SECONDI } from "@/lib/campo/dettaTesto";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/campo/lingua/LinguaCampo";
import "./CampoAudioRecorder.css";

// Un solo limite per registratore e server: prima il registratore si fermava a 2 minuti e il hook ne accettava 30.
const MAX_DURATION_SEC = CAMPO_AUDIO_MAX_SECONDI;
const MIN_DURATION_SEC = CAMPO_AUDIO_MIN_SECONDI;
// Per la voce bastano 64 kbit/s: metà del peso di prima da caricare con la rete del cantiere.
const BITRATE_BPS = 64_000;
const ALTEZZE_ONDA = [7, 12, 20, 29, 15, 26, 32, 18, 28, 36, 21, 31, 23, 15, 24, 17, 10, 6];

type RecorderState = "idle" | "requesting" | "recording" | "finalizing" | "stopped" | "error";

interface CampoAudioRecorderProps {
  onConfirm: (blob: Blob, durationSec: number, mimeType: string) => void | Promise<void>;
  disabled?: boolean;
  confirmLabel?: string;
  confirmAvailable?: boolean;
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
  confirmLabel,
  confirmAvailable = true,
}: CampoAudioRecorderProps): JSX.Element {
  const tr = useT();
  const [state, setState] = useState<RecorderState>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [ascoltato, setAscoltato] = useState(0);
  const [confirming, setConfirming] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const ondaRef = useRef<HTMLDivElement | null>(null);
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

  useEffect(() => {
    if (state !== "recording" || !streamRef.current || !ondaRef.current || typeof window.matchMedia !== "function") return;
    const stream = streamRef.current;
    const barre = Array.from(ondaRef.current.querySelectorAll("span"));
    const movimento = window.matchMedia("(prefers-reduced-motion: no-preference)");
    const Audio = window.AudioContext;
    if (!Audio) return;

    let audio: AudioContext | undefined;
    let sorgente: MediaStreamAudioSourceNode | undefined;
    let frame = 0;

    const fermaOnda = () => {
      cancelAnimationFrame(frame);
      sorgente?.disconnect();
      sorgente = undefined;
      if (audio) void audio.close().catch(() => {});
      audio = undefined;
      barre.forEach(barra => { barra.style.transform = ""; });
    };
    const seguiPreferenza = () => {
      fermaOnda();
      if (!movimento.matches) return;
      // Il grafico è facoltativo: dove Web Audio è sospeso, timer e audio restano operativi.
      try {
        audio = new Audio();
        const analizzatore = audio.createAnalyser();
        analizzatore.fftSize = 128;
        const frequenze = new Uint8Array(analizzatore.frequencyBinCount);
        sorgente = audio.createMediaStreamSource(stream);
        sorgente.connect(analizzatore);
        void audio.resume().catch(() => {});
        let ultimo = 0;
        const aggiorna = (tempo: number) => {
          if (tempo - ultimo >= 65) {
            analizzatore.getByteFrequencyData(frequenze);
            barre.forEach((barra, i) => {
              const intensita = frequenze[1 + i] / 255;
              barra.style.transform = `scaleY(${0.24 + 0.83 * intensita})`;
            });
            ultimo = tempo;
          }
          frame = requestAnimationFrame(aggiorna);
        };
        frame = requestAnimationFrame(aggiorna);
      } catch { fermaOnda(); }
    };
    seguiPreferenza();
    movimento.addEventListener?.("change", seguiPreferenza);
    return () => {
      movimento.removeEventListener?.("change", seguiPreferenza);
      fermaOnda();
    };
  }, [state]);

  // Monotono: una correzione dell'orologio del telefono non cambia le ore dell'audio.
  const readDuration = (): number => Math.max(0, Math.min(MAX_DURATION_SEC, Math.floor((performance.now() - startedAtRef.current) / 1000)));

  const startRecording = async (): Promise<void> => {
    if (disabled || confirmingRef.current || (stateRef.current !== "idle" && stateRef.current !== "error")) return;
    const run = ++runRef.current;
    const isCurrent = () => mountedRef.current && runRef.current === run;
    stateRef.current = "requesting";
    setErrorMsg(null);
    setState("requesting");

    if (typeof MediaRecorder === "undefined" || typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setErrorMsg(tr("Registrazione audio non supportata su questo dispositivo"));
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
          setErrorMsg(tr("Registrazione vuota. Riprova."));
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
        setErrorMsg(tr("Errore durante la registrazione"));
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
          tr("Permesso microfono negato. Attiva il microfono nelle impostazioni del browser."),
        );
      } else if (error.name === "NotFoundError") {
        setErrorMsg(tr("Microfono non trovato sul dispositivo."));
      } else if (error.name === "NotReadableError") {
        setErrorMsg(tr("Il microfono è occupato. Chiudi le altre app che lo usano e riprova."));
      } else {
        setErrorMsg(tr("Impossibile accedere al microfono"));
      }
      setState("error");
      stateRef.current = "error";
    }
  };

  const stopRecording = (): void => {
    stopTimer();
    if (mediaRecorderRef.current?.state === "recording") {
      stateRef.current = "finalizing";
      setState("finalizing");
      try { mediaRecorderRef.current.stop(); }
      catch {
        runRef.current += 1;
        disposeRecording();
        stateRef.current = "error";
        setState("error");
        setErrorMsg(tr("Errore durante la registrazione. Riprova."));
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
    setAscoltato(0);
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
          setErrorMsg(tr("Non riesco a riascoltare. Puoi usare l’audio o registrarlo di nuovo."));
        }
      } finally {
        if (playRunRef.current === playRun) playingRequestRef.current = false;
      }
    }
  };

  const handleConfirm = async (): Promise<void> => {
    if (disabled || !confirmAvailable || confirmingRef.current || !audioBlob || durationRef.current < MIN_DURATION_SEC) return;
    confirmingRef.current = true;
    runRef.current += 1; // Annulla anche una richiesta di riascolto ancora in attesa.
    playRunRef.current += 1;
    playingRequestRef.current = false;
    playbackWantedRef.current = false;
    setConfirming(true);
    setErrorMsg(null);
    audioElRef.current?.pause();
    setIsPlaying(false);
    try {
      await onConfirm(audioBlob, durationRef.current, mimeRef.current);
    } catch {
      if (mountedRef.current) setErrorMsg(tr("Non riesco a usare l’audio. Riprova."));
    } finally {
      confirmingRef.current = false;
      if (mountedRef.current) setConfirming(false);
    }
  };

  const pronto = state === "stopped" && audioUrl !== null;
  const registra = state === "recording";
  const inAttesa = state === "requesting" || state === "finalizing";
  const riproduzione = elapsed > 0 ? Math.min(1, ascoltato / elapsed) : 0;
  const titolo: Record<RecorderState, string> = {
    idle: tr("Tocca per registrare"),
    error: tr("Tocca per registrare"),
    requesting: tr("Accesso al microfono…"),
    recording: tr("Registrazione in corso"),
    finalizing: tr("Preparo l’audio…"),
    stopped: tr("Registrazione pronta"),
  };

  return (
    <div className="space-y-2.5" data-registratore={state}>
      {errorMsg && <p role="alert" className="rounded-xl border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive">{errorMsg}</p>}

      <div className="campo-audio-entrata rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/10 via-background to-background p-3">
        <div className="flex min-w-0 items-center gap-3">
          {pronto ? (
            <button
              type="button"
              onClick={togglePlay}
              disabled={disabled || confirming}
              aria-label={isPlaying ? tr("Pausa") : tr("Riproduci")}
              className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm outline-offset-4 motion-safe:transition-transform motion-safe:active:scale-95 disabled:opacity-50"
            >
              {isPlaying ? <Pause className="size-5" aria-hidden="true" /> : <Play className="ml-0.5 size-5" aria-hidden="true" />}
            </button>
          ) : registra ? (
            <button
              type="button"
              onClick={stopRecording}
              aria-label={tr("Ferma registrazione")}
              className="flex size-12 shrink-0 items-center justify-center rounded-full bg-red-600 text-white shadow-sm outline-offset-4 motion-safe:transition-transform motion-safe:active:scale-95"
            >
              <Square className="size-4 fill-current" aria-hidden="true" />
            </button>
          ) : inAttesa ? (
            <span className="flex size-12 shrink-0 items-center justify-center rounded-full border border-primary/20 bg-background text-primary">
              <Loader2 className="size-5 motion-safe:animate-spin" aria-hidden="true" />
            </span>
          ) : (
            <button
              type="button"
              onClick={startRecording}
              disabled={disabled || confirming}
              aria-label={tr("Inizia registrazione")}
              className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm outline-offset-4 motion-safe:transition-transform motion-safe:active:scale-95 disabled:opacity-50"
            >
              <Mic className="size-5" aria-hidden="true" />
            </button>
          )}
          <div className="min-w-0 flex-1">
            <p role="status" className="text-sm font-semibold text-foreground">{titolo[state]}</p>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {registra && <span className="size-2 shrink-0 rounded-full bg-red-600" aria-hidden="true" />}
              {pronto || registra || state === "finalizing" ? (
                <span className="font-mono tabular-nums" role="timer" aria-label={tr("Durata della registrazione")}>{formatTime(elapsed)}</span>
              ) : <span>{tr("Fino a {n} minuti", { n: MAX_DURATION_SEC / 60 })}</span>}
            </div>
          </div>
          <div
            ref={ondaRef}
            aria-hidden="true"
            data-ascolto={isPlaying}
            className={cn("campo-audio-onda flex h-9 w-[28%] min-w-8 max-w-28 shrink-0 items-center justify-center gap-[2px]",
              registra ? "text-red-600 dark:text-red-400" : "text-primary")}
          >
            {ALTEZZE_ONDA.map((altezza, i) => <span key={i} className="min-w-0 max-w-[3px] flex-1 rounded-full bg-current opacity-70" style={{ height: altezza }} />)}
          </div>
        </div>

        {(pronto || registra) && <div aria-hidden="true" className="mt-3 h-1 overflow-hidden rounded-full bg-primary/10">
          <div className={cn("h-full origin-left rounded-full motion-safe:transition-transform motion-safe:duration-200", registra ? "bg-red-600" : "bg-primary")}
            style={{ transform: `scaleX(${pronto ? riproduzione : elapsed / MAX_DURATION_SEC})` }} />
        </div>}

        {pronto && <audio
          ref={audioElRef}
          src={audioUrl}
          preload="metadata"
          onTimeUpdate={event => setAscoltato(event.currentTarget.currentTime)}
          onPause={() => setIsPlaying(false)}
          onEnded={() => { playbackWantedRef.current = false; setIsPlaying(false); setAscoltato(0); }}
          className="hidden"
        />}
      </div>

      {state === "requesting" && (
        <button type="button" className="min-h-11 rounded-lg px-2 text-sm font-semibold text-primary" onClick={resetRecording}>
          {tr("Annulla richiesta")}
        </button>
      )}

      {pronto && (
        <>
          {elapsed < MIN_DURATION_SEC && <p role="status" className="text-sm text-muted-foreground">{tr("Registra almeno {n} secondi. Tocca Riprova.", { n: MIN_DURATION_SEC })}</p>}
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.45fr)] gap-2">
            <button
              type="button"
              onClick={resetRecording}
              disabled={disabled || confirming}
              className="flex min-h-12 items-center justify-center gap-1.5 rounded-xl border bg-background px-2 text-sm font-semibold text-foreground motion-safe:transition-transform motion-safe:active:scale-95 disabled:opacity-50"
            >
              <RotateCcw className="size-4 shrink-0" aria-hidden="true" /> {tr("Riprova")}
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={disabled || !confirmAvailable || confirming || elapsed < MIN_DURATION_SEC}
              className="flex min-h-12 items-center justify-center gap-1.5 rounded-xl bg-primary px-2 py-2 text-center text-sm font-bold text-primary-foreground motion-safe:transition-transform motion-safe:active:scale-95 disabled:opacity-50"
            >
              {confirming ? <Loader2 className="size-4 shrink-0 motion-safe:animate-spin" aria-hidden="true" /> : <Check className="size-4 shrink-0" aria-hidden="true" />}
              {confirmLabel ?? tr("Usa questo")}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
