import { useEffect, useRef, useState } from "react";
import { Loader2, Mic, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import CampoAudioRecorder from "@/components/campo/CampoAudioRecorder";
import { useNetworkStatus } from "@/hooks/campo/useNetworkStatus";
import { supabase } from "@/integrations/supabase/client";

export function CampoDettaMessaggio({ onTesto, disabled }: { onTesto: (testo: string) => void; disabled?: boolean }) {
  const [aperto, setAperto] = useState(false);
  const [trascrive, setTrascrive] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const richiesta = useRef<AbortController | null>(null);
  const online = useNetworkStatus();

  useEffect(() => () => richiesta.current?.abort(), []);

  const cambiaApertura = (valore: boolean) => {
    if (!valore) {
      richiesta.current?.abort();
      richiesta.current = null;
      setTrascrive(false);
      setErrore(null);
    }
    setAperto(valore);
  };

  const trascrivi = async (audio: Blob, _durata: number, formato: string) => {
    if (richiesta.current || !online) return;
    const controller = new AbortController();
    richiesta.current = controller;
    setTrascrive(true);
    setErrore(null);
    try {
      const dati = new FormData();
      const estensione = formato.includes("mp4") ? "m4a" : formato.includes("ogg") ? "ogg" : "webm";
      dati.append("audio", audio, `messaggio.${estensione}`);
      const { data, error } = await supabase.functions.invoke<{ text?: string }>("silvio-transcribe-audio", {
        body: dati, signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      if (error) throw error;
      const testo = typeof data?.text === "string" ? data.text.trim() : "";
      if (!testo) {
        setErrore("Nessuna parola riconosciuta. Puoi registrare di nuovo.");
        return;
      }
      cambiaApertura(false);
      onTesto(testo);
    } catch {
      if (!controller.signal.aborted) setErrore("Trascrizione non riuscita. Puoi riprovare con lo stesso audio.");
    } finally {
      if (richiesta.current === controller) {
        richiesta.current = null;
        setTrascrive(false);
      }
    }
  };

  return (
    <Dialog open={aperto} onOpenChange={cambiaApertura}>
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="icon" disabled={disabled}
          aria-label="Detta messaggio" title="Detta messaggio"
          className="size-11 shrink-0 rounded-full text-primary hover:bg-primary/10">
          <Mic className="size-5" aria-hidden="true" />
        </Button>
      </DialogTrigger>
      <DialogContent overlayClassName="z-[70] bg-black/55 motion-reduce:animate-none"
        className="z-[71] max-h-[calc(100dvh-2rem)] w-[calc(100%-1rem)] max-w-md gap-3 overflow-y-auto rounded-2xl p-4 motion-reduce:animate-none sm:p-5">
        <div className="space-y-1 pr-7">
          <DialogTitle>Detta un messaggio</DialogTitle>
          <DialogDescription>Riascolta l’audio e usa la trascrizione. Potrai modificare il testo prima di inviare.</DialogDescription>
        </div>
        <CampoAudioRecorder onConfirm={trascrivi} disabled={trascrive} confirmAvailable={online} confirmLabel="Usa trascrizione" />
        {!online && <p role="status" className="flex items-center gap-2 rounded-xl bg-muted p-2.5 text-sm">
          <WifiOff className="size-4 shrink-0" aria-hidden="true" /> Torna online per trascrivere.
        </p>}
        {trascrive && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden="true" /> Trascrizione in corso…
        </p>}
        {errore && <p role="alert" className="rounded-xl bg-destructive/5 p-2.5 text-sm text-destructive">{errore}</p>}
      </DialogContent>
    </Dialog>
  );
}
