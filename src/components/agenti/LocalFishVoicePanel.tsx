import { useCallback, useEffect, useRef, useState } from "react";
import {
  AudioLines,
  Loader2,
  Mic,
  Square,
  Volume2,
  VolumeX,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { VoiceActivity } from "@/components/ui/fish-agent-pipeline";
import type {
  createLocalAssistanceClient,
  LocalFishVoiceStatus,
  LocalLabSnapshot,
} from "@/lib/localAssistanceClient";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

type Client = ReturnType<typeof createLocalAssistanceClient>;
export function LocalFishVoicePanel({
  client,
  status,
  snapshot,
  disabled,
  onTranscript,
}: {
  client: Client;
  status: LocalFishVoiceStatus;
  snapshot: LocalLabSnapshot | null;
  disabled: boolean;
  onTranscript: (text: string) => void;
}) {
  const tr = useT();
  const [enabled, setEnabled] = useState(false);
  const [state, setState] = useState<
    "idle" | "loading" | "playing" | "opening" | "recording" | "transcribing"
  >("idle");
  const [error, setError] = useState("");
  const [hint, setHint] = useState("");
  const audio = useRef<HTMLAudioElement | null>(null);
  const url = useRef<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const request = useRef<AbortController | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);
  const generation = useRef(0);
  const last = snapshot?.session.messages
    .filter((m) => m.role === "agent")
    .at(-1);
  const closed =
    !!snapshot && ["done", "needs_office"].includes(snapshot.session.phase);
  const stopAudio = useCallback(() => {
    audio.current?.pause();
    audio.current = null;
    if (url.current) URL.revokeObjectURL(url.current);
    url.current = null;
  }, []);
  const releaseMic = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  }, []);
  const cancel = useCallback(() => {
    generation.current++;
    request.current?.abort();
    request.current = null;
    if (recorder.current) recorder.current.onstop = null;
    if (recorder.current?.state === "recording") recorder.current.stop();
    recorder.current = null;
    releaseMic();
    stopAudio();
  }, [releaseMic, stopAudio]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      cancel();
    };
  }, [cancel]);

  const sessionId = snapshot?.session.id;
  const speak = useCallback(async () => {
    if (!sessionId || !last || !status.configured) return;
    cancel();
    const run = generation.current;
    const controller = new AbortController();
    request.current = controller;
    setState("loading");
    setError("");
    try {
      const blob = await client.speech(sessionId, last.id, controller.signal);
      if (!mounted.current || run !== generation.current) return;
      url.current = URL.createObjectURL(blob);
      const player = new Audio(url.current);
      audio.current = player;
      player.onended = () => {
        if (mounted.current && run === generation.current) {
          setState("idle");
          stopAudio();
        }
      };
      player.onerror = () => {
        if (mounted.current && run === generation.current) {
          setError(
            "Il browser non riesce a riprodurre l’audio. Premi Riascolta.",
          );
          setState("idle");
          stopAudio();
        }
      };
      await player.play();
      if (mounted.current && run === generation.current) setState("playing");
    } catch (e) {
      if (
        !mounted.current ||
        run !== generation.current ||
        controller.signal.aborted
      )
        return;
      setError(e instanceof Error ? e.message : tr("Voce non disponibile."));
      setState("idle");
      stopAudio();
    }
  }, [sessionId, last, status.configured, cancel, client, stopAudio, tr]);
  // A new session or turn invalidates old audio and any pending microphone draft.
  useEffect(() => {
    cancel();
    const run = generation.current;
    queueMicrotask(() => {
      if (!mounted.current || run !== generation.current) return;
      setState("idle");
      setHint("");
      setError("");
      if (enabled) void speak();
    });
    return cancel;
  }, [cancel, enabled, speak]);
  async function record() {
    if (!snapshot || disabled || closed) return;
    cancel();
    const run = generation.current;
    setError("");
    setHint("");
    setState("opening");
    try {
      if (
        !navigator.mediaDevices?.getUserMedia ||
        typeof MediaRecorder === "undefined"
      )
        throw new Error(
          "Microfono non disponibile in questo browser. Usa Chrome oppure continua per iscritto.",
        );
      const media = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      if (!mounted.current || run !== generation.current) {
        media.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = media;
      const mimeType = [
        "audio/webm;codecs=opus",
        "audio/mp4",
        "audio/ogg;codecs=opus",
      ].find((type) => MediaRecorder.isTypeSupported(type));
      if (!mimeType)
        throw new Error(
          "Formato del microfono non supportato. Prova con Chrome.",
        );
      const rec = new MediaRecorder(media, { mimeType });
      recorder.current = rec;
      const chunks: Blob[] = [];
      let bytes = 0;
      rec.ondataavailable = (event) => {
        if (event.data.size) {
          bytes += event.data.size;
          chunks.push(event.data);
        }
      };
      rec.onerror = () => {
        cancel();
        if (mounted.current) {
          setState("idle");
          setError("Registrazione interrotta. Riprova con il microfono.");
        }
      };
      rec.onstop = async () => {
        releaseMic();
        recorder.current = null;
        if (!mounted.current || run !== generation.current) return;
        if (bytes < 100 || bytes > 4 * 1024 * 1024) {
          setState("idle");
          setError(
            "Registrazione vuota o troppo lunga. Riprova con una frase breve.",
          );
          return;
        }
        const controller = new AbortController();
        request.current = controller;
        setState("transcribing");
        try {
          const result = await client.transcribe(
            snapshot.session.id,
            new Blob(chunks, { type: mimeType }),
            controller.signal,
          );
          if (!mounted.current || run !== generation.current) return;
          onTranscript(result.text);
          setHint(
            "Trascrizione pronta: controlla la risposta qui sotto, correggila se serve e premi Invia. Non è stato dato alcun consenso automatico.",
          );
        } catch (e) {
          if (
            mounted.current &&
            run === generation.current &&
            !controller.signal.aborted
          )
            setError(
              e instanceof Error ? e.message : tr("Trascrizione non disponibile."),
            );
        } finally {
          if (mounted.current && run === generation.current) setState("idle");
        }
      };
      rec.start(1000);
      setState("recording");
      timer.current = setTimeout(
        () => {
          if (rec.state === "recording") rec.stop();
        },
        Math.min(status.maxSeconds, 45) * 1000,
      );
    } catch (e) {
      releaseMic();
      if (mounted.current && run === generation.current) {
        setState("idle");
        setError(
          e instanceof DOMException && e.name === "NotAllowedError"
            ? tr("Consenti l’accesso al microfono nelle impostazioni del browser e riprova.")
            : e instanceof Error
              ? e.message
              : tr("Microfono non disponibile."),
        );
      }
    }
  }
  return (
    <div
      className="space-y-3 border-b bg-blue-50/50 p-4 dark:bg-blue-950/20"
      aria-label={tr("Voce Fish del collaudo")}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold">
            <AudioLines className="h-4 w-4 text-blue-700 dark:text-blue-300" />{" "}
            {tr("Fish Audio · Drama 3 ·")} {status.voice}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {tr("Il microfono e le risposte vocali usano Fish. Cliente, ticket e agenda restano locali.")}
          </p>
        </div>
        <Button
          type="button"
          variant={enabled ? "outline" : "default"}
          size="sm"
          disabled={!status.configured}
          onClick={() => {
            if (enabled) {
              cancel();
              setState("idle");
            }
            setEnabled(!enabled);
          }}
        >
          {enabled ? (
            <VolumeX className="mr-2 h-4 w-4" />
          ) : (
            <Volume2 className="mr-2 h-4 w-4" />
          )}
          {enabled ? tr("Disattiva voce Fish") : tr("Attiva voce Fish")}
        </Button>
      </div>
      {!status.configured && (
        <p role="status" className="text-xs">
          {tr("La chiave Fish va inserita nel file privato .env.fish.local del server e il backend va riavviato.")}
        </p>
      )}
      {enabled && (
        <div className="flex flex-wrap items-center gap-2">
          {state === "recording" ? (
            <Button
              type="button"
              size="sm"
              onClick={() => recorder.current?.stop()}
            >
              <Square className="mr-2 h-4 w-4" />
              {tr("Termina e trascrivi")}
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={
                !snapshot ||
                disabled ||
                closed ||
                ["opening", "transcribing", "loading"].includes(state)
              }
              onClick={() => void record()}
            >
              <Mic className="mr-2 h-4 w-4" />
              {tr("Registra risposta")}
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={
              !last ||
              ["recording", "opening", "transcribing", "loading"].includes(
                state,
              )
            }
            onClick={() => void speak()}
          >
            {tr("Riascolta")}
          </Button>
          {["playing", "loading"].includes(state) && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                cancel();
                setState("idle");
              }}
            >
              {tr("Interrompi voce")}
            </Button>
          )}
          <span
            role="status"
            className="flex items-center gap-2 text-xs text-muted-foreground"
          >
            {["loading", "opening", "transcribing"].includes(state) && (
              <Loader2 className="h-3 w-3 motion-safe:animate-spin" />
            )}
            {(state === "playing" || state === "recording") && (
              <VoiceActivity />
            )}
            {
              {
                idle: tr("Registra una risposta, controlla la trascrizione e inviala."),
                loading: tr("Preparo la voce Drama 3…"),
                playing: tr("L’assistente sta parlando"),
                opening: tr("Apro il microfono…"),
                recording: tr("Ti ascolto · massimo 45 secondi"),
                transcribing: tr("Trascrivo con Fish…"),
              }[state]
            }
          </span>
        </div>
      )}
      {hint && (
        <p role="status" className="text-xs leading-5 text-emerald-800">
          {hint}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-amber-800">
          {error}
        </p>
      )}
    </div>
  );
}
