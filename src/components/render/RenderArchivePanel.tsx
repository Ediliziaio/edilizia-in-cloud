import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  GitCompareArrows,
  Image as ImageIcon,
  Layers3,
  LayoutGrid,
  List,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  formatRenderDate,
  isRenderStale,
  normalizeRenderStatus,
} from "@/lib/render/renderStatus";
import {
  matchesRecentSearch,
  matchesRecentStatus,
  recentRenderImage,
  recentRenderTitle,
  type RecentRender,
  type RecentRenderStatus,
} from "@/lib/render/recentRenders";
import {
  defaultRenderFilters,
  readRenderFilters,
  writeRenderFilters,
  type RenderArchiveFilters,
} from "@/lib/render/renderArchiveFilters";
import {
  restoreRenderScroll,
  saveRenderScroll,
} from "@/lib/render/renderNavigation";
import { RecentRenderCard } from "./RecentRenderCard";
import type { RenderComparisonTarget } from "./RenderComparisonDialog";

const Comparison = lazy(() => import("./RenderComparisonDialog"));
const PAGE_SIZE = 12;
const states: Array<{ id: RecentRenderStatus; label: string; short?: string }> =
  [
    { id: "completed", label: "Pronti" },
    { id: "active", label: "In lavorazione", short: "In corso" },
    { id: "draft", label: "Da completare", short: "Bozze" },
    { id: "failed", label: "Con errore", short: "Errori" },
    { id: "all", label: "Tutti" },
  ];
interface Props {
  items: RecentRender[];
  modules: Array<{ id: string; title: string }>;
  isLoading: boolean;
  isFetching: boolean;
  error: unknown;
  onRefresh: () => void;
  onNewRender?: () => void;
  companyId?: string;
  total?: number;
  hasMore?: boolean;
  loadingMore?: boolean;
  moreError?: boolean;
  scanning?: boolean;
  onLoadMore?: () => void;
  onExpandHistory?: () => void;
  title?: string;
}

