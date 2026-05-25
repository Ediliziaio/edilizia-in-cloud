import { useMemo, useState, type ComponentType } from "react";
import { Link, Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Building2,
  CheckCircle2,
  CircleDollarSign,
  ClipboardList,
  FileText,
  Landmark,
  ReceiptText,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  TrendingDown,
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
  accountantCompanies,
  accountantDocumentQueues,
  accountantJobInsights,
  accountantRequests,
  getAccessModeLabel,
  getRiskLabel,
  type AccountantCompany,
  type AccountantRisk,
} from "@/lib/accountantPortal";

type AreaKey =
  | "controllo"
  | "cantieri"
  | "finanza"
  | "magazzino"
  | "tesoreria"
  | "costi"
  | "prima-nota"
  | "giornale-lavori";

const areaTargets: Record<AreaKey, { label: string; href: string; icon: ComponentType<{ className?: string }> }> = {
  controllo: {
    label: "Controllo gestione",
    href: "/azienda/controllo-gestione",
    icon: BarChart3,
  },
  cantieri: {
    label: "Cantieri e commesse",
    href: "/azienda/ordini",
    icon: ClipboardList,
  },
  finanza: {
    label: "Fatture e documenti",
    href: "/azienda/documenti",
    icon: ReceiptText,
  },
  magazzino: {
    label: "Magazzino",
    href: "/azienda/magazzino",
    icon: Warehouse,
  },
  tesoreria: {
    label: "Tesoreria",
    href: "/azienda/tesoreria",
    icon: Landmark,
  },
  costi: {
    label: "Costi",
    href: "/azienda/costi",
    icon: TrendingDown,
  },
  "prima-nota": {
    label: "Prima nota",
    href: "/azienda/prima-nota",
    icon: FileText,
  },
  "giornale-lavori": {
    label: "Giornale lavori",
    href: "/azienda/giornale-lavori",
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
  { label: "Aziende clienti", href: "#aziende", icon: Building2 },
  { label: "Urgenze e richieste", href: "#urgenze", icon: AlertTriangle },
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

function companyInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function companyScopedHref(path: string, company: AccountantCompany, returnTo: string) {
  const separator = path.includes("?") ? "&" : "?";
  const params = new URLSearchParams({
    commercialistaMode: "1",
    commercialistaCompany: company.id,
    commercialistaCompanyName: company.name,
    returnTo,
  });
  return `${path}${separator}${params.toString()}`;
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
  const returnTo = `${basePath}`;
  const primaryHref = companyScopedHref("/azienda/controllo-gestione", company, returnTo);
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
                <Link to={companyScopedHref(item.href, company, returnTo)}>
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
  const basePath = basePathFromLocation(location.pathname);
  const selectedCompany =
    accountantCompanies.find((company) => company.id === companyId) ?? accountantCompanies[0];
  const quickCompany =
    accountantCompanies.find((company) => company.id === quickCompanyId) ?? accountantCompanies[0];

  const redirectArea = companyId
    ? resolveArea(area)
    : section
      ? legacySectionToArea[section]
      : undefined;

  const filteredCompanies = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return accountantCompanies;
    return accountantCompanies.filter((company) =>
      [company.name, company.owner, company.vatNumber, company.monthStatus]
        .join(" ")
        .toLowerCase()
        .includes(normalized),
    );
  }, [query]);

  const totals = useMemo(() => {
    const activeClients = accountantCompanies.length;
    const criticalClients = accountantCompanies.filter((company) => company.risk === "critical").length;
    const missingDocuments = accountantCompanies.reduce((sum, company) => sum + company.missingDocuments, 0);
    const openRequests = accountantRequests.filter((request) => request.status !== "risolta").length;
    const cashExposure = accountantCompanies.reduce((sum, company) => sum + Math.min(company.cashBalance, 0), 0);
    const avgMargin =
      accountantCompanies.reduce((sum, company) => sum + company.expectedMargin, 0) /
      Math.max(accountantCompanies.length, 1);

    return {
      activeClients,
      criticalClients,
      missingDocuments,
      openRequests,
      cashExposure,
      avgMargin,
    };
  }, []);

  const openQuickArea = (areaKey: string) => {
    if (!quickCompany || !(areaKey in areaTargets)) return;
    const target = areaTargets[areaKey as AreaKey];
    navigate(companyScopedHref(target.href, quickCompany, basePath));
  };

  if (companyId && selectedCompany) {
    const target = areaTargets[redirectArea === "dashboard" || !redirectArea ? "controllo" : redirectArea];
    return <Navigate to={companyScopedHref(target.href, selectedCompany, basePath)} replace />;
  }

  if (redirectArea && redirectArea !== "dashboard") {
    const target = areaTargets[redirectArea];
    return <Navigate to={companyScopedHref(target.href, selectedCompany, basePath)} replace />;
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
                Tutte le aziende clienti in un unico cruscotto operativo.
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base">
                Il commercialista non entra in un portale separato: sceglie il cliente e apre la stessa area aziendale,
                gia filtrata su controllo di gestione, cantieri, magazzino, documenti e finanza.
              </p>
            </div>
            <div className="rounded-lg border border-blue-100 bg-blue-50 p-4">
              <div className="flex items-start gap-3">
                <Sparkles className="mt-0.5 h-5 w-5 text-blue-700" />
                <div>
                  <p className="font-semibold text-blue-950">Valore per lo studio</p>
                  <p className="mt-1 text-sm text-blue-900">
                    Meno rincorse sui documenti, piu controllo su margini, materiali, DDT e decisioni operative delle imprese edili.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
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
                  <p>Le pagine aperte sono quelle vere dell'azienda, con dati e flussi gia esistenti.</p>
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
                        <Link to={company ? companyScopedHref("/azienda/documenti", company, basePath) : basePath}>
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
                        <Link to={company ? companyScopedHref("/azienda/ordini", company, basePath) : basePath}>
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
      </main>
      </div>
    </div>
  );
}
