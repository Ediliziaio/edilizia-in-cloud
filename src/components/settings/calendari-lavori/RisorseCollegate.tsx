import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  CalendarDays,
  HardHat,
  Truck,
  Users,
} from "lucide-react";
import { useSchedeManodopera } from "@/hooks/useSchedeManodopera";
import { Button } from "@/components/ui/button";
import { SQUADRE_OPERAI } from "@/lib/manodopera/collegamentiSquadre";

export function RisorseCollegate({
  vedeCalendario,
  vedeCommesse,
  compact = false,
}: {
  vedeCalendario: boolean;
  vedeCommesse: boolean;
  compact?: boolean;
}) {
  const { schede, inCaricamento } = useSchedeManodopera();
  const collegamenti = [
    {
      tab: "operai",
      titolo: "Operai e squadre interne",
      testo: "Componenti, responsabile e commesse della squadra.",
      to: SQUADRE_OPERAI,
      Icona: Users,
    },
    {
      tab: "subappaltatori",
      titolo: "Ditte e accessi cantiere",
      testo: "Anagrafiche dei subappaltatori e accesso alla loro app.",
      to: "/azienda/manodopera?tab=subappaltatori",
      Icona: HardHat,
    },
    {
      tab: "mezzi",
      titolo: "Mezzi e attrezzature",
      testo: "Schede dei mezzi, disponibilità e assegnazioni.",
      to: "/azienda/manodopera?tab=mezzi",
      Icona: Truck,
    },
  ].filter((c) => schede.includes(c.tab as (typeof schede)[number]));
  return (
    <section
      aria-label="Collegamenti con la gestione dei lavori"
      className="space-y-3 rounded-xl border bg-card p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-3xl">
          <h2 className="text-base font-semibold">
            Dalle risorse al calendario
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Le squadre interne sono le stesse di Manodopera e Mezzi. Qui
            colleghi i loro calendari Google e quelli delle squadre esterne di
            posa.
          </p>
        </div>
        {vedeCalendario && (
          <Button asChild variant="outline" size="sm">
            <Link to="/azienda/calendario">
              <CalendarDays className="mr-2 h-4 w-4" />
              Apri calendario lavori
            </Link>
          </Button>
        )}
      </div>
      {!inCaricamento && collegamenti.length > 0 && (
        <nav
          aria-label="Gestisci le risorse"
          className={compact ? "grid gap-2" : "grid gap-2 md:grid-cols-3"}
        >
          {collegamenti.map(({ titolo, testo, to, Icona }) => (
            <Link
              key={to}
              to={to}
              className="group flex min-w-0 items-start gap-3 rounded-lg border bg-background p-3 transition hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Icona
                className="mt-0.5 h-4 w-4 shrink-0 text-primary"
                aria-hidden
              />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{titolo}</span>
                <span className="mt-1 hidden text-xs text-muted-foreground sm:block">
                  {testo}
                </span>
              </span>
              <ArrowUpRight
                className="h-4 w-4 shrink-0 text-muted-foreground"
                aria-hidden
              />
            </Link>
          ))}
        </nav>
      )}
      <p className="text-xs leading-relaxed text-muted-foreground">
        Componi le squadre nella gestione operai, poi assegna squadre e mezzi ai
        lavori della commessa. Il collegamento Google è facoltativo e non
        assegna persone o mezzi.{" "}
        {vedeCommesse && (
          <Link
            to="/azienda/ordini"
            className="font-medium text-primary underline"
          >
            Apri le commesse
          </Link>
        )}
      </p>
      <p className="rounded-lg border border-dashed bg-muted/20 px-3 py-2 text-xs leading-relaxed text-muted-foreground"><strong className="text-foreground">Ambito dell’invio a Google.</strong> I calendari collegati ricevono le pose programmate con le date della commessa. Le assegnazioni operative di «Lavori e squadre» restano nel calendario EiC e non vengono inviate automaticamente a Google.</p>
      <details className="border-t pt-3">
        <summary className="cursor-pointer text-sm font-medium">
          Come si collegano squadre, mezzi e Google
        </summary>
        <div className="mt-3 grid gap-3 text-xs leading-relaxed text-muted-foreground sm:grid-cols-2">
          <p>
            <strong className="text-foreground">Squadre interne.</strong> Nome,
            colore e squadra sono condivisi con Operai → Squadre. Componenti e
            responsabile si gestiscono lì; qui scegli il calendario della stessa
            squadra.
          </p>
          <p>
            <strong className="text-foreground">Ditte esterne.</strong> La
            squadra di posa può essere collegata a un subappaltatore.
            L’anagrafica e il suo accesso all’app cantiere si gestiscono in
            Manodopera e Mezzi → Subappaltatori.
          </p>
          <p>
            <strong className="text-foreground">Mezzi.</strong> Schede,
            disponibilità e assegnazioni si gestiscono in Manodopera e Mezzi e
            nella commessa. Il collegamento Google non prenota né assegna mezzi.
          </p>
          <p>
            <strong className="text-foreground">Giornate e presenze.</strong> La composizione della squadra e le assegnazioni danno accesso ai cantieri nell’app. Presenze, timbrature e rapportini si raccolgono nel lavoro quotidiano; il collegamento Google segue la pianificazione delle pose.
          </p>
        </div>
      </details>
    </section>
  );
}
