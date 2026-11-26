/**
 * Gli interventi brevi di un giorno (manutenzioni, assistenze), in ordine di orario (26/11/2026). Una scheda per
 * intervento: ora, cosa, cliente, dove, a che punto. Si tocca e si apre l'intervento. Senza interventi non c'è.
 */
import { Link } from "react-router-dom";
import { CheckCircle2, ChevronRight, Clock, MapPin, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/campo/lingua/LinguaCampo";
import { interventoFatto, interventoIniziato, oraRoma, useMieiInterventi } from "@/lib/campo/interventi";

export function InterventiDelGiorno({ giorno, titolo = true }: { giorno: string; titolo?: boolean }) {
  const t = useT();
  const { data = [] } = useMieiInterventi(giorno, giorno);
  if (!data.length) return null;
  const fatti = data.filter(interventoFatto).length;
  const prossimo = data.find(i => !interventoFatto(i));

  return (
    <section aria-labelledby={`interventi-${giorno}`} className="space-y-2">
      {titolo && (
        <h2 id={`interventi-${giorno}`} className="flex items-center gap-2 px-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">
          <Wrench className="size-4 text-primary" aria-hidden="true" />
          {t("Interventi")} · {t("{fatti} di {totale} fatti", { fatti, totale: data.length })}
        </h2>
      )}
      <ul className="space-y-2">
        {data.map(i => {
          const fatto = interventoFatto(i);
          const inCorso = !fatto && interventoIniziato(i);
          const evidenza = !fatto && i.id === prossimo?.id;
          return (
            <li key={i.id}>
              <Link to={`/campo/intervento/${i.id}`}
                className={cn("flex items-start gap-3 rounded-2xl border bg-background p-3 active:bg-muted",
                  evidenza && "border-primary/50 shadow-sm", fatto && "opacity-70")}>
                <span className={cn("flex w-12 shrink-0 flex-col items-center rounded-xl py-1.5 text-center",
                  fatto ? "bg-emerald-50 text-emerald-800" : inCorso ? "bg-blue-50 text-blue-800" : "bg-muted")}>
                  {fatto ? <CheckCircle2 className="size-5" aria-hidden="true" /> : <Clock className="size-4" aria-hidden="true" />}
                  <span className="mt-0.5 text-[13px] font-bold tabular-nums">{oraRoma(i.quando)}</span>
                </span>
                <span className="min-w-0 flex-1">
                  <span dir="auto" className={cn("block text-sm font-semibold leading-snug", fatto && "line-through decoration-1")}>{i.titolo ?? t("Intervento")}</span>
                  {i.cliente?.nome && <span dir="auto" className="block truncate text-xs text-muted-foreground">{i.cliente.nome}</span>}
                  {i.indirizzo && <span className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="size-3 shrink-0" aria-hidden="true" /><span className="truncate">{i.indirizzo}</span></span>}
                  <span className={cn("mt-1 inline-block text-[11px] font-semibold", fatto ? "text-emerald-700" : inCorso ? "text-blue-700" : evidenza ? "text-primary" : "text-muted-foreground")}>
                    {fatto ? t("Fatto") : inCorso ? t("In corso") : evidenza ? t("Il prossimo") : t("Da fare")}
                  </span>
                </span>
                <ChevronRight className="mt-1 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
