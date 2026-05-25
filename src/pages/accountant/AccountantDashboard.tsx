/**
 * /commercialista — Cruscotto unificato dello studio.
 *
 * KPI aggregate in alto + lista aziende clienti filtrabile (era una pagina
 * separata, ora integrata qui per evitare duplicazione).
 *
 * Da ogni card: pulsante "Accedi piattaforma cliente" → entra in
 * /azienda/cruscotto?commercialistaMode=1&... con sidebar filtrata.
 */

import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  AlertCircle,
  ArrowRight,
  Bell,
  Building2,
  CheckCircle2,
  Clock,
  Eye,
  LogIn,
  Pause,
  Search,
  Shield,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSEO } from "@/hooks/useSEO";
import {
  useAccountantCompanies,
  useAccountantFirm,
  useAccountantNotifications,
  type AccountantAccessStatus,
} from "@/hooks/accountant/useAccountantPortalData";
import { buildCommercialistaCompanyUrl } from "@/lib/commercialistaImpersonation";

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

const STATUS_FILTERS: Array<{ value: "all" | AccountantAccessStatus; label: string }> = [
  { value: "all", label: "Tutte" },
  { value: "active", label: "Attive" },
  { value: "invited", label: "Inviti pending" },
  { value: "suspended", label: "Sospese" },
];

function statusBadge(status: AccountantAccessStatus) {
  switch (status) {
    case "active":
      return { variant: "default" as const, label: "Attivo", icon: CheckCircle2 };
    case "invited":
      return { variant: "secondary" as const, label: "Invitato", icon: Clock };
    case "suspended":
      return { variant: "outline" as const, label: "Sospeso", icon: Pause };
    default:
      return { variant: "destructive" as const, label: status, icon: Shield };
  }
}

function modeLabel(mode: string) {
  if (mode === "read_only") return "Sola lettura";
  if (mode === "operational") return "Operativo";
  if (mode === "approval_required") return "Con approvazione";
  return mode;
}

