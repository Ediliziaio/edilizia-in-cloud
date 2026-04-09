import { useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useOfflineSync } from "@/hooks/campo/useOfflineSync";
import { isOnline } from "@/lib/campo/network-status";

const BUCKET = "campo-audio";
const MAX_AUDIO_BYTES = 10 * 1024 * 1024; // 10MB

export interface MaterialeUsato {
  nome: string;
  quantita: number;
  unita: string;
}

export interface DatiEstratti {
  ore_lavorate?: number;
  lavorazione?: string;
  materiali?: MaterialeUsato[];
  note?: string;
}

export interface RapportinoVocaleDraft {
  id?: string;
  trascrizione: string;
  dati_estratti: DatiEstratti;
  audio_url?: string;
  audio_duration_sec: number;
}

interface UseRapportinoVocaleState {
  uploading: boolean;
  transcribing: boolean;
  draft: RapportinoVocaleDraft | null;
  error: string | null;
}

export function useRapportinoVocale(): UseRapportinoVocaleState & {
  processAudio: (
    blob: Blob,
    durationSec: number,
    mimeType: string,
    orderId?: string | null,
  ) => Promise<RapportinoVocaleDraft | null>;
  confirmRapportino: (
    draft: RapportinoVocaleDraft,
    orderId?: string | null,
  ) => Promise<boolean>;
  resetDraft: () => void;
} {
  const { user, profile } = useAuth();
  const { enqueue } = useOfflineSync();
  const [state, setState] = useState<UseRapportinoVocaleState>({
    uploading: false,
    transcribing: false,
    draft: null,
    error: null,
  });

  const processAudio = useCallback(
    async (
      blob: Blob,
      durationSec: number,
      mimeType: string,
      orderId?: string | null,
    ): Promise<RapportinoVocaleDraft | null> => {
      if (!user?.id || !profile?.company_id) {
        setState((s) => ({ ...s, error: "Profilo non disponibile" }));
        return null;
      }
      if (blob.size > MAX_AUDIO_BYTES) {
        setState((s) => ({ ...s, error: "Registrazione troppo grande (max 10MB)" }));
        return null;
      }
      if (durationSec < 3) {
        setState((s) => ({ ...s, error: "Registrazione troppo breve (min 3s)" }));
        return null;
      }

      setState((s) => ({ ...s, uploading: true, error: null }));

      // 1. Upload audio su storage (se online)
      const now = new Date();
      const y = now.getFullYear();
      const m = (now.getMonth() + 1).toString().padStart(2, "0");
      const d = now.getDate().toString().padStart(2, "0");
      const ext = mimeType.includes("mp4") ? "m4a" : "webm";
      const filename = `${now.getTime()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const path = `${user.id}/${y}${m}${d}/${filename}`;

      let audioUrl: string | undefined;

      if (isOnline()) {
        const { error: upError } = await supabase.storage
          .from(BUCKET)
          .upload(path, blob, {
            contentType: mimeType,
            upsert: false,
          });
        if (!upError) {
          const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
          audioUrl = urlData.publicUrl;
        }
      }

      setState((s) => ({ ...s, uploading: false, transcribing: true }));

      // 2. Chiama Edge Function per trascrizione + estrazione
      let draft: RapportinoVocaleDraft;

      if (isOnline() && audioUrl) {
        try {
          const { data, error } = await supabase.functions.invoke(
            "parse-rapportino-ai",
            {
              body: {
                audio_url: audioUrl,
                audio_path: path,
                order_id: orderId ?? null,
                duration_sec: durationSec,
              },
            },
          );
          if (error) throw new Error(error.message);
          const parsed = data as {
            trascrizione?: string;
            dati_estratti?: DatiEstratti;
            rapportino_id?: string;
          };
          draft = {
            id: parsed.rapportino_id,
            trascrizione: parsed.trascrizione ?? "",
            dati_estratti: parsed.dati_estratti ?? {},
            audio_url: audioUrl,
            audio_duration_sec: durationSec,
          };
        } catch (err) {
          console.error("[useRapportinoVocale] trascrizione fallita", err);
          // Fallback: crea bozza vuota, l'utente compilerà a mano
          draft = {
            trascrizione: "",
            dati_estratti: {},
            audio_url: audioUrl,
            audio_duration_sec: durationSec,
          };
          setState((s) => ({
            ...s,
            transcribing: false,
            error:
              "Trascrizione automatica non disponibile. Compila i campi manualmente.",
          }));
          setState((s) => ({ ...s, draft, transcribing: false }));
          return draft;
        }
      } else {
        // Offline: metti audio in coda, bozza vuota
        draft = {
          trascrizione: "",
          dati_estratti: {},
          audio_duration_sec: durationSec,
        };
        await enqueue("foto", {
          bucket: BUCKET,
          path,
          blob,
          contentType: mimeType,
        });
      }

      setState((s) => ({ ...s, transcribing: false, draft }));
      return draft;
    },
    [user?.id, profile?.company_id, enqueue],
  );

  const confirmRapportino = useCallback(
    async (
      draft: RapportinoVocaleDraft,
      orderId?: string | null,
    ): Promise<boolean> => {
      if (!user?.id || !profile?.company_id) return false;

      const payload = {
        company_id: profile.company_id,
        order_id: orderId ?? null,
        operaio_id: user.id,
        audio_url: draft.audio_url ?? null,
        audio_duration_sec: draft.audio_duration_sec,
        trascrizione: draft.trascrizione,
        dati_estratti: draft.dati_estratti,
        ore_lavorate: draft.dati_estratti.ore_lavorate ?? null,
        lavorazione: draft.dati_estratti.lavorazione ?? null,
        materiali_usati: draft.dati_estratti.materiali ?? [],
        note: draft.dati_estratti.note ?? null,
        stato: "confermato" as const,
      };

      try {
        if (isOnline()) {
          if (draft.id) {
            const { error } = await supabase
              .from("rapportini_vocali" as never)
              .update(payload as never)
              .eq("id", draft.id);
            if (error) throw new Error(error.message);
          } else {
            const { error } = await supabase
              .from("rapportini_vocali" as never)
              .insert(payload as never);
            if (error) throw new Error(error.message);
          }
        } else {
          await enqueue("rapportino_vocale", payload);
        }
        setState((s) => ({ ...s, draft: null, error: null }));
        return true;
      } catch (err) {
        console.error("[useRapportinoVocale] confirm error", err);
        // Fallback coda offline
        try {
          await enqueue("rapportino_vocale", payload);
          setState((s) => ({ ...s, draft: null, error: null }));
          return true;
        } catch {
          setState((s) => ({ ...s, error: "Impossibile salvare il rapportino" }));
          return false;
        }
      }
    },
    [user?.id, profile?.company_id, enqueue],
  );

  const resetDraft = useCallback(() => {
    setState({ uploading: false, transcribing: false, draft: null, error: null });
  }, []);

  return { ...state, processAudio, confirmRapportino, resetDraft };
}
