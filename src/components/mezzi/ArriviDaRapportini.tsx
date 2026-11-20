import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CarFront, ChevronDown, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useArriviDaRapportini, useCollegaArrivoRapportino } from "@/hooks/useMezziViaggi";
import { formatData } from "@/types/mezzi";
import type { ArrivoDaRapportino } from "@/lib/campo/arrivoRapportino";

const orario = new Intl.DateTimeFormat("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" });

function ArrivoRiga({ arrivo, readOnly, onCompleta, onCollega, occupato }: {
  arrivo: ArrivoDaRapportino;
  readOnly: boolean;
  onCompleta: () => void;
  onCollega: (viaggioId: string) => void;
  occupato: boolean;
}) {
  const [collega, setCollega] = useState(false);
  const dettaglio = `/azienda/mezzi/${arrivo.mezzoId}?tab=viaggi&giorno=${arrivo.giorno}`;
  return <li className="space-y-2 px-3 py-3">
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
      <div className="flex min-w-0 flex-1 basis-52 items-start gap-2.5">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><CarFront className="size-4" aria-hidden="true" /></span>
        <div className="min-w-0">
          <p className="break-words text-sm font-semibold">{arrivo.nomeMezzo} <span className="ml-1 font-normal tabular-nums text-muted-foreground">{formatData(arrivo.giorno)}</span></p>
          <p className="mt-0.5 break-words text-xs text-muted-foreground">
            {arrivo.partenza ? `Da ${arrivo.partenza} · ` : ""}
            {arrivo.km == null ? "Km da completare" : `${arrivo.km.toLocaleString("it-IT")} km dichiarati`} · {arrivo.rapportini === 1 ? "1 rapportino" : `${arrivo.rapportini} rapportini`}
          </p>
        </div>
      </div>
      {arrivo.viaggioId ? <Button asChild variant="outline" size="sm" className="ml-auto"><Link to={dettaglio}>{arrivo.viaggioStato === "bozza" ? "Apri bozza" : "Apri viaggio"}</Link></Button>
        : !readOnly && (!arrivo.richiedeCollegamento || arrivo.viaggiCompatibili.length > 0) && <Button type="button" variant="outline" size="sm" className="ml-auto text-primary"
          aria-expanded={arrivo.viaggiCompatibili.length ? collega : undefined} onClick={arrivo.viaggiCompatibili.length ? () => setCollega(v => !v) : onCompleta}>
          {arrivo.viaggiCompatibili.length ? "Confronta viaggi" : "Completa viaggio"}
          <ArrowRight className="size-3.5" aria-hidden="true" />
        </Button>}
    </div>
    {arrivo.datiDiscordanti && <p className="rounded-md bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">I rapportini indicano dati diversi. Verifica il tragitto prima di completarlo.</p>}
    {arrivo.richiedeCollegamento && !arrivo.viaggiCompatibili.length && <p className="text-xs text-muted-foreground">Per completare questo arrivo, registra un viaggio nella stessa data e collegalo qui.</p>}
    {collega && !arrivo.viaggioId && <div className="space-y-2 rounded-lg bg-muted/50 p-2.5 text-xs">
      <p>Ci sono viaggi dello stesso mezzo in questa data. Collega quello che corrisponde all’arrivo.</p>
      {arrivo.viaggiCompatibili.map(v => <div key={v.id} className="flex flex-wrap items-center justify-between gap-2">
        <Link to={dettaglio} className="underline underline-offset-2">Dalle {orario.format(new Date(v.partenza))} alle {orario.format(new Date(v.arrivo))}</Link>
        <Button type="button" variant="outline" size="sm" disabled={occupato} onClick={() => onCollega(v.id)}><Link2 className="mr-1 h-3.5 w-3.5" />Collega questo viaggio</Button>
      </div>)}
      {!arrivo.richiedeCollegamento && <Button type="button" variant="ghost" size="sm" onClick={onCompleta}>È un altro viaggio</Button>}
    </div>}
  </li>;
}

export function ArriviDaRapportini({ companyId, orderId, dal, al, readOnly, onCompleta }: {
  companyId: string; orderId: string; dal: string; al: string; readOnly: boolean; onCompleta: (arrivo: ArrivoDaRapportino) => void;
}) {
  const [offset, setOffset] = useState(0);
  const query = useArriviDaRapportini({ companyId, orderId, dal, al, offset, enabled: true });
  const collega = useCollegaArrivoRapportino(companyId, orderId);
  const arrivi = query.data?.items ?? [];
  const daCompletare = arrivi.filter(a => !a.viaggioId);
  const collegati = arrivi.filter(a => a.viaggioId);
  const renderArrivo = (arrivo: ArrivoDaRapportino) => <ArrivoRiga key={arrivo.id} arrivo={arrivo} readOnly={readOnly} occupato={collega.isPending}
    onCompleta={() => onCompleta(arrivo)} onCollega={viaggioId => collega.mutate({ arrivo, viaggioId })} />;
  return <section className="rounded-xl border bg-background" aria-label="Arrivi dai rapportini">
    <header className="flex flex-wrap items-center justify-between gap-2 rounded-t-xl border-b bg-muted/30 px-3 py-2.5">
      <h4 className="flex items-center gap-2 text-sm font-semibold"><CarFront className="size-4 text-primary" aria-hidden="true" />Arrivi dai rapportini</h4>
      {query.isSuccess && daCompletare.length > 0 && <Badge variant="outline" className="rounded-md border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
        {daCompletare.length} da completare{(offset > 0 || query.data?.has_more) && " in questa pagina"}
      </Badge>}
    </header>
    {query.isPending && <p role="status" className="p-3 text-sm text-muted-foreground">Carico gli arrivi…</p>}
    {query.isError && <p role="alert" className="p-3 text-sm text-amber-900 dark:text-amber-200">{query.error.message}
      {query.error.cause !== "PGRST202" && <> <button type="button" className="underline" onClick={() => void query.refetch()}>Riprova</button></>}
    </p>}
    {collega.isError && <p role="alert" className="p-3 text-sm text-destructive">{collega.error.message}</p>}
    {query.isSuccess && <>
      {daCompletare.length > 0 ? <ul className="divide-y" aria-label="Arrivi da completare">{daCompletare.map(renderArrivo)}</ul>
        : <p className="p-3 text-sm text-muted-foreground">{arrivi.length ? "Tutti gli arrivi di questa pagina sono collegati." : "Nessun arrivo dichiarato nei rapportini del periodo."}</p>}
      {collegati.length > 0 && <details className="group/collegati border-t">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
          Arrivi collegati · {collegati.length}<ChevronDown className="size-4 group-open/collegati:rotate-180" aria-hidden="true" />
        </summary>
        <ul className="divide-y border-t">{collegati.map(renderArrivo)}</ul>
      </details>}
    </>}
    {(offset > 0 || query.data?.has_more) && <div className="flex justify-between gap-2 border-t p-2">
      <Button type="button" variant="outline" size="sm" disabled={!offset || query.isFetching} onClick={() => setOffset(v => Math.max(0, v - 50))}>Precedenti</Button>
      <Button type="button" variant="outline" size="sm" disabled={!query.data?.has_more || query.isFetching} onClick={() => setOffset(v => v + 50)}>Successivi</Button>
    </div>}
  </section>;
}
