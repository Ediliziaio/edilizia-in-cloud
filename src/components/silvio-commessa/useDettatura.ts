/** La dettatura prepara il testo nella chat: non lo invia. */
import { useCallback, useEffect, useRef, useState } from "react";
import { erroreLeggibile } from "@/lib/silvio-commessa/testoErrore";

export const DETTATURA_MAX_SECONDI = 90;

export interface Dettatura {
  avviando: boolean;
  registra: boolean;
  trascrive: boolean;
  secondi: number;
  errore: string | null;
  tocca: () => void;
  disponibile: boolean;
}

export function useDettatura(
  trascrivi: (audio: Blob) => Promise<string>,
  onTesto: (testo: string) => void,
  prima?: () => Promise<string | null>,
): Dettatura {
  const [avviando, setAvviando] = useState(false);
  const [registra, setRegistra] = useState(false);
  const [trascrive, setTrascrive] = useState(false);
  const [secondi, setSecondi] = useState(0);
  const [errore, setErrore] = useState<string | null>(null);
  const registratore = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const vivo = useRef(false);
  const generazione = useRef(0);
  const occupato = useRef(false);
  const pulisciTimer = useCallback(() => {
    if (timer.current !== null) clearInterval(timer.current);
    timer.current = null;
  }, []);

  useEffect(() => {
    vivo.current = true;
    return () => {
      vivo.current = false;
      generazione.current += 1;
      occupato.current = false;
      pulisciTimer();
      const r = registratore.current;
      registratore.current = null;
      if (!r) return;
      // La chiusura interrompe l'ascolto senza avviare una trascrizione.
      r.onstop = null; r.ondataavailable = null; r.onerror = null;
      try { if (r.state !== "inactive") r.stop(); }
      catch { /* Le tracce vanno fermate anche se il browser ha già chiuso il recorder. */ }
      finally { r.stream.getTracks().forEach((t) => t.stop()); }
    };
  }, [pulisciTimer]);

  const disponibile = typeof window !== "undefined" && typeof window.MediaRecorder !== "undefined" && !!navigator.mediaDevices?.getUserMedia;

  const ferma = useCallback(() => {
    pulisciTimer();
    const r = registratore.current;
    if (!r || r.state === "inactive") return;
    setRegistra(false);
    setTrascrive(true);
    try { r.stop(); }
    catch {
      r.onstop = null;
      r.stream.getTracks().forEach((t) => t.stop());
      registratore.current = null;
      occupato.current = false;
      setTrascrive(false);
      setErrore("Registrazione interrotta: riprova o scrivi.");
    }
  }, [pulisciTimer]);

  const avvia = useCallback(async () => {
    // Chiude anche il doppio clic prima del render successivo di React.
    if (occupato.current || !vivo.current) return;
    occupato.current = true;
    const turno = ++generazione.current;
    const attuale = () => vivo.current && turno === generazione.current;
    setErrore(null); setAvviando(true);
    let flusso: MediaStream | null = null;
    try {
      const no = prima ? await prima() : null;
      if (!attuale()) return;
      if (no) { setErrore(no); return; }
      flusso = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Il consenso può arrivare dopo che il popup è stato chiuso.
      if (!attuale()) { flusso.getTracks().forEach((t) => t.stop()); return; }
      const tipo = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find((t) => MediaRecorder.isTypeSupported?.(t));
      const r = new MediaRecorder(flusso, tipo ? { mimeType: tipo } : undefined);
      const pezzi: Blob[] = [];
      registratore.current = r;
      r.ondataavailable = (e) => { if (e.data.size > 0) pezzi.push(e.data); };
      r.onerror = () => {
        pulisciTimer();
        r.onstop = null;
        r.stream.getTracks().forEach((t) => t.stop());
        registratore.current = null;
        if (!attuale()) return;
        occupato.current = false;
        setRegistra(false); setTrascrive(false);
        setErrore("Registrazione interrotta: riprova o scrivi.");
      };
      r.onstop = async () => {
        pulisciTimer();
        r.stream.getTracks().forEach((t) => t.stop());
        registratore.current = null;
        if (!attuale()) return;
        setRegistra(false); setTrascrive(true);
        const audio = new Blob(pezzi, { type: r.mimeType || tipo || "audio/webm" });
        try {
          if (!audio.size) { setErrore("Non ho sentito niente: controlla il microfono."); return; }
          const testo = await trascrivi(audio);
          if (attuale()) onTesto(testo);
        } catch (e) {
          if (attuale()) setErrore(erroreLeggibile(e, "Trascrizione non riuscita: scrivi."));
        } finally {
          if (attuale()) { occupato.current = false; setTrascrive(false); }
        }
      };
      r.start(100);
      setRegistra(true); setSecondi(0);
      let trascorsi = 0;
      timer.current = setInterval(() => {
        trascorsi += 1;
        setSecondi(trascorsi);
        if (trascorsi >= DETTATURA_MAX_SECONDI) ferma();
      }, 1000);
    } catch (e) {
      if (registratore.current) { registratore.current.onstop = null; registratore.current = null; }
      flusso?.getTracks().forEach((t) => t.stop());
      if (attuale()) {
        const m = e instanceof Error ? e.name + " " + e.message : String(e);
        setErrore(/NotAllowed|Permission/i.test(m) ? "Il microfono non è permesso: scrivi, o abilitalo nel browser."
          : /NotFound/i.test(m) ? "Nessun microfono trovato: scrivi." : erroreLeggibile(e, "Microfono non disponibile: scrivi."));
      }
    } finally {
      if (attuale()) {
        setAvviando(false);
        if (registratore.current?.state !== "recording") occupato.current = false;
      }
    }
  }, [prima, trascrivi, onTesto, ferma, pulisciTimer]);

  const tocca = useCallback(() => {
    if (registratore.current?.state === "recording") ferma();
    else if (!occupato.current) void avvia();
  }, [ferma, avvia]);

  return { avviando, registra, trascrive, secondi, errore, tocca, disponibile };
}
