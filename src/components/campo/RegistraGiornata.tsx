/**
 * «Racconta la giornata»: UN bottone (24/11/2026, richiesta del founder). Si tocca e si parla, si ritocca e l'AI
 * compila il rapportino: descrizione, ore, chi c'era, materiali. Prima erano tre passi (registra, «Trascrivi
 * audio», «Inserisci nel rapportino») dentro un riquadro a parte.
 *
 * Mentre registra il bottone pulsa con la voce (livello del microfono), il tempo scorre e a 3 minuti si ferma da
 * solo. Sotto i 3 secondi non parte niente: «parla un po' di più». Senza rete lo dice subito, prima di registrare.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Mic, Square, Sparkles, WifiOff } from "lucide-react";
import { useRapportinoVocale, type RapportinoVocaleDraft } from "@/hooks/campo/useRapportinoVocale";
import { useNetworkStatus } from "@/hooks/campo/useNetworkStatus";
import { CAMPO_AUDIO_MAX_SECONDI, CAMPO_AUDIO_MIN_SECONDI } from "@/lib/campo/dettaTesto";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

type Stato = "pronto" | "permesso" | "registra" | "compila";

function formatoAudio(): string {
  if (typeof MediaRecorder === "undefined") return "";
  for (const c of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4;codecs=mp4a.40.2", "audio/mp4"]) {
    if (typeof MediaRecorder.isTypeSupported === "function" && MediaRecorder.isTypeSupported(c)) return c;
  }
  return "";
}

const tempo = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

export function RegistraGiornata({ orderId, workDay, disabilitato, onCompilato, suggerimento }: {
  orderId: string;
  workDay: string;
  disabilitato?: boolean;
  onCompilato: (draft: RapportinoVocaleDraft) => void;
  /** Cosa conviene dire, secondo il rapportino di questa azienda (chi c'era, ore, materiali…). */
  suggerimento?: string;
}) {
  const t = useT();
  const online = useNetworkStatus();
  const { processAudio, error } = useRapportinoVocale();
  const [stato, setStato] = useState<Stato>("pronto");
  const [secondi, setSecondi] = useState(0);
  const [livello, setLivello] = useState(0);
  const [avviso, setAvviso] = useState<string | null>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const flusso = useRef<MediaStream | null>(null);
  const pezzi = useRef<Blob[]>([]);
  const inizio = useRef(0);
  const timer = useRef<number | null>(null);
  const anima = useRef<number | null>(null);
  const audioCtx = useRef<AudioContext | null>(null);
  const annullato = useRef(false);

  const spegni = useCallback(() => {
    if (timer.current) window.clearInterval(timer.current);
    if (anima.current) cancelAnimationFrame(anima.current);
    timer.current = null; anima.current = null;
    flusso.current?.getTracks().forEach(tr => tr.stop());
    flusso.current = null;
    void audioCtx.current?.close().catch((): undefined => undefined);
    audioCtx.current = null;
    setLivello(0);
  }, []);

  useEffect(() => () => {
    annullato.current = true;
    const r = rec.current;
    if (r && r.state !== "inactive") { r.ondataavailable = null; r.onstop = null; try { r.stop(); } catch { /* si ferma comunque */ } }
    spegni();
  }, [spegni]);

  const ferma = useCallback(() => {
    const r = rec.current;
    if (r && r.state !== "inactive") r.stop();
  }, []);

  const avvia = async () => {
    setAvviso(null);
    if (!online) { setAvviso(t("Per compilare con la voce serve internet. Scrivi pure: la bozza resta sul telefono.")); return; }
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setAvviso(t("Questo telefono non registra l'audio dal browser. Scrivi la giornata.")); return;
    }
    setStato("permesso");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      if (annullato.current) { stream.getTracks().forEach(tr => tr.stop()); return; }
      flusso.current = stream;
      const mime = formatoAudio();
      const r = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 64_000 } : undefined);
      rec.current = r;
      pezzi.current = [];
      r.ondataavailable = e => { if (e.data.size) pezzi.current.push(e.data); };
      r.onstop = async () => {
        const durata = Math.round((Date.now() - inizio.current) / 1000);
        spegni();
        const tipo = r.mimeType || mime || "audio/webm";
        const blob = new Blob(pezzi.current, { type: tipo });
        if (annullato.current) return;
        if (durata < CAMPO_AUDIO_MIN_SECONDI) { setStato("pronto"); setAvviso(t("Troppo corto: racconta la giornata per qualche secondo in più.")); return; }
        setStato("compila");
        const draft = await processAudio(blob, Math.min(durata, CAMPO_AUDIO_MAX_SECONDI), tipo.split(";")[0], orderId, workDay);
        if (annullato.current) return;
        setStato("pronto");
        if (draft) onCompilato(draft);
      };
      // Il livello della voce muove il bottone: si vede che sta ascoltando.
      try {
        const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (Ctx) {
          const ctx = new Ctx();
          audioCtx.current = ctx;
          const analizza = ctx.createAnalyser();
          analizza.fftSize = 256;
          ctx.createMediaStreamSource(stream).connect(analizza);
          const dati = new Uint8Array(analizza.frequencyBinCount);
          const giro = () => {
            analizza.getByteTimeDomainData(dati);
            let somma = 0;
            for (const v of dati) somma += Math.abs(v - 128);
            setLivello(Math.min(1, somma / dati.length / 24));
            anima.current = requestAnimationFrame(giro);
          };
          giro();
        }
      } catch { /* senza onda il bottone pulsa lo stesso */ }
      inizio.current = Date.now();
      setSecondi(0);
      r.start(1000);
      setStato("registra");
      timer.current = window.setInterval(() => {
        const s = Math.round((Date.now() - inizio.current) / 1000);
        setSecondi(s);
        if (s >= CAMPO_AUDIO_MAX_SECONDI) ferma();
      }, 250);
    } catch {
      spegni();
      setStato("pronto");
      setAvviso(t("Il microfono non è disponibile: consenti il microfono al browser, poi riprova."));
    }
  };

  const registra = stato === "registra";
  const compila = stato === "compila";
  const scala = 1 + livello * 0.35;

  return (
    <section aria-label={t("Racconta la giornata")} className="flex flex-col items-center gap-2 rounded-2xl border border-primary/20 bg-gradient-to-b from-primary/10 to-background px-3 py-4 text-center">
      <div className="relative flex size-28 items-center justify-center">
        {registra && <>
          <span aria-hidden="true" className="absolute inset-0 rounded-full bg-red-500/20 motion-safe:animate-ping" />
          <span aria-hidden="true" className="absolute inset-2 rounded-full bg-red-500/25 transition-transform duration-75" style={{ transform: `scale(${scala})` }} />
        </>}
        {compila && <span aria-hidden="true" className="absolute inset-0 rounded-full border-4 border-primary/30 border-t-primary motion-safe:animate-spin" />}
        <button type="button" onClick={registra ? ferma : () => void avvia()}
          disabled={disabilitato || compila || stato === "permesso"}
          aria-label={registra ? t("Ferma e compila il rapportino") : t("Racconta la giornata a voce")}
          className={cn("relative flex size-20 items-center justify-center rounded-full text-white shadow-lg transition-colors disabled:opacity-60",
            registra ? "bg-red-600" : "bg-primary motion-safe:hover:scale-105")}>
          {compila ? <Sparkles className="size-8" aria-hidden="true" />
            : stato === "permesso" ? <Loader2 className="size-8 motion-safe:animate-spin" aria-hidden="true" />
            : registra ? <Square className="size-7 fill-current" aria-hidden="true" />
            : <Mic className="size-9" aria-hidden="true" />}
        </button>
      </div>
      <p role="status" className="text-[15px] font-bold">
        {registra ? t("Ti ascolto… {tempo}", { tempo: tempo(secondi) })
          : compila ? t("Sto compilando il rapportino…")
          : t("Racconta la giornata")}
      </p>
      <p className="max-w-xs text-[13px] text-muted-foreground">
        {registra ? t("Tocca di nuovo quando hai finito.")
          : compila ? t("Ci vuole qualche secondo.")
          : suggerimento ?? t("Tocca e parla: cosa avete fatto, chi c'era, quante ore, i materiali. Compilo io.")}
      </p>
      {!online && !registra && <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-700"><WifiOff className="size-3.5" aria-hidden="true" />{t("Senza rete: scrivi pure, la voce torna con internet.")}</p>}
      {(avviso || (error && !registra && !compila)) && <p role="alert" className="rounded-xl bg-destructive/5 px-3 py-2 text-[13px] text-destructive">{avviso ?? t(error!)}</p>}
    </section>
  );
}
