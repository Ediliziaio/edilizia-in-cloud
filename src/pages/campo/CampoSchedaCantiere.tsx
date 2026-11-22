import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ChevronRight, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DocumentiSchedaCantiere } from "@/components/campo/DocumentiSchedaCantiere";
import { CronoprogrammaSchedaCantiere, FasiSchedaCantiere } from "@/components/campo/PianoSchedaCantiere";
import { ModificaAvanzamentoCampo } from "@/components/campo/ModificaAvanzamentoCampo";
import { RilieviSchedaCantiere } from "@/components/campo/RilieviSchedaCantiere";
import { useCantieriTecnici, useSchedaCantiere } from "@/hooks/campo/useSchedaCantiere";
import { percorsoCantiereTecnico, titoloCantiereTecnico, type SchedaCantiere } from "@/lib/campo/schedaCantiere";
import { destinazioneAvanzamento } from "@/lib/campo/bozzaTecnica";
import { cn } from "@/lib/utils";

const tabs = [
  { id: "fasi", titolo: "Fasi" },
  { id: "cronoprogramma", titolo: "Cronoprogramma" },
  { id: "documenti", titolo: "Documenti" },
];
const classePagina = "mx-auto w-full max-w-3xl space-y-3 pb-4 text-foreground";

function StatoScheda({ messaggio, riprova }: { messaggio: string; riprova?: () => void }) {
  return <div role="alert" className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3 text-sm">
    <p className="min-w-0 flex-1">{messaggio}</p>
    {riprova && <Button type="button" variant="outline" className="min-h-11" onClick={riprova}>Riprova</Button>}
  </div>;
}

export function ElencoCantieriTecnici() {
  const query = useCantieriTecnici();
  const cantieri = query.data ?? [];
  return <div className={classePagina}>
    <h1 className="text-xl font-bold">Cantieri da seguire</h1>
    {query.isError ? <StatoScheda messaggio="Non riesco a leggere i cantieri. Controlla la connessione."
      riprova={() => void query.refetch()} />
      : query.isPending ? <Skeleton className="h-24 rounded-xl" role="status" aria-label="Carico i cantieri" />
      : !cantieri.length ? <p className="rounded-xl border bg-card p-3 text-sm text-muted-foreground">Non hai cantieri da seguire.</p>
      : <ul className="divide-y rounded-xl border bg-card">
        {cantieri.map(cantiere => <li key={cantiere.id}>
          <Link to={percorsoCantiereTecnico(cantiere.id)} className="flex min-h-14 items-center gap-2 p-3">
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

function FasiOperative({ scheda, companyId, userId }: {
  scheda: SchedaCantiere; companyId?: string | null; userId?: string;
}) {
  const [attiva, setAttiva] = useState<{ faseId: string; sottofaseId?: string } | null>(null);
  const { cantiere, permessi, fasi = [] } = scheda;
  const puoModificare = permessi?.aggiorna_fasi === true && !!companyId && !!userId;
  const target = attiva && destinazioneAvanzamento(scheda, attiva.faseId, attiva.sottofaseId);
  return <>
    <FasiSchedaCantiere fasi={fasi} orderId={cantiere.id}
      onEdit={puoModificare ? (faseId, sottofaseId) => setAttiva({ faseId, sottofaseId }) : undefined} />
    {puoModificare && companyId && userId && target &&
      <ModificaAvanzamentoCampo key={target.sottofaseId ?? target.faseId} orderId={cantiere.id} companyId={companyId} userId={userId}
        cantiere={titoloCantiereTecnico(cantiere)} target={target} onClose={() => setAttiva(null)} onSaved={() => setAttiva(null)} />}
  </>;
}

export default function CampoSchedaCantiere() {
  const { orderId } = useParams<{ orderId: string }>();
  const [params, setParams] = useSearchParams();
  const richiesto = params.get("tab");
  const { query, cantiere, permessi, companyId, userId } = useSchedaCantiere(orderId, richiesto === "documenti" ? "documenti" : "piano");
  const visibili = permessi?.registra_rilievi ? [...tabs, { id: "rilievi", titolo: "Rilievi" }] : tabs;
  const tab = visibili.find(t => t.id === richiesto)?.id ?? "fasi";
  const negato = !!query.error && "code" in query.error && query.error.code === "42501";
  const scheda = query.isError ? undefined : query.data;
  const avanzamento = typeof cantiere?.progresso === "number" ? Math.max(0, Math.min(100, Math.round(cantiere.progresso))) : null;

  return <div className={classePagina}>
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
      <Tabs key={`${orderId}:${companyId}:${userId}`} value={tab} onValueChange={id => {
        const prossimi = new URLSearchParams(params);
        prossimi.set("tab", id);
        setParams(prossimi, { replace: true });
      }}>
        <TabsList aria-label="Scheda cantiere" className={cn("grid h-auto w-full gap-0.5 p-1",
          visibili.length === 4 ? "grid-cols-[1fr_1.7fr_1.2fr_1fr]" : "grid-cols-[1fr_1.45fr_1fr]")}>
          {visibili.map(t => <TabsTrigger key={t.id} value={t.id} className="min-h-11 px-0.5 text-[11px] min-[375px]:text-xs sm:text-sm">{t.titolo}</TabsTrigger>)}
        </TabsList>
        {visibili.map(t => <TabsContent key={t.id} value={t.id} className="mt-3">
          {query.isError ? <StatoScheda messaggio="Non riesco a caricare questa sezione."
            riprova={() => void query.refetch()} />
            : !scheda ? <Skeleton className="h-28 rounded-xl" role="status" aria-label="Carico la scheda" />
            : t.id === "documenti" ? <DocumentiSchedaCantiere documenti={scheda.documenti ?? []} />
            : t.id === "cronoprogramma" ? <CronoprogrammaSchedaCantiere cantiere={scheda.cantiere} fasi={scheda.fasi ?? []} />
            : t.id === "rilievi" && companyId && userId ? <RilieviSchedaCantiere companyId={companyId} userId={userId}
              orderId={scheda.cantiere.id} cantiere={titoloCantiereTecnico(scheda.cantiere)} />
            : <FasiOperative key={`${companyId}:${userId}:${scheda.cantiere.id}`} scheda={scheda} companyId={companyId} userId={userId} />}
        </TabsContent>)}
      </Tabs>}
  </div>;
}
