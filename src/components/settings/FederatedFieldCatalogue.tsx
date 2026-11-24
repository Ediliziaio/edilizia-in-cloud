import { UniformSelect } from "@/components/ui/uniform-select";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, Copy, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { TablePagination } from "@/components/ui/table-pagination";
import { CATALOGUE_SOURCES, catalogueTypeLabel, type CatalogueSource } from "@/lib/custom-fields/federatedCatalogue";
import { useFederatedFieldCatalogue } from "@/hooks/useFederatedFieldCatalogue";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

/** Read-only directory. Editing always happens in the original, authorized module. */
export function FederatedFieldCatalogue() {
  const t = useT();
  const [source, setSource] = useState<CatalogueSource>("catalogue");
  const [search, setSearch] = useState("");
  const [scope, setScope] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const query = useFederatedFieldCatalogue(source, true);
  const rows = useMemo(() => query.data ?? [], [query.data]);
  const scopes = useMemo(() => query.scopes ?? [], [query.scopes]);
  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("it");
    return rows.filter(f => (!scope || f.scopeId === scope) && (!term || [f.name, f.key, f.scope, f.path, f.mapping, f.unit].some(v => v?.toLocaleLowerCase("it").includes(term))));
  }, [rows, search, scope]);
  const currentPage = Math.min(page, Math.max(1, Math.ceil(filtered.length / pageSize)));
  const sourceInfo = CATALOGUE_SOURCES.find(s => s.id === source)!;
  const copy = (key: string) => navigator.clipboard.writeText(key).then(() => toast.success(t("Chiave copiata"))).catch(() => toast.error(t("Non è stato possibile copiare la chiave")));
  return <section className="space-y-4 pt-4" aria-label={t("Catalogo campi dei modelli")}>
    <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-4 text-sm">
      <div className="flex items-center justify-between gap-3"><h2 className="font-semibold">{t("Un solo catalogo, senza doppioni")}</h2><Button variant="outline" size="sm" disabled={!query.allowed || query.isFetching} onClick={() => void query.refetch()}><RefreshCw className={`mr-2 h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />{t("Aggiorna catalogo")}</Button></div>
      <p className="mt-1 text-muted-foreground">{t("Qui trovi i campi già definiti nei modelli e nelle schede tecniche. Restano nella loro origine: non vengono copiati né modificati. Le chiavi valgono nel relativo modello, non automaticamente nelle email o nelle automazioni.")}</p>
    </div>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <div className="space-y-1"><Label htmlFor="cf-source">{t("Origine dei campi")}</Label>
        <UniformSelect id="cf-source" className="flex h-10 w-full rounded-md border bg-background px-3 text-sm" value={source} onChange={e => { setSource(e.target.value as CatalogueSource); setScope(""); setPage(1); }}>
          {CATALOGUE_SOURCES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
        </UniformSelect>
      </div>
      <div className="space-y-1"><Label htmlFor="cf-scope">{t("Modello o scheda")}</Label>
        <UniformSelect id="cf-scope" className="flex h-10 w-full rounded-md border bg-background px-3 text-sm" value={scope} onChange={e => { setScope(e.target.value); setPage(1); }}>
          <option value="">{t("Tutti i modelli di questa origine")}</option>
          {scopes.map(s => <option key={s.id} value={s.id}>{s.name}{s.count === 0 ? ` · ${t("Nessun campo configurato")}` : ""}</option>)}
        </UniformSelect>
      </div>
      <div className="space-y-1"><Label htmlFor="cf-source-search">{t("Cerca nei campi")}</Label>
        <div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input id="cf-source-search" className="pl-9" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder={t("Nome, chiave, unità o modello")} /></div>
      </div>
    </div>
    {query.checkingPermissions ? <p role="status">{t("Verifica dei permessi…")}</p>
      : !query.allowed ? <p role="status" className="rounded-md border p-4 text-sm">{t("Per consultare questa origine serve anche il permesso di lettura del relativo modulo. Non è stato caricato alcun campo.")}</p>
        : query.isPending ? <p role="status">{t("Caricamento delle definizioni…")}</p>
          : query.isError ? <div role="alert" className="rounded-md border border-destructive p-4 text-sm"><p>{t("Non è stato possibile leggere questa origine. Non è possibile stabilire se ci sono definizioni: il caricamento è fallito.")}</p><Button variant="outline" onClick={() => void query.refetch()} className="mt-2">{t("Riprova")}</Button></div>
            : <>
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm"><p aria-live="polite">{filtered.length === 1 ? t("1 campo trovato") : t("{n} campi trovati", { n: filtered.length })} · {scopes.length === 1 ? t("1 modello o scheda") : t("{n} modelli o schede", { n: scopes.length })}</p><Button asChild variant="outline" size="sm"><Link to={sourceInfo.href}>{t("Apri area di origine")} <ArrowUpRight className="ml-1 h-4 w-4" /></Link></Button></div>
              {scopes.some(s => s.count === 0) && <p className="text-xs text-muted-foreground">{scopes.filter(s => s.count === 0).length === 1 ? t("1 modello senza campi configurati, visibile nel filtro. Non aggiunge variabili.") : t("{n} modelli senza campi configurati. Sono visibili nel filtro, non aggiungono variabili.", { n: scopes.filter(s => s.count === 0).length })}</p>}
              {filtered.length === 0 ? <p className="rounded-md border border-dashed p-6 text-center text-muted-foreground">{t("Nessuna definizione trovata per questi filtri.")}</p> : <ul className="divide-y rounded-xl border">
                {filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize).map(f => <li key={f.id} className="grid gap-2 p-4 md:grid-cols-2">
                  <div><p className="text-sm font-semibold">{f.name}</p><p className="mt-1 text-xs text-muted-foreground">{f.scope}</p><div className="mt-2 flex flex-wrap gap-1"><Badge variant="secondary">{catalogueTypeLabel(f.type) || t("Tipo nel modello")}{f.unit ? ` · ${f.unit}` : ""}</Badge>{f.required && <Badge variant="outline">{t("Obbligatorio nel modello")}</Badge>}{f.visibility === "nascosto" && <Badge variant="outline">{t("Nascosto nel modulo")}</Badge>}{f.pdf && <Badge variant="outline">{t("PDF dal modello")}</Badge>}{source === "recruitment" && <Badge variant="outline">{t("Solo area HR")}</Badge>}</div></div>
                  <div className="min-w-0 space-y-1"><div className="flex items-start gap-2"><code className="min-w-0 break-all rounded bg-muted px-2 py-1 text-xs">{f.key}</code><Button size="icon" variant="ghost" className="h-9 w-9 shrink-0" aria-label={t("Copia chiave {name}", { name: String(f.name ?? "") })} onClick={() => void copy(f.key)}><Copy className="h-4 w-4" /></Button></div>{f.path && <p className="break-all text-xs text-muted-foreground">{t("Ambito: {path}", { path: String(f.path ?? "") })}</p>}{source === "forms" && <p className="text-xs text-muted-foreground">{f.mapping ? t("Destinazione dichiarata nel modulo: {mapping}", { mapping: String(f.mapping ?? "") }) : t("Nessuna destinazione dichiarata: da collegare nel modulo.")}</p>}</div>
                </li>)}
              </ul>}
              <TablePagination totalItems={filtered.length} totalPages={Math.max(1, Math.ceil(filtered.length / pageSize))} currentPage={currentPage} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={n => { setPageSize(n); setPage(1); }} />
            </>}
  </section>;
}
