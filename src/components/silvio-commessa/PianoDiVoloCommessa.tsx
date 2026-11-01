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
  azioneInParole, confermaVolo, proposteDelVolo, scartaVolo, type ClientVolo, type PropostaVolo,
} from "@/lib/silvio-commessa/pianoVolo";
import { useCreaConSilvioAttivo } from "./useCreaConSilvioAttivo";
import { cn } from "@/lib/utils";

function Proposta({ p, puoModificare, db, onFatto }: { p: PropostaVolo; puoModificare: boolean; db?: ClientVolo; onFatto: () => void }) {
  const [scelte, setScelte] = useState<number[]>(() => p.azioni.map((_, i) => i));
  const [lavoro, setLavoro] = useState<"fai" | "scarta" | null>(null);
  const [esito, setEsito] = useState<string | null>(null);
  const problemi = p.problemi.filter((x) => x.area !== "meteo");
  const meteo = p.problemi.filter((x) => x.area === "meteo");

  const fai = async () => {
    setLavoro("fai");
    setEsito(null);
    try {
      const e = await confermaVolo(p.id, scelte, db);
      if (e.saltate.length) {
        setEsito(`Fatto ${e.fatte.length} su ${e.fatte.length + e.saltate.length}. Non fatto: ${e.saltate.map((s) => s.motivo).join("; ")}.`);
      }
      onFatto();
    } catch (err) {
      setEsito(err instanceof Error ? err.message : "Non sono riuscito a farlo: riprova.");
    } finally {
      setLavoro(null);
    }
  };
  const scarta = async () => {
    setLavoro("scarta");
    try { await scartaVolo(p.id, db); onFatto(); } catch (err) { setEsito(err instanceof Error ? err.message : "Riprova."); } finally { setLavoro(null); }
  };

  return (
    <li className="px-4 py-2" data-tipo={p.tipo}>
      <p className="text-sm text-slate-900"><span className="font-medium">{p.tipo === "sal" ? "SAL" : "Controllo"}{p.fase ? ` · ${p.fase}` : ""}:</span> {p.riassunto}</p>
      {problemi.length > 0 && (
        <ul className="mt-0.5 space-y-0.5 text-xs text-red-800">{problemi.map((x, i) => <li key={i}>• {x.testo}</li>)}</ul>
      )}
      {meteo.length > 0 && <p className="mt-0.5 text-xs text-amber-800">☂ {meteo.map((x) => x.testo).join(" ")}</p>}
      {p.azioni.length > 0 && puoModificare && (
        <div className="mt-1.5 flex flex-col gap-1.5 sm:flex-row sm:items-end sm:justify-between">
          <ul className="space-y-1 text-xs">
            {p.azioni.map((a, i) => (
              <li key={i} className="flex items-start gap-2">
                <Checkbox id={`volo-${p.id}-${i}`} checked={scelte.includes(i)} className="mt-0.5"
                  onCheckedChange={(v) => setScelte((s) => (v ? [...s, i] : s.filter((x) => x !== i)))} />
                <label htmlFor={`volo-${p.id}-${i}`} className="min-w-0 break-words text-slate-700">{azioneInParole(a)}</label>
              </li>
            ))}
          </ul>
          <div className="flex shrink-0 gap-2">
            <Button type="button" size="sm" variant="ghost" className="h-8 gap-1" disabled={!!lavoro} onClick={() => void scarta()}>
              {lavoro === "scarta" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <X className="h-4 w-4" aria-hidden />}Non serve
            </Button>
            <Button type="button" size="sm" className="h-8 gap-1" disabled={!!lavoro || !scelte.length} onClick={() => void fai()}>
              {lavoro === "fai" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />}
              Fai {scelte.length === 1 ? "questa" : `queste ${scelte.length}`}
            </Button>
          </div>
        </div>
      )}
      {p.azioni.length === 0 && puoModificare && (
        <div className="mt-1 flex justify-end">
          <Button type="button" size="sm" variant="ghost" className="h-8 gap-1" disabled={!!lavoro} onClick={() => void scarta()}>
            <Check className="h-4 w-4" aria-hidden />Visto
          </Button>
        </div>
      )}
      {esito && <p role="alert" className="mt-1 text-xs text-red-800">{esito}</p>}
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
  if (!attivo || !elenco.length) return null;
  const rilegge = () => { void queryClient.invalidateQueries({ queryKey: chiave }); void queryClient.invalidateQueries({ queryKey: ["orders"] }); };

  return (
    <section className={cn("mx-0 mt-2 rounded-xl border border-sky-200 bg-sky-50 sm:mx-6")} aria-label="Piano di volo di Silvio">
      <h2 className="flex items-center gap-2 border-b border-sky-200 px-4 py-1.5 text-sm font-semibold text-sky-950">
        <CalendarCheck className="h-4 w-4 text-sky-700" aria-hidden />
        Piano di volo di Silvio
        <span className="font-normal text-sky-800">· {elenco.length === 1 ? "una cosa da guardare" : `${elenco.length} cose da guardare`}</span>
      </h2>
      <ul className="divide-y divide-sky-100">
        {elenco.map((p) => <Proposta key={p.id} p={p} puoModificare={puoModificare} db={db} onFatto={rilegge} />)}
      </ul>
    </section>
  );
}
