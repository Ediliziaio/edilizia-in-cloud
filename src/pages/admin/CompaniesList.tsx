import React, { useState, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Building2, Plus, Search, LogIn, ExternalLink, Loader2, Download, ChevronDown } from "lucide-react";
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
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { sectorLabels, statusConfig, sectors } from "@/lib/companyUtils";
import type { CompanyStatus } from "@/types/auth";

export default function CompaniesList() {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sectorFilter, setSectorFilter] = useState("all");
  const [planFilter, setPlanFilter] = useState("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { impersonateCompany } = useAuth();
  const navigate = useNavigate();

  const { data: companies = [], isLoading } = useQuery({
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

  // Fetch order counts per company
  const { data: orderCounts = {} } = useQuery({
    queryKey: ["admin-companies-order-counts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("orders").select("company_id");
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
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Stato" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti gli stati</SelectItem>
            <SelectItem value="trial">Trial</SelectItem>
            <SelectItem value="active">Attivo</SelectItem>
            <SelectItem value="suspended">Sospeso</SelectItem>
            <SelectItem value="expired">Scaduto</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sectorFilter} onValueChange={setSectorFilter}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Settore" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti i settori</SelectItem>
            {sectors.map((s) => (
              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={planFilter} onValueChange={setPlanFilter}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Piano" />
          </SelectTrigger>
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
                <Link to="/admin/aziende/nuova">
                  <Plus className="mr-2 h-4 w-4" />
                  Crea Azienda
                </Link>
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
                  <TableHead>Creata il</TableHead>
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
                      <TableRow
                        className="cursor-pointer"
                        onClick={() => navigate(`/admin/aziende/${company.id}`)}
                      >
                        <TableCell className="w-10 px-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpandedId(isExpanded ? null : company.id);
                            }}
                          >
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
                        <TableCell>
                          <Badge variant="secondary">{sectorLabels[company.sector] || company.sector}</Badge>
                        </TableCell>
                        <TableCell>
                          {plan ? (
                            <Badge variant="outline">{plan.name}</Badge>
                          ) : (
                            <span className="text-sm text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {plan ? (
                            <span className="text-sm font-medium">{formatCurrency(plan.price_monthly)}</span>
                          ) : (
                            <span className="text-sm text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={cfg.variant}>{cfg.label}</Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="text-sm font-medium">{orderCounts[company.id] || 0}</span>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">
                            {format(new Date(company.created_at), "dd/MM/yyyy", { locale: it })}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/admin/aziende/${company.id}`);
                              }}
                            >
                              <ExternalLink className="h-4 w-4 mr-1" />
                              Apri
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={(e) => handleImpersonate(e, company.id)}
                            >
                              <LogIn className="h-4 w-4 mr-1" />
                              Accedi
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                      {isExpanded && (
                        <TableRow className="bg-muted/30 hover:bg-muted/30">
                          <TableCell colSpan={9} className="p-4">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                              <div className="rounded-lg border bg-card p-3">
                                <p className="text-xs text-muted-foreground">Ordini totali</p>
                                <p className="text-lg font-bold">{orderCounts[company.id] || 0}</p>
                              </div>
                              <div className="rounded-lg border bg-card p-3">
                                <p className="text-xs text-muted-foreground">MRR</p>
                                <p className="text-lg font-bold">{plan ? formatCurrency(plan.price_monthly) : "—"}</p>
                              </div>
                              <div className="rounded-lg border bg-card p-3">
                                <p className="text-xs text-muted-foreground">Stato</p>
                                <Badge variant={cfg.variant} className="mt-1">{cfg.label}</Badge>
                              </div>
                              <div className="rounded-lg border bg-card p-3">
                                <p className="text-xs text-muted-foreground">Creata il</p>
                                <p className="text-lg font-bold">{format(new Date(company.created_at), "dd/MM/yyyy", { locale: it })}</p>
                              </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground mb-3">
                              <span><strong>Settore:</strong> {sectorLabels[company.sector] || company.sector}</span>
                              <span><strong>Email:</strong> {company.email}</span>
                              {plan && <span><strong>Piano:</strong> {plan.name}</span>}
                            </div>
                            <div className="flex gap-2">
                              <Button size="sm" onClick={() => navigate(`/admin/aziende/${company.id}`)}>
                                <ExternalLink className="h-4 w-4 mr-1" />
                                Apri dettaglio
                              </Button>
                              <Button variant="outline" size="sm" onClick={(e) => handleImpersonate(e, company.id)}>
                                <LogIn className="h-4 w-4 mr-1" />
                                Accedi come azienda
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