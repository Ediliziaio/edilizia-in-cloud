import { useState } from "react";
import { ChevronDown, PencilLine } from "lucide-react";
import { AggiornamentiFaseCampo } from "@/components/campo/AggiornamentiFaseCampo";
import { Button } from "@/components/ui/button";
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
import { cn } from "@/lib/utils";
import { sostituisci, useT } from "@/lib/campo/lingua/LinguaCampo";

type T = ReturnType<typeof useT>;


const statoFase = { da_iniziare: "Da iniziare", in_corso: "In corso", completata: "Completata" };
const dataBreve = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short", year: "numeric" });
const data = (giorno: string) => dataBreve.format(new Date(`${giorno}T12:00:00`));

/** «l’8 giu», «l’11 giu», «il 9 giu»: davanti a 8 e 11 l'articolo si apostrofa. */
export const conArticolo = (giorno: string) => (/^(8|11)\b/.test(giorno) ? `l’${giorno}` : `il ${giorno}`);

/** «In ritardo · doveva finire l’8 giu 2026»: la stessa frase in scheda cantiere, avanzamento e pagina del lavoro. */
export const testoRitardo = (fine: string, t: T = sostituisci) => t("In ritardo · doveva finire {quando}", { quando: conArticolo(data(fine)) });

function periodo(t: T, inizio?: string | null, fine?: string | null) {
  const da = planningDay(inizio);
  const a = planningDay(fine);
  if (da && a) return da === a ? data(da) : `${data(da)} – ${data(a)}`;
  return da ? t("Dal {data}", { data: data(da) }) : a ? t("Entro il {data}", { data: data(a) }) : t("Date da definire");
}

function SottofaseRiga({ sottofase, date, onEdit }: { sottofase: Sottofase; date?: string; onEdit?: () => void }) {
  const t = useT();
  const pct = sottofase.fatta ? 100 : Math.min(100, Math.max(0, Math.round(sottofase.percentuale || 0)));
  const dettagli = [
    date,
    sottofase.giorni > 0 && t("{n} gg di lavoro", { n: sottofase.giorni }),
    sottofase.risorse > 0 && (sottofase.risorse === 1 ? t("{n} persona", { n: sottofase.risorse }) : t("{n} persone", { n: sottofase.risorse })),
    sottofase.in_parallelo && t("In parallelo"),
  ].filter(Boolean).join(" · ");
  return <li className={cn("flex gap-2 py-2", onEdit ? "items-center" : "items-start")}>
    <div className="min-w-0 flex-1">
      <p className="break-words text-sm">{sottofase.name}</p>
      {dettagli && <p className="mt-0.5 text-xs text-muted-foreground">{dettagli}</p>}
    </div>
    <span className="shrink-0 text-xs font-semibold tabular-nums">{pct}%</span>
    {onEdit && <Button type="button" size="icon" variant="ghost" className="size-11 shrink-0 text-primary"
      aria-label={t("Aggiorna sottofase {nome}", { nome: sottofase.name })} onClick={onEdit}>
      <PencilLine className="size-4" aria-hidden="true" />
    </Button>}
  </li>;
}

/** Fine prevista passata e fase non conclusa. Collaudo 23/11: la scheda Fasi (la prima che si apre) non diceva
 * niente dei ritardi — su ORD-DEM-RIS01 6 fasi su 10 scadute da giugno–agosto — e la regola è che i ritardi si
 * vedono sempre, non solo nel cronoprogramma. */
export function faseInRitardo(fase: { status: string; end_date?: string | null }, oggi: string): string | null {
  const fine = planningDay(fase.end_date);
  return fase.status !== "completata" && fine && fine < oggi ? fine : null;
}

