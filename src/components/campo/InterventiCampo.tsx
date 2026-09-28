/**
 * «Interventi» nell'app di cantiere (26/09/2026): assistenza e manutenzione
 * assegnate a me o alla mia squadra. Per ognuno: quando, dove (con «Portami
 * lì»), cosa fare (note) e il cliente — così so dove e cosa fare.
 */
import { format, parseISO, isToday, isTomorrow } from "date-fns";
import { it } from "date-fns/locale";
import { Wrench, Navigation, Phone, CalendarClock } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { linkMappa, linkTelefono } from "@/hooks/campo/useCampoGiornata";
import { useMieiInterventi, type InterventoCampo } from "@/hooks/campo/useMieiInterventi";

function quando(iso: string | null): string {
  if (!iso) return "Data da fissare";
  const d = parseISO(iso);
  const ora = format(d, "HH:mm");
  const giorno = isToday(d) ? "Oggi" : isTomorrow(d) ? "Domani" : format(d, "EEE d MMM", { locale: it });
  return ora === "00:00" ? giorno : `${giorno} · ${ora}`;
}

function Scheda({ i }: { i: InterventoCampo }) {
  const mappa = linkMappa(i.indirizzo);
  const tel = linkTelefono(i.telefono_cliente);
  const oggi = i.data ? isToday(parseISO(i.data)) : false;
  return (
    <div className={`rounded-2xl border p-3 ${oggi ? "border-orange-200 bg-orange-50/60 dark:border-orange-900 dark:bg-orange-950/30" : "bg-background"}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 font-semibold leading-tight">{i.titolo}</p>
        <span className="shrink-0 rounded-full border px-2 py-0.5 text-xs tabular-nums text-muted-foreground">{quando(i.data)}</span>
      </div>
      {i.cliente && <p className="mt-0.5 text-sm text-muted-foreground">{i.cliente}</p>}
      {i.squadra && i.da_squadra && <p className="text-xs text-muted-foreground">con {i.squadra}</p>}
      {i.indirizzo && <p className="mt-1 text-sm">{i.indirizzo}</p>}
      {i.note && <p className="mt-1 rounded-lg bg-muted/50 p-2 text-sm">{i.note}</p>}
      <div className="mt-2 flex flex-wrap gap-2">
        {mappa && (
          <a href={mappa} target="_blank" rel="noopener noreferrer"
             className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-blue-600 text-sm font-semibold text-white active:bg-blue-700">
            <Navigation className="h-4 w-4" aria-hidden="true" />Portami lì
          </a>
        )}
        {tel && (
          <a href={tel} aria-label={`Chiama ${i.cliente ?? "il cliente"}`}
             className="flex h-11 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-semibold active:bg-muted">
            <Phone className="h-4 w-4" aria-hidden="true" />Chiama
          </a>
        )}
      </div>
    </div>
  );
}

export function InterventiCampo() {
  const { data: interventi = [], isLoading } = useMieiInterventi(30);

  if (isLoading) return <Skeleton className="h-28 w-full rounded-2xl" />;
  if (interventi.length === 0) return null;

  return (
    <section aria-labelledby="campo-interventi" className="min-w-0 space-y-3 rounded-2xl border bg-background p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <CalendarClock className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <h2 id="campo-interventi" className="text-base font-semibold">
          <Wrench className="mr-1 inline h-4 w-4 align-[-2px]" aria-hidden="true" />Interventi da fare
        </h2>
        <span className="ml-auto rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">{interventi.length}</span>
      </div>
      <div className="space-y-2">
        {interventi.map((i) => <Scheda key={i.id} i={i} />)}
      </div>
    </section>
  );
}
