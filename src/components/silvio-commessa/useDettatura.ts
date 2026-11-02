/**
 * La dettatura della chat del popup (31/10/2026, fase 3, lotto 3.1): un tocco registra, un
 * tocco ferma, l'audio va a `trascrizione-audio` (come il preventivatore, AIQuotePanel) e il
 * testo finisce nel campo, da rileggere prima di mandarlo.
 *
 * Prima di registrare si chiede `prima()`: il popup ci controlla i crediti. Al massimo 90
 * secondi, poi si ferma da sola.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { erroreLeggibile } from "@/lib/silvio-commessa/testoErrore";

export const DETTATURA_MAX_SECONDI = 90;

export interface Dettatura {
  registra: boolean;
  trascrive: boolean;
  secondi: number;
  errore: string | null;
  /** Avvia o ferma. */
  tocca: () => void;
  disponibile: boolean;
}

export function useDettatura(
  trascrivi: (audio: Blob) => Promise<string>,
  onTesto: (testo: string) => void,
  prima?: () => Promise<string | null>,
): Dettatura {
  const [registra, setRegistra] = useState(false);
  const [trascrive, setTrascrive] = useState(false);
  const [secondi, setSecondi] = useState(0);
  const [errore, setErrore] = useState<string | null>(null);
  const registratore = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const vivo = useRef(true);
  useEffect(() => () => {
    vivo.current = false;
    if (timer.current) clearInterval(timer.current);
    registratore.current?.stream.getTracks().forEach((t) => t.stop());
  }, []);
  const disponibile = typeof window !== "undefined" && typeof window.MediaRecorder !== "undefined" && !!navigator.mediaDevices?.getUserMedia;

  const ferma = useCallback(() => {
    if (timer.current) { clearInterval(timer.current); timer.current = null; }
    if (registratore.current?.state === "recording") registratore.current.stop();
    setRegistra(false);
  }, []);

  const avvia = useCallback(async () => {
    setErrore(null);
    const no = prima ? await prima() : null;
    if (no) { setErrore(no); return; }
    let flusso: MediaStream;
    try {
      flusso = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      const m = e instanceof Error ? `${e.name} ${e.message}` : String(e);
      setErrore(/NotAllowed|Permission/i.test(m) ? "Il microfono non è permesso: scrivi, o abilitalo nel browser."
        : /NotFound/i.test(m) ? "Nessun microfono trovato: scrivi." : "Microfono non disponibile: scrivi.");
      return;
    }
    const tipo = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find((t) => MediaRecorder.isTypeSupported?.(t));
    const r = new MediaRecorder(flusso, tipo ? { mimeType: tipo } : undefined);
    const pezzi: Blob[] = [];
    r.ondataavailable = (e) => { if (e.data.size > 0) pezzi.push(e.data); };
    r.onstop = async () => {
      flusso.getTracks().forEach((t) => t.stop());
      const audio = new Blob(pezzi, { type: r.mimeType || tipo || "audio/webm" });
      if (!vivo.current) return;
      if (!audio.size) { setErrore("Non ho sentito niente: controlla il microfono."); return; }
      setTrascrive(true);
      try {
        const testo = await trascrivi(audio);
        if (vivo.current) onTesto(testo);
      } catch (e) {
        if (vivo.current) setErrore(erroreLeggibile(e, "Trascrizione non riuscita: scrivi."));
      } finally {
        if (vivo.current) setTrascrive(false);
      }
    };
    r.start(100);
    registratore.current = r;
    setRegistra(true);
    setSecondi(0);
    timer.current = setInterval(() => {
      setSecondi((s) => {
        if (s + 1 >= DETTATURA_MAX_SECONDI) ferma();
        return s + 1;
      });
    }, 1000);
  }, [prima, trascrivi, onTesto, ferma]);

  const tocca = useCallback(() => {
    if (trascrive) return;
    if (registra) ferma();
    else void avvia();
  }, [registra, trascrive, ferma, avvia]);

  return { registra, trascrive, secondi, errore, tocca, disponibile };
}
