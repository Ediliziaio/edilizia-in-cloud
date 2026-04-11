/**
 * Pagina rapportino vocale: registra messaggio audio → AI trascrive →
 * form pre-compilato → operaio conferma.
 */
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { ChevronLeft, Mic } from "lucide-react";
import CampoAudioRecorder from "@/components/campo/CampoAudioRecorder";
import CampoRapportinoForm from "@/components/campo/CampoRapportinoForm";
import {
  useRapportinoVocale,
  type RapportinoVocaleDraft,
} from "@/hooks/campo/useRapportinoVocale";

export default function CampoRapportinoVoce(): JSX.Element {
  const navigate = useNavigate();
  const { orderId } = useParams<{ orderId?: string }>();
  const {
    uploading,
    transcribing,
    draft,
    error,
    processAudio,
    confirmRapportino,
    resetDraft,
  } = useRapportinoVocale();
  const [localDraft, setLocalDraft] = useState<RapportinoVocaleDraft | null>(null);
  const [saving, setSaving] = useState(false);

  const handleAudioConfirm = async (
    blob: Blob,
    durationSec: number,
    mimeType: string,
  ): Promise<void> => {
    const result = await processAudio(blob, durationSec, mimeType, orderId ?? null);
    if (result) {
      setLocalDraft(result);
    } else if (error) {
      toast.error(error);
    }
  };

  const handleConfirm = async (): Promise<void> => {
    if (!localDraft) return;
    setSaving(true);
    const ok = await confirmRapportino(localDraft, orderId ?? null);
    setSaving(false);
    if (ok) {
      toast.success("Rapportino salvato", { duration: 2500 });
      setTimeout(() => navigate("/campo"), 800);
    } else {
      toast.error(error ?? "Errore salvataggio rapportino");
    }
  };

  const handleReset = (): void => {
    setLocalDraft(null);
    resetDraft();
  };

  const activeDraft = localDraft ?? draft;

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => {
            if (activeDraft) {
              handleReset();
            } else {
              navigate(orderId ? `/campo/lavoro/${orderId}` : "/campo");
            }
          }}
          aria-label="Indietro"
          className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center active:scale-95 transition-transform"
        >
          <ChevronLeft className="w-5 h-5 text-foreground" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold text-foreground leading-tight flex items-center gap-2">
            <Mic className="w-5 h-5 text-primary" />
            Rapportino Vocale
          </h1>
          <p className="text-xs text-muted-foreground">
            Racconta cosa hai fatto, l&apos;AI compila il rapportino
          </p>
        </div>
      </div>

      {/* Error */}
      {error && !activeDraft && (
        <div
          role="alert"
          className="rounded-xl bg-red-50 border border-red-500 p-3 text-sm text-red-600"
        >
          {error}
        </div>
      )}

      {/* Contenuto condizionale */}
      {!activeDraft && !transcribing && !uploading && (
        <div className="space-y-4">
          <div className="rounded-xl bg-primary/10 border border-primary/40 p-3">
            <p className="text-xs text-primary leading-relaxed">
              Tocca il microfono e descrivi il lavoro svolto: ore, lavorazione,
              materiali usati, note. Massimo <strong>2 minuti</strong>.
            </p>
          </div>
          <CampoAudioRecorder onConfirm={handleAudioConfirm} />
        </div>
      )}

      {(uploading || transcribing || activeDraft) && (
        <CampoRapportinoForm
          draft={
            activeDraft ?? {
              trascrizione: "",
              dati_estratti: {},
              audio_duration_sec: 0,
            }
          }
          transcribing={transcribing || uploading}
          onChange={(d) => setLocalDraft(d)}
          onConfirm={handleConfirm}
          saving={saving}
        />
      )}
    </div>
  );
}
