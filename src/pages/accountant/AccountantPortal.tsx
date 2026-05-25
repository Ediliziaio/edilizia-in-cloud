import { useEffect, useMemo, useState, type ComponentType } from "react";
import { Link, Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Bot,
  Building2,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  ClipboardList,
  Download,
  FileCheck2,
  FileText,
  History,
  Landmark,
  Loader2,
  LockKeyhole,
  MessageSquareText,
  ReceiptText,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  UserCheck,
  Users2,
  Warehouse,
} from "lucide-react";
import ediliziaLogo from "@/assets/edilizia-in-cloud-logo.webp";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/formatters";
import {
  accountantAiSuggestions,
  accountantAuditEvents,
  accountantCompanies,
  accountantDeadlines,
  accountantDelegations,
  accountantDocumentQueues,
  accountantJobInsights,
  accountantPriorityItems,
  accountantReports,
  accountantRequests,
  accountantTeamMembers,
  getAccessModeLabel,
  getRiskLabel,
  type AccountantCompany,
  type AccountantRisk,
} from "@/lib/accountantPortal";
import { navigateToSubdomain } from "@/utils/subdomainNav";

type AreaKey =
  | "controllo"
  | "cantieri"
  | "finanza"
  | "magazzino"
  | "tesoreria"
  | "costi"
  | "prima-nota"
  | "giornale-lavori";

const areaTargets: Record<AreaKey, { label: string; icon: ComponentType<{ className?: string }> }> = {
  controllo: {
    label: "Controllo gestione",
    icon: BarChart3,
  },
  cantieri: {
    label: "Cantieri e commesse",
    icon: ClipboardList,
  },
  finanza: {
    label: "Fatture e documenti",
    icon: ReceiptText,
  },
  magazzino: {
    label: "Magazzino",
    icon: Warehouse,
  },
  tesoreria: {
    label: "Tesoreria",
    icon: Landmark,
  },
  costi: {
    label: "Costi",
    icon: TrendingDown,
  },
  "prima-nota": {
    label: "Prima nota",
    icon: FileText,
  },
  "giornale-lavori": {
    label: "Giornale lavori",
    icon: ClipboardList,
  },
};

const legacySectionToArea: Record<string, AreaKey | "dashboard"> = {
  dashboard: "dashboard",
  aziende: "dashboard",
  profilo: "dashboard",
  documenti: "finanza",
  controllo: "controllo",
  cantieri: "cantieri",
  magazzino: "magazzino",
  richieste: "controllo",
};

const studioSidebarItems = [
  { label: "Cruscotto studio", href: "#cruscotto", icon: BarChart3 },
  { label: "Regia priorita", href: "#regia", icon: AlertTriangle },
  { label: "Inbox documenti", href: "#inbox", icon: FileCheck2 },
  { label: "Aziende clienti", href: "#aziende", icon: Building2 },
  { label: "Report e deleghe", href: "#governance", icon: LockKeyhole },
  { label: "Team e audit", href: "#team-audit", icon: UserCheck },
  { label: "Accessi e perimetro", href: "#accessi", icon: ShieldCheck },
];

function basePathFromLocation(pathname: string) {
  return pathname.startsWith("/dev/commercialista") ? "/dev/commercialista" : "/commercialista";
}

