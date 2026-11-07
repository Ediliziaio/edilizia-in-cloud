import { useCallback, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { isOnline } from "@/lib/campo/network-status";
import { CAMPO_AUDIO_MAX_SECONDI, CAMPO_AUDIO_MIN_SECONDI, messaggioErroreDetta, type ErroreDetta } from "@/lib/campo/dettaTesto";

const BUCKET = "campo-audio";
const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

export type ContestoDetta = "rapportino" | "giornale";
export type EsitoDetta = { trascrizione: string; testo: string; pulito: boolean };

/**
 * Carica l'audio nella cartella dell'utente (la policy del bucket lo vuole in
 * testa) sotto l'azienda, e chiede a `detta-testo` il testo pulito.
 * Non salva niente: il testo va nel campo e lo decide la persona.
 */
export function useDettaTesto(opts: { companyId: string | null | undefined; contesto: ContestoDetta; campo: string }) {
  const { user } = useAuth();
  const busy = useRef(false);
  const [lavoro, setLavoro] = useState<"fermo" | "carico" | "trascrivo">("fermo");
  const [errore, setErrore] = useState<ErroreDetta | null>(null);
  const { companyId, contesto, campo } = opts;
  const userId = user?.id;

  const detta = useCallback(async (blob: Blob, durata: number, mime: string): Promise<EsitoDetta | null> => {
    if (busy.current) return null;
    setErrore(null);
    if (!userId || !companyId) { setErrore({ messaggio: "Sessione non valida: rientra nell’app.", credito: false }); return null; }
    if (!isOnline()) { setErrore(messaggioErroreDetta(null, null)); return null; }
    if (!blob.size || blob.size > MAX_AUDIO_BYTES || durata < CAMPO_AUDIO_MIN_SECONDI || durata > CAMPO_AUDIO_MAX_SECONDI) {
      setErrore({ messaggio: `Registra da ${CAMPO_AUDIO_MIN_SECONDI} secondi a ${CAMPO_AUDIO_MAX_SECONDI / 60} minuti.`, credito: false }); return null;
    }
    busy.current = true;
    setLavoro("carico");
    try {
      const tipo = (mime || blob.type || "audio/webm").split(";")[0];
      const ext = tipo.includes("mp4") ? "m4a" : tipo.includes("ogg") ? "ogg" : tipo.includes("wav") ? "wav" : "webm";
      const percorso = `${userId}/detta/${companyId}/${crypto.randomUUID()}.${ext}`;
      // Il bucket accetta solo il tipo senza codec («audio/webm», non «audio/webm;codecs=opus»).
      const { error: erroreCarico } = await supabase.storage.from(BUCKET).upload(percorso, blob, { contentType: tipo, upsert: false });
      if (erroreCarico) {
        setErrore({ messaggio: isOnline() ? "Non riesco a caricare l’audio. Riprova o scrivi il testo." : messaggioErroreDetta(null, null).messaggio, credito: false });
        return null;
      }
      setLavoro("trascrivo");
      const { data, error } = await supabase.functions.invoke("detta-testo", {
        body: { audio_path: percorso, contesto, campo, durata_secondi: durata, company_id: companyId },
      });
      if (error) {
        const risposta = (error as { context?: Response }).context;
        const stato = risposta && typeof risposta.status === "number" ? risposta.status : null;
        let corpo: unknown = null;
        try { corpo = risposta && typeof risposta.json === "function" ? await risposta.json() : null; } catch { /* corpo non JSON */ }
        setErrore(messaggioErroreDetta(stato, corpo));
        return null;
      }
      const d = data as Partial<EsitoDetta> | null;
      if (!d || typeof d.testo !== "string" || !d.testo.trim()) { setErrore({ messaggio: "Non ho riconosciuto parole. Riprova o scrivi.", credito: false }); return null; }
      return { trascrizione: typeof d.trascrizione === "string" ? d.trascrizione : d.testo, testo: d.testo, pulito: d.pulito === true };
    } catch {
      setErrore(messaggioErroreDetta(isOnline() ? 500 : null, null));
      return null;
    } finally {
      busy.current = false;
      setLavoro("fermo");
    }
  }, [userId, companyId, contesto, campo]);

  return { detta, lavoro, errore, pulisciErrore: () => setErrore(null) };
}
