/**
 * La chat del popup. Fase 1: Silvio dice cosa ha letto e cosa manca, e le domande sono
 * pulsanti (una alla volta). Fase 3 (lotto 3.1): si scrive o si detta («sposta tutto di una
 * settimana e togli la ditta»), la risposta è breve e la modifica si vede subito a destra,
 * segnata finché non la guardi («Vedi»). «annulla» in chat, o Cmd+Z, la toglie.
 *
 * Il costo si vede prima: accanto al campo la stima di un messaggio e della dettatura.
 */
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Eye, Loader2, Mic, Send, Sparkles, Square, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { Modifica } from "../../../shared/silvio-commessa/piano.ts";
import { MAX_MESSAGGIO_CHAT, STIMA_CHAT_EUR } from "../../../shared/silvio-commessa/chat.ts";
import { euroAI, STIMA_DETTATURA_EUR, type Domanda } from "./presentazione";
import type { Messaggio } from "./useBozzaSilvio";
import { useDettatura, type Dettatura } from "./useDettatura";

export interface ColonnaChatProps {
  messaggi: Messaggio[];
  domanda: Domanda | null;
  /** Silvio sta ancora leggendo qualcosa. */
  legge: boolean;
  onModifica: (m: Modifica) => void;
  onApri: (chiave: string) => void;
  /** Manda un messaggio; false se non è partito (il testo resta nel campo). */
  onScrivi?: (testo: string) => Promise<boolean>;
  /** Silvio sta rispondendo. */
  scrivendo?: boolean;
  /** «Vedi» su una risposta: mostra a destra le variabili cambiate. */
  onVedi?: (chiavi: string[]) => void;
  /** C'è qualcosa da annullare. */
  annullabile?: boolean;
  onAnnulla?: () => void;
  /** L'audio diventa testo; senza, niente microfono. */
  trascrivi?: (audio: Blob) => Promise<string>;
  /** Prima di dettare: i crediti. Null = si può. */
  primaDiDettare?: () => Promise<string | null>;
}

function Microfono({ d }: { d: Dettatura }) {
  return (
    <Button type="button" variant={d.registra ? "destructive" : "outline"} size="icon" className="h-10 w-10 shrink-0"
      onClick={d.tocca} disabled={d.trascrive} aria-pressed={d.registra}
      aria-label={d.registra ? `Ferma la dettatura (${d.secondi} s)` : d.trascrive ? "Trascrivo…" : `Detta a Silvio (circa ${euroAI(STIMA_DETTATURA_EUR)})`}
      title={d.registra ? "Ferma" : `Detta · circa ${euroAI(STIMA_DETTATURA_EUR)}`}>
      {d.trascrive ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : d.registra ? <Square className="h-4 w-4" aria-hidden /> : <Mic className="h-4 w-4" aria-hidden />}
    </Button>
  );
}

