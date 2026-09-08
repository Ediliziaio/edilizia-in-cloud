/**
 * La striscia di disponibilità: per la squadra scelta, in queste date, è
 * libera o è già da un'altra parte? Avvisa, non blocca — a volte la
 * sovrapposizione è voluta (mezza giornata qui, mezza là).
 *
 * Le date arrivano dal form, non da quelle salvate: cambiando giorno la
 * striscia cambia con te.
 */
import { useMemo } from "react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { CheckCircle2, AlertTriangle, HelpCircle, CalendarDays } from "lucide-react";
import { useSquadraImpegni } from "@/hooks/useSquadraImpegni";
import { intervalloCommessa, siSovrappongono } from "@/lib/calendar/sovrapposizione";

interface Props {
  team: { id: string; name: string; color?: string | null };
  date: { work_start_date: string | null; work_end_date: string | null; work_start_time: string | null; work_end_time: string | null };
  /** La commessa che si sta modificando: non conta come impegno di se stessa. */
  orderId: string | null;
}

function quando(i: { inizio: string; fine: string; tutto_il_giorno: boolean }): string {
  const a = new Date(i.inizio), b = new Date(i.fine);
  const stessoGiorno = format(a, "yyyy-MM-dd") === format(b, "yyyy-MM-dd");
  if (i.tutto_il_giorno) {
    return stessoGiorno ? format(a, "d MMM", { locale: it }) : `${format(a, "d MMM", { locale: it })} → ${format(b, "d MMM", { locale: it })}`;
  }
  return stessoGiorno
    ? `${format(a, "d MMM HH:mm", { locale: it })}–${format(b, "HH:mm")}`
    : `${format(a, "d MMM HH:mm", { locale: it })} → ${format(b, "d MMM HH:mm", { locale: it })}`;
}

export function DisponibilitaSquadra({ team, date, orderId }: Props) {
  const scelto = useMemo(() => intervalloCommessa(date), [date]);
  const dal = date.work_start_date;
  const al = date.work_end_date && date.work_end_date >= (date.work_start_date ?? "") ? date.work_end_date : date.work_start_date;
  const { data: impegni = [], isLoading, isError } = useSquadraImpegni(scelto ? team.id : null, dal, al, orderId);

  const sovrapposti = useMemo(() => {
    if (!scelto) return [];
    return impegni.filter((i) => siSovrappongono(scelto, { inizio: new Date(i.inizio), fine: new Date(i.fine) }));
  }, [impegni, scelto]);

  const pallino = <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: team.color ?? "#94a3b8" }} />;

  if (!scelto) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-dashed px-2 py-1.5 text-xs text-muted-foreground">
        {pallino}<span className="font-medium text-foreground">{team.name}</span>: scegli le date per vedere se è libera
      </div>
    );
  }
  if (isError) {
    return (
      <div className="flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs text-muted-foreground">
        <HelpCircle className="h-3.5 w-3.5 shrink-0" />{pallino}<span className="font-medium text-foreground">{team.name}</span>: disponibilità non verificabile
      </div>
    );
  }
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs text-muted-foreground">
        <CalendarDays className="h-3.5 w-3.5 shrink-0 animate-pulse" />{pallino}<span className="font-medium text-foreground">{team.name}</span>: controllo…
      </div>
    );
  }
  if (sovrapposti.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-xs text-emerald-800">
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />{pallino}<span className="font-medium">{team.name}</span>: libera in queste date
      </div>
    );
  }
  const mostrati = sovrapposti.slice(0, 3);
  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-900">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />{pallino}
        <span className="font-medium">{team.name}</span>: già impegnata — puoi confermare lo stesso
      </div>
      <ul className="mt-1 space-y-0.5 pl-5">
        {mostrati.map((i, idx) => (
          <li key={`${i.fonte}-${i.order_id ?? idx}-${i.inizio}`} className="truncate">
            {i.fonte === "google" ? "Google · " : ""}{i.titolo} <span className="text-amber-700">({quando(i)})</span>
          </li>
        ))}
        {sovrapposti.length > mostrati.length && <li className="text-amber-700">+{sovrapposti.length - mostrati.length} altri</li>}
      </ul>
    </div>
  );
}
