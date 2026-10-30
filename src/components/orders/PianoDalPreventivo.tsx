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
import { CalendarClock, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { refreshWorkQueries } from "@/lib/orders/refreshWorkQueries";
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

  return (
    <section aria-label="Tempi dal preventivo firmato" className="relative mb-3 rounded-lg border border-sky-200 bg-sky-50/60 p-3 text-sm">
      <button type="button" aria-label="Non ora" className="absolute right-2 top-2 rounded p-1 text-slate-500 hover:bg-sky-100" onClick={() => setChiuso(true)}>
        <X className="h-3.5 w-3.5" />
      </button>
      <p className="flex items-center gap-1.5 pr-6 font-semibold text-slate-900">
        <CalendarClock className="h-4 w-4 text-sky-700" />Tempi dal {piano.origine}
      </p>
      <p className="mt-1 text-slate-700">
        {piano.piano.length} {piano.piano.length === 1 ? "fase" : "fasi"}, {giorni} {giorni === 1 ? "giorno lavorativo" : "giorni lavorativi"}.
        {" "}Scegli quando partono i lavori: le fasi prendono le date, saltando sabati e domeniche.
        {daPianificare.length < piano.piano.length && ` ${piano.piano.length - daPianificare.length} hanno già le loro date e restano come sono.`}
      </p>
      {piano.senzaDurata.length > 0 && (
        <p className="mt-1 text-xs text-amber-800">Senza una durata leggibile, contano un giorno: {piano.senzaDurata.join(", ")}.</p>
      )}
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <Label htmlFor={`inizio-lavori-${orderId}`} className="text-xs">Inizio lavori</Label>
          <Input id={`inizio-lavori-${orderId}`} type="date" className="h-9 w-44 bg-white" value={giorno} onChange={e => setInizio(e.target.value || null)} />
        </div>
        <Button size="sm" className="h-9" disabled={applica.isPending || !giorno} onClick={() => applica.mutate(giorno)}>
          {applica.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <CalendarClock className="mr-1.5 h-4 w-4" />}
          Pianifica le fasi
        </Button>
        <span className="text-xs text-slate-600">Fine lavori prevista: <b>{dataIt(fine)}</b></span>
      </div>
    </section>
  );
}
