import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowUpRight, CheckCircle2, ChevronLeft, ChevronRight, Clock, FileEdit, Image as ImageIcon, LayoutGrid, LayoutPanelTop, List, Loader2, Plus, RefreshCw, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getRenderDetailPath } from "@/lib/render/renderNavigation";
import { formatRenderDate, isRenderStale, normalizeRenderStatus, renderStatusLabel } from "@/lib/render/renderStatus";
import { matchesRecentSearch, matchesRecentStatus, recentRenderImage, recentRenderTitle, type RecentRender, type RecentRenderStatus } from "@/lib/render/recentRenders";

const PAGE_SIZE = 12;
const statuses: Array<{ id: RecentRenderStatus; label: string; short?: string }> = [
  { id: "completed", label: "Pronti" },
  { id: "active", label: "In lavorazione", short: "In corso" },
  { id: "draft", label: "Da completare", short: "Bozze" },
  { id: "failed", label: "Con errore", short: "Errori" },
  { id: "all", label: "Tutti" },
];
const defaults = { search: "", module: "all", status: "completed" as RecentRenderStatus, crm: "all", onlyPlan: false, page: 1 };

interface Props {
  items: RecentRender[];
  modules: Array<{ id: string; title: string }>;
  isLoading: boolean;
  isFetching: boolean;
  error: unknown;
  onRefresh: () => void;
  onNewRender: () => void;
}

