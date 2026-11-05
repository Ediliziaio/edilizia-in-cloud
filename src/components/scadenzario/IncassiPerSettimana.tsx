/**
 * Scadenzario → «Per settimana»: quanto si deve incassare ogni settimana, dalle fatture e dalle rate
 * delle commesse non ancora fatturate. I numeri vengono dalla previsione di cassa.
 */
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useForecastLedger } from "@/hooks/useForecastLedger";
import { formatCurrency, formatDateShort } from "@/lib/formatters";
import { incassiPerSettimana, type GruppoIncassi } from "@/lib/finance/incassiSettimanali";

const euro = (cents: number) => formatCurrency(cents / 100);

function Gruppo({ titolo, gruppo, sotto, tono, aperto }: {
  titolo: string;
  gruppo: GruppoIncassi;
  sotto?: string;
  tono?: "rosso" | "attenua";
  aperto?: boolean;
}) {
  const vuoto = gruppo.righe.length === 0;
  const dettaglio = sotto ?? [
    gruppo.fattureCents > 0 ? `Già fatturato ${euro(gruppo.fattureCents)}` : null,
    gruppo.rateCents > 0 ? `Rate non fatturate ${euro(gruppo.rateCents)}` : null,
  ].filter(Boolean).join(" · ");
  return (
    <details open={aperto && !vuoto} className="group rounded-lg border bg-card">
      <summary className={`flex list-none flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 ${vuoto ? "" : "cursor-pointer"} [&::-webkit-details-marker]:hidden`}>
        {!vuoto && <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />}
        <span className={`font-medium ${tono === "rosso" ? "text-rose-700 dark:text-rose-400" : ""}`}>{titolo}</span>
        {!vuoto && <span className="text-xs text-muted-foreground">{gruppo.righe.length} {gruppo.righe.length === 1 ? "incasso" : "incassi"}</span>}
        <span className={`ml-auto font-semibold tabular-nums ${tono === "rosso" ? "text-rose-700 dark:text-rose-400" : tono === "attenua" || vuoto ? "text-muted-foreground" : ""}`}>{euro(gruppo.cents)}</span>
        {dettaglio && <span className="w-full text-xs text-muted-foreground">{dettaglio}</span>}
      </summary>
      {!vuoto && (
        <ul className="divide-y border-t text-sm">
          {gruppo.righe.map((m) => (
            <li key={m.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-4 py-2">
              <span className="w-20 shrink-0 tabular-nums text-muted-foreground">{m.date ? formatDateShort(m.date) : "Senza data"}</span>
              <Link to={m.href} className="min-w-0 flex-1 truncate underline-offset-2 hover:underline" title={m.note}>{m.description}</Link>
              <span className="text-xs text-muted-foreground">{m.rataFatturata ? "Rata fatturata" : m.source}{m.orderLabel ? ` · ${m.orderLabel}` : ""}</span>
              <span className="font-medium tabular-nums">{euro(m.cents)}</span>
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}

function Numero({ titolo, cents, rosso }: { titolo: string; cents: number; rosso?: boolean }) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2.5">
      <p className="text-xs text-muted-foreground">{titolo}</p>
      <p className={`mt-0.5 text-lg font-bold tabular-nums ${rosso ? "text-rose-700 dark:text-rose-400" : ""}`}>{euro(cents)}</p>
    </div>
  );
}

/** Con `cerca` si guardano solo gli incassi di quel cliente, fattura o commessa: anche i totali. */
export function IncassiPerSettimanaVista({ cerca = "" }: { cerca?: string }) {
  const query = useForecastLedger();
  const oggi = new Date().toLocaleDateString("en-CA");
  const dati = useMemo(() => {
    if (!query.data) return null;
    const q = cerca.trim().toLowerCase();
    const movimenti = !q ? query.data.movements : query.data.movements.filter((m) =>
      [m.description, m.counterparty, m.orderLabel].some((t) => t?.toLowerCase().includes(q)));
    return incassiPerSettimana(movimenti, oggi);
  }, [query.data, oggi, cerca]);

  if (query.isPending) return <Skeleton className="h-64 rounded-lg" />;
  if (query.isError || !dati) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-8 text-center">
        <p className="text-sm text-muted-foreground">Non sono riuscito a leggere gli incassi previsti.</p>
        <Button variant="outline" size="sm" onClick={() => void query.refetch()}>Riprova</Button>
      </div>
    );
  }

  const [corrente, ...prossime] = dati.settimane;
  // Solo se una fonte non si è caricata: le note normali della previsione qui non dicono niente.
  const mancanti = query.data?.issues ?? [];
  return (
    <div className="space-y-3">
      {mancanti.length > 0 && (
        <p role="status" className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          Non si sono caricati: {mancanti.join(", ")}. I totali potrebbero essere incompleti.
        </p>
      )}
      {/* Gli stessi numeri dell'elenco: fatture, rate e scadenze, di tutti gli anni. */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
        <Numero titolo="Scaduto da incassare" cents={dati.scaduto.cents} rosso={dati.scaduto.cents > 0} />
        <Numero titolo="Questa settimana" cents={corrente.cents} />
        <div className="max-sm:col-span-2"><Numero titolo="Prossimi 30 giorni" cents={dati.prossimi30Cents} /></div>
      </div>
      {dati.scaduto.righe.length > 0 && <Gruppo titolo="Scaduto, ancora da incassare" gruppo={dati.scaduto} tono="rosso" />}
      <Gruppo titolo={`Questa settimana · fino al ${formatDateShort(corrente.fine)}`} gruppo={corrente} aperto />
      {prossime.map((s) => <Gruppo key={s.inizio} titolo={`${formatDateShort(s.inizio)} – ${formatDateShort(s.fine)}`} gruppo={s} />)}
      {dati.piuAvanti.righe.length > 0 && <Gruppo titolo="Più avanti" gruppo={dati.piuAvanti} />}
      {dati.senzaData.righe.length > 0 && (
        <Gruppo titolo="Senza data" gruppo={dati.senzaData} tono="attenua" sotto="Rate legate a un evento non ancora accaduto, rate senza data e parti di commessa senza una rata pianificata." />
      )}
      {dati.daControllare.righe.length > 0 && (
        <Gruppo titolo="Da controllare, fuori dai totali" gruppo={dati.daControllare} tono="attenua" sotto="Potrebbero essere già comprese nelle rate della stessa commessa: collegale alla rata." />
      )}
    </div>
  );
}
