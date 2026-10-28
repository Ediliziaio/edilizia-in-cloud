import { lazy, Suspense, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  HardHat,
  Info,
  Loader2,
  RefreshCcw,
  Search,
  Users,
  X,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useCantieriOggi } from "@/hooks/useCantieriOggi";
import { usePuoApprovareCantiere } from "@/components/campo/DaApprovareCantieri";
import { OfficeSelect } from "@/components/orders/OfficeSelect";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  filterOggiItems,
  makeOggiItems,
  nextOggiAction,
  presenzeLabel,
  statoCantiere,
  type OggiItem,
  type OggiFilter,
  type OggiPanelView,
} from "@/lib/orders/cantieriOggi";

export {
  giorniLavorativiDa,
  statoCantiere,
  GIORNI_FERMO,
  type RigaCantiere,
} from "@/lib/orders/cantieriOggi";
const Panel = lazy(() =>
  import("@/components/orders/CantiereOggiPanel").then((m) => ({
    default: m.CantiereOggiPanel,
  })),
);
const filters: { value: OggiFilter; label: string }[] = [
  { value: "priorita", label: "Da seguire" },
  { value: "oggi", label: "Operativi oggi" },
  { value: "attenzione", label: "Da intervenire" },
  { value: "approvare", label: "Da approvare" },
  { value: "tutti", label: "Tutti i monitorati" },
  { value: "non-pianificati", label: "Non pianificati oggi" },
];
const knownFilters: OggiFilter[] = [...filters.map((f) => f.value), "squadre"];
const views: OggiPanelView[] = [
  "riepilogo",
  "lavorazioni",
  "ufficio",
  "approvazioni",
];
const PAGE_SIZE = 25;
const italianTime = (date: number) =>
  new Date(date).toLocaleTimeString("it-IT", {
    timeZone: "Europe/Rome",
    hour: "2-digit",
    minute: "2-digit",
  });