function RenderPreview({ item, title, list }: { item: RecentRender; title: string; list: boolean }) {
  const url = recentRenderImage(item);
  const [unavailable, setUnavailable] = useState<string | null>(null);
  const status = normalizeRenderStatus(item.status);
  const active = status === "pending" || status === "processing";
  return <div className={`relative flex shrink-0 items-center justify-center overflow-hidden bg-slate-100 ${list ? "h-24 w-28 rounded-lg sm:h-28 sm:w-44" : "aspect-[16/10] w-full border-b"}`}>
    {url && unavailable !== url ? <img src={url} alt={title} className="h-full w-full object-contain" loading="lazy" decoding="async" onError={() => setUnavailable(url)} />
      : <div className="flex flex-col items-center gap-2 px-2 text-center text-slate-500">
        {active ? <Loader2 className="h-7 w-7 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <ImageIcon className="h-7 w-7 opacity-50" aria-hidden="true" />}
        <span className="text-xs">{active ? "Render in preparazione" : status === "draft" ? "Configurazione da completare" : status === "failed" ? "Generazione non riuscita" : "Anteprima non disponibile"}</span>
      </div>}
  </div>;
}

function RecentRenderCard({ item, moduleName, list }: { item: RecentRender; moduleName: string; list: boolean }) {
  const title = recentRenderTitle(item, moduleName);
  const status = normalizeRenderStatus(item.status);
  const stale = isRenderStale(item.status, item.created_at);
  const StatusIcon = status === "completed" ? CheckCircle2 : status === "failed" || stale ? AlertTriangle : status === "draft" ? FileEdit : Clock;
  const statusClass = status === "completed" ? "bg-emerald-50 text-emerald-700" : status === "failed" ? "bg-rose-50 text-rose-700" : status === "draft" ? "bg-slate-100 text-slate-600" : "bg-amber-50 text-amber-800";
  const person = item.meta.contactName || item.meta.opportunityName;
  return <article className={`group overflow-hidden rounded-xl border bg-card transition-colors hover:border-primary/40 ${list ? "sm:flex sm:items-center" : "flex h-full flex-col"}`}>
    <Link to={getRenderDetailPath(item.render_type, item.id)} aria-label={`Apri render ${title}${title !== moduleName ? ` · ${moduleName}` : ""} · ${formatRenderDate(item.created_at)}`} className={`min-w-0 flex-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary ${list ? "flex items-center gap-3 p-3 sm:gap-5" : "block"}`}>
      <RenderPreview item={item} title={`Render ${title}`} list={list} />
      <div className={`min-w-0 space-y-2 ${list ? "flex-1 py-1" : "p-4"}`}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">{moduleName}</span>
          <Badge variant="secondary" className={`gap-1 border-0 px-2 py-0.5 text-[11px] font-medium ${statusClass}`}><StatusIcon className="h-3 w-3" aria-hidden="true" />{stale ? "Da verificare" : renderStatusLabel(item.status)}</Badge>
        </div>
        <div className="flex items-start justify-between gap-2">
          <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-foreground sm:text-base" title={title}>{title}</h3>
          <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" aria-hidden="true" />
        </div>
        <p className="text-xs text-muted-foreground"><time dateTime={item.created_at}>{formatRenderDate(item.created_at)}</time>{item.meta.createdByName && <span> · {item.meta.createdByName}</span>}</p>
        {person && person !== title && <p className="truncate text-xs text-muted-foreground" title={person}>{person}</p>}
      </div>
    </Link>
    {item.planOrigin && <div className={`border-t bg-muted/25 px-4 py-3 ${list ? "sm:w-56 sm:shrink-0 sm:border-l sm:border-t-0" : "mt-auto"}`}>
      <Link to={item.planOrigin.projectPath} className="flex min-w-0 items-start gap-2 rounded text-xs text-muted-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" aria-label={`Apri planimetria ${item.planOrigin.projectTitle || "collegata"} per ${title}`}>
        <LayoutPanelTop className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="min-w-0"><span className="block truncate font-medium text-foreground" title={item.planOrigin.projectTitle}>{item.planOrigin.projectTitle || "Planimetria collegata"}</span><span className="mt-0.5 block">Dalla planimetria · versione {item.planOrigin.version}</span></span>
      </Link>
    </div>}
  </article>;
}

export function RecentRendersPanel({ items, modules, isLoading, isFetching, error, onRefresh, onNewRender }: Props) {
  const section = useRef<HTMLElement>(null);
  const [filters, setFilters] = useState(defaults);
  const [view, setView] = useState<"grid" | "list">("grid");
  const change = (patch: Partial<typeof defaults>) => setFilters((previous) => ({ ...previous, ...patch, page: 1 }));
  const moduleNames = new Map(modules.map((module) => [module.id, module.title]));
  const nameOf = (item: RecentRender) => moduleNames.get(item.render_type) || item.render_type.replace(/_/g, " ");
  const filtered = items.filter((item) => matchesRecentStatus(item, filters.status)
    && (filters.module === "all" || item.render_type === filters.module)
    && (!filters.onlyPlan || !!item.planOrigin)
    && (filters.crm === "all" || (filters.crm === "linked" ? !!(item.contact_id || item.opportunity_id) : !(item.contact_id || item.opportunity_id)))
    && matchesRecentSearch(item, filters.search, nameOf(item)));
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const page = Math.min(filters.page, pages);
  const movePage = (next: number) => {
    setFilters((previous) => ({ ...previous, page: next }));
    section.current?.scrollIntoView?.({ block: "start" });
  };
  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const stale = items.filter((item) => isRenderStale(item.status, item.created_at)).length;
  const hasFilters = !!filters.search || filters.module !== "all" || filters.crm !== "all" || filters.onlyPlan;

  return <section ref={section} className="scroll-mt-24 space-y-3 sm:space-y-4" aria-labelledby="recent-renders-title" aria-busy={isLoading}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 id="recent-renders-title" className="text-lg font-semibold">Ultimi render</h2><p className="mt-1 hidden text-sm text-muted-foreground sm:block">I risultati pronti da rivedere, con le lavorazioni in sezioni dedicate.</p></div>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" aria-label="Aggiorna render" title="Aggiorna render" disabled={isFetching} onClick={onRefresh}><RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin motion-reduce:animate-none" : ""}`} /></Button>
        <div role="group" aria-label="Visualizzazione dei render" className="flex rounded-lg border p-1">
          <Button size="sm" variant={view === "grid" ? "secondary" : "ghost"} aria-pressed={view === "grid"} aria-label="Vista griglia" title="Griglia" onClick={() => setView("grid")} className="h-7 px-2"><LayoutGrid className="h-4 w-4" /></Button>
          <Button size="sm" variant={view === "list" ? "secondary" : "ghost"} aria-pressed={view === "list"} aria-label="Vista elenco" title="Elenco" onClick={() => setView("list")} className="h-7 px-2"><List className="h-4 w-4" /></Button>
        </div>
      </div>
    </div>

    <div role="group" aria-label="Stato dei render" className="flex gap-1 overflow-x-auto border-b pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {statuses.map(({ id, label, short }) => {
        const count = isLoading ? "—" : items.filter((item) => matchesRecentStatus(item, id)).length;
        return <Button key={id} variant={filters.status === id ? "default" : "ghost"} size="sm" aria-label={`${label} ${count}`} aria-pressed={filters.status === id} onClick={() => change({ status: id })} className="shrink-0 gap-1 px-1.5 text-xs sm:gap-2 sm:px-3 sm:text-sm">
          <span className="sm:hidden">{short || label}</span><span className="hidden sm:inline">{label}</span><span className={`rounded px-0.5 py-0.5 text-[11px] tabular-nums sm:px-1.5 ${filters.status === id ? "bg-white/20" : "bg-muted"}`}>{count}</span>
        </Button>;
      })}
    </div>

    <div className="rounded-xl border bg-card p-3 sm:p-4">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-[minmax(220px,1fr)_180px_180px]">
        <div className="relative col-span-2 lg:col-span-1"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" aria-hidden="true" /><Input aria-label="Cerca nei render recenti" placeholder="Cerca stanza, progetto, contatto…" value={filters.search} onChange={(event) => change({ search: event.target.value })} className="pl-9" /></div>
        <Select value={filters.module} onValueChange={(value) => change({ module: value })}><SelectTrigger aria-label="Filtra modulo render"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Tutti i moduli</SelectItem>{modules.map((module) => <SelectItem key={module.id} value={module.id}>{module.title}</SelectItem>)}</SelectContent></Select>
        <Select value={filters.crm} onValueChange={(value) => change({ crm: value })}><SelectTrigger aria-label="Filtra collegamenti CRM"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">CRM: tutti</SelectItem><SelectItem value="linked">Collegati al CRM</SelectItem><SelectItem value="unlinked">Non collegati al CRM</SelectItem></SelectContent></Select>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground"><Checkbox checked={filters.onlyPlan} onCheckedChange={(value) => change({ onlyPlan: value === true })} />Solo da planimetria</label>
        {hasFilters && <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => change({ search: "", module: "all", crm: "all", onlyPlan: false })}><X className="h-3.5 w-3.5" />Azzera filtri</Button>}
      </div>
    </div>

    {stale > 0 && <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"><AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" /><p className="flex-1">{stale} {stale === 1 ? "lavorazione da verificare" : "lavorazioni da verificare"}: apri il render per controllarne lo stato.</p><Button size="sm" variant="ghost" className="h-7 shrink-0 text-xs" onClick={() => setFilters({ ...defaults, status: "active" })}>Mostra</Button></div>}

    {isLoading ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{[1, 2, 3].map((item) => <Skeleton key={item} className="aspect-[4/3] rounded-xl" />)}</div>
      : error ? <div role="alert" className="rounded-xl border py-12 text-center"><AlertTriangle className="mx-auto mb-3 h-7 w-7 text-destructive" /><p className="font-medium">Impossibile caricare i render</p><p className="mt-1 text-sm text-muted-foreground">Riprova per recuperare le anteprime e i collegamenti.</p><Button variant="outline" size="sm" className="mt-4" onClick={onRefresh}>Riprova</Button></div>
        : !items.length ? <div className="rounded-xl border border-dashed py-14 text-center"><ImageIcon className="mx-auto mb-3 h-9 w-9 text-muted-foreground/50" /><h3 className="font-semibold">Il tuo primo render parte da qui</h3><p className="mt-1 text-sm text-muted-foreground">Scegli l’ambiente o l’intervento da visualizzare.</p><Button className="mt-4 gap-2" onClick={onNewRender}><Plus className="h-4 w-4" />Nuovo render</Button></div>
          : !filtered.length ? <div className="rounded-xl border py-12 text-center"><Search className="mx-auto mb-3 h-7 w-7 text-muted-foreground/50" /><p className="font-medium">Nessun render con questi filtri</p><Button variant="outline" size="sm" className="mt-4" onClick={() => setFilters({ ...defaults, status: "all" })}>Mostra tutti i render recenti</Button></div>
            : <><div className="flex items-center justify-between gap-3 text-xs text-muted-foreground"><p role="status" aria-live="polite">{(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} di {filtered.length} render</p><span>Più recenti prima</span></div>
              <div className={view === "list" ? "space-y-3" : "grid items-stretch gap-4 sm:grid-cols-2 xl:grid-cols-3"}>{visible.map((item) => <RecentRenderCard key={`${item.render_type}-${item.id}`} item={item} moduleName={nameOf(item)} list={view === "list"} />)}</div>
              {pages > 1 && <nav aria-label="Pagine dei render" className="flex items-center justify-center gap-4 pt-2"><Button variant="outline" size="sm" disabled={page <= 1} onClick={() => movePage(page - 1)}><ChevronLeft className="mr-1 h-4 w-4" />Precedenti</Button><span className="text-xs text-muted-foreground">Pagina {page} di {pages}</span><Button variant="outline" size="sm" disabled={page >= pages} onClick={() => movePage(page + 1)}>Successivi<ChevronRight className="ml-1 h-4 w-4" /></Button></nav>}
            </>}
    {!isLoading && !error && items.length >= 48 && <p className="text-xs text-muted-foreground">La ricerca copre gli ultimi 48 render. Lo storico completo è disponibile nel rispettivo modulo.</p>}
  </section>;
}
