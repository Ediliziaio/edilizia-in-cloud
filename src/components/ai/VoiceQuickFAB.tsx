/**
 * VoiceQuickFAB — GAP 4 (Voice nativo)
 *
 * FAB "premi e parla" sempre visibile bottom-right (sopra il widget chat).
 * Tap → start recording. Tap again o auto-stop a 60s → transcribe via Whisper
 * e apre /assistente-ai con persona auto-detected o assistente_imprenditore +
 * la trascrizione pre-compilata (auto-invio via deep-link ?q=).
 *
 * Caso d'uso: imprenditore in cantiere/in auto, vuole chiedere all'AI senza
 * scrivere. Click → parla → AI risponde.
 *
 * Shortcut keyboard: Alt+Space (toggle record).
 *
 * Visibility:
 *   - Solo su /azienda/* (no admin, no portale cliente, no public)
 *   - Solo se feature flag attivo (default ON, nascondibile via dismiss)
 */
import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Mic, MicOff, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAudioRecorder } from "@/hooks/useAudioRecorder";

interface TranscribeResponse {
  text?: string;
  duration_seconds?: number;
  error?: string;
}

const MAX_DURATION_SEC = 60;
const DISMISS_KEY = "voice_fab_dismissed_v1";

/**
 * Heuristic locale per scegliere persona dalla trascrizione (no AI extra).
 * Se nessun match → assistente_imprenditore (la persona Brain generica).
 */
function pickPersonaFromText(text: string): string {
  const t = text.toLowerCase();
  if (/\b(cassa|fattur|f24|iva|liquidit|incass|paga|scaden)/i.test(t)) return "cfo";
  if (/\b(durc|sicurezza|dpi|cantiere.*sicur|formazion)/i.test(t)) return "compliance";
  if (/\b(cantier|operai|squad|capomastr|lavorazione)/i.test(t)) return "pm_cantiere";
  if (/\b(rapportin|presenz|foto.*cantier)/i.test(t)) return "capocantiere";
  if (/\b(cliente|prevent|venditor|lead|trattat|chius)/i.test(t)) return "sales";
  if (/\b(commercialist|lipe|f24|cu annuale|tributo)/i.test(t)) return "commercialista";
  if (/\b(material|fornitor|acquist|ordin)/i.test(t)) return "acquisti";
  if (/\b(dipendent|contratto.*lavoro|ferie|permess|cedolin)/i.test(t)) return "hr";
  if (/\b(market|content|campagn|ads|nps)/i.test(t)) return "direttore_marketing";
  return "assistente_imprenditore";
}

export function VoiceQuickFAB() {
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [dismissed, setDismissed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem(DISMISS_KEY) === "1";
    } catch { return false; }
  });

  const handleTranscriptionComplete = useCallback(async (blob: Blob, mimeType: string) => {
    setTranscribing(true);
    try {
      // FormData con file audio
      const ext = mimeType.includes("mp4") ? "m4a" : mimeType.includes("ogg") ? "ogg" : "webm";
      const file = new File([blob], `voice-${Date.now()}.${ext}`, { type: mimeType });
      const form = new FormData();
      form.append("audio", file);
      const { data, error } = await supabase.functions.invoke<TranscribeResponse>(
        "silvio-transcribe-audio",
        { body: form },
      );
      if (error) throw new Error(error.message);
      if (!data?.text || data.text.trim().length < 2) {
        toast.error("Audio troppo breve o non riconosciuto. Riprova parlando più chiaramente.");
        return;
      }
      const text = data.text.trim();
      const personaKey = pickPersonaFromText(text);
      // Naviga ad AssistenteAI con auto-send
      navigate(`/azienda/assistente-ai?persona=${personaKey}&q=${encodeURIComponent(text)}`);
      setOpen(false);
      toast.success(`Domanda inviata a ${personaKey.replace("_", " ")}`);
    } catch (e) {
      toast.error("Errore trascrizione", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setTranscribing(false);
    }
  }, [navigate]);

  const recorder = useAudioRecorder({
    maxDurationSec: MAX_DURATION_SEC,
    onComplete: handleTranscriptionComplete,
    onError: (msg, kind) => {
      const friendly = kind === "permission_denied"
        ? "Permesso microfono negato. Abilita nel browser per usare il dettato vocale."
        : kind === "unsupported"
        ? "Microfono non supportato dal tuo browser."
        : msg;
      toast.error(friendly);
    },
  });

  const isRecording = recorder.state === "recording";
  const isWaiting = recorder.state === "requesting" || transcribing;

  const handleStart = async () => {
    setOpen(true);
    await recorder.start();
  };

  const handleStop = () => {
    recorder.stop();
  };

  const handleDismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, "1"); } catch { /* noop */ }
    setDismissed(true);
  };

  // Shortcut Alt+Space (toggle)
  useEffect(() => {
    if (dismissed) return;
    const handler = (e: KeyboardEvent) => {
      if (e.altKey && e.code === "Space" && !e.repeat) {
        e.preventDefault();
        if (isRecording) handleStop();
        else if (!isWaiting) void handleStart();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRecording, isWaiting, dismissed]);

  // Solo su /azienda/* (escludi /azienda/assistente-ai per evitare overlap)
  if (dismissed) return null;
  if (!location.pathname.startsWith("/azienda")) return null;
  if (location.pathname.startsWith("/azienda/assistente-ai")) return null;

  // Layout: floating bottom-right, sopra il SiteChatWidget eventualmente
  return (
    <div className="fixed bottom-24 right-6 z-40 flex flex-col items-end gap-2 pointer-events-none">
      {/* Tooltip / pannello mentre registra */}
      {open && (isRecording || isWaiting) && (
        <div className="pointer-events-auto rounded-lg border bg-background shadow-lg px-4 py-3 max-w-xs space-y-1 animate-in fade-in slide-in-from-bottom-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            {transcribing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin text-violet-600" />
                Trascrizione in corso…
              </>
            ) : isRecording ? (
              <>
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75 animate-ping" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-rose-500" />
                </span>
                Sto ascoltando… ({Math.floor(recorder.elapsedMs / 1000)}s)
              </>
            ) : (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Avvio microfono…
              </>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">
            {isRecording
              ? `Premi STOP per terminare (auto a ${MAX_DURATION_SEC}s)`
              : "Attendi il via libera al microfono…"}
          </p>
        </div>
      )}

      {/* Bottoni */}
      <div className="pointer-events-auto flex items-center gap-2">
        {/* Dismiss (visibile solo su hover/tap del FAB) */}
        {!isRecording && !isWaiting && (
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 opacity-40 hover:opacity-100"
            onClick={handleDismiss}
            title="Nascondi voice FAB"
            aria-label="Nascondi voice FAB"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        )}

        {/* FAB principale */}
        <Button
          size="icon"
          onClick={() => {
            if (isRecording) handleStop();
            else if (!isWaiting) void handleStart();
          }}
          disabled={isWaiting && !isRecording}
          className={cn(
            "h-12 w-12 rounded-full shadow-xl",
            isRecording
              ? "bg-rose-500 hover:bg-rose-600 text-white animate-pulse"
              : "bg-violet-600 hover:bg-violet-700 text-white",
          )}
          title={isRecording
            ? "Stop registrazione (Alt+Space)"
            : "Premi e parla — Alt+Space"}
          aria-label={isRecording ? "Stop registrazione" : "Avvia dettato vocale"}
        >
          {transcribing ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : isRecording ? (
            <MicOff className="h-5 w-5" />
          ) : (
            <Mic className="h-5 w-5" />
          )}
        </Button>
      </div>
    </div>
  );
}

export default VoiceQuickFAB;