export function RenderArchivePanel({
  items,
  modules,
  isLoading,
  isFetching,
  error,
  onRefresh,
  onNewRender,
  companyId,
  total = items.length,
  hasMore = false,
  loadingMore = false,
  moreError = false,
  scanning = false,
  onLoadMore,
  onExpandHistory,
  title = "Ultimi render",
}: Props) {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const filters = readRenderFilters(params);
  const [selected, setSelected] = useState<string[]>([]);
  const [comparing, setComparing] = useState(false);
  const section = useRef<HTMLElement>(null);
  const restored = useRef<string | null>(null);
  const returnTo = location.pathname.startsWith("/azienda/render")
    ? `${location.pathname}${location.search}`
    : undefined;
  const moduleNames = new Map(
    modules.map((module) => [module.id, module.title]),
  );
  const nameOf = (item: RecentRender) =>
    moduleNames.get(item.render_type) || item.render_type.replace(/_/g, " ");
  const change = (patch: Partial<RenderArchiveFilters>, keepPage = false) =>
    setParams(
      writeRenderFilters(params, {
        ...filters,
        ...patch,
        ...(!keepPage ? { page: 1 } : {}),
      }),
      { replace: true },
    );
  const reset = () =>
    setParams(
      writeRenderFilters(params, {
        ...defaultRenderFilters,
        status: "all",
        view: filters.view,
      }),
      { replace: true },
    );
  const hasFilters =
    !!filters.search ||
    filters.module !== "all" ||
    filters.crm !== "all" ||
    filters.onlyPlan ||
    !!filters.from ||
    !!filters.to ||
    filters.project !== "all";
  const needsWholeHistory =
    hasFilters ||
    filters.status !== "completed" ||
    filters.view === "projects" ||
    filters.page * PAGE_SIZE > items.length;
  useEffect(() => {
    if (hasMore && needsWholeHistory) onExpandHistory?.();
  }, [hasMore, needsWholeHistory, onExpandHistory]);
  useEffect(() => {
    if (
      !companyId ||
      !returnTo ||
      isLoading ||
      restored.current === returnTo ||
      (hasMore && filters.page * PAGE_SIZE > items.length)
    )
      return;
    restored.current = returnTo;
    const frame = requestAnimationFrame(() =>
      restoreRenderScroll(companyId, returnTo),
    );
    return () => cancelAnimationFrame(frame);
  }, [companyId, returnTo, isLoading, items.length, hasMore, filters.page]);

  const filtered = items.filter((item) => {
    const day = formatRenderDate(item.created_at, "yyyy-MM-dd");
    return (
      matchesRecentStatus(item, filters.status) &&
      (filters.module === "all" || item.render_type === filters.module) &&
      (!filters.onlyPlan || !!item.planOrigin) &&
      (filters.project === "all" ||
        item.planOrigin?.planId === filters.project) &&
      (filters.crm === "all" ||
        (filters.crm === "linked"
          ? !!(item.contact_id || item.opportunity_id)
          : !(item.contact_id || item.opportunity_id))) &&
      (!filters.from || day >= filters.from) &&
      (!filters.to || day <= filters.to) &&
      matchesRecentSearch(item, filters.search, nameOf(item))
    );
  });
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const page = Math.min(filters.page, pages);
  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const projects = new Map(
    items
      .filter((item) => item.planOrigin)
      .map((item) => [
        item.planOrigin!.planId,
        item.planOrigin!.projectTitle || "Planimetria collegata",
      ]),
  );
  const chosen = items.filter(
    (item) =>
      selected.includes(`${item.render_type}:${item.id}`) &&
      normalizeRenderStatus(item.status) === "completed" &&
      !!recentRenderImage(item),
  );
  const targets: RenderComparisonTarget[] = chosen.map((item) => ({
    id: item.id,
    module: item.render_type,
    url: recentRenderImage(item)!,
    title: recentRenderTitle(item, nameOf(item)),
    createdAt: item.created_at,
  }));
  const stale = items.filter((item) =>
    isRenderStale(item.status, item.created_at),
  ).length;
  const open = () => {
    if (companyId && returnTo) saveRenderScroll(companyId, returnTo);
  };
  const cards = (rows: RecentRender[], grouped = false) =>
    rows.map((item) => {
      const key = `${item.render_type}:${item.id}`;
      const eligible =
        normalizeRenderStatus(item.status) === "completed" &&
        !!recentRenderImage(item);
      return (
        <RecentRenderCard
          key={key}
          item={item}
          moduleName={nameOf(item)}
          list={filters.view === "list"}
          returnTo={returnTo}
          onOpen={open}
          grouped={grouped}
          selection={
            eligible
              ? {
                  checked: selected.includes(key),
                  disabled: chosen.length >= 2 && !selected.includes(key),
                  toggle: () =>
                    setSelected((previous) =>
                      previous.includes(key)
                        ? previous.filter((id) => id !== key)
                        : chosen.length < 2
                          ? [
                              ...chosen.map(
                                (row) => `${row.render_type}:${row.id}`,
                              ),
                              key,
                            ]
                          : previous,
                    ),
                }
              : undefined
          }
        />
      );
    });
  const grouped = new Map<string, RecentRender[]>();
  for (const item of visible) {
    const key = item.planOrigin?.planId || "standalone";
    grouped.set(key, [...(grouped.get(key) ?? []), item]);
  }
  const movePage = (next: number) => {
    change({ page: next }, true);
    section.current?.scrollIntoView?.({ block: "start" });
  };

  return (
    <section
      ref={section}
      className="scroll-mt-24 space-y-3 sm:space-y-4"
      aria-label={title}
      aria-busy={isLoading}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="mt-1 hidden text-sm text-muted-foreground sm:block">
            Risultati, varianti e scelte del progetto in un unico archivio.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Aggiorna render"
            title="Aggiorna render"
            disabled={isFetching}
            onClick={onRefresh}
          >
            <RefreshCw
              className={`h-4 w-4 ${isFetching ? "animate-spin motion-reduce:animate-none" : ""}`}
            />
          </Button>
          <div
            role="group"
            aria-label="Visualizzazione dei render"
            className="flex rounded-lg border p-1"
          >
            {(
              [
                { value: "grid", name: "Vista griglia", Icon: LayoutGrid },
                { value: "list", name: "Vista elenco", Icon: List },
                {
                  value: "projects",
                  name: "Vista per progetto",
                  Icon: Layers3,
                },
              ] as const
            ).map(({ value, name, Icon }) => (
              <Button
                key={value}
                size="sm"
                variant={filters.view === value ? "secondary" : "ghost"}
                aria-pressed={filters.view === value}
                aria-label={name}
                title={name}
                onClick={() => change({ view: value })}
                className="h-7 px-2"
              >
                <Icon className="h-4 w-4" />
              </Button>
            ))}
          </div>
        </div>
      </div>
      <div
        role="group"
        aria-label="Stato dei render"
        className="flex gap-1 overflow-x-auto border-b pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {[
          ...states,
          ...(filters.status === "stale"
            ? [
                {
                  id: "stale" as const,
                  label: "Da verificare",
                  short: "Verifica",
                },
              ]
            : []),
        ].map(({ id, label, short }) => {
          const count = isLoading || !!error || !companyId
            ? "—"
            : items.filter((item) => matchesRecentStatus(item, id)).length;
          return (
            <Button
              key={id}
              variant={filters.status === id ? "default" : "ghost"}
              size="sm"
              aria-label={`${label} ${count}`}
              aria-pressed={filters.status === id}
              onClick={() => change({ status: id })}
              className="shrink-0 gap-1 px-1.5 text-xs sm:gap-2 sm:px-3 sm:text-sm"
            >
              <span className="sm:hidden">{short || label}</span>
              <span className="hidden sm:inline">{label}</span>
              <span
                className={`rounded px-0.5 py-0.5 text-[11px] tabular-nums sm:px-1.5 ${filters.status === id ? "bg-white/20" : "bg-muted"}`}
              >
                {count}
              </span>
            </Button>
          );
        })}
      </div>
      <div className="rounded-xl border bg-card p-3 sm:p-4">
        <div
          className={`grid grid-cols-2 gap-2 ${modules.length > 1 ? "lg:grid-cols-[minmax(220px,1fr)_180px_180px]" : "lg:grid-cols-[minmax(220px,1fr)_180px]"}`}
        >
          <div className="relative col-span-2 lg:col-span-1">
            <Search
              className="absolute left-3 top-3 h-4 w-4 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              aria-label="Cerca nei render recenti"
              placeholder="Cerca stanza, progetto, contatto…"
              value={filters.search}
              onChange={(event) => change({ search: event.target.value })}
              className="pl-9"
            />
          </div>
          {modules.length > 1 && (
            <Select
              value={filters.module}
              onValueChange={(value) => change({ module: value })}
            >
              <SelectTrigger aria-label="Filtra modulo render">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti i moduli</SelectItem>
                {modules.map((module) => (
                  <SelectItem key={module.id} value={module.id}>
                    {module.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Select
            value={filters.crm}
            onValueChange={(value) => change({ crm: value })}
          >
            <SelectTrigger
              aria-label="Filtra collegamenti CRM"
              className={modules.length === 1 ? "col-span-2 lg:col-span-1" : ""}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">CRM: tutti</SelectItem>
              <SelectItem value="linked">Collegati al CRM</SelectItem>
              <SelectItem value="unlinked">Non collegati al CRM</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
            <Checkbox
              checked={filters.onlyPlan}
              onCheckedChange={(value) => change({ onlyPlan: value === true })}
            />
            Solo da planimetria
          </label>
          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 text-xs"
              onClick={() =>
                change({
                  search: "",
                  module: "all",
                  crm: "all",
                  onlyPlan: false,
                  from: "",
                  to: "",
                  project: "all",
                })
              }
            >
              <X className="h-3.5 w-3.5" />
              Azzera filtri
            </Button>
          )}
        </div>
        <details
          className="mt-3 border-t pt-2"
          open={
            filters.project !== "all" ||
            !!filters.from ||
            !!filters.to ||
            undefined
          }
        >
          <summary className="cursor-pointer text-xs text-muted-foreground">
            <SlidersHorizontal className="mr-1 inline h-3 w-3" />
            Progetto e periodo
          </summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <label className="space-y-1 text-xs text-muted-foreground">
              <span>Progetto</span>
              <Select
                value={filters.project}
                onValueChange={(value) => change({ project: value })}
              >
                <SelectTrigger aria-label="Filtra progetto">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutti i progetti</SelectItem>
                  {filters.project !== "all" &&
                    !projects.has(filters.project) && (
                      <SelectItem value={filters.project}>
                        Progetto selezionato
                      </SelectItem>
                    )}
                  {[...projects].map(([id, name]) => (
                    <SelectItem key={id} value={id}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="space-y-1 text-xs text-muted-foreground">
              <span>Dal</span>
              <Input
                type="date"
                aria-label="Render dal"
                value={filters.from}
                onChange={(event) => change({ from: event.target.value })}
              />
            </label>
            <label className="space-y-1 text-xs text-muted-foreground">
              <span>Al</span>
              <Input
                type="date"
                aria-label="Render al"
                value={filters.to}
                onChange={(event) => change({ to: event.target.value })}
              />
            </label>
          </div>
          {filters.from && filters.to && filters.from > filters.to && (
            <p role="alert" className="mt-2 text-xs text-destructive">
              La data iniziale deve precedere quella finale.
            </p>
          )}
        </details>
      </div>
      {stale > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <div className="flex-1">
            <p>
              {stale}{" "}
              {stale === 1
                ? "sessione da verificare"
                : "sessioni da verificare"}
              .
            </p>
            <p className="mt-1">
              Sono state create da oltre 30 minuti: questa età non misura il
              tempo di elaborazione.
            </p>
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="h-auto shrink-0 whitespace-normal text-xs"
            onClick={() =>
              setParams(
                writeRenderFilters(params, {
                  ...defaultRenderFilters,
                  status: "stale",
                  view: filters.view,
                }),
                { replace: true },
              )
            }
          >
            Mostra da verificare
          </Button>
        </div>
      )}
      {!!chosen.length && (
        <div
          className="sticky top-16 z-20 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-primary/30 bg-background p-3 shadow-sm"
          aria-label="Render selezionati per confronto"
        >
          <p className="text-sm">{chosen.length} di 2 render selezionati</p>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setSelected([])}>
              Annulla
            </Button>
            <Button
              size="sm"
              disabled={chosen.length !== 2}
              onClick={() => setComparing(true)}
            >
              <GitCompareArrows className="mr-1.5 h-4 w-4" />
              Confronta selezionati
            </Button>
          </div>
        </div>
      )}
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3].map((item) => (
            <Skeleton key={item} className="aspect-[4/3] rounded-xl" />
          ))}
        </div>
      ) : error ? (
        <div role="alert" className="rounded-xl border py-12 text-center">
          <AlertTriangle className="mx-auto mb-3 h-7 w-7 text-destructive" />
          <p className="font-medium">Impossibile caricare i render</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={onRefresh}
          >
            Riprova
          </Button>
        </div>
      ) : !items.length && !hasMore ? (
        <div className="rounded-xl border border-dashed py-14 text-center">
          <ImageIcon className="mx-auto mb-3 h-9 w-9 text-muted-foreground/50" />
          <h3 className="font-semibold">Il tuo primo render parte da qui</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Scegli l’ambiente o l’intervento da visualizzare.
          </p>
          {onNewRender && (
            <Button className="mt-4 gap-2" onClick={onNewRender}>
              <Plus className="h-4 w-4" />
              Nuovo render
            </Button>
          )}
        </div>
      ) : !filtered.length ? (
        <div className="rounded-xl border py-12 text-center">
          <Search className="mx-auto mb-3 h-7 w-7 text-muted-foreground/50" />
          <p className="font-medium">
            {hasMore
              ? "Nessun risultato nei render già caricati"
              : "Nessun render con questi filtri"}
          </p>
          {hasMore && (
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={onExpandHistory}
              disabled={loadingMore}
            >
              {loadingMore || scanning
                ? "Ricerca nello storico…"
                : "Cerca nello storico completo"}
            </Button>
          )}
          <Button variant="ghost" size="sm" className="mt-4" onClick={reset}>
            Mostra tutti i render recenti
          </Button>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <p role="status" aria-live="polite">
              {(page - 1) * PAGE_SIZE + 1}–
              {Math.min(page * PAGE_SIZE, filtered.length)} di {filtered.length}{" "}
              render{hasMore ? " caricati" : ""}
            </p>
            <span>Più recenti prima</span>
          </div>
          {filters.view === "projects" ? (
            <div className="space-y-5">
              {[...grouped].map(([key, rows]) => {
                const origin = rows[0].planOrigin;
                const rooms = new Map<string, RecentRender[]>();
                for (const row of rows) {
                  const room = row.planOrigin
                    ? JSON.stringify([
                        row.planOrigin.roomId || row.id,
                        row.planOrigin.version,
                        row.planOrigin.level,
                        row.planOrigin.scope,
                      ])
                    : "standalone";
                  rooms.set(room, [...(rooms.get(room) ?? []), row]);
                }
                return (
                  <section
                    key={key}
                    className="space-y-3 rounded-xl border bg-muted/15 p-3 sm:p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="font-semibold">
                        {origin?.projectTitle ||
                          (origin
                            ? "Planimetria collegata"
                            : "Render senza planimetria associata")}
                      </h3>
                      {origin?.projectAvailable !== false && origin && (
                        <Button variant="link" size="sm" asChild>
                          <Link to={origin.projectPath} onClick={open}>
                            Apri progetto
                          </Link>
                        </Button>
                      )}
                    </div>
                    {[...rooms].map(([room, variants]) => (
                      <div key={room} className="space-y-2">
                        {variants[0].planOrigin && (
                          <p className="text-xs text-muted-foreground">
                            {variants[0].planOrigin.roomName} · versione{" "}
                            {variants[0].planOrigin.version} · {variants.length}{" "}
                            {variants.length === 1
                              ? "render"
                              : "render in questa pagina"}
                          </p>
                        )}
                        <div className="grid items-stretch gap-4 sm:grid-cols-2 xl:grid-cols-3">
                          {cards(variants, true)}
                        </div>
                      </div>
                    ))}
                  </section>
                );
              })}
            </div>
          ) : (
            <div
              className={
                filters.view === "list"
                  ? "space-y-3"
                  : "grid items-stretch gap-4 sm:grid-cols-2 xl:grid-cols-3"
              }
            >
              {cards(visible)}
            </div>
          )}
          {pages > 1 && (
            <nav
              aria-label="Pagine dei render"
              className="flex items-center justify-center gap-4 pt-2"
            >
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => movePage(page - 1)}
              >
                <ChevronLeft className="mr-1 h-4 w-4" />
                Precedenti
              </Button>
              <span className="text-xs text-muted-foreground">
                Pagina {page} di {pages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= pages}
                onClick={() => movePage(page + 1)}
              >
                Successivi
                <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </nav>
          )}
        </>
      )}
      {!isLoading && !error && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3 text-xs text-muted-foreground">
          <p>
            {hasMore
              ? `${items.length} di ${total} render caricati. Ricerca e filtri proseguono nello storico completo.`
              : `Storico completo · ${items.length} render`}
          </p>
          {hasMore && (
            <Button
              variant="outline"
              size="sm"
              disabled={loadingMore}
              onClick={onLoadMore}
            >
              {loadingMore
                ? "Caricamento…"
                : moreError
                  ? "Riprova caricamento storico"
                  : "Carica render precedenti"}
            </Button>
          )}
        </div>
      )}
      {moreError && (
        <p role="alert" className="text-xs text-destructive">
          Una parte dello storico non è stata caricata. I risultati visibili
          restano consultabili: riprova il caricamento.
        </p>
      )}
      {comparing && targets.length === 2 && (
        <Suspense
          fallback={
            <p className="text-sm text-muted-foreground">
              Caricamento del confronto…
            </p>
          }
        >
          <Comparison targets={targets} open onOpenChange={setComparing} />
        </Suspense>
      )}
    </section>
  );
}
