/**
 * Il piano di volo sulla pagina della commessa (1/11/2026, fase 5, lotto 5.3): il controllo di
 * Silvio 3 giorni prima di una fase e la proposta del SAL a fine fase, ognuno su una riga con i
 * problemi e le azioni pronte. «Fai» esegue le azioni spuntate (con i permessi di chi tocca),
 * «Non serve» la chiude. Niente parte da solo: è qui che si conferma.
 *
 * Dietro `silvio_crea_commessa`; senza proposte aperte non compare.
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarCheck, Check, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  azioneInParole, confermaVolo, proposteDelVolo, scartaVolo, type ClientVolo, type EsitoConferma, type PropostaVolo,
} from "@/lib/silvio-commessa/pianoVolo";
import { erroreLeggibile } from "@/lib/silvio-commessa/testoErrore";
import { useCreaConSilvioAttivo } from "./useCreaConSilvioAttivo";
import { cn } from "@/lib/utils";

/** Il motivo di un'azione saltata: dal database arriva anche il testo tecnico, che qui non si legge. */
const motivoInParole = (m: string) => erroreLeggibile(m, "Non si è potuto fare");

/** «Fatto: 2 cose. Non fatto: 1 (motivo).» */
function esitoInParole(e: EsitoConferma): string {
  const cose = (n: number) => (n === 1 ? "1 cosa" : `${n} cose`);
  const parti = [e.fatte.length ? `Fatto: ${cose(e.fatte.length)}.` : ""];
  if (e.saltate.length) parti.push(`Non fatto: ${e.saltate.length} (${e.saltate.map((x) => motivoInParole(x.motivo)).join("; ")}).`);
  if (e.nonScelte.length) parti.push(`${e.nonScelte.length === 1 ? "Ne resta 1" : `Ne restano ${e.nonScelte.length}`} che non hai scelto.`);
  return parti.filter(Boolean).join(" ") || "Non c'era niente da fare.";
}

function Proposta({ p, puoModificare, db, onFatto, onEsito }: {
  p: PropostaVolo; puoModificare: boolean; db?: ClientVolo; onFatto: () => void; onEsito: (e: EsitoConferma) => void;
}) {
  // Quello che una conferma ha già fatto non si rifà, anche prima che la riga si rilegga.
  const [fatteOra, setFatteOra] = useState<number[]>([]);
  const [saltateOra, setSaltateOra] = useState<PropostaVolo["saltate"] | null>(null);
  const fatte = new Set([...p.giaFatte, ...fatteOra]);
  const saltate = saltateOra ?? p.saltate;
  const [scelte, setScelte] = useState<number[]>(() => p.azioni.map((_, i) => i).filter((i) => !p.giaFatte.includes(i)));
  const daFare = scelte.filter((i) => !fatte.has(i));
  const [lavoro, setLavoro] = useState<"fai" | "scarta" | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const problemi = p.problemi.filter((x) => x.area !== "meteo");
  const meteo = p.problemi.filter((x) => x.area === "meteo");

  const fai = async () => {
    setLavoro("fai");
    setErrore(null);
    try {
      const e = await confermaVolo(p.id, daFare, db);
      setFatteOra((f) => [...f, ...e.fatte.map((x) => x.indice)]);
      setSaltateOra(e.saltate);
      onEsito(e);
      onFatto();
    } catch (err) {
      setErrore(erroreLeggibile(err, "Non sono riuscito a farlo: riprova."));
    } finally {
      setLavoro(null);
    }
  };
  const scarta = async () => {
    setLavoro("scarta");
    try { await scartaVolo(p.id, db); onFatto(); } catch (err) { setErrore(erroreLeggibile(err, "Non è andata: riprova.")); } finally { setLavoro(null); }
  };

  return (
    <li className="px-4 py-2" data-tipo={p.tipo}>
      <p className="text-sm text-slate-900"><span className="font-medium">{p.tipo === "sal" ? "SAL" : "Controllo"}{p.fase ? ` · ${p.fase}` : ""}:</span> {p.riassunto}</p>
      {problemi.length > 0 && (
        <ul className="mt-0.5 space-y-0.5 text-xs text-red-800">{problemi.map((x, i) => <li key={i}>• {x.testo}</li>)}</ul>
      )}
      {meteo.length > 0 && <p className="mt-0.5 text-xs text-amber-800">☂ {meteo.map((x) => x.testo).join(" ")}</p>}
      {p.azioni.length > 0 && puoModificare && (
        <div className="mt-1.5 flex flex-col gap-1.5 lg:flex-row lg:items-end lg:justify-between">
          <ul className="space-y-1 text-xs">
            {p.azioni.map((a, i) => {
              const saltata = saltate.find((x) => x.indice === i);
              return (
                <li key={i}>
                  {fatte.has(i) ? (
                    <p className="flex min-h-11 items-center gap-2 text-emerald-800 lg:min-h-0"><Check className="h-4 w-4 shrink-0" aria-hidden /><span className="min-w-0 break-words">{azioneInParole(a)}<span className="sr-only"> (fatta)</span></span></p>
                  ) : (
                    <div className="flex min-h-11 items-center gap-2 lg:min-h-0 lg:items-start">
                      <Checkbox id={`volo-${p.id}-${i}`} checked={scelte.includes(i)} className="lg:mt-0.5"
                        onCheckedChange={(v) => setScelte((s) => (v ? [...s, i] : s.filter((x) => x !== i)))} />
                      <label htmlFor={`volo-${p.id}-${i}`} className="min-w-0 break-words py-2 text-slate-700 lg:py-0">{azioneInParole(a)}</label>
                    </div>
                  )}
                  {saltata && !fatte.has(i) && <p className="text-red-800 lg:ml-6">Non fatto: {motivoInParole(saltata.motivo)}.</p>}
                </li>
              );
            })}
          </ul>
          <div className="flex shrink-0 gap-2">
            <Button type="button" size="sm" variant="ghost" className="h-11 gap-1 lg:h-8" disabled={!!lavoro} onClick={() => void scarta()}>
              {lavoro === "scarta" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <X className="h-4 w-4" aria-hidden />}Non serve
            </Button>
            <Button type="button" size="sm" className="h-11 gap-1 lg:h-8" disabled={!!lavoro || !daFare.length} onClick={() => void fai()}>
              {lavoro === "fai" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />}
              Fai {daFare.length === 1 ? "questa" : `queste ${daFare.length}`}
            </Button>
          </div>
        </div>
      )}
      {p.azioni.length === 0 && puoModificare && (
        <div className="mt-1 flex justify-end">
          <Button type="button" size="sm" variant="ghost" className="h-11 gap-1 lg:h-8" disabled={!!lavoro} onClick={() => void scarta()}>
            <Check className="h-4 w-4" aria-hidden />Visto
          </Button>
        </div>
      )}
      {errore && <p role="alert" className="mt-1 text-xs text-red-800">{errore}</p>}
    </li>
  );
}

