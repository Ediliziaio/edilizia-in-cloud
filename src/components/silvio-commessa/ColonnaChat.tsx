/**
 * La chat del popup, fase 1: Silvio dice cosa ha letto e cosa manca, e le domande sono
 * pulsanti (una alla volta). Lo scrivere libero arriva con la fase 3 (`silvio-chat` sulla
 * bozza): il campo c'è già, spento.
 */
import { useEffect, useRef } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { Modifica } from "../../../shared/silvio-commessa/piano.ts";
import type { Domanda } from "./presentazione";
import type { Messaggio } from "./useBozzaSilvio";

export interface ColonnaChatProps {
  messaggi: Messaggio[];
  domanda: Domanda | null;
  /** Silvio sta ancora leggendo qualcosa. */
  legge: boolean;
  onModifica: (m: Modifica) => void;
  onApri: (chiave: string) => void;
}

export function ColonnaChat({ messaggi, domanda, legge, onModifica, onApri }: ColonnaChatProps) {
  const fondo = useRef<HTMLDivElement>(null);
  useEffect(() => { fondo.current?.scrollIntoView?.({ block: "end" }); }, [messaggi.length, domanda?.testo]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1" role="region" aria-label="Messaggi di Silvio">
        {!messaggi.length && (
          <p className="rounded-xl bg-white p-3 text-sm text-slate-600 shadow-sm">
            Dammi quello che hai: un preventivo, un contratto, un computo, una foto, o due righe sul lavoro.
            Compongo la commessa qui a destra mentre leggo.
          </p>
        )}
        {messaggi.map((m) => (
          <p key={m.id} className={cn("rounded-xl p-3 text-sm shadow-sm",
            m.tono === "errore" ? "bg-red-50 text-red-800" : m.tono === "avviso" ? "bg-amber-50 text-amber-900" : "bg-white text-slate-700")}>
            {m.testo}
          </p>
        ))}
        {legge && <p className="px-1 text-xs text-slate-500" role="status">Sto leggendo…</p>}
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
      <div className="mt-3">
        <label htmlFor="silvio-commessa-scrivi" className="sr-only">Scrivi a Silvio</label>
        <Input id="silvio-commessa-scrivi" disabled placeholder="Scrivere o dettare a Silvio: presto" className="bg-white" />
        <p className="mt-1 text-xs text-slate-500">Per ora correggi toccando i valori a destra.</p>
      </div>
    </div>
  );
}
