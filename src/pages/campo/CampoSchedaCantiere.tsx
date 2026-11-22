import { Link, useParams, useSearchParams } from "react-router-dom";
import { ChevronRight, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DocumentiSchedaCantiere } from "@/components/campo/DocumentiSchedaCantiere";
import { CronoprogrammaSchedaCantiere, FasiSchedaCantiere } from "@/components/campo/PianoSchedaCantiere";
import { useCantieriTecnici, useSchedaCantiere } from "@/hooks/campo/useSchedaCantiere";
import { percorsoCantiereTecnico, titoloCantiereTecnico, type AreaSchedaCantiere } from "@/lib/campo/schedaCantiere";
import { cn } from "@/lib/utils";

const tabs = [
  { id: "fasi", titolo: "Fasi" },
  { id: "cronoprogramma", titolo: "Cronoprogramma" },
  { id: "documenti", titolo: "Documenti" },
];

function StatoScheda({ messaggio, riprova }: { messaggio: string; riprova?: () => void }) {
  return <div role="alert" className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3 text-sm">
    <p className="min-w-0 flex-1">{messaggio}</p>
    {riprova && <Button type="button" variant="outline" className="min-h-11" onClick={riprova}>Riprova</Button>}
  </div>;
}

const classePagina = (area: AreaSchedaCantiere) => cn(
  "mx-auto w-full max-w-3xl space-y-3 pb-4 text-foreground",
  area === "tecnico" && "dark px-3 pt-3",
);

export function ElencoCantieriTecnici({ area }: { area: AreaSchedaCantiere }) {
  const query = useCantieriTecnici();
  const cantieri = query.data ?? [];
  return <div className={classePagina(area)}>
    <h1 className="text-xl font-bold">Cantieri da seguire</h1>
    {query.isError ? <StatoScheda messaggio="Non riesco a leggere i cantieri. Controlla la connessione."
      riprova={() => void query.refetch()} />
      : query.isPending ? <Skeleton className="h-24 rounded-xl" role="status" aria-label="Carico i cantieri" />
      : !cantieri.length ? <p className="rounded-xl border bg-card p-3 text-sm text-muted-foreground">Nessun cantiere assegnato per la consultazione.</p>
      : <ul className="divide-y rounded-xl border bg-card">
        {cantieri.map(cantiere => <li key={cantiere.id}>
          <Link to={percorsoCantiereTecnico(area, cantiere.id)} className="flex min-h-14 items-center gap-2 p-3">
            <div className="min-w-0 flex-1">
              <p className="break-words text-sm font-semibold">{titoloCantiereTecnico(cantiere)}</p>
              <p className="break-words text-xs text-muted-foreground">{[cantiere.codice, cantiere.indirizzo].filter(Boolean).join(" · ")}</p>
            </div>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </Link>
        </li>)}
      </ul>}
  </div>;
}

export default function CampoSchedaCantiere({ area }: { area: AreaSchedaCantiere }) {
  const { orderId } = useParams<{ orderId: string }>();
  const [params, setParams] = useSearchParams();
  const tab = tabs.some(t => t.id === params.get("tab")) ? params.get("tab")! : "fasi";
  const { query, cantiere } = useSchedaCantiere(orderId, tab === "documenti" ? "documenti" : "piano");
  const negato = !!query.error && "code" in query.error && query.error.code === "42501";
  const scheda = query.isError ? undefined : query.data;
  const avanzamento = typeof cantiere?.progresso === "number" ? Math.max(0, Math.min(100, Math.round(cantiere.progresso))) : null;

  return <div className={classePagina(area)}>
    {area === "tecnico" && <Link className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline"
      to={percorsoCantiereTecnico(area)}>Tutti i cantieri</Link>}
    <header className="rounded-xl border bg-card p-3">
      {cantiere?.codice && cantiere.codice !== titoloCantiereTecnico(cantiere) &&
        <p className="text-xs font-semibold text-muted-foreground">{cantiere.codice}</p>}
      <div className="flex items-start justify-between gap-2">
        <h1 className="min-w-0 break-words text-xl font-bold">{cantiere ? titoloCantiereTecnico(cantiere) : "Scheda cantiere"}</h1>
        {avanzamento !== null && <span className="shrink-0 rounded-lg bg-primary/10 px-2 py-1 text-sm font-semibold tabular-nums text-primary"
          aria-label={`Avanzamento cantiere ${avanzamento}%`}>{avanzamento}%</span>}
      </div>
      {cantiere?.indirizzo && <p className="mt-1 flex items-start gap-1.5 text-sm text-muted-foreground">
        <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" /><span className="break-words">{cantiere.indirizzo}</span>
      </p>}
    </header>
    {negato ? <StatoScheda messaggio="La scheda è disponibile per il capocantiere e per chi ha l’accesso assegnato." /> :
      <Tabs key={orderId} value={tab} onValueChange={id => {
        const prossimi = new URLSearchParams(params);
        prossimi.set("tab", id);
        setParams(prossimi, { replace: true });
      }}>
        <TabsList aria-label="Scheda cantiere" className="grid h-auto w-full grid-cols-[1fr_1.45fr_1fr] gap-1 p-1">
          {tabs.map(t => <TabsTrigger key={t.id} value={t.id} className="min-h-11 px-1 text-xs sm:text-sm">{t.titolo}</TabsTrigger>)}
        </TabsList>
        {tabs.map(t => <TabsContent key={t.id} value={t.id} className="mt-3">
          {query.isError ? <StatoScheda messaggio="Non riesco a caricare questa sezione."
            riprova={() => void query.refetch()} />
            : !scheda ? <Skeleton className="h-28 rounded-xl" role="status" aria-label="Carico la scheda" />
            : t.id === "documenti" ? <DocumentiSchedaCantiere documenti={scheda.documenti ?? []} />
            : t.id === "cronoprogramma" ? <CronoprogrammaSchedaCantiere cantiere={scheda.cantiere} fasi={scheda.fasi ?? []} />
            : <FasiSchedaCantiere fasi={scheda.fasi ?? []} />}
        </TabsContent>)}
      </Tabs>}
  </div>;
}
