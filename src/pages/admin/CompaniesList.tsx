import React, { useState, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Building2, Plus, Search, LogIn, ExternalLink, Loader2, Download, ChevronDown, RefreshCw, AlertCircle, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/formatters";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { format, differenceInDays } from "date-fns";
import { it } from "date-fns/locale";
import { sectorLabels, statusConfig, sectors } from "@/lib/companyUtils";
import type { CompanyStatus } from "@/types/auth";

function TrialBadge({ company }: { company: { status: string; trial_ends_at: string | null; created_at: string } }) {
  if (company.status === "trial" && company.trial_ends_at) {
    const daysLeft = differenceInDays(new Date(company.trial_ends_at), new Date());
    const color = daysLeft > 7 ? "text-green-600" : daysLeft >= 3 ? "text-yellow-600" : "text-red-600";
    return (
      <div className="flex items-center gap-1.5">
        <Clock className={`h-3.5 w-3.5 ${color}`} />
        <span className={`text-sm font-medium ${color}`}>
          {daysLeft > 0 ? `${daysLeft}gg rimasti` : "Scaduto"}
        </span>
      </div>
    );
  }
  return (
    <span className="text-sm text-muted-foreground">
      {format(new Date(company.created_at), "dd/MM/yyyy", { locale: it })}
    </span>
  );
}

export default function CompaniesList() {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sectorFilter, setSectorFilter] = useState("all");
  const [planFilter, setPlanFilter] = useState("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { impersonateCompany } = useAuth();
  const navigate = useNavigate();

  const { data: companies = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["admin-companies-full"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("*, subscription_plans:subscription_plan_id(id, name, price_monthly)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: orderCounts = {} } = useQuery({
    queryKey: ["admin-companies-order-counts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("orders").select("company_id").limit(50000);
      if (error) throw error;
      const counts: Record<string, number> = {};
      (data || []).forEach((o) => {
        counts[o.company_id] = (counts[o.company_id] || 0) + 1;
      });
      return counts;
    },
    staleTime: 5 * 60 * 1000,
  });

  const uniquePlans = useMemo(() => {
    const planMap = new Map<string, string>();
    companies.forEach((c) => {
      const plan = c.subscription_plans as { id: string; name: string } | null;
      if (plan) planMap.set(plan.id, plan.name);
    });
    return Array.from(planMap.entries()).map(([id, name]) => ({ id, name }));
  }, [companies]);

  const filteredCompanies = useMemo(() => companies.filter((company) => {
    const matchesSearch =
      company.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      company.email.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || company.status === statusFilter;
    const matchesSector = sectorFilter === "all" || company.sector === sectorFilter;
    const plan = company.subscription_plans as { id: string; name: string } | null;
    const matchesPlan = planFilter === "all" || plan?.id === planFilter;
    return matchesSearch && matchesStatus && matchesSector && matchesPlan;
  }), [companies, searchQuery, statusFilter, sectorFilter, planFilter]);

  const hasActiveFilters = searchQuery || statusFilter !== "all" || sectorFilter !== "all" || planFilter !== "all";

  const handleExportCSV = () => {
    const headers = ["Nome", "Email", "Settore", "Piano", "Stato", "Ordini", "Creata il"];
    const rows = filteredCompanies.map((c) => {
      const plan = c.subscription_plans as { id: string; name: string } | null;
      return [
        c.name, c.email, sectorLabels[c.sector] || c.sector, plan?.name || "—",
        c.status, orderCounts[c.id] || 0, format(new Date(c.created_at), "dd/MM/yyyy"),
      ].join(",");
    });
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "aziende.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const handleImpersonate = async (e: React.MouseEvent, companyId: string) => {
    e.stopPropagation();
    await impersonateCompany(companyId);
    navigate("/azienda");
  };

  if (isError) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Aziende</h1>
          <p className="text-muted-foreground">Gestisci le aziende registrate</p>
        </div>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Errore di caricamento</AlertTitle>
          <AlertDescription className="flex items-center justify-between">
            <span>Impossibile caricare la lista aziende.</span>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-1" />
              Riprova
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Aziende</h1>
          <p className="text-muted-foreground">Gestisci le aziende registrate</p>
        </div>
        <Button asChild>
          <Link to="/admin/aziende/nuova">
            <Plus className="mr-2 h-4 w-4" />
            Nuova Azienda
          </Link>
        </Button>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Cerca per nome o email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Stato" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti gli stati</SelectItem>
            <SelectItem value="trial">Trial</SelectItem>
            <SelectItem value="active">Attivo</SelectItem>
            <SelectItem value="suspended">Sospeso</SelectItem>
            <SelectItem value="expired">Scaduto</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sectorFilter} onValueChange={setSectorFilter}>
          <SelectTrigger className="w-[150px]"><SelectValue placeholder="Settore" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti i settori</SelectItem>
            {sectors.map((s) => (
              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={planFilter} onValueChange={setPlanFilter}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Piano" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti i piani</SelectItem>
            {uniquePlans.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="icon" onClick={handleExportCSV} title="Esporta CSV">
          <Download className="h-4 w-4" />
        </Button>
      </div>

      {hasActiveFilters && !isLoading && (
        <p className="text-sm text-muted-foreground">
          Visualizzando {filteredCompanies.length} di {companies.length} aziende
        </p>
      )}

      {isLoading ? (
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </CardContent>
        </Card>
      ) : filteredCompanies.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">Nessuna azienda trovata</h3>
            <p className="text-muted-foreground text-center mt-2">
              {searchQuery ? "Prova a modificare i termini di ricerca" : "Inizia creando la prima azienda"}
            </p>
            {!searchQuery && (
              <Button asChild className="mt-4">
                <Link to="/admin/aziende/nuova"><Plus className="mr-2 h-4 w-4" />Crea Azienda</Link>
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10" />
                  <TableHead>Azienda</TableHead>
                  <TableHead>Settore</TableHead>
                  <TableHead>Piano</TableHead>
                  <TableHead>MRR</TableHead>
                  <TableHead>Stato</TableHead>
                  <TableHead className="text-center">Ordini</TableHead>
                  <TableHead>Trial / Scadenza</TableHead>
                  <TableHead className="text-right">Azioni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCompanies.map((company) => {
                  const status = (company.status || "trial") as CompanyStatus;
                  const cfg = statusConfig[status] || statusConfig.trial;
                  const plan = company.subscription_plans as { id: string; name: string; price_monthly: number } | null;
                  const isExpanded = expandedId === company.id;

                  return (
                    <React.Fragment key={company.id}>
                      <TableRow className="cursor-pointer" onClick={() => navigate(`/admin/aziende/${company.id}`)}>
                        <TableCell className="w-10 px-2">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); setExpandedId(isExpanded ? null : company.id); }}>
                            <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`} />
                          </Button>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            {company.logo_url ? (
                              <img src={company.logo_url} alt={company.name} className="h-8 w-8 rounded-lg object-cover" />
                            ) : (
                              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                                <Building2 className="h-4 w-4 text-primary" />
                              </div>
                            )}
                            <div>
                              <p className="font-medium">{company.name}</p>
                              <p className="text-xs text-muted-foreground">{company.email}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell><Badge variant="secondary">{sectorLabels[company.sector] || company.sector}</Badge></TableCell>
                        <TableCell>{plan ? <Badge variant="outline">{plan.name}</Badge> : <span className="text-sm text-muted-foreground">—</span>}</TableCell>
                        <TableCell>{plan ? <span className="text-sm font-medium">{formatCurrency(plan.price_monthly)}</span> : <span className="text-sm text-muted-foreground">—</span>}</TableCell>
                        <TableCell><Badge variant={cfg.variant}>{cfg.label}</Badge></TableCell>
                        <TableCell className="text-center"><span className="text-sm font-medium">{orderCounts[company.id] || 0}</span></TableCell>
                        <TableCell><TrialBadge company={company} /></TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); navigate(`/admin/aziende/${company.id}`); }}>
                              <ExternalLink className="h-4 w-4 mr-1" />Apri
                            </Button>
                            <Button variant="outline" size="sm" onClick={(e) => handleImpersonate(e, company.id)}>
                              <LogIn className="h-4 w-4 mr-1" />Accedi
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                      {isExpanded && (
                        <TableRow className="bg-muted/30 hover:bg-muted/30">
                          <TableCell colSpan={9} className="p-4">
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-4">
                              {company.business_name && (
                                <div>
                                  <p className="text-xs text-muted-foreground">Ragione sociale</p>
                                  <p className="text-sm font-medium">{company.business_name}</p>
                                </div>
                              )}
                              {company.vat_number && (
                                <div>
                                  <p className="text-xs text-muted-foreground">P.IVA</p>
                                  <p className="text-sm font-medium">{company.vat_number}</p>
                                </div>
                              )}
                              {company.phone && (
                                <div>
                                  <p className="text-xs text-muted-foreground">Telefono</p>
                                  <p className="text-sm font-medium">{company.phone}</p>
                                </div>
                              )}
                              {company.pec && (
                                <div>
                                  <p className="text-xs text-muted-foreground">PEC</p>
                                  <p className="text-sm font-medium">{company.pec}</p>
                                </div>
                              )}
                              {company.trial_ends_at && (
                                <div>
                                  <p className="text-xs text-muted-foreground">Scadenza trial</p>
                                  <p className="text-sm font-medium">{format(new Date(company.trial_ends_at), "dd/MM/yyyy HH:mm", { locale: it })}</p>
                                </div>
                              )}
                              {company.fiscal_code && (
                                <div>
                                  <p className="text-xs text-muted-foreground">Codice fiscale</p>
                                  <p className="text-sm font-medium">{company.fiscal_code}</p>
                                </div>
                              )}
                              {company.sdi_code && (
                                <div>
                                  <p className="text-xs text-muted-foreground">Codice SDI</p>
                                  <p className="text-sm font-medium">{company.sdi_code}</p>
                                </div>
                              )}
                              {company.website && (
                                <div>
                                  <p className="text-xs text-muted-foreground">Sito web</p>
                                  <p className="text-sm font-medium">{company.website}</p>
                                </div>
                              )}
                            </div>
                            {company.notes && (
                              <div className="mb-4 p-3 rounded-lg border bg-card">
                                <p className="text-xs text-muted-foreground mb-1">Note</p>
                                <p className="text-sm">{company.notes}</p>
                              </div>
                            )}
                            <div className="flex gap-2">
                              <Button size="sm" onClick={() => navigate(`/admin/aziende/${company.id}`)}>
                                <ExternalLink className="h-4 w-4 mr-1" />Apri dettaglio
                              </Button>
                              <Button variant="outline" size="sm" onClick={(e) => handleImpersonate(e, company.id)}>
                                <LogIn className="h-4 w-4 mr-1" />Accedi come azienda
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
