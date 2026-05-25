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
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  AlertCircle,
  ArrowLeft,
  ArrowUpRight,
  Banknote,
  Calculator,
  Clock,
  Construction,
  Download,
  ExternalLink,
  Eye,
  FileText,
  Loader2,
  Mail,
  ShieldCheck,
  Users,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useSEO } from "@/hooks/useSEO";
import { useAccountantCompanyAccess } from "@/hooks/accountant/useAccountantPortalData";

// Shortcut alle aree dell'azienda. Ogni shortcut apre il modulo aziendale
// reale (CompanyLayout) in modalità "commercialistaMode=1", con sidebar
// limitata + banner "Vista commercialista".
const COMPANY_SHORTCUTS: Array<{
  key: string;
  permission: keyof AccountantPermissions | "always";
  label: string;
  description: string;
  icon: typeof FileText;
  url: string;
}> = [
  {
    key: "cruscotto",
    permission: "always",
    label: "Cruscotto",
    description: "Panoramica generale dell'azienda",
    icon: Eye,
    url: "/azienda/controllo-gestione",
  },
  {
    key: "controllo",
    permission: "management_control",
    label: "Controllo di gestione",
    description: "Margini cantiere, KPI, scostamenti",
    icon: Calculator,
    url: "/azienda/controllo-gestione",
  },
  {
    key: "cantieri",
    permission: "jobs",
    label: "Cantieri & commesse",
    description: "Commesse aperte, magazzino, subappalti",
    icon: Construction,
    url: "/azienda/ordini",
  },
  {
    key: "documenti",
    permission: "documents",
    label: "Fatture & documenti",
    description: "Fatture, scadenzario, prima nota",
    icon: FileText,
    url: "/azienda/documenti",
  },
  {
    key: "tesoreria",
    permission: "finance",
    label: "Tesoreria & finanza",
    description: "Cassa, banche, previsionale",
    icon: Banknote,
    url: "/azienda/tesoreria",
  },
  {
    key: "costi",
    permission: "finance",
    label: "Costi",
    description: "Costi fissi e variabili, fornitori",
    icon: Download,
    url: "/azienda/costi",
  },
  {
    key: "personale",
    permission: "jobs",
    label: "Personale & HR",
    description: "Dipendenti, presenze, stipendi",
    icon: Users,
    url: "/azienda/personale",
  },
];

interface AccountantPermissions {
  finance?: boolean;
  documents?: boolean;
  management_control?: boolean;
  jobs?: boolean;
  requests?: boolean;
  exports?: boolean;
  write_actions?: boolean;
}

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

  const { data: access, isLoading } = useAccountantCompanyAccess(companyId);

  useSEO({
    title: access?.company?.name
      ? `${access.company.name} — Studio`
      : "Azienda — Studio",
    noindex: true,
  });

  const allowedShortcuts = useMemo(() => {
    if (!access) return COMPANY_SHORTCUTS.filter((s) => s.permission === "always");
    return COMPANY_SHORTCUTS.filter((s) => {
      if (s.permission === "always") return true;
      return !!access.permissions?.[s.permission];
    });
  }, [access]);

  function openCompanyArea(url: string) {
    if (!access?.company) return;
    const params = new URLSearchParams({
      commercialistaMode: "1",
      commercialistaCompany: access.company_id,
      commercialistaCompanyName: access.company.name,
      returnTo: `/commercialista/aziende/${access.company_id}`,
    });
    navigate(`${url}?${params.toString()}`);
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
                    {company?.legal_city && <span>{company.legal_city}</span>}
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

      {/* Bottone primario — apre l'area aziendale completa */}
      {access.status === "active" && (
        <Card className="border-blue-200 bg-gradient-to-br from-blue-50 to-white">
          <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex-1">
              <h3 className="text-lg font-bold text-slate-950">
                Apri l'area di {company?.name}
              </h3>
              <p className="mt-1 text-sm text-slate-600">
                Entra direttamente nell'area aziendale con sidebar limitata (no marketing,
                no automazioni) e banner "Vista commercialista" sempre visibile.
              </p>
            </div>
            <Button
              size="lg"
              onClick={() => openCompanyArea("/azienda/controllo-gestione")}
              className="gap-2 bg-blue-700 text-white hover:bg-blue-800"
            >
              Apri area aziendale
              <ArrowUpRight className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Grid shortcut alle singole aree (rispetta permissions) */}
      {access.status === "active" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Accesso rapido alle sezioni</CardTitle>
            <CardDescription>
              Apri direttamente la sezione di cui hai bisogno. Tutte le aree si aprono
              in vista commercialista (Marketing e Vendita esclusi).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {allowedShortcuts.map((shortcut) => {
                const Icon = shortcut.icon;
                return (
                  <button
                    key={shortcut.key}
                    type="button"
                    onClick={() => openCompanyArea(shortcut.url)}
                    className="group flex items-start gap-3 rounded-lg border bg-white p-4 text-left transition-all hover:border-blue-300 hover:shadow-sm"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700 group-hover:bg-blue-100">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold">{shortcut.label}</p>
                        <ExternalLink className="h-3.5 w-3.5 text-muted-foreground transition-colors group-hover:text-blue-700" />
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                        {shortcut.description}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
            <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50/50 p-3 text-xs text-amber-900">
              <span className="font-semibold">Nota:</span> i permessi sono stati definiti
              dall'azienda nell'invito ({modeLabel(access.access_mode)}). Aree non
              disponibili non appaiono in elenco.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
