import { useCallback, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { isOnline } from "@/lib/campo/network-status";
import { campoWorkDay, validWorkDay } from "@/lib/campo/workDay";
import { normalizeVoiceProposal } from "@/lib/campo/voiceProposal";
const BUCKET = "campo-audio";
const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
export interface MaterialeUsato {
  nome: string;
  quantita: number;
  unita: string;
}

export interface DatiEstratti {
  data_lavoro?: string;
  ore_lavorate?: number;
  lavorazione?: string;
  materiali?: MaterialeUsato[];
  team_presenti?: string[];
  note?: string;
  sicurezza_alert?: {
    rilevato: boolean;
    tipo?: "near_miss" | "infortunio" | "dpi_mancante" | "ponteggio_non_a_norma" | "altro" | null;
    descrizione?: string | null;
    gravita?: "bassa" | "media" | "alta" | null;
  };
  incidenti_segnalati?: string[];
  qualita_auto_valutazione?: "ottima" | "buona" | "da_rivedere" | null;
  lingua_originale?: string | null;
}

export interface RapportinoVocaleDraft {
  data_lavoro?: string;
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

/** Trascrive una proposta. L'unico invio del giornaliero è nel modulo condiviso. */
export function useRapportinoVocale() {
  const { user, profile } = useAuth();
  const busy = useRef(false);
  const uploaded = useRef<{ blob: Blob; owner: string; path: string; url: string } | null>(null);
  const [state, setState] = useState<UseRapportinoVocaleState>({ uploading: false, transcribing: false, draft: null, error: null });
  const processAudio = useCallback(async (blob: Blob, durationSec: number, mimeType: string, orderId?: string | null, workDay?: string): Promise<RapportinoVocaleDraft | null> => {
    if (busy.current) return null;
    const day = workDay ?? campoWorkDay(new Date());
    if (!user?.id || !profile?.company_id || !orderId) { setState(s => ({ ...s, error: "Scegli un cantiere assegnato e verifica la sessione." })); return null; }
    if (!isOnline()) { setState(s => ({ ...s, error: "La voce richiede internet. Scrivi il giornaliero: la bozza resta sul telefono." })); return null; }
    if (!validWorkDay(day)) { setState(s => ({ ...s, error: "Giornata non valida." })); return null; }
    if (!blob.size || blob.size > MAX_AUDIO_BYTES || !Number.isFinite(durationSec) || durationSec < 3 || durationSec > 1800 || !/^audio\//.test(mimeType)) {
      setState(s => ({ ...s, error: "Usa una registrazione audio da 3 secondi a 30 minuti, fino a 10 MB." })); return null;
    }
    busy.current = true;
    setState(s => ({ ...s, uploading: true, transcribing: false, error: null }));
    try {
      const owner = profile.company_id + ":" + user.id;
      let audio = uploaded.current;
      if (!audio || audio.blob !== blob || audio.owner !== owner) {
        const ext = mimeType.includes("mp4") ? "m4a" : mimeType.includes("ogg") ? "ogg" : mimeType.includes("wav") ? "wav" : "webm";
        const path = user.id + "/" + day + "/" + crypto.randomUUID() + "." + ext;
        const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: mimeType, upsert: false });
        if (error) throw new Error("Non riesco a caricare l'audio. Puoi riprovare o scrivere.");
        const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
        audio = { blob, owner, path, url: data.publicUrl }; uploaded.current = audio;
      }
      setState(s => ({ ...s, uploading: false, transcribing: true }));
      const { data, error } = await supabase.functions.invoke("parse-rapportino-ai", { body: { audio_url: audio.url, audio_path: audio.path, order_id: orderId, duration_sec: durationSec } });
      if (error || data?.error) throw new Error("Trascrizione non disponibile. I dati del modulo restano invariati: riprova o scrivi.");
      const proposal = normalizeVoiceProposal(data);
      if (!proposal.trascrizione && !proposal.dati_estratti.lavorazione && !proposal.dati_estratti.note) throw new Error("Non ho riconosciuto il racconto. Riprova o scrivi.");
      const draft: RapportinoVocaleDraft = { ...proposal, data_lavoro: day, audio_url: audio.url, audio_duration_sec: durationSec };
      setState(s => ({ ...s, draft })); return draft;
    } catch (error) {
      setState(s => ({ ...s, error: error instanceof Error ? error.message : "Trascrizione non riuscita: puoi scrivere." })); return null;
    } finally { busy.current = false; setState(s => ({ ...s, uploading: false, transcribing: false })); }
  }, [user?.id, profile?.company_id]);
  const resetDraft = useCallback(() => setState({ uploading: false, transcribing: false, draft: null, error: null }), []);
  return { ...state, processAudio, resetDraft };
}
