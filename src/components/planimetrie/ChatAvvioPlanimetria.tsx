import { useEffect, useRef } from "react";
import { ArrowUp, MessageSquareText, Ruler, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ambientiDaAppunti, type AmbienteGuida } from "@/lib/planimetrie/avvioGuidato";

const fmt = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 2 });

export function RiepilogoAmbienti({ ambienti, vuoto }: { ambienti: AmbienteGuida[]; vuoto: string }) {
  return <section className="rounded-xl border bg-card p-4">
    <div className="flex items-center gap-2.5">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><Ruler className="h-4 w-4" aria-hidden="true" /></span>
      <h2 className="text-sm font-semibold">Misure della bozza</h2>
    </div>
    {ambienti.length ? <ul className="mt-3 divide-y" aria-label="Stanze con misure">
      {ambienti.map((a, i) => <li key={`${a.nome}-${i}`} className="flex items-start justify-between gap-2 py-2.5 text-sm">
        <div className="min-w-0">
          <p className="break-words font-medium">{a.nome}</p>
          {a.piano && <p className="text-xs text-muted-foreground">{a.piano}</p>}
          {a.larghezzaM && a.profonditaM && <p className="text-xs tabular-nums text-muted-foreground">{fmt.format(a.larghezzaM)} × {fmt.format(a.profonditaM)} m</p>}
          {a.altezzaM && <p className="text-xs text-muted-foreground">Altezza {fmt.format(a.altezzaM)} m</p>}
        </div>
        <span className="shrink-0 tabular-nums text-muted-foreground">{fmt.format(a.superficieMq)} m²</span>
      </li>)}
    </ul> : <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{vuoto}</p>}
  </section>;
}

export function ChatAvvioPlanimetria({ messaggi, testo, limite, ambienti, onTesto, onInvia, onTogli }: {
  messaggi: string[];
  testo: string;
  limite: number;
  ambienti: AmbienteGuida[];
  onTesto: (testo: string) => void;
  onInvia: () => void;
  onTogli: (indice: number) => void;
}) {
  const registro = useRef<HTMLDivElement>(null);
  const compositore = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (registro.current) registro.current.scrollTop = registro.current.scrollHeight; }, [messaggi.length]);
  const invia = () => {
    if (!testo.trim() || !limite) return;
    onInvia();
    compositore.current?.focus();
  };
  const bolle = messaggi.map((m, i) => {
    const lette = ambientiDaAppunti(messaggi.slice(0, i + 1).join("\n"));
    const inQuestoMessaggio = ambientiDaAppunti(m);
    return {
      testo: m,
      risposta: inQuestoMessaggio.length
        ? `Nel riepilogo trovi ${lette.length === 1 ? "una stanza con misure" : `${lette.length} stanze con misure`}. Puoi aggiungerne altre o aprire la bozza.`
        : lette.length
          ? "Ho aggiunto l’appunto. Per cambiare una misura, scrivi di nuovo il nome della stanza con i nuovi lati."
          : "Per disegnare un ambiente mi servono il suo nome e due lati oppure la superficie. Puoi scrivere «Bagno 2,10 × 2,40 m».",
    };
  });

  return <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
    <section className="min-w-0 overflow-hidden rounded-xl border bg-card">
      <div className="flex items-center gap-3 border-b px-4 py-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><MessageSquareText className="h-4 w-4" aria-hidden="true" /></span>
        <h2 className="font-semibold">Descrivi l’immobile</h2>
      </div>
      <div ref={registro} role="log" aria-label="Conversazione della planimetria" className="max-h-72 min-h-40 space-y-3 overflow-y-auto bg-muted/25 p-4">
        <p className="w-fit max-w-[89%] rounded-xl rounded-tl-sm border bg-card px-3 py-2.5 text-sm leading-relaxed">Scrivi il nome e le misure delle stanze. Per più livelli, metti «Piano terra» o «Primo piano» su una riga prima delle relative stanze.</p>
        {bolle.map((b, i) => <div className="space-y-2.5" key={i}>
          <div className="ml-auto flex max-w-[89%] items-start gap-1 rounded-xl rounded-tr-sm bg-primary px-3 py-2 text-primary-foreground">
            <p className="min-w-0 flex-1 whitespace-pre-wrap break-words text-sm">{b.testo}</p>
            <Button type="button" variant="ghost" size="icon" className="-mr-1 h-6 w-6 shrink-0 hover:bg-white/15 hover:text-inherit" aria-label={`Togli messaggio ${i + 1}`} onClick={() => onTogli(i)}><X className="h-3.5 w-3.5" /></Button>
          </div>
          <p className="w-fit max-w-[89%] rounded-xl rounded-tl-sm border bg-card px-3 py-2.5 text-sm leading-relaxed">{b.risposta}</p>
        </div>)}
      </div>
      <div className="space-y-1.5 border-t p-3 sm:p-4">
        <Label htmlFor="descrizione-pianta" className="sr-only">Com'è la casa?</Label>
        <div className="flex items-end gap-2">
          <Textarea ref={compositore} id="descrizione-pianta" rows={2} value={testo} maxLength={limite} onChange={(e) => onTesto(e.target.value)}
            placeholder="Cucina 3,20 × 4,10 m, bagno 2,10 × 2,40 m"
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); invia(); } }} />
          <Button type="button" size="icon" aria-label="Invia descrizione" className="h-10 w-10 shrink-0 rounded-lg" onClick={invia} disabled={!testo.trim() || !limite}><ArrowUp className="h-4 w-4" /></Button>
        </div>
        <p className="text-xs text-muted-foreground">{limite ? "Invio per aggiungere il messaggio · Maiusc + Invio per andare a capo" : "Hai raggiunto il limite della descrizione. Apri la bozza o rimuovi un messaggio."}</p>
      </div>
    </section>
    <RiepilogoAmbienti ambienti={ambienti} vuoto="Scrivi le misure di una stanza per vederla qui." />
  </div>;
}
