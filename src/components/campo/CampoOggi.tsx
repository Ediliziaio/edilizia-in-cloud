/**
 * «Oggi» in cima all'app di cantiere (26/09/2026): dove vai, cosa fai, con chi
 * e chi chiamare. Le date sono le TUE (seguono le fasi e la squadra), non
 * quelle di tutta la commessa. Sotto, il prossimo giorno di lavoro.
 */
import { Link } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { Navigation, Phone, Users } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  linkMappa, linkTelefono, useMiaGiornata,
  type CantiereDelGiorno, type Contatto,
} from "@/hooks/campo/useCampoGiornata";

const giornoLungo = (g: string) => format(parseISO(g), "EEEE d MMMM", { locale: it });

function Chiama({ ruolo, contatto }: { ruolo: string; contatto: Contatto }) {
  const tel = linkTelefono(contatto.telefono);
  return (
    <div className="flex items-center justify-between gap-2">
      <p className="min-w-0 text-sm">
        <span className="text-muted-foreground">{ruolo}: </span>
        <span className="font-semibold">{contatto.nome}</span>
      </p>
      {tel && (
        <a
          href={tel}
          className="flex h-9 shrink-0 items-center gap-1.5 rounded-xl border bg-background px-3 text-xs font-semibold text-foreground active:bg-muted"
          aria-label={`Chiama ${contatto.nome}`}
        >
          <Phone className="h-3.5 w-3.5" aria-hidden="true" />Chiama
        </a>
      )}
    </div>
  );
}

function SchedaCantiere({ c }: { c: CantiereDelGiorno }) {
  const mappa = linkMappa(c.indirizzo);
  const vedeSquadra = c.sono_capocantiere || !!c.squadra?.sono_caposquadra;
  return (
    <div className="space-y-3 rounded-2xl border bg-background p-3">
      <div className="min-w-0">
        <p className="text-base font-bold leading-tight">{c.titolo || c.codice || "Cantiere"}</p>
        {c.indirizzo && <p className="mt-0.5 text-sm text-muted-foreground">{c.indirizzo}</p>}
      </div>

      {(c.fasi.length > 0 || c.squadra) && (
        <div className="space-y-1 text-sm">
          {c.fasi.length > 0 && (
            <p><span className="text-muted-foreground">Fai: </span><span className="font-semibold">{c.fasi.join(", ")}</span></p>
          )}
          {c.squadra && (
            <p className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: c.squadra.colore ?? "#94a3b8" }} aria-hidden="true" />
              <span className="font-semibold">{c.squadra.nome}</span>
              {c.squadra.sono_caposquadra && <span className="text-muted-foreground">· sei il caposquadra</span>}
            </p>
          )}
        </div>
      )}

      <div className="space-y-2">
        {c.squadra?.caposquadra && <Chiama ruolo="Caposquadra" contatto={c.squadra.caposquadra} />}
        {c.sono_capocantiere
          ? <p className="text-sm font-semibold text-primary">Il capocantiere sei tu</p>
          : c.capocantiere && <Chiama ruolo="Capocantiere" contatto={c.capocantiere} />}
      </div>

      <div className={cn("grid gap-2", mappa ? "grid-cols-2" : "grid-cols-1")}>
        {mappa && (
          <a
            href={mappa}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 text-sm font-semibold text-white active:bg-blue-700"
          >
            <Navigation className="h-4 w-4" aria-hidden="true" />Portami lì
          </a>
        )}
        <Link
          to={`/campo/lavoro/${c.order_id}`}
          className="flex h-11 items-center justify-center rounded-xl border text-sm font-semibold active:bg-muted"
        >
          Apri il cantiere
        </Link>
      </div>
      {vedeSquadra && (
        <Link
          to={`/campo/squadra/${c.order_id}`}
          className="flex h-10 items-center justify-center gap-2 rounded-xl bg-orange-50 text-sm font-semibold text-orange-800 active:bg-orange-100"
        >
          <Users className="h-4 w-4" aria-hidden="true" />Chi c'è oggi
        </Link>
      )}
    </div>
  );
}

export function CampoOggi() {
  const { data, isLoading, isError, refetch } = useMiaGiornata(14);

  if (isLoading) return <Skeleton className="h-40 w-full rounded-2xl" />;
  if (isError) {
    return (
      <section className="rounded-2xl border bg-background p-4 text-sm">
        Non riesco a leggere dove lavori oggi.{" "}
        <button type="button" className="font-semibold text-primary underline" onClick={() => refetch()}>Riprova</button>
      </section>
    );
  }

  const giorni = data?.giorni ?? [];
  const oggi = giorni[0];
  const prossimo = giorni.slice(1).find((g) => g.cantieri.length > 0);
  // Senza nessun cantiere con le date, il riquadro non serve: resta l'elenco dei cantieri.
  if (!oggi || (oggi.cantieri.length === 0 && !prossimo)) return null;

  return (
    <section aria-labelledby="campo-oggi" className="space-y-3 rounded-2xl border border-blue-100 bg-blue-50/50 p-3 shadow-sm md:p-4">
      <div>
        <h2 id="campo-oggi" className="text-base font-bold">Oggi</h2>
        <p className="text-xs capitalize text-muted-foreground">{giornoLungo(oggi.giorno)}</p>
      </div>

      {oggi.cantieri.length === 0 ? (
        <p className="rounded-2xl border bg-background p-3 text-sm">Oggi non hai cantieri in programma.</p>
      ) : (
        oggi.cantieri.map((c) => <SchedaCantiere key={c.order_id} c={c} />)
      )}

      {prossimo && (
        <div className="rounded-2xl bg-background/70 px-3 py-2 text-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {prossimo === giorni[1] ? "Domani" : <span className="capitalize">{giornoLungo(prossimo.giorno)}</span>}
          </p>
          {prossimo.cantieri.map((c) => (
            <Link key={c.order_id} to={`/campo/lavoro/${c.order_id}`} className="mt-1 block">
              <span className="font-semibold">{c.titolo || c.codice || "Cantiere"}</span>
              {c.fasi.length > 0 && <span className="text-muted-foreground"> · {c.fasi.join(", ")}</span>}
              {c.indirizzo && <span className="block truncate text-xs text-muted-foreground">{c.indirizzo}</span>}
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
