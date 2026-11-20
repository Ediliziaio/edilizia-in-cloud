/**
 * «Tempi dal preventivo firmato» nella scheda delle fasi della commessa (31/10/2026).
 *
 * Il preventivo da cui nasce la commessa ha il suo cronoprogramma (fasi e durate): qui si sceglie
 * il giorno in cui partono i lavori e le fasi della commessa prendono le date, in giorni lavorativi.
 * Le fasi già pianificate a mano non si toccano; quelle del cronoprogramma che mancano si aggiungono.
 * Il riquadro sparisce quando ogni fase del cronoprogramma ha le sue date nella commessa.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, ChevronDown, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { refreshWorkQueries } from "@/lib/orders/refreshWorkQueries";
import { cn } from "@/lib/utils";
import {
  datePerFasi, giorniDelPiano, leggiPianoDellaCommessa, pianificaFasiDellaCommessa, primoGiornoLavorativo,
} from "@/lib/orders/pianoDalCronoprogramma";

const chiave = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
const oggi = () => new Date().toLocaleDateString("en-CA");
const dataIt = (iso: string | null | undefined) => iso ? new Date(`${iso}T12:00:00`).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" }) : "";

export function PianoDalPreventivo({ orderId, fasi }: {
  orderId: string;
  fasi: ReadonlyArray<{ name: string; start_date: string | null; end_date: string | null }>;
}) {
  const companyId = useEffectiveCompanyId();
  const qc = useQueryClient();
  const [chiuso, setChiuso] = useState(false);
  const [dateAperte, setDateAperte] = useState(false);
  const [inizio, setInizio] = useState<string | null>(null);
  const { data: piano } = useQuery({
    queryKey: ["commessa-piano-dal-preventivo", orderId],
    queryFn: () => leggiPianoDellaCommessa(orderId),
    staleTime: 60_000,
  });
  const applica = useMutation({
    mutationFn: (giorno: string) => pianificaFasiDellaCommessa(orderId, piano!.piano, giorno),
    onSuccess: (esito) => {
      refreshWorkQueries(qc, orderId, companyId);
      void qc.invalidateQueries({ queryKey: ["order", orderId] });
      const parti = [esito.datate && `${esito.datate} ${esito.datate === 1 ? "fase pianificata" : "fasi pianificate"}`,
        esito.aggiunte && `${esito.aggiunte} ${esito.aggiunte === 1 ? "aggiunta" : "aggiunte"}`,
        esito.saltate && `${esito.saltate} già con le sue date, lasciate com'erano`].filter(Boolean).join(", ");
      toast.success(`${parti || "Nessuna fase da pianificare"}. Fine lavori prevista: ${dataIt(esito.fine)}.`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (chiuso || !piano) return null;
  const perNome = new Map(fasi.map(f => [chiave(f.name), f]));
  const daPianificare = piano.piano.filter(f => { const c = perNome.get(chiave(f.nome)); return !c || (!c.start_date && !c.end_date); });
  if (daPianificare.length === 0) return null;

  const giorno = inizio ?? piano.inizioSuggerito ?? primoGiornoLavorativo(oggi());
  const date = datePerFasi(piano.piano, giorno);
  const fine = date.reduce((max, d) => (d.fine > max ? d.fine : max), date[0]?.fine ?? giorno);
  const giorni = giorniDelPiano(piano.piano);
  const fonte = piano.origine.startsWith("computo") ? "computo" : piano.origine;
  const idDate = `date-dal-documento-${orderId}`;

  return (
    <section aria-label={`Tempi dal ${fonte}`} className="relative rounded-xl border border-sky-200/80 bg-sky-50/60 p-3 text-sm dark:border-sky-900 dark:bg-sky-950/30">
      <button type="button" aria-label="Nascondi piano date" className="absolute right-2 top-2 grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => setChiuso(true)}>
        <X className="size-3.5" aria-hidden="true" />
      </button>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 pr-7">
        <div className="flex min-w-0 flex-1 basis-52 items-start gap-2.5">
          <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-sky-100 text-sky-800 dark:bg-sky-900/60 dark:text-sky-200">
            <CalendarClock className="size-4" aria-hidden="true" />
          </div>
          <div>
            <h3 className="font-semibold">Tempi dal {fonte}</h3>
            <p className="text-xs text-muted-foreground">
              {daPianificare.length} {daPianificare.length === 1 ? "fase da pianificare" : "fasi da pianificare"} · {giorni} {giorni === 1 ? "giorno lavorativo" : "giorni lavorativi"} stimati
            </p>
          </div>
        </div>
        <Button type="button" variant="ghost" size="sm" className="h-7 px-1.5 text-sky-800 dark:text-sky-200 sm:hidden"
          aria-controls={idDate} aria-expanded={dateAperte} onClick={() => setDateAperte(v => !v)}>
          {dateAperte ? "Chiudi date" : "Imposta date"}
          <ChevronDown className={cn("size-3.5", dateAperte && "rotate-180")} aria-hidden="true" />
        </Button>
        <div id={idDate} className={cn("flex flex-wrap items-end gap-2", !dateAperte && "max-sm:hidden")}>
          <div className="space-y-1">
            <Label htmlFor={`inizio-lavori-${orderId}`} className="text-xs">Inizio lavori</Label>
            <Input id={`inizio-lavori-${orderId}`} type="date" className="h-9 min-w-0 w-36 bg-background" value={giorno} onChange={e => setInizio(e.target.value || null)} />
          </div>
          <Button size="sm" className="h-9" disabled={applica.isPending || !giorno} onClick={() => applica.mutate(giorno)}>
            {applica.isPending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            Pianifica le fasi
          </Button>
        </div>
      </div>
      <p className={cn("mt-2 text-xs text-muted-foreground", !dateAperte && "max-sm:hidden")}>Fine prevista <b className="font-semibold text-foreground">{dataIt(fine)}</b>
        {daPianificare.length < piano.piano.length && ` · ${piano.piano.length - daPianificare.length} già pianificate`}
      </p>
      {piano.senzaDurata.length > 0 && <details className={cn("mt-1 text-xs text-amber-800 dark:text-amber-200", !dateAperte && "max-sm:hidden")}>
        <summary className="w-fit cursor-pointer font-medium">{piano.senzaDurata.length} {piano.senzaDurata.length === 1 ? "fase stimata in un giorno" : "fasi stimate in un giorno ciascuna"}</summary>
        <p className="mt-1">{piano.senzaDurata.join(", ")}.</p>
      </details>}
    </section>
  );
}
