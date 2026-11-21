import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowRight, Bell, Building2, CheckCircle2, Clock, LayoutDashboard, ListChecks,
  Loader2, LogIn, Pause, Plus, Search,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSEO } from "@/hooks/useSEO";
import {
  useAccountantCompanies,
  useAccountantFirm,
  useAccountantNotifications,
  type AccountantAccessStatus,
} from "@/hooks/accountant/useAccountantPortalData";
import { buildCommercialistaCompanyUrl } from "@/lib/commercialistaImpersonation";
import { CreateAziendaDialog } from "@/components/accountant/CreateAziendaDialog";
import { StudioPageHeader } from "@/components/accountant/StudioPageHeader";
import { useMyChangeRequests } from "@/hooks/accountant/useAccountantChangeRequests";
import { ACCESS_MODE_OPTIONS } from "@/lib/commercialista/livelliAccesso";
import { cn } from "@/lib/utils";

const STATUS_FILTERS = [
  { value: "all", label: "Tutte le aziende", icon: Building2, tone: "bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300" },
  { value: "active", label: "Attive", icon: CheckCircle2, tone: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300" },
  { value: "invited", label: "Inviti in attesa", icon: Clock, tone: "bg-amber-50 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300" },
  { value: "suspended", label: "Sospese", icon: Pause, tone: "bg-muted text-muted-foreground" },
] as const;

const STATUS_LABELS: Record<AccountantAccessStatus, string> = {
  active: "Attiva", invited: "In attesa", suspended: "Sospesa", revoked: "Revocata",
};

const STATUS_BADGES: Record<AccountantAccessStatus, string> = {
  active: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-300",
  invited: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300",
  suspended: "bg-muted text-muted-foreground",
  revoked: "bg-muted text-muted-foreground",
};

const normalizeSearch = (value: string) => value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
const collator = new Intl.Collator("it", { sensitivity: "base", numeric: true });

export default function AccountantDashboard() {
  useSEO({ title: "Cruscotto studio", noindex: true });

  const { data: firm } = useAccountantFirm();
  const { data: companies = [], isLoading: companiesLoading, isError: companiesError, refetch: refetchCompanies } = useAccountantCompanies();
  const { data: notifications = [], isLoading: notificationsLoading, isError: notificationsError } = useAccountantNotifications();
  const { data: requests, isError: requestsError } = useMyChangeRequests(firm?.id);
  const [params, setParams] = useSearchParams();
  const [createOpen, setCreateOpen] = useState(false);
  const [createKey, setCreateKey] = useState(0);

  const search = params.get("q") ?? "";
  const statusFilter = STATUS_FILTERS.find((item) => item.value === params.get("stato"))?.value ?? "all";
  const modeFilter = ACCESS_MODE_OPTIONS.find((item) => item.value === params.get("delega"))?.value ?? "all";
  const hasFilters = Boolean(search || statusFilter !== "all" || modeFilter !== "all");
  const returnTo = params.size ? `/commercialista?${params.toString()}` : "/commercialista";

  function updateFilter(key: string, value: string) {
    setParams((old) => {
      const next = new URLSearchParams(old);
      if (!value || value === "all") next.delete(key);
      else next.set(key, value);
      return next;
    }, { replace: true });
  }

  function clearFilters() {
    setParams((old) => {
      const next = new URLSearchParams(old);
      for (const key of ["q", "stato", "delega"]) next.delete(key);
      return next;
    }, { replace: true });
  }

  const stats = useMemo(() => ({
    all: companies.length,
    active: companies.filter((row) => row.status === "active").length,
    invited: companies.filter((row) => row.status === "invited").length,
    suspended: companies.filter((row) => row.status === "suspended").length,
  }), [companies]);

  const filtered = useMemo(() => {
    const terms = normalizeSearch(search).trim().split(/\s+/).filter(Boolean);
    return companies.filter((row) => {
      if (statusFilter !== "all" && row.status !== statusFilter) return false;
      if (modeFilter !== "all" && row.access_mode !== modeFilter) return false;
      const company = row.company;
      const searchable = normalizeSearch([company?.name, company?.vat_number, company?.legal_city].join(" "));
      return terms.every((term) => searchable.includes(term));
    }).sort((a, b) => collator.compare(a.company?.name ?? "", b.company?.name ?? ""));
  }, [companies, modeFilter, search, statusFilter]);

  const pendingByCompany = useMemo(() => {
    const counts = new Map<string, number>();
    if (!requestsError) {
      for (const row of requests ?? []) {
        if (row.status === "pending") counts.set(row.company_id, (counts.get(row.company_id) ?? 0) + 1);
      }
    }
    return counts;
  }, [requests, requestsError]);
  const pendingRequests = [...pendingByCompany.values()].reduce((sum, count) => sum + count, 0);
  const unread = notifications.filter((row) => !row.is_read).length;
  const companiesReady = !companiesLoading && !companiesError;
  const requestsHint = requestsError ? "Storico da aggiornare"
    : requests === undefined ? "Caricamento dello storico…"
    : pendingRequests > 0 ? `${pendingRequests} in attesa nelle richieste recenti` : "Nessuna risposta in attesa";
  const inboxHint = [
    companiesReady ? `${stats.invited} ${stats.invited === 1 ? "invito" : "inviti"}` : "",
    !notificationsLoading && !notificationsError ? `${unread} ${unread === 1 ? "notifica nuova" : "notifiche nuove"}` : "",
  ].filter(Boolean).join(" · ") || "Apri la posta dello studio";

  return (
    <div className="space-y-5">
      <StudioPageHeader title="Cruscotto studio" icon={LayoutDashboard} description={firm?.name} action={
        <Button className="gap-1.5" disabled={!firm?.id} onClick={() => { setCreateKey((key) => key + 1); setCreateOpen(true); }}>
          <Plus aria-hidden="true" className="size-4" /> Crea azienda
        </Button>
      } />
      <CreateAziendaDialog key={createKey} open={createOpen} onOpenChange={setCreateOpen} firmId={firm?.id ?? null} />

      <div className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4" role="group" aria-label="Stato delle deleghe">
        {STATUS_FILTERS.map(({ value, label, icon: Icon, tone }) => (
          <button type="button" key={value} aria-pressed={statusFilter === value}
            onClick={() => updateFilter("stato", value)}
            className={cn(
              "flex min-w-0 items-center gap-2 rounded-xl border bg-card p-2.5 text-left transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:gap-3 sm:p-3.5",
              statusFilter === value && "border-blue-500/60 bg-blue-50/50 dark:bg-blue-950/20",
            )}>
            <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg sm:size-9", tone)}>
              <Icon aria-hidden="true" className="size-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-xl font-semibold leading-tight tabular-nums">{companiesReady ? stats[value] : "—"}</span>
              <span className="block text-xs text-muted-foreground">{label}</span>
            </span>
          </button>
        ))}
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_15rem] xl:grid-cols-[minmax(0,1fr)_17rem]">
        <aside aria-labelledby="studio-work" className="min-w-0 space-y-2 lg:order-2">
          <h2 id="studio-work" className="text-sm font-semibold">Da gestire</h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
            <Link to="/commercialista/inbox" className="group flex min-w-0 items-center gap-2 rounded-xl border bg-card p-3 hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <Bell aria-hidden="true" className="size-4 shrink-0 text-blue-700 dark:text-blue-300" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">Apri gli inviti e le notifiche</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{inboxHint}</span>
              </span>
              <ArrowRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground group-hover:text-foreground" />
            </Link>
            <Link to="/commercialista/richieste" className="group flex min-w-0 items-center gap-2 rounded-xl border bg-card p-3 hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <ListChecks aria-hidden="true" className="size-4 shrink-0 text-blue-700 dark:text-blue-300" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">Segui le richieste di modifica</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{requestsHint}</span>
              </span>
              <ArrowRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground group-hover:text-foreground" />
            </Link>
          </div>
          {pendingRequests > 0 && (
            <Link to="/commercialista/richieste?stato=pending" className="inline-flex min-h-9 items-center gap-1 px-1 text-xs font-medium text-blue-700 hover:underline dark:text-blue-300">
              Vedi le richieste in attesa <ArrowRight aria-hidden="true" className="size-3" />
            </Link>
          )}
        </aside>

        <section aria-labelledby="studio-companies" className="min-w-0 rounded-xl border bg-card lg:order-1">
          <div className="border-b p-3 sm:p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="studio-companies" className="text-base font-semibold">Aziende in delega</h2>
              {companiesReady && <span aria-live="polite" className="text-xs text-muted-foreground">{filtered.length} di {stats.all}</span>}
            </div>
            {(stats.all > 0 || hasFilters) && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <div className="relative min-w-0 flex-[1_1_13rem]">
                  <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input type="search" className="pl-9" aria-label="Cerca per azienda, partita IVA o città"
                    placeholder="Cerca azienda, P.IVA o città" value={search} onChange={(event) => updateFilter("q", event.target.value)} />
                </div>
                <select aria-label="Livello di accesso" value={modeFilter}
                  onChange={(event) => updateFilter("delega", event.target.value)}
                  className="h-10 min-w-0 max-w-full rounded-md border border-input bg-background px-2 text-sm focus-visible:ring-2 focus-visible:ring-ring">
                  <option value="all">Tutti i livelli</option>
                  {ACCESS_MODE_OPTIONS.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
                </select>
                {hasFilters && <Button type="button" variant="ghost" onClick={clearFilters}>Azzera filtri</Button>}
              </div>
            )}
          </div>

          {companiesError && <div role="alert" className="flex flex-wrap items-center gap-2 p-4 text-sm">
            Impossibile aggiornare le deleghe.
            <Button variant="outline" size="sm" onClick={() => void refetchCompanies()}>Riprova</Button>
          </div>}
          {companiesLoading && <div role="status" className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
            <Loader2 aria-hidden="true" className="size-4 animate-spin" /> Caricamento aziende…
          </div>}
          {companiesReady && filtered.length === 0 && (
            <div className="p-5 text-sm">
              <p className="font-medium">{hasFilters ? "Nessuna azienda corrisponde ai filtri" : "Nessuna azienda collegata"}</p>
              {!hasFilters && <p className="mt-1 text-muted-foreground">
                L’azienda può invitarti da Impostazioni → Persone → Commercialista usando la tua email.
                Trovi l’invito nella <Link to="/commercialista/inbox" className="font-medium text-blue-700 underline dark:text-blue-300">Inbox</Link>.
              </p>}
            </div>
          )}
          {!companiesLoading && filtered.length > 0 && (
            <ul aria-label="Elenco aziende in delega" className="divide-y">
              {filtered.map((access) => {
                const company = access.company;
                const name = company?.name || "Azienda";
                const metadata = [company?.legal_city, company?.vat_number && `P.IVA ${company.vat_number}`].filter(Boolean).join(" · ");
                const mode = ACCESS_MODE_OPTIONS.find((item) => item.value === access.access_mode);
                const active = access.status === "active";
                const pending = pendingByCompany.get(access.company_id) ?? 0;
                return (
                  <li key={access.id} className="grid min-w-0 gap-2.5 px-3 py-3 sm:px-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                        <Building2 aria-hidden="true" className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <h3 className="break-words text-sm font-semibold">{name}</h3>
                        {metadata && <p className="mt-0.5 break-words text-xs text-muted-foreground">{metadata}</p>}
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          <Badge variant="outline" className={cn("font-medium", STATUS_BADGES[access.status])}>{STATUS_LABELS[access.status]}</Badge>
                          {mode && <Badge variant="outline" className="font-normal text-muted-foreground">{mode.label}</Badge>}
                          {pending > 0 && (
                            <Link to={`/commercialista/richieste?stato=pending&filtroAzienda=${encodeURIComponent(access.company_id)}`}
                              className="rounded px-1 text-xs font-medium text-blue-700 hover:underline dark:text-blue-300">
                              {pending} {pending === 1 ? "richiesta" : "richieste"} in attesa
                            </Link>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex min-w-0 flex-wrap items-center gap-1.5 pl-12 xl:justify-end xl:pl-0">
                      {active && access.access_mode === "approval_required" && (
                        <Button asChild size="sm" variant="outline">
                          <Link to={`/commercialista/richieste?azienda=${encodeURIComponent(access.company_id)}`}>Proponi modifica</Link>
                        </Button>
                      )}
                      {active && (
                        <Button asChild size="sm" className="gap-1.5">
                          <Link aria-label={`Apri ${name}`} to={buildCommercialistaCompanyUrl({ companyId: access.company_id, companyName: name, returnTo })}>
                            <LogIn aria-hidden="true" className="size-3.5" /> Apri azienda
                          </Link>
                        </Button>
                      )}
                      {access.status === "invited" && (
                        <Button asChild size="sm" variant="outline"><Link to="/commercialista/inbox">Vedi invito</Link></Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