export function PianoDiVoloCommessa({ orderId, companyId, puoModificare, db }: {
  orderId: string; companyId: string | null | undefined; puoModificare: boolean; db?: ClientVolo;
}) {
  const attivo = useCreaConSilvioAttivo(companyId);
  const queryClient = useQueryClient();
  const chiave = ["silvio-commessa", "piano-volo", orderId];
  const proposte = useQuery({
    queryKey: chiave,
    enabled: attivo && !!orderId,
    retry: false,
    queryFn: () => proposteDelVolo(orderId, db),
  });
  const elenco = proposte.data ?? [];
  // L'esito sta fuori dalla riga: una proposta confermata sparisce, e deve restare scritto com'è andata (P3).
  const [esito, setEsito] = useState<string | null>(null);
  if (!attivo || (!elenco.length && !esito)) return null;
  const rilegge = () => { void queryClient.invalidateQueries({ queryKey: chiave }); void queryClient.invalidateQueries({ queryKey: ["orders"] }); };

  return (
    <section className={cn("mx-0 mt-2 rounded-xl border border-sky-200 bg-sky-50 sm:mx-6")} aria-label="Piano di volo di Silvio">
      <h2 className="flex items-center gap-2 border-b border-sky-200 px-4 py-1.5 text-sm font-semibold text-sky-950">
        <CalendarCheck className="h-4 w-4 text-sky-700" aria-hidden />
        Silvio ha controllato la partenza
        {elenco.length > 0 && <span className="font-normal text-sky-800">· {elenco.length === 1 ? "una cosa da guardare" : `${elenco.length} cose da guardare`}</span>}
      </h2>
      {esito && <p role="status" className="border-b border-sky-200 px-4 py-1.5 text-sm text-sky-950">{esito}</p>}
      <ul className="divide-y divide-sky-100">
        {elenco.map((p) => <Proposta key={p.id} p={p} puoModificare={puoModificare} db={db} onFatto={rilegge} onEsito={(e) => setEsito(esitoInParole(e))} />)}
      </ul>
    </section>
  );
}