export default function AccountantDashboard() {
  useSEO({ title: "Cruscotto studio", noindex: true });

  const navigate = useNavigate();
  const { data: firm } = useAccountantFirm();
  const { data: companies = [], isLoading: companiesLoading } = useAccountantCompanies();
  const { data: notifications = [] } = useAccountantNotifications();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | AccountantAccessStatus>("all");

  const stats = useMemo(() => {
    const active = companies.filter((c) => c.status === "active");
    const invited = companies.filter((c) => c.status === "invited");
    const suspended = companies.filter((c) => c.status === "suspended");
    return {
      total: companies.length,
      active: active.length,
      invited: invited.length,
      suspended: suspended.length,
    };
  }, [companies]);

  const unreadNotifications = useMemo(
    () => notifications.filter((n) => !n.is_read),
    [notifications],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return companies.filter((c) => {
      if (statusFilter !== "all" && c.status !== statusFilter) return false;
      if (!q) return true;
      const name = c.company?.name?.toLowerCase() || "";
      const vat = c.company?.vat_number?.toLowerCase() || "";
      const city = c.company?.legal_city?.toLowerCase() || "";
      return name.includes(q) || vat.includes(q) || city.includes(q);
    });
  }, [companies, search, statusFilter]);

  function enterCompany(companyId: string, companyName: string) {
    navigate(
      buildCommercialistaCompanyUrl({
        companyId,
        companyName,
        returnTo: "/commercialista",
      }),
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Cruscotto studio</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Benvenuto in <span className="font-semibold">{firm?.name}</span>. Apri il portale
          di un cliente per operare nella sua piattaforma con vista commercialista.
        </p>
      </header>

      {/* KPI cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">
                  Aziende totali
                </p>
                <p className="mt-1 text-2xl font-bold">{stats.total}</p>
              </div>
              <Building2 className="h-6 w-6 text-blue-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">
                  Attive
                </p>
                <p className="mt-1 text-2xl font-bold text-emerald-600">{stats.active}</p>
              </div>
              <CheckCircle2 className="h-6 w-6 text-emerald-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">
                  Inviti in attesa
                </p>
                <p className="mt-1 text-2xl font-bold text-amber-600">{stats.invited}</p>
              </div>
              <Clock className="h-6 w-6 text-amber-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">
                  Notifiche nuove
                </p>
                <p className="mt-1 text-2xl font-bold">{unreadNotifications.length}</p>
              </div>
              <Bell className="h-6 w-6 text-blue-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Hint primo accesso */}
      {!companiesLoading && stats.total === 0 && (
        <Card className="border-blue-200 bg-blue-50/50">
          <CardContent className="flex items-start gap-3 p-4">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />
            <div className="text-sm">
              <p className="font-medium text-blue-900">Come collegare la tua prima azienda</p>
              <p className="mt-1 text-blue-700">
                Le aziende ti invitano dal loro pannello{" "}
                <span className="font-mono text-xs">Impostazioni → Persone & Utenti → Commercialista</span>{" "}
                inserendo la tua email. Riceverai notifica qui appena qualcuno ti invita.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filtri lista aziende */}
      {stats.total > 0 && (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-lg font-semibold">Le tue aziende clienti</h2>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Cerca per nome o P.IVA"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="w-full pl-9 sm:w-64"
                />
              </div>
              <Select
                value={statusFilter}
                onValueChange={(value: "all" | AccountantAccessStatus) => setStatusFilter(value)}
              >
                <SelectTrigger className="sm:w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_FILTERS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {companiesLoading && (
            <Card>
              <CardContent className="p-12 text-center text-sm text-muted-foreground">
                Caricamento aziende...
              </CardContent>
            </Card>
          )}

          {!companiesLoading && filtered.length === 0 && (
            <Card>
              <CardContent className="flex flex-col items-center gap-3 p-12 text-center">
                <Building2 className="h-12 w-12 text-muted-foreground/40" />
                <div>
                  <p className="text-sm font-medium">Nessuna azienda trovata</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Modifica i filtri o la ricerca.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {!companiesLoading && filtered.length > 0 && (
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {filtered.map((access) => {
                const status = statusBadge(access.status);
                const StatusIcon = status.icon;
                const company = access.company;
                const isActive = access.status === "active";
                const isInvited = access.status === "invited";

                return (
                  <Card
                    key={access.id}
                    className="overflow-hidden transition-shadow hover:shadow-md"
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-start gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-sm font-bold text-blue-700">
                          {companyInitials(company?.name ?? "")}
                        </div>
                        <div className="min-w-0 flex-1">
                          <CardTitle className="truncate text-base">
                            {company?.name ?? "Azienda"}
                          </CardTitle>
                          <CardDescription className="truncate text-xs">
                            {company?.vat_number
                              ? `P.IVA ${company.vat_number}`
                              : company?.legal_city || "—"}
                          </CardDescription>
                        </div>
                      </div>
                    </CardHeader>

                    <CardContent className="space-y-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge variant={status.variant} className="gap-1">
                          <StatusIcon className="h-3 w-3" />
                          {status.label}
                        </Badge>
                        <Badge variant="outline" className="gap-1 font-normal">
                          <Eye className="h-3 w-3" />
                          {modeLabel(access.access_mode)}
                        </Badge>
                      </div>

                      {isInvited && (
                        <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                          Invito ricevuto — apri{" "}
                          <Link to="/commercialista/inbox" className="font-medium underline">
                            Inbox
                          </Link>{" "}
                          per accettare.
                        </div>
                      )}

                      {access.status === "suspended" && (
                        <div className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs text-slate-600">
                          Accesso temporaneamente sospeso dall'azienda.
                        </div>
                      )}

                      {isActive && (
                        <Button
                          className="w-full gap-2 bg-blue-600 hover:bg-blue-700"
                          onClick={() =>
                            enterCompany(access.company_id, company?.name ?? "Azienda")
                          }
                        >
                          <LogIn className="h-4 w-4" />
                          Accedi piattaforma cliente
                          <ArrowRight className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
