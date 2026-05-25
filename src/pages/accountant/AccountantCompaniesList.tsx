/**
 * /commercialista/aziende — lista aziende clienti dello studio.
 * Filtri per status, ricerca per nome/P.IVA, link diretto a /aziende/:companyId.
 */

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  Clock,
  Eye,
  Pause,
  Search,
  Shield,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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

export default function AccountantCompaniesList() {
  useSEO({ title: "Aziende clienti — Studio", noindex: true });

  const { data: companies = [], isLoading } = useAccountantCompanies();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | AccountantAccessStatus>("all");

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

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Aziende clienti</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Tutte le aziende che ti hanno delegato l'accesso. Clicca per entrare nel
            cruscotto del cliente.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Cerca per nome o P.IVA"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="w-full pl-9 sm:w-72"
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
      </header>

      {isLoading && (
        <Card>
          <CardContent className="p-12 text-center text-sm text-muted-foreground">
            Caricamento aziende...
          </CardContent>
        </Card>
      )}

      {!isLoading && filtered.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-12 text-center">
            <Building2 className="h-12 w-12 text-muted-foreground/40" />
            <div>
              <p className="text-sm font-medium">
                {search || statusFilter !== "all"
                  ? "Nessuna azienda trovata"
                  : "Nessuna azienda collegata"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {search || statusFilter !== "all"
                  ? "Modifica i filtri o la ricerca."
                  : "Le aziende che ti delegheranno l'accesso appariranno qui automaticamente."}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {!isLoading && filtered.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((access) => {
            const status = statusBadge(access.status);
            const StatusIcon = status.icon;
            const company = access.company;
            // Se l'accesso è attivo, click → entra DIRETTAMENTE nell'area azienda
            // in modalità commercialista (sidebar filtrata). Altrimenti hub statico.
            const targetUrl =
              access.status === "active"
                ? buildCommercialistaCompanyUrl({
                    companyId: access.company_id,
                    companyName: company?.name ?? "Azienda",
                  })
                : `/commercialista/aziende/${access.company_id}`;
            return (
              <Card key={access.id} className="overflow-hidden transition-shadow hover:shadow-md">
                <Link to={targetUrl} className="block">
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
                    {access.status === "invited" && (
                      <p className="text-xs text-amber-700">
                        Invito ricevuto — apri Inbox per accettare o rifiutare.
                      </p>
                    )}
                    {access.status === "suspended" && (
                      <p className="text-xs text-muted-foreground">
                        Accesso temporaneamente sospeso dall'azienda.
                      </p>
                    )}
                    {access.status === "active" && (
                      <div className="flex items-center justify-end pt-1 text-xs font-medium text-blue-700">
                        Apri cruscotto
                        <ArrowRight className="ml-1 h-3.5 w-3.5" />
                      </div>
                    )}
                  </CardContent>
                </Link>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
