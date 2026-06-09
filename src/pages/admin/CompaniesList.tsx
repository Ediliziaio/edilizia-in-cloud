import React, { useState, useMemo, useCallback, useEffect } from "react";
import { navigateToSubdomain, getSubdomainUrl } from "@/utils/subdomainNav";
import { safeRedirect } from "@/utils/safeRedirect";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Building2, Plus, Search, LogIn, ExternalLink, Download, ChevronDown, RefreshCw, AlertCircle, Clock, Users, ArrowUpDown, ArrowUp, ArrowDown, LayoutList, Kanban, Heart, AlertTriangle, CreditCard, UserX, ChevronLeft, ChevronRight, SlidersHorizontal, X, ChevronRight as ChevronRightIcon, Filter } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetFooter, SheetClose } from "@/components/ui/sheet";
import { escapeCsvCell } from "@/lib/csvExport";
import { useIsMobile } from "@/hooks/use-mobile";
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
import { format, differenceInDays, formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";
import { sectorLabels, statusConfig, sectors, calculateHealthScore } from "@/lib/companyUtils";
import type { CompanyStatus } from "@/types/auth";
import type { CompanyOrderStats, CompanyUserCount, CompanyUserCountV2, CompanyHealthData, CompanyLastAccess } from "@/types/adminRpc";
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
import { CompanySegmentFilters } from "@/components/admin/company/CompanySegmentFilters";
import { EMPTY_FILTERS, applyFiltersToQuery, countActiveFilters } from "@/hooks/superadmin/useCompanyFilters";
import { getCompanyMonthlyRevenue, isRevenueEligibleCompany, getAdminRevenueState, type AdminRevenueState } from "@/lib/adminRevenue";
import { AdminHeroHeader } from "@/components/admin/AdminHeroHeader";
import { toast } from "sonner";

const TrialBadge = React.forwardRef<HTMLDivElement, { company: { status: string; trial_ends_at: string | null; created_at: string } }>(
  ({ company, ...props }, ref) => {
    if (company.status === "free") {
      return (
        <div ref={ref} {...props} className="flex items-center gap-1.5">
          <Badge variant="outline" className="border-teal-500 text-teal-700 bg-teal-50 text-xs">
            Piano Scopri
          </Badge>
        </div>
      );
    }
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

type SortKey = "name" | "sector" | "plan" | "mrr" | "status" | "orders" | "trial" | "users" | "customers" | "lastAccess";
type SortDir = "asc" | "desc";
type HealthFilter = "all" | "healthy" | "at_risk" | "critical";
/**
 * Filtro "Tipo Cliente" — segmenta le aziende per stato di revenue:
 * - all: tutte
 * - paying: pagano davvero (genera MRR)
 * - complimentary: regalate (piano a pagamento ma payment_method=comped)
 * - free_plan: piano gratuito (price_monthly=0)
 * - stripe_issue: payment_method=stripe ma sub non attiva (problema billing)
 * - nopay: complimentary + free_plan (alias retrocompat con vecchio noPayment=1)
 */
type RevenueFilter = "all" | "paying" | "complimentary" | "free_plan" | "stripe_issue" | "nopay";
const REVENUE_LABELS_MAP: Record<RevenueFilter, string> = {
  all: "Tutte",
  paying: "Paganti",
  complimentary: "Regalate",
  free_plan: "Gratuite",
  stripe_issue: "Stripe non attivo",
  nopay: "Non paganti",
};
type ColKey = "sector" | "plan" | "mrr" | "users" | "customers" | "orders" | "lastAccess" | "trial" | "health" | "tags";
type SavedView = { name: string; params: string };
type CompanyHealthMap = Record<string, { score: number; health: string; lastOrderDate: string | null; order_count: number; user_count: number; has_customers: boolean; has_staff: boolean }>;

const ALL_COLUMNS: { key: ColKey; label: string }[] = [
  { key: "sector", label: "Settore" },
  { key: "plan", label: "Piano" },
  { key: "mrr", label: "MRR pagante" },
  { key: "users", label: "Staff" },
  { key: "customers", label: "Clienti" },
  { key: "orders", label: "Ordini" },
  { key: "lastAccess", label: "Ultimo Accesso" },
  { key: "trial", label: "Trial / Scadenza" },
  { key: "health", label: "Health" },
  { key: "tags", label: "Tag" },
];
const DEFAULT_COLS: ColKey[] = ["sector", "plan", "mrr", "users", "orders", "lastAccess", "trial", "health", "tags"];
const VALID_COLS = new Set<ColKey>(ALL_COLUMNS.map((column) => column.key));
// Valori che indicano "azienda attiva/trial SENZA metodo di pagamento reale"
// (segnale di billing da rivedere). NB: i metodi "regalo" (comped + sinonimi
// legacy, vedi GIFTED_EXEMPT_METHODS in src/lib/paymentStatus.ts) NON sono qui:
// sono gratuiti per policy, non un problema di incasso — quindi non vanno segnalati.
const NO_PAYMENT_METHODS = new Set(["", "none", "free", "trial"]);
const STATUS_LABELS_MAP: Record<string, string> = {
  trial: "Trial",
  active: "Attivo",
  suspended: "Sospeso",
  expired: "Scaduto",
};
const HEALTH_LABELS_MAP: Record<string, string> = {
  healthy: "Healthy",
  at_risk: "A rischio",
  critical: "Critico",
};

function isNoPaymentAccessCompany(company: {
  status?: string | null;
  payment_method?: string | null;
  stripe_subscription_status?: string | null;
}) {
  if (company.status !== "active" && company.status !== "trial") return false;
  const method = String(company.payment_method ?? "").trim().toLowerCase();
  const stripeStatus = String(company.stripe_subscription_status ?? "").trim().toLowerCase();
  return NO_PAYMENT_METHODS.has(method) || (method === "stripe" && stripeStatus !== "active");
}

function sanitizeOrSearchTerm(value: string): string {
  return value.trim().replace(/[,%]/g, " ").replace(/\s+/g, " ");
}

function csvCell(value: unknown): string {
  return escapeCsvCell(value as string | number | null | undefined, ",");
}

export default function CompaniesList() {
  const { permissions } = useSuperAdminPermissions();
  const [searchParams, setSearchParams] = useSearchParams();
  const { impersonateCompany, profile, role, company, user } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  // URL-derived filter state
  const statusFilter = searchParams.get("status") || "all";
  const sectorFilter = searchParams.get("sector") || "all";
  const planFilter = searchParams.get("plan") || "all";
  const tipoFilter = searchParams.get("tipo") || "all"; // all | diretta | rivenditore
  const healthFilter = (searchParams.get("health") || "all") as HealthFilter;
  const sortKey = (searchParams.get("sort") || null) as SortKey | null;
  const sortDir = (searchParams.get("dir") || "asc") as SortDir;
  const noPaymentFilter = searchParams.get("noPayment") === "1";
  const revenueFilter = (searchParams.get("revenue") || "all") as RevenueFilter;
  const viewMode = (searchParams.get("view") || "list") as "list" | "pipeline";

  // Search is local (debounced) then synced to URL
  const [inputSearch, setInputSearch] = useState(() => searchParams.get("q") || "");
  const debouncedSearch = useDebounce(inputSearch, 300);

  // Segmentazione avanzata (Feature 6)
  const [segmentFilters, setSegmentFilters] = useState(EMPTY_FILTERS);
  const segmentActiveCount = countActiveFilters(segmentFilters);

  // Local UI state
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  // Configurable columns
  const [visibleCols, setVisibleCols] = useState<ColKey[]>(() => {
    try {
      const saved = localStorage.getItem("companies_visible_cols");
      if (saved) {
        const parsed = JSON.parse(saved) as ColKey[];
        const valid = parsed.filter((key): key is ColKey => VALID_COLS.has(key));
        return valid.length ? valid : DEFAULT_COLS;
      }
    } catch { /* storage non disponibile — silenzioso */ }
    return DEFAULT_COLS;
  });
  const toggleCol = useCallback((key: ColKey) => {
    setVisibleCols((prev) => {
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
      try { localStorage.setItem("companies_visible_cols", JSON.stringify(next)); } catch { /* Safari Private Browsing */ }
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
      try { localStorage.setItem("companies_saved_views", JSON.stringify(next)); } catch { /* Safari Private Browsing */ }
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
      try { localStorage.setItem("companies_saved_views", JSON.stringify(next)); } catch { /* Safari Private Browsing */ }
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

  const SERVER_PAGE_SIZE = 50;

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

  // ⚠️ Lightweight all-companies summary loaded EARLY (used by KPI strip,
  // preset counts e revenue state filter). Spostato sopra alla main query così
  // possiamo precomputare `revenueFilterIds` prima del paged query.
  const { data: allCompaniesSummary = [] } = useQuery({
    queryKey: ["admin-companies-summary", permissions.allowed_company_ids],
    queryFn: async () => {
      let q = supabase
        .from("companies")
        .select("id, status, trial_ends_at, payment_method, stripe_customer_id, stripe_subscription_status, is_platform_admin_company, subscription_plan_id, subscription_plans:subscription_plan_id(price_monthly, price_yearly)")
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

  /**
   * Calcolo degli ID che matchano il filtro revenue corrente, partendo dal
   * summary already-loaded. Restituisce:
   *   - null se filtro=all (skip — evita .in() inutile)
   *   - [] se nessuna company matcha (la query principale ritornerà subito)
   *   - array di id altrimenti
   * Memo: rigirato solo quando cambia revenueFilter o il summary.
   */
  const revenueFilterIds = useMemo<string[] | null>(() => {
    if (revenueFilter === "all") return null;
    return allCompaniesSummary
      .filter((c) => {
        const state: AdminRevenueState = getAdminRevenueState({
          status: c.status,
          payment_method: c.payment_method,
          stripe_customer_id: c.stripe_customer_id,
          stripe_subscription_status: c.stripe_subscription_status,
          is_platform_admin_company: c.is_platform_admin_company,
          subscription_plans: c.subscription_plans as { price_monthly: number | null; price_yearly?: number | null } | null,
        });
        switch (revenueFilter) {
          case "paying":
            return state === "paying";
          case "complimentary":
            return state === "complimentary";
          case "free_plan":
            return state === "free_plan";
          case "stripe_issue":
            // payment_method=stripe ma stripe_subscription_status non attivo
            return (
              String(c.payment_method ?? "").toLowerCase() === "stripe" &&
              String(c.stripe_subscription_status ?? "").toLowerCase() !== "active"
            );
          case "nopay":
            return state === "complimentary" || state === "free_plan";
          default:
            return true;
        }
      })
      .map((c) => c.id);
  }, [revenueFilter, allCompaniesSummary]);

  const { data: rawHealthRows = [], isLoading: isHealthRowsLoading, isError: isHealthRowsError } = useQuery({
    queryKey: queryKeys.admin.companiesHealth,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_company_health_data");
      if (error) throw error;
      return (data ?? []) as CompanyHealthData[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const healthData: CompanyHealthMap = useMemo(() => {
    const map: CompanyHealthMap = {};
    rawHealthRows.forEach((h) => {
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
  }, [rawHealthRows]);

  const healthFilterIds = useMemo<string[] | null>(() => {
    if (healthFilter === "all") return null;
    return Object.entries(healthData)
      .filter(([, health]) => health.health === healthFilter)
      .map(([companyId]) => companyId);
  }, [healthFilter, healthData]);
  const healthFilterIdsKey = healthFilterIds?.join(",") ?? "all";

  // Info rivenditori (parent_company_id non è nei tipi generati → client non tipizzato):
  // ID dei rivenditori + nome del produttore padre, per il badge e il filtro "Tipo".
  const { data: resellerInfo } = useQuery({
    queryKey: ["admin-companies-reseller-info"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any;
      const { data: kids } = await sb.from("companies").select("id, parent_company_id").not("parent_company_id", "is", null);
      const kidsArr = (kids ?? []) as { id: string; parent_company_id: string }[];
      const parentIds = [...new Set(kidsArr.map((r) => r.parent_company_id))];
      const { data: parents } = parentIds.length
        ? await sb.from("companies").select("id, name").in("id", parentIds)
        : { data: [] };
      const nameById = new Map<string, string>(((parents ?? []) as { id: string; name: string }[]).map((p) => [p.id, p.name]));
      const parentNameByChild: Record<string, string> = {};
      kidsArr.forEach((r) => { parentNameByChild[r.id] = nameById.get(r.parent_company_id) ?? ""; });
      return { ids: kidsArr.map((r) => r.id), parentNameByChild };
    },
  });
  const resellerIds = useMemo(() => resellerInfo?.ids ?? [], [resellerInfo]);
  const resellerIdSet = useMemo(() => new Set(resellerIds), [resellerIds]);
  const parentNameByChild = resellerInfo?.parentNameByChild ?? {};
  const resellerIdsKey = resellerIds.join(",");

  // Info commercialisti: aziende gestite in delega attiva da uno studio (per il badge "Studio").
  const { data: accountantInfo } = useQuery({
    queryKey: ["admin-companies-accountant-info"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any;
      const { data } = await sb
        .from("accountant_company_access")
        .select("company_id, accountant_firms!inner(name)")
        .eq("status", "active");
      const firmByCompany: Record<string, string> = {};
      ((data ?? []) as { company_id: string; accountant_firms?: { name?: string } }[]).forEach((r) => {
        if (r.company_id && !firmByCompany[r.company_id]) firmByCompany[r.company_id] = r.accountant_firms?.name ?? "";
      });
      return { firmByCompany };
    },
  });
  const accountantFirmByCompany = useMemo(() => accountantInfo?.firmByCompany ?? {}, [accountantInfo]);
  const accountantIdSet = useMemo(() => new Set(Object.keys(accountantFirmByCompany)), [accountantFirmByCompany]);

  const { data: pagedResult, isLoading, isError, refetch } = useQuery({
    queryKey: [
      ...queryKeys.admin.companiesFull,
      currentPage,
      SERVER_PAGE_SIZE,
      debouncedSearch,
      statusFilter,
      sectorFilter,
      planFilter,
      tipoFilter,
      tipoFilter !== "all" ? resellerIdsKey : "",
      healthFilter,
      healthFilterIdsKey,
      noPaymentFilter,
      revenueFilter,
      revenueFilterIds?.length ?? -1,
      serverSortColumn,
      sortDir,
      permissions.allowed_company_ids,
      segmentFilters,
    ],
    queryFn: async () => {
      const from = (currentPage - 1) * SERVER_PAGE_SIZE;
      const to = from + SERVER_PAGE_SIZE - 1;

      let query = supabase
        .from("companies")
        .select(
          "id, name, email, status, sector, logo_url, payment_method, trial_ends_at, created_at, stripe_customer_id, stripe_subscription_status, is_platform_admin_company, subscription_plan_id, subscription_plans:subscription_plan_id(id, name, price_monthly, price_yearly, max_orders, max_users)",
          { count: "exact" }
        )
        .eq("is_platform_admin_company", false);

      // Server-side text search. `.or()` is comma-separated in PostgREST:
      // sanitize pasted commas/percent signs so search cannot break the filter.
      const searchTerm = sanitizeOrSearchTerm(debouncedSearch);
      if (searchTerm) {
        query = query.or(
          `name.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%`
        );
      }

      // Server-side filters
      if (statusFilter !== "all") query = query.eq("status", statusFilter);
      if (sectorFilter !== "all") query = query.eq("sector", sectorFilter);
      if (planFilter !== "all") query = query.eq("subscription_plan_id", planFilter);
      // Filtro Tipo: "rivenditore" (ha un produttore padre) | "diretta" (nessun padre).
      // Usa gli ID rivenditori precalcolati (parent_company_id non è nei tipi generati).
      if (tipoFilter === "rivenditore") {
        if (resellerIds.length === 0) return { data: [], totalCount: 0 };
        query = query.in("id", resellerIds);
      } else if (tipoFilter === "diretta" && resellerIds.length > 0) {
        query = query.not("id", "in", `(${resellerIds.join(",")})`);
      }
      if (noPaymentFilter) {
        query = query
          .in("status", ["active", "trial"])
          .or("payment_method.is.null,payment_method.eq.,payment_method.eq.none,payment_method.eq.free,payment_method.eq.trial,payment_method.eq.gift,payment_method.eq.gifted,payment_method.eq.gratis,payment_method.eq.omaggio,payment_method.eq.manual_free,payment_method.eq.complimentary,payment_method.eq.comp,and(payment_method.eq.stripe,stripe_subscription_status.is.null),and(payment_method.eq.stripe,stripe_subscription_status.neq.active)");
      }

      // Revenue-state filter: precomputiamo gli ID dal summary già in cache
      // (allCompaniesSummary) classificandoli con la fonte di verità
      // `getAdminRevenueState`. Il filtro lavora server-side via .in("id", …).
      if (revenueFilter !== "all" && revenueFilterIds !== null) {
        if (revenueFilterIds.length === 0) return { data: [], totalCount: 0 };
        query = query.in("id", revenueFilterIds);
      }

      if (healthFilter !== "all") {
        if (isHealthRowsError) throw new Error("Impossibile calcolare la salute delle aziende.");
        if (healthFilterIds === null || healthFilterIds.length === 0) return { data: [], totalCount: 0 };
        query = query.in("id", healthFilterIds);
      }

      // Segment filters (Feature 6)
      query = applyFiltersToQuery(query, segmentFilters);

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
    enabled: healthFilter === "all" || !isHealthRowsLoading,
  });

  const allCompanies = pagedResult?.data ?? [];
  const serverTotalCount = pagedResult?.totalCount ?? 0;

  // companies = current page data (allowed_company_ids already applied server-side)
  const companies = allCompanies;
  const pageCompanyIds = useMemo(() => companies.map((c) => c.id), [companies]);
  const pageCompanyIdsKey = pageCompanyIds.join(",");

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

  const { data: userCountsData = { staff: {}, customers: {}, total: {} } } = useQuery({
    queryKey: queryKeys.admin.companiesUserCounts,
    queryFn: async () => {
      // Prima tentiamo v2 (separa staff vs clienti). Se la migration v2 non è
      // ancora applicata, fallback a v1 che ritorna solo total (lasciando staff
      // e customers a 0). Backward compat zero-risk.
      const v2 = await supabase.rpc("get_company_user_counts_v2");
      if (!v2.error && Array.isArray(v2.data)) {
        const staff: Record<string, number> = {};
        const customers: Record<string, number> = {};
        const total: Record<string, number> = {};
        ((v2.data || []) as CompanyUserCountV2[]).forEach((row) => {
          if (row.company_id) {
            staff[row.company_id] = Number(row.staff_count) || 0;
            customers[row.company_id] = Number(row.customer_count) || 0;
            total[row.company_id] = Number(row.total_count) || 0;
          }
        });
        return { staff, customers, total };
      }
      // Fallback v1 (DB pre-migration)
      const v1 = await supabase.rpc("get_company_user_counts");
      if (v1.error) throw v1.error;
      const total: Record<string, number> = {};
      ((v1.data || []) as CompanyUserCount[]).forEach((row) => {
        if (row.company_id) {
          total[row.company_id] = Number(row.user_count) || 0;
        }
      });
      return { staff: {}, customers: {}, total };
    },
    staleTime: 5 * 60 * 1000,
  });
  // Alias per backward compat con codice esistente (export CSV, sort).
  // userCounts mappa company_id → conteggio STAFF (la metrica più rilevante
  // per l'admin: numero utenti attivi che usano la piattaforma).
  // Defensive: se cache stale residua ha shape vecchia (Record<string, number>
  // invece di { staff, customers, total }), .staff è undefined → fallback a {}.
  const userCounts = (userCountsData && typeof userCountsData === "object" && "staff" in userCountsData)
    ? userCountsData.staff
    : {};
  const customerCounts = (userCountsData && typeof userCountsData === "object" && "customers" in userCountsData)
    ? userCountsData.customers
    : {};

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
    queryKey: [...queryKeys.admin.companyTags, pageCompanyIdsKey],
    queryFn: async () => {
      if (pageCompanyIds.length === 0) return {};
      const { data, error } = await supabase
        .from("company_tags")
        .select("id, company_id, tag, color, created_at")
        .in("company_id", pageCompanyIds)
        .order("created_at");
      if (error) throw error;
      const map: Record<string, Array<{ id: string; tag: string; color: string }>> = {};
      (data || []).forEach((row) => {
        if (!map[row.company_id]) map[row.company_id] = [];
        map[row.company_id].push({ id: row.id, tag: row.tag, color: row.color });
      });
      return map;
    },
    enabled: pageCompanyIds.length > 0,
    staleTime: 2 * 60 * 1000,
  });



  // Latest CRM notes per company
  const { data: latestNotes = {} } = useQuery({
    queryKey: [...queryKeys.admin.companiesLatestNotes, pageCompanyIdsKey],
    queryFn: async () => {
      if (pageCompanyIds.length === 0) return {};
      const { data, error } = await supabase
        .from("company_notes")
        .select("company_id, content, created_at, author_id")
        .in("company_id", pageCompanyIds)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      // Shape delle righe letto dalla select() qui sopra — manteniamo
      // i tipi locali per evitare `any` sui callback e perché non vogliamo
      // trascinarci in giro tutto il tipo generato della tabella.
      interface CompanyNoteRow {
        company_id: string;
        content: string;
        created_at: string;
        author_id: string;
      }
      interface AuthorRow {
        id: string;
        first_name: string | null;
        last_name: string | null;
      }
      const rows = (data ?? []) as CompanyNoteRow[];
      const map: Record<string, { content: string; created_at: string; authorName: string }> = {};
      const authorIds = [...new Set(rows.map((n) => n.author_id))];
      const authorMap: Record<string, string> = {};
      if (authorIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, first_name, last_name")
          .in("id", authorIds);
        ((profiles ?? []) as AuthorRow[]).forEach((p) => {
          authorMap[p.id] = `${p.first_name || ""} ${p.last_name || ""}`.trim() || "Admin";
        });
      }
      rows.forEach((n) => {
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
    enabled: pageCompanyIds.length > 0,
    staleTime: 2 * 60 * 1000,
  });

  // Fetch available subscription plans for the filter dropdown (lightweight, independent of page)
  const { data: uniquePlans = [] } = useQuery({
    queryKey: ["admin-subscription-plans-list"],
    queryFn: async () => {
      // Solo piani globali nel filtro (no piani ad hoc dei produttori). produttore_id non nei tipi → cast.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("subscription_plans")
        .select("id, name")
        .eq("is_active", true)
        .is("produttore_id", null)
        .order("position", { ascending: true });
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
    staleTime: 10 * 60 * 1000,
  });

  // Reset to page 1 whenever server-side filter/sort params change
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, statusFilter, sectorFilter, planFilter, tipoFilter, healthFilter, noPaymentFilter, revenueFilter, sortKey, sortDir, segmentFilters]);

  // Health/no-payment filters are pushed into the server query so pagination
  // and counts stay coherent across the whole dataset.
  const filteredCompanies = useMemo(() => {
    return companies;
  }, [companies]);

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
        case "mrr":
          return dir * (
            (isRevenueEligibleCompany(a) ? getCompanyMonthlyRevenue(a) : 0) -
            (isRevenueEligibleCompany(b) ? getCompanyMonthlyRevenue(b) : 0)
          );
        case "orders": return dir * ((orderStats[a.id]?.count || 0) - (orderStats[b.id]?.count || 0));
        case "users": return dir * ((userCounts[a.id] || 0) - (userCounts[b.id] || 0));
        case "customers": return dir * ((customerCounts[a.id] || 0) - (customerCounts[b.id] || 0));
        case "lastAccess": {
          const la = lastAccessData[a.id] ? new Date(lastAccessData[a.id]!).getTime() : 0;
          const lb = lastAccessData[b.id] ? new Date(lastAccessData[b.id]!).getTime() : 0;
          return dir * (la - lb);
        }
        default: return 0;
      }
    });
  }, [filteredCompanies, sortKey, sortDir, orderStats, userCounts, customerCounts, lastAccessData]);

  const totalPages = Math.max(1, Math.ceil(serverTotalCount / SERVER_PAGE_SIZE));

  const hasActiveFilters = inputSearch || statusFilter !== "all" || sectorFilter !== "all" || planFilter !== "all" || tipoFilter !== "all" || healthFilter !== "all" || noPaymentFilter || revenueFilter !== "all" || segmentActiveCount > 0;

  useEffect(() => {
    setSelectedIds(new Set());
  }, [currentPage, debouncedSearch, statusFilter, sectorFilter, planFilter, tipoFilter, healthFilter, noPaymentFilter, revenueFilter, sortKey, sortDir, segmentFilters]);

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

    const noPayment = allCompaniesSummary.filter(isNoPaymentAccessCompany).length;

    // Aziende con Stripe configurato ma sub non attiva — segnale di billing failure
    // (canceled / past_due / unpaid / null su payment_method=stripe).
    const stripeIssue = allCompaniesSummary.filter((c) => {
      const method = String(c.payment_method ?? "").toLowerCase();
      const stripe = String(c.stripe_subscription_status ?? "").toLowerCase();
      return method === "stripe" && stripe !== "active";
    }).length;

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
        key: "stripe_issue",
        label: "Stripe non attivo",
        icon: AlertCircle,
        description: "Aziende con Stripe configurato ma sub non attiva (canceled / past_due / unpaid)",
        color: "red",
        count: stripeIssue,
        apply: () => applyPreset({ revenue: "stripe_issue" }, "stripe_issue"),
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
  }, [allCompaniesSummary, healthData, lastAccessData, setInputSearch, setSearchParams]);

  const priorityPresets = useMemo(
    () => filterPresets.filter((preset) => ["at_risk", "no_payment", "stripe_issue", "inactive"].includes(preset.key)),
    [filterPresets]
  );

  const clearAllFilters = useCallback(() => {
    setInputSearch("");
    setSearchParams(new URLSearchParams(), { replace: true });
    setSegmentFilters(EMPTY_FILTERS);
    setActivePreset(null);
  }, [setSearchParams]);

  const activeFiltersList = useMemo(() => [
    { key: "search", label: "Cerca", value: inputSearch, onClear: () => setInputSearch("") },
    { key: "status", label: "Stato", value: statusFilter === "all" ? "all" : (STATUS_LABELS_MAP[statusFilter] || statusFilter), onClear: () => setFilter({ status: null }) },
    { key: "sector", label: "Settore", value: sectorFilter === "all" ? "all" : (sectorLabels[sectorFilter] || sectorFilter), onClear: () => setFilter({ sector: null }) },
    { key: "plan", label: "Piano", value: planFilter === "all" ? "all" : (uniquePlans.find((p) => p.id === planFilter)?.name || planFilter), onClear: () => setFilter({ plan: null }) },
    { key: "tipo", label: "Tipo", value: tipoFilter === "all" ? "all" : (tipoFilter === "rivenditore" ? "Rivenditori" : "Dirette"), onClear: () => setFilter({ tipo: null }) },
    { key: "health", label: "Health", value: healthFilter === "all" ? "all" : (HEALTH_LABELS_MAP[healthFilter] || healthFilter), onClear: () => setFilter({ health: null }) },
    { key: "noPayment", label: "Senza pagamento", value: noPaymentFilter ? "attivo" : "all", onClear: () => setFilter({ noPayment: null }) },
    { key: "revenue", label: "Tipo cliente", value: revenueFilter === "all" ? "all" : REVENUE_LABELS_MAP[revenueFilter], onClear: () => setFilter({ revenue: null }) },
    { key: "segments", label: "Segmenti", value: segmentActiveCount > 0 ? `${segmentActiveCount} attivi` : "all", onClear: () => setSegmentFilters(EMPTY_FILTERS) },
  ], [inputSearch, statusFilter, sectorFilter, planFilter, tipoFilter, healthFilter, noPaymentFilter, revenueFilter, uniquePlans, setFilter, segmentActiveCount]);

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
      const pageIds = pagedCompanies.map((c) => c.id);
      const allPageSelected = pageIds.length > 0 && pageIds.every((id) => prev.has(id));
      const next = new Set(prev);
      if (allPageSelected) pageIds.forEach((id) => next.delete(id));
      else pageIds.forEach((id) => next.add(id));
      return next;
    });
  }, [pagedCompanies]);

  const handleExportCSV = () => {
    if (!permissions.data_export) {
      toast.error("Permesso negato", {
        description: "Non puoi esportare dati aziende.",
      });
      return;
    }
    const headers = ["Nome", "Email", "Settore", "Piano", "Stato", "Ordini", "Staff", "Clienti", "MRR", "Stripe Customer ID", "Data Creazione", "Fine Trial"];
    const exportList = selectedIds.size > 0
      ? pagedCompanies.filter((c) => selectedIds.has(c.id))
      : pagedCompanies;
    const rows = exportList.map((c) => {
      const plan = c.subscription_plans as { id: string; name: string; price_monthly: number } | null;
      return [
        csvCell(c.name),
        csvCell(c.email),
        csvCell(sectorLabels[c.sector] || c.sector),
        csvCell(plan?.name || "—"),
        csvCell(c.status),
        csvCell(orderStats[c.id]?.count || 0),
        csvCell(userCounts[c.id] || 0),
        csvCell(customerCounts[c.id] || 0),
        csvCell(plan?.price_monthly || 0),
        csvCell(c.stripe_customer_id || ""),
        csvCell(format(new Date(c.created_at), "dd/MM/yyyy")),
        csvCell(c.trial_ends_at ? format(new Date(c.trial_ends_at), "dd/MM/yyyy") : ""),
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

  const handleImpersonate = async (e: React.MouseEvent, companyId: string, companyName = "questa azienda") => {
    e.stopPropagation();
    if (!permissions.impersonation) {
      toast.error("Permesso negato", {
        description: "Non puoi impersonare aziende.",
      });
      return;
    }
    if (permissions.allowed_company_ids?.length && !permissions.allowed_company_ids.includes(companyId)) {
      toast.error("Permesso negato", {
        description: "Questa azienda non rientra nel tuo perimetro amministrativo.",
      });
      return;
    }
    const confirmed = window.confirm(`Stai per accedere come ${companyName}. Continua solo se devi fare assistenza o verifica operativa.`);
    if (!confirmed) return;
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
      if (!permissions.bulk_actions) {
        throw new Error("Permesso negato: non puoi modificare lo stato aziende");
      }
      if (permissions.allowed_company_ids?.length && !permissions.allowed_company_ids.includes(id)) {
        throw new Error("Permesso negato: azienda non autorizzata");
      }
      const { error } = await supabase
        .from("companies")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
      if (user?.id) {
        await supabase.from("admin_audit_log").insert({
          user_id: user.id,
          action: "company_status_change",
          target_type: "company",
          target_id: id,
          details: { new_status: status, source: "admin_companies_list" },
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.companiesFull });
      queryClient.invalidateQueries({ queryKey: ["admin-companies-summary"] });
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.revenueIntelligence() });
      toast.success("Stato azienda aggiornato");
    },
    onError: (error) => {
      toast.error(error.message || "Impossibile aggiornare lo stato azienda");
    },
  });

  if (!permissions.can_manage_companies) return <AccessDenied />;

  if (isError) {
    return (
      <div className="space-y-4 md:space-y-6">
        <div>
          <h1 className="text-xl font-bold md:text-2xl">Aziende</h1>
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
    <div className="space-y-4 md:space-y-6">
      {/* ─── Hero header in stile Commesse (icona arancio + actions a destra) ─ */}
      <AdminHeroHeader
        icon={Building2}
        title="Aziende"
        subtitle="Lista clienti piattaforma · health score, billing, lifecycle e accesso quick login."
        inlineBadge={
          <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700">
            {allCompaniesSummary.length} aziende
          </Badge>
        }
        actions={
          <Button asChild className="gap-2 bg-orange-500 hover:bg-orange-600 text-white">
            <Link to="/admin/aziende/nuova">
              <Plus className="h-4 w-4" />
              Nuova Azienda
            </Link>
          </Button>
        }
      />

      {/* KPI Strip — full dataset, click-to-filter */}
      <CompaniesKPIStrip
        companies={allCompaniesSummary.map((c) => ({
          id: c.id,
          status: c.status,
          payment_method: c.payment_method,
          stripe_customer_id: c.stripe_customer_id,
          stripe_subscription_status: c.stripe_subscription_status,
          is_platform_admin_company: c.is_platform_admin_company,
          subscription_plans: c.subscription_plans as { price_monthly: number } | null,
        }))}
        healthData={healthData}
        activeKpi={
          revenueFilter === "paying" ? "paying"
          : revenueFilter === "complimentary" ? "excluded"
          : healthFilter === "at_risk" || healthFilter === "critical" ? "atRisk"
          : statusFilter === "active" && revenueFilter === "all" && healthFilter === "all" ? "active"
          : null
        }
        onKpiClick={(kpi) => {
          setActivePreset(null);
          if (kpi === "active") {
            // Toggle: se già attivo, rimuovi
            const isAlready = statusFilter === "active" && revenueFilter === "all" && healthFilter === "all";
            setFilter({
              status: isAlready ? null : "active",
              revenue: null,
              health: null,
              noPayment: null,
            });
          } else if (kpi === "paying") {
            const isAlready = revenueFilter === "paying";
            setFilter({ revenue: isAlready ? null : "paying", noPayment: null, health: null });
          } else if (kpi === "excluded") {
            const isAlready = revenueFilter === "complimentary";
            setFilter({ revenue: isAlready ? null : "complimentary", noPayment: null, health: null });
          } else if (kpi === "atRisk") {
            const isAlready = healthFilter === "at_risk";
            setFilter({ health: isAlready ? null : "at_risk", revenue: null, noPayment: null });
          }
        }}
      />

      <Card className="border-primary/15 bg-gradient-to-r from-primary/5 via-background to-orange-50/60">
        <CardContent className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="border-primary/25 bg-background text-primary">
                Centro operativo
              </Badge>
              <span className="text-xs text-muted-foreground">
                {allCompaniesSummary.length} aziende monitorate
              </span>
            </div>
            <h2 className="mt-2 text-base font-semibold">Priorità da controllare ora</h2>
            <p className="text-sm text-muted-foreground">
              Apri subito i segmenti più delicati: billing, rischio utilizzo e aziende ferme.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:min-w-[520px]">
            {priorityPresets.map((preset) => {
              const Icon = preset.icon;
              return (
                <Button
                  key={preset.key}
                  variant={activePreset === preset.key ? "default" : "outline"}
                  className="h-auto justify-start gap-2 px-3 py-2 text-left"
                  onClick={preset.apply}
                  disabled={preset.count === 0}
                  title={preset.description}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-semibold">{preset.label}</span>
                    <span className="block text-xs opacity-75">{preset.count} aziende</span>
                  </span>
                </Button>
              );
            })}
          </div>
        </CardContent>
      </Card>

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

      {/* Toolbar filtri:
          - MOBILE (< sm): Search full-width + Bottone "Filtri" (Sheet) + ViewToggle
          - DESKTOP (sm+): tutti i filtri inline come prima
          activeFilterCount usato per badge sul bottone "Filtri" mobile. */}
      {(() => {
        const activeFilterCount =
          (statusFilter !== "all" ? 1 : 0) +
          (sectorFilter !== "all" ? 1 : 0) +
          (planFilter !== "all" ? 1 : 0) +
          (healthFilter !== "all" ? 1 : 0) +
          (revenueFilter !== "all" ? 1 : 0) +
          segmentActiveCount;

        // I 5 Select renderizzati identici sia in toolbar desktop che dentro lo Sheet mobile.
        const filterSelects = (
          <>
            <Select value={statusFilter} onValueChange={(v) => { setFilter({ status: v }); setActivePreset(null); }}>
              <SelectTrigger className="w-full sm:w-[140px]"><SelectValue placeholder="Stato" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti gli stati</SelectItem>
                <SelectItem value="trial">Trial</SelectItem>
                <SelectItem value="active">Attivo</SelectItem>
                <SelectItem value="suspended">Sospeso</SelectItem>
                <SelectItem value="expired">Scaduto</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sectorFilter} onValueChange={(v) => { setFilter({ sector: v }); setActivePreset(null); }}>
              <SelectTrigger className="w-full sm:w-[150px]"><SelectValue placeholder="Settore" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti i settori</SelectItem>
                {sectors.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={planFilter} onValueChange={(v) => { setFilter({ plan: v }); setActivePreset(null); }}>
              <SelectTrigger className="w-full sm:w-[140px]"><SelectValue placeholder="Piano" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti i piani</SelectItem>
                {uniquePlans.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={tipoFilter} onValueChange={(v) => { setFilter({ tipo: v }); setActivePreset(null); }}>
              <SelectTrigger className="w-full sm:w-[150px]"><SelectValue placeholder="Tipo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutte le aziende</SelectItem>
                <SelectItem value="diretta">Solo dirette</SelectItem>
                <SelectItem value="rivenditore">Solo rivenditori</SelectItem>
              </SelectContent>
            </Select>
            <Select value={healthFilter} onValueChange={(v) => { setFilter({ health: v }); setActivePreset(null); }}>
              <SelectTrigger className="w-full sm:w-[130px]"><SelectValue placeholder="Health" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti</SelectItem>
                <SelectItem value="healthy">Healthy</SelectItem>
                <SelectItem value="at_risk">A rischio</SelectItem>
                <SelectItem value="critical">Critico</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={revenueFilter}
              onValueChange={(v) => {
                setFilter({ revenue: v === "all" ? null : v, noPayment: null });
                setActivePreset(null);
              }}
            >
              <SelectTrigger className="w-full sm:w-[160px]" title="Filtra per tipo di rapporto economico"><SelectValue placeholder="Tipo cliente" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti i tipi</SelectItem>
                <SelectItem value="paying">💰 Paganti</SelectItem>
                <SelectItem value="complimentary">🎁 Regalate</SelectItem>
                <SelectItem value="free_plan">🆓 Piano gratuito</SelectItem>
                <SelectItem value="nopay">⚪ Non paganti (tutti)</SelectItem>
                <SelectItem value="stripe_issue">⚠️ Stripe non attivo</SelectItem>
              </SelectContent>
            </Select>
            <CompanySegmentFilters
              filters={segmentFilters}
              onFiltersChange={(f) => { setSegmentFilters(f); setCurrentPage(1); }}
              activeCount={segmentActiveCount}
            />
          </>
        );

        const exportBtn = (
          <Button variant="outline" className="gap-2 w-full sm:w-auto" onClick={handleExportCSV} title="Esporta CSV">
            <Download className="h-4 w-4" />
            <span>
              {selectedIds.size > 0 ? `Esporta ${selectedIds.size}` : "Esporta pagina"}
            </span>
          </Button>
        );

        const columnsBtn = (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="w-full sm:w-auto sm:size-default gap-2" title="Colonne visibili">
                <SlidersHorizontal className="h-4 w-4" />
                <span className="sm:hidden">Colonne visibili</span>
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
        );

        const viewToggle = (
          <div className="flex border rounded-md shrink-0">
            <Button variant={viewMode === "list" ? "secondary" : "ghost"} size="icon" onClick={() => setFilter({ view: null })} title="Vista Lista">
              <LayoutList className="h-4 w-4" />
            </Button>
            <Button variant={viewMode === "pipeline" ? "secondary" : "ghost"} size="icon" onClick={() => setFilter({ view: "pipeline" })} title="Vista Pipeline">
              <Kanban className="h-4 w-4" />
            </Button>
          </div>
        );

        return (
          <>
            {/* Search bar — sempre visibile in cima */}
            <div className="flex gap-2">
              <div className="relative flex-1 min-w-0">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Cerca per nome o email..."
                  value={inputSearch}
                  onChange={(e) => { setInputSearch(e.target.value); setActivePreset(null); }}
                  className="pl-10"
                />
              </div>

              {/* MOBILE: bottone "Filtri" che apre Sheet, sostituisce gli 8 Select inline */}
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="outline" className="sm:hidden gap-1 shrink-0" title="Filtri">
                    <Filter className="h-4 w-4" />
                    Filtri
                    {activeFilterCount > 0 && (
                      <Badge className="ml-0.5 h-5 min-w-[20px] px-1.5 text-[10px]" variant="default">
                        {activeFilterCount}
                      </Badge>
                    )}
                  </Button>
                </SheetTrigger>
                <SheetContent side="bottom" className="h-[85vh] flex flex-col">
                  <SheetHeader>
                    <SheetTitle>Filtri aziende</SheetTitle>
                  </SheetHeader>
                  <div className="flex-1 overflow-y-auto py-4 space-y-3">
                    {filterSelects}
                  </div>
                  <SheetFooter className="flex-row gap-2">
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => {
                        clearAllFilters();
                      }}
                    >
                      Reset filtri
                    </Button>
                    <SheetClose asChild>
                      <Button className="flex-1">Applica</Button>
                    </SheetClose>
                  </SheetFooter>
                </SheetContent>
              </Sheet>

              {viewToggle}
            </div>

            {/* DESKTOP: tutti i filtri inline come prima */}
            <div className="hidden sm:flex sm:flex-wrap sm:gap-3">
              {filterSelects}
              {exportBtn}
              {columnsBtn}
            </div>

            {/* MOBILE: Export + Columns sotto la search (in 2 colonne) */}
            <div className="grid grid-cols-2 gap-2 sm:hidden">
              {exportBtn}
              {columnsBtn}
            </div>
          </>
        );
      })()}

      <div className="flex flex-col gap-2 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <span>
          {isLoading
            ? "Caricamento aziende..."
            : `Mostro ${Math.min((currentPage - 1) * SERVER_PAGE_SIZE + 1, serverTotalCount)}-${Math.min(currentPage * SERVER_PAGE_SIZE, serverTotalCount)} di ${serverTotalCount} aziende`}
        </span>
        {selectedIds.size > 0 && (
          <Badge variant="secondary" className="w-fit">
            {selectedIds.size} selezionate nella pagina
          </Badge>
        )}
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
      ) : isMobile ? (
        /* ─── Mobile Card View ─── */
        <div className="space-y-2">
          {pagedCompanies.map((company) => {
            const status = (company.status || "trial") as CompanyStatus;
            const cfg = statusConfig[status] || statusConfig.trial;
            const plan = company.subscription_plans as { id: string; name: string; price_monthly: number } | null;
            const countsAsRevenue = isRevenueEligibleCompany(company);
            const monthlyRevenue = getCompanyMonthlyRevenue(company);
            const hd = healthData[company.id];
            return (
              <Card
                key={company.id}
                className="active:scale-[0.99] transition-transform cursor-pointer"
                onClick={() => navigate(`/admin/aziende/${company.id}`)}
              >
                <CardContent className="p-3">
                  <div className="flex items-start gap-3">
                    {company.logo_url ? (
                      <img width={40} height={40} loading="lazy" src={company.logo_url} alt={company.name} className="h-10 w-10 rounded-xl object-cover shrink-0" />
                    ) : (
                      <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                        <Building2 className="h-5 w-5 text-primary" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-semibold text-sm truncate">{company.name}</p>
                        <ChevronRightIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{company.email}</p>
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <Badge variant={cfg.variant} className="text-[10px] px-1.5 py-0">{cfg.label}</Badge>
                        {resellerIdSet.has(company.id) && <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-violet-300 bg-violet-50 text-violet-700">Rivenditore{parentNameByChild[company.id] ? ` · ${parentNameByChild[company.id]}` : ""}</Badge>}
                        {accountantIdSet.has(company.id) && <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-teal-300 bg-teal-50 text-teal-700">Studio{accountantFirmByCompany[company.id] ? ` · ${accountantFirmByCompany[company.id]}` : ""}</Badge>}
                        {plan && <Badge variant="outline" className="text-[10px] px-1.5 py-0">{plan.name}</Badge>}
                        {plan && (
                          <span className={`text-xs font-semibold ${countsAsRevenue ? "text-emerald-600" : "text-muted-foreground"}`}>
                            {countsAsRevenue ? `${formatCurrency(monthlyRevenue)}/m` : "MRR escluso"}
                          </span>
                        )}
                        {hd && (
                          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${
                            hd.health === "healthy" ? "border-green-500/30 text-green-700 bg-green-50" :
                            hd.health === "at_risk" ? "border-amber-500/30 text-amber-700 bg-amber-50" :
                            "border-red-500/30 text-red-700 bg-red-50"
                          }`}>
                            {hd.score}
                          </Badge>
                        )}
                      </div>
                      {/* Ultimo accesso — info chiave per "ferme da X giorni" check rapido */}
                      {company.last_login_at && (
                        <p className="text-[10px] text-muted-foreground mt-1.5">
                          Ultimo accesso {formatDistanceToNow(new Date(company.last_login_at), { locale: it, addSuffix: true })}
                        </p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-2 py-3 text-sm text-muted-foreground">
              <span className="text-xs">
                {(currentPage - 1) * SERVER_PAGE_SIZE + 1}–{Math.min(currentPage * SERVER_PAGE_SIZE, serverTotalCount)} di {serverTotalCount}
              </span>
              <div className="flex items-center gap-1">
                {/* Touch target ≥ 44×44 per Apple HIG / Material guidelines */}
                <Button variant="outline" size="icon" className="h-11 w-11" onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1} aria-label="Pagina precedente">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="px-3 tabular-nums text-sm font-medium">{currentPage}/{totalPages}</span>
                <Button variant="outline" size="icon" className="h-11 w-11" onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} aria-label="Pagina successiva">
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* MOBILE VIEW (<md): card list — la tabella a 13 colonne è impraticabile
              su mobile anche con scroll orizzontale. Mostriamo le info essenziali
              in card cliccabili + checkbox + kebab azioni. */}
          <div className="md:hidden space-y-2">
            {pagedCompanies.map((company) => {
              const status = (company.status || "trial") as CompanyStatus;
              const cfg = statusConfig[status] || statusConfig.trial;
              const plan = company.subscription_plans as { id: string; name: string; price_monthly: number; price_yearly?: number | null } | null;
              const monthlyRevenue = getCompanyMonthlyRevenue(company);
              const countsAsRevenue = isRevenueEligibleCompany(company);
              const isSelected = selectedIds.has(company.id);
              return (
                <Card
                  key={company.id}
                  className={`cursor-pointer active:scale-[0.99] transition-transform ${isSelected ? "border-primary/50 bg-primary/5" : ""}`}
                  onClick={() => navigate(`/admin/aziende/${company.id}`)}
                >
                  <CardContent className="p-3 space-y-2">
                    <div className="flex items-start gap-3">
                      <div onClick={(e) => e.stopPropagation()} className="pt-1">
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleSelect(company.id)}
                          aria-label={`Seleziona ${company.name}`}
                        />
                      </div>
                      {company.logo_url ? (
                        <img width={40} height={40} loading="lazy" src={company.logo_url} alt={company.name} className="h-10 w-10 rounded-lg object-cover shrink-0" />
                      ) : (
                        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                          <Building2 className="h-5 w-5 text-primary" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className="font-medium truncate">{company.name}</p>
                          {resellerIdSet.has(company.id) && <Badge variant="outline" className="h-4 shrink-0 px-1 text-[10px] border-violet-300 bg-violet-50 text-violet-700" title={`Rivenditore di ${parentNameByChild[company.id] || "—"}`}>Riv.</Badge>}
                          {accountantIdSet.has(company.id) && <Badge variant="outline" className="h-4 shrink-0 px-1 text-[10px] border-teal-300 bg-teal-50 text-teal-700" title={`Studio: ${accountantFirmByCompany[company.id] || "—"}`}>Studio</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">{company.email}</p>
                      </div>
                      <div onClick={(e) => e.stopPropagation()}>
                        <Select
                          value={status}
                          disabled={updateStatusMutation.isPending || !permissions.bulk_actions}
                          onValueChange={(v) => updateStatusMutation.mutate({ id: company.id, status: v })}
                        >
                          <SelectTrigger className="h-7 w-auto text-xs border-0 shadow-none px-1.5">
                            <Badge variant={cfg.variant} className="text-[10px]">{cfg.label}</Badge>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="trial">Trial</SelectItem>
                            <SelectItem value="active">Attivo</SelectItem>
                            <SelectItem value="suspended">Sospeso</SelectItem>
                            <SelectItem value="expired">Scaduto</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="flex items-center flex-wrap gap-x-3 gap-y-1 text-xs pl-12">
                      {plan && (
                        <span className="inline-flex items-center gap-1">
                          <Badge variant="outline" className="text-[10px]">{plan.name}</Badge>
                          {countsAsRevenue && (
                            <span className="font-medium tabular-nums">{formatCurrency(monthlyRevenue)}/m</span>
                          )}
                        </span>
                      )}
                      {(userCounts[company.id] ?? 0) > 0 && (
                        <span className="text-muted-foreground inline-flex items-center gap-0.5">
                          <Users className="h-3 w-3" /> {userCounts[company.id]}
                        </span>
                      )}
                      {(orderStats[company.id]?.count ?? 0) > 0 && (
                        <span className="text-muted-foreground tabular-nums">
                          {orderStats[company.id]?.count} ordini
                        </span>
                      )}
                      {lastAccessData[company.id] && <LastAccessBadge lastAccess={lastAccessData[company.id] || null} />}
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-1 border-t" onClick={(e) => e.stopPropagation()}>
                      <CompanyQuickActions company={company} permissions={permissions} />
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => navigate(`/admin/aziende/${company.id}`)}>
                          <ExternalLink className="h-3.5 w-3.5 mr-1" />
                          <span className="text-xs">Apri</span>
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 px-2"
                          onClick={(e) => handleImpersonate(e, company.id, company.name)}
                          disabled={!permissions.impersonation}
                        >
                          <LogIn className="h-3.5 w-3.5 mr-1" />
                          <span className="text-xs">Accedi</span>
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-2 py-2 text-xs text-muted-foreground">
                <span className="tabular-nums">
                  {(currentPage - 1) * SERVER_PAGE_SIZE + 1}–{Math.min(currentPage * SERVER_PAGE_SIZE, serverTotalCount)} / {serverTotalCount}
                </span>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="px-1 tabular-nums">{currentPage}/{totalPages}</span>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* DESKTOP VIEW (>=md): tabella completa con scroll orizzontale */}
          <Card className="hidden md:block">
          <CardContent className="p-0 overflow-x-auto">
            <Table className="min-w-[900px]">
              <TableHeader className="sticky top-0 z-10 bg-card">
                <TableRow>
                  <TableHead className="w-10 px-2">
                    <Checkbox
                      checked={pagedCompanies.length > 0 && pagedCompanies.every((c) => selectedIds.has(c.id))}
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
                  {col("mrr") && <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("mrr")}><span className="inline-flex items-center">MRR pagante<SortIcon col="mrr" /></span></TableHead>}
                  <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("status")}>
                    <span className="inline-flex items-center">Stato<SortIcon col="status" /></span>
                  </TableHead>
                  {col("users") && <TableHead className="text-center cursor-pointer select-none" onClick={() => toggleSort("users")} title="Utenti staff dell'azienda (admin, dipendenti, operai, venditori, subappaltatori)"><span className="inline-flex items-center"><Users className="h-3 w-3 mr-1" />Staff<SortIcon col="users" /></span></TableHead>}
                  {col("customers") && <TableHead className="text-center cursor-pointer select-none" onClick={() => toggleSort("customers")} title="Clienti finali registrati nel portale dell'azienda"><span className="inline-flex items-center"><Users className="h-3 w-3 mr-1" />Clienti<SortIcon col="customers" /></span></TableHead>}
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
                  const plan = company.subscription_plans as { id: string; name: string; price_monthly: number; price_yearly?: number | null } | null;
                  const monthlyRevenue = getCompanyMonthlyRevenue(company);
                  const countsAsRevenue = isRevenueEligibleCompany(company);
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
                              <img width={32} height={32} loading="lazy" src={company.logo_url} alt={company.name} className="h-8 w-8 rounded-lg object-cover" />
                            ) : (
                              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                                <Building2 className="h-4 w-4 text-primary" />
                              </div>
                            )}
                            <div>
                              <div className="flex items-center gap-1.5">
                                <p className="font-medium">{company.name}</p>
                                {resellerIdSet.has(company.id) && <Badge variant="outline" className="h-4 shrink-0 px-1 text-[10px] border-violet-300 bg-violet-50 text-violet-700" title={`Rivenditore di ${parentNameByChild[company.id] || "—"}`}>Riv.</Badge>}
                                {accountantIdSet.has(company.id) && <Badge variant="outline" className="h-4 shrink-0 px-1 text-[10px] border-teal-300 bg-teal-50 text-teal-700" title={`Studio: ${accountantFirmByCompany[company.id] || "—"}`}>Studio</Badge>}
                              </div>
                              <p className="text-xs text-muted-foreground">{company.email}</p>
                            </div>
                          </div>
                        </TableCell>
                        {col("sector") && <TableCell><Badge variant="secondary">{sectorLabels[company.sector] || company.sector}</Badge></TableCell>}
                        {col("plan") && <TableCell>{plan ? <Badge variant="outline">{plan.name}</Badge> : <span className="text-sm text-muted-foreground">—</span>}</TableCell>}
                        {col("mrr") && (
                          <TableCell>
                            {plan ? (
                              <div className="flex flex-col gap-1">
                                <span className={`text-sm font-medium ${countsAsRevenue ? "" : "text-muted-foreground"}`}>
                                  {countsAsRevenue ? formatCurrency(monthlyRevenue) : "Escluso"}
                                </span>
                                {!countsAsRevenue && monthlyRevenue > 0 && (
                                  <span className="text-[10px] text-muted-foreground">
                                    Piano {formatCurrency(monthlyRevenue)}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-sm text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        )}
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Select
                            value={status}
                            disabled={updateStatusMutation.isPending || !permissions.bulk_actions}
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
                        {col("customers") && <TableCell className="text-center"><span className="text-sm font-medium">{customerCounts[company.id] || 0}</span></TableCell>}
                        {col("orders") && <TableCell className="text-center"><span className="text-sm font-medium">{orderStats[company.id]?.count || 0}</span></TableCell>}
                        {col("lastAccess") && <TableCell><LastAccessBadge lastAccess={lastAccessData[company.id] || null} /></TableCell>}
                        {col("trial") && <TableCell><TrialBadge company={company} /></TableCell>}
                        {col("health") && <TableCell className="text-center">
                          {(() => {
                            const hd = healthData[company.id];
                            if (!hd) return <span className="text-xs text-muted-foreground">—</span>;
                            const colors: Record<string, string> = { healthy: "bg-green-500/10 text-green-700 border-green-500/30", at_risk: "bg-amber-500/10 text-amber-700 border-amber-500/30", critical: "bg-red-500/10 text-red-700 border-red-500/30" };
                            const labels: Record<string, string> = { healthy: "Healthy", at_risk: "At Risk", critical: "Critical" };
                            return <Badge variant="outline" className={`text-xs ${colors[hd.health]}`}>{labels[hd.health]} {hd.score}</Badge>;
                          })()}
                        </TableCell>}
                        {col("tags") && <TableCell><CompanyTagsCell companyId={company.id} tags={companyTags[company.id] || []} /></TableCell>}
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <CompanyQuickActions company={company} permissions={permissions} />
                            <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); navigate(`/admin/aziende/${company.id}`); }}>
                              <ExternalLink className="h-4 w-4 mr-1" />Apri
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={(e) => handleImpersonate(e, company.id, company.name)}
                              disabled={!permissions.impersonation}
                              title="Accedi come azienda con conferma di sicurezza"
                            >
                              <LogIn className="h-4 w-4 mr-1" />Accedi
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                      {isExpanded && (() => {
                        const expandedPlan = company.subscription_plans as {
                          name: string;
                          price_monthly: number;
                          max_orders: number;
                          max_users: number;
                        } | null;
                        return (
                          <TableRow className="bg-muted/30 hover:bg-muted/30">
                            <TableCell colSpan={5 + visibleCols.length} className="p-4">
                              <CompanyExpandedRow
                                company={company}
                                orderStats={orderStats[company.id]}
                                healthData={healthData[company.id]}
                                planLimits={expandedPlan ? { max_orders: expandedPlan.max_orders, max_users: expandedPlan.max_users } : undefined}
                                planInfo={expandedPlan ? {
                                  name: expandedPlan.name,
                                  price_monthly: expandedPlan.price_monthly,
                                  monthly_revenue: monthlyRevenue,
                                  counts_as_revenue: countsAsRevenue,
                                } : undefined}
                                latestNote={latestNotes[company.id]}
                                tags={companyTags[company.id] || []}
                              />
                            </TableCell>
                          </TableRow>
                        );
                      })()}
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
        </>
      )}
    </div>
  );
}