export function ColonnaChat({
  messaggi, domanda, legge, onModifica, onApri, onScrivi, scrivendo = false, onVedi, annullabile = false, onAnnulla, trascrivi, primaDiDettare,
}: ColonnaChatProps) {
  const fondo = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLTextAreaElement>(null);
  const [testo, setTesto] = useState("");
  useEffect(() => { fondo.current?.scrollIntoView?.({ block: "end" }); }, [messaggi.length, domanda?.testo, scrivendo]);
  const dettatura = useDettatura(
    trascrivi ?? (async () => ""),
    (t) => { setTesto((p) => (p.trim() ? `${p.trim()} ${t}` : t)); campo.current?.focus(); },
    primaDiDettare,
  );
  const ultimaConModifiche = [...messaggi].reverse().find((m) => m.chiavi?.length)?.id;

  const manda = async (e?: FormEvent) => {
    e?.preventDefault();
    const t = testo.trim();
    if (!t || !onScrivi || scrivendo) return;
    setTesto("");
    const partito = await onScrivi(t);
    if (!partito) setTesto(t);
  };

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1" role="log" aria-label="Messaggi con Silvio" aria-live="off">
        {!messaggi.length && (
          <p className="rounded-xl bg-white p-3 text-sm text-slate-600 shadow-sm">
            Dammi quello che hai: un preventivo, un contratto, un computo, una foto, o due righe sul lavoro.
            Compongo la commessa qui a destra mentre leggo. Poi correggi a parole: «sposta tutto di una settimana».
          </p>
        )}
        {messaggi.map((m) => (
          <div key={m.id} className={cn("flex", m.tono === "persona" && "justify-end")}>
            <div className={cn("max-w-[92%] rounded-xl p-3 text-sm shadow-sm",
              m.tono === "persona" ? "bg-orange-600 text-white"
                : m.tono === "errore" ? "bg-red-50 text-red-800" : m.tono === "avviso" ? "bg-amber-50 text-amber-900" : "bg-white text-slate-700")}>
              <p className="whitespace-pre-line break-words">{m.testo}</p>
              {m.chiavi?.length ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {onVedi && (
                    <Button type="button" size="sm" variant="outline" className="h-7 gap-1 bg-white text-xs" onClick={() => onVedi(m.chiavi!)}>
                      <Eye className="h-3.5 w-3.5" aria-hidden />Vedi
                    </Button>
                  )}
                  {onAnnulla && annullabile && m.id === ultimaConModifiche && (
                    <Button type="button" size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={onAnnulla}>
                      <Undo2 className="h-3.5 w-3.5" aria-hidden />Annulla
                    </Button>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        ))}
        {legge && <p className="px-1 text-xs text-slate-500" role="status">Sto leggendo…</p>}
        {scrivendo && (
          <p className="flex items-center gap-1 px-1 text-xs text-slate-500" role="status">
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden />Silvio sta cambiando la bozza…
          </p>
        )}
        {domanda && (
          <div className="rounded-xl border border-orange-200 bg-orange-50 p-3 shadow-sm">
            <p className="flex gap-2 text-sm text-slate-800">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-orange-600" aria-hidden />{domanda.testo}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {domanda.risposte.map((r) => (
                <Button key={r.etichetta} type="button" size="sm" variant="outline" className="h-auto min-h-8 whitespace-normal bg-white text-left"
                  onClick={() => ("modifica" in r ? onModifica(r.modifica) : onApri(r.apri))}>
                  {r.etichetta}
                </Button>
              ))}
            </div>
          </div>
        )}
        <div ref={fondo} />
      </div>
      <form className="mt-3" onSubmit={(e) => void manda(e)}>
        <label htmlFor="silvio-commessa-scrivi" className="sr-only">Scrivi a Silvio</label>
        <div className="flex items-end gap-2">
          <Textarea id="silvio-commessa-scrivi" ref={campo} value={testo} rows={1} maxLength={MAX_MESSAGGIO_CHAT}
            disabled={!onScrivi} placeholder={dettatura.registra ? "Ti ascolto…" : "Scrivi o detta a Silvio"}
            className="max-h-32 min-h-10 resize-none bg-white"
            onChange={(e) => setTesto(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void manda(); } }} />
          {trascrivi && dettatura.disponibile && <Microfono d={dettatura} />}
          <Button type="submit" size="icon" className="h-10 w-10 shrink-0 bg-orange-600 hover:bg-orange-700"
            disabled={!onScrivi || scrivendo || !testo.trim()} aria-label={`Manda a Silvio (circa ${euroAI(STIMA_CHAT_EUR)})`}>
            {scrivendo ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
          </Button>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          {dettatura.errore
            ? <span className="text-red-700">{dettatura.errore}</span>
            : dettatura.registra ? `Registro… ${dettatura.secondi} s (tocca ■ per finire)`
              : <>Circa {euroAI(STIMA_CHAT_EUR)} a messaggio · «annulla» è gratis</>}
        </p>
      </form>
    </div>
  );
}
