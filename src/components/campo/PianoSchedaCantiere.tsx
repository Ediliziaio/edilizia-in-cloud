import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { UniformSelect } from "@/components/ui/uniform-select";
import { useCampoWorkDay } from "@/hooks/campo/useCampoWorkDay";
import { useCalendarioCantiere } from "@/hooks/useCalendarioCantiere";
import type { FaseSchedaCantiere, SchedaCantiere } from "@/lib/campo/schedaCantiere";
import {
  avanzamentoFase, barra, fasiCronoprogramma, giornoLocale, intervalloCronoprogramma, ritardoFase,
  sottofasiCronoprogramma, type FaseCrono, type LavoroReale,
} from "@/lib/orders/cronoprogramma";
import type { Sottofase } from "@/lib/orders/sottofasi";
import { planningDay } from "@/lib/orders/planning";

const statoFase = { da_iniziare: "Da iniziare", in_corso: "In corso", completata: "Completata" };
const dataBreve = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short", year: "numeric" });
const data = (giorno: string) => dataBreve.format(new Date(`${giorno}T12:00:00`));

function periodo(inizio?: string | null, fine?: string | null) {
  const da = planningDay(inizio);
  const a = planningDay(fine);
  if (da && a) return da === a ? data(da) : `${data(da)} – ${data(a)}`;
  return da ? `Dal ${data(da)}` : a ? `Entro il ${data(a)}` : "Date da definire";
}

function SottofaseRiga({ sottofase, date }: { sottofase: Sottofase; date?: string }) {
  const pct = sottofase.fatta ? 100 : Math.min(100, Math.max(0, Math.round(sottofase.percentuale || 0)));
  const dettagli = [
    date,
    sottofase.giorni > 0 && `${sottofase.giorni} gg di lavoro`,
    sottofase.risorse > 0 && `${sottofase.risorse} ${sottofase.risorse === 1 ? "persona" : "persone"}`,
    sottofase.in_parallelo && "In parallelo",
  ].filter(Boolean).join(" · ");
  return <li className="flex items-start gap-2 py-2">
    <div className="min-w-0 flex-1">
      <p className="break-words text-sm">{sottofase.name}</p>
      {dettagli && <p className="mt-0.5 text-xs text-muted-foreground">{dettagli}</p>}
    </div>
    <span className="shrink-0 text-xs font-semibold tabular-nums">{pct}%</span>
  </li>;
}

export function FasiSchedaCantiere({ fasi }: { fasi: FaseSchedaCantiere[] }) {
  const [filtro, setFiltro] = useState("");
  const visibili = fasi.filter(fase => !filtro || fase.status === filtro);
  if (!fasi.length) return <p className="rounded-xl border bg-card p-3 text-sm text-muted-foreground">Nessuna fase pianificata.</p>;
  return <div className="space-y-2">
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-muted-foreground">{fasi.filter(f => f.status === "completata").length} di {fasi.length} concluse</span>
      <UniformSelect aria-label="Stato delle fasi" className="min-h-11 bg-card" value={filtro} onChange={event => setFiltro(event.target.value)}>
        <option value="">Tutte le fasi</option>
        {Object.entries(statoFase).map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}
      </UniformSelect>
    </div>
    {visibili.length === 0 && <p className="py-3 text-sm text-muted-foreground">Nessuna fase in questo stato.</p>}
    {visibili.map(fase => {
      const pct = avanzamentoFase(fase);
      const completate = fase.sottofasi.filter(s => s.fatta).length;
      return <details key={fase.id} className="group rounded-xl border bg-card">
        <summary className="flex min-h-14 cursor-pointer list-none items-center gap-2 p-3 [&::-webkit-details-marker]:hidden">
          <span className="min-w-0 flex-1">
            <span className="block break-words text-sm font-semibold">{fase.name}</span>
            <span className="text-xs text-muted-foreground">{statoFase[fase.status]}{fase.sottofasi.length > 0 && ` · Sottofasi ${completate}/${fase.sottofasi.length}`}</span>
          </span>
          <span className="shrink-0 text-sm font-semibold tabular-nums text-primary">{pct}%</span>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground group-open:rotate-180" aria-hidden="true" />
        </summary>
        <div className="space-y-2 border-t px-3 pb-2 pt-2.5">
          <p className="text-xs font-medium text-muted-foreground">{periodo(fase.start_date, fase.end_date)}</p>
          {fase.note && <p className="whitespace-pre-wrap break-words text-sm">{fase.note}</p>}
          {fase.sottofasi.length > 0 && <ul className="divide-y" aria-label={`Sottofasi di ${fase.name}`}>
            {fase.sottofasi.map(s => <SottofaseRiga key={s.id} sottofase={s} date={s.data_inizio || s.data_fine ? periodo(s.data_inizio, s.data_fine) : undefined} />)}
          </ul>}
        </div>
      </details>;
    })}
  </div>;
}

