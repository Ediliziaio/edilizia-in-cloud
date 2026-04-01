import React, { useState, useMemo, useCallback, useEffect } from "react";
import { navigateToSubdomain, getSubdomainUrl } from "@/utils/subdomainNav";
import { safeRedirect } from "@/utils/safeRedirect";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Building2, Plus, Search, LogIn, ExternalLink, Download, ChevronDown, RefreshCw, AlertCircle, Clock, Users, ArrowUpDown, ArrowUp, ArrowDown, LayoutList, Kanban, Heart, AlertTriangle, CreditCard, UserX, ChevronLeft, ChevronRight, SlidersHorizontal, X } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuCheckboxItem, DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/formatters";
import { useAuth, getCachedTokens } from "@/contexts/AuthContext";
import { queryKeys } from "@/lib/queryKeys";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { format, differenceInDays } from "date-fns";
import { it } from "date-fns/locale";
import { sectorLabels, statusConfig, sectors, calculateHealthScore } from "@/lib/companyUtils";
import type { CompanyStatus } from "@/types/auth";
import type { CompanyOrderStats, CompanyUserCount, CompanyHealthData, CompanyLastAccess } from "@/types/adminRpc";
import { useSuperAdminPermissions } from "@/hooks/useSuperAdminPermissions";
import { useDebounce } from "@/hooks/useDebounce";
import { AccessDenied } from "@/components/admin/AccessDenied";
import { CompanyPipelineView } from "@/components/admin/company/CompanyPipelineView";
import { CompaniesKPIStrip } from "@/components/admin/company/CompaniesKPIStrip";
import { CompanyTagsCell } from "@/components/admin/company/CompanyTagsCell";
import { CompanyQuickActions } from "@/components/admin/company/CompanyQuickActions";
import { CompanyExpandedRow } from "@/components/admin/company/CompanyExpandedRow";
import { BulkActionsBar } from "@/components/admin/company/BulkActionsBar";
import { CompanyFilterPresets, type FilterPreset } from "@/components/admin/company/CompanyFilterPresets";
import { CompanyActiveFilters } from "@/components/admin/company/CompanyActiveFilters";

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
type HealthFilter = "all" | "healthy" | "at_risk" | "critical";
type ColKey = "sector" | "plan" | "mrr" | "users" | "orders" | "lastAccess" | "trial" | "health" | "tags";
type SavedView = { name: string; params: string };

const PAGE_SIZE = 25;
const ALL_COLUMNS: { key: ColKey; label: string }[] = [
  { key: "sector", label: "Settore" },
  { key: "plan", label: "Piano" },
  { key: "mrr", label: "MRR" },
  { key: "users", label: "Utenti" },
  { key: "orders", label: "Ordini" },
  { key: "lastAccess", label: "Ultimo Accesso" },
  { key: "trial", label: "Trial / Scadenza" },
  { key: "health", label: "Health" },
  { key: "tags", label: "Tag" },
];
const DEFAULT_COLS: ColKey[] = ["sector", "plan", "mrr", "users", "orders", "lastAccess", "trial", "health", "tags"];

