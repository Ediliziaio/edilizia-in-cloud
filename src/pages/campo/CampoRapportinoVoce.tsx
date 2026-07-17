/**
 * Pagina rapportino vocale: registra messaggio audio → AI trascrive →
 * form pre-compilato → operaio conferma.
 */
import { useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronLeft, HardHat, Loader2, MapPin, Mic } from "lucide-react";
import CampoAudioRecorder from "@/components/campo/CampoAudioRecorder";
import CampoRapportinoForm from "@/components/campo/CampoRapportinoForm";
import {
  useRapportinoVocale,
  type RapportinoVocaleDraft,
} from "@/hooks/campo/useRapportinoVocale";
import { supabase } from "@/integrations/supabase/client";

export default function CampoRapportinoVoce(): JSX.Element {
  const navigate = useNavigate();
  const { orderId } = useParams<{ orderId?: string }>();
  const [searchParams] = useSearchParams();
  const fallbackOrderCode = searchParams.get("order_code");
  const fallbackOrderTitle = searchParams.get("order_title");
  const fallbackOrderAddress = searchParams.get("order_address");
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

  const { data: linkedOrder, isLoading: linkedOrderLoading } = useQuery({
    queryKey: ["campo-rapportino-vocale-order", orderId],
    queryFn: async () => {
      return await Promise.race([
        supabase
          .from("orders")
          .select("id, order_code, description, indirizzo_lavori")
          .eq("id", orderId!)
          .maybeSingle()
          .then(({ data, error }) => {
            if (error) throw error;
            return data;
          }),
        new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 3500)),
      ]);
    },
    enabled: !!orderId,
    staleTime: 60_000,
  });
  const fallbackLinkedOrder = orderId && (fallbackOrderCode || fallbackOrderTitle || fallbackOrderAddress)
    ? {
        id: orderId,
        order_code: fallbackOrderCode ?? "Cantiere selezionato",
        description: fallbackOrderTitle,
        indirizzo_lavori: fallbackOrderAddress,
      }
    : null;
  const linkedOrderContext = linkedOrder ?? fallbackLinkedOrder;

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
      toast.success(orderId ? "Rapportino salvato e commessa aggiornata" : "Rapportino salvato", { duration: 2500 });
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
    <div className="flex flex-col gap-4 p-4">
      {/* Header di pagina rimosso: la top-bar della shell campo fornisce già
          branding + freccia indietro. Qui il titolo vive dentro l'area di
          registrazione (stato iniziale) e il "Registra di nuovo" sostituisce
          il vecchio back con reset del draft. */}

      {orderId && (
        <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
          {linkedOrderLoading && !linkedOrderContext ? (
            <div className="flex items-center gap-3 text-sm font-semibold text-primary">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carico il cantiere collegato...
            </div>
          ) : linkedOrderContext ? (
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-primary/10 p-2 text-primary">
                <HardHat className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold uppercase tracking-wide text-primary">
                  Rapportino collegato
                </p>
                <p className="truncate text-base font-bold text-foreground">
                  {linkedOrderContext.order_code}
                </p>
                <p className="line-clamp-2 text-sm text-muted-foreground">
                  {linkedOrderContext.description ?? "Cantiere selezionato"}
                </p>
                {linkedOrderContext.indirizzo_lavori && (
                  <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{linkedOrderContext.indirizzo_lavori}</span>
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-amber-100 p-2 text-amber-700">
                <HardHat className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold uppercase tracking-wide text-amber-800">
                  Rapportino collegato
                </p>
                <p className="text-sm font-semibold text-amber-900">Cantiere selezionato</p>
                <p className="mt-1 text-xs text-amber-800">
                  Il rapportino restera associato al lavoro aperto anche se il nome non e disponibile.
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Error */}
      {error && !activeDraft && (
        <div
          role="alert"
          className="rounded-xl bg-red-50 border border-red-500 p-3 text-sm text-red-600"
        >
          {error}
        </div>
      )}

      {/* Stato iniziale: mic centrato per riempire lo spazio (niente vuoto).
          Guida in una riga invece del box istruzioni ridondante. */}
      {!activeDraft && !transcribing && !uploading && (
        <div className="flex min-h-[68vh] flex-col items-center justify-center gap-6 text-center">
          <div className="space-y-1">
            <h1 className="flex items-center justify-center gap-2 text-lg font-bold text-foreground">
              <Mic className="h-5 w-5 text-primary" />
              Rapportino Vocale
            </h1>
            <p className="mx-auto max-w-[17rem] text-sm text-muted-foreground">
              Racconta il lavoro — ore, lavorazione, materiali, note. L&apos;AI compila, tu confermi.
            </p>
          </div>
          <CampoAudioRecorder onConfirm={handleAudioConfirm} />
        </div>
      )}

      {(uploading || transcribing || activeDraft) && (
        <>
          {activeDraft && !transcribing && !uploading && (
            <button
              type="button"
              onClick={handleReset}
              className="flex items-center gap-1 self-start rounded-lg px-1.5 py-1 text-sm font-medium text-muted-foreground active:scale-95"
            >
              <ChevronLeft className="h-4 w-4" />
              Registra di nuovo
            </button>
          )}
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
          orderLinked={!!orderId}
          />
        </>
      )}
    </div>
  );
}
