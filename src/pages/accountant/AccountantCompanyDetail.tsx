/**
 * /commercialista/aziende/:companyId — pagina dedicata di una singola azienda.
 *
 * Header con info azienda + access info, tabs:
 *  - Cruscotto (overview KPI cantieri/finanza/documenti)
 *  - Finanza & tesoreria
 *  - Documenti
 *  - Cantieri & commesse
 *  - Controllo di gestione
 *  - Richieste documentali
 *  - Esportazioni
 *
 * Ogni tab viene reso solo se permesso dai permissions del access record.
 */

import { useMemo } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  AlertCircle,
  ArrowLeft,
  Banknote,
  Building2,
  Calculator,
  Clock,
  Construction,
  Download,
  Eye,
  FileText,
  Inbox,
  Loader2,
  Mail,
  ShieldCheck,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSEO } from "@/hooks/useSEO";
import { useAccountantCompanyAccess } from "@/hooks/accountant/useAccountantPortalData";
import { cn } from "@/lib/utils";

const AREA_TABS: Array<{
  key: string;
  permission: string;
  label: string;
  icon: typeof FileText;
}> = [
  { key: "cruscotto", permission: "", label: "Cruscotto", icon: Eye },
  { key: "finanza", permission: "finance", label: "Finanza", icon: Banknote },
  { key: "documenti", permission: "documents", label: "Documenti", icon: FileText },
  { key: "cantieri", permission: "jobs", label: "Cantieri", icon: Construction },
  { key: "controllo", permission: "management_control", label: "Controllo gestione", icon: Calculator },
  { key: "richieste", permission: "requests", label: "Richieste", icon: Inbox },
  { key: "export", permission: "exports", label: "Esportazioni", icon: Download },
];

function modeLabel(mode: string) {
  if (mode === "read_only") return "Sola lettura";
  if (mode === "operational") return "Operativo";
  if (mode === "approval_required") return "Con approvazione";
  return mode;
}

function companyInitials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join("") || "?"
  );
}

