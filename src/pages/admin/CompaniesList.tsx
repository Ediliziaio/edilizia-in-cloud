import React, { useState, useMemo, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Building2, Plus, Search, LogIn, ExternalLink, Loader2, Download, ChevronDown, RefreshCw, AlertCircle, Clock, Users, ArrowUpDown, ArrowUp, ArrowDown, LayoutList, Kanban, Heart } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
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
import { sectorLabels, statusConfig, sectors, calculateHealthScore } from "@/lib/companyUtils";
import type { CompanyStatus } from "@/types/auth";
import { useSuperAdminPermissions } from "@/hooks/useSuperAdminPermissions";
import { AccessDenied } from "@/components/admin/AccessDenied";
import { CompanyPipelineView } from "@/components/admin/company/CompanyPipelineView";
import { CompaniesKPIStrip } from "@/components/admin/company/CompaniesKPIStrip";
import { CompanyTagsCell } from "@/components/admin/company/CompanyTagsCell";
import { CompanyQuickActions } from "@/components/admin/company/CompanyQuickActions";
import { CompanyExpandedRow } from "@/components/admin/company/CompanyExpandedRow";
import { BulkActionsBar } from "@/components/admin/company/BulkActionsBar";

const TrialBadge = React.forwardRef<HTMLDivElement, { company: { status: string; trial_ends_at: string | null; created_at: string } }>(
  ({ company, ...props }, ref) => {
    if (company.status === "trial" && company.trial_ends_at) {
      const daysLeft = differenceInDays(new Date(company.trial_ends_at), new Date());
      const color = daysLeft > 7 ? "text-green-600" : daysLeft >= 3 ? "text-yellow-600" : "text-red-600";
      return (
        <div ref={ref} {...props} className="flex items-center gap-1.5">
          <Clock className={`h-3.5 w-3.5 ${color}`} />
          <span className={`text-sm font-medium ${color}`}>
            {daysLeft > 0 ? `${daysLeft}gg rimasti` : "Scaduto"}
          </span>
        </div>
      );
    }
    return (
      <span ref={ref as React.Ref<HTMLSpanElement>} {...props} className="text-sm text-muted-foreground">
        {format(new Date(company.created_at), "dd/MM/yyyy", { locale: it })}
      </span>
    );
  }
);
TrialBadge.displayName = "TrialBadge";

const LastAccessBadge = ({ lastAccess }: { lastAccess: string | null }) => {
  if (!lastAccess) return <span className="text-xs text-muted-foreground">Mai</span>;
  const days = differenceInDays(new Date(), new Date(lastAccess));
  const color = days <= 7 ? "text-green-600" : days <= 30 ? "text-yellow-600" : "text-red-600";
  const dotColor = days <= 7 ? "bg-green-500" : days <= 30 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-1.5">
      <span className={`h-2 w-2 rounded-full ${dotColor}`} />
      <span className={`text-xs font-medium ${color}`}>
        {days === 0 ? "Oggi" : `${days}gg fa`}
      </span>
    </div>
  );
};

type SortKey = "name" | "sector" | "plan" | "mrr" | "status" | "orders" | "trial" | "users" | "lastAccess";
type SortDir = "asc" | "desc";

