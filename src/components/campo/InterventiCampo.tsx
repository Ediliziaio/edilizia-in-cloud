/**
 * «Interventi» nell'app di cantiere (26/09/2026): assistenza e manutenzione
 * assegnate a me o alla mia squadra. Per ognuno: quando, dove (con «Portami
 * lì»), cosa fare (note) e il cliente — così so dove e cosa fare.
 */
import { format, parseISO, isToday, isTomorrow } from "date-fns";
import { Link } from "react-router-dom";
import { Wrench, Navigation, Phone, CalendarClock } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { linkMappa, linkTelefono } from "@/hooks/campo/useCampoGiornata";
import { useMieiInterventi, type InterventoCampo } from "@/hooks/campo/useMieiInterventi";
import { dateFnsCampo, useT } from "@/lib/campo/lingua/LinguaCampo";

function quando(iso: string | null, t: ReturnType<typeof useT>): string {
  if (!iso) return t("Data da fissare");
  const d = parseISO(iso);
  const ora = format(d, "HH:mm");
  const giorno = isToday(d) ? t("Oggi") : isTomorrow(d) ? t("Domani") : format(d, "EEE d MMM", { locale: dateFnsCampo() });
  return ora === "00:00" ? giorno : `${giorno} · ${ora}`;
}

function Scheda({ i }: { i: InterventoCampo }) {
  const t = useT();
  const mappa = linkMappa(i.indirizzo);
  const tel = linkTelefono(i.telefono_cliente);
  const oggi = i.data ? isToday(parseISO(i.data)) : false;
  return (
    <div className={`rounded-2xl border p-3 ${oggi ? "border-orange-200 bg-orange-50/60 dark:border-orange-900 dark:bg-orange-950/30" : "bg-background"}`}>
      <div className="flex items-start justify-between gap-2">
        {/* Si apre l'intervento: cosa fare, inizio, foto, firma, fine (26/11/2026). */}
        <Link to={`/campo/intervento/${i.id}`} className="min-w-0 font-semibold leading-tight text-primary underline-offset-2 hover:underline">{i.titolo}</Link>
        <span className="shrink-0 rounded-full border px-2 py-0.5 text-xs tabular-nums text-muted-foreground">{quando(i.data, t)}</span>
      </div>
      {i.cliente && <p className="mt-0.5 text-sm text-muted-foreground">{i.cliente}</p>}
      {i.squadra && i.da_squadra && <p className="text-xs text-muted-foreground">{t("con {squadra}", { squadra: i.squadra })}</p>}
      {i.indirizzo && <p className="mt-1 text-sm">{i.indirizzo}</p>}
      {i.note && <p className="mt-1 rounded-lg bg-muted/50 p-2 text-sm">{i.note}</p>}
      <div className="mt-2 flex flex-wrap gap-2">
        {mappa && (
          <a href={mappa} target="_blank" rel="noopener noreferrer"
             className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-blue-600 text-sm font-semibold text-white active:bg-blue-700">
            <Navigation className="h-4 w-4" aria-hidden="true" />{t("Portami lì")}
          </a>
        )}
        {tel && (
          <a href={tel} aria-label={i.cliente ? t("Chiama {nome}", { nome: i.cliente }) : t("Chiama il cliente")}
             className="flex h-11 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-semibold active:bg-muted">
            <Phone className="h-4 w-4" aria-hidden="true" />{t("Chiama")}
          </a>
        )}
      </div>
    </div>
  );
}

export function InterventiCampo() {
  const t = useT();
  const { data: tutti = [], isLoading } = useMieiInterventi(30);
  // Quelli di oggi sono già in cima alla Home, con inizio e fine (InterventiDelGiorno): qui i prossimi giorni.
  const interventi = tutti.filter(i => !i.data || !isToday(parseISO(i.data)));

  if (isLoading) return <Skeleton className="h-28 w-full rounded-2xl" />;
  if (interventi.length === 0) return null;

  return (
    <section aria-labelledby="campo-interventi" className="min-w-0 space-y-3 rounded-2xl border bg-background p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <CalendarClock className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <h2 id="campo-interventi" className="text-base font-semibold">
          <Wrench className="mr-1 inline h-4 w-4 align-[-2px]" aria-hidden="true" />{t("Prossimi interventi")}
        </h2>
        <span className="ml-auto rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">{interventi.length}</span>
      </div>
      <div className="space-y-2">
        {interventi.map((i) => <Scheda key={i.id} i={i} />)}
      </div>
    </section>
  );
}
