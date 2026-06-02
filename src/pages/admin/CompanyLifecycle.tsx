import { useState, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import { escapeCsvCell } from "@/lib/csvExport";
import { useSuperAdminPermissions } from "@/hooks/useSuperAdminPermissions";
import { useAdminRevenueData, type CompanyHealthScore, type HealthStatus } from "@/hooks/useAdminRevenueData";
import { AccessDenied } from "@/components/admin/AccessDenied";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  Loader2, CheckCircle2, XCircle, Clock, CalendarPlus, ArrowRight,
  AlertTriangle, Search, Building, Download, Flame, TrendingUp, X,
  Heart, ListChecks,
} from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { format, addDays, differenceInDays } from "date-fns";
import { it } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface OnboardingStep {
  key: string;
  label: string;
  done: boolean;
}

function getOnboardingSteps(healthScore: CompanyHealthScore): OnboardingStep[] {
  return [
    { key: "profile", label: "Profilo completo", done: true },
    { key: "staff", label: "Primo utente staff", done: healthScore?.hasStaff || false },
    { key: "customers", label: "Primo cliente", done: healthScore?.hasCustomers || false },
    { key: "orders", label: "Primo ordine", done: healthScore?.hasOrders || false },
    { key: "users", label: "Almeno 2 utenti", done: (healthScore?.userCount || 0) >= 2 },
  ];
}

function OnboardingProgress({ steps }: { steps: OnboardingStep[] }) {
  const completed = steps.filter((s) => s.done).length;
  const pct = Math.round((completed / steps.length) * 100);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{completed}/{steps.length} completati</span>
        <span>{pct}%</span>
      </div>
      <Progress value={pct} className="h-2" />
      <div className="flex flex-wrap gap-1.5 mt-1">
        {steps.map((s) => (
          <Badge key={s.key} variant={s.done ? "default" : "outline"} className="text-xs gap-1">
            {s.done ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3 text-muted-foreground" />}
            {s.label}
          </Badge>
        ))}
      </div>
    </div>
  );
}

// ─── TrialExtensionButton ─────────────────────────────────────