export default function AccountantCompanyDetail() {
  const { companyId } = useParams<{ companyId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const { data: access, isLoading } = useAccountantCompanyAccess(companyId);

  useSEO({
    title: access?.company?.name
      ? `${access.company.name} — Studio`
      : "Azienda — Studio",
    noindex: true,
  });

  const activeTab = searchParams.get("tab") || "cruscotto";

  const allowedTabs = useMemo(() => {
    if (!access) return AREA_TABS.filter((t) => !t.permission);
    return AREA_TABS.filter((t) => !t.permission || access.permissions?.[t.permission]);
  }, [access]);

  function handleTabChange(value: string) {
    setSearchParams({ tab: value }, { replace: true });
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!access) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 p-12 text-center">
          <AlertCircle className="h-12 w-12 text-amber-500" />
          <div>
            <h2 className="text-lg font-semibold">Azienda non trovata</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Non risulti delegato a questa azienda, oppure l'accesso è stato revocato.
            </p>
          </div>
          <Button onClick={() => navigate("/commercialista/aziende")} variant="outline" className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Torna alle aziende
          </Button>
        </CardContent>
      </Card>
    );
  }

  const company = access.company;
  const isInvited = access.status === "invited";
  const isSuspended = access.status === "suspended";

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="w-fit gap-2 text-muted-foreground hover:text-foreground"
        >
          <Link to="/commercialista/aziende">
            <ArrowLeft className="h-4 w-4" />
            Tutte le aziende
          </Link>
        </Button>

        <Card>
          <CardHeader className="pb-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-base font-bold text-blue-700">
                  {companyInitials(company?.name ?? "")}
                </div>
                <div>
                  <CardTitle className="text-2xl">{company?.name}</CardTitle>
                  <CardDescription className="mt-1 flex flex-wrap items-center gap-3 text-xs">
                    {company?.vat_number && <span>P.IVA {company.vat_number}</span>}
                    {company?.fiscal_code && <span>CF {company.fiscal_code}</span>}
                    {company?.city && <span>{company.city}</span>}
                  </CardDescription>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant={
                    access.status === "active"
                      ? "default"
                      : access.status === "invited"
                        ? "secondary"
                        : "outline"
                  }
                >
                  {access.status === "active"
                    ? "Accesso attivo"
                    : access.status === "invited"
                      ? "Invito in attesa"
                      : access.status === "suspended"
                        ? "Sospeso"
                        : "Revocato"}
                </Badge>
                <Badge variant="outline" className="gap-1">
                  <ShieldCheck className="h-3 w-3" />
                  {modeLabel(access.access_mode)}
                </Badge>
              </div>
            </div>
          </CardHeader>
        </Card>
      </div>

      {/* Invito pending banner */}
      {isInvited && (
        <Card className="border-amber-200 bg-amber-50/50">
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <Clock className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
              <div>
                <p className="text-sm font-semibold text-amber-900">
                  Invito in attesa di accettazione
                </p>
                <p className="text-xs text-amber-800">
                  {company?.name} ti ha invitato come commercialista. Accetta dall'Inbox per
                  iniziare a operare.
                </p>
              </div>
            </div>
            <Button asChild className="bg-amber-600 text-white hover:bg-amber-700">
              <Link to="/commercialista/inbox">Apri Inbox</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Sospeso banner */}
      {isSuspended && (
        <Card className="border-slate-200 bg-slate-50">
          <CardContent className="flex items-center gap-3 p-4">
            <AlertCircle className="h-5 w-5 text-slate-600" />
            <p className="text-sm text-slate-700">
              L'azienda ha temporaneamente sospeso il tuo accesso. Non puoi operare
              finché non viene riattivato.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Notes */}
      {access.notes && (
        <Card>
          <CardContent className="flex items-start gap-3 p-4">
            <Mail className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <p className="text-sm italic text-muted-foreground">{access.notes}</p>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 p-1 sm:w-auto">
          {allowedTabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <TabsTrigger key={tab.key} value={tab.key} className="gap-1.5 text-xs sm:text-sm">
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
              </TabsTrigger>
            );
          })}
        </TabsList>

        {/* Cruscotto */}
        <TabsContent value="cruscotto" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Cruscotto azienda</CardTitle>
              <CardDescription>
                Panoramica rapida dei dati principali di {company?.name}.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {allowedTabs
                  .filter((t) => t.key !== "cruscotto")
                  .map((tab) => {
                    const Icon = tab.icon;
                    return (
                      <button
                        key={tab.key}
                        type="button"
                        onClick={() => handleTabChange(tab.key)}
                        className="group flex flex-col items-start gap-2 rounded-lg border bg-white p-4 text-left transition-all hover:border-blue-300 hover:shadow-sm"
                      >
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-700 group-hover:bg-blue-100">
                          <Icon className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold">{tab.label}</p>
                          <p className="text-xs text-muted-foreground">
                            Apri sezione
                          </p>
                        </div>
                      </button>
                    );
                  })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Placeholder per le altre tabs — verranno integrati con i moduli esistenti */}
        {allowedTabs
          .filter((t) => t.key !== "cruscotto")
          .map((tab) => (
            <TabsContent key={tab.key} value={tab.key} className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <tab.icon className="h-4 w-4 text-blue-700" />
                    {tab.label}
                  </CardTitle>
                  <CardDescription>
                    Stai operando su <span className="font-semibold">{company?.name}</span>{" "}
                    in modalità <span className="font-semibold">{modeLabel(access.access_mode)}</span>.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ComingSoonPlaceholder area={tab.label} accessMode={access.access_mode} />
                </CardContent>
              </Card>
            </TabsContent>
          ))}
      </Tabs>
    </div>
  );
}

function ComingSoonPlaceholder({
  area,
  accessMode,
}: {
  area: string;
  accessMode: string;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed bg-slate-50/50 p-8 text-center">
      <div className={cn(
        "flex h-12 w-12 items-center justify-center rounded-full",
        "bg-blue-100 text-blue-700",
      )}>
        <Building2 className="h-6 w-6" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium">Sezione {area} in arrivo</p>
        <p className="max-w-md text-xs text-muted-foreground">
          Qui verrà integrata la vista live della sezione "{area}" dell'azienda
          (mode: {modeLabel(accessMode)}), con dati reali sincronizzati dal modulo
          aziendale corrispondente.
        </p>
      </div>
    </div>
  );
}