export function FasiSchedaCantiere({ fasi, orderId, onEdit }: {
  fasi: FaseSchedaCantiere[];
  orderId: string;
  onEdit?: (faseId: string, sottofaseId?: string) => void;
}) {
  const oggi = useCampoWorkDay();
  const t = useT();
  const [filtro, setFiltro] = useState("");
  const inRitardo = fasi.filter(fase => faseInRitardo(fase, oggi)).length;
  const visibili = fasi.filter(fase => !filtro || (filtro === "ritardo" ? !!faseInRitardo(fase, oggi) : fase.status === filtro));
  if (!fasi.length) return <p className="rounded-xl border bg-card p-3 text-sm text-muted-foreground">{t("Nessuna fase pianificata.")}</p>;
  return <div className="space-y-2">
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-muted-foreground">
        {t("{fatte} di {totale} concluse", { fatte: fasi.filter(f => f.status === "completata").length, totale: fasi.length })}
        {inRitardo > 0 && <span className="font-semibold text-red-700 dark:text-red-400"> · {t("{n} in ritardo", { n: inRitardo })}</span>}
      </span>
      <UniformSelect aria-label={t("Stato delle fasi")} className="min-h-11 bg-card" value={filtro} onChange={event => setFiltro(event.target.value)}>
        <option value="">{t("Tutte le fasi")}</option>
        {inRitardo > 0 && <option value="ritardo">{t("In ritardo")}</option>}
        {Object.entries(statoFase).map(([id, nome]) => <option key={id} value={id}>{t(nome)}</option>)}
      </UniformSelect>
    </div>
    {visibili.length === 0 && <p className="py-3 text-sm text-muted-foreground">{t("Nessuna fase in questo stato.")}</p>}
    {visibili.map(fase => {
      const pct = avanzamentoFase(fase);
      const completate = fase.sottofasi.filter(s => s.fatta).length;
      const ritardoDal = faseInRitardo(fase, oggi);
      return <div key={fase.id} className={cn("relative rounded-xl border bg-card", ritardoDal && "border-red-200 dark:border-red-900")}>
        <details className="group">
          <summary className={cn("flex min-h-14 cursor-pointer list-none items-center gap-2 p-3 [&::-webkit-details-marker]:hidden",
            onEdit && "pr-14")}>
            <span className="min-w-0 flex-1">
              <span className="block break-words text-sm font-semibold">{fase.name}</span>
              <span className="text-xs text-muted-foreground">{t(statoFase[fase.status])}{fase.sottofasi.length > 0 && ` · ${t("Sottofasi {fatte}/{totale}", { fatte: completate, totale: fase.sottofasi.length })}`}</span>
              {ritardoDal && <span className="block text-xs font-semibold text-red-700 dark:text-red-400">{testoRitardo(ritardoDal, t)}</span>}
            </span>
            <span className="shrink-0 text-sm font-semibold tabular-nums text-primary">{pct}%</span>
            <ChevronDown className="size-4 shrink-0 text-muted-foreground group-open:rotate-180" aria-hidden="true" />
          </summary>
          <div className="space-y-2 border-t px-3 pb-2 pt-2.5">
            <p className="text-xs font-medium text-muted-foreground">{periodo(t, fase.start_date, fase.end_date)}</p>
            {fase.note && <p className="whitespace-pre-wrap break-words text-sm">{fase.note}</p>}
            {fase.sottofasi.length > 0 && <ul className="divide-y" aria-label={t("Sottofasi di {fase}", { fase: fase.name })}>
              {fase.sottofasi.map(s => <SottofaseRiga key={s.id} sottofase={s}
                date={s.data_inizio || s.data_fine ? periodo(t, s.data_inizio, s.data_fine) : undefined}
                onEdit={onEdit && (() => onEdit(fase.id, s.id))} />)}
            </ul>}
            <div className="border-t"><AggiornamentiFaseCampo orderId={orderId} phaseId={fase.id} /></div>
          </div>
        </details>
        {onEdit && <Button type="button" size="icon" variant="ghost" className="absolute right-1 top-1.5 size-11 text-primary"
          aria-label={t("Aggiorna fase {nome}", { nome: fase.name })} onClick={() => onEdit(fase.id)}>
          <PencilLine className="size-[18px]" aria-hidden="true" />
        </Button>}
      </div>;
    })}
  </div>;
}

export function CronoprogrammaSchedaCantiere({ cantiere, fasi }: {
  cantiere: SchedaCantiere["cantiere"]; fasi: FaseSchedaCantiere[];
}) {
  const oggi = useCampoWorkDay();
  const { lavorativo } = useCalendarioCantiere();
  const t = useT();
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

  if (!fasi.length) return <p className="rounded-xl border bg-card p-3 text-sm text-muted-foreground">{t("Il cronoprogramma è disponibile quando l’ufficio inserisce le fasi.")}</p>;
  return <div className="space-y-2">
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-card px-3 py-2">
      <div className="min-w-0">
        <h2 className="text-sm font-semibold">{t("Date di cantiere")}</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">{periodo(t, cantiere.inizio, cantiere.fine)}</p>
      </div>
      <button type="button" aria-pressed={soloRitardi} onClick={() => setSoloRitardi(v => !v)}
        className="min-h-11 shrink-0 rounded-lg border px-2.5 text-xs font-medium aria-pressed:border-primary aria-pressed:bg-primary/10">{t("Solo ritardi")}</button>
    </div>
    {visibili.length === 0 && <p className="py-3 text-sm text-muted-foreground">{t("Nessuna fase in ritardo.")}</p>}
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
        <p className="text-xs"><span className="font-medium">{t("Previsto")}</span> · {fase.dateIncoerenti ? t("Date da verificare") : periodo(t, fase.previstoInizio, fase.previstoFine)}</p>
        {(fase.realeInizio || fase.realeFine) && <p className="text-xs text-muted-foreground">{t("Effettivo")} · {periodo(t, fase.realeInizio, fase.realeFine)}</p>}
        {ritardo && <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">
          {ritardo.su === "inizio"
            ? ritardo.giorni === 1 ? t("{n} giorno di ritardo sull’inizio", { n: ritardo.giorni }) : t("{n} giorni di ritardo sull’inizio", { n: ritardo.giorni })
            : ritardo.giorni === 1 ? t("{n} giorno di ritardo sulla fine", { n: ritardo.giorni }) : t("{n} giorni di ritardo sulla fine", { n: ritardo.giorni })}
        </p>}
        {sottofasi.length > 0 && <details className="group border-t">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 text-xs font-semibold [&::-webkit-details-marker]:hidden">
            {t("Sottofasi ({n})", { n: sottofasi.length })} <ChevronDown className="size-4 text-muted-foreground group-open:rotate-180" aria-hidden="true" />
          </summary>
          <ul className="divide-y" aria-label={t("Date sottofasi di {fase}", { fase: fase.nome })}>
            {sottofasi.map(s => {
              const prevista = dateSottofasi.get(s.id);
              const date = prevista ? [
                periodo(t, prevista.previstoInizio, prevista.previstoFine),
                prevista.stimata && t("Stima"),
                prevista.ritardo > 0 && t("+{n} gg", { n: prevista.ritardo }),
              ].filter(Boolean).join(" · ") : periodo(t, s.data_inizio, s.data_fine);
              return <SottofaseRiga key={s.id} sottofase={s} date={date} />;
            })}
          </ul>
        </details>}
      </section>;
    })}
  </div>;
}