function riskClasses(risk: AccountantRisk) {
  if (risk === "critical") return "border-red-200 bg-red-50 text-red-700";
  if (risk === "warning") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

function statusClasses(status: string) {
  if (["mancante", "da_generare", "da_fare"].includes(status)) {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }
  if (["in_scadenza", "bozza", "in_corso", "in_revisione"].includes(status)) {
    return "border-blue-200 bg-blue-50 text-blue-700";
  }
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

function humanStatus(status: string) {
  return status.replaceAll("_", " ");
}

function companyById(companyId: string) {
  return accountantCompanies.find((company) => company.id === companyId);
}

function companyName(companyId: string) {
  return companyById(companyId)?.name ?? "Azienda";
}

function companyAreaFromLabel(area: string): AreaKey {
  const normalized = area.toLowerCase();
  if (normalized.includes("cantier")) return "cantieri";
  if (normalized.includes("document") || normalized.includes("fiscal")) return "finanza";
  if (normalized.includes("tesorer") || normalized.includes("cassa")) return "tesoreria";
  if (normalized.includes("costi")) return "costi";
  return "controllo";
}

function companyInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function accountantAreaHref(basePath: string, company: AccountantCompany, areaKey: AreaKey) {
  return `${basePath}/azienda/${company.id}/${areaKey}`;
}

function shouldRedirectToCommercialistaSubdomain() {
  if (typeof window === "undefined") return false;
  const hostname = window.location.hostname;
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname.includes("192.168.")) return false;
  return !hostname.startsWith("commercialista.");
}

function resolveArea(value: string | undefined): AreaKey {
  if (value && value in areaTargets) return value as AreaKey;
  return "controllo";
}

function MetricCard({
  title,
  value,
  note,
  icon: Icon,
  tone = "blue",
}: {
  title: string;
  value: string;
  note: string;
  icon: ComponentType<{ className?: string }>;
  tone?: "blue" | "green" | "amber" | "red";
}) {
  const toneClass = {
    blue: "bg-blue-50 text-blue-700",
    green: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
    red: "bg-red-50 text-red-700",
  }[tone];

  return (
    <Card className="rounded-lg">
      <CardContent className="flex items-center gap-3 p-4">
        <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", toneClass)}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
          <p className="text-xl font-bold text-foreground">{value}</p>
          <p className="text-xs text-muted-foreground">{note}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function CompanyAccessCard({
  company,
  basePath,
}: {
  company: AccountantCompany;
  basePath: string;
}) {
  const primaryHref = accountantAreaHref(basePath, company, "controllo");
  const areaLinks = Object.entries(areaTargets) as Array<[AreaKey, (typeof areaTargets)[AreaKey]]>;

  return (
    <Card className="rounded-lg">
      <CardHeader className="space-y-3 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-sm font-bold text-blue-700">
              {companyInitials(company.name)}
            </div>
            <div className="min-w-0">
              <CardTitle className="truncate text-base">{company.name}</CardTitle>
              <p className="truncate text-xs text-muted-foreground">
                {company.vatNumber} · {company.owner}
              </p>
            </div>
          </div>
          <Badge variant="outline" className={cn("shrink-0", riskClasses(company.risk))}>
            {getRiskLabel(company.risk)}
          </Badge>
        </div>
        <div className="grid gap-2 text-sm sm:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground">Accesso</p>
            <p className="font-medium">{getAccessModeLabel(company.accessMode)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Ultimo sync</p>
            <p className="font-medium">{company.lastSync}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Stato mese</p>
            <p className="font-medium">{company.monthStatus}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-4">
          <div className="rounded-lg border bg-muted/30 p-3">
            <p className="text-xs text-muted-foreground">Documenti mancanti</p>
            <p className="text-lg font-bold">{company.missingDocuments}</p>
          </div>
          <div className="rounded-lg border bg-muted/30 p-3">
            <p className="text-xs text-muted-foreground">Fatture da vedere</p>
            <p className="text-lg font-bold">{company.invoicesToReview}</p>
          </div>
          <div className="rounded-lg border bg-muted/30 p-3">
            <p className="text-xs text-muted-foreground">Cassa</p>
            <p className={cn("text-lg font-bold", company.cashBalance < 0 ? "text-red-700" : "text-emerald-700")}>
              {formatCurrency(company.cashBalance)}
            </p>
          </div>
          <div className="rounded-lg border bg-muted/30 p-3">
            <p className="text-xs text-muted-foreground">Margine atteso</p>
            <p className="text-lg font-bold">{company.expectedMargin}%</p>
          </div>
        </div>

        <div className="rounded-lg border border-blue-100 bg-blue-50/60 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Prossima azione da consulente</p>
          <p className="mt-1 text-sm text-blue-950">{company.nextAction}</p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <Button asChild className="justify-center">
            <Link to={primaryHref}>
              Entra nell'azienda
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
          <div className="flex flex-wrap gap-2">
            {areaLinks.map(([key, item]) => (
              <Button key={key} asChild size="sm" variant="outline">
                <Link to={accountantAreaHref(basePath, company, key)}>
                  <item.icon className="mr-1.5 h-3.5 w-3.5" />
                  {item.label}
                </Link>
              </Button>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function AccountantAreaWorkspace({
  company,
  areaKey,
  basePath,
}: {
  company: AccountantCompany;
  areaKey: AreaKey;
  basePath: string;
}) {
  const navigate = useNavigate();
  const activeArea = areaTargets[areaKey];
  const ActiveIcon = activeArea.icon;
  const companyRequests = accountantRequests.filter((request) => request.companyId === company.id);
  const companyDocuments = accountantDocumentQueues.filter((queue) => queue.companyId === company.id);
  const companyJobs = accountantJobInsights.filter((job) => job.companyId === company.id);
  const companyReports = accountantReports.filter((report) => report.companyId === company.id);
  const companyDelegations = accountantDelegations.filter((delegation) => delegation.companyId === company.id);
  const areaLinks = Object.entries(areaTargets) as Array<[AreaKey, (typeof areaTargets)[AreaKey]]>;
  const switchCompany = (nextCompanyId: string) => {
    const nextCompany = companyById(nextCompanyId);
    if (!nextCompany) return;
    navigate(accountantAreaHref(basePath, nextCompany, areaKey));
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <header className="sticky top-0 z-20 border-b bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <Link to={basePath} className="flex h-10 w-10 items-center justify-center rounded-lg border bg-white text-blue-700">
              <ArrowRight className="h-4 w-4 rotate-180" />
            </Link>
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Portale commercialista / {activeArea.label}
              </p>
              <h1 className="truncate text-lg font-bold sm:text-xl">{company.name}</h1>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Select value={company.id} onValueChange={switchCompany}>
              <SelectTrigger className="h-10 w-full bg-white sm:w-64">
                <SelectValue placeholder="Cambia azienda" />
              </SelectTrigger>
              <SelectContent>
                {accountantCompanies.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className={cn("shrink-0", riskClasses(company.risk))}>
                {getRiskLabel(company.risk)}
              </Badge>
              <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700">
                {getAccessModeLabel(company.accessMode)}
              </Badge>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-5 px-4 py-5 sm:px-6 lg:py-7">
        <section className="rounded-xl border bg-white p-5 shadow-sm">
          <div className="grid gap-5 lg:grid-cols-[1fr_340px] lg:items-start">
            <div className="space-y-4">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                  <ActiveIcon className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{company.vatNumber} · {company.owner}</p>
                  <h2 className="text-2xl font-bold tracking-tight">
                    {activeArea.label} in modalita commercialista
                  </h2>
                  <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
                    Vista dedicata allo studio: consulti dati, criticita e richieste senza uscire dal perimetro
                    commercialista. Le azioni operative restano soggette ad approvazione dell'azienda.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {areaLinks.map(([key, item]) => (
                  <Button
                    key={key}
                    asChild
                    size="sm"
                    variant={key === areaKey ? "default" : "outline"}
                    className="justify-start"
                  >
                    <Link to={accountantAreaHref(basePath, company, key)}>
                      <item.icon className="mr-1.5 h-3.5 w-3.5" />
                      {item.label}
                    </Link>
                  </Button>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-4">
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 h-5 w-5 text-emerald-700" />
                <div>
                  <p className="font-semibold text-emerald-950">Accesso confinato allo studio</p>
                  <p className="mt-1 text-sm text-emerald-900">
                    Questo utente resta dentro `/commercialista`: non viene mandato nelle route aziendali standard.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-4">
          <MetricCard title="Documenti mancanti" value={String(company.missingDocuments)} note="da recuperare" icon={ReceiptText} tone="amber" />
          <MetricCard title="Fatture da vedere" value={String(company.invoicesToReview)} note="da verificare" icon={FileText} tone="blue" />
          <MetricCard title="Cassa" value={formatCurrency(company.cashBalance)} note="saldo cliente" icon={CircleDollarSign} tone={company.cashBalance < 0 ? "red" : "green"} />
          <MetricCard title="Margine atteso" value={`${company.expectedMargin}%`} note={`${company.activeJobs} commesse attive`} icon={BarChart3} tone="green" />
        </section>

        <section className="grid gap-4 lg:grid-cols-[1fr_360px]">
          <div className="space-y-4">
            <Card className="rounded-lg">
              <CardHeader>
                <CardTitle className="text-base">Prossima azione consigliata</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="rounded-lg border border-blue-100 bg-blue-50 p-4">
                  <p className="text-sm text-blue-950">{company.nextAction}</p>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-lg">
              <CardHeader>
                <CardTitle className="text-base">Cantieri e margini da controllare</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {(companyJobs.length ? companyJobs : accountantJobInsights.slice(0, 2)).map((job) => (
                  <div key={job.id} className="rounded-lg border p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">{job.code}</p>
                        <p className="text-sm text-muted-foreground">{job.title}</p>
                      </div>
                      <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800">
                        {job.status}
                      </Badge>
                    </div>
                    <div className="mt-3">
                      <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                        <span>Margine previsto</span>
                        <span>{job.expectedMargin}%</span>
                      </div>
                      <Progress value={Math.min(Math.max(job.expectedMargin, 0), 40) * 2.5} className="h-2" />
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {job.missingItems.map((item) => (
                        <Badge key={item} variant="outline" className="bg-slate-50">
                          {item}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <aside className="space-y-4">
            <Card className="rounded-lg">
              <CardHeader>
                <CardTitle className="text-base">Richieste aperte</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {(companyRequests.length ? companyRequests : accountantRequests.slice(0, 2)).map((request) => (
                  <div key={request.id} className="rounded-lg border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium">{request.title}</p>
                        <p className="text-xs text-muted-foreground">{request.area} · {request.owner}</p>
                      </div>
                      <Badge variant="outline">{request.due}</Badge>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="rounded-lg">
              <CardHeader>
                <CardTitle className="text-base">Coda documenti</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {(companyDocuments.length ? companyDocuments : accountantDocumentQueues.slice(0, 2)).map((queue) => (
                  <div key={queue.id} className="rounded-lg border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium">{queue.title}</p>
                        <p className="text-xs text-muted-foreground">{queue.cta}</p>
                      </div>
                      <Badge variant="outline" className={riskClasses(queue.severity)}>
                        {queue.count}
                      </Badge>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="rounded-lg">
              <CardHeader>
                <CardTitle className="text-base">Report e deleghe</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {companyReports.map((report) => (
                  <div key={report.id} className="rounded-lg border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium">{report.title}</p>
                        <p className="text-xs text-muted-foreground">{report.period}</p>
                      </div>
                      <Badge variant="outline" className={statusClasses(report.status)}>
                        {humanStatus(report.status)}
                      </Badge>
                    </div>
                  </div>
                ))}
                {companyDelegations.map((delegation) => (
                  <div key={delegation.id} className="rounded-lg border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium">{delegation.title}</p>
                        <p className="text-xs text-muted-foreground">{delegation.expiresAt}</p>
                      </div>
                      <Badge variant="outline" className={statusClasses(delegation.status)}>
                        {humanStatus(delegation.status)}
                      </Badge>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </aside>
        </section>
      </main>
    </div>
  );
}

export default function AccountantPortal() {
  const navigate = useNavigate();
  const location = useLocation();
  const { section, companyId, area } = useParams<{
    section?: string;
    companyId?: string;
    area?: string;
  }>();
  const [query, setQuery] = useState("");
  const [quickCompanyId, setQuickCompanyId] = useState(accountantCompanies[0]?.id ?? "");
  const [domainRedirecting] = useState(() => shouldRedirectToCommercialistaSubdomain());
  const [activeAiId, setActiveAiId] = useState(accountantAiSuggestions[0]?.id ?? "");
  const [sentRequestId, setSentRequestId] = useState<string | null>(null);
  const [generatedReportId, setGeneratedReportId] = useState<string | null>(null);
  const basePath = basePathFromLocation(location.pathname);
  const selectedCompany = companyId
    ? accountantCompanies.find((company) => company.id === companyId)
    : undefined;
  const quickCompany =
    accountantCompanies.find((company) => company.id === quickCompanyId) ?? accountantCompanies[0];
  const defaultCompany = accountantCompanies[0];

  const redirectArea = companyId
    ? resolveArea(area)
    : section
      ? legacySectionToArea[section]
      : undefined;

  const filteredCompanies = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const list = !normalized ? accountantCompanies : accountantCompanies.filter((company) =>
      [company.name, company.owner, company.vatNumber, company.monthStatus]
        .join(" ")
        .toLowerCase()
        .includes(normalized),
    );
    return [...list].sort((a, b) => {
      const aScore = accountantPriorityItems.find((item) => item.companyId === a.id)?.score ?? 0;
      const bScore = accountantPriorityItems.find((item) => item.companyId === b.id)?.score ?? 0;
      return bScore - aScore;
    });
  }, [query]);

  const activeAiSuggestion =
    accountantAiSuggestions.find((suggestion) => suggestion.id === activeAiId) ?? accountantAiSuggestions[0];

  const priorityItems = useMemo(
    () => [...accountantPriorityItems].sort((a, b) => b.score - a.score),
    [],
  );

  const totals = useMemo(() => {
    const activeClients = accountantCompanies.length;
    const criticalClients = accountantCompanies.filter((company) => company.risk === "critical").length;
    const missingDocuments = accountantCompanies.reduce((sum, company) => sum + company.missingDocuments, 0);
    const openRequests = accountantRequests.filter((request) => request.status !== "risolta").length;
    const deadlinesToday = accountantDeadlines.filter((deadline) => deadline.due === "oggi").length;
    const missingDelegations = accountantDelegations.filter((delegation) => delegation.status === "mancante").length;
    const reportsToGenerate = accountantReports.filter((report) => report.status !== "pronto").length;
    const cashExposure = accountantCompanies.reduce((sum, company) => sum + Math.min(company.cashBalance, 0), 0);
    const avgMargin =
      accountantCompanies.reduce((sum, company) => sum + company.expectedMargin, 0) /
      Math.max(accountantCompanies.length, 1);

    return {
      activeClients,
      criticalClients,
      missingDocuments,
      openRequests,
      deadlinesToday,
      missingDelegations,
      reportsToGenerate,
      cashExposure,
      avgMargin,
    };
  }, []);

  useEffect(() => {
    if (!domainRedirecting) return;
    const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    navigateToSubdomain(currentPath, "commercialista");
  }, [domainRedirecting]);

  const openQuickArea = (areaKey: string) => {
    if (!quickCompany || !(areaKey in areaTargets)) return;
    navigate(accountantAreaHref(basePath, quickCompany, areaKey as AreaKey));
  };

  if (domainRedirecting) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3 rounded-xl border bg-white px-6 py-5 shadow-sm">
          <Loader2 className="h-6 w-6 animate-spin text-blue-700" />
          <p className="text-sm font-medium text-slate-700">Apro il portale commercialista dedicato...</p>
        </div>
      </div>
    );
  }

  if (companyId && !selectedCompany) {
    return <Navigate to={basePath} replace />;
  }

  if (companyId && selectedCompany) {
    const activeArea = redirectArea === "dashboard" || !redirectArea ? "controllo" : redirectArea;
    return <AccountantAreaWorkspace company={selectedCompany} areaKey={activeArea} basePath={basePath} />;
  }

  if (redirectArea && redirectArea !== "dashboard" && defaultCompany) {
    return <Navigate to={accountantAreaHref(basePath, defaultCompany, redirectArea)} replace />;
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950 md:flex">
      <aside className="hidden w-72 shrink-0 border-r bg-white md:sticky md:top-0 md:flex md:h-screen md:flex-col">
        <div className="border-b px-5 py-4">
          <Link to={basePath} className="flex min-w-0 items-center gap-3">
            <img src={ediliziaLogo} alt="EdiliziaInCloud" className="h-9 w-auto object-contain" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">Studio Commercialista</p>
              <p className="truncate text-xs text-muted-foreground">Dashboard consulente multi-azienda</p>
            </div>
          </Link>
        </div>

        <div className="space-y-3 border-b px-4 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Scelte rapide</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Scegli cliente e area da aprire.</p>
          </div>
          <Select value={quickCompany?.id ?? ""} onValueChange={setQuickCompanyId}>
            <SelectTrigger className="h-10 w-full bg-white">
              <SelectValue placeholder="Seleziona azienda" />
            </SelectTrigger>
            <SelectContent>
              {accountantCompanies.map((company) => (
                <SelectItem key={company.id} value={company.id}>
                  {company.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select key={quickCompany?.id ?? "quick-area"} onValueChange={openQuickArea}>
            <SelectTrigger className="h-10 w-full bg-white">
              <SelectValue placeholder="Apri area cliente" />
            </SelectTrigger>
            <SelectContent>
              {(Object.entries(areaTargets) as Array<[AreaKey, (typeof areaTargets)[AreaKey]]>).map(([key, item]) => (
                <SelectItem key={key} value={key}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <a
            href="#accessi"
            className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
          >
            <Settings className="h-4 w-4" />
            <span>Impostazioni studio</span>
          </a>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-4" aria-label="Navigazione studio commercialista">
          {studioSidebarItems.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-blue-50 hover:text-blue-700"
            >
              <item.icon className="h-4 w-4" />
              <span>{item.label}</span>
            </a>
          ))}
        </nav>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 border-b bg-white/95 backdrop-blur md:hidden">
          <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
            <Link to={basePath} className="flex min-w-0 items-center gap-3">
              <img src={ediliziaLogo} alt="EdiliziaInCloud" className="h-9 w-auto object-contain" />
              <div className="hidden min-w-0 sm:block">
                <p className="truncate text-sm font-semibold">Studio Commercialista</p>
                <p className="truncate text-xs text-muted-foreground">Dashboard consulente multi-azienda</p>
              </div>
            </Link>
            <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700">
              Consulente attivo
            </Badge>
          </div>
        </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-5 sm:px-6 lg:py-7">
        <div className="hidden items-center justify-between gap-3 md:flex">
          <div>
            <p className="text-sm font-medium text-muted-foreground">Area commercialista</p>
            <h1 className="text-2xl font-bold tracking-tight">Studio e aziende clienti</h1>
          </div>
          <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700">
            Consulente attivo
          </Badge>
        </div>

        <section id="cruscotto" className="rounded-xl border bg-white p-5 shadow-sm sm:p-6">
          <div className="grid gap-5 lg:grid-cols-[1.3fr_0.7fr] lg:items-end">
            <div>
              <Badge variant="outline" className="mb-3 border-emerald-200 bg-emerald-50 text-emerald-700">
                Accesso studio
              </Badge>
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                Studio OS per commercialisti edili.
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base">
                Priorita, clienti, documenti, scadenze, richieste, report e deleghe in un unico flusso,
                con accesso confinato alle aree abilitate di ogni azienda cliente.
              </p>
            </div>
            <div className="rounded-lg border border-blue-100 bg-blue-50 p-4">
              <div className="flex items-start gap-3">
                <Sparkles className="mt-0.5 h-5 w-5 text-blue-700" />
                <div>
                  <p className="font-semibold text-blue-950">Valore per lo studio</p>
                  <p className="mt-1 text-sm text-blue-900">
                    Meno rincorse sui documenti, piu controllo su margini, cassa, cantieri e decisioni operative.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-4 xl:grid-cols-8">
          <MetricCard
            title="Aziende"
            value={String(totals.activeClients)}
            note="clienti collegati"
            icon={Building2}
            tone="blue"
          />
          <MetricCard
            title="Critiche"
            value={String(totals.criticalClients)}
            note="da gestire oggi"
            icon={AlertTriangle}
            tone={totals.criticalClients > 0 ? "red" : "green"}
          />
          <MetricCard
            title="Documenti"
            value={String(totals.missingDocuments)}
            note="mancanti o da agganciare"
            icon={ReceiptText}
            tone="amber"
          />
          <MetricCard
            title="Richieste"
            value={String(totals.openRequests)}
            note="aperte con clienti"
            icon={Users2}
            tone="blue"
          />
          <MetricCard
            title="Cassa negativa"
            value={formatCurrency(totals.cashExposure)}
            note="esposizione clienti"
            icon={CircleDollarSign}
            tone={totals.cashExposure < 0 ? "red" : "green"}
          />
          <MetricCard
            title="Margine medio"
            value={`${totals.avgMargin.toFixed(1)}%`}
            note="sulle commesse attive"
            icon={BarChart3}
            tone="green"
          />
          <MetricCard
            title="Scadenze"
            value={String(totals.deadlinesToday)}
            note="oggi"
            icon={CalendarClock}
            tone={totals.deadlinesToday > 0 ? "amber" : "green"}
          />
          <MetricCard
            title="Deleghe"
            value={String(totals.missingDelegations)}
            note="da sistemare"
            icon={LockKeyhole}
            tone={totals.missingDelegations > 0 ? "red" : "green"}
          />
        </section>

        <section id="regia" className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          <Card className="rounded-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertTriangle className="h-4 w-4 text-red-600" />
                Regia priorita multi-azienda
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {priorityItems.map((item, index) => {
                const company = companyById(item.companyId);
                const areaKey = companyAreaFromLabel(item.area);
                return (
                  <div key={item.id} className="rounded-lg border p-3">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-700">
                            {index + 1}
                          </span>
                          <Badge variant="outline" className={riskClasses(item.severity)}>
                            {getRiskLabel(item.severity)}
                          </Badge>
                          <span className="text-xs font-medium text-muted-foreground">{companyName(item.companyId)}</span>
                        </div>
                        <p className="mt-2 font-semibold">{item.title}</p>
                        <p className="mt-1 text-sm leading-5 text-muted-foreground">{item.reason}</p>
                      </div>
                      <div className="flex shrink-0 flex-col gap-2 sm:items-end">
                        <Badge variant="outline" className="bg-slate-50">
                          Score {item.score}
                        </Badge>
                        <Badge variant="outline" className="bg-blue-50 text-blue-700">
                          {item.due}
                        </Badge>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{item.area}</Badge>
                      {company ? (
                        <Button asChild size="sm" variant="outline">
                          <Link to={accountantAreaHref(basePath, company, areaKey)}>
                            {item.action}
                            <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                          </Link>
                        </Button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card className="rounded-lg border-blue-100 bg-blue-50/40">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Bot className="h-4 w-4 text-blue-700" />
                AI dello studio
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {accountantAiSuggestions.map((suggestion) => (
                  <Button
                    key={suggestion.id}
                    size="sm"
                    variant={activeAiId === suggestion.id ? "default" : "outline"}
                    onClick={() => setActiveAiId(suggestion.id)}
                  >
                    <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                    {suggestion.label}
                  </Button>
                ))}
              </div>
              <div className="rounded-lg border bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Domanda</p>
                <p className="mt-1 text-sm font-medium text-slate-950">{activeAiSuggestion?.prompt}</p>
                <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Risposta operativa</p>
                  <p className="mt-1 text-sm leading-6 text-blue-950">{activeAiSuggestion?.response}</p>
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <Button variant="outline" className="justify-start bg-white">
                  <Send className="mr-2 h-4 w-4" />
                  Prepara richieste
                </Button>
                <Button variant="outline" className="justify-start bg-white">
                  <Download className="mr-2 h-4 w-4" />
                  Genera report
                </Button>
              </div>
            </CardContent>
          </Card>
        </section>

        <section id="inbox" className="grid gap-4 xl:grid-cols-[1fr_360px]">
          <Card className="rounded-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <FileCheck2 className="h-4 w-4 text-blue-700" />
                Inbox documentale unica
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              {accountantDocumentQueues.map((queue) => {
                const company = companyById(queue.companyId);
                return (
                  <div key={queue.id} className="rounded-lg border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold">{queue.title}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{companyName(queue.companyId)}</p>
                      </div>
                      <Badge variant="outline" className={riskClasses(queue.severity)}>
                        {queue.count}
                      </Badge>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {company ? (
                        <Button asChild size="sm" variant="outline">
                          <Link to={accountantAreaHref(basePath, company, "finanza")}>
                            Apri pratica
                          </Link>
                        </Button>
                      ) : null}
                      <Button size="sm" onClick={() => setSentRequestId(queue.id)}>
                        <Send className="mr-1.5 h-3.5 w-3.5" />
                        Richiedi
                      </Button>
                    </div>
                    {sentRequestId === queue.id ? (
                      <p className="mt-2 text-xs font-medium text-emerald-700">
                        Richiesta preparata per {company?.owner ?? "cliente"}.
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card className="rounded-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <CalendarClock className="h-4 w-4 text-amber-700" />
                Scadenziario studio
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {accountantDeadlines.map((deadline) => (
                <div key={deadline.id} className="rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">{deadline.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {companyName(deadline.companyId)} · {deadline.owner}
                      </p>
                    </div>
                    <Badge variant="outline" className={statusClasses(deadline.status)}>
                      {deadline.due}
                    </Badge>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Badge variant="outline" className="bg-slate-50">
                      {deadline.type}
                    </Badge>
                    <Badge variant="outline" className={statusClasses(deadline.status)}>
                      {humanStatus(deadline.status)}
                    </Badge>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>

        <section id="aziende" className="grid gap-4 lg:grid-cols-[1fr_360px]">
          <div className="space-y-4">
            <div className="flex flex-col gap-3 rounded-lg border bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold">Aziende clienti</h2>
                <p className="text-sm text-muted-foreground">
                  Entra nella singola azienda per lavorare sulle pagine operative reali.
                </p>
              </div>
              <div className="relative w-full sm:w-80">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="pl-9"
                  placeholder="Cerca azienda, P.IVA, titolare..."
                />
              </div>
            </div>

            {filteredCompanies.map((company) => (
              <CompanyAccessCard key={company.id} company={company} basePath={basePath} />
            ))}

            {filteredCompanies.length === 0 && (
              <div className="rounded-lg border bg-white p-8 text-center text-sm text-muted-foreground">
                Nessuna azienda trovata con questi criteri.
              </div>
            )}
          </div>

          <aside className="space-y-4">
            <Card id="accessi" className="rounded-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <ShieldCheck className="h-4 w-4 text-emerald-700" />
                  Perimetro accesso
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />
                  <p>Il menu aziendale viene filtrato su controllo gestione, cantieri, magazzino e finanza.</p>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />
                  <p>Le pagine restano nel portale commercialista e usano il perimetro cliente selezionato.</p>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />
                  <p>Commesse, documenti e magazzino sono consultabili; creazione e modifica restano bloccate.</p>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />
                  <p>Il ritorno allo studio resta sempre disponibile dalla barra superiore.</p>
                </div>
              </CardContent>
            </Card>

            <Card id="urgenze" className="rounded-lg">
              <CardHeader>
                <CardTitle className="text-base">Urgenze studio</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {accountantDocumentQueues.slice(0, 4).map((queue) => {
                  const company = accountantCompanies.find((item) => item.id === queue.companyId);
                  return (
                    <div key={queue.id} className="rounded-lg border p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium">{queue.title}</p>
                          <p className="text-xs text-muted-foreground">{company?.name}</p>
                        </div>
                        <Badge variant="outline" className={riskClasses(queue.severity)}>
                          {queue.count}
                        </Badge>
                      </div>
                      <Button asChild variant="ghost" size="sm" className="mt-2 h-8 px-0 text-blue-700 hover:bg-transparent">
                        <Link to={company ? accountantAreaHref(basePath, company, "finanza") : basePath}>
                          {queue.cta}
                          <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                        </Link>
                      </Button>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            <Card className="rounded-lg">
              <CardHeader>
                <CardTitle className="text-base">Cantieri da attenzionare</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {accountantJobInsights.slice(0, 3).map((job) => {
                  const company = accountantCompanies.find((item) => item.id === job.companyId);
                  return (
                    <div key={job.id} className="rounded-lg border p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold">{job.code}</p>
                          <p className="text-xs text-muted-foreground">{job.title}</p>
                        </div>
                        <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800">
                          {job.status}
                        </Badge>
                      </div>
                      <div className="mt-3">
                        <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                          <span>Margine previsto</span>
                          <span>{job.expectedMargin}%</span>
                        </div>
                        <Progress value={Math.min(Math.max(job.expectedMargin, 0), 40) * 2.5} className="h-2" />
                      </div>
                      <Button asChild variant="ghost" size="sm" className="mt-2 h-8 px-0 text-blue-700 hover:bg-transparent">
                        <Link to={company ? accountantAreaHref(basePath, company, "cantieri") : basePath}>
                          Apri commesse
                          <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                        </Link>
                      </Button>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </aside>
        </section>

        <section id="governance" className="grid gap-4 xl:grid-cols-[1fr_360px]">
          <Card className="rounded-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Download className="h-4 w-4 text-blue-700" />
                Report mensili automatici
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-3">
              {accountantReports.map((report) => (
                <div key={report.id} className="rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold">{report.title}</p>
                      <p className="text-xs text-muted-foreground">{companyName(report.companyId)} · {report.period}</p>
                    </div>
                    <Badge variant="outline" className={statusClasses(report.status)}>
                      {humanStatus(report.status)}
                    </Badge>
                  </div>
                  <div className="mt-3 space-y-1">
                    {report.highlights.map((highlight) => (
                      <div key={highlight} className="flex items-start gap-2 text-xs text-muted-foreground">
                        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                        <span>{highlight}</span>
                      </div>
                    ))}
                  </div>
                  <Button
                    size="sm"
                    variant={report.status === "pronto" ? "outline" : "default"}
                    className="mt-3 w-full"
                    onClick={() => setGeneratedReportId(report.id)}
                  >
                    {report.status === "pronto" ? "Apri report" : "Genera report"}
                  </Button>
                  {generatedReportId === report.id ? (
                    <p className="mt-2 text-xs font-medium text-emerald-700">Report pronto per revisione studio.</p>
                  ) : null}
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="rounded-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <LockKeyhole className="h-4 w-4 text-slate-700" />
                Contratti e deleghe
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {accountantDelegations.map((delegation) => (
                <div key={delegation.id} className="rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">{delegation.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {companyName(delegation.companyId)} · {delegation.expiresAt}
                      </p>
                    </div>
                    <Badge variant="outline" className={statusClasses(delegation.status)}>
                      {humanStatus(delegation.status)}
                    </Badge>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {delegation.scope.map((scope) => (
                      <Badge key={scope} variant="outline" className="bg-slate-50 text-[11px]">
                        {scope}
                      </Badge>
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>

        <section id="team-audit" className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
          <Card className="rounded-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <UserCheck className="h-4 w-4 text-blue-700" />
                Collaboratori dello studio
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {accountantTeamMembers.map((member) => (
                <div key={member.id} className="rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold">{member.name}</p>
                      <p className="text-xs text-muted-foreground">{member.role}</p>
                    </div>
                    <Badge variant="outline" className="bg-blue-50 text-blue-700">
                      {member.openTasks} task
                    </Badge>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-md bg-slate-50 p-2">
                      <p className="text-muted-foreground">Clienti</p>
                      <p className="font-semibold">{member.clients}</p>
                    </div>
                    <div className="rounded-md bg-slate-50 p-2">
                      <p className="text-muted-foreground">Focus</p>
                      <p className="font-semibold">{member.focus}</p>
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="rounded-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <History className="h-4 w-4 text-slate-700" />
                Audit log studio-cliente
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {accountantAuditEvents.map((event) => (
                <div key={event.id} className="flex gap-3 rounded-lg border p-3">
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                    <MessageSquareText className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm">
                      <span className="font-semibold">{event.actor}</span> {event.action}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {companyName(event.companyId)} · {event.target} · {event.when}
                    </p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>
      </main>
      </div>
    </div>
  );
}