function TrialExtensionButton({
  companyId, currentEnd, extensionsCount = 0,
}: {
  companyId: string;
  currentEnd: string | null;
  extensionsCount?: number;
}) {
  const queryClient = useQueryClient();
  const [showWarning, setShowWarning] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [days, setDays] = useState(14);

  const mutation = useMutation({
    mutationFn: async () => {
      const newEnd = addDays(currentEnd ? new Date(currentEnd) : new Date(), days).toISOString();
      const { error } = await supabase
        .from("companies")
        .update({
          trial_ends_at: newEnd,
          status: "trial",
          trial_extensions_count: extensionsCount + 1,
        })
        .eq("id", companyId);
      if (error) throw error;
      return newEnd;
    },
    onSuccess: () => {
      toast.success(`Trial esteso di ${days} giorni`);
      setShowWarning(false);
      setShowConfirm(false);
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.revenueIntelligence() });
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.companiesFull });
      queryClient.invalidateQueries({ queryKey: ["admin-companies-summary"] });
    },
    onError: () => toast.error("Errore nell'estensione del trial"),
  });

  const handleClick = () => {
    if (extensionsCount >= 3) setShowWarning(true);
    else setShowConfirm(true);
  };

  return (
    <>
      <div className="flex items-center gap-1.5">
        <Input
          type="number"
          min={1}
          max={90}
          value={days}
          onChange={(e) => setDays(Math.max(1, Math.min(90, parseInt(e.target.value) || 14)))}
          className="w-16 h-8 text-xs text-center"
          aria-label="Giorni estensione trial"
        />
        <Button size="sm" variant="outline" onClick={handleClick} disabled={mutation.isPending}>
          {mutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <CalendarPlus className="h-3 w-3 mr-1" />}
          +{days}gg
        </Button>
        {extensionsCount > 0 && (
          <Badge variant={extensionsCount >= 3 ? "destructive" : "secondary"} className="text-xs">
            {extensionsCount}x
          </Badge>
        )}
      </div>
      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Conferma estensione trial</AlertDialogTitle>
            <AlertDialogDescription>
              Vuoi estendere il trial di {days} giorni? Estensioni effettuate: {extensionsCount}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={() => mutation.mutate()}>Conferma</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={showWarning} onOpenChange={setShowWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Attenzione: {extensionsCount} estensioni già effettuate</AlertDialogTitle>
            <AlertDialogDescription>
              Questa azienda ha già ricevuto {extensionsCount} estensioni trial. Proseguire con un'ulteriore estensione di {days} giorni?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={() => mutation.mutate()}>Estendi comunque</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ─── CompanyCard — unificata per tutti i tab ──────────────────

type CardVariant = "trial" | "active" | "suspended" | "expired";

function CompanyCard({
  company, variant, showOnboarding,
}: {
  company: CompanyHealthScore;
  variant: CardVariant;
  showOnboarding: boolean;
}) {
  const steps = useMemo(() => getOnboardingSteps(company), [company]);
  const daysLeft = company.trialEndsAt
    ? differenceInDays(new Date(company.trialEndsAt), new Date())
    : null;

  const visuals: Record<CardVariant, { icon: React.ReactNode; iconBg: string }> = {
    trial: {
      icon: <Building className="h-4 w-4 text-muted-foreground" />,
      iconBg: "bg-muted",
    },
    active: {
      icon: <CheckCircle2 className="h-4 w-4 text-green-600" />,
      iconBg: "bg-green-100 dark:bg-green-900/30",
    },
    suspended: {
      icon: <AlertTriangle className="h-4 w-4 text-orange-600" />,
      iconBg: "bg-orange-100 dark:bg-orange-900/30",
    },
    expired: {
      icon: <AlertTriangle className="h-4 w-4 text-destructive" />,
      iconBg: "bg-destructive/10",
    },
  };
  const viz = visuals[variant];

  const healthBadge: Record<HealthStatus, { variant: "default" | "secondary" | "destructive"; label: string }> = {
    healthy: { variant: "default", label: "Healthy" },
    at_risk: { variant: "secondary", label: "At risk" },
    critical: { variant: "destructive", label: "Critical" },
  };

  return (
    <Card className={cn(
      variant === "expired" && "border-destructive/30",
      variant === "suspended" && "border-orange-300 dark:border-orange-800/60",
    )}>
      <CardContent className="pt-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex-1 space-y-3 min-w-0">
            <div className="flex items-center gap-3">
              <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center shrink-0", viz.iconBg)}>
                {viz.icon}
              </div>
              <div className="min-w-0 flex-1">
                <Link
                  to={`/admin/aziende/${company.companyId}`}
                  className="font-semibold hover:underline truncate block"
                >
                  {company.companyName}
                </Link>
                <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                  {variant === "trial" && daysLeft !== null && (
                    <span className={daysLeft <= 3 ? "text-destructive font-medium" : ""}>
                      <Clock className="h-3 w-3 inline mr-1" />
                      {daysLeft > 0 ? `${daysLeft}gg rimanenti` : "Scaduto"}
                    </span>
                  )}
                  {variant === "expired" && company.trialEndsAt && (
                    <span>Scaduto il {format(new Date(company.trialEndsAt), "d MMM yyyy", { locale: it })}</span>
                  )}
                  {variant === "suspended" && (
                    <Badge variant="destructive" className="text-xs">Sospeso</Badge>
                  )}
                  <Badge
                    variant={healthBadge[company.health].variant}
                    className="text-xs"
                  >
                    Score: {company.score} · {healthBadge[company.health].label}
                  </Badge>
                  <span>{company.orderCount} ordini</span>
                  {company.userCount > 0 && <span>· {company.userCount} utenti</span>}
                  {company.sector && <span>· {company.sector}</span>}
                </div>
              </div>
            </div>
            {showOnboarding && <OnboardingProgress steps={steps} />}
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:justify-end shrink-0">
            {(variant === "trial" || variant === "expired" || (variant === "suspended" && company.trialEndsAt)) && (
              <TrialExtensionButton
                companyId={company.companyId}
                currentEnd={company.trialEndsAt}
                extensionsCount={company.trialExtensionsCount}
              />
            )}
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs"
              asChild
              title="Apri con filtro azienda in Attività (crea follow-up)"
            >
              <Link to={`/admin/attivita?tab=tutte&company=${company.companyId}`}>
                <ListChecks className="h-3.5 w-3.5 mr-1" />
                Task
              </Link>
            </Button>
            <Button size="sm" variant="ghost" asChild title="Apri scheda azienda">
              <Link to={`/admin/aziende/${company.companyId}`}>
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── KPI overview ──────────────────────────────────────────────

function LifecycleKPIs({
  healthScores,
  loading,
}: {
  healthScores: CompanyHealthScore[];
  loading: boolean;
}) {
  const stats = useMemo(() => {
    const total = healthScores.length;
    const trial = healthScores.filter(h => h.status === "trial").length;
    const active = healthScores.filter(h => h.status === "active").length;
    const suspended = healthScores.filter(h => h.status === "suspended").length;
    const expired = healthScores.filter(h => h.status === "expired").length;

    const trialExpiring7d = healthScores.filter(h => {
      if (h.status !== "trial" || !h.trialEndsAt) return false;
      const days = differenceInDays(new Date(h.trialEndsAt), new Date());
      return days >= 0 && days <= 7;
    }).length;

    const critical = healthScores.filter(h => h.health === "critical").length;
    const healthy = healthScores.filter(h => h.health === "healthy").length;
    const avgScore = total > 0
      ? Math.round(healthScores.reduce((s, h) => s + h.score, 0) / total)
      : 0;

    return { total, trial, active, suspended, expired, trialExpiring7d, critical, healthy, avgScore };
  }, [healthScores]);

  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i}><CardContent className="p-3 h-20" /></Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      <KpiCard
        icon={<Building className="h-4 w-4" />}
        label="Aziende totali"
        value={stats.total}
        subtitle={`Score medio ${stats.avgScore}/100`}
        accent="bg-primary/10 text-primary"
      />
      <KpiCard
        icon={<Clock className="h-4 w-4" />}
        label="Trial attivi"
        value={stats.trial}
        subtitle={stats.trialExpiring7d > 0 ? `⚠️ ${stats.trialExpiring7d} in scadenza 7gg` : "tutti in range"}
        accent="bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
        highlight={stats.trialExpiring7d > 0}
      />
      <KpiCard
        icon={<CheckCircle2 className="h-4 w-4" />}
        label="Attive paganti"
        value={stats.active}
        subtitle={stats.total > 0 ? `${Math.round((stats.active / stats.total) * 100)}% del totale` : "—"}
        accent="bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
      />
      <KpiCard
        icon={<AlertTriangle className="h-4 w-4" />}
        label="Sospese"
        value={stats.suspended}
        accent={stats.suspended > 0
          ? "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300"
          : "bg-muted text-muted-foreground"}
      />
      <KpiCard
        icon={<Flame className="h-4 w-4" />}
        label="Critical health"
        value={stats.critical}
        subtitle={stats.healthy > 0 ? `${stats.healthy} healthy` : "—"}
        accent={stats.critical > 0
          ? "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300"
          : "bg-muted text-muted-foreground"}
        highlight={stats.critical > 0}
      />
      <KpiCard
        icon={<XCircle className="h-4 w-4" />}
        label="Win-back pool"
        value={stats.expired}
        subtitle={stats.expired > 0 ? "da recuperare" : "nessuna"}
        accent="bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300"
      />
    </div>
  );
}

function KpiCard({
  icon, label, value, subtitle, accent, highlight,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  subtitle?: string;
  accent: string;
  highlight?: boolean;
}) {
  return (
    <Card className={cn(highlight && "ring-1 ring-rose-300 dark:ring-rose-800")}>
      <CardContent className="p-3 flex items-start gap-2.5">
        <div className={cn("p-1.5 rounded-lg shrink-0", accent)}>{icon}</div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide truncate">{label}</p>
          <p className="text-xl font-bold leading-tight mt-0.5">{value}</p>
          {subtitle && <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{subtitle}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── CSV export ────────────────────────────────────────────────

function exportLifecycleCsv(companies: CompanyHealthScore[], filename: string) {
  const header = [
    "company_id", "company_name", "sector", "status", "score", "health",
    "order_count", "orders_last_30d", "user_count", "last_order_date",
    "has_customers", "has_staff", "has_orders",
    "trial_ends_at", "trial_extensions_count", "price_monthly",
  ];
  const escape = (v: unknown) => escapeCsvCell(v as string | number | null | undefined, ",");
  const keyMap: Record<string, keyof CompanyHealthScore> = {
    company_id: "companyId", company_name: "companyName", sector: "sector",
    status: "status", score: "score", health: "health",
    order_count: "orderCount", orders_last_30d: "ordersLast30d", user_count: "userCount",
    last_order_date: "lastOrderDate",
    has_customers: "hasCustomers", has_staff: "hasStaff", has_orders: "hasOrders",
    trial_ends_at: "trialEndsAt", trial_extensions_count: "trialExtensionsCount",
    price_monthly: "priceMonthly",
  };
  const lines = [
    header.join(","),
    ...companies.map(c =>
      header.map(h => escape(c[keyMap[h]])).join(",")
    ),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ─── Main page ────────────────────────────────────────────────

type SortMode = "name" | "score_asc" | "score_desc" | "daysLeft";
type HealthFilter = "all" | HealthStatus;

export default function CompanyLifecycle() {
  const { permissions } = useSuperAdminPermissions();
  const { data: revenueData, isLoading } = useAdminRevenueData();
  const [search, setSearch] = useState("");
  const [healthFilter, setHealthFilter] = useState<HealthFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("score_asc");
  const [activeTab, setActiveTab] = useState("trial");
  const [visitedTabs, setVisitedTabs] = useState<Set<string>>(() => new Set(["trial"]));
  const onTabChange = (v: string) => {
    setActiveTab(v);
    setVisitedTabs((prev) => {
      if (prev.has(v)) return prev;
      const next = new Set(prev);
      next.add(v);
      return next;
    });
  };
  const isMounted = (k: string) => visitedTabs.has(k);

  if (!permissions.can_manage_companies) return <AccessDenied />;

  const healthScores = revenueData?.healthScores ?? [];

  // Filter: search + health
  const filterAndSort = (list: CompanyHealthScore[]) => {
    const q = search.trim().toLowerCase();
    let out = list.filter((c) => {
      if (q && !(String(c.companyName ?? "").toLowerCase().includes(q)
        || String(c.sector ?? "").toLowerCase().includes(q))) return false;
      if (healthFilter !== "all" && c.health !== healthFilter) return false;
      return true;
    });

    // Sort
    switch (sortMode) {
      case "name":
        out = [...out].sort((a, b) => a.companyName.localeCompare(b.companyName));
        break;
      case "score_asc":
        out = [...out].sort((a, b) => a.score - b.score);
        break;
      case "score_desc":
        out = [...out].sort((a, b) => b.score - a.score);
        break;
      case "daysLeft":
        out = [...out].sort((a, b) => {
          const dA = a.trialEndsAt ? differenceInDays(new Date(a.trialEndsAt), new Date()) : 999;
          const dB = b.trialEndsAt ? differenceInDays(new Date(b.trialEndsAt), new Date()) : 999;
          return dA - dB;
        });
        break;
    }
    return out;
  };

  const trialCompanies = healthScores.filter((h) => h.status === "trial");
  const expiredCompanies = healthScores.filter((h) => h.status === "expired");
  const activeCompanies = healthScores.filter((h) => h.status === "active");
  const suspendedCompanies = healthScores.filter((h) => h.status === "suspended");

  const filteredTrial = filterAndSort(trialCompanies);
  const filteredExpired = filterAndSort(expiredCompanies);
  const filteredActive = filterAndSort(activeCompanies);
  const filteredSuspended = filterAndSort(suspendedCompanies);

  const hasFilters = search.trim() !== "" || healthFilter !== "all";

  const exportAll = () => {
    const ts = format(new Date(), "yyyy-MM-dd");
    exportLifecycleCsv(healthScores, `lifecycle-all-${ts}.csv`);
    toast.success(`Export CSV: ${healthScores.length} aziende`);
  };

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="hidden md:block">
          <h1 className="text-2xl font-bold">Company Lifecycle</h1>
          <p className="text-muted-foreground text-sm">
            Gestisci onboarding, trial, recupero e win-back delle aziende
          </p>
        </div>
        <Button variant="outline" onClick={exportAll} disabled={isLoading || healthScores.length === 0}>
          <Download className="h-4 w-4 mr-2" />
          Esporta CSV
        </Button>
      </div>

      {/* KPI */}
      <LifecycleKPIs healthScores={healthScores} loading={isLoading} />

      {/* Toolbar — mobile: stack full-width, sm+: inline */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
        <div className="relative w-full sm:flex-1 sm:max-w-sm sm:min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Cerca azienda o settore…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
          {search && (
            <button
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => setSearch("")}
              aria-label="Reset ricerca"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:contents">
          <Select value={healthFilter} onValueChange={(v) => setHealthFilter(v as HealthFilter)}>
            <SelectTrigger className="w-full sm:w-[160px]">
              <Heart className="h-4 w-4 mr-1 inline" />
              <SelectValue placeholder="Health" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Ogni health</SelectItem>
              <SelectItem value="healthy">💚 Healthy</SelectItem>
              <SelectItem value="at_risk">🟡 At risk</SelectItem>
              <SelectItem value="critical">🔴 Critical</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sortMode} onValueChange={(v) => setSortMode(v as SortMode)}>
            <SelectTrigger className="w-full sm:w-[200px]">
              <TrendingUp className="h-4 w-4 mr-1 inline" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="score_asc">Score crescente (peggio in alto)</SelectItem>
              <SelectItem value="score_desc">Score decrescente</SelectItem>
              <SelectItem value="daysLeft">Giorni trial rimanenti</SelectItem>
              <SelectItem value="name">Nome A→Z</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {hasFilters && (
          <Button variant="ghost" size="sm" className="h-9 text-xs" onClick={() => {
            setSearch(""); setHealthFilter("all");
          }}>
            <X className="h-3.5 w-3.5 mr-1" /> Reset filtri
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <Tabs value={activeTab} onValueChange={onTabChange}>
          {/* Su mobile: scroll orizzontale (no wrap caotico). Su sm+: wrap normale */}
          <TabsList className="h-auto justify-start overflow-x-auto sm:flex-wrap whitespace-nowrap [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1">
            <TabsTrigger value="trial">
              Trial attivi
              <span className="ml-1.5 rounded bg-muted-foreground/15 px-1.5 text-[10px]">
                {filteredTrial.length}{filteredTrial.length !== trialCompanies.length ? `/${trialCompanies.length}` : ""}
              </span>
            </TabsTrigger>
            <TabsTrigger value="active">
              Attive
              <span className="ml-1.5 rounded bg-muted-foreground/15 px-1.5 text-[10px]">
                {filteredActive.length}{filteredActive.length !== activeCompanies.length ? `/${activeCompanies.length}` : ""}
              </span>
            </TabsTrigger>
            <TabsTrigger value="suspended">
              Sospese
              <span className="ml-1.5 rounded bg-muted-foreground/15 px-1.5 text-[10px]">
                {filteredSuspended.length}{filteredSuspended.length !== suspendedCompanies.length ? `/${suspendedCompanies.length}` : ""}
              </span>
            </TabsTrigger>
            <TabsTrigger value="expired">
              Win-back
              <span className="ml-1.5 rounded bg-muted-foreground/15 px-1.5 text-[10px]">
                {filteredExpired.length}{filteredExpired.length !== expiredCompanies.length ? `/${expiredCompanies.length}` : ""}
              </span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="trial" className="space-y-4 mt-4">
            {isMounted("trial") && (filteredTrial.length === 0 ? (
              <EmptyState
                title="Nessun trial attivo"
                subtitle={hasFilters ? "Nessun risultato per i filtri applicati" : "Non ci sono aziende in fase trial"}
                onReset={hasFilters ? () => { setSearch(""); setHealthFilter("all"); } : undefined}
              />
            ) : (
              filteredTrial.map((c) => <CompanyCard key={c.companyId} company={c} variant="trial" showOnboarding />)
            ))}
          </TabsContent>

          <TabsContent value="active" className="space-y-4 mt-4">
            {isMounted("active") && (filteredActive.length === 0 ? (
              <EmptyState
                title="Nessuna azienda attiva"
                subtitle={hasFilters ? "Nessun risultato per i filtri applicati" : "Non ci sono aziende paganti"}
                onReset={hasFilters ? () => { setSearch(""); setHealthFilter("all"); } : undefined}
              />
            ) : (
              filteredActive.map((c) => <CompanyCard key={c.companyId} company={c} variant="active" showOnboarding={false} />)
            ))}
          </TabsContent>

          <TabsContent value="suspended" className="space-y-4 mt-4">
            {isMounted("suspended") && (filteredSuspended.length === 0 ? (
              <EmptyState
                title="Nessuna azienda sospesa"
                subtitle={hasFilters ? "Nessun risultato per i filtri applicati" : "Nessun account sospeso al momento"}
                onReset={hasFilters ? () => { setSearch(""); setHealthFilter("all"); } : undefined}
              />
            ) : (
              filteredSuspended.map((c) => <CompanyCard key={c.companyId} company={c} variant="suspended" showOnboarding={false} />)
            ))}
          </TabsContent>

          <TabsContent value="expired" className="space-y-4 mt-4">
            {isMounted("expired") && (filteredExpired.length === 0 ? (
              <EmptyState
                title="Nessun win-back disponibile"
                subtitle={hasFilters ? "Nessun risultato per i filtri applicati" : "Tutte le aziende scadute sono già state contattate"}
                onReset={hasFilters ? () => { setSearch(""); setHealthFilter("all"); } : undefined}
              />
            ) : (
              filteredExpired.map((c) => <CompanyCard key={c.companyId} company={c} variant="expired" showOnboarding />)
            ))}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

function EmptyState({
  title, subtitle, onReset,
}: {
  title: string;
  subtitle: string;
  onReset?: () => void;
}) {
  return (
    <Card>
      <CardContent className="py-10 text-center space-y-3">
        <p className="font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
        {onReset && (
          <Button variant="outline" size="sm" onClick={onReset}>
            <X className="h-3.5 w-3.5 mr-1" /> Reset filtri
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
