/**
 * «Detta» accanto a un campo di testo: si registra, l'AI trascrive e mette in
 * ordine la forma (non il contenuto), il testo si AGGIUNGE in fondo al campo e
 * la persona lo controlla prima di salvare. «Usa la trascrizione originale»
 * rimette il grezzo se il pulito non le torna.
 */
import { useState } from "react";
import type { JSX } from "react";
import { Loader2, Mic, X } from "lucide-react";
import CampoAudioRecorder from "@/components/campo/CampoAudioRecorder";
import { useDettaTesto, type ContestoDetta } from "@/hooks/campo/useDettaTesto";
import { accodaTesto, tornaAllaTrascrizione } from "@/lib/campo/dettaTesto";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

interface DettaTestoProps {
  value: string;
  onChange: (testo: string) => void;
  companyId: string | null | undefined;
  contesto: ContestoDetta;
  /** Quale campo: cambia solo quello che il modello sa del testo (es. «descrizione», «note»). */
  campo: string;
  /** Nome del campo per chi usa il lettore di schermo. */
  etichetta: string;
  disabled?: boolean;
}

export function DettaTesto({ value, onChange, companyId, contesto, campo, etichetta, disabled }: DettaTestoProps): JSX.Element {
  const t = useT();
  const [aperto, setAperto] = useState(false);
  const [ultimo, setUltimo] = useState<{ testo: string; trascrizione: string; pulito: boolean } | null>(null);
  const [grezzoRimesso, setGrezzoRimesso] = useState(false);
  const { detta, lavoro, errore, pulisciErrore } = useDettaTesto({ companyId, contesto, campo });
  const occupato = lavoro !== "fermo";

  const conferma = async (blob: Blob, durata: number, mime: string): Promise<void> => {
    const esito = await detta(blob, durata, mime);
    if (!esito) return;
    onChange(accodaTesto(value, esito.testo));
    setUltimo(esito);
    setGrezzoRimesso(false);
    setAperto(false);
  };

  // Il grezzo si rimette solo se la coda del campo è ancora il testo pulito appena aggiunto.
  const conGrezzo = ultimo && ultimo.pulito && !grezzoRimesso ? tornaAllaTrascrizione(value, ultimo.testo, ultimo.trascrizione) : null;

  return (
    <div className="space-y-2">
      {!aperto && (
        <button
          type="button"
          disabled={disabled || occupato}
          onClick={() => { pulisciErrore(); setAperto(true); }}
          aria-label={t("Detta: {etichetta}", { etichetta })}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border px-2.5 text-sm font-semibold text-foreground disabled:opacity-40"
        >
          <Mic className="size-4 text-primary" aria-hidden="true" /> {t("Detta il testo")}
        </button>
      )}
      {aperto && (
        <div className="rounded-xl border bg-muted/30 p-3">
          <div className="mb-1 flex items-center justify-between gap-2">
            <p className="text-sm font-semibold">{t("Detta {campo}", { campo: etichetta.toLowerCase() })}</p>
            <button type="button" disabled={occupato} onClick={() => setAperto(false)} aria-label={t("Chiudi dettatura")} className="flex size-11 shrink-0 items-center justify-center rounded-lg disabled:opacity-40">
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>
          <p className="text-xs text-muted-foreground">{t("Parla pure come ti viene: sistemo punteggiatura e parole, senza aggiungere niente. Il testo va in fondo al campo.")}</p>
          <CampoAudioRecorder onConfirm={conferma} disabled={disabled || occupato} confirmLabel={t("Trascrivi")} />
          {occupato && (
            <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden="true" /> {lavoro === "carico" ? t("Carico l’audio…") : t("Trascrivo e sistemo il testo…")}
            </p>
          )}
        </div>
      )}
      {errore && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-2 text-sm text-red-800">{errore.messaggio}</p>}
      {ultimo && !aperto && (
        <div role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          {ultimo.pulito
            ? grezzoRimesso ? t("Ho rimesso la trascrizione originale. Controllala prima di salvare.") : t("Ecco il testo, controllalo prima di salvare.")
            : t("Ecco la trascrizione così com’è (non sono riuscito a sistemarla): controllala prima di salvare.")}
          {conGrezzo !== null && (
            <button
              type="button"
              className="ml-2 font-semibold underline"
              onClick={() => { onChange(conGrezzo); setGrezzoRimesso(true); }}
            >
              {t("Usa la trascrizione originale")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