export default function CompaniesList() {
  const { permissions } = useSuperAdminPermissions();
  const [searchParams, setSearchParams] = useSearchParams();
  const { impersonateCompany, profile, role, company } = useAuth();
  const navigate = useNavigate();

  // URL-derived filter state
  const statusFilter = searchParams.get("status") || "all";
  const sectorFilter = searchParams.get("sector") || "all";
  const planFilter = searchParams.get("plan") || "all";
  const healthFilter = (searchParams.get("health") || "all") as HealthFilter;
  const sortKey = (searchParams.get("sort") || null) as SortKey | null;
  const sortDir = (searchParams.get("dir") || "asc") as SortDir;
  const noPaymentFilter = searchParams.get("noPayment") === "1";
  const viewMode = (searchParams.get("view") || "list") as "list" | "pipeline";

  // Search is local (debounced) then synced to URL
  const [inputSearch, setInputSearch] = useState(() => searchParams.get("q") || "");
  const debouncedSearch = useDebounce(inputSearch, 300);

  // Local UI state
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  // Configurable columns
  const [visibleCols, setVisibleCols] = useState<ColKey[]>(() => {
    try {
      const saved = localStorage.getItem("companies_visible_cols");
      if (saved) return JSON.parse(saved) as ColKey[];
    } catch {}
    return DEFAULT_COLS;
  });
  const toggleCol = useCallback((key: ColKey) => {
    setVisibleCols((prev) => {
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
      localStorage.setItem("companies_visible_cols", JSON.stringify(next));
      return next;
    });
  }, []);
  const col = useCallback((key: ColKey) => visibleCols.includes(key), [visibleCols]);

  // Saved views (localStorage)
  const [savedViews, setSavedViews] = useState<SavedView[]>(() => {
    try { return JSON.parse(localStorage.getItem("companies_saved_views") || "[]"); } catch { return []; }
  });
  const [saveViewName, setSaveViewName] = useState("");
  const [saveViewOpen, setSaveViewOpen] = useState(false);

  const saveCurrentView = useCallback(() => {
    if (!saveViewName.trim()) return;
    const view: SavedView = { name: saveViewName.trim(), params: searchParams.toString() };
    setSavedViews((prev) => {
      const next = [...prev.filter((v) => v.name !== view.name), view];
      localStorage.setItem("companies_saved_views", JSON.stringify(next));
      return next;
    });
    setSaveViewName("");
    setSaveViewOpen(false);
  }, [saveViewName, searchParams]);

  const loadView = useCallback((view: SavedView) => {
    setSearchParams(new URLSearchParams(view.params), { replace: true });
    setInputSearch(new URLSearchParams(view.params).get("q") || "");
    setActivePreset(null);
  }, [setSearchParams]);

  const deleteView = useCallback((name: string) => {
    setSavedViews((prev) => {
      const next = prev.filter((v) => v.name !== name);
      localStorage.setItem("companies_saved_views", JSON.stringify(next));
      return next;
    });
  }, []);

  // Update URL params helper
  const setFilter = useCallback((updates: Record<string, string | null>) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      Object.entries(updates).forEach(([k, v]) => {
        if (!v || v === "all") next.delete(k); else next.set(k, v);
      });
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  // Sync debounced search to URL
  useEffect(() => {
    setFilter({ q: debouncedSearch || null });
  }, [debouncedSearch]); // eslint-disable-line

  const toggleSort = useCallback((key: SortKey) => {
    setFilter(sortKey === key
      ? { dir: sortDir === "asc" ? "desc" : "asc" }
      : { sort: key, dir: "asc" }
    );
  }, [sortKey, sortDir, setFilter]);

  const SortIcon = useMemo(() => {
    const Comp = React.memo(({ col }: { col: SortKey }) => {
      if (sortKey !== col) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-40" />;
      return sortDir === "asc" ? <ArrowUp className="h-3 w-3 ml-1" /> : <ArrowDown className="h-3 w-3 ml-1" />;
    });
    Comp.displayName = "SortIcon";
    return Comp;
  }, [sortKey, sortDir]);

  const SERVER_PAGE_SIZE = 20;

  // Derive server-side sort column and direction
  const serverSortColumn = useMemo((): string => {
    switch (sortKey) {
      case "name": return "name";
      case "sector": return "sector";
      case "status": return "status";
      case "trial": return "trial_ends_at";
      default: return "created_at";
    }
  }, [sortKey]);

  const { data: pagedResult, isLoading, isError, refetch } = useQuery({
    queryKey: [
      ...queryKeys.admin.companiesFull,
      currentPage,
      SERVER_PAGE_SIZE,
      debouncedSearch,
      statusFilter,
      sectorFilter,
      planFilter,
      serverSortColumn,
      sortDir,
      permissions.allowed_company_ids,
    ],
    queryFn: async () => {
      const from = (currentPage - 1) * SERVER_PAGE_SIZE;
      const to = from + SERVER_PAGE_SIZE - 1;

      let query = supabase
        .from("companies")
        .select(
          "id, name, email, status, sector, logo_url, payment_method, trial_ends_at, created_at, stripe_customer_id, subscription_plan_id, subscription_plans:subscription_plan_id(id, name, price_monthly, max_orders, max_users)",
          { count: "exact" }
        )
        .eq("is_platform_admin_company", false);

      // Server-side text search
      if (debouncedSearch) {
        query = query.or(
          `name.ilike.%${debouncedSearch}%,email.ilike.%${debouncedSearch}%`
        );
      }

      // Server-side filters
      if (statusFilter !== "all") query = query.eq("status", statusFilter);
      if (sectorFilter !== "all") query = query.eq("sector", sectorFilter);
      if (planFilter !== "all") query = query.eq("subscription_plan_id", planFilter);

      // Restrict to allowed company IDs for scoped super-admins
      if (permissions.allowed_company_ids?.length) {
        query = query.in("id", permissions.allowed_company_ids);
      }

      // Server-side sort (name, sector, status, trial_ends_at supported; others fall back to created_at)
      const ascending = sortDir === "asc";
      if (sortKey === "trial") {
        // Sort nulls last for trial_ends_at
        query = query.order("trial_ends_at", { ascending, nullsFirst: false });
      } else {
        query = query.order(serverSortColumn, { ascending });
      }

      query = query.range(from, to);

      const { data, error, count } = await query;
      if (error) throw error;
      return { data: data ?? [], totalCount: count ?? 0 };
    },
    staleTime: 5 * 60 * 1000,
    placeholderData: (prev) => prev,
  });

  const allCompanies = pagedResult?.data ?? [];
  const serverTotalCount = pagedResult?.totalCount ?? 0;

  // companies = current page data (allowed_company_ids already applied server-side)
  const companies = allCompanies;

  const { data: orderStats = {} } = useQuery({
    queryKey: queryKeys.admin.companiesOrderStats,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_company_order_stats");
      if (error) throw error;
      const stats: Record<string, { count: number; totalValue: number; lastOrderDate: string | null }> = {};
      ((data || []) as CompanyOrderStats[]).forEach((row) => {
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
    queryKey: queryKeys.admin.companiesUserCounts,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_company_user_counts");
      if (error) throw error;
      const counts: Record<string, number> = {};
      ((data || []) as CompanyUserCount[]).forEach((row) => {
        if (row.company_id) {
          counts[row.company_id] = Number(row.user_count) || 0;
        }
      });
      return counts;
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: healthData = {} } = useQuery({
    queryKey: queryKeys.admin.companiesHealth,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_company_health_data");
      if (error) throw error;
      const map: Record<string, { score: number; health: string; lastOrderDate: string | null; order_count: number; user_count: number; has_customers: boolean; has_staff: boolean }> = {};
      ((data || []) as CompanyHealthData[]).forEach((h) => {
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
    queryKey: queryKeys.admin.companiesLastAccess,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_company_last_access");
      if (error) throw error;
      const map: Record<string, string | null> = {};
      ((data || []) as CompanyLastAccess[]).forEach((row) => {
        map[row.company_id] = row.last_access || null;
      });
      return map;
    },
    staleTime: 5 * 60 * 1000,
  });

  // Company tags
  const { data: companyTags = {} } = useQuery({
    queryKey: queryKeys.admin.companyTags,
    queryFn: async () => {
      const { data, error } = await supabase.from("company_tags").select("id, company_id, tag, color, created_at").order("created_at");
      if (error) throw error;
      const map: Record<string, Array<{ id: string; tag: string; color: string }>> = {};
      (data || []).forEach((row) => {
        if (!map[row.company_id]) map[row.company_id] = [];
        map[row.company_id].push({ id: row.id, tag: row.tag, color: row.color });
      });
      return map;
    },
    staleTime: 2 * 60 * 1000,
  });



  // Latest CRM notes per company
  const { data: latestNotes = {} } = useQuery({
    queryKey: queryKeys.admin.companiesLatestNotes,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_notes")
        .select("company_id, content, created_at, author_id")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      const map: Record<string, { content: string; created_at: string; authorName: string }> = {};
      const authorIds = [...new Set((data || []).map((n: any) => n.author_id))];
      const authorMap: Record<string, string> = {};
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

  // Fetch available subscription plans for the filter dropdown (lightweight, independent of page)
  const { data: uniquePlans = [] } = useQuery({
    queryKey: ["admin-subscription-plans-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscription_plans")
        .select("id, name")
        .eq("is_active", true)
        .order("position", { ascending: true });
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
    staleTime: 10 * 60 * 1000,
  });

  // Lightweight all-companies summary for KPI strip and filter preset counts (only status/trial_ends_at/payment_method)
  const { data: allCompaniesSummary = [] } = useQuery({
    queryKey: ["admin-companies-summary", permissions.allowed_company_ids],
    queryFn: async () => {
      let q = supabase
        .from("companies")
        .select("id, status, trial_ends_at, payment_method, subscription_plan_id, subscription_plans:subscription_plan_id(price_monthly)")
        .eq("is_platform_admin_company", false);
      if (permissions.allowed_company_ids?.length) {
        q = q.in("id", permissions.allowed_company_ids);
      }
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });

  // Reset to page 1 whenever server-side filter/sort params change
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, statusFilter, sectorFilter, planFilter, sortKey, sortDir]);

  // Client-side post-filters applied on the current page only (health and noPayment require cross-query data)
  const filteredCompanies = useMemo(() => {
    if (healthFilter === "all" && !noPaymentFilter) return companies;
    return companies.filter((company) => {
      const matchesHealth = healthFilter === "all" || (healthData[company.id]?.health === healthFilter);
      const matchesNoPayment = !noPaymentFilter ||
        ((company.status === "active" || company.status === "trial") &&
          (!company.payment_method || company.payment_method === "none" || company.payment_method === ""));
      return matchesHealth && matchesNoPayment;
    });
  }, [companies, healthFilter, noPaymentFilter, healthData]);

  // Client-side sort for sort keys that require cross-query data (mrr, orders, users, lastAccess)
  const pagedCompanies = useMemo(() => {
    if (!sortKey || ["name", "sector", "status", "trial"].includes(sortKey)) {
      // Already sorted server-side
      return filteredCompanies;
    }
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filteredCompanies].sort((a, b) => {
      const planA = a.subscription_plans as { id: string; name: string; price_monthly: number } | null;
      const planB = b.subscription_plans as { id: string; name: string; price_monthly: number } | null;
      switch (sortKey) {
        case "plan": return dir * (planA?.name || "").localeCompare(planB?.name || "");
        case "mrr": return dir * ((planA?.price_monthly || 0) - (planB?.price_monthly || 0));
        case "orders": return dir * ((orderStats[a.id]?.count || 0) - (orderStats[b.id]?.count || 0));
        case "users": return dir * ((userCounts[a.id] || 0) - (userCounts[b.id] || 0));
        case "lastAccess": {
          const la = lastAccessData[a.id] ? new Date(lastAccessData[a.id]!).getTime() : 0;
          const lb = lastAccessData[b.id] ? new Date(lastAccessData[b.id]!).getTime() : 0;
          return dir * (la - lb);
        }
        default: return 0;
      }
    });
  }, [filteredCompanies, sortKey, sortDir, orderStats, userCounts, lastAccessData]);

  const totalPages = Math.max(1, Math.ceil(serverTotalCount / SERVER_PAGE_SIZE));

  const hasActiveFilters = inputSearch || statusFilter !== "all" || sectorFilter !== "all" || planFilter !== "all" || healthFilter !== "all" || noPaymentFilter;

  // Smart filter presets — use allCompaniesSummary so counts reflect the full dataset, not just the current page
  const filterPresets: FilterPreset[] = useMemo(() => {
    const trialExpiring = allCompaniesSummary.filter((c) => {
      if (c.status !== "trial" || !c.trial_ends_at) return false;
      const days = differenceInDays(new Date(c.trial_ends_at), new Date());
      return days >= 0 && days <= 7;
    }).length;

    const atRiskCount = Object.values(healthData).filter(
      (h) => h && (h.health === "at_risk" || h.health === "critical")
    ).length;

    const noPayment = allCompaniesSummary.filter((c) =>
      (c.status === "active" || c.status === "trial") &&
      (!c.payment_method || c.payment_method === "none" || c.payment_method === "")
    ).length;

    const inactive = allCompaniesSummary.filter((c) => {
      const la = lastAccessData[c.id];
      if (!la || c.status !== "active") return false;
      return differenceInDays(new Date(), new Date(la)) > 14;
    }).length;

    const applyPreset = (params: Record<string, string>, presetKey: string) => {
      setInputSearch("");
      setSearchParams(new URLSearchParams(params), { replace: true });
      setActivePreset(presetKey);
    };

    return [
      {
        key: "trial_expiring",
        label: "Trial in scadenza",
        icon: Clock,
        description: "Trial che scadono entro 7 giorni",
        color: "amber",
        count: trialExpiring,
        apply: () => applyPreset({ status: "trial", sort: "trial", dir: "asc" }, "trial_expiring"),
      },
      {
        key: "at_risk",
        label: "A rischio",
        icon: AlertTriangle,
        description: "Aziende con health score basso",
        color: "red",
        count: atRiskCount,
        apply: () => applyPreset({ health: "at_risk" }, "at_risk"),
      },
      {
        key: "no_payment",
        label: "Senza pagamento",
        icon: CreditCard,
        description: "Aziende attive/trial senza metodo di pagamento",
        color: "orange",
        count: noPayment,
        apply: () => applyPreset({ noPayment: "1" }, "no_payment"),
      },
      {
        key: "inactive",
        label: "Inattive",
        icon: UserX,
        description: "Aziende attive senza accesso da 14+ giorni",
        color: "gray",
        count: inactive,
        apply: () => applyPreset({ status: "active", sort: "lastAccess", dir: "asc" }, "inactive"),
      },
    ];
  }, [companies, healthData, lastAccessData, setInputSearch, setSearchParams]);

  const clearAllFilters = useCallback(() => {
    setInputSearch("");
    setSearchParams(new URLSearchParams(), { replace: true });
    setActivePreset(null);
  }, [setSearchParams]);

  // Active filter labels
  const statusLabelsMap: Record<string, string> = { trial: "Trial", active: "Attivo", suspended: "Sospeso", expired: "Scaduto" };
  const healthLabelsMap: Record<string, string> = { healthy: "Healthy", at_risk: "A rischio", critical: "Critico" };
  const activeFiltersList = useMemo(() => [
    { key: "search", label: "Cerca", value: inputSearch, onClear: () => setInputSearch("") },
    { key: "status", label: "Stato", value: statusFilter === "all" ? "all" : (statusLabelsMap[statusFilter] || statusFilter), onClear: () => setFilter({ status: null }) },
    { key: "sector", label: "Settore", value: sectorFilter === "all" ? "all" : (sectorLabels[sectorFilter] || sectorFilter), onClear: () => setFilter({ sector: null }) },
    { key: "plan", label: "Piano", value: planFilter === "all" ? "all" : (uniquePlans.find((p) => p.id === planFilter)?.name || planFilter), onClear: () => setFilter({ plan: null }) },
    { key: "health", label: "Health", value: healthFilter === "all" ? "all" : (healthLabelsMap[healthFilter] || healthFilter), onClear: () => setFilter({ health: null }) },
    { key: "noPayment", label: "Senza pagamento", value: noPaymentFilter ? "attivo" : "all", onClear: () => setFilter({ noPayment: null }) },
  ], [inputSearch, statusFilter, sectorFilter, planFilter, healthFilter, noPaymentFilter, uniquePlans, setFilter]);

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
      if (prev.size === pagedCompanies.length) return new Set();
      return new Set(pagedCompanies.map((c) => c.id));
    });
  }, [pagedCompanies]);

  const handleExportCSV = () => {
    const headers = ["Nome", "Email", "Settore", "Piano", "Stato", "Ordini", "Utenti", "MRR", "Stripe Customer ID", "Data Creazione", "Fine Trial"];
    const exportList = selectedIds.size > 0
      ? pagedCompanies.filter((c) => selectedIds.has(c.id))
      : pagedCompanies;
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
    const impToken = await impersonateCompany(companyId, permissions);
    if (impToken) {
      // Use the module-level cached tokens — they are kept up-to-date by
      // onAuthStateChange and never require acquiring the Supabase storage lock.
      const { accessToken, refreshToken } = getCachedTokens();
      if (accessToken && refreshToken) {
        // Build _pr (profile relay): the SA profile/role/company serialised as
        // base64url JSON.  On app.*, AuthContext reads this to pre-populate its
        // sessionStorage profile cache BEFORE setSession() fires SIGNED_IN.
        // This lets the page render instantly instead of waiting for DB queries
        // (which can take 10-15s on a cold Supabase free-tier project).
        //
        // Security: the hash is never sent to any server and is cleared from
        // browser history immediately by window.history.replaceState().
        // The data is limited to non-secret profile fields the user already owns.
        let pr: string | undefined;
        if (profile && role) {
          try {
            const relay = JSON.stringify({ profile, role, company: company ?? null });
            // Convert to base64url (URL-safe, no padding issues in URLSearchParams)
            pr = btoa(relay).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
          } catch {
            // If serialisation fails, proceed without relay (graceful degradation)
          }
        }

        const params = new URLSearchParams({
          _at: accessToken,
          _rt: refreshToken,
          _it: impToken,
          _ic: companyId,
          ...(pr ? { _pr: pr } : {}),
        });
        const url = getSubdomainUrl(`/azienda#${params.toString()}`, "app");
        safeRedirect(url);
        return;
      }
    }
    navigateToSubdomain("/azienda", "app", navigate);
  };

  const queryClient = useQueryClient();
  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from("companies")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.admin.companiesFull }),
  });

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

      {/* KPI Strip — use full summary dataset so metrics reflect all companies, not just the current page */}
      <CompaniesKPIStrip
        companies={allCompaniesSummary.map((c) => ({
          id: c.id,
          status: c.status,
          subscription_plans: c.subscription_plans as { price_monthly: number } | null,
        }))}
        healthData={healthData}
      />

      {/* Bulk Actions Bar */}
      <BulkActionsBar
        selectedIds={selectedIds}
        companies={pagedCompanies}
        onClearSelection={() => setSelectedIds(new Set())}
      />

      {/* Smart Filter Presets */}
      <CompanyFilterPresets
        activePreset={activePreset}
        onClearPreset={clearAllFilters}
        presets={filterPresets}
      />

      {/* Saved Views */}
      {(savedViews.length > 0 || hasActiveFilters) && (
        <div className="flex items-center gap-2 flex-wrap">
          {savedViews.map((view) => (
            <div key={view.name} className="flex items-center gap-0.5">
              <Button variant="outline" size="sm" className="h-7 text-xs rounded-r-none border-r-0" onClick={() => loadView(view)}>
                {view.name}
              </Button>
              <Button variant="outline" size="sm" className="h-7 w-7 px-0 rounded-l-none text-muted-foreground hover:text-destructive" onClick={() => deleteView(view.name)}>
                <X className="h-3 w-3" />
              </Button>
            </div>
          ))}
          {hasActiveFilters && (
            saveViewOpen ? (
              <div className="flex items-center gap-1">
                <Input
                  autoFocus
                  className="h-7 text-xs w-36"
                  placeholder="Nome vista..."
                  value={saveViewName}
                  onChange={(e) => setSaveViewName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") saveCurrentView(); if (e.key === "Escape") setSaveViewOpen(false); }}
                />
                <Button size="sm" className="h-7 text-xs" onClick={saveCurrentView} disabled={!saveViewName.trim()}>Salva</Button>
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setSaveViewOpen(false)}>Annulla</Button>
              </div>
            ) : (
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setSaveViewOpen(true)}>
                + Salva vista
              </Button>
            )
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Cerca per nome o email..."
            value={inputSearch}
            onChange={(e) => { setInputSearch(e.target.value); setActivePreset(null); }}
            className="pl-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => { setFilter({ status: v }); setActivePreset(null); }}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Stato" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti gli stati</SelectItem>
            <SelectItem value="trial">Trial</SelectItem>
            <SelectItem value="active">Attivo</SelectItem>
            <SelectItem value="suspended">Sospeso</SelectItem>
            <SelectItem value="expired">Scaduto</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sectorFilter} onValueChange={(v) => { setFilter({ sector: v }); setActivePreset(null); }}>
          <SelectTrigger className="w-[150px]"><SelectValue placeholder="Settore" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti i settori</SelectItem>
            {sectors.map((s) => (
              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={planFilter} onValueChange={(v) => { setFilter({ plan: v }); setActivePreset(null); }}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Piano" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti i piani</SelectItem>
            {uniquePlans.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={healthFilter} onValueChange={(v) => { setFilter({ health: v }); setActivePreset(null); }}>
          <SelectTrigger className="w-[130px]"><SelectValue placeholder="Health" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti</SelectItem>
            <SelectItem value="healthy">Healthy</SelectItem>
            <SelectItem value="at_risk">A rischio</SelectItem>
            <SelectItem value="critical">Critico</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="icon" onClick={handleExportCSV} title="Esporta CSV">
          <Download className="h-4 w-4" />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" title="Colonne visibili">
              <SlidersHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Colonne visibili</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {ALL_COLUMNS.map(({ key, label }) => (
              <DropdownMenuCheckboxItem
                key={key}
                checked={col(key)}
                onCheckedChange={() => toggleCol(key)}
              >
                {label}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="flex border rounded-md">
          <Button variant={viewMode === "list" ? "secondary" : "ghost"} size="icon" onClick={() => setFilter({ view: null })} title="Vista Lista">
            <LayoutList className="h-4 w-4" />
          </Button>
          <Button variant={viewMode === "pipeline" ? "secondary" : "ghost"} size="icon" onClick={() => setFilter({ view: "pipeline" })} title="Vista Pipeline">
            <Kanban className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Active Filter Chips */}
      {hasActiveFilters && !isLoading && (
        <CompanyActiveFilters
          filters={activeFiltersList}
          totalCount={allCompaniesSummary.length}
          filteredCount={serverTotalCount}
          onClearAll={clearAllFilters}
        />
      )}

      {isLoading ? (
        <Card>
          <CardContent className="p-0">
            <div className="p-4 space-y-3">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-4 w-4" />
                  <Skeleton className="h-8 w-8 rounded-lg shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3 w-28" />
                  </div>
                  <Skeleton className="h-5 w-16 rounded-full" />
                  <Skeleton className="h-5 w-20 rounded-full" />
                  <Skeleton className="h-4 w-14" />
                  <Skeleton className="h-5 w-16 rounded-full" />
                  <Skeleton className="h-4 w-8" />
                  <Skeleton className="h-4 w-8" />
                  <Skeleton className="h-4 w-12" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : serverTotalCount === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">Nessuna azienda trovata</h3>
            <p className="text-muted-foreground text-center mt-2">
              {hasActiveFilters ? "Nessun risultato per i filtri applicati" : "Inizia creando la prima azienda"}
            </p>
            {hasActiveFilters ? (
              <Button variant="outline" className="mt-4" onClick={clearAllFilters}>Rimuovi filtri</Button>
            ) : (
              <Button asChild className="mt-4">
                <Link to="/admin/aziende/nuova"><Plus className="mr-2 h-4 w-4" />Crea Azienda</Link>
              </Button>
            )}
          </CardContent>
        </Card>
      ) : viewMode === "pipeline" ? (
        <CompanyPipelineView
          companies={pagedCompanies.map((c) => ({
            ...c,
            subscription_plans: c.subscription_plans as { name: string; price_monthly: number } | null,
          }))}
          healthScores={healthData}
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-card">
                <TableRow>
                  <TableHead className="w-10 px-2">
                    <Checkbox
                      checked={selectedIds.size === pagedCompanies.length && pagedCompanies.length > 0}
                      onCheckedChange={toggleSelectAll}
                      title={`Seleziona tutte le ${pagedCompanies.length} aziende in questa pagina`}
                    />
                  </TableHead>
                  <TableHead className="w-10" />
                  <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("name")}>
                    <span className="inline-flex items-center">Azienda<SortIcon col="name" /></span>
                  </TableHead>
                  {col("sector") && <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("sector")}><span className="inline-flex items-center">Settore<SortIcon col="sector" /></span></TableHead>}
                  {col("plan") && <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("plan")}><span className="inline-flex items-center">Piano<SortIcon col="plan" /></span></TableHead>}
                  {col("mrr") && <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("mrr")}><span className="inline-flex items-center">MRR<SortIcon col="mrr" /></span></TableHead>}
                  <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("status")}>
                    <span className="inline-flex items-center">Stato<SortIcon col="status" /></span>
                  </TableHead>
                  {col("users") && <TableHead className="text-center cursor-pointer select-none" onClick={() => toggleSort("users")}><span className="inline-flex items-center"><Users className="h-3 w-3 mr-1" />Utenti<SortIcon col="users" /></span></TableHead>}
                  {col("orders") && <TableHead className="text-center cursor-pointer select-none" onClick={() => toggleSort("orders")}><span className="inline-flex items-center">Ordini<SortIcon col="orders" /></span></TableHead>}
                  {col("lastAccess") && <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("lastAccess")}><span className="inline-flex items-center">Ultimo Accesso<SortIcon col="lastAccess" /></span></TableHead>}
                  {col("trial") && <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("trial")}><span className="inline-flex items-center">Trial / Scadenza<SortIcon col="trial" /></span></TableHead>}
                  {col("health") && <TableHead className="text-center"><span className="inline-flex items-center"><Heart className="h-3 w-3 mr-1" />Health</span></TableHead>}
                  {col("tags") && <TableHead>Tag</TableHead>}
                  <TableHead className="text-right">Azioni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagedCompanies.map((company) => {
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
                        {col("sector") && <TableCell><Badge variant="secondary">{sectorLabels[company.sector] || company.sector}</Badge></TableCell>}
                        {col("plan") && <TableCell>{plan ? <Badge variant="outline">{plan.name}</Badge> : <span className="text-sm text-muted-foreground">—</span>}</TableCell>}
                        {col("mrr") && <TableCell>{plan ? <span className="text-sm font-medium">{formatCurrency(plan.price_monthly)}</span> : <span className="text-sm text-muted-foreground">—</span>}</TableCell>}
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Select
                            value={status}
                            onValueChange={(v) => updateStatusMutation.mutate({ id: company.id, status: v })}
                          >
                            <SelectTrigger className="h-7 w-[110px] text-xs border-0 shadow-none px-1">
                              <Badge variant={cfg.variant}>{cfg.label}</Badge>
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="trial">Trial</SelectItem>
                              <SelectItem value="active">Attivo</SelectItem>
                              <SelectItem value="suspended">Sospeso</SelectItem>
                              <SelectItem value="expired">Scaduto</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        {col("users") && <TableCell className="text-center"><span className="text-sm font-medium">{userCounts[company.id] || 0}</span></TableCell>}
                        {col("orders") && <TableCell className="text-center"><span className="text-sm font-medium">{orderStats[company.id]?.count || 0}</span></TableCell>}
                        {col("lastAccess") && <TableCell><LastAccessBadge lastAccess={lastAccessData[company.id] || null} /></TableCell>}
                        {col("trial") && <TableCell><TrialBadge company={company} /></TableCell>}
                        {col("health") && <TableCell className="text-center">
                          {(() => {
                            const hd = healthData[company.id];
                            if (!hd) return <span className="text-xs text-muted-foreground">—</span>;
                            const colors: Record<string, string> = { healthy: "bg-green-500/10 text-green-700 border-green-500/30", at_risk: "bg-amber-500/10 text-amber-700 border-amber-500/30", critical: "bg-red-500/10 text-red-700 border-red-500/30" };
                            const labels: Record<string, string> = { healthy: "Healthy", at_risk: "At Risk", critical: "Critical" };
                            return <Badge variant="outline" className={`text-[10px] ${colors[hd.health]}`}>{labels[hd.health]} {hd.score}</Badge>;
                          })()}
                        </TableCell>}
                        {col("tags") && <TableCell><CompanyTagsCell companyId={company.id} tags={companyTags[company.id] || []} /></TableCell>}
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
                          <TableCell colSpan={5 + visibleCols.length} className="p-4">
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
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t text-sm text-muted-foreground">
                <span>
                  {(currentPage - 1) * SERVER_PAGE_SIZE + 1}–{Math.min(currentPage * SERVER_PAGE_SIZE, serverTotalCount)} di {serverTotalCount} aziende
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="px-2 tabular-nums">{currentPage} / {totalPages}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
