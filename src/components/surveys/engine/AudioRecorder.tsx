/**
 * AudioRecorder — registra blob webm via MediaRecorder e lo carica in storage.
 *
 * Riusa pattern InternalChat (Whisper transcription opzionale via
 * silvio-transcribe-audio edge function).
 */
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Mic, MicOff, Loader2, Play, Trash2 } from "lucide-react";
import { uploadMedia, deleteMedia } from "@/lib/api/surveys";
import { supabase } from "@/integrations/supabase/client";
import type { SurveyMediaRow } from "@/types/surveys";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export interface AudioRecorderProps {
  surveyId: string;
  areaId?: string | null;
  elementId?: string | null;
  /** Audio già registrato (mostra play/elimina invece di record) */
  existingAudio?: SurveyMediaRow | null;
  onAudioAdded?: (m: SurveyMediaRow) => void;
  onAudioDeleted?: (id: string) => void;
  /** Trascrizione automatica via Whisper edge function */
  autoTranscribe?: boolean;
}

const MAX_DURATION = 300; // 5 min

export function AudioRecorder({
  surveyId, areaId, elementId, existingAudio, onAudioAdded, onAudioDeleted, autoTranscribe = false,
}: AudioRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const intervalRef = useRef<number | null>(null);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream, { mimeType: "audio/webm" });
      chunksRef.current = [];
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        if (intervalRef.current) clearInterval(intervalRef.current);
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        if (blob.size < 1000) {
          toast.error("Registrazione troppo breve");
          return;
        }
        setIsUploading(true);
        try {
          const file = new File([blob], `audio-${Date.now()}.webm`, { type: "audio/webm" });
          const m = await uploadMedia(surveyId, file, {
            type: "audio",
            areaId: areaId ?? null,
            elementId: elementId ?? null,
          });
          onAudioAdded?.(m);

          // Trascrizione opzionale Whisper
          if (autoTranscribe) {
            const fd = new FormData();
            fd.append("audio", file);
            const { data } = await supabase.functions.invoke("silvio-transcribe-audio", { body: fd });
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const text = (data as any)?.text;
            if (text) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              await (supabase as any).from("survey_media").update({ transcription: text }).eq("id", m.id);
              toast.success("Audio trascritto");
            }
          }
        } catch (e) {
          toast.error("Upload audio fallito", { description: e instanceof Error ? e.message : String(e) });
        } finally {
          setIsUploading(false);
          setIsRecording(false);
          setElapsed(0);
        }
      };
      recorderRef.current = mr;
      mr.start();
      setIsRecording(true);
      setElapsed(0);
      intervalRef.current = window.setInterval(() => {
        setElapsed((s) => {
          if (s + 1 >= MAX_DURATION) {
            mr.stop();
            return MAX_DURATION;
          }
          return s + 1;
        });
      }, 1000);
    } catch (e) {
      toast.error("Impossibile accedere al microfono", {
        description: e instanceof Error ? e.message : "permesso negato",
      });
    }
  };

  const stopRecording = () => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
  };

  const handleDelete = async () => {
    if (!existingAudio) return;
    try {
      await deleteMedia(existingAudio.id);
      onAudioDeleted?.(existingAudio.id);
    } catch (e) {
      toast.error("Eliminazione fallita", { description: e instanceof Error ? e.message : String(e) });
    }
  };

  if (existingAudio) {
    return (
      <div className="rounded-lg border bg-muted/20 p-2.5 flex items-center gap-2">
        <Play className="h-4 w-4 text-violet-600" />
        <audio src={existingAudio.url} controls className="flex-1 h-8" />
        <Button variant="ghost" size="icon" onClick={handleDelete} className="h-7 w-7 text-rose-600">
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-muted/10 p-2.5 flex items-center gap-2">
      <Button
        type="button"
        variant={isRecording ? "destructive" : "outline"}
        size="sm"
        onClick={isRecording ? stopRecording : startRecording}
        disabled={isUploading}
        className={cn("gap-2", isRecording && "animate-pulse")}
      >
        {isUploading ? (
          <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Upload…</>
        ) : isRecording ? (
          <><MicOff className="h-3.5 w-3.5" /> Stop</>
        ) : (
          <><Mic className="h-3.5 w-3.5" /> Registra nota vocale</>
        )}
      </Button>
      {isRecording && (
        <span className="text-xs font-mono text-rose-600">
          {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")} / {Math.floor(MAX_DURATION / 60)}:00
        </span>
      )}
    </div>
  );
}
