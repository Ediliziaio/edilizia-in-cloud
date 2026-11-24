import { lazy, Suspense, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, LayoutPanelTop, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { usePermissions } from "@/hooks/usePermissions";
import { accessiCollegamenti } from "@/lib/planimetrie/collegamenti";
import { ASSOCIATE_PER_PAGINA, caricaPianteAssociate, type DestinazionePianta } from "@/lib/planimetrie/pianteAssociate";
import { percorsoProgettoAssociato } from "@/lib/planimetrie/render/percorsi";
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";

const AnteprimaProgettoAssociato = lazy(() => import("./AnteprimaProgettoAssociato"));

const CONTESTO: Record<DestinazionePianta, string> = {
  cliente: "a questo cliente", contatto: "a questo contatto CRM", preventivo: "a questo preventivo", commessa: "a questa commessa", computo: "a questo computo",
};
const STATO = { bozza: "Bozza", in_uso: "In uso", archiviata: "Archiviata" } as const;
type Props = { companyId: string | null | undefined; tipo: DestinazionePianta; schedaId: string | null | undefined; nascondiSeVuoto?: boolean };

/** Accesso al progetto originale, senza comandi di creazione o modifica della scheda ospite. */
export function PlanimetrieAssociate({ companyId, tipo, schedaId, nascondiSeVuoto = false }: Props) {
  const permessi = usePermissions();
  if (!companyId || !schedaId || !permessi.canViewRenderAi || !accessiCollegamenti(permessi)[tipo]) return null;
  return <ElencoPianteAssociate key={`${companyId}:${tipo}:${schedaId}`} companyId={companyId} tipo={tipo} schedaId={schedaId} nascondiSeVuoto={nascondiSeVuoto} />;
}

function ElencoPianteAssociate({ companyId, tipo, schedaId, nascondiSeVuoto }: { companyId: string; tipo: DestinazionePianta; schedaId: string; nascondiSeVuoto: boolean }) {
  const t = useT();
  const [pagina, setPagina] = useState(0);
  const [anteprimaId, setAnteprimaId] = useState<string | null>(null);
  const location = useLocation();
  const torna = `${location.pathname}${location.search}${location.hash}`;
  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ["planimetrie", "associate", companyId, tipo, schedaId, pagina],
    queryFn: () => caricaPianteAssociate(companyId, tipo, schedaId, pagina),
    staleTime: 30_000,
    retry: 1,
  });
  const contesto = t(CONTESTO[tipo]);
  const pagine = Math.max(1, Math.ceil((data?.totale ?? 0) / ASSOCIATE_PER_PAGINA));

  if (nascondiSeVuoto && !isLoading && !error && data?.totale === 0 && pagina === 0) return null;

  return <section className="overflow-hidden rounded-xl border bg-card" aria-label={t("Planimetrie associate {contesto}", { contesto: String(contesto ?? "") })}>
    <div className="flex items-center gap-2.5 px-4 py-3">
      <LayoutPanelTop className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
      <div className="min-w-0 flex-1"><h3 className="text-sm font-semibold">{t("Planimetrie associate")}</h3><p className="mt-0.5 text-xs text-muted-foreground">{t("Collegate {contesto}", { contesto: String(contesto ?? "") })}</p></div>
      {data && !error && <Badge variant="secondary" className="shrink-0 font-normal">{data.totale}</Badge>}
    </div>
    {isLoading ? <p role="status" className="flex items-center gap-2 border-t px-4 py-3 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />{t("Carico i collegamenti…")}</p>
      : error ? <div role="alert" className="flex flex-wrap items-center gap-2 border-t px-4 py-3 text-xs"><p>{t("Impossibile caricare le planimetrie associate.")}</p><Button variant="outline" size="sm" onClick={() => refetch()}>{t("Riprova")}</Button></div>
        : data && data.piante.length > 0 ? <ul className="divide-y border-t">{data.piante.map((pianta) => {
          const aggiornata = new Date(pianta.updated_at);
          const dataLeggibile = Number.isFinite(aggiornata.getTime()) ? aggiornata.toLocaleDateString(intlCampo()) : null;
          return <li key={pianta.id} className="flex flex-wrap items-center gap-x-2 px-3"><Link to={percorsoProgettoAssociato(pianta.id, torna)} aria-label={t("Apri planimetria {titolo}", { titolo: String(pianta.titolo ?? "") })} className="flex min-w-[180px] flex-1 items-center gap-3 rounded-lg px-1 py-3 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
            <div className="min-w-0 flex-1"><p className="break-words text-sm font-medium leading-snug">{pianta.titolo}</p><p className="mt-1 text-xs text-muted-foreground">{t("Versione {numero}", { numero: String(pianta.versione_corrente) })}{dataLeggibile ? ` · ${dataLeggibile}` : ""}</p></div>
            <Badge variant="outline" className="shrink-0 text-[10px] font-normal">{t(STATO[pianta.stato])}</Badge><ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </Link><div className="mb-2 ml-auto flex gap-1 sm:mb-0"><Button size="sm" variant="ghost" aria-label={t("Anteprima {titolo}", { titolo: String(pianta.titolo ?? "") })} onClick={() => setAnteprimaId(pianta.id)}>{t("Anteprima")}</Button><Button size="sm" variant="outline" asChild><Link to={percorsoProgettoAssociato(pianta.id, torna, true)} aria-label={t("Fascicolo PDF {titolo}", { titolo: String(pianta.titolo ?? "") })}>{t("Fascicolo PDF")}</Link></Button></div></li>;
        })}</ul>
          : <p className="border-t px-4 py-3 text-xs text-muted-foreground">{data?.totale ? t("Questa pagina non contiene più planimetrie.") : t("Nessuna planimetria associata {contesto}.", { contesto: String(contesto ?? "") })}</p>}
    {((data?.totale ?? 0) > ASSOCIATE_PER_PAGINA || pagina > 0) && <nav aria-label={t("Pagine delle planimetrie associate")} className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-2">
      <Button size="sm" variant="ghost" disabled={pagina === 0 || isFetching} onClick={() => setPagina((p) => p - 1)}>{t("Precedenti")}</Button>
      <span className="text-xs text-muted-foreground">{data ? t("Pagina {pagina} di {pagine}", { pagina: pagina + 1, pagine }) : t("Pagina {pagina}", { pagina: pagina + 1 })}</span>
      <Button size="sm" variant="ghost" disabled={!data || (pagina + 1) * ASSOCIATE_PER_PAGINA >= data.totale || isFetching} onClick={() => setPagina((p) => p + 1)}>{t("Successive")}</Button>
    </nav>}
    {anteprimaId && <Suspense fallback={<p role="status" className="p-3 text-xs">{t("Apro l’anteprima…")}</p>}><AnteprimaProgettoAssociato id={anteprimaId} companyId={companyId} torna={torna} onChiudi={() => setAnteprimaId(null)} /></Suspense>}
  </section>;
}