export function CronoprogrammaSchedaCantiere({ cantiere, fasi }: {
  cantiere: SchedaCantiere["cantiere"]; fasi: FaseSchedaCantiere[];
}) {
  const oggi = useCampoWorkDay();
  const { lavorativo } = useCalendarioCantiere();
  const [soloRitardi, setSoloRitardi] = useState(false);
  const giorniReali = new Map<string, LavoroReale>();
  for (const f of fasi) {
    if (f.primo) giorniReali.set(f.id, { primo: f.primo, ultimo: f.ultimo || f.primo, ore: 0, rapportini: 0 });
  }
  const piano = fasiCronoprogramma(fasi.map(f => ({
    ...f, completata_il: f.completata_il && giornoLocale(f.completata_il),
  })), giorniReali, oggi);
  const sotto = new Map(fasi.map(fase => [fase.id, fase.sottofasi]));
  const programmate = new Map(piano.map(fase => [fase.id, sottofasiCronoprogramma(fase, sotto.get(fase.id) ?? [], oggi, lavorativo)]));
  const datePiano = [cantiere.inizio, cantiere.fine].filter((d): d is string => !!d);
  datePiano.push(...[...programmate.values()].flatMap(v => v.flatMap(s => [s.previstoInizio, s.previstoFine])));
  const asse = intervalloCronoprogramma(piano, [], oggi, "previsto", datePiano);
  const ritardi = (fase: FaseCrono) => ritardoFase(fase) || programmate.get(fase.id)?.some(s => s.ritardo > 0);
  const visibili = soloRitardi ? piano.filter(ritardi) : piano;

  if (!fasi.length) return <p className="rounded-xl border bg-card p-3 text-sm text-muted-foreground">Il cronoprogramma è disponibile quando l’ufficio inserisce le fasi.</p>;
  return <div className="space-y-2">
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-card px-3 py-2">
      <div className="min-w-0">
        <h2 className="text-sm font-semibold">Date di cantiere</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">{periodo(cantiere.inizio, cantiere.fine)}</p>
      </div>
      <button type="button" aria-pressed={soloRitardi} onClick={() => setSoloRitardi(v => !v)}
        className="min-h-11 shrink-0 rounded-lg border px-2.5 text-xs font-medium aria-pressed:border-primary aria-pressed:bg-primary/10">Solo ritardi</button>
    </div>
    {visibili.length === 0 && <p className="py-3 text-sm text-muted-foreground">Nessuna fase in ritardo.</p>}
    {visibili.map(fase => {
      const ritardo = ritardoFase(fase);
      const sottofasi = sotto.get(fase.id) ?? [];
      const dateSottofasi = new Map((programmate.get(fase.id) ?? []).map(s => [s.id, s]));
      const b = fase.previstoInizio && fase.previstoFine && !fase.dateIncoerenti ? barra(fase.previstoInizio, fase.previstoFine, asse) : null;
      return <section key={fase.id} className="space-y-2 rounded-xl border bg-card p-3">
        <div className="flex items-start justify-between gap-2">
          <h3 className="min-w-0 break-words text-sm font-semibold">{fase.nome}</h3>
          <span className="shrink-0 text-xs font-semibold tabular-nums text-primary">{fase.avanzamento}%</span>
        </div>
        {b && <div className="relative h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
          <span className="absolute inset-y-0 rounded-full bg-primary/60" style={{ left: `${b.left}%`, width: `${b.width}%` }} />
        </div>}
        <p className="text-xs"><span className="font-medium">Previsto</span> · {fase.dateIncoerenti ? "Date da verificare" : periodo(fase.previstoInizio, fase.previstoFine)}</p>
        {(fase.realeInizio || fase.realeFine) && <p className="text-xs text-muted-foreground">Effettivo · {periodo(fase.realeInizio, fase.realeFine)}</p>}
        {ritardo && <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">
          {ritardo.giorni} {ritardo.giorni === 1 ? "giorno" : "giorni"} di ritardo {ritardo.su === "inizio" ? "sull’inizio" : "sulla fine"}
        </p>}
        {sottofasi.length > 0 && <details className="group border-t">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 text-xs font-semibold [&::-webkit-details-marker]:hidden">
            Sottofasi ({sottofasi.length}) <ChevronDown className="size-4 text-muted-foreground group-open:rotate-180" aria-hidden="true" />
          </summary>
          <ul className="divide-y" aria-label={`Date sottofasi di ${fase.nome}`}>
            {sottofasi.map(s => {
              const prevista = dateSottofasi.get(s.id);
              const date = prevista ? [
                periodo(prevista.previstoInizio, prevista.previstoFine),
                prevista.stimata && "Stima",
                prevista.ritardo > 0 && `+${prevista.ritardo} gg`,
              ].filter(Boolean).join(" · ") : periodo(s.data_inizio, s.data_fine);
              return <SottofaseRiga key={s.id} sottofase={s} date={date} />;
            })}
          </ul>
        </details>}
      </section>;
    })}
  </div>;
}