export default function CantieriOggi() {
  const { effectiveCompany } = useAuth();
  return (
    <CantieriOggiWorkspace
      key={effectiveCompany?.id || "nessuna-azienda"}
      companyId={effectiveCompany?.id}
    />
  );
}
function CantieriOggiWorkspace({ companyId }: { companyId?: string }) {
  const { cantieri, overview, now, ready, refresh } =
    useCantieriOggi(companyId);
  const canApprove = usePuoApprovareCantiere();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const value = params.get("filtro_oggi") as OggiFilter | null;
  const filter = value && knownFilters.includes(value) ? value : "priorita";
  const search = params.get("q_oggi") || "";
  const owner = params.get("responsabile_oggi") || "";
  const selected = params.get("cantiere_oggi");
  const requestedView = params.get("dettaglio_oggi") as OggiPanelView | null;
  const view =
    requestedView && views.includes(requestedView)
      ? requestedView
      : "riepilogo";
  const set = (patch: Record<string, string | null>, replace = true) =>
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        for (const [key, val] of Object.entries(patch))
          if (val) next.set(key, val);
          else next.delete(key);
        return next;
      },
      { replace },
    );
  const changeFilter = (next: OggiFilter) =>
    set({ filtro_oggi: next, pagina_oggi: null });
  const items = useMemo(
    () =>
      makeOggiItems(
        cantieri.data ?? [],
        overview.isError ? undefined : overview.data,
        now,
      ),
    [cantieri.data, overview.data, overview.isError, now],
  );
  const visible = useMemo(
    () => filterOggiItems(items, filter, search, owner),
    [items, filter, search, owner],
  );
  const requestedPage = Number(params.get("pagina_oggi") || 1);
  const pages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const page = Math.min(
    pages,
    Number.isSafeInteger(requestedPage) && requestedPage > 0
      ? requestedPage
      : 1,
  );
  const pageRows = visible.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const active = items.find((item) => item.row.id === selected);
  const open = (item: OggiItem, next: OggiPanelView = "riepilogo") =>
    set({ cantiere_oggi: item.row.id, dettaglio_oggi: next }, false);
  const close = () => {
    set({ cantiere_oggi: null, dettaglio_oggi: null });
    void qc.invalidateQueries({
      queryKey: ["ufficio-cantieri-oggi", companyId],
    });
    if (view === "approvazioni") {
      void qc.invalidateQueries({
        queryKey: ["ufficio-da-approvare", companyId],
      });
    }
  };
  const owners = useMemo(
    () =>
      [
        ...new Map(
          items
            .filter((i) => i.order?.assigned_to)
            .map((i) => [i.order!.assigned_to!, i.owner]),
        ).entries(),
      ]
        .sort((a, b) => a[1].localeCompare(b[1], "it"))
        .map(([value, label]) => ({ value, label })),
    [items],
  );
  const operating = items.filter((i) => i.operational).length;
  const attention = items.filter((i) => i.attention).length;
  const incomplete = items.some((i) => i.incomplete);
  const pending = items.some((i) => i.pending === null)
    ? null
    : items.reduce((sum, i) => sum + (i.pending ?? 0), 0);
  const teams = items.filter((i) => (i.row.previste ?? 0) > 0).length;
  const refreshing = cantieri.isFetching || overview.isFetching;
  const dateLabel = now.toLocaleDateString("it-IT", {
    timeZone: "Europe/Rome",
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const cards = [
    {
      label: "Operativi oggi",
      count: incomplete ? null : operating,
      hint: "Persone previste, rilevazioni o lavori pianificati",
      filter: "oggi" as OggiFilter,
      icon: HardHat,
      color: "text-blue-600 bg-blue-50",
    },
    {
      label: "Da intervenire",
      count: incomplete ? null : attention,
      hint: "Scadenze, pianificazione o informazioni da verificare",
      filter: "attenzione" as OggiFilter,
      icon: AlertTriangle,
      color: "text-orange-600 bg-orange-50",
    },
    {
      label: "Da approvare",
      count: pending,
      hint: "Elementi nei cantieri monitorati, non numero di cantieri",
      filter: "approvare" as OggiFilter,
      icon: ClipboardCheck,
      color: "text-orange-600 bg-orange-50",
    },
    {
      label: "Squadre previste",
      count: items.some((i) => i.row.previste === null) ? null : teams,
      hint: "Cantieri con almeno una persona prevista oggi",
      filter: "squadre" as OggiFilter,
      icon: Users,
      color: "text-blue-600 bg-blue-50",
    },
  ];
  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium capitalize text-muted-foreground">
            {dateLabel}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            La giornata dei cantieri
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {cantieri.isPending
              ? "Carico i cantieri monitorati…"
              : cantieri.isError && !cantieri.data
                ? "Dati non disponibili"
                : `${items.length} cantieri monitorati · priorità e aggiornamenti in un solo posto`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-xs text-muted-foreground sm:block">
            {cantieri.dataUpdatedAt && !cantieri.isError
              ? `Aggiornato alle ${italianTime(cantieri.dataUpdatedAt)}`
              : "In attesa dei dati"}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="rounded-xl"
            onClick={() => void refresh()}
            disabled={refreshing || !companyId}
          >
            <RefreshCcw
              className={cn(
                "mr-1.5 h-4 w-4",
                refreshing && "animate-spin motion-reduce:animate-none",
              )}
            />
            Aggiorna
          </Button>
        </div>
      </header>

      <div
        className="grid grid-cols-2 gap-3 xl:grid-cols-4"
        aria-label="Indicatori della giornata"
      >
        {cards.map((card) => (
          <button
            type="button"
            key={card.filter}
            disabled={!ready || card.count === null}
            aria-pressed={filter === card.filter}
            onClick={() => changeFilter(card.filter)}
            className={cn(
              "rounded-2xl border bg-card p-4 text-left shadow-sm transition-colors hover:border-blue-300 disabled:cursor-wait",
              filter === card.filter &&
                "border-blue-300 ring-2 ring-blue-100 dark:ring-blue-950",
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-muted-foreground">
                {card.label}
              </span>
              <span className={cn("rounded-lg p-1.5", card.color)}>
                <card.icon className="h-4 w-4" />
              </span>
            </div>
            <strong className="mt-2 block text-3xl font-semibold tabular-nums">
              {ready && card.count !== null ? card.count : "—"}
            </strong>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              {card.hint}
            </p>
          </button>
        ))}
      </div>
      {cantieri.isError && (
        <p
          role="alert"
          className="rounded-xl border border-orange-200 bg-orange-50 p-3 text-sm text-orange-900"
        >
          {cantieri.data
            ? "Aggiornamento non riuscito: l’elenco conserva l’ultima lettura, non dati in tempo reale."
            : "Non riesco a leggere i cantieri. Nessun conteggio viene sostituito con zero."}{" "}
          <button
            onClick={() => void refresh()}
            className="font-medium underline"
          >
            Riprova
          </button>
        </p>
      )}
      {overview.isError && (
        <p
          role="alert"
          className="rounded-xl border border-orange-200 bg-orange-50 p-3 text-sm text-orange-900"
        >
          Pianificazione e attività d’ufficio non disponibili. Le informazioni
          mancanti non vengono considerate pari a zero.{" "}
          <button
            onClick={() => void refresh()}
            className="font-medium underline"
          >
            Riprova
          </button>
        </p>
      )}

      <section
        className="overflow-hidden rounded-2xl border bg-card shadow-sm"
        aria-labelledby="cantieri-oggi-title"
      >
        <div className="space-y-3 border-b p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="cantieri-oggi-title" className="text-base font-semibold">
              Dove serve attenzione
            </h2>
            <span className="text-xs text-muted-foreground">
              {visible.length} di {items.length} monitorati · ordinati per
              priorità
            </span>
          </div>
          <div
            className="flex flex-wrap gap-1.5"
            role="group"
            aria-label="Filtra cantieri"
          >
            {filters.map((f) => (
              <button
                type="button"
                key={f.value}
                aria-pressed={filter === f.value}
                onClick={() => changeFilter(f.value)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                  filter === f.value
                    ? "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200"
                    : "border-transparent bg-muted/50 text-muted-foreground hover:bg-muted",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                aria-label="Cerca cantiere"
                placeholder="Cerca nome, codice, cliente o indirizzo…"
                value={search}
                onChange={(e) =>
                  set({ q_oggi: e.target.value, pagina_oggi: null })
                }
                className="rounded-xl pl-9 pr-9"
              />
              {search && (
                <button
                  type="button"
                  className="absolute right-2 top-2 rounded-lg p-1 text-muted-foreground hover:bg-muted"
                  aria-label="Cancella ricerca"
                  onClick={() => set({ q_oggi: null, pagina_oggi: null })}
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <OfficeSelect
              label="Responsabile cantiere"
              value={owner}
              disabled={!ready}
              onValueChange={(value) =>
                set({ responsabile_oggi: value, pagina_oggi: null })
              }
              options={[
                { value: "", label: "Tutti i responsabili" },
                { value: "non-assegnato", label: "Senza responsabile" },
                ...owners,
                ...(owner &&
                owner !== "non-assegnato" &&
                !owners.some((o) => o.value === owner)
                  ? [{ value: owner, label: "Responsabile non disponibile" }]
                  : []),
              ]}
              className="sm:w-64"
            />
          </div>
          {filter === "squadre" && (
            <p className="text-xs text-blue-700">
              Filtro: cantieri con persone previste oggi.{" "}
              <button
                className="underline"
                onClick={() => changeFilter("tutti")}
              >
                Mostra tutti
              </button>
            </p>
          )}
        </div>
        {cantieri.isPending ? (
          <p
            role="status"
            className="p-8 text-center text-sm text-muted-foreground"
          >
            <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
            Carico i cantieri…
          </p>
        ) : pageRows.length === 0 ? (
          <div className="p-8 text-center">
            <Activity className="mx-auto mb-3 h-6 w-6 text-blue-500" />
            <p className="font-medium">
              {items.length
                ? "Nessun cantiere per questi filtri"
                : cantieri.isError
                  ? "Elenco non disponibile"
                  : "Nessun cantiere monitorato"}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              {items.length
                ? "Puoi consultare tutti i monitorati o cambiare ricerca e responsabile."
                : "La pagina mostrerà i cantieri restituiti dalle fonti operative disponibili."}
            </p>
            {items.length > 0 && (
              <Button
                variant="outline"
                className="mt-4 rounded-xl"
                onClick={() =>
                  set({
                    filtro_oggi: "tutti",
                    q_oggi: null,
                    responsabile_oggi: null,
                    pagina_oggi: null,
                  })
                }
              >
                Mostra tutti i monitorati
              </Button>
            )}
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[1000px] text-sm">
                <thead className="border-b bg-muted/20 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="w-[34%] px-4 py-3 font-medium">Cantiere</th>
                    <th className="px-3 py-3 font-medium">Persone oggi</th>
                    <th className="px-3 py-3 font-medium">Situazione</th>
                    <th className="w-[23%] px-3 py-3 font-medium">
                      Prossima azione
                    </th>
                    <th className="px-3 py-3 font-medium">Responsabile</th>
                    <th className="w-10">
                      <span className="sr-only">Apri dettaglio</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((item) => {
                    const state = statoCantiere(item.row, now),
                      action = nextOggiAction(item);
                    const status = item.incomplete
                      ? "Dati incompleti"
                      : item.attention
                        ? "Da verificare"
                        : item.operational &&
                            state.testo === "Non pianificato oggi"
                          ? "Programmato oggi"
                          : state.testo;
                    return (
                      <tr
                        key={item.row.id}
                        className="cursor-pointer border-b transition-colors last:border-0 hover:bg-blue-50/30"
                        onClick={() => open(item)}
                      >
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              open(item);
                            }}
                            className="text-left font-semibold leading-snug text-foreground hover:text-primary"
                            aria-label={`Apri giornata: ${item.title}`}
                          >
                            <span className="line-clamp-2">{item.title}</span>
                          </button>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {item.row.codice || "Codice non indicato"}
                            {item.address ? ` · ${item.address}` : ""}
                          </p>
                          {(item.pending ?? 0) > 0 && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                open(item, "approvazioni");
                              }}
                              className="mt-1.5 rounded-full bg-orange-50 px-2 py-0.5 text-xs font-medium text-orange-800 hover:bg-orange-100"
                              aria-label={`Vedi ${item.pending} da approvare: ${item.title}`}
                            >
                              {item.pending} da approvare{" "}
                              <ArrowRight className="ml-1 inline h-3 w-3" />
                            </button>
                          )}
                        </td>
                        <td className="px-3 py-3 text-xs leading-relaxed">
                          {presenzeLabel(item.row)}
                          {(item.row.rapportini_oggi ?? 0) > 0 && (
                            <p className="mt-1 text-muted-foreground">
                              Rapportino ricevuto
                            </p>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <span
                            className={cn(
                              "inline-flex rounded-full px-2 py-1 text-xs font-medium",
                              item.attention
                                ? "bg-orange-50 text-orange-800"
                                : item.operational
                                  ? "bg-blue-50 text-blue-800"
                                  : "bg-muted text-muted-foreground",
                            )}
                          >
                            {status}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <button
                            type="button"
                            className="text-left text-xs font-medium text-primary hover:underline"
                            onClick={(e) => {
                              e.stopPropagation();
                              open(item, action.view);
                            }}
                          >
                            {action.text}
                          </button>
                          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                            {action.detail}
                          </p>
                        </td>
                        <td className="px-3 py-3 text-xs text-muted-foreground">
                          {item.owner}
                        </td>
                        <td className="pr-3">
                          <button
                            type="button"
                            aria-label={`Dettagli ${item.row.codice || item.title}`}
                            className="rounded-lg p-2 text-muted-foreground hover:bg-muted"
                            onClick={(e) => {
                              e.stopPropagation();
                              open(item);
                            }}
                          >
                            <ChevronRight className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <ul className="divide-y md:hidden">
              {pageRows.map((item) => {
                const action = nextOggiAction(item);
                return (
                  <li key={item.row.id} className="space-y-2 p-4">
                    <button
                      className="text-left text-sm font-semibold"
                      onClick={() => open(item)}
                    >
                      {item.title}
                    </button>
                    <p className="text-xs text-muted-foreground">
                      {item.row.codice} · {item.owner}
                    </p>
                    <p className="text-xs">{presenzeLabel(item.row)}</p>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      {action.detail}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-xl"
                        onClick={() => open(item, action.view)}
                      >
                        {action.text}
                        <ArrowRight className="ml-1 h-3.5 w-3.5" />
                      </Button>
                      {(item.pending ?? 0) > 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="rounded-xl text-orange-700"
                          onClick={() => open(item, "approvazioni")}
                        >
                          {item.pending} da approvare
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
            {pages > 1 && (
              <nav
                aria-label="Pagine cantieri"
                className="flex items-center justify-between gap-3 border-t p-3 text-xs text-muted-foreground"
              >
                <span>
                  {(page - 1) * PAGE_SIZE + 1}–
                  {Math.min(page * PAGE_SIZE, visible.length)} di{" "}
                  {visible.length}
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-lg"
                    disabled={page === 1}
                    aria-label="Pagina precedente"
                    onClick={() => set({ pagina_oggi: String(page - 1) })}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span>
                    {page} / {pages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-lg"
                    disabled={page === pages}
                    aria-label="Pagina successiva"
                    onClick={() => set({ pagina_oggi: String(page + 1) })}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </nav>
            )}
          </>
        )}
      </section>
      <div className="flex flex-wrap items-start justify-between gap-3 text-xs text-muted-foreground">
        <details className="max-w-3xl">
          <summary className="cursor-pointer list-none font-medium">
            <Info className="mr-1.5 inline h-3.5 w-3.5" />
            Come leggere questi dati
          </summary>
          <p className="mt-2 leading-relaxed">
            I monitorati sono la selezione restituita dal servizio operativo,
            non tutti gli ordini aperti. «Operativi oggi» indica persone
            previste, rilevazioni/rapportini di oggi o lavorazioni con date che
            comprendono la giornata. Le rilevazioni non sono una presenza in
            tempo reale. Non consideriamo fermo un cantiere solo perché il
            segnale è vecchio; giorni lun–ven non includono festività o
            calendari specifici. Gli indicatori si riferiscono a tutti i
            monitorati, prima dei filtri.
          </p>
        </details>
        <Link
          className="font-medium text-primary hover:underline"
          to="/azienda/attivita"
        >
          {canApprove ? "Tutte le approvazioni in Attività" : "Apri Attività"} ↗
        </Link>
      </div>
      {active && (
        <Suspense
          fallback={
            <p role="status" className="text-sm text-muted-foreground">
              Apro il dettaglio…
            </p>
          }
        >
          <Panel
            item={active}
            view={view}
            onViewChange={(next) => set({ dettaglio_oggi: next })}
            onClose={close}
            canApprove={canApprove}
            dataReady={ready}
          />
        </Suspense>
      )}
    </div>
  );
}
