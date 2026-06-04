import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/**
 * useVoiceInput — registrazione microfono (MediaRecorder) + trascrizione via
 * edge `silvio-transcribe-audio`. Riusa lo stesso flusso/contratto della
 * SilvioChatSheet. Click per avviare → click per fermare → trascrizione
 * automatica passata a `onTranscript`. Hard-cap 5 minuti.
 */

function pickBestAudioMime(): string | undefined {
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

function extFromMime(mime: string): string {
  if (mime.includes("webm")) return "webm";
  if (mime.includes("mp4") || mime.includes("aac")) return "m4a";
  if (mime.includes("ogg")) return "ogg";
  return "audio";
}

export function useVoiceInput(onTranscript: (text: string) => void) {
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [recordingMs, setRecordingMs] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingMsRef = useRef(0);

  // Cleanup allo smontaggio: stop recorder + timer (evita mic acceso/leak).
  useEffect(
    () => () => {
      const r = mediaRecorderRef.current;
      if (r && r.state !== "inactive") r.stop();
      if (recordTimerRef.current) clearInterval(recordTimerRef.current);
    },
    [],
  );

  const transcribe = async (blob: Blob) => {
    setTranscribing(true);
    try {
      const form = new FormData();
      const ext = extFromMime(blob.type || "audio/webm");
      form.append("audio", blob, `silvio-audio-${Date.now()}.${ext}`);
      const { data, error } = await supabase.functions.invoke("silvio-transcribe-audio", { body: form });
      if (error) throw new Error(error.message);
      const text = (data as { text?: string } | null)?.text ?? "";
      if (!text.trim()) {
        toast.warning("Trascrizione vuota — riprova parlando più chiaramente.");
        return;
      }
      onTranscript(text);
      toast.success("Audio trascritto. Controlla e invia.");
    } catch (err) {
      toast.error(`Trascrizione fallita: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setTranscribing(false);
    }
  };

  const start = async () => {
    if (recording || transcribing) return;
    if (typeof MediaRecorder === "undefined") {
      toast.error("Il tuo browser non supporta la registrazione audio.");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      toast.error("Microfono non disponibile (richiede HTTPS o browser moderno).");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = pickBestAudioMime();
      let recorder: MediaRecorder;
      try {
        recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      } catch {
        recorder = new MediaRecorder(stream);
      }
      audioChunksRef.current = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) audioChunksRef.current.push(ev.data);
      };
      recorder.onerror = () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        if (recordTimerRef.current) clearInterval(recordTimerRef.current);
        toast.error("Errore registrazione audio. Riprova o usa l'upload file.");
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        if (recordTimerRef.current) clearInterval(recordTimerRef.current);
        setRecording(false);
        setRecordingMs(0);
        recordingMsRef.current = 0;
        const blobMime = recorder.mimeType || mimeType || "audio/webm";
        const blob = new Blob(audioChunksRef.current, { type: blobMime });
        if (blob.size === 0) {
          toast.warning("Nessun audio registrato — controlla il microfono e riprova.");
          return;
        }
        void transcribe(blob);
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecording(true);
      setRecordingMs(0);
      recordingMsRef.current = 0;
      const MAX_AUDIO_MS = 5 * 60 * 1000;
      recordTimerRef.current = setInterval(() => {
        setRecordingMs((ms) => {
          const next = ms + 100;
          recordingMsRef.current = next;
          if (next >= MAX_AUDIO_MS) {
            const r = mediaRecorderRef.current;
            if (r && r.state !== "inactive") r.stop();
            toast.info("Registrazione fermata automaticamente (max 5 minuti).");
          }
          return next;
        });
      }, 100);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("NotAllowedError") || msg.includes("Permission")) {
        toast.error("Permesso microfono negato. Abilita l'accesso nelle impostazioni del browser.");
      } else if (msg.includes("NotFoundError") || msg.includes("DevicesNotFound")) {
        toast.error("Nessun microfono rilevato. Collega un microfono e riprova.");
      } else if (msg.includes("NotReadableError")) {
        toast.error("Microfono occupato da un'altra app. Chiudila e riprova.");
      } else {
        toast.error(`Microfono non disponibile: ${msg}`);
      }
    }
  };

  const stop = () => {
    const r = mediaRecorderRef.current;
    if (r && r.state !== "inactive") r.stop();
    setRecording(false);
  };

  const toggle = () => {
    if (recording) stop();
    else void start();
  };

  return { recording, transcribing, recordingMs, toggle };
}