export default function CompaniesList() {
  const { permissions } = useSuperAdminPermissions();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sectorFilter, setSectorFilter] = useState("all");
  const [planFilter, setPlanFilter] = useState("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [viewMode, setViewMode] = useState<"list" | "pipeline">("list");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const { impersonateCompany } = useAuth();
  const navigate = useNavigate();

  const toggleSort = useCallback((key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }, [sortKey]);

  const SortIcon = useMemo(() => {
    const Comp = React.memo(({ col }: { col: SortKey }) => {
      if (sortKey !== col) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-40" />;
      return sortDir === "asc" ? <ArrowUp className="h-3 w-3 ml-1" /> : <ArrowDown className="h-3 w-3 ml-1" />;
    });
    Comp.displayName = "SortIcon";
    return Comp;
  }, [sortKey, sortDir]);

  const { data: allCompanies = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["admin-companies-full"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("*, subscription_plans:subscription_plan_id(id, name, price_monthly, max_orders, max_users)")
        .eq("is_platform_admin_company", false)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });

  // Enforce allowed_company_ids for restricted super admins
  const companies = useMemo(() => {
    if (permissions.allowed_company_ids?.length) {
      return allCompanies.filter((c: any) => permissions.allowed_company_ids!.includes(c.id));
    }
    return allCompanies;
  }, [allCompanies, permissions.allowed_company_ids]);

  const { data: orderStats = {} } = useQuery({
    queryKey: ["admin-companies-order-stats"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_company_order_stats");
      if (error) throw error;
      const stats: Record<string, { count: number; totalValue: number; lastOrderDate: string | null }> = {};
      (data || []).forEach((row: any) => {
        stats[row.company_id] = {
          count: Number(row.order_count) || 0,
          totalValue: Number(row.total_value) || 0,
          lastOrderDate: row.last_order_date || null,
        };
      });
      return stats;
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: userCounts = {} } = useQuery({
    queryKey: ["admin-companies-user-counts"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_company_user_counts");
      if (error) throw error;
      const counts: Record<string, number> = {};
      (data || []).forEach((row: any) => {
        if (row.company_id) {
          counts[row.company_id] = Number(row.user_count) || 0;
        }
      });
      return counts;
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: healthData = {} } = useQuery({
    queryKey: ["admin-companies-health"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_company_health_data");
      if (error) throw error;
      const map: Record<string, { score: number; health: string; lastOrderDate: string | null; order_count: number; user_count: number; has_customers: boolean; has_staff: boolean }> = {};
      (data || []).forEach((h: any) => {
        const input = {
          order_count: Number(h.order_count) || 0,
          user_count: Number(h.user_count) || 0,
          has_customers: !!h.has_customers,
          has_staff: !!h.has_staff,
          orders_last_30d: h.orders_last_30d,
          last_order_date: h.last_order_date,
        };
        const { score, health } = calculateHealthScore(input);
        map[h.company_id] = { score, health, lastOrderDate: h.last_order_date, ...input };
      });
      return map;
    },
    staleTime: 5 * 60 * 1000,
  });

  // Last access per company
  const { data: lastAccessData = {} } = useQuery({
    queryKey: ["admin-companies-last-access"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_company_last_access");
      if (error) throw error;
      const map: Record<string, string | null> = {};
      (data || []).forEach((row: any) => {
        map[row.company_id] = row.last_access || null;
      });
      return map;
    },
    staleTime: 5 * 60 * 1000,
  });

  // Company tags
  const { data: companyTags = {} } = useQuery({
    queryKey: ["company-tags"],
    queryFn: async () => {
      const { data, error } = await supabase.from("company_tags").select("*").order("created_at");
      if (error) throw error;
      const map: Record<string, Array<{ id: string; tag: string; color: string }>> = {};
      (data || []).forEach((row: any) => {
        if (!map[row.company_id]) map[row.company_id] = [];
        map[row.company_id].push({ id: row.id, tag: row.tag, color: row.color });
      });
      return map;
    },
    staleTime: 2 * 60 * 1000,
  });



  // Latest CRM notes per company
  const { data: latestNotes = {} } = useQuery({
    queryKey: ["admin-companies-latest-notes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_notes")
        .select("company_id, content, created_at, author_id")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      const map: Record<string, { content: string; created_at: string; authorName: string }> = {};
      const authorIds = [...new Set((data || []).map((n: any) => n.author_id))];
      let authorMap: Record<string, string> = {};
      if (authorIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, first_name, last_name")
          .in("id", authorIds);
        (profiles || []).forEach((p: any) => {
          authorMap[p.id] = `${p.first_name || ""} ${p.last_name || ""}`.trim() || "Admin";
        });
      }
      (data || []).forEach((n: any) => {
        if (!map[n.company_id]) {
          map[n.company_id] = {
            content: n.content,
            created_at: n.created_at,
            authorName: authorMap[n.author_id] || "Admin",
          };
        }
      });
      return map;
    },
    staleTime: 2 * 60 * 1000,
  });

  const uniquePlans = useMemo(() => {
    const planMap = new Map<string, string>();
    companies.forEach((c) => {
      const plan = c.subscription_plans as { id: string; name: string } | null;
      if (plan) planMap.set(plan.id, plan.name);
    });
    return Array.from(planMap.entries()).map(([id, name]) => ({ id, name }));
  }, [companies]);

  const filteredCompanies = useMemo(() => {
    let result = companies.filter((company) => {
      const matchesSearch =
        company.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        company.email.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === "all" || company.status === statusFilter;
      const matchesSector = sectorFilter === "all" || company.sector === sectorFilter;
      const plan = company.subscription_plans as { id: string; name: string } | null;
      const matchesPlan = planFilter === "all" || plan?.id === planFilter;
      return matchesSearch && matchesStatus && matchesSector && matchesPlan;
    });

    if (sortKey) {
      const dir = sortDir === "asc" ? 1 : -1;
      result = [...result].sort((a, b) => {
        const planA = a.subscription_plans as { id: string; name: string; price_monthly: number } | null;
        const planB = b.subscription_plans as { id: string; name: string; price_monthly: number } | null;
        switch (sortKey) {
          case "name": return dir * a.name.localeCompare(b.name);
          case "sector": return dir * (a.sector || "").localeCompare(b.sector || "");
          case "plan": return dir * (planA?.name || "").localeCompare(planB?.name || "");
          case "mrr": return dir * ((planA?.price_monthly || 0) - (planB?.price_monthly || 0));
          case "status": return dir * (a.status || "").localeCompare(b.status || "");
          case "orders": return dir * ((orderStats[a.id]?.count || 0) - (orderStats[b.id]?.count || 0));
          case "users": return dir * ((userCounts[a.id] || 0) - (userCounts[b.id] || 0));
          case "lastAccess": {
            const la = lastAccessData[a.id] ? new Date(lastAccessData[a.id]!).getTime() : 0;
            const lb = lastAccessData[b.id] ? new Date(lastAccessData[b.id]!).getTime() : 0;
            return dir * (la - lb);
          }
          case "trial": {
            const dateA = a.trial_ends_at ? new Date(a.trial_ends_at).getTime() : new Date(a.created_at).getTime();
            const dateB = b.trial_ends_at ? new Date(b.trial_ends_at).getTime() : new Date(b.created_at).getTime();
            return dir * (dateA - dateB);
          }
          default: return 0;
        }
      });
    }

    return result;
  }, [companies, searchQuery, statusFilter, sectorFilter, planFilter, sortKey, sortDir, orderStats, userCounts, lastAccessData]);

  const hasActiveFilters = searchQuery || statusFilter !== "all" || sectorFilter !== "all" || planFilter !== "all";

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      if (prev.size === filteredCompanies.length) return new Set();
      return new Set(filteredCompanies.map((c) => c.id));
    });
  }, [filteredCompanies]);

  const handleExportCSV = () => {
    const headers = ["Nome", "Email", "Settore", "Piano", "Stato", "Ordini", "Utenti", "MRR", "Stripe Customer ID", "Data Creazione", "Fine Trial"];
    const exportList = selectedIds.size > 0
      ? filteredCompanies.filter((c) => selectedIds.has(c.id))
      : filteredCompanies;
    const rows = exportList.map((c) => {
      const plan = c.subscription_plans as { id: string; name: string; price_monthly: number } | null;
      return [
        `"${c.name}"`, `"${c.email}"`, `"${sectorLabels[c.sector] || c.sector}"`, `"${plan?.name || "—"}"`,
        c.status, (orderStats[c.id]?.count || 0), (userCounts[c.id] || 0),
        plan?.price_monthly || 0, `"${c.stripe_customer_id || ""}"`,
        format(new Date(c.created_at), "dd/MM/yyyy"),
        c.trial_ends_at ? format(new Date(c.trial_ends_at), "dd/MM/yyyy") : "",
      ].join(",");
    });
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `aziende_${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImpersonate = async (e: React.MouseEvent, companyId: string) => {
    e.stopPropagation();
    await impersonateCompany(companyId, permissions);
    navigate("/azienda");
  };

  if (!permissions.can_manage_companies) return <AccessDenied />;

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

      {/* KPI Strip */}
      <CompaniesKPIStrip
        companies={companies.map((c) => ({
          id: c.id,
          status: c.status,
          subscription_plans: c.subscription_plans as { price_monthly: number } | null,
        }))}
        healthData={healthData}
      />

      {/* Bulk Actions Bar */}
      <BulkActionsBar
        selectedIds={selectedIds}
        companies={filteredCompanies}
        onClearSelection={() => setSelectedIds(new Set())}
      />

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
        <div className="flex border rounded-md">
          <Button variant={viewMode === "list" ? "secondary" : "ghost"} size="icon" onClick={() => setViewMode("list")} title="Vista Lista">
            <LayoutList className="h-4 w-4" />
          </Button>
          <Button variant={viewMode === "pipeline" ? "secondary" : "ghost"} size="icon" onClick={() => setViewMode("pipeline")} title="Vista Pipeline">
            <Kanban className="h-4 w-4" />
          </Button>
        </div>
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
      ) : viewMode === "pipeline" ? (
        <CompanyPipelineView
          companies={filteredCompanies.map((c) => ({
            ...c,
            subscription_plans: c.subscription_plans as { name: string; price_monthly: number } | null,
          }))}
          healthScores={healthData}
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10 px-2">
                    <Checkbox
                      checked={selectedIds.size === filteredCompanies.length && filteredCompanies.length > 0}
                      onCheckedChange={toggleSelectAll}
                    />
                  </TableHead>
                  <TableHead className="w-10" />
                  <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("name")}>
                    <span className="inline-flex items-center">Azienda<SortIcon col="name" /></span>
                  </TableHead>
                  <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("sector")}>
                    <span className="inline-flex items-center">Settore<SortIcon col="sector" /></span>
                  </TableHead>
                  <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("plan")}>
                    <span className="inline-flex items-center">Piano<SortIcon col="plan" /></span>
                  </TableHead>
                  <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("mrr")}>
                    <span className="inline-flex items-center">MRR<SortIcon col="mrr" /></span>
                  </TableHead>
                  <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("status")}>
                    <span className="inline-flex items-center">Stato<SortIcon col="status" /></span>
                  </TableHead>
                  <TableHead className="text-center cursor-pointer select-none" onClick={() => toggleSort("users")}>
                    <span className="inline-flex items-center"><Users className="h-3 w-3 mr-1" />Utenti<SortIcon col="users" /></span>
                  </TableHead>
                  <TableHead className="text-center cursor-pointer select-none" onClick={() => toggleSort("orders")}>
                    <span className="inline-flex items-center">Ordini<SortIcon col="orders" /></span>
                  </TableHead>
                  <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("lastAccess")}>
                    <span className="inline-flex items-center">Ultimo Accesso<SortIcon col="lastAccess" /></span>
                  </TableHead>
                  <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("trial")}>
                    <span className="inline-flex items-center">Trial / Scadenza<SortIcon col="trial" /></span>
                  </TableHead>
                  <TableHead className="text-center">
                    <span className="inline-flex items-center"><Heart className="h-3 w-3 mr-1" />Health</span>
                  </TableHead>
                  <TableHead>Tag</TableHead>
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
                       <TableRow className={`cursor-pointer ${selectedIds.has(company.id) ? "bg-primary/5" : ""}`} onClick={() => navigate(`/admin/aziende/${company.id}`)}>
                        <TableCell className="w-10 px-2" onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={selectedIds.has(company.id)}
                            onCheckedChange={() => toggleSelect(company.id)}
                          />
                        </TableCell>
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
                        <TableCell className="text-center">
                          <span className="text-sm font-medium">{userCounts[company.id] || 0}</span>
                        </TableCell>
                        <TableCell className="text-center"><span className="text-sm font-medium">{orderStats[company.id]?.count || 0}</span></TableCell>
                        <TableCell>
                          <LastAccessBadge lastAccess={lastAccessData[company.id] || null} />
                        </TableCell>
                        <TableCell><TrialBadge company={company} /></TableCell>
                        <TableCell className="text-center">
                          {(() => {
                            const hd = healthData[company.id];
                            if (!hd) return <span className="text-xs text-muted-foreground">—</span>;
                            const colors: Record<string, string> = { healthy: "bg-green-500/10 text-green-700 border-green-500/30", at_risk: "bg-amber-500/10 text-amber-700 border-amber-500/30", critical: "bg-red-500/10 text-red-700 border-red-500/30" };
                            const labels: Record<string, string> = { healthy: "Healthy", at_risk: "At Risk", critical: "Critical" };
                            return <Badge variant="outline" className={`text-[10px] ${colors[hd.health]}`}>{labels[hd.health]} {hd.score}</Badge>;
                          })()}
                        </TableCell>
                        <TableCell>
                          <CompanyTagsCell companyId={company.id} tags={companyTags[company.id] || []} />
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <CompanyQuickActions company={company} />
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
                          <TableCell colSpan={14} className="p-4">
                            <CompanyExpandedRow
                              company={company}
                              orderStats={orderStats[company.id]}
                              healthData={healthData[company.id]}
                              planLimits={(company.subscription_plans as any) ? { max_orders: (company.subscription_plans as any).max_orders, max_users: (company.subscription_plans as any).max_users } : undefined}
                              planInfo={(company.subscription_plans as any) ? { name: (company.subscription_plans as any).name, price_monthly: (company.subscription_plans as any).price_monthly } : undefined}
                              latestNote={latestNotes[company.id]}
                              tags={companyTags[company.id] || []}
                            />
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
